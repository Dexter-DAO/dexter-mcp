import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { z } from 'zod';
import { buildHostedCheckModelResult, buildHostedCheckStatusModelResult } from '../lib/open-check-result.mjs';
import { callOpenX402IntentApi, sanitizeOpenX402IntentResult, isOpenX402AuthorityRequired, projectOpenX402AuthorizationRequired, OPEN_X402_INTENT_ID_RE } from '../lib/open-x402-intent-api.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { purchaseResultText } from '../lib/customer-result-presentation.mjs';

const source = await readFile(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
// Execute the registered handler and its actual service boundary. Only the
// authenticated session and backend transport are replaced; result projectors
// and the public output schema are the shipped implementations.
const statusFunction = source.slice(source.indexOf('async function x402IntentStatus('), source.indexOf('async function x402Fetch('));
const statusRegistration = source.slice(source.indexOf("registerOpenTool(server, 'x402_status'"), source.indexOf("registerOpenTool(server, 'x402_mcp_tools'"));
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function invoke({ data, httpStatus = 200, fetchImpl, session = { sessionId: 'original-session', authenticated: true, lookupFailed: false } }) {
  let handler;
  const calls = [];
  const context = {
    z, server: {}, STATUS_META: {}, OPEN_X402_INTENT_ID_RE,
    buildHostedCheckStatusModelResult, sanitizeOpenX402IntentResult,
    purchaseResultText,
    isOpenX402AuthorityRequired, projectOpenX402AuthorizationRequired,
    resolveIntentSession: async () => session,
    callOpenX402IntentApi: async (...args) => {
      calls.push(args);
      return fetchImpl
        ? callOpenX402IntentApi(...args, { fetchImpl, serviceSecret: 'purchase-status-review-test-secret-at-least-32-bytes' })
        : { data, httpStatus };
    },
    isVaultAuthenticationRequired: () => false,
    registerOpenTool: (_server, _name, _descriptor, fn) => { handler = fn; },
    console, safeErrorLabel: () => 'test-error', logRef: (value) => value,
  };
  runInNewContext(`${statusFunction}\n${statusRegistration}`, context, { timeout: 1000 });
  const envelope = JSON.parse(JSON.stringify(await handler({ checkRequestId: 'saved-check' }, {})));
  const parsed = OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(envelope.structuredContent);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  return { envelope, calls };
}

test('actual MCP status envelope retains failed check HTTP and binding state', async () => {
  const missing = await invoke({ httpStatus: 404, data: { ok: false, status: 'check_unknown', error: 'purchase_check_not_found', retryable: false } });
  assert.equal(missing.envelope.isError, true);
  assert.equal(missing.envelope.structuredContent.httpStatus, 404);
  assert.equal(missing.envelope.structuredContent.error, 'purchase_check_not_found');
  assert.equal(missing.envelope.structuredContent.intentId, null);
  assert.equal(missing.envelope.structuredContent.recovery.arguments.checkRequestId, 'saved-check');
  const binding = await invoke({ session: { authenticated: false, lookupFailed: true, sessionId: 'original-session' } });
  assert.equal(binding.envelope.isError, true);
  assert.equal(binding.envelope.structuredContent.httpStatus, 503);
  assert.equal(binding.envelope.structuredContent.error, 'vault_state_unavailable');
  assert.equal(binding.calls.length, 0);
  const denied = await invoke({ session: { authenticated: false, lookupFailed: false, sessionId: null } });
  assert.equal(denied.envelope.isError, true);
  assert.equal(denied.envelope.structuredContent.httpStatus, 401);
});

test('actual MCP status envelope preserves consumed purchase identity and only offers observation', async () => {
  const { envelope, calls } = await invoke({ data: { ok: true, intentId: ID, status: 'purchase_already_started', retryable: false, retryWithSameIntentOnly: true } });
  assert.equal(envelope.isError, false);
  const result = envelope.structuredContent;
  assert.equal(result.intentId, ID);
  assert.equal(result.checkRequestId, 'saved-check');
  assert.equal(result.status, 'purchase_already_started');
  assert.equal(result.continuation.tool, 'x402_status');
  assert.deepEqual(result.continuation.arguments, { intentId: ID });
  assert.equal(result.outcome.resultAvailable, false);
  assert.equal(Object.hasOwn(result, 'executionGuidance'), false);
  assert.equal(Object.hasOwn(result, 'quoteOnly'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'checkStatus');
});

test('actual MCP status envelope recovers free output and in-progress timing', async () => {
  const free = await invoke({ data: { ok: true, free: true, authMode: 'unprotected', data: { answer: 'saved response' } } });
  assert.equal(free.envelope.isError, false);
  assert.deepEqual(free.envelope.structuredContent.data, { answer: 'saved response' });
  const pending = await invoke({ httpStatus: 202, data: { ok: true, status: 'check_in_progress', retryAfterMs: 750 } });
  assert.equal(pending.envelope.isError, false);
  assert.equal(pending.envelope.structuredContent.recovery.retryAfterMs, 750);
  assert.equal(pending.envelope.structuredContent.executionGuidance.readyForFetch, false);
});

test('old API missing check-status route and transport failure preserve read-only recovery through the actual API parser and MCP handler', async () => {
  const scenarios = [
    () => new Response('<html><body>Cannot POST /v2/pay/anon/x402/check/status</body></html>', { status: 404, headers: { 'content-type': 'text/html' } }),
    () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }),
    () => new Response('{"error":"not_found"}', { status: 404, headers: { 'content-type': 'application/json' } }),
    () => { throw new Error('status transport interrupted'); },
  ];
  for (const respond of scenarios) {
    const requests = [];
    const { envelope, calls } = await invoke({ fetchImpl: async (path, options) => {
      requests.push({ path, body: JSON.parse(options.body) });
      return respond();
    } });
    const result = envelope.structuredContent;
    assert.equal(envelope.isError, true);
    assert.equal(result.checkRequestId, 'saved-check');
    assert.equal(result.error, 'purchase_check_status_unavailable');
    assert.equal(result.intentId, null);
    assert.equal(result.executionGuidance.readyForFetch, false);
    assert.equal(result.executionGuidance.reprobeAllowed, false);
    assert.equal(result.recovery.tool, 'x402_status');
    assert.deepEqual(result.recovery.arguments, { checkRequestId: 'saved-check' });
    assert.match(result.message, /cannot read this saved check/);
    const text = JSON.parse(envelope.content[0].text);
    assert.equal(text.recovery.arguments.checkRequestId, 'saved-check');
    assert.equal(text.executionGuidance.reprobeAllowed, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(requests, [{ path: '/v2/pay/anon/x402/check/status', body: { mcp_session_id: 'original-session', requestId: 'saved-check' } }]);
  }
});

test('a stored provider 404 with the matching check identity remains the recorded provider result', async () => {
  const { envelope } = await invoke({ fetchImpl: async () => new Response(JSON.stringify({
    ok: false, checkRequestId: 'saved-check', error: 'not_found', message: 'The provider did not find the requested resource.',
  }), { status: 404, headers: { 'content-type': 'application/json' } }) });
  assert.equal(envelope.isError, true);
  assert.equal(envelope.structuredContent.error, 'not_found');
  assert.equal(envelope.structuredContent.message, 'The provider did not find the requested resource.');
  assert.equal(envelope.structuredContent.executionGuidance.supportedPath, 'provider_error');
});

const checkFunctionStart = source.indexOf('async function runCanonicalX402Check(');
const checkFunction = source.slice(checkFunctionStart, source.indexOf('// ─── Tool: dexter_wallet', checkFunctionStart));
const checkRegistration = source.slice(source.indexOf("registerOpenTool(server, 'x402_check'"), source.indexOf("registerOpenTool(server, 'x402_access'"));

async function invokeCheck(backend) {
  let handler;
  let calls = 0;
  const context = {
    server: {}, CHECK_META: {}, OPEN_X402_CHECK_DESCRIPTION: 'Check', openX402CheckSchema: {},
    buildHostedCheckModelResult, randomUUID: () => 'saved-check',
    API_BASE_FALLBACK: 'https://unused.example',
    resolveIntentSession: async () => ({ sessionId: 'same-session', authenticated: true, lookupFailed: false }),
    callOpenX402IntentApi: async () => { calls++; if (backend instanceof Error) throw backend; return backend; },
    legacyIntentBridge: { recordCheck: () => {} }, sessionMeta: new Map(), oauthVaultIdentityOf: () => null,
    registerOpenTool: (_server, _name, _descriptor, fn) => { handler = fn; },
  };
  runInNewContext(`${checkFunction}\n${checkRegistration}`, context, { timeout: 1000 });
  const envelope = JSON.parse(JSON.stringify(await handler({ resourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', method: 'GET' }, {})));
  const parsed = OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(envelope.structuredContent);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  return { envelope, calls };
}

test('actual check handler gives exact readable supported prices and recovers a lost check without resending', async () => {
  const backend = { httpStatus: 200, data: { ok: true, paymentRequired: true, intentId: ID, amountAtomic: '25', asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' } };
  const priced = await invokeCheck(backend);
  assert.equal(priced.envelope.isError, false);
  assert.equal(priced.envelope.structuredContent.paymentOptions[0].priceFormatted, '0.000025 USDC');
  const unfamiliar = await invokeCheck({ ...backend, data: { ...backend.data, asset: 'unknown-asset' } });
  assert.equal(Object.hasOwn(unfamiliar.envelope.structuredContent.paymentOptions[0], 'priceFormatted'), false);
  const lost = await invokeCheck(new Error('transport interrupted'));
  assert.equal(lost.calls, 1);
  assert.equal(lost.envelope.isError, true);
  assert.equal(lost.envelope.structuredContent.recovery.checkRequestId, 'saved-check');
  assert.equal(lost.envelope.structuredContent.intentId, null);
  assert.equal(lost.envelope.structuredContent.executionGuidance.reprobeAllowed, false);
});
