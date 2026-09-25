import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeDexterPortfolio, portfolioReadRequest, portfolioReadMatchesRequest,
  portfolioHoldingsSource, samePortfolioObservation, accumulatePortfolioRows,
} from '../apps-sdk/ui/src/components/portfolio/portfolio-model.ts';
import { selectedReadFixture, targetReadFixture } from './fixtures/portfolio-selected-read-fixtures.mjs';

// Frozen, authored API wire literals; these do not describe a live account.
const literal = JSON.parse(readFileSync(new URL('./fixtures/portfolio-selected-v3-api.json', import.meta.url), 'utf8'));
const fixture = (name) => structuredClone(literal.valid[name]);
const envelope = ({ portfolio, card }) => ({
  structuredContent: { portfolio_status: 'ready', mode: 'portfolio_ready', user_bound: true, portfolio },
  _meta: { portfolioCard: card },
});
const model = (value) => normalizeDexterPortfolio(envelope(value));
const selected = (value) => {
  const parsed = model(value);
  assert.equal(parsed.state, 'selected');
  return parsed;
};

for (const name of Object.keys(literal.valid)) {
  test(`widget accepts exact v3 literal ${name} with its card`, () => {
    const value = fixture(name);
    const result = selected(value);
    assert.equal(result.read.snapshotId, value.portfolio.snapshotId);
    assert.equal(result.read.observedAt, value.portfolio.observedAt);
    assert.equal(result.read.expiresAt, value.portfolio.expiresAt);
    assert.equal(result.read.source.kind, value.portfolio.source.kind);
  });
}

test('zero, unknown targets and identity-unavailable prices remain distinct', () => {
  const empty = selected(fixture('empty_holdings'));
  assert.equal(empty.summary.value, '$0');
  assert.equal(empty.read.source.portfolioValueUsd, '0');
  assert.equal(empty.read.source.pricedValueUsd, '0');
  const targets = selected(fixture('standalone_unavailable_targets'));
  assert.equal(targets.summary, null);
  assert.equal(portfolioHoldingsSource(targets.read), null);
  assert.equal(targets.read.source.targetCount, null);
  for (const name of ['retired_priced_detail', 'identity_unavailable_priced_detail']) {
    const value = selected(fixture(name));
    assert.equal(value.summary.value, '$100');
    assert.equal(value.read.source.portfolioValueUsd, '100');
    assert.equal(value.read.source.pricedValueUsd, '100');
    assert.equal(value.read.richHoldings[0].valueUsd, '100');
    for (const key of ['approvalStatus', 'availableActions', 'capabilities']) assert.equal(Object.hasOwn(value.read.richHoldings[0], key), false);
  }
  assert.equal(selected(fixture('retired_priced_detail')).read.holdings[0].identityStatus, 'retired');
});

test('v3 continuation and discovery explicitly select their own snapshot kinds', () => {
  const holding = selected(fixture('native_summary')).read;
  assert.deepEqual(portfolioReadRequest(holding, 'holdings'), { network: 'solana-mainnet', snapshotId: holding.snapshotId, readVersion: 3, view: 'holdings' });
  assert.deepEqual(portfolioReadRequest(holding, 'detail', holding.holdings[0]), {
    network: 'solana-mainnet', snapshotId: holding.snapshotId, readVersion: 3, view: 'detail', mint: 'native:SOL',
  });
  const request = portfolioReadRequest(holding, 'targets');
  assert.deepEqual(request, { readVersion: 3, network: 'solana-mainnet', view: 'targets', holdingSnapshotId: holding.snapshotId });
  const targets = selected(fixture('linked_empty_targets')).read;
  assert.equal(portfolioReadMatchesRequest(holding, targets, request), true);
  assert.equal(samePortfolioObservation(holding, targets), false);
  assert.equal(accumulatePortfolioRows(accumulatePortfolioRows(null, holding), targets), null);
  assert.deepEqual(portfolioReadRequest(targets, 'next'), {
    network: 'solana-mainnet', snapshotId: targets.snapshotId, readVersion: 3, cursor: null,
  });
  assert.equal(portfolioReadMatchesRequest(holding, targets, { ...request, readVersion: 2 }), false);
  for (const changed of [
    { ...targets, walletAddress: 'So11111111111111111111111111111111111111112' },
    { ...targets, snapshotId: holding.snapshotId },
    { ...targets, source: { ...targets.source, holdingSnapshotId: 'different-parent' } },
  ]) assert.equal(portfolioReadMatchesRequest(holding, changed, request), false);
});

