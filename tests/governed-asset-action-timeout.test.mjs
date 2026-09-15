import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

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
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'test-only-secret',
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

test('non-stock Prepare, Send, Execute, and recovery reads retain the client default', async () => {
  for (const [operation, args] of [
    ['prepare', { action: 'buy', assetId: 'approved-holding' }],
    ['prepare', { action: 'sell', assetId: 'approved-holding' }],
    ['prepare', { action: 'send', assetId: 'usdc' }],
    ['execute', { intentId: 'existing-intent' }],
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
