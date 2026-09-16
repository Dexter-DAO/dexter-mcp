import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { fetchSessionActivity, signedSessionActivityHeaders } from '../lib/session-activity.mjs';
import { formatActivityAmount, normalizeActivityPage, activityLinkAllowed, activityServiceUrl, activitySubtitle } from '../apps-sdk/ui/src/components/wallet/activityModel.ts';
import { walletOutput, WALLET_ADDRESS } from './fixtures/wallet-portfolio-fixtures.mjs';

const secret = 'test-only-long-purpose-separated-secret';
const sessionId = 'session-fixture';
const options = { apiBase: 'http://127.0.0.1:3032', sessionId, expectedWalletAddress: WALLET_ADDRESS, secret };
const page = () => walletOutput().activityPage;

test('activity binds the session and verified receive address, preserving exact records and pagination', async () => {
  let seen;
  const result = await fetchSessionActivity({ ...options, limit: 25, cursor: 'opaque/+cursor=', fetchImpl: async (url, init) => {
    seen = { url, init };
    return Response.json(page());
  } });
  assert.deepEqual(result, page());
  const url = new URL(seen.url);
  assert.equal(url.pathname, '/api/passkey-anon/mcp-activity/session-fixture');
  assert.equal(url.searchParams.get('cursor'), 'opaque/+cursor=');
  assert.equal(url.searchParams.get('limit'), '25');
  const headers = signedSessionActivityHeaders(sessionId, secret, 1234);
  assert.equal(headers['x-internal-signature'], createHmac('sha256', secret).update('1234.session-fixture.mcp-activity-v4').digest('hex'));
  assert.ok(seen.init.headers['x-internal-signature']);
});

test('failed, malformed, oversized and wallet-mismatched responses remain unavailable', async () => {
  for (const body of [null, { items: [] }, { ...page(), walletAddress: 'another-wallet' }, { ...page(), items: [{ ...page().items[0], amount: { ...page().items[0].amount, atomic: '0.001' } }] }]) {
    assert.equal(await fetchSessionActivity({ ...options, fetchImpl: async () => Response.json(body) }), null);
  }
  assert.equal(await fetchSessionActivity({ ...options, fetchImpl: async () => new Response('unavailable', { status: 503 }) }), null);
  assert.equal(await fetchSessionActivity({ ...options, fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1)) }), null);
  assert.equal(await fetchSessionActivity({ ...options, limit: 101, fetchImpl: async () => { throw new Error('must not call'); } }), null);
});

test('an empty complete page remains distinguishable from read failure or partial coverage', () => {
  const empty = { ...page(), items: [] };
  assert.deepEqual(normalizeActivityPage(empty, WALLET_ADDRESS), empty);
  assert.equal(normalizeActivityPage(null, WALLET_ADDRESS), null);
  assert.equal(normalizeActivityPage(empty, 'another-wallet'), null);
  assert.equal(normalizeActivityPage({ ...empty, coverage: { state: 'partial', sources: [] } }, WALLET_ADDRESS).coverage.state, 'partial');
});

test('exact atomic amounts preserve subcent payments, token quantities and integers above floating-point precision', () => {
  const amount = page().items[0].amount;
  assert.equal(formatActivityAmount(amount), '−0.001 USDC');
  assert.equal(formatActivityAmount({ ...amount, atomic: '1' }), '0.000001 USDC');
  assert.equal(formatActivityAmount({ ...amount, atomic: '9007199254740993', decimals: 0 }), '9,007,199,254,740,993 USDC');
  assert.equal(formatActivityAmount({ ...amount, atomic: '4426', decimals: 6, symbol: 'SPCX' }), '0.004426 SPCX');
  assert.equal(formatActivityAmount(null), 'Amount unavailable');
  assert.equal(formatActivityAmount({ ...amount, atomic: '34815', symbol: 'SPCX', displayAmount: '0.06963' }), '0.06963 SPCX');
  assert.equal(formatActivityAmount({ ...amount, displayAmount: '-9007199254740993.000001' }), '−9,007,199,254,740,993.000001 USDC');
});

test('canonical service metadata and transaction display quantities survive validation', () => {
  const input = page();
  input.items[0].service.publicUrl = 'https://indexter.cash/services/r-fixture';
  input.items[0].service.description = 'Market analysis for the requested symbol.';
  input.items[0].amount.displayAmount = '-0.002';
  const normalized = normalizeActivityPage(input, WALLET_ADDRESS);
  assert.equal(normalized.items[0].service.description, input.items[0].service.description);
  assert.equal(normalized.items[0].amount.displayAmount, '-0.002');
  input.items[0].amount.displayAmount = '1e-6';
  assert.equal(normalizeActivityPage(input, WALLET_ADDRESS), null);
});

test('service identity opens its Indexter page and never a paid endpoint', () => {
  const item = page().items[0];
  assert.equal(activityServiceUrl(item), null);
  for (const publicUrl of ['https://syraa.fun/paid', 'https://indexter.cash.evil.test/services/r-fixture', 'https://indexter.cash/providers/syraa']) {
    assert.equal(activityServiceUrl({ ...item, service: { ...item.service, publicUrl } }), null);
  }
  assert.equal(activityServiceUrl({ ...item, service: { ...item.service, publicUrl: 'https://indexter.cash/services/r-fixture' } }), 'https://indexter.cash/services/r-fixture');
});

test('subtitles keep useful exceptions and omit routine finality and internal actor addresses', () => {
  const item = page().items[0];
  assert.equal(activitySubtitle(item), 'Market research · Research agent');
  assert.equal(activitySubtitle({ ...item, status: 'refused', actor: { ...item.actor, name: '127.0.0.1' } }), 'Market research · Agent · Declined');
  assert.equal(activitySubtitle({ ...item, actor: { ...item.actor, name: 'grokbot://mcp' } }), 'Market research · Agent');
});

test('all unified event kinds survive and unsafe receipt links cannot navigate', () => {
  for (const kind of ['payment', 'deposit', 'withdrawal', 'yield_started', 'yield_stopped', 'trade', 'send', 'refund']) {
    const input = page(); input.items[0].kind = kind;
    assert.equal(normalizeActivityPage(input, WALLET_ADDRESS).items[0].kind, kind);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'http://example.com']) assert.equal(activityLinkAllowed(url), false);
  assert.equal(activityLinkAllowed('https://solscan.io/tx/example'), true);
});
