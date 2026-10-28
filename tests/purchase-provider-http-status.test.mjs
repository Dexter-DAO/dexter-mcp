import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// The optional root runs this same regression against the prior sealed release.
const sourceRoot = process.env.DEXTER_MCP_PRESENTATION_TEST_SOURCE
  ? pathToFileURL(`${process.env.DEXTER_MCP_PRESENTATION_TEST_SOURCE}/`)
  : new URL('../', import.meta.url);
const moduleAt = path => import(new URL(path, sourceRoot));
const { callOpenX402IntentApi, sanitizeOpenX402IntentResult,
  isOpenX402AuthorityRequired, projectOpenX402AuthorizationRequired,
  OPEN_X402_INTENT_ID_RE } = await moduleAt('lib/open-x402-intent-api.mjs');
const { purchaseResultText } = await moduleAt('lib/customer-result-presentation.mjs');
const { OPEN_TOOL_CONTRACTS, installOpenToolContracts, applyOpenToolResultPolicy } = await moduleAt('lib/open-tool-contracts.mjs');
const { registerOpenTool } = await moduleAt('lib/open-tool-auth.mjs');
const { buildHostedCheckStatusModelResult } = await moduleAt('lib/open-check-result.mjs');
const { normalizeIntentLifecycle } = await moduleAt('apps-sdk/ui/src/components/x402/fetch-result-model.ts');
const source = await readFile(new URL('open-mcp-server.mjs', sourceRoot), 'utf8');
const functions = source.slice(source.indexOf('async function x402IntentFetch('), source.indexOf('async function x402Fetch('));
const registrations = ['x402_fetch', 'x402_status'].map(name => {
  const start = source.indexOf(`  registerOpenTool(server, '${name}'`);
  const end = source.indexOf('\n  registerOpenTool(', start + 1);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}).join('\n');
const fixture = JSON.parse(await readFile(new URL('./fixtures/birdeye-ar-provider-402.json', import.meta.url), 'utf8'));
const evidence = [];
const clone = value => JSON.parse(JSON.stringify(value));

async function invoke(tool, response) {
  const requests = [];
  const server = new McpServer({ name: 'saved-provider-response', version: '1.0.0' });
  const client = new Client({ name: 'saved-response-reader', version: '1.0.0' });
  installOpenToolContracts(server);
  runInNewContext(`${functions}\n${registrations}`, {
    server, z, registerOpenTool, FETCH_META: {}, STATUS_META: {},
    OPEN_X402_INTENT_ID_RE, MAX_AMOUNT_ATOMIC_RE: /^[1-9]\d{0,19}$/,
    purchaseResultText, sanitizeOpenX402IntentResult, buildHostedCheckStatusModelResult,
    isOpenX402AuthorityRequired, projectOpenX402AuthorizationRequired,
    isVaultAuthenticationRequired: () => false,
    resolveIntentSession: async () => ({ sessionId: 'offline-saved-response-session', authenticated: true }),
    callOpenX402IntentApi: (kind, args) => callOpenX402IntentApi(kind, args, {
      serviceSecret: 'offline-provider-response-test-secret-at-least-32-bytes',
      fetchImpl: async (path, init) => {
        requests.push({ kind, path, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'content-type': 'application/json' } });
      },
    }),
    console: { warn() {} }, safeErrorLabel: () => 'offline-fixture', logRef: value => value,
  }, { timeout: 1000 });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const args = { intentId: response.body.intentId,
      ...(tool === 'x402_fetch' ? { maxAmountAtomic: '3000' } : {}) };
    const result = await client.callTool({ name: tool, arguments: args });
    assert.equal(requests.length, 1, 'Exactly one simulated API request; no added retry');
    assert.equal(requests[0].kind, tool === 'x402_fetch' ? 'fetch' : 'status');
    assert.equal(requests[0].body.intentId, args.intentId);
    assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result.structuredContent).success, true);
    const expected = sanitizeOpenX402IntentResult(response.body, {
      intentId: args.intentId, httpStatus: response.status, includeData: tool === 'x402_fetch',
    });
    const policyExpected = applyOpenToolResultPolicy(tool, { structuredContent: expected,
      content: [{ type: 'text', text: purchaseResultText(expected) }] }).structuredContent;
    assert.deepEqual(result.structuredContent, clone(policyExpected), 'Presentation preserves the complete structured receipt and provider trust policy');
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
    const summary = JSON.parse(purchaseResultText(expected));
    evidence.push({ tool, requests, apiStatus: response.status, result, summary });
    return { result, data: result.structuredContent, text, summary };
  } finally {
    await client.close();
    await server.close();
  }
}

test('retained ar output records the original misleading lifecycle and API status', () => {
  assert.match(fixture.renderedFetch, /^status: resolved\n/);
  assert.match(fixture.renderedFetch, /^http status: 200$/m);
  assert.doesNotMatch(fixture.renderedFetch, /http status: 402/);
  assert.equal(fixture.fetchResponse.body.delivery.httpStatus, 402);
});

