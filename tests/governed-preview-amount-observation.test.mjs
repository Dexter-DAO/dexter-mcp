import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA,
  buildGovernedAssetToolResult,
  governedStockTradeSummarySnapshotDigest,
  governedDetailedBody,
  GOVERNED_PRESENTED_OUTPUT_SCHEMAS,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { presentGovernedAgentResult } from '../lib/governed-agent-presentation.mjs';

const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const USD = JSON.parse(readFileSync(new URL('./fixtures/governed-usd-value-api.json', import.meta.url)));
const RAW = JSON.parse(readFileSync(new URL('./fixtures/governed-raw-preview-api.json', import.meta.url)));
const fields = ['amountModel', 'displayMultiplier', 'amountObservedAtUnixMs', 'amountObservedAtSlot'];

function observation(overrides = {}) {
  return { amountModel: 'raw-decimals', displayMultiplier: '1',
    amountObservedAtUnixMs: 1_785_020_400_000, amountObservedAtSlot: '350000000', ...overrides };
}
function rawFixture(action = 'sell', stock = true) {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  if (!stock) {
    f.prepared.preview = structuredClone(RAW.cases.find(c => c.action === action).preview);
    delete f.prepared.stockRuntime;
    delete f.prepared.business.requestedCompanyQuery;
  }
  const p = f.prepared.preview;
  const mint = p.productIdentity.mint;
  const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  Object.assign(p, { action, inputMint: action === 'buy' ? usdc : mint,
    outputMint: action === 'buy' ? mint : usdc });
  Object.assign(f.prepared.business, { action, assetId: p.assetId, amountAtomic: p.amountAtomic });
  f.input = { operationId: OPERATION_ID, action, amountAtomic: p.amountAtomic,
    ...(stock ? { companyQuery: 'NVIDIA' } : { assetId: p.assetId }) };
  return f;
}
function usdFixture(binding = USD.stock.binding) {
  const f = rawFixture();
  binding = structuredClone(binding);
  f.input = { operationId: OPERATION_ID, action: 'sell', companyQuery: 'NVIDIA',
    valueUsd: binding.requestedValueUsd };
  f.prepared.business.amountAtomic = binding.amountAtomic;
  Object.assign(f.prepared.preview, { amountAtomic: binding.amountAtomic,
    maximumInputAmountAtomic: binding.amountAtomic, requestAmountKind: 'usd-value', usdValue: binding,
    expectedOutputAtomic: '980000', minimumOutputAtomic: '950000', inputMint: binding.mint });
  for (const identity of [f.prepared.preview.productIdentity, f.prepared.preview.stockSelection]) {
    Object.assign(identity, { mint: binding.mint, tokenProgram: binding.tokenProgram, decimals: binding.assetDecimals });
  }
  Object.assign(f.prepared.preview.productIdentity, observation({
    amountModel: binding.amountModel, displayMultiplier: binding.multiplier.value,
    amountObservedAtUnixMs: binding.mintObservedAtUnixMs,
    amountObservedAtSlot: String(binding.mintObservedSlot),
  }));
  return f;
}
function envelope(f) {
  return buildGovernedAssetToolResult(normalizeGovernedAssetResult({ operation: 'prepare',
    input: f.input, body: f.prepared, httpStatus: 200 }));
}
function accepted(f, label = '') {
  const result = envelope(f);
  assert.equal(result.isError, false, label);
  assert.deepEqual(governedDetailedBody(result.structuredContent), f.prepared, label);
  assert.deepEqual(result.structuredContent.presentation, JSON.parse(result.content[0].text));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(result.structuredContent).success, true, label);
  return result;
}
function rejected(f, label = '') {
  const result = envelope(f);
  assert.equal(result.isError, true, label);
  assert.deepEqual(Object.keys(result.structuredContent), ['presentation'], label);
  assert.deepEqual(result.structuredContent.presentation, JSON.parse(result.content[0].text));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(result.structuredContent).success, true, label);
  assert.equal(result._meta['dexter/governedWidgetResult'].code, 'governed_backend_response_invalid', label);
  assert.equal(JSON.parse(result.content[0].text).code, 'governed_backend_response_invalid', label);
}

test('fresh raw stock and token Buy/Sell previews preserve the complete amount observation', () => {
  for (const stock of [true, false]) {
    for (const action of ['buy', 'sell']) {
      for (const meta of [observation(), observation({ amountModel: 'scaled-ui-amount', displayMultiplier: '2.5' }),
        observation({ amountModel: 'unknown', displayMultiplier: null }),
        observation({ amountObservedAtUnixMs: 0, amountObservedAtSlot: '1' })]) {
        const f = rawFixture(action, stock);
        Object.assign(f.prepared.preview.productIdentity, meta);
        accepted(f, `${stock}/${action}/${JSON.stringify(meta)}`);
      }
    }
  }
});