test('target continuation survives its parent expiry and uses its own observation', () => {
  const api = fixture('linked_empty_targets');
  const legacyTargets = targetReadFixture();
  api.portfolio.targets = legacyTargets.portfolio.targets;
  api.card.approvedActionTargets = legacyTargets.card.approvedActionTargets;
  api.portfolio.observedAt = '2026-09-24T00:04:00.000Z';
  api.portfolio.expiresAt = '2026-09-24T00:09:00.000Z';
  api.portfolio.source.targetCount = 2;
  Object.assign(api.portfolio.selection, { limit: 1, matchedCount: 2, returnedCount: 1, omittedCount: 1, match: 'matched', nextCursor: 'targets-page-2' });
  const first = selected(api).read;
  const next = structuredClone(first);
  Object.assign(next.selection, { offset: 1, nextCursor: null });
  // Request binding does not mistake the linked holdings expiry for this expiry.
  const request = portfolioReadRequest(first, 'next');
  assert.equal(portfolioReadMatchesRequest(first, next, request), true);
  assert.equal(request.holdingSnapshotId, undefined);
  assert.equal(request.snapshotId, first.snapshotId);
  assert.equal(portfolioReadMatchesRequest(first, { ...next, expiresAt: '2026-09-24T00:10:00.000Z' }, request), false);
});

test('standalone target return explicitly requests a new holdings observation', () => {
  const targets = selected(fixture('standalone_unavailable_targets')).read;
  const request = portfolioReadRequest(targets, 'summary');
  assert.deepEqual(request, { readVersion: 3, network: 'solana-mainnet', view: 'summary' });
  const holdings = selected(fixture('native_summary')).read;
  assert.equal(portfolioReadMatchesRequest(targets, holdings, request), true);
  assert.equal(portfolioReadMatchesRequest(targets, { ...holdings, snapshotId: targets.snapshotId }, request), false);
});

test('v2 card and unversioned saved-handle requests retain their legacy branch', () => {
  const read = selected(selectedReadFixture()).read;
  assert.equal(read.contractVersion, 'opendexter.portfolio.v2');
  assert.deepEqual(portfolioReadRequest(read, 'holdings'), { network: read.network, snapshotId: read.snapshotId, view: 'holdings' });
  const v3 = selected(fixture('native_summary')).read;
  assert.equal(samePortfolioObservation(read, v3), false);
  assert.equal(portfolioReadMatchesRequest(read, v3, portfolioReadRequest(read, 'holdings')), false);
});

const invalid = [
  ['version relabel', 'native_summary', (v) => { v.portfolio.contractVersion = 'opendexter.portfolio.v2'; }],
  ['legacy source in v3', 'native_summary', (v) => { v.portfolio.sourceSummary = v.portfolio.source; }],
  ['legacy approval in v3', 'native_summary', (v) => { v.card.holdings[0].approvalStatus = 'approved'; }],
  ['synthetic empty actions', 'native_summary', (v) => { v.card.holdings[0].availableActions = []; }],
  ['fabricated denied state', 'native_summary', (v) => { v.portfolio.source.tradingAvailability.state = 'denied'; }],
  ['card source mismatch', 'native_summary', (v) => { v.card.sourceKind = 'action_targets'; }],
  ['card identity mismatch', 'native_summary', (v) => { v.card.holdings[0].identity = { state: 'unreviewed', source: 'none' }; }],
  ['card value mismatch', 'native_summary', (v) => { v.card.holdings[0].valueUsd = '101'; }],
  ['identity digest mismatch', 'retired_priced_detail', (v) => { v.card.holdings[0].identity.material.name = 'Changed'; }],
  ['unfiltered count mismatch', 'native_summary', (v) => { v.portfolio.selection.matchedCount = 0; }],
  ['missing detail selector', 'retired_priced_detail', (v) => { v.portfolio.selection.query = null; v.portfolio.selection.mint = null; }],
  ['wrong detail mint', 'retired_priced_detail', (v) => { v.portfolio.selection.mint = 'So11111111111111111111111111111111111111112'; }],
  ['wrong detail query', 'retired_priced_detail', (v) => { v.portfolio.selection.mint = null; v.portfolio.selection.query = 'unrelated'; }],
  ['unknown targets treated as zero', 'standalone_unavailable_targets', (v) => { v.portfolio.selection.matchedCount = 0; }],
  ['same parent and target id', 'linked_empty_targets', (v) => { v.portfolio.source.holdingSnapshotId = v.portfolio.snapshotId; }],
  ['noncanonical wallet', 'native_summary', (v) => { v.portfolio.walletAddress = '1'.repeat(33); }],
  ['noncanonical selected account', 'retired_priced_detail', (v) => { v.portfolio.selection.tokenAccount = '1'.repeat(33); }],
  ['explicit null rich symbol', 'native_summary', (v) => { v.card.holdings[0].symbol = null; }],
  ['explicit null rich name', 'native_summary', (v) => { v.card.holdings[0].name = null; }],
  ['identity coverage mismatch', 'native_summary', (v) => { v.portfolio.source.identityCoverage = { recognized: 0, unreviewed: 1, unavailable: 0 }; }],
  ['unknown contract version', 'native_summary', (v) => { v.portfolio.contractVersion = 'opendexter.portfolio.v4'; }],
];
for (const [label, name, change] of invalid) {
  test(`v3 widget rejects ${label}`, () => {
    const value = fixture(name); change(value);
    assert.equal(model(value).state, 'invalid');
  });
}

