import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  fetchSessionPortfolio,
  modelSafePortfolioSnapshot,
  SESSION_PORTFOLIO_SIGNATURE_PURPOSE,
} from '../lib/session-portfolio.mjs';
import { WALLET_ADDRESS, completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';
import { approvedActionTarget } from './fixtures/approved-action-target-fixtures.mjs';

const SESSION_ID = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const SECRET = 'synthetic-http-portfolio-test-secret-only';

async function localServer(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('normal portfolio fetch accepts and normalizes a complete HTTP response delayed beyond 2.5s', { timeout: 10_000 }, async (t) => {
  const snapshot = { ...completePortfolio(), approvedActionTargets: [approvedActionTarget()] };
  let request;
  let responseTimer;
  const apiBase = await localServer(t, (req, res) => {
    request = { url: req.url, headers: req.headers };
    responseTimer = setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, portfolio: snapshot }));
    }, 3_000);
  });
  t.after(() => clearTimeout(responseTimer));
  const started = performance.now();
  // Use the normal deadline and native fetch, without either injectable override.
  const result = await fetchSessionPortfolio({ apiBase, sessionId: SESSION_ID,
    expectedWalletAddress: WALLET_ADDRESS, secret: SECRET });
  assert.ok(performance.now() - started >= 2_900);
  assert.deepEqual(result, snapshot);
  const projected = modelSafePortfolioSnapshot(result);
  assert.ok(projected);
  assert.deepEqual(projected.approvedActionTargets, snapshot.approvedActionTargets);
  assert.equal(projected.holdings.length, snapshot.holdings.length);
  assert.equal(request.url, `/api/passkey-anon/mcp-portfolio/${SESSION_ID}`);
  assert.equal(request.headers['x-internal-signature'], createHmac('sha256', SECRET)
    .update(`${request.headers['x-internal-timestamp']}.${SESSION_ID}.${SESSION_PORTFOLIO_SIGNATURE_PURPOSE}`)
    .digest('hex'));
});

for (const stage of ['headers', 'body']) {
  test(`portfolio fetch aborts a stalled HTTP ${stage} read at its finite deadline`, { timeout: 5_000 }, async (t) => {
    let responseClosed = false;
    const apiBase = await localServer(t, (_req, res) => {
      res.on('close', () => { responseClosed = true; });
      if (stage === 'body') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"ok":true,"portfolio":');
      }
    });
    const started = performance.now();
    const result = await fetchSessionPortfolio({ apiBase, sessionId: SESSION_ID,
      expectedWalletAddress: WALLET_ADDRESS, secret: SECRET, timeoutMs: 150 });
    assert.equal(result, null);
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 100 && elapsed < 2_000, `deadline elapsed ${elapsed}ms`);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(responseClosed, true, 'the aborted client closes its HTTP response');
  });
}