test('legacy saved raw and Dollar previews remain valid with all four fields absent', () => {
  for (const f of [rawFixture('buy'), rawFixture('sell'), rawFixture('buy', false), usdFixture()]) {
    for (const field of fields) delete f.prepared.preview.productIdentity[field];
    accepted(f);
  }
});

test('Apple Buy displays the exact quote-frozen token quantity without changing the execution terms', () => {
  // Public amount observation retained from API 2b5dfb0b, 2026-09-30 08:55 UTC.
  // The operator Prepare was simulated only; these are estimated token units.
  const f = rawFixture('buy');
  const p = f.prepared.preview;
  const apple = { mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8,
    companyName: 'Apple', productName: 'Apple xStock' };
  Object.assign(p.productIdentity, apple, observation({ amountModel: 'scaled-ui-amount',
    displayMultiplier: '1.0032690125398187', amountObservedAtUnixMs: 1790758510998,
    amountObservedAtSlot: '451916758' }), { symbol: 'AAPLx' });
  Object.assign(p.stockSelection, apple, { productSymbol: 'AAPLx', normalizedCompanyQuery: 'apple' });
  Object.assign(p, { symbol: 'AAPLx', amountAtomic: '5000000', maximumInputAmountAtomic: '5000000',
    outputMint: apple.mint, expectedOutputAtomic: '1498781', minimumOutputAtomic: '1491288',
    slippageBps: 50, priceImpactBps: 21, quoteExpiresAtUnixMs: 1790758541951 });
  Object.assign(f.prepared.business, { amountAtomic: '5000000', requestedCompanyQuery: 'apple' });
  Object.assign(f.input, { amountAtomic: '5000000', companyQuery: 'Apple' });
  const original = structuredClone(f.prepared);
  const result = accepted(f);
  const shown = result.structuredContent.presentation.preview;
  assert.deepEqual(shown.expectedOutput, {
    amount: '0.015036805338834420110047', symbol: 'AAPLx', amountAtomic: '1498781',
    mint: apple.mint, decimals: 8, amountModel: 'scaled-ui-amount',
    multiplierObservation: { value: '1.0032690125398187', observedAtUnixMs: 1790758510998,
      observedSlot: 451916758 },
  });
  assert.equal(shown.minimumOutput.amount, '0.014961630391724811494856');
  assert.equal(shown.input.amount, '5');
  assert.equal(shown.input.symbol, 'USDC');
  assert.equal(shown.maximumInput.amount, '5');
  assert.equal(shown.expectedShareQuantity, null);
  assert.equal(shown.shareQuantitySemantics, null);
  assert.equal(shown.slippageBps, 50);
  assert.equal(shown.priceImpactBps, 21);
  assert.deepEqual(f.prepared, original);
  assert.deepEqual(governedDetailedBody(result.structuredContent), original);
  assert.equal(presentGovernedAgentResult(structuredClone(original)).preview.expectedOutput.amount,
    shown.expectedOutput.amount, 'saved quote display does not depend on current time or a fresh mint read');
});

test('raw and scaled Sell inputs retain exact integer arithmetic and their observed precision', () => {
  const cases = [
    { model: 'raw-decimals', multiplier: '1', decimals: 0, raw: '18446744073709551615',
      amount: '18446744073709551615' },
    { model: 'raw-decimals', multiplier: '1', decimals: 18, raw: '18446744073709551615',
      amount: '18.446744073709551615' },
    { model: 'scaled-ui-amount', multiplier: '1.0032690125398187', decimals: 8,
      raw: '18446744073709551615', amount: '185070467114.053344288466487103922005' },
    { model: 'scaled-ui-amount', multiplier: '0.' + '0'.repeat(63) + '1', decimals: 18,
      raw: '18446744073709551615', amount: '0.' + '0'.repeat(62) + '18446744073709551615' },
    { model: 'scaled-ui-amount', multiplier: '2.5', decimals: 6, raw: '4000000', amount: '10' },
  ];
  for (const c of cases) {
    const f = rawFixture('sell');
    Object.assign(f.prepared.preview.productIdentity, observation({ amountModel: c.model,
      displayMultiplier: c.multiplier }), { decimals: c.decimals });
    f.prepared.preview.stockSelection.decimals = c.decimals;
    f.prepared.preview.amountAtomic = c.raw;
    f.prepared.preview.maximumInputAmountAtomic = c.raw;
    f.prepared.business.amountAtomic = c.raw;
    f.input.amountAtomic = c.raw;
    const shown = accepted(f).structuredContent.presentation.preview;
    assert.equal(shown.input.amount, c.amount);
    assert.deepEqual(shown.maximumInput, shown.input);
    assert.equal(shown.expectedOutput.symbol, 'USDC');
    assert.equal(shown.input.multiplierObservation.observedAtUnixMs, 1785020400000);
  }
});