test('a continuation must contain progress and a detail card must preserve exact optional facts', () => {
  const page = fixture('native_summary');
  Object.assign(page.portfolio.selection, { view: 'holdings', limit: 1, returnedCount: 0, omittedCount: 1, nextCursor: 'next' });
  page.portfolio.holdings = [];
  page.card.holdings = [];
  assert.equal(model(page).state, 'invalid');
  const detail = fixture('identity_unavailable_priced_detail');
  delete detail.portfolio.holdings[0].metadataObservedAt;
  detail.card.holdings[0].metadataObservedAt = null;
  assert.equal(model(detail).state, 'invalid');
});

test('scaled holdings and missing price keep strict amount and observation semantics', () => {
  for (const mutate of [
    (h) => { h.amountModel = 'scaled-ui-amount'; h.displayMultiplier = '0'; },
    (h) => { h.amountModel = 'scaled-ui-amount'; h.displayMultiplier = '1'; h.tokenProgram = 'spl-token'; },
    (h) => { h.priceUsd = null; h.valueUsd = null; h.priceObservedAt = null; h.priceSource = null; h.priceBlockId = null; h.change24hPercent = '1'; },
  ]) {
    const value = fixture('identity_unavailable_priced_detail');
    mutate(value.portfolio.holdings[0]); mutate(value.card.holdings[0]);
    assert.equal(model(value).state, 'invalid');
  }
});

test('a missing optional name remains missing and a saved expired observation is readable', () => {
  const value = fixture('identity_unavailable_priced_detail');
  for (const holding of [value.portfolio.holdings[0], value.card.holdings[0]]) { delete holding.name; delete holding.symbol; }
  const result = selected(value);
  assert.equal(result.read.richHoldings[0].name, null);
  assert.equal(result.read.richHoldings[0].symbol, null);
  assert.equal(result.read.expiresAt, value.portfolio.expiresAt);
  assert.equal(result.read.richHoldings[0].valueUsd, '100');
});

test('summary seeds can be retained while actual repeated pages remain rejected', () => {
  const summary = selected(fixture('native_summary')).read;
  const page = structuredClone(summary);
  Object.assign(page.selection, { view: 'holdings', limit: 32 });
  const first = accumulatePortfolioRows(null, summary);
  const loaded = accumulatePortfolioRows(first, page);
  assert.equal(loaded.holdings.length, 1);
  assert.equal(loaded.holdings[0].rich.identity.state, 'native');
  assert.deepEqual(loaded.read.source, summary.source);
  assert.equal(accumulatePortfolioRows(loaded, page), null);
});

function timestampFixture() {
  const value = fixture('native_summary');
  const at = '2026-09-24T00:00:00.1234567890Z';
  value.portfolio.observedAt = at;
  value.portfolio.expiresAt = '2026-09-24T00:05:00.1234567890Z';
  const holding = value.card.holdings[0];
  holding.priceObservedAt = at;
  holding.metadataObservedAt = at;
  holding.marketContext = { source: 'jupiter-tokens-v2', mint: 'So11111111111111111111111111111111111111112',
    observedAt: at, liquidityUsd: null, holderCount: null, activity24h: { traderCount: null } };
  return value;
}

test('v3 preserves exact ten-digit timestamps across observation, expiry and rich data', () => {
  const value = timestampFixture();
  const parsed = selected(value);
  assert.equal(parsed.read.observedAt, value.portfolio.observedAt);
  assert.equal(parsed.read.expiresAt, value.portfolio.expiresAt);
  for (const field of ['priceObservedAt', 'metadataObservedAt']) {
    assert.equal(parsed.read.richHoldings[0][field], value.card.holdings[0][field]);
  }
  assert.equal(parsed.read.richHoldings[0].marketContext.observedAt, value.card.holdings[0].marketContext.observedAt);
});

const timestampPaths = [
  ['observation', (v, at) => { v.portfolio.observedAt = at; }],
  ['expiry', (v, at) => { v.portfolio.expiresAt = at; }],
  ['price', (v, at) => { v.card.holdings[0].priceObservedAt = at; }],
  ['metadata', (v, at) => { v.card.holdings[0].metadataObservedAt = at; }],
  ['market', (v, at) => { v.card.holdings[0].marketContext.observedAt = at; }],
];
for (const [name, change] of timestampPaths) {
  for (const invalidAt of ['2026-09-24T00:00:00.123456789012345678901Z', '2026-09-24T99:00:00Z', '2026-09-24T00:00:00+00:00']) {
    test(`v3 rejects invalid ${name} timestamp ${invalidAt}`, () => {
      const value = timestampFixture(); change(value, invalidAt);
      assert.equal(model(value).state, 'invalid');
    });
  }
}

test('legacy v2 timestamp rules remain unchanged', () => {
  const value = selectedReadFixture();
  value.portfolio.observedAt = '2026-07-25T10:30:00.1234567890Z';
  assert.equal(model(value).state, 'invalid');
});
