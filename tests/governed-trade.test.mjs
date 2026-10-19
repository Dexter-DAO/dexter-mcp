import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import {
  callGovernedTradeBackend, GOVERNED_TRADE_CLIENT_DEADLINE_MS,
  verifyGovernedBackendRequestAuth,
} from '../lib/governed-asset-client.mjs';
import { GOVERNED_TRADE_DESCRIPTION, GOVERNED_TRADE_INPUT_SCHEMA } from '../lib/governed-trade-contract.mjs';
import { GOVERNED_TRADE_PATH } from '../lib/governed-asset-backend-profile.mjs';

const secret = 'test-only-trade-secret-at-least-32-bytes';
const input = { operationId: 'trade-test-0001', action: 'buy', companyQuery: 'Apple', amountAtomic: '1000000' };
const intentId = '419f981c-9215-4141-84f2-d89ffe9cbece';
const refusal = {
  namespace: 'dexter-governed-agent-http-refusal/v1', status: 'refused',
  code: 'idempotency_conflict', explanation: 'This operation belongs to different terms.',
  executed: false, signed: false, submitted: false, settlementFinalized: false,
};
const answer = outcome => ({
  namespace: 'dexter-governed-agent-trade/v1', operationId: input.operationId,
  action: 'buy', outcome, retrySafe: false, intentId, transactionSignature: null,
  code: null, explanation: null, requotes: 1,
  chain: [{ requestId: input.operationId, intentId, outcome }],
  prepare: { approval: { url: 'https://example.test/approval?token=preserve-me' } },
  execute: { nested: { futureField: ['keep', null, false, 17] } },
  status: { outcome, retrySafe: false },
});

async function fakeApi(t, respond) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({ method: req.method, path: req.url, headers: req.headers, body });
    respond(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { calls, apiBase: `http://127.0.0.1:${server.address().port}` };
}
function call(api, overrides = {}) {
  return callGovernedTradeBackend({
    apiBase: api.apiBase, secret, input, mcpSessionId: 'primary-test-session',
    deadlineUnixMs: Date.now() + 50_000, ...overrides,
  });
}

