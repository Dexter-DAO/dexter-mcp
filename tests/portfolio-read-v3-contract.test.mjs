import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTFOLIO_READ_SCHEMAS, PORTFOLIO_READ_V3_SCHEMAS } from '../lib/open-tool-contracts.mjs';
import {
  canonicalPortfolioRegistryJson, compactPortfolioHoldingV3, portfolioHoldingIdentityV3Schema,
  portfolioHoldingV3IsValid, portfolioRegistryMaterialV3Schema, portfolioSourceV3Schema,
  isPortfolioObservedAtV3,
} from '../lib/portfolio-read-v3-contract.mjs';
import { compactPortfolioTarget } from '../lib/portfolio-read-contract.mjs';
import { approvedActionTarget } from './fixtures/approved-action-target-fixtures.mjs';
import { detailReadFixture, targetReadFixture } from './fixtures/portfolio-selected-read-fixtures.mjs';

const fixtureBytes = readFileSync(new URL('./fixtures/portfolio-selected-v3-api.json', import.meta.url));
const fixtures = JSON.parse(fixtureBytes);
const schemas = PORTFOLIO_READ_V3_SCHEMAS;
const clone = (name) => structuredClone(fixtures.valid[name]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const digestMaterial = (material) => {
  const { registryIdentityDigest: ignored, ...preimage } = material;
  return hash(canonicalPortfolioRegistryJson(preimage));
};
const rich = () => clone('identity_unavailable_priced_detail').card.holdings[0];
const refused = (value) => assert.equal(schemas.response.safeParse(value).success, false);

test('the six API literal observations retain their frozen bytes', () => {
  assert.equal(hash(fixtureBytes), '88018dfabaabc9d14e52a0d1e04fe8d25dbfb2dc02a2a88a06fca66244d96438');
  assert.equal(Object.keys(fixtures.valid).length, 6);
  assert.equal(schemas.response, schemas.envelope);
});
test('v3 timestamps preserve the API fractional precision and strict UTC length limits', () => {
  const precise = '2026-09-24T00:00:00.1234567890Z';
  assert.equal(isPortfolioObservedAtV3(precise), true);
  assert.equal(isPortfolioObservedAtV3('2026-09-24T00:00:00.' + '1'.repeat(19) + 'Z'), true);
  for (const invalid of [
    '2026-09-24T00:00:00.' + '1'.repeat(20) + 'Z',
    '2026-09-24T00:00:00+00:00', '2026-13-24T00:00:00Z', 'not-a-date', null, 0,
  ]) assert.equal(isPortfolioObservedAtV3(invalid), false);
  const wire = clone('identity_unavailable_priced_detail');
  wire.portfolio.observedAt = precise;
  for (const holding of [wire.portfolio.holdings[0], wire.card.holdings[0]]) {
    holding.priceObservedAt = precise; holding.metadataObservedAt = precise;
  }
  assert.deepEqual(schemas.response.parse(wire), wire);
});
for (const [name, literal] of Object.entries(fixtures.valid)) {
  test(`accepts the API-authored ${name} model and card without changing their data`, () => {
    assert.deepEqual(schemas.response.parse(literal), literal);
    assert.deepEqual(schemas.portfolio.parse(literal.portfolio), literal.portfolio);
    assert.deepEqual(schemas.card.parse(literal.card), literal.card);
  });
}

test('registry digest matches the literal ordinal canonical JSON preimage', () => {
  const { preimage, sha256 } = fixtures.canonicalRegistryIdentity;
  const material = clone('retired_priced_detail').card.holdings[0].identity.material;
  const { registryIdentityDigest, ...fields } = material;
  assert.equal(canonicalPortfolioRegistryJson(fields), preimage);
  assert.equal(hash(preimage), sha256);
  assert.equal(registryIdentityDigest, sha256);
  assert.equal(portfolioRegistryMaterialV3Schema.safeParse(material).success, true);
  const reordered = Object.fromEntries(Object.entries(material).reverse());
  assert.equal(portfolioRegistryMaterialV3Schema.safeParse(reordered).success, true);
});

test('registry facts cannot be substituted while retaining their digest', () => {
  const mutations = [
    (m) => { m.name = 'Changed'; }, (m) => { m.assetId = 'changed'; },
    (m) => { m.mint = '11111111111111111111111111111111'; },
    (m) => { m.tokenProgram = 'spl-token'; }, (m) => { m.decimals = 9; },
    (m) => { m.providerName = 'Other'; }, (m) => { m.registryIdentityDigest = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const material = clone('retired_priced_detail').card.holdings[0].identity.material;
    mutate(material);
    assert.equal(portfolioRegistryMaterialV3Schema.safeParse(material).success, false);
  }
});

test('a recomputed digest does not admit noncanonical stock names or issuer disagreement', () => {
  for (const mutate of [
    (m) => { m.symbol = ' SPCX'; }, (m) => { m.name = 'ＳpaceX'; },
    (m) => { m.providerName = ''; }, (m) => { m.name = 'Space\u0000X'; },
    (m) => { m.issuer = 'Another issuer'; },
  ]) {
    const material = clone('retired_priced_detail').card.holdings[0].identity.material;
    mutate(material); material.registryIdentityDigest = digestMaterial(material);
    assert.equal(portfolioRegistryMaterialV3Schema.safeParse(material).success, false);
  }
});

test('released stock identities need all exact provenance pairs and the released branch', () => {
  for (const key of ['variantId', 'profileDigest', 'releaseId', 'productDigest', 'issuerId', 'onchainDigest']) {
    const identity = clone('retired_priced_detail').card.holdings[0].identity;
    delete identity.provenance[key];
    assert.equal(portfolioHoldingIdentityV3Schema.safeParse(identity).success, false);
  }
  for (const mutate of [
    (v) => { v.provenance.releaseId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'; },
    (v) => { v.provenance.profileDigest = 'A'.repeat(64); },
    (v) => { v.provenance.extra = true; }, (v) => { v.observedAt = 'yesterday'; },
    (v) => { v.source = 'static_registry'; v.registryState = 'not_observed'; delete v.provenance; delete v.observedAt; },
  ]) {
    const identity = clone('retired_priced_detail').card.holdings[0].identity;
    mutate(identity);
    assert.equal(portfolioHoldingIdentityV3Schema.safeParse(identity).success, false);
  }
});

test('non-stock static identities keep the historical preimage without stock-name fields', () => {
  const material = {
    namespace: 'dexter-governed-asset-registry-identity/v1', network: 'solana-mainnet',
    assetId: 'usdc', assetClass: 'cash', symbol: 'USDC', name: 'USD Coin', issuer: null,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenProgram: 'spl-token', decimals: 6,
  };
  material.registryIdentityDigest = digestMaterial(material);
  const identity = { state: 'recognized', source: 'static_registry', registryState: 'not_observed', material };
  assert.equal(portfolioHoldingIdentityV3Schema.safeParse(identity).success, true);
  const holding = { ...rich(), ...Object.fromEntries(['assetId', 'assetClass', 'symbol', 'name', 'mint', 'tokenProgram', 'decimals']
    .map((key) => [key, material[key]])), registryIdentity: null, identity };
  assert.equal(schemas.holding.safeParse(holding).success, true);
  material.providerName = null;
  assert.equal(portfolioHoldingIdentityV3Schema.safeParse(identity).success, false);
});

test('retired and unavailable identity observations preserve independent price and value', () => {
  for (const name of ['retired_priced_detail', 'identity_unavailable_priced_detail']) {
    const value = schemas.response.parse(clone(name));
    assert.equal(value.portfolio.holdings[0].priceUsd, '100');
    assert.equal(value.portfolio.holdings[0].valueUsd, '100');
    assert.equal(value.portfolio.source.portfolioValueUsd, '100');
  }
  const holding = rich(); holding.identity = { state: 'unreviewed', source: 'none' };
  assert.equal(schemas.holding.safeParse(holding).success, true);
  holding.assetId = 'backpack-spcx';
  assert.equal(schemas.holding.safeParse(holding).success, false);
});

test('native identity fixes SOL mint, program, names, amount decimals and absence of registry material', () => {
  const original = clone('native_summary').card.holdings[0];
  for (const mutate of [
    (h) => { h.decimals = 6; }, (h) => { h.mint = 'So11111111111111111111111111111111111111112'; },
    (h) => { h.tokenProgram = 'spl-token'; }, (h) => { h.tokenAccount = '11111111111111111111111111111111'; },
    (h) => { h.symbol = 'wSOL'; }, (h) => { h.assetId = null; },
    (h) => { h.identity = { state: 'unreviewed', source: 'none' }; },
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.equal(schemas.holding.safeParse(value).success, false);
  }
});

test('raw, scaled and unknown amounts use exact decimal arithmetic without Number rounding', () => {
  const h = rich(); h.priceUsd = h.valueUsd = h.priceObservedAt = null; h.priceSource = h.priceBlockId = null;
  h.amountRaw = '18446744073709551615'; h.decimals = 18; h.displayAmount = '18.446744073709551615';
  assert.equal(schemas.holding.safeParse(h).success, true);
  h.amountModel = 'unknown';
  assert.equal(schemas.holding.safeParse(h).success, true);
  h.amountRaw = '1'; h.displayAmount = '0.000000000000000001';
  assert.equal(schemas.holding.safeParse(h).success, true);
  h.tokenProgram = 'token-2022'; h.amountModel = 'scaled-ui-amount'; h.displayMultiplier = '1.25';
  h.displayAmount = '0.00000000000000000125';
  assert.equal(schemas.holding.safeParse(h).success, true);
  h.amountRaw = '0'; h.displayAmount = '0';
  assert.equal(schemas.holding.safeParse(h).success, true);
});

test('invalid raw amounts, scale, multipliers and price arithmetic are refused', () => {
  for (const mutate of [
    (h) => { h.amountRaw = '18446744073709551616'; }, (h) => { h.amountRaw = '-1'; },
    (h) => { h.amountRaw = '01'; }, (h) => { h.amountRaw = 1000000; }, (h) => { h.decimals = 256; },
    (h) => { h.displayAmount = '1.0'; }, (h) => { h.displayMultiplier = '1'; },
    (h) => { h.valueUsd = '99'; },
    (h) => { h.amountModel = 'scaled-ui-amount'; h.tokenProgram = 'spl-token'; h.displayMultiplier = '1'; },
    (h) => { h.amountModel = 'scaled-ui-amount'; h.displayMultiplier = '0'; h.displayAmount = h.valueUsd = '0'; },
  ]) {
    const value = rich(); mutate(value);
    assert.equal(schemas.holding.safeParse(value).success, false);
    assert.equal(portfolioHoldingV3IsValid(value), false);
  }
});

test('unknown price has no value, timestamp, market-change or price provenance, but metadata can remain', () => {
  const h = rich(); h.priceUsd = h.valueUsd = h.priceObservedAt = null; h.priceSource = h.priceBlockId = null;
  h.marketContext = { source: 'jupiter-tokens-v2', mint: h.mint, observedAt: '2026-09-24T00:00:00.000Z',
    liquidityUsd: '0', holderCount: 0, activity24h: { traderCount: null } };
  assert.equal(schemas.holding.safeParse(h).success, true);
  for (const [key, value] of [['valueUsd', '0'], ['priceObservedAt', '2026-09-24T00:00:00.000Z'],
    ['priceSource', 'jupiter-price-v3'], ['priceBlockId', 0], ['change24hPercent', '0']]) {
    assert.equal(schemas.holding.safeParse({ ...h, [key]: value }).success, false);
  }
  h.marketContext.mint = '11111111111111111111111111111111';
  assert.equal(schemas.holding.safeParse(h).success, false);
});

test('strict holdings and sources omit approval and trading capability claims', () => {
  for (const [key, value] of [['availableActions', ['buy']], ['approvalStatus', 'approved'], ['capabilities', []]]) {
    const wire = clone('native_summary'); wire.card.holdings[0][key] = value; refused(wire);
  }
  for (const [key, value] of [['targetCount', 0], ['approvedActionTargets', []]]) {
    const wire = clone('native_summary'); wire.portfolio.source[key] = value; refused(wire);
  }
  const wire = clone('native_summary'); wire.portfolio.source.tradingAvailability.state = 'denied'; refused(wire);
});

test('source totals distinguish complete zero, unknown total and identity coverage', () => {
  const source = clone('empty_holdings').portfolio.source;
  for (const complete of [true, false]) {
    const invalid = { ...source, holdingsComplete: complete, pricedValueUsd: '1', portfolioValueUsd: complete ? '1' : null };
    assert.equal(portfolioSourceV3Schema.safeParse(invalid).success, false);
  }
  assert.equal(portfolioSourceV3Schema.safeParse({ ...source, holdingsComplete: false, omittedHoldings: 3, portfolioValueUsd: null }).success, true);
  for (const mutate of [
    (s) => { s.holdingCount++; }, (s) => { s.identityCoverage.unavailable++; },
    (s) => { s.omittedHoldings = 1; }, (s) => { s.portfolioValueUsd = null; },
  ]) {
    const s = clone('native_summary').portfolio.source; mutate(s);
    assert.equal(portfolioSourceV3Schema.safeParse(s).success, false);
  }
});

test('targets carry only their new observation and optional distinct holdings-parent correlation', () => {
  for (const mutate of [
    (p) => { p.source.holdingSnapshotId = p.snapshotId; }, (p) => { p.contextSlot = 1; },
    (p) => { p.source.holdingCount = 0; }, (p) => { p.source.portfolioValueUsd = '0'; },
  ]) {
    const wire = clone('linked_empty_targets'); mutate(wire.portfolio); refused(wire);
  }
  const unavailable = clone('standalone_unavailable_targets');
  unavailable.portfolio.selection.matchedCount = 0; refused(unavailable);
  const empty = clone('linked_empty_targets'); empty.portfolio.source.holdingSnapshotId = null;
  assert.equal(schemas.response.safeParse(empty).success, true);
});

test('selected row shape, counts, selectors, progress and expiry remain bound', () => {
  const mutations = [
    (p) => { p.selection.mint = null; p.selection.tokenAccount = null; },
    (p) => { p.selection.returnedCount = 0; }, (p) => { p.selection.omittedCount = 1; },
    (p) => { p.selection.nextCursor = 'extra'; }, (p) => { p.selection.offset = 1; },
    (p) => { p.selection.mint = '11111111111111111111111111111111'; },
    (p) => { p.selection.tokenAccount = 'So11111111111111111111111111111111111111112'; },
    (p) => { p.selection.query = 'absent'; p.selection.mint = null; p.selection.tokenAccount = null; },
    (p) => { p.expiresAt = p.observedAt; }, (p) => { p.selection.view = 'holdings'; },
  ];
  for (const mutate of mutations) {
    const wire = clone('retired_priced_detail'); mutate(wire.portfolio); refused(wire);
  }
  const selected = clone('retired_priced_detail');
  selected.portfolio.selection.mint = selected.portfolio.selection.tokenAccount = null;
  selected.portfolio.selection.query = 'spac';
  assert.equal(schemas.response.safeParse(selected).success, true);
  const noProgress = clone('retired_priced_detail');
  noProgress.portfolio.holdings = noProgress.card.holdings = [];
  Object.assign(noProgress.portfolio.selection, { returnedCount: 0, omittedCount: 1, nextCursor: 'next' });
  refused(noProgress);
});

test('summary-to-holdings and continuation preserve full source counts and compact identity', () => {
  const wire = clone('native_summary');
  Object.assign(wire.portfolio.source, { holdingCount: 2, pricedHoldings: 2, pricedValueUsd: '200', portfolioValueUsd: '200',
    identityCoverage: { recognized: 2, unreviewed: 0, unavailable: 0 } });
  Object.assign(wire.portfolio.selection, { view: 'holdings', limit: 1, matchedCount: 2, omittedCount: 1, nextCursor: 'next' });
  assert.equal(schemas.response.safeParse(wire).success, true);
  wire.portfolio.selection.offset = 1; wire.portfolio.selection.nextCursor = null;
  assert.equal(schemas.response.safeParse(wire).success, true);
  wire.portfolio.selection.matchedCount = 1;
  refused(wire);
});

test('card snapshot, kind, order, full detail and projected identity must match the model', () => {
  for (const mutate of [
    (w) => { w.card.snapshotId = 'other'; }, (w) => { w.card.sourceKind = 'action_targets'; },
    (w) => { w.card.holdings = []; }, (w) => { w.portfolio.holdings[0].valueUsd = '99'; },
    (w) => { w.portfolio.holdings[0].identityStatus = 'unreviewed'; },
    (w) => { w.card.holdings[0].amountRaw = '2'; },
  ]) { const wire = clone('native_summary'); mutate(wire); refused(wire); }
  const wire = clone('retired_priced_detail');
  wire.card.holdings[0].identity.provenance.releaseDigest = 'f'.repeat(64);
  refused(wire);
  const coverage = clone('identity_unavailable_priced_detail');
  coverage.portfolio.source.identityCoverage = { recognized: 1, unreviewed: 0, unavailable: 0 };
  refused(coverage);
});

test('compact retired status is derived from the released identity without an availability inference', () => {
  const h = clone('retired_priced_detail').card.holdings[0];
  assert.equal(compactPortfolioHoldingV3(h).identityStatus, 'retired');
  h.identity.registryState = 'approved';
  assert.equal(compactPortfolioHoldingV3(h).identityStatus, 'recognized');
  assert.equal(Object.hasOwn(compactPortfolioHoldingV3(h), 'availableActions'), false);
});

test('target receipt and digest validation is retained through the real factory injection', () => {
  const wire = clone('linked_empty_targets');
  const target = approvedActionTarget();
  wire.card.approvedActionTargets = [target]; wire.portfolio.targets = [compactPortfolioTarget(target)];
  wire.portfolio.source.targetCount = 1;
  Object.assign(wire.portfolio.selection, { matchedCount: 1, returnedCount: 1, omittedCount: 0, match: 'matched' });
  assert.equal(schemas.response.safeParse(wire).success, true);
  wire.card.approvedActionTargets[0].targetDigest = '0'.repeat(64);
  refused(wire);
});

test('v2 detail and target observations keep their exact legacy parser', () => {
  for (const wire of [detailReadFixture(), targetReadFixture()]) {
    assert.deepEqual(PORTFOLIO_READ_SCHEMAS.response.parse(wire), wire);
    refused(wire);
  }
  for (const wire of Object.values(fixtures.valid)) assert.equal(PORTFOLIO_READ_SCHEMAS.response.safeParse(wire).success, false);
});

test('model budget counts UTF-8 bytes rather than characters and never strips identity fields', () => {
  const wire = clone('native_summary');
  wire.portfolio.selection.view = 'holdings'; wire.portfolio.selection.limit = 32;
  const h = rich(); h.symbol = '界'.repeat(32); h.name = '界'.repeat(128);
  const holdings = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(h),
    tokenAccount: i === 0 ? '11111111111111111111111111111111' : '1'.repeat(31) + '123456789ABCDEFGHJKLMN'[i] }));
  wire.card.holdings = holdings;
  wire.portfolio.holdings = holdings.map(compactPortfolioHoldingV3);
  Object.assign(wire.portfolio.source, { holdingCount: 20, pricedHoldings: 20, pricedValueUsd: '2000', portfolioValueUsd: '2000',
    identityCoverage: { recognized: 0, unreviewed: 0, unavailable: 20 } });
  Object.assign(wire.portfolio.selection, { matchedCount: 20, returnedCount: 20, omittedCount: 0 });
  for (const holding of holdings) assert.equal(schemas.holding.safeParse(holding).success, true);
  assert.equal(schemas.portfolio.safeParse(wire.portfolio).success, false);
  assert.equal(wire.card.holdings[0].identity.reason, fixtures.valid.identity_unavailable_priced_detail.card.holdings[0].identity.reason);
});