test('zero estimated output formats as zero and only a matching observed product gains display quantity', () => {
  const f = rawFixture('buy');
  Object.assign(f.prepared.preview.productIdentity, observation({ amountModel: 'scaled-ui-amount',
    displayMultiplier: '2.5' }));
  f.prepared.preview.minimumOutputAtomic = '0';
  assert.equal(accepted(f).structuredContent.presentation.preview.minimumOutput.amount, '0');
  f.prepared.preview.outputMint = '11111111111111111111111111111111';
  assert.equal(presentGovernedAgentResult(f.prepared).preview.expectedOutput.displayAmount, null);
});

test('legacy and unknown amount observations preserve raw fallback rather than inventing scaling', () => {
  for (const action of ['buy', 'sell']) {
    for (const meta of [null, observation({ amountModel: 'unknown', displayMultiplier: null })]) {
      const f = rawFixture(action);
      if (meta) Object.assign(f.prepared.preview.productIdentity, meta);
      const shown = accepted(f).structuredContent.presentation.preview;
      const amount = action === 'buy' ? shown.expectedOutput : shown.input;
      assert.equal(amount.displayAmount, null);
      assert.equal(amount.amount, undefined);
    }
  }
});

test('direct presentation of malformed or incomplete amount metadata safely retains raw fallback', () => {
  for (const override of [
    { amountModel: 'unknown' }, { displayMultiplier: 'NaN' }, { displayMultiplier: '0' },
    { amountObservedAtSlot: '9007199254740992' }, { amountObservedAtUnixMs: undefined },
    { amountModel: 'raw-decimals', displayMultiplier: '2' }, { decimals: -1 },
    { tokenProgram: 'spl-token' },
  ]) {
    const f = rawFixture('buy');
    Object.assign(f.prepared.preview.productIdentity, observation({ amountModel: 'scaled-ui-amount',
      displayMultiplier: '2.5' }), override);
    assert.equal(presentGovernedAgentResult(f.prepared).preview.expectedOutput.displayAmount, null);
  }
});

test('Dollar preview observation agrees with each API-produced binding at the same frozen observation', () => {
  for (const { name, binding } of USD.cases) accepted(usdFixture(binding), name);
  const f = usdFixture();
  for (const [field, value] of [['displayMultiplier', '3'], ['amountModel', 'raw-decimals'],
    ['amountObservedAtUnixMs', f.prepared.preview.usdValue.mintObservedAtUnixMs + 1],
    ['amountObservedAtSlot', String(f.prepared.preview.usdValue.mintObservedSlot + 1)]]) {
    const changed = structuredClone(f);
    changed.prepared.preview.productIdentity[field] = value;
    rejected(changed, field);
  }
});

test('Dollar preview rejects observation substitutions instead of borrowing a different multiplier', () => {
  const f = usdFixture();
  Object.assign(f.prepared.preview.productIdentity, {
    displayMultiplier: '3', amountObservedAtUnixMs: 0, amountObservedAtSlot: '1',
  });
  rejected(f);
  assert.equal(f.prepared.preview.usdValue.multiplier.value, '2');
});

test('preview observations reject partial bundles, invalid types and inconsistent model semantics', () => {
  const mutations = [
    ...fields.map(field => [ `missing ${field}`, p => { delete p[field]; } ]),
    ...fields.map(field => [ `undefined ${field}`, p => { p[field] = undefined; } ]),
    ['null model', p => { p.amountModel = null; }],
    ['unknown model', p => { p.amountModel = 'token'; }],
    ['raw null', p => { p.displayMultiplier = null; }],
    ['raw two', p => { p.displayMultiplier = '2'; }],
    ['unknown with multiplier', p => { p.amountModel = 'unknown'; }],
    ['scaled SPL', p => { p.amountModel = 'scaled-ui-amount'; p.tokenProgram = 'spl-token'; }],
    ...['0', '-1', '01', '1.0', '1e2', '.1', '0.00', '0.' + '0'.repeat(64) + '1', '1'.repeat(129)]
      .map(value => [`multiplier ${value}`, p => { p.amountModel = 'scaled-ui-amount'; p.displayMultiplier = value; }]),
    ...[-1, 0.1, Number.MAX_SAFE_INTEGER + 1, null, '1'].map(value =>
      [`time ${value}`, p => { p.amountObservedAtUnixMs = value; }]),
    ...['0', '-1', '01', '1.1', '1e2', String(Number.MAX_SAFE_INTEGER + 1), null, 1].map(value =>
      [`slot ${value}`, p => { p.amountObservedAtSlot = value; }]),
    ['unrelated field', p => { p.additionalAmount = '1'; }],
    ['changed mint', p => { p.mint = '11111111111111111111111111111111'; }],
    ['changed asset', p => { p.assetId = 'different-asset'; }],
  ];
  for (const [name, mutate] of mutations) {
    const f = rawFixture();
    Object.assign(f.prepared.preview.productIdentity, observation());
    mutate(f.prepared.preview.productIdentity);
    rejected(f, name);
  }
});

