import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function governedAssetAction(');
const end = source.indexOf('// ─── MCP Server Setup', start);
assert.ok(start >= 0 && end > start);

function handler(callGovernedAssetBackend) {
  // Exercise the real handler without starting the hosted MCP HTTP service.
  return runInNewContext(`${source.slice(start, end)}; governedAssetAction`, {
    GOVERNED_ASSET_TOOL_NAMES: {},
    GOVERNED_ASSET_META: {},
    API_BASE_FALLBACK: 'https://api.dexter.test',
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'test-only-governed-secret-at-least-thirty-two-bytes',
    extractMcpSessionId: () => 'test-bound-session',
    callGovernedAssetBackend,
    buildGovernedAssetToolResult: (result) => result,
  });
}

test('stock Buy and Sell Prepare allow the bounded backend verification deadline', async () => {
  for (const action of ['buy', 'sell']) {
    const args = {
      operationId: '019f981c-9215-7141-84f2-d89ffe9cbece',
      action,
      companyQuery: 'NVIDIA',
      amountAtomic: '1000000',
    };
    let calls = 0;
    const result = await handler(async (options) => {
      calls += 1;
      assert.equal(options.operation, 'prepare');
      assert.equal(options.input, args);
      assert.equal(options.input.operationId, args.operationId);
      assert.equal(options.timeoutMs, 30_000);
      assert.equal(options.mcpSessionId, 'test-bound-session');
      return 'unchanged-backend-result';
    })('prepare', args, {});
    assert.equal(calls, 1);
    assert.equal(result, 'unchanged-backend-result');
  }
});

test('non-stock Prepare, Send, and recovery reads retain the client default', async () => {
  for (const [operation, args] of [
    ['prepare', { action: 'buy', assetId: 'approved-holding' }],
    ['prepare', { action: 'sell', assetId: 'approved-holding' }],
    ['prepare', { action: 'send', assetId: 'usdc' }],
    ['status', { intentId: 'existing-intent' }],
    ['reconcile', { intentId: 'existing-intent' }],
    ['history', {}],
  ]) {
    let calls = 0;
    await handler(async (options) => {
      calls += 1;
      assert.equal(options.operation, operation);
      assert.equal(options.input, args);
      assert.equal(Object.hasOwn(options, 'timeoutMs'), false);
      return 'unchanged-backend-result';
    })(operation, args, {});
    assert.equal(calls, 1);
  }
});


test('Execute receives a backend response after five seconds without another invocation', { timeout: 10_000 }, async () => {
  const operationId = '019f981c-9215-7141-84f2-d89ffe9cbece';
  const responseBody = dynamicStockV2Fixture('tesla', operationId).execute;
  const args = { operationId, intentId: responseBody.intentId };
  let handlerCalls = 0;
  let fetchCalls = 0;
  let selectedTimeout;
  const started = performance.now();
  const result = await handler(async (options) => {
    handlerCalls += 1;
    selectedTimeout = options.timeoutMs;
    assert.equal(options.input, args);
    return callGovernedAssetBackend({
      ...options,
      fetchImpl: async (_url, init) => {
        fetchCalls += 1;
        assert.equal(init.method, 'POST');
        assert.equal(init.body, '{}');
        assert.equal(init.headers['idempotency-key'], operationId);
        return new Promise((resolve, reject) => {
          const finish = setTimeout(() => {
            init.signal.removeEventListener('abort', abort);
            resolve(new Response(JSON.stringify(responseBody), { status: 200 }));
          }, 5_250);
          const abort = () => { clearTimeout(finish); reject(init.signal.reason); };
          init.signal.addEventListener('abort', abort, { once: true });
        });
      },
    });
  })('execute', args, {});
  assert.equal(result.isError, false);
  assert.equal(result.body.status, responseBody.status);
  assert.equal(result.body.intentId, args.intentId);
  assert.equal(selectedTimeout, 30_000);
  assert.ok(performance.now() - started >= 5_000);
  assert.equal(handlerCalls, 1);
  assert.equal(fetchCalls, 1);
});

test('Execute retains transport uncertainty and never invokes a second request after abort', async () => {
  const operationId = '019f981c-9215-7141-84f2-d89ffe9cbece';
  const args = { operationId, intentId: '419f981c-9215-4141-84f2-d89ffe9cbece' };
  let fetchCalls = 0;
  const result = await handler((options) => callGovernedAssetBackend({
    ...options,
    fetchImpl: async () => { fetchCalls += 1; throw new DOMException('test deadline', 'TimeoutError'); },
  }))('execute', args, {});
  assert.equal(result.isError, true);
  assert.equal(result.body.status, 'unknown');
  assert.equal(result.body.retry, 'reconcile_same_intent_only');
  assert.equal(result.body.code, 'governed_backend_transport_failed');
  assert.equal(result.body.intentId, args.intentId);
  assert.equal(fetchCalls, 1);
});
