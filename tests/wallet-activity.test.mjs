import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { fetchSessionActivity, signedSessionActivityHeaders } from '../lib/session-activity.mjs';
import { formatActivityAmount, formatActivityValue, activityCashDirection, activityWithPortfolioArtwork, normalizeActivityPage, activityLinkAllowed, activityServiceUrl, activitySubtitle, activityReceiptFacts, activityTitle } from '../apps-sdk/ui/src/components/wallet/activityModel.ts';
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

test('cash rounds cents with exact decimal math and keeps significant subcent digits', () => {
  const amount = page().items[0].amount;
  assert.equal(formatActivityValue(amount), '−$0.001');
  assert.equal(activityCashDirection(amount), 'outgoing');
  assert.equal(formatActivityValue({ ...amount, atomic: '1' }), '+$0.000001');
  assert.equal(activityCashDirection({ ...amount, atomic: '1' }), 'incoming');
  assert.equal(formatActivityValue({ ...amount, atomic: '0' }), '$0.00');
  assert.equal(formatActivityValue({ ...amount, atomic: '10000000' }), '+$10.00');
  assert.equal(formatActivityValue({ ...amount, atomic: '-50000' }), '−$0.05');
  assert.equal(activityCashDirection({ ...amount, atomic: '0' }), null);
  assert.equal(formatActivityValue({ ...amount, displayAmount: '-9007199254740993.000001' }), '−$9,007,199,254,740,993.00');
  assert.equal(formatActivityValue({ ...amount, atomic: '-16991215' }), '−$16.99');
  assert.equal(formatActivityValue({ ...amount, atomic: '-16995000' }), '−$17.00');
  assert.equal(formatActivityValue({ ...amount, atomic: '-1234' }), '−$0.0012');
  assert.equal(formatActivityValue({ ...amount, atomic: '-9999' }), '−$0.01');
  assert.equal(formatActivityValue({ ...amount, displayAmount: '-0.00000123' }), '−$0.0000012');
  assert.equal(formatActivityValue({ ...amount, atomic: '34815', symbol: 'SPCX' }), '0.034815 SPCX');
  assert.equal(activityCashDirection({ ...amount, symbol: 'SPCX' }), null);
});

test('activity artwork follows the same wallet and exact mint in the portfolio', () => {
  const item = { ...page().items[0], service: null, asset: { mint: 'stock-mint', logoUrl: 'https://example.com/catalog.png' } };
  const portfolio = { walletAddress: WALLET_ADDRESS, holdings: [{ mint: 'stock-mint', graphics: { canonicalImageUrl: 'https://example.com/canonical.svg' } }] };
  assert.equal(activityWithPortfolioArtwork(item, portfolio, WALLET_ADDRESS).asset.logoUrl, 'https://example.com/canonical.svg');
  assert.equal(activityWithPortfolioArtwork(item, portfolio, 'different-wallet'), item);
  assert.equal(activityWithPortfolioArtwork({ ...item, asset: { ...item.asset, mint: 'other-mint' } }, portfolio, WALLET_ADDRESS).asset.logoUrl, item.asset.logoUrl);
  const serviceItem = page().items[0];
  assert.equal(activityWithPortfolioArtwork(serviceItem, portfolio, WALLET_ADDRESS), serviceItem);
  portfolio.holdings[0].graphics.canonicalImageUrl = 'javascript:alert(1)';
  assert.equal(activityWithPortfolioArtwork(item, portfolio, WALLET_ADDRESS), item);
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
  assert.equal(activitySubtitle({ ...item, subtitle: 'CrossPay' }), 'Research agent');
});

test('receipt facts preserve delivery and funding while removing repeated identity fields', () => {
  const item = page().items[0];
  item.details = [{ label: 'Asset', value: 'SpaceX' }, { label: 'Provider', value: 'Backpack Securities' }, { label: 'Seller response', value: '200' }, { label: 'Delivery', value: 'Response received' }, { label: 'Payment', value: 'Financed with credit' }];
  assert.deepEqual(activityReceiptFacts(item), ['Financed with credit']);
  item.details.find((detail) => detail.label === 'Seller response').value = '503';
  item.details.find((detail) => detail.label === 'Delivery').value = 'Response unavailable';
  assert.deepEqual(activityReceiptFacts(item), ['Financed with credit', 'Response unavailable (HTTP 503)']);
});

test('transfer titles avoid repeating their amount symbol and proposals stay distinct from approval', () => {
  const item = page().items[0];
  assert.equal(activityTitle({ ...item, kind: 'deposit' }), 'Received');
  assert.equal(activityTitle({ ...item, kind: 'withdrawal' }), 'Sent');
  assert.match(activitySubtitle({ ...item, status: 'proposed' }), /Proposed$/);
});

test('all unified event kinds survive and unsafe receipt links cannot navigate', () => {
  for (const kind of ['payment', 'deposit', 'withdrawal', 'yield_started', 'yield_stopped', 'trade', 'send', 'refund']) {
    const input = page(); input.items[0].kind = kind;
    assert.equal(normalizeActivityPage(input, WALLET_ADDRESS).items[0].kind, kind);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'http://example.com']) assert.equal(activityLinkAllowed(url), false);
  assert.equal(activityLinkAllowed('https://solscan.io/tx/example'), true);
});
