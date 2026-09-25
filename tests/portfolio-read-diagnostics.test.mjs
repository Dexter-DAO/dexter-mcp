import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { fetchSessionPortfolioSelection } from '../lib/session-portfolio-selection.mjs';
import { PORTFOLIO_SELECTED_MAX_BYTES } from '../lib/portfolio-read-contract.mjs';
import { WALLET_ADDRESS } from './fixtures/wallet-portfolio-fixtures.mjs';
import { selectedReadFixture } from './fixtures/portfolio-selected-read-fixtures.mjs';

const sessionId = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const secret = 'SENSITIVE-test-hmac-only';
const now = () => Date.parse('2026-07-25T10:30:10.000Z');
const unavailable = { ok: false, error: 'portfolio_read_unavailable' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const poison = 'SENSITIVE-body-token-signed-url-wallet-session';
const args = { apiBase: 'https://api.invalid', sessionId, secret, expectedWalletAddress: WALLET_ADDRESS, now, input: { readVersion: 2 } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function run(fetchImpl, overrides = {}) {
  const records = []; const requests = [];
  const result = await fetchSessionPortfolioSelection({ ...args, ...overrides,
    onDiagnostic: record => records.push(record),
    fetchImpl: async (url, init) => { requests.push({ url, init }); return fetchImpl(url, init); },
  });
  assert.equal(records.length, 1);
  const diagnostic = records[0];
  assert.deepEqual(Object.keys(diagnostic).sort(), ['at', 'attemptRef', 'stage', 'outcome', 'causeClass', 'elapsedMs', 'budgetMs', 'httpStatus'].sort());
  assert.match(diagnostic.attemptRef, uuid);
  assert.ok(Number.isFinite(Date.parse(diagnostic.at)));
  assert.ok(Number.isSafeInteger(diagnostic.elapsedMs) && diagnostic.elapsedMs >= 0);
  assert.equal(diagnostic.budgetMs, overrides.timeoutMs ?? 20_000);
  for (const request of requests) {
    assert.equal(request.init.headers['X-Dexter-Portfolio-Request-Id'], diagnostic.attemptRef);
    assert.equal(request.init.headers['x-internal-signature'], createHmac('sha256', secret)
      .update(`${now()}.${sessionId}.mcp-portfolio-v1`).digest('hex'));
    assert.equal(request.init.redirect, 'error');
  }
  const text = JSON.stringify(diagnostic);
  for (const sensitive of [sessionId, secret, WALLET_ADDRESS, poison, 'https://api.invalid', 'x-internal-signature']) {
    assert.equal(text.includes(sensitive), false, sensitive);
  }
  return { result, diagnostic, requests, records };
}

test('selected read emits one safe success record, fresh correlation and unchanged signed request/result', async () => {
  const wire = selectedReadFixture();
  const first = await run(() => json(wire));
  const second = await run(() => json(wire));
  assert.deepEqual(first.result, wire);
  assert.equal(first.requests.length, 1);
  assert.equal(new URL(first.requests[0].url).search, '?view=summary');
  assert.equal(first.diagnostic.stage, 'complete');
  assert.equal(first.diagnostic.outcome, 'success');
  assert.equal(first.diagnostic.causeClass, null);
  assert.equal(first.diagnostic.httpStatus, 200);
  assert.notEqual(first.diagnostic.attemptRef, second.diagnostic.attemptRef);
});

for (const [label, fetchImpl, expectedStage, expectedCause, status] of [
  ['transport', () => { const error = new Error(poison); error.name = poison; error.cause = { token: secret }; throw error; }, 'request', 'transport_error', null],
  ['body read', () => ({ status: 200, ok: true, text: async () => { throw new Error(poison); } }), 'response_body', 'body_read_error', 200],
  ['invalid JSON', () => new Response(poison), 'response_json', 'invalid_json', 200],
  ['invalid UTF8', () => new Response(new Uint8Array([0xc3, 0x28])), 'response_body', 'body_read_error', 200],
  ['declared size', () => ({ status: 200, ok: true, headers: new Headers({ 'content-length': String(PORTFOLIO_SELECTED_MAX_BYTES + 1) }), text: () => { throw new Error('must not read'); } }), 'response_body', 'body_too_large', 200],
  ['streamed size', () => new Response(' '.repeat(PORTFOLIO_SELECTED_MAX_BYTES + 1)), 'response_body', 'body_too_large', 200],
  ['invalid chunk', () => ({ status: 200, ok: true, body: { getReader: () => ({ read: async () => ({ done: false, value: poison }), releaseLock() {} }) } }), 'response_body', 'body_invalid_chunk', 200],
  ['schema', () => json({ ok: true, token: poison }), 'response_validation', 'schema_or_wallet_mismatch', 200],
  ['wrong wallet', () => json(selectedReadFixture()), 'response_validation', 'schema_or_wallet_mismatch', 200],
  ['selection', () => json(selectedReadFixture()), 'selection_binding', 'selection_mismatch', 200],
]) {
  test(`safe diagnostic distinguishes ${label} without changing generic failure or making another request`, async () => {
    const overrides = label === 'wrong wallet' ? { expectedWalletAddress: 'Stake11111111111111111111111111111111111111' }
      : label === 'selection' ? { input: { snapshotId: poison } } : {};
    const r = await run(fetchImpl, overrides);
    assert.deepEqual(r.result, unavailable);
    assert.equal(r.requests.length, 1);
    assert.deepEqual([r.diagnostic.stage, r.diagnostic.causeClass, r.diagnostic.httpStatus], [expectedStage, expectedCause, status]);
  });
}

for (const [status, error] of [[400, 'portfolio_query_invalid'], [409, 'portfolio_snapshot_expired'],
  [413, 'portfolio_snapshot_too_large'], [422, 'portfolio_result_budget_exceeded'], [503, 'portfolio_read_unavailable']]) {
  test(`HTTP ${status} keeps exact existing model error and records known status`, async () => {
    const r = await run(() => json({ ok: false, error }, status));
    assert.deepEqual(r.result, { ok: false, error });
    assert.equal(r.requests.length, 1);
    assert.deepEqual([r.diagnostic.stage, r.diagnostic.causeClass, r.diagnostic.httpStatus], ['response_status', 'http_error', status]);
  });
}

test('untrusted status/error content remains generic and never enters diagnostics', async () => {
  for (const response of [json({ ok: false, error: poison }, 500), json({ ok: false, error: 'portfolio_snapshot_expired', secret }, 409), new Response(poison, { status: 503 })]) {
    const r = await run(() => response);
    assert.deepEqual(r.result, unavailable);
    assert.equal(r.requests.length, 1);
    assert.equal(r.diagnostic.httpStatus, response.status);
  }
});

test('pre-request refusals and expired snapshots retain results and safe categories', async () => {
  for (const [overrides, error, stage, causeClass, calls] of [
    [{ input: { walletAddress: poison } }, 'portfolio_query_invalid', 'input', 'input_invalid', 0],
    [{ secret: '' }, 'portfolio_read_unavailable', 'prerequisite', 'missing_prerequisite', 0],
    [{ apiBase: `https://api.invalid/?${poison}` }, 'portfolio_read_unavailable', 'request_setup', 'request_setup_error', 0],
    [{ now: () => Date.parse(selectedReadFixture().portfolio.expiresAt) }, 'portfolio_snapshot_expired', 'snapshot_expiry', 'snapshot_expired', 1],
  ]) {
    // Signature is checked separately above against the fixed synthetic clock.
    let count = 0; const records = [];
    const result = await fetchSessionPortfolioSelection({ ...args, ...overrides, onDiagnostic: r => records.push(r), fetchImpl: async () => { count++; return json(selectedReadFixture()); } });
    assert.deepEqual(result, { ok: false, error });assert.equal(count, calls);assert.equal(records.length, 1);
    assert.equal(records[0].stage, stage);assert.equal(records[0].causeClass, causeClass);
    assert.equal(JSON.stringify(records).includes(poison), false);
  }
});

for (const stage of ['headers', 'body']) {
  test(`deadline during ${stage} emits once even when ignored abort later resolves`, { timeout: 2000 }, async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const r = await run(() => stage === 'headers' ? pending : { ok: true, status: 200, text: () => pending }, { timeoutMs: 25 });
    assert.deepEqual(r.result, unavailable);
    assert.equal(r.requests.length, 1);
    assert.equal(r.requests[0].init.signal.aborted, true);
    assert.equal(r.diagnostic.stage, stage === 'headers' ? 'request' : 'response_body');
    assert.equal(r.diagnostic.causeClass, 'deadline_exceeded');
    assert.equal(r.diagnostic.httpStatus, stage === 'headers' ? null : 200);
    assert.ok(r.diagnostic.elapsedMs >= 20 && r.diagnostic.elapsedMs < 1000);
    release(stage === 'headers' ? json(selectedReadFixture()) : JSON.stringify(selectedReadFixture()));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.records.length, 1, 'late completion cannot log a second success');
  });
}

