import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import {
  buildHostedCheckModelResult,
  buildHostedCheckStatusModelResult,
  buildHostedCheckToolResult,
} from '../lib/open-check-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const refusal = {
  ok: false,
  error: 'agent_role_state_unavailable',
  reason: 'swig_role_rpc_context_unavailable',
  retryable: true,
  httpStatus: 503,
};

const upstreamRefusal = {
  ok: false,
  status: 'check_refused',
  error: 'purchase_service_unavailable',
  reason: 'blockchain_data_unavailable',
  providerDispatched: false,
  paymentDispatched: false,
  replacementAllowed: true,
  retryable: true,
  httpStatus: 503,
};

const invalidQuote = {
  ok: false,
  error: 'invalid_payment_resource',
  reason: 'payment_resource_mismatch',
  message: 'The seller returned payment terms for a different request. No payment was made.',
  retryable: false,
  providerDispatched: true,
  paymentDispatched: false,
};
const legacyInvalidQuote = {
  ok: false,
  error: 'new_check_required',
  reason: 'payment_resource_mismatch',
  retryable: false,
};

test('invalid quote dispatch evidence must match the saved check and remain uncontradicted', () => {
  const checkRequestId = 'saved-invalid-quote';
  const canonical = { ...invalidQuote, checkRequestId };
  for (const mutation of [
    { checkRequestId: undefined },
    { checkRequestId: 'different-check' },
    { providerDispatched: undefined },
    { providerDispatched: false },
    { paymentDispatched: undefined },
    { paymentDispatched: true },
    { retryable: true },
    { status: 'check_unknown' },
    { status: 'check_ambiguous' },
  ]) {
    const checkResult = { ...canonical, ...mutation };
    for (const recoveredCheck of [false, true]) {
      const result = buildHostedCheckModelResult({ checkRequestId, checkResult, recoveredCheck,
        url: 'https://seller.example/weather?location=Brooklyn' });
      assert.equal(Object.hasOwn(result, 'providerDispatched'), false);
      assert.equal(Object.hasOwn(result, 'paymentDispatched'), false);
      assert.doesNotMatch(result.message ?? '', /No payment was made|before contacting the seller|seller was not contacted/i);
      assert.equal(result.intentId, null);
      assert.equal(result.executionGuidance.readyForFetch, false);
      assert.equal(result.executionGuidance.reprobeAllowed, false);
      if (mutation.status && !recoveredCheck) {
        assert.equal(result.error, invalidQuote.error);
        assert.equal(result.executionGuidance.nextAction, 'read_status');
        assert.equal(result.executionGuidance.tool, 'x402_status');
      } else {
        assert.equal(result.executionGuidance.nextAction, 'stop');
        assert.equal(Object.hasOwn(result.executionGuidance, 'tool'), false);
        assert.equal(Object.hasOwn(result, 'recovery'), false);
      }
      const parsed = OPEN_TOOL_CONTRACTS[recoveredCheck ? 'x402_status' : 'x402_check'].outputSchema.safeParse(result);
      assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    }
  }
  for (const checkResult of [
    { ...legacyInvalidQuote, reason: 'different_failure' },
    { ...invalidQuote, reason: 'different_failure' },
  ]) {
    const result = buildHostedCheckModelResult({ checkRequestId, checkResult });
    assert.equal(result.error, checkResult.error);
    assert.equal(result.executionGuidance.supportedPath, 'unknown_error');
  }
});