for (const tool of ['x402_fetch', 'x402_status']) {
  test(`${tool}: saved Birdeye 402 stays failed delivery with unknown payment through the registered handler`, async () => {
    const response = fixture[tool === 'x402_fetch' ? 'fetchResponse' : 'statusResponse'];
    const { result, data, text, summary } = await invoke(tool, response);
    assert.equal(result.isError, false, 'Keep existing API transport semantics');
    assert.equal(data.status, 'resolved', 'Keep the durable lifecycle evidence');
    assert.equal(data.httpStatus, 200);
    assert.equal(data.delivery.httpStatus, 402);
    assert.equal(data.outcome.delivery, 'failed');
    assert.equal(data.outcome.payment, 'unknown');
    assert.equal(data.outcome.resultAvailable, false);
    assert.equal(data.payment.confirmed, false);
    assert.equal(Object.hasOwn(data.payment, 'fundsMoved'), false);
    assert.equal(data.reservationState, 'reserved');
    assert.equal(data.retryable, false);
    assert.equal(data.replacementAllowed, false);
    assert.equal(data.retryWithSameIntentOnly, true);
    assert.equal(data.continuation.action, 'inspect_same_intent');
    assert.equal(data.continuation.tool, 'x402_status');
    assert.deepEqual(data.continuation.arguments, { intentId: data.intentId });
    assert.match(text, /^delivery status: failed\nprovider http status: 402\npayment status: unknown\napi http status: 200/m);
    assert.doesNotMatch(text, /^status: resolved$|^http status: 200$|Paid:|deliver_result|No transfer occurred/m);
    assert.match(text, /Payment is required to access this resource/);
    assert.equal(summary.deliveryStatus, 'failed');
    assert.equal(summary.providerHttpStatus, 402);
    assert.equal(summary.paymentStatus, 'unknown');
    assert.equal(summary.apiHttpStatus, 200);
    assert.equal(Object.hasOwn(summary, 'status'), false);
    assert.equal(Object.hasOwn(summary, 'httpStatus'), false);
    assert.doesNotMatch(summary.providerData, /Use as task output/);
    const widget = normalizeIntentLifecycle(data);
    assert.equal(widget.outcome, 'ambiguous');
    assert.equal(widget.rows.find(row => row.label === 'Delivery').value, 'Response received, HTTP 402');
  });
}

for (const state of ['pending', 'unknown', 'confirmed']) {
  test(`successful HTTP delivery remains usable with ${state} payment`, async () => {
    const response = clone(fixture.statusResponse);
    response.body.delivery = { state: 'response_received', httpStatus: 200, result: { data: { prices: [1, 2] }, success: true } };
    response.body.payment.state = state;
    response.body.payment.confirmed = state === 'confirmed';
    const { data, text, summary } = await invoke('x402_status', response);
    assert.equal(data.outcome.delivery, 'received');
    assert.equal(data.outcome.payment, state);
    assert.equal(data.outcome.resultAvailable, true);
    assert.equal(data.continuation.action, state === 'confirmed' ? 'deliver_result' : 'deliver_result_and_observe');
    assert.match(text, /delivery status: received\nprovider http status: 200/);
    assert.match(text, new RegExp(`payment status: ${state}`));
    assert.doesNotMatch(text, /delivery status: failed|^status: resolved$/m);
    assert.equal(summary.providerHttpStatus, 200);
    assert.deepEqual(summary.providerResult, response.body.delivery.result);
    if (state !== 'confirmed') assert.doesNotMatch(text, /Paid:/);
  });
}

test('a confirmed charge does not convert a merchant error into delivered content', async () => {
  const response = clone(fixture.statusResponse);
  response.body.payment = { ...response.body.payment, state: 'confirmed', confirmed: true };
  const { data, text } = await invoke('x402_status', response);
  assert.equal(data.outcome.delivery, 'failed');
  assert.equal(data.outcome.payment, 'confirmed');
  assert.equal(data.outcome.resultAvailable, false);
  assert.equal(data.continuation.action, 'report_provider_error');
  assert.match(text, /delivery status: failed\nprovider http status: 402\npayment status: confirmed/);
});

test('native MCP success has no invented provider HTTP status', async () => {
  const response = clone(fixture.statusResponse);
  response.body.delivery = { transport: 'mcp', state: 'response_received', toolError: false,
    result: { content: [{ type: 'text', text: 'Saved provider report' }] } };
  response.body.payment = { ...response.body.payment, state: 'confirmed', confirmed: true };
  const { data, text, summary } = await invoke('x402_status', response);
  assert.equal(data.outcome.resultAvailable, true);
  assert.equal(data.continuation.action, 'deliver_result');
  assert.equal(Object.hasOwn(summary, 'providerHttpStatus'), false);
  assert.doesNotMatch(text, /provider http status:/);
  assert.match(text, /Saved provider report/);
});

test('pre-dispatch API refusal keeps its original status and error', async () => {
  const response = { status: 409, body: { ok: false, intentId: fixture.statusResponse.body.intentId,
    status: 'refused', error: 'payment_refused', retryable: false, replacementAllowed: false,
    retryWithSameIntentOnly: false, delivery: { state: 'not_dispatched' }, payment: { state: 'not_sent', confirmed: false } } };
  const { result, text, summary } = await invoke('x402_status', response);
  assert.equal(result.isError, true);
  assert.equal(summary.status, 'refused');
  assert.equal(summary.httpStatus, 409);
  assert.match(text, /^status: refused$/m);
  assert.match(text, /^http status: 409$/m);
  assert.doesNotMatch(text, /provider http status/);
});

after(async () => {
  const directory = process.env.DEXTER_MCP_DISPLAY_EVIDENCE_DIR;
  if (directory) {
    assert.ok(directory.startsWith('/home/branchmanager/dexter-reports/'));
    await writeFile(`${directory}/registered-handler-results.json`, JSON.stringify({
      observedAt: new Date().toISOString(), sourceRoot: sourceRoot.href,
      scope: 'Offline actual SDK and registered handlers with saved API HTTP responses; no network or customer call', evidence,
    }, null, 2) + '\n');
  }
});