test('diagnostic sink failure cannot replace success or failure results', async () => {
  for (const body of [selectedReadFixture(), { token: poison }]) {
    let calls = 0;
    const result = await fetchSessionPortfolioSelection({ ...args, onDiagnostic: () => { throw new Error(poison); }, fetchImpl: async () => { calls++; return json(body); } });
    assert.deepEqual(result, body.ok ? body : unavailable);
    assert.equal(calls, 1);
  }
});

for (const stage of ['headers', 'body']) {
  test(`actual local HTTP ${stage} stall records deadline and cancels without retry`, { timeout: 3000 }, async t => {
    let count = 0; let closed = false;
    const server = createServer((request, response) => {
      count++; assert.match(request.headers['x-dexter-portfolio-request-id'], uuid);
      response.on('close', () => { closed = true; });
      if (stage === 'body') { response.writeHead(200, { 'content-type': 'application/json' }); response.write('{'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const records = [];
    const result = await fetchSessionPortfolioSelection({ ...args, apiBase: `http://127.0.0.1:${server.address().port}`, timeoutMs: 100, onDiagnostic: r => records.push(r) });
    assert.deepEqual(result, unavailable);assert.equal(count, 1);assert.equal(records.length, 1);
    assert.equal(records[0].stage, stage === 'headers' ? 'request' : 'response_body');
    assert.equal(records[0].causeClass, 'deadline_exceeded');
    await new Promise(resolve => setTimeout(resolve, 30));assert.equal(closed, true);
  });
}

test('default logger writes the safe diagnostic object on the actual transport path', async t => {
  const lines = []; const warn = console.warn;console.warn = (...parts) => lines.push(parts.join(' '));
  t.after(() => { console.warn = warn; });
  assert.deepEqual(await fetchSessionPortfolioSelection({ ...args, fetchImpl: async () => { throw new Error(poison); } }), unavailable);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[open-mcp\] portfolio-selected-read /);
  const record = JSON.parse(lines[0].slice('[open-mcp] portfolio-selected-read '.length));
  assert.equal(record.causeClass, 'transport_error');assert.match(record.attemptRef, uuid);
  assert.equal(lines[0].includes(poison), false);assert.equal(lines[0].includes(sessionId), false);
});