for (const [status, body] of [
  [200, answer('filled')], [202, answer('sending')], [202, answer('checking')],
  [200, { ...answer('not_sent'), retrySafe: true }],
  [200, { ...answer('failed_onchain'), retrySafe: true }],
  [409, refusal], [503, { ...refusal, code: 'one_step_trade_disabled' }],
  [500, { error: 'upstream failure' }],
]) {
  test(`one POST preserves HTTP ${status} ${body.outcome ?? body.code ?? 'error'} verbatim`, async t => {
    const api = await fakeApi(t, (_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    const result = await call(api);
    assert.deepEqual(result.structuredContent, body);
    assert.deepEqual(JSON.parse(result.content[0].text), body);
    assert.equal(result.isError, status >= 400);
    assert.equal(api.calls.length, 1);
    const request = api.calls[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.path, GOVERNED_TRADE_PATH);
    assert.deepEqual(request.body, { action: 'buy', companyQuery: 'Apple', amountAtomic: '1000000' });
    assert.equal(request.headers['idempotency-key'], input.operationId);
    assert.equal(verifyGovernedBackendRequestAuth({ secret, method: request.method,
      originalUrl: request.path, body: request.body, headers: request.headers }), true);
  });
}

test('timeout after send is uncertain and never retried', async t => {
  const api = await fakeApi(t, () => {});
  await assert.rejects(call(api, { timeoutMs: 100 }), error => {
    assert.equal(error.message, 'governed_trade_result_uncertain');
    assert.equal('executed' in error, false);
    assert.equal('submitted' in error, false);
    return true;
  });
  assert.equal(api.calls.length, 1);
});

test('a timeout while reading the body is also uncertain', async t => {
  const api = await fakeApi(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"outcome":');
  });
  await assert.rejects(call(api, { timeoutMs: 100 }), /governed_trade_result_uncertain/);
  assert.equal(api.calls.length, 1);
});

test('an unreadable answer is uncertain and a redirect is never followed', async t => {
  for (const status of [200, 307]) {
    const api = await fakeApi(t, (_req, res) => {
      res.writeHead(status, { location: '/must-not-retry' });
      res.end('not JSON');
    });
    await assert.rejects(call(api), /governed_trade_result_uncertain/);
    assert.equal(api.calls.length, 1);
  }
});

test('the whole client deadline and response reserve must fit before sending', async t => {
  const api = await fakeApi(t, (_req, res) => res.end(JSON.stringify(answer('filled'))));
  const started = Date.now();
  const options = { now: () => started };
  for (const remainingMs of [2_000, 38_999]) {
    await assert.rejects(call(api, { ...options, deadlineUnixMs: started + remainingMs }),
      /governed_trade_deadline_exceeded/);
  }
  assert.equal(api.calls.length, 0);
  const result = await call(api, { ...options, deadlineUnixMs: started + 39_000 });
  assert.deepEqual(result.structuredContent, answer('filled'));
  assert.equal(api.calls.length, 1);
});

test('expired, missing, cancelled, or exhausted budget never starts the route', async t => {
  const api = await fakeApi(t, () => assert.fail('route started after deadline'));
  for (const deadlineUnixMs of [undefined, NaN, Date.now() - 1, Date.now(), Date.now() + 500]) {
    await assert.rejects(call(api, { deadlineUnixMs }), /governed_trade_deadline/);
  }
  await assert.rejects(call(api, { signal: AbortSignal.abort() }), /governed_trade_deadline/);
  let clockReads = 0;
  const started = Date.now();
  await assert.rejects(call(api, { deadlineUnixMs: started + 50_000,
    now: () => started + (++clockReads === 1 ? 0 : 50_001) }), /governed_trade_deadline/);
  assert.equal(api.calls.length, 0);
  assert.equal(GOVERNED_TRADE_CLIENT_DEADLINE_MS, 38_000);
});

test('route accepts all eleven exact Buy/Sell variants and canonicalizes human decimals', () => {
  const operationId = input.operationId;
  const selectors = [{ assetId: 'apple-stock' }, { companyQuery: 'Apple' },
    { tokenMint: 'So11111111111111111111111111111111111111112' }];
  for (const selector of selectors) {
    for (const action of ['buy', 'sell']) {
      assert.ok(GOVERNED_TRADE_INPUT_SCHEMA.safeParse({ operationId, action, ...selector, amountAtomic: '1' }).success);
    }
    assert.equal(GOVERNED_TRADE_INPUT_SCHEMA.parse({ operationId, action: 'sell', ...selector, valueUsd: '1.00' }).valueUsd, '1');
    if (!selector.tokenMint) {
      assert.equal(GOVERNED_TRADE_INPUT_SCHEMA.parse({ operationId, action: 'buy', ...selector,
        shareQuantity: '0.250', maximumSpendAtomic: '18446744073709551615' }).shareQuantity, '0.25');
    }
  }
});

test('a stock buy names the company and a held stock sells by its portfolio asset id', () => {
  assert.match(GOVERNED_TRADE_DESCRIPTION, /To buy a stock, use companyQuery/);
  assert.match(GOVERNED_TRADE_DESCRIPTION, /To sell a stock the user holds, use its assetId from dexter_wallet_portfolio/);
  assert.ok(GOVERNED_TRADE_INPUT_SCHEMA.safeParse({ operationId: input.operationId, action: 'sell',
    assetId: 'backpack-spcx', valueUsd: '1' }).success);
});

test('invalid identifiers, authority overrides, ambiguous terms, and amounts fail before fetch', async () => {
  const invalid = [
    { operationId: 'short' }, { operationId: 'a'.repeat(121) }, { operationId: 'trade-test.q2' },
    { action: 'send' }, { assetId: 'apple-stock' }, { shareQuantity: '1' },
    { amountAtomic: '18446744073709551616' }, { amountAtomic: '0' }, { amountAtomic: '01' },
    { amountAtomic: 1 }, { companyQuery: ' Apple' }, { companyQuery: 'Apple\n' },
    { mcpSessionId: 'another-person' }, { extra: true },
  ];
  for (const override of invalid) {
    await assert.rejects(callGovernedTradeBackend({ apiBase: 'http://127.0.0.1', secret,
      mcpSessionId: 'test', input: { ...input, ...override }, deadlineUnixMs: Date.now() + 50_000,
      fetchImpl: () => assert.fail('invalid input sent') }));
  }
  for (const tokenMint of ['1'.repeat(31), '1'.repeat(33), 'z'.repeat(44), '0'.repeat(32)]) {
    assert.equal(GOVERNED_TRADE_INPUT_SCHEMA.safeParse({ operationId: input.operationId,
      action: 'buy', tokenMint, amountAtomic: '1' }).success, false);
  }
});
