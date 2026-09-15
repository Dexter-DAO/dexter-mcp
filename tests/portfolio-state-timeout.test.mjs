import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

test('portfolio state tolerates a slow fallback without adding money reads or extending payment lookups', async (t) => {
  const priorSecret = process.env.INTERNAL_DEXTERCARD_HMAC_SECRET;
  const priorOrigin = process.env.DEXTER_API_URL;
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(new URL(req.url, 'http://localhost'));
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready', vault: { vaultPda: 'test-vault' } }));
    }, 3250);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (priorSecret === undefined) delete process.env.INTERNAL_DEXTERCARD_HMAC_SECRET;
    else process.env.INTERNAL_DEXTERCARD_HMAC_SECRET = priorSecret;
    if (priorOrigin === undefined) delete process.env.DEXTER_API_URL;
    else process.env.DEXTER_API_URL = priorOrigin;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  process.env.INTERNAL_DEXTERCARD_HMAC_SECRET = 'local-test-secret-with-no-production-authority';
  process.env.DEXTER_API_URL = `http://127.0.0.1:${server.address().port}`;
  const { fetchVaultStateBySession } = await import('../lib/pairing-mint.mjs');
  const [portfolio, wallet] = await Promise.all([
    fetchVaultStateBySession('portfolio-session', { portfolio: true }),
    fetchVaultStateBySession('wallet-session', { money: true }),
    assert.rejects(fetchVaultStateBySession('payment-session'), { name: 'TimeoutError' }),
  ]);
  assert.equal(portfolio.status, 'ready');
  assert.equal(wallet.status, 'ready');
  const bySession = new Map(requests.map((url) => [url.searchParams.get('mcp_session_id'), url]));
  assert.equal(bySession.get('portfolio-session').searchParams.has('money'), false);
  assert.equal(bySession.get('wallet-session').searchParams.get('money'), '1');
  assert.equal(bySession.get('payment-session').searchParams.has('money'), false);
});
