import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TAB_CONSENT_INPUT, createTabConsentHandler } from '../lib/open-tab-consent.mjs';
import { registerOpenTool } from '../lib/open-tool-auth.mjs';
import { installOpenToolContracts, applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import { callOpenX402IntentApi, buildOpenX402IntentRequest } from '../lib/open-x402-intent-api.mjs';

const intentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = 'authenticated-connection-session';
const args = { intentId, maxAmountAtomic: '25', expiresAtUnix: 1_900_003_600 };
const secret = 'tab-preparation-test-secret-at-least-32-bytes';

function preparedData(terms = args) {
  const publicAddress = '11111111111111111111111111111111';
  return { ok: true, intentId, status: 'pending_consent', paymentDispatched: false,
    preparation: { caseId: intentId, sessionId: intentId, gatewayIntentId: intentId,
      ownerReviewUrl: `https://dexter.cash/mandate?case=${intentId}&review=1`,
      sessionPublicKey: publicAddress, sessionPublicKeyHex: '00'.repeat(32),
      vaultPda: publicAddress, seller: publicAddress,
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      proposedTerms: { maxAmountAtomic: terms.maxAmountAtomic, maxRevolvingCapacityAtomic: terms.maxRevolvingCapacityAtomic ?? terms.maxAmountAtomic, expiresAtUnix: terms.expiresAtUnix },
      proposedTermsDigest: 'a'.repeat(64), consentRequestId: intentId, consentRequestDigest: 'b'.repeat(64),
      consentUrl: 'https://dexter.cash/tabs/new?req=e30', agentId: intentId, grantId: intentId, grantRevision: 1, grantRevisionDigest: 'c'.repeat(64) } };
}

test('native MCP call binds current connection metadata to exact preparation HMAC without executing fetch', async () => {
  const calls = [];
  const callApi = (action, input) => callOpenX402IntentApi(action, input, {
    now: () => 1_900_000_000_000, serviceSecret: secret,
    fetchImpl: async (path, request) => {
      calls.push({ path, request });
      return new Response(JSON.stringify({ ok: false, error: 'approval_required', intentId,
        paymentDispatched: false, approval: { namespace: 'dexter-gateway-owner-consent-link/v1',
          consentUrl: `https://dexter.cash/wallet/approvals/x402/${intentId}` } }), { status: 402 });
    },
  });
  const server = new McpServer({ name: 'tab-test', version: '1.0.0' });
  installOpenToolContracts(server);
  registerOpenTool(server, 'x402_prepare_tab', { inputSchema: TAB_CONSENT_INPUT },
    createTabConsentHandler({ resolveSession: async () => ({ sessionId: session, authenticated: true }), callApi }));
  const client = new Client({ name: 'tab-client', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const listed = (await client.listTools()).tools[0];
    assert.equal(listed.name, 'x402_prepare_tab');
    assert.equal(listed.inputSchema.additionalProperties, false);
    assert.equal(listed.annotations.destructiveHint, false);
    assert.deepEqual(listed._meta.securitySchemes, [{ type: 'oauth2', scopes: ['vault'] }]);
    const response = await client.callTool({ name: 'x402_prepare_tab', arguments: args });
    assert.equal(response.structuredContent.error, 'approval_required');
    assert.equal(response.structuredContent.consentUrl, `https://dexter.cash/wallet/approvals/x402/${intentId}`);
    assert.equal(calls.length, 1);
    const { path, request } = calls[0];
    assert.equal(path, '/v2/pay/anon/x402/tab/prepare');
    assert.deepEqual(JSON.parse(request.body), { mcp_session_id: session, ...args });
    const message = ['dexter.native-exact.mcp-service.v1', '1900000000000', 'POST', path,
      createHash('sha256').update(request.body).digest('hex')].join('\n');
    assert.equal(request.headers['x-internal-signature'], createHmac('sha256', secret).update(message).digest('hex'));
    const spoofed = await client.callTool({ name: 'x402_prepare_tab', arguments: { ...args, sessionId: 'another-session' } });
    assert.equal(spoofed.isError, true); assert.equal(calls.length, 1);
  } finally { await client.close(); await server.close(); }
});

test('missing connection and malformed input stop before API access', async () => {
  let calls = 0;
  const handler = createTabConsentHandler({ resolveSession: async () => ({ authenticated: false }),
    callApi: async () => { calls++; throw new Error('must not call'); } });
  assert.equal((await handler(args)).structuredContent.error, 'authentication_required');
  assert.equal((await handler({ ...args, wallet: 'caller-selected' })).structuredContent.error, 'invalid_tab_preparation_terms');
  assert.equal(calls, 0);
  assert.throws(() => buildOpenX402IntentRequest('tabPrepare', { ...args, sessionId: session, expiresAtUnix: Infinity }), /invalid_tab_expiry/);
  for (const capacity of ['0', '-1', '1.5', 1500000]) {
    assert.equal((await handler({ ...args, maxRevolvingCapacityAtomic: capacity })).structuredContent.error, 'invalid_tab_preparation_terms');
    assert.throws(() => buildOpenX402IntentRequest('tabPrepare', { ...args, sessionId: session,
      maxRevolvingCapacityAtomic: capacity }), /invalid_tab_revolving_capacity/);
  }
  assert.equal(calls, 0);
});

test('native MCP prepares a five dollar cap and separate purchase capacity without changing approved terms', async () => {
  const standing = { ...args, maxAmountAtomic: '5000000', maxRevolvingCapacityAtomic: '1500000' };
  const data = preparedData(standing), calls = [];
  const callApi = (action, input) => callOpenX402IntentApi(action, input, {
    now: () => 1_900_000_000_000, serviceSecret: secret,
    fetchImpl: async (path, request) => {
      calls.push({ path, request });
      return new Response(JSON.stringify(data), { status: 200 });
    },
  });
  const server = new McpServer({ name: 'standing-tab-test', version: '1.0.0' });
  installOpenToolContracts(server);
  registerOpenTool(server, 'x402_prepare_tab', { inputSchema: TAB_CONSENT_INPUT },
    createTabConsentHandler({ resolveSession: async () => ({ sessionId: session, authenticated: true }), callApi }));
  const client = new Client({ name: 'standing-tab-client', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: 'x402_prepare_tab', arguments: standing });
    assert.equal(response.isError, false);
    assert.equal(response.structuredContent.paymentDispatched, false);
    assert.deepEqual(response.structuredContent.preparation.proposedTerms, {
      maxAmountAtomic: '5000000', maxRevolvingCapacityAtomic: '1500000', expiresAtUnix: standing.expiresAtUnix,
    });
    assert.match(response.content[0].text, /Proposed Tab limit: 5 USDC/);
    assert.match(response.content[0].text, /Maximum outstanding Tab amount: 1.5 USDC/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/v2/pay/anon/x402/tab/prepare');
    assert.deepEqual(JSON.parse(calls[0].request.body), { mcp_session_id: session,
      intentId, maxAmountAtomic: '5000000', expiresAtUnix: standing.expiresAtUnix, maxRevolvingCapacityAtomic: '1500000' });
    const message = ['dexter.native-exact.mcp-service.v1', '1900000000000', 'POST', calls[0].path,
      createHash('sha256').update(calls[0].request.body).digest('hex')].join('\n');
    assert.equal(calls[0].request.headers['x-internal-signature'], createHmac('sha256', secret).update(message).digest('hex'));
    data.preparation.proposedTerms.maxRevolvingCapacityAtomic = '5000000';
    const changed = await client.callTool({ name: 'x402_prepare_tab', arguments: standing });
    assert.equal(changed.isError, true);
    assert.equal(changed.structuredContent.error, 'tab_preparation_unavailable');
  } finally { await client.close(); await server.close(); }
});

test('an execution response or mismatched terms cannot masquerade as prepared authority', async () => {
  for (const response of [{ ok: true, status: 'confirmed', paymentDispatched: true },
    { ok: true, intentId, status: 'pending_consent', paymentDispatched: false }]) {
    const handler = createTabConsentHandler({ resolveSession: async () => ({ sessionId: session, authenticated: true }),
      callApi: async () => ({ data: response }) });
    assert.equal((await handler(args)).structuredContent.error, 'tab_preparation_unavailable');
  }
});

test('successful preparation preserves its public session and case through the common result policy', async () => {
  const data = preparedData();
  const handler = createTabConsentHandler({ resolveSession: async () => ({ sessionId: session, authenticated: true }),
    callApi: async () => ({ data }) });
  const output = applyOpenToolResultPolicy('x402_prepare_tab', await handler(args));
  assert.equal(output.isError, false);
  assert.equal(output.structuredContent.preparation.providerSessionId, intentId);
  assert.equal(output.structuredContent.preparation.caseId, intentId);
  assert.equal(output.structuredContent.preparation.ownerReviewUrl, data.preparation.ownerReviewUrl);
  assert.doesNotMatch(JSON.stringify(output), /authenticated-connection-session/);
  assert.match(output.content[0].text, /mandate\?case=/);
  data.preparation.ownerReviewUrl = `https://attacker.example/mandate?case=${intentId}&review=1`;
  assert.equal((await handler(args)).structuredContent.error, 'tab_preparation_unavailable');
});