test('canonical multiplier bounds match the producer rather than stock share input precision', () => {
  for (const multiplier of ['0.' + '0'.repeat(63) + '1', '1'.repeat(128), '1.25']) {
    const f = rawFixture();
    Object.assign(f.prepared.preview.productIdentity, observation({ amountModel: 'scaled-ui-amount',
      displayMultiplier: multiplier }));
    accepted(f, multiplier);
  }
});

test('share Buy conversion agrees with preview metadata for its frozen slot', () => {
  const f = dynamicStockV2Fixture('tesla', OPERATION_ID);
  Object.assign(f.prepared.preview.productIdentity, observation());
  accepted(f);
  const changed = structuredClone(f);
  Object.assign(changed.prepared.preview.productIdentity, { amountModel: 'scaled-ui-amount', displayMultiplier: '2' });
  rejected(changed, 'same slot contradicts identity conversion');
  changed.prepared.preview.productIdentity.amountObservedAtSlot = '350000001';
  rejected(changed, 'different slot cannot replace the frozen conversion observation');
  for (const [name, mutate] of [
    ['decimals', p => { p.shareQuantityConversion.rawOutputDecimals = 7; }],
    ['slot', p => { p.productIdentity.amountObservedAtSlot = '350000001'; }],
    ['future effective time', p => { p.shareQuantityConversion.multiplierEffectiveAtUnixMs =
      p.productIdentity.amountObservedAtUnixMs + 1; }],
  ]) {
    const invalid = structuredClone(f);
    mutate(invalid.prepared.preview);
    rejected(invalid, name);
  }
});

test('preview metadata does not change immutable stock summaries or their digests', () => {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  const summary = structuredClone(f.status.tradeSummary);
  const digest = governedStockTradeSummarySnapshotDigest(summary);
  assert.deepEqual(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.parse(summary), summary);
  Object.assign(summary.productIdentity, observation());
  assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(summary).success, false);
  assert.equal(governedStockTradeSummarySnapshotDigest(f.status.tradeSummary), digest);
});


test('actual API raw and Dollar preparation recovery projections cross the MCP envelope unchanged', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/governed-preview-amount-observation-api.json', import.meta.url)));
  for (const c of fixture.cases) {
    const { requestId, ...terms } = c.input;
    const input = { operationId: requestId, ...terms };
    for (const [phase, body] of [
      ['first', c.firstProjectedResponse], ['replay', c.replayProjectedResponse],
      ['legacy', c.legacyControl.projectedResponse],
    ]) {
      const result = accepted({ input, prepared: body }, `${c.artifact}/${phase}`);
      assert.equal(result.structuredContent.intentId, c.firstProjectedResponse.intentId);
      assert.equal(result.structuredContent.requestId, requestId);
      const product = result.structuredContent.preview.productIdentity;
      if (phase === 'legacy') {
        for (const field of fields) assert.equal(Object.hasOwn(product, field), false);
      } else {
        assert.equal(product.amountModel, 'scaled-ui-amount');
        assert.equal(product.displayMultiplier, '1.0009180758490996');
        assert.equal(product.decimals, 8);
        assert.equal(product.amountObservedAtUnixMs, 1787270400000);
        assert.equal(product.amountObservedAtSlot, '123');
      }
      if (c.requestAmountKind === 'usd-value') {
        assert.equal(body.preview.usdValue.requestedValueUsd, '25');
        assert.ok(c.replayAtUnixMs > body.preview.usdValue.price.expiresAtUnixMs);
        assert.ok(c.replayAtUnixMs < body.preview.quoteExpiresAtUnixMs);
        assert.equal(JSON.parse(result.content[0].text).preview.requestedValue.amount, '25');
      }
    }
    assert.deepEqual(c.replayProjectedResponse.preview, c.firstProjectedResponse.preview);
    for (const name of ['readPrice', 'newReservation', 'prepareFresh', 'resolve', 'inspect']) {
      assert.equal(c.calls[name], 0, `${c.artifact}/${name}`);
    }
  }
});