test('registered Check and Access report saved quote failures without a Status retry loop', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'a'.repeat(32);
  const checks = [];
  const statusReads = [];
  const savedChecks = new Map();
  let current = { body: legacyInvalidQuote, httpStatus: 409, bound: false };
  const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/api/passkey-anon/mcp-binding/')) return response({ ok: true, user_handle: 'fixture-user' });
    if (url.pathname === '/api/x402/resource') return response({ ok: true, found: false });
    const request = JSON.parse(init.body);
    if (url.pathname.endsWith('/check')) {
      checks.push(request);
      const saved = { body: { ...current.body,
        ...(current.bound ? { checkRequestId: request.requestId } : {}) }, httpStatus: current.httpStatus };
      savedChecks.set(request.requestId, saved);
      return response(saved.body, saved.httpStatus);
    }
    if (url.pathname.endsWith('/check/status')) {
      statusReads.push(request);
      const saved = savedChecks.get(request.requestId);
      assert.ok(saved, 'Status must read the original saved check');
      return response(saved.body, saved.httpStatus);
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  };
  const server = createOpenMcpServer({ includeResources: false });
  t.after(async () => {
    await server.close();
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  for (const variant of [
    { body: legacyInvalidQuote, httpStatus: 409, bound: false },
    { body: invalidQuote, httpStatus: 502, bound: true },
  ]) {
    for (const tool of ['x402_check', 'x402_access']) {
      current = variant;
      const extra = { sessionId: `quote-failure-${variant.httpStatus}-${tool}` };
      const before = checks.length;
      const first = await server._registeredTools[tool].handler({ url: 'https://seller.example/weather?location=Brooklyn' }, extra);
      assert.equal(checks.length, before + 1);
      const checkRequestId = checks.at(-1).requestId;
      const saved = await server._registeredTools.x402_status.handler({ checkRequestId }, extra);
      assert.equal(checks.length, before + 1, 'Status must never repeat the Check');
      assert.equal(statusReads.at(-1).requestId, checkRequestId);
      assert.equal(saved.structuredContent.httpStatus, variant.httpStatus);
      for (const [name, result] of [[tool, first], ['x402_status', saved]]) {
        const model = result.structuredContent;
        const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
        assert.equal(result.isError, true);
        assert.equal(model.error, 'invalid_payment_resource');
        assert.equal(model.reason, 'payment_resource_mismatch');
        assert.equal(model.checkRequestId, checkRequestId);
        assert.equal(model.retryable, false);
        assert.equal(model.intentId, null);
        assert.equal(model.executionGuidance.supportedPath, 'provider_error');
        assert.equal(model.executionGuidance.readyForFetch, false);
        assert.equal(model.executionGuidance.reprobeAllowed, false);
        assert.equal(model.executionGuidance.nextAction, 'stop');
        assert.equal(Object.hasOwn(model.executionGuidance, 'tool'), false);
        assert.equal(Object.hasOwn(model, 'recovery'), false);
        assert.ok(text.includes(model.executionGuidance.message));
        assert.ok(text.includes(checkRequestId));
        assert.doesNotMatch(text, /Read x402_status|new_check_required|new check required/);
        assert.doesNotMatch(text, /^\s*[\[{]/);
        if (variant.bound) {
          assert.equal(model.providerDispatched, true);
          assert.equal(model.paymentDispatched, false);
          assert.match(text, /No payment was made/);
          assert.match(text, /seller/i);
        } else {
          assert.equal(Object.hasOwn(model, 'providerDispatched'), false);
          assert.equal(Object.hasOwn(model, 'paymentDispatched'), false);
          assert.doesNotMatch(text, /No payment was made|before contacting the seller|seller was not contacted/i);
        }
        assert.equal(OPEN_TOOL_CONTRACTS[name].outputSchema.safeParse(model).success, true);
      }
      assert.equal(first.structuredContent.message, saved.structuredContent.message);
      assert.deepEqual(first.structuredContent.executionGuidance, saved.structuredContent.executionGuidance);
    }
  }
  assert.equal(checks.length, 4);
  assert.equal(statusReads.length, 4);
});

test('a retryable error alone never permits a new provider request', () => {
  const checkRequestId = 'saved-refusal';
  for (const mutation of [
    { checkRequestId: undefined },
    { checkRequestId: 'other-check' },
    { providerDispatched: undefined },
    { providerDispatched: true },
    { paymentDispatched: undefined },
    { paymentDispatched: true },
    { replacementAllowed: undefined },
    { status: 'check_unknown' },
    { status: 'check_ambiguous' },
    { error: 'purchase_check_outcome_unknown' },
    { error: 'purchase_check_ambiguous' },
    { error: 'purchase_check_not_found' },
  ]) {
    const result = buildHostedCheckModelResult({ checkRequestId,
      url: 'https://seller.example/weather',
      checkResult: { ...upstreamRefusal, checkRequestId, ...mutation },
    });
    assert.equal(result.executionGuidance.reprobeAllowed, false);
    assert.equal(result.replacementAllowed, false);
    assert.equal(result.intentId, null);
    assert.equal(result.executionGuidance.readyForFetch, false);
    assert.notEqual(result.providerDispatched, false);
    assert.notEqual(result.paymentDispatched, false);
    assert.equal(OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(result).success, true);
  }
  const unresolved = buildHostedCheckStatusModelResult({ checkRequestId,
    checkResult: { ...upstreamRefusal, checkRequestId, status: 'check_ambiguous', retryable: false },
  });
  assert.equal(Object.hasOwn(unresolved, 'recovery'), false);
  assert.equal(unresolved.executionGuidance.nextAction, 'stop');
  assert.equal(Object.hasOwn(unresolved.executionGuidance, 'tool'), false);
  assert.equal(unresolved.executionGuidance.supportedPath, 'check_pending');
  const missing = buildHostedCheckModelResult({ checkRequestId,
    checkResult: { ...upstreamRefusal, checkRequestId, error: 'purchase_check_not_found' },
  });
  assert.equal(Object.hasOwn(missing, 'recovery'), false);
  const contradictoryPending = buildHostedCheckStatusModelResult({ checkRequestId,
    checkResult: { status: 'check_in_progress', error: 'purchase_check_outcome_unknown' },
  });
  assert.equal(contradictoryPending.executionGuidance.nextAction, 'stop');
  assert.equal(Object.hasOwn(contradictoryPending, 'recovery'), false);
});

test('a saved permanent authority refusal remains distinct from a blockchain service failure', () => {
  const result = buildHostedCheckStatusModelResult({ checkRequestId: 'grant-refusal',
    checkResult: { ...upstreamRefusal, checkRequestId: 'grant-refusal',
      error: 'agent_role_evidence_inconsistent', reason: 'agent_session_role_snapshot_evidence_mismatch', retryable: false, replacementAllowed: false },
  });
  assert.equal(result.executionGuidance.supportedPath, 'local_authority_unavailable');
  assert.equal(result.retryable, false);
  assert.equal(result.replacementAllowed, false);
  assert.equal(result.providerDispatched, false);
  assert.equal(result.paymentDispatched, false);
  assert.match(result.message, /No payment was made/);
  assert.match(result.executionGuidance.message, /review by Dexter support/);
  assert.doesNotMatch(result.executionGuidance.message, /reconnect|replace|passkey/i);
  assert.equal(result.executionGuidance.reprobeAllowed, false);
  assert.doesNotMatch(result.message, /blockchain|data service/);
  assert.equal(Object.hasOwn(result, 'recovery'), false);
  assert.equal(result.executionGuidance.nextAction, 'stop');
  const contradictory = buildHostedCheckStatusModelResult({ checkRequestId: 'grant-refusal',
    checkResult: { ...upstreamRefusal, checkRequestId: 'grant-refusal', error: 'agent_grant_required' },
  });
  assert.equal(contradictory.executionGuidance.reprobeAllowed, false);
  assert.equal(contradictory.retryable, false);
  assert.equal(contradictory.replacementAllowed, false);
  assert.match(contradictory.message, /approved spending grant/);
  const nonretryableService = buildHostedCheckStatusModelResult({ checkRequestId: 'service-refusal',
    checkResult: { ...upstreamRefusal, checkRequestId: 'service-refusal', retryable: false },
  });
  assert.equal(nonretryableService.executionGuidance.nextAction, 'stop');
  assert.match(nonretryableService.executionGuidance.message, /blockchain data service/);
  assert.doesNotMatch(nonretryableService.executionGuidance.message, /authorization/);
  assert.equal(nonretryableService.replacementAllowed, false);
  const stopped = buildHostedCheckStatusModelResult({ checkRequestId: 'service-refusal',
    checkResult: { ...upstreamRefusal, checkRequestId: 'service-refusal', replacementAllowed: false },
  });
  assert.equal(stopped.providerDispatched, false);
  assert.equal(stopped.paymentDispatched, false);
  assert.equal(stopped.retryable, false);
  assert.equal(stopped.executionGuidance.nextAction, 'stop');
});

test('customer Check and Access refusals can be recovered by Status without another provider request', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'a'.repeat(32);
  const savedChecks = new Map();
  const checks = [];
  const statusReads = [];
  const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/api/passkey-anon/mcp-binding/')) return response({ ok: true, user_handle: 'fixture-user' });
    if (url.pathname === '/api/x402/resource') return response({ ok: true, found: false });
    const request = JSON.parse(init.body);
    if (url.pathname.endsWith('/check')) {
      checks.push(request);
      const saved = { ...upstreamRefusal, checkRequestId: request.requestId };
      savedChecks.set(request.requestId, saved);
      return response(saved, 503);
    }
    if (url.pathname.endsWith('/check/status')) {
      statusReads.push(request);
      const saved = savedChecks.get(request.requestId);
      return saved ? response(saved, 503) : response({ ok: false, status: 'check_unknown', error: 'purchase_check_not_found', retryable: false }, 404);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const server = createOpenMcpServer({ includeResources: false });
  t.after(async () => {
    await server.close();
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  for (const tool of ['x402_check', 'x402_access']) {
    const extra = { sessionId: `saved-refusal-${tool}` };
    const first = await server._registeredTools[tool].handler({ url: 'https://seller.example/weather?location=Brooklyn' }, extra);
    const check = first.structuredContent;
    assert.equal(first.isError, true);
    assert.equal(check.executionGuidance.supportedPath, 'upstream_unavailable');
    assert.equal(check.retryable, true);
    assert.equal(check.executionGuidance.reprobeAllowed, true);
    assert.equal(check.providerDispatched, false);
    assert.equal(check.paymentDispatched, false);
    assert.equal(check.intentId, null);
    assert.match(check.message, /blockchain data service is unavailable/);
    assert.match(check.message, /before contacting the seller/);
    assert.doesNotMatch(check.message, /wallet permissions/);
    assert.equal(Object.hasOwn(check, 'recovery'), false);
    assert.equal(check.executionGuidance.nextAction, 'new_check');
    assert.equal(check.executionGuidance.tool, 'x402_check');
    assert.match(check.executionGuidance.message, /on a later attempt/);
    assert.match(check.executionGuidance.message, /Do not repeat checks in a loop/);
    const before = checks.length;
    const recovered = await server._registeredTools.x402_status.handler({ checkRequestId: check.checkRequestId }, extra);
    assert.equal(checks.length, before);
    assert.equal(recovered.isError, true);
    assert.equal(recovered.structuredContent.checkRequestId, check.checkRequestId);
    assert.equal(recovered.structuredContent.status, 'check_refused');
    assert.equal(recovered.structuredContent.message, check.message);
    assert.deepEqual(recovered.structuredContent.executionGuidance, check.executionGuidance);
    assert.equal(Object.hasOwn(recovered.structuredContent, 'recovery'), false);
    assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(check).success, true);
    assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(recovered.structuredContent).success, true);
  }
  assert.equal(checks.length, 2);
  assert.equal(statusReads.length, 2);
});

test('local authority, known seller failure and unknown failure retain distinct meanings', () => {
  const cases = [
    [refusal, 'local_authority_unavailable'],
    [{ ...refusal, authMode: 'siwx', free: true }, 'local_authority_unavailable'],
    [{ ...refusal, error: 'agent_role_evidence_inconsistent', retryable: false }, 'local_authority_unavailable'],
    [{ ok: false, error: 'provider_request_failed', reason: 'provider_returned_error', httpStatus: 502 }, 'provider_error'],
    [{ ok: false, error: 'unexpected_failure', httpStatus: 503 }, 'unknown_error'],
    [{ ok: false, error: 'provider_request_failed', httpStatus: 503 }, 'unknown_error'],
    [{ ok: false, free: true, error: 'unexpected_failure' }, 'unknown_error'],
  ];
  for (const [checkResult, path] of cases) {
    const result = buildHostedCheckModelResult({
      checkResult: { ...checkResult, intentId: 'provisional-handle' },
      checkRequestId: 'saved-check-1', url: 'https://seller.example/document',
    });
    assert.equal(result.executionGuidance.supportedPath, path);
    assert.equal(result.error, checkResult.error);
    assert.equal(result.reason, checkResult.reason);
    assert.equal(result.checkRequestId, 'saved-check-1');
    assert.equal(result.intentId, null);
    assert.equal(result.executionGuidance.readyForFetch, false);
    assert.equal(Object.hasOwn(result.executionGuidance, 'fetchArguments'), false);
    assert.equal(result.executionGuidance.reprobeAllowed, false);
    assert.equal(OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(result).success, true);
    assert.equal(OPEN_TOOL_CONTRACTS.x402_access.outputSchema.safeParse(result).success, true);
    const saved = buildHostedCheckStatusModelResult({ checkResult,
      checkRequestId: 'saved-check-1',
    });
    assert.equal(saved.executionGuidance.supportedPath, path);
    assert.equal(saved.error, checkResult.error);
    assert.equal(saved.checkRequestId, 'saved-check-1');
    assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(saved).success, true);
  }
});

test('observed unresolved check stops automatic retries despite a local-looking error', () => {
  const result = buildHostedCheckStatusModelResult({ checkRequestId: 'saved-check-2',
    checkResult: { ...refusal, status: 'check_unknown', retryable: false },
  });
  assert.equal(result.executionGuidance.supportedPath, 'check_pending');
  assert.equal(result.executionGuidance.reprobeAllowed, false);
  assert.equal(Object.hasOwn(result, 'recovery'), false);
  assert.equal(result.executionGuidance.nextAction, 'stop');
  assert.equal(Object.hasOwn(result.executionGuidance, 'tool'), false);
  assert.equal(result.error, refusal.error);
});

test('current failure projection retains historical evidence only in client metadata', () => {
  const enrichment = { history: { recent: [{ observedAt: '2026-09-21', diagnostic: 'OLD_WALLET_DIAGNOSTIC' }] } };
  const model = buildHostedCheckModelResult({ checkResult: refusal,
    checkRequestId: 'saved-check-3', enrichment, enrichmentSource: 'live_db',
  });
  const result = buildHostedCheckToolResult(model, { retainedMeta: 'unchanged' });
  assert.doesNotMatch(JSON.stringify([result.content, result.structuredContent]), /OLD_WALLET_DIAGNOSTIC|enrichment/);
  assert.equal(result.structuredContent.checkRequestId, 'saved-check-3');
  assert.equal(result.structuredContent.reason, refusal.reason);
  assert.deepEqual(result._meta['dexter/checkEvidence'], { enrichment, enrichment_source: 'live_db' });
  assert.equal(result._meta.retainedMeta, 'unchanged');
  assert.equal(result.isError, true);
  const success = buildHostedCheckToolResult({ ok: true, data: { text: 'document content' }, enrichment });
  assert.equal(success.structuredContent.enrichment, enrichment);
  assert.deepEqual(success.structuredContent.data, { text: 'document content' });
});

test('actual hosted Check and Access handlers preserve the current refusal without blaming the seller', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'a'.repeat(32);
  const calls = [];
  const statusCalls = [];
  const unexpectedCalls = [];
  let currentRefusal = refusal;
  const enrichment = { resource: { method: 'POST' }, history: { recent: [{ diagnostic: 'OLD_WALLET_DIAGNOSTIC' }] } };
  const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/api/passkey-anon/mcp-binding/')) return response({ ok: true, user_handle: 'fixture-user' });
    if (url.pathname.endsWith('/check')) {
      calls.push(JSON.parse(init.body));
      return response(currentRefusal, currentRefusal.httpStatus);
    }
    if (url.pathname.endsWith('/check/status')) {
      statusCalls.push(JSON.parse(init.body));
      return response(currentRefusal, currentRefusal.httpStatus);
    }
    if (url.pathname === '/api/x402/resource') return response({ ok: true, found: true, ...enrichment });
    unexpectedCalls.push(url.pathname);
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  };
  const server = createOpenMcpServer({ includeResources: false });
  t.after(async () => {
    await server.close();
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  for (const tool of ['x402_check', 'x402_access']) {
    for (const [failure, path] of [
      [refusal, 'local_authority_unavailable'],
      [{ ok: false, error: 'unclassified_failure', httpStatus: 503 }, 'unknown_error'],
      [{ ok: false, error: 'provider_request_failed', reason: 'provider_returned_error', httpStatus: 502 }, 'provider_error'],
      [{ ...refusal, authMode: 'siwx' }, 'local_authority_unavailable'],
      [{ ok: false, authMode: 'siwx', status: 'check_in_progress', reason: 'provider_check_in_progress', retryAfterMs: 250, retryable: false, httpStatus: 202 }, 'check_pending'],
      [{ ok: false, authMode: 'siwx', status: 'check_unknown', error: 'purchase_check_outcome_unknown', reason: 'provider_outcome_unknown', retryable: false, httpStatus: 503 }, 'check_pending'],
      [{ ok: false, authMode: 'siwx', status: 'check_ambiguous', error: 'purchase_check_ambiguous', reason: 'provider_outcome_ambiguous', retryable: false, httpStatus: 409 }, 'check_pending'],
    ]) {
      await t.test(`${tool}: ${failure.authMode ?? 'unspecified auth'} ${failure.status ?? failure.error}`, async () => {
        currentRefusal = failure;
        const before = calls.length;
        const beforeStatus = statusCalls.length;
        const args = {
          url: 'https://seller.example/pdf', method: 'POST', body: '{"url":"https://example.org/document.pdf"}',
        };
        const result = await server._registeredTools[tool].handler(args, { sessionId: `failure-fixture-${tool}` });
        assert.equal(calls.length, before + 1);
        assert.equal(statusCalls.length, beforeStatus);
        assert.equal(calls.at(-1).url, args.url);
        assert.equal(calls.at(-1).method, args.method);
        assert.equal(calls.at(-1).body, args.body);
        assert.equal(result.structuredContent.executionGuidance.supportedPath, path);
        assert.equal(result.structuredContent.executionGuidance.readyForFetch, false);
        assert.equal(result.structuredContent.executionGuidance.reprobeAllowed, false);
        assert.equal(result.structuredContent.executionGuidance.intentRequired, false);
        assert.equal(result.structuredContent.executionGuidance.dispatchAtMostOnce, true);
        assert.equal(Object.hasOwn(result.structuredContent.executionGuidance, 'fetchArguments'), false);
        assert.equal(result.structuredContent.checkRequestId, calls.at(-1).requestId);
        assert.equal(result.structuredContent.error, failure.error);
        assert.equal(result.structuredContent.reason, failure.reason);
        assert.equal(result.structuredContent.status, failure.status);
        assert.equal(result.structuredContent.retryable, path === 'local_authority_unavailable' ? false : failure.retryable);
        assert.deepEqual(result.structuredContent.checkedRequest, { ...args, requestBound: true });
        assert.equal(Object.hasOwn(result.structuredContent, 'siwx'), false);
        assert.equal(result.structuredContent.intentId, null);
        assert.equal(result.isError, true);
        assert.doesNotMatch(JSON.stringify([result.content, result.structuredContent]), /OLD_WALLET_DIAGNOSTIC/);
        assert.deepEqual(result._meta['dexter/checkEvidence'], { enrichment, enrichment_source: 'live_db' });
        assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result.structuredContent).success, true);
        const checkRequestId = result.structuredContent.checkRequestId;
        if (path === 'check_pending') {
          assert.equal(result.structuredContent.recovery.checkRequestId, checkRequestId);
          assert.equal(result.structuredContent.recovery.tool, 'x402_status');
          assert.deepEqual(result.structuredContent.recovery.arguments, { checkRequestId });
          assert.equal(result.structuredContent.recovery.retryAfterMs, failure.retryAfterMs);
        } else {
          assert.equal(Object.hasOwn(result.structuredContent, 'recovery'), false);
        }
        const saved = await server._registeredTools.x402_status.handler({ checkRequestId }, {
          sessionId: `failure-fixture-${tool}`,
        });
        assert.equal(statusCalls.length, beforeStatus + 1);
        assert.equal(calls.length, before + 1);
        assert.equal(statusCalls.at(-1).requestId, checkRequestId);
        assert.equal(saved.structuredContent.checkRequestId, checkRequestId);
        assert.equal(saved.structuredContent.error, failure.error);
        assert.equal(saved.structuredContent.reason, failure.reason);
        assert.equal(saved.structuredContent.status, failure.status);
        assert.equal(saved.structuredContent.retryable, path === 'local_authority_unavailable' ? false : failure.retryable);
        if (path === 'unknown_error' || ['check_unknown', 'check_ambiguous'].includes(failure.status)) {
          assert.equal(saved.structuredContent.executionGuidance.nextAction, 'stop');
          assert.equal(Object.hasOwn(saved.structuredContent.executionGuidance, 'tool'), false);
          assert.equal(Object.hasOwn(saved.structuredContent, 'recovery'), false);
        } else {
          assert.deepEqual(saved.structuredContent.executionGuidance, result.structuredContent.executionGuidance);
          assert.deepEqual(saved.structuredContent.recovery, result.structuredContent.recovery);
        }
        assert.equal(saved.structuredContent.intentId, null);
        assert.equal(Object.hasOwn(saved.structuredContent, 'siwx'), false);
        assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(saved.structuredContent).success, true);
        assert.deepEqual(unexpectedCalls, []);
      });
    }
  }
});
