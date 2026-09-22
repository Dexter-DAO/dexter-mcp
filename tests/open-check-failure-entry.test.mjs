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
    if (path !== 'provider_error') assert.equal(result.executionGuidance.reprobeAllowed, false);
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

test('unresolved saved check retains its exact recovery despite a local-looking error', () => {
  const result = buildHostedCheckStatusModelResult({ checkRequestId: 'saved-check-2',
    checkResult: { ...refusal, status: 'check_unknown', retryable: false },
  });
  assert.equal(result.executionGuidance.supportedPath, 'check_pending');
  assert.equal(result.executionGuidance.reprobeAllowed, false);
  assert.deepEqual(result.recovery.arguments, { checkRequestId: 'saved-check-2' });
  assert.equal(result.recovery.tool, 'x402_status');
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
    ]) {
      currentRefusal = failure;
      const before = calls.length;
      const result = await server._registeredTools[tool].handler({
        url: 'https://seller.example/pdf', method: 'POST', body: '{"url":"https://example.org/document.pdf"}',
      }, { sessionId: `failure-fixture-${tool}` });
      assert.equal(calls.length, before + 1);
      assert.equal(result.structuredContent.executionGuidance.supportedPath, path);
      assert.equal(result.structuredContent.executionGuidance.readyForFetch, false);
      if (path !== 'provider_error') assert.equal(result.structuredContent.executionGuidance.reprobeAllowed, false);
      assert.equal(result.structuredContent.checkRequestId, calls.at(-1).requestId);
      assert.equal(result.structuredContent.error, failure.error);
      assert.equal(result.structuredContent.reason, failure.reason);
      assert.equal(result.structuredContent.intentId, null);
      assert.equal(result.isError, true);
      assert.doesNotMatch(JSON.stringify([result.content, result.structuredContent]), /OLD_WALLET_DIAGNOSTIC/);
      assert.deepEqual(result._meta['dexter/checkEvidence'], { enrichment, enrichment_source: 'live_db' });
      assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result.structuredContent).success, true);
      if (tool === 'x402_check') {
        const checkRequestId = result.structuredContent.checkRequestId;
        const beforeStatus = statusCalls.length;
        const saved = await server._registeredTools.x402_status.handler({ checkRequestId }, {
          sessionId: `failure-fixture-${tool}`,
        });
        assert.equal(statusCalls.length, beforeStatus + 1);
        assert.equal(calls.length, before + 1);
        assert.equal(statusCalls.at(-1).requestId, checkRequestId);
        assert.equal(saved.structuredContent.checkRequestId, checkRequestId);
        assert.equal(saved.structuredContent.error, failure.error);
        assert.equal(saved.structuredContent.executionGuidance.supportedPath, path);
        assert.equal(saved.structuredContent.executionGuidance.readyForFetch, false);
        assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(saved.structuredContent).success, true);
      }
    }
  }
});
