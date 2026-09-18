import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
import { GOVERNED_USD_VALUE_BINDING_SCHEMA } from '../lib/governed-usd-value.mjs';
import {
  GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA,
  buildGovernedAssetToolResult,
  governedDetailedBody,
  governedStockPrepareSummarySnapshot,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { receiptFixture } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const API = JSON.parse(readFileSync(new URL('./fixtures/governed-usd-value-api.json', import.meta.url)));
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const SECRET = 'test-only-governed-secret-at-least-thirty-two-bytes';

function fixture() {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  const binding = structuredClone(API.stock.binding);
  f.input = { operationId: OPERATION_ID, action: 'sell', companyQuery: 'NVIDIA', valueUsd: '1' };
  f.prepared.business.amountAtomic = binding.amountAtomic;
  Object.assign(f.prepared.preview, {
    amountAtomic: binding.amountAtomic, maximumInputAmountAtomic: binding.amountAtomic,
    requestAmountKind: 'usd-value', usdValue: binding,
    expectedOutputAtomic: '980000', minimumOutputAtomic: '950000',
  });
  f.execute.business.amountAtomic = binding.amountAtomic;
  f.execute.tradeSummary = structuredClone(API.stock.summary);
  f.status.amountAtomic = binding.amountAtomic;
  f.status.tradeSummary = structuredClone(API.stock.summary);
  f.status.stockV2Identity.tradeSummarySnapshotDigest = canonicalHash(API.stock.snapshot);
  f.history.items = [structuredClone(f.status)];
  f.reconcile.statusAfter = structuredClone(f.status);
  const { digest: _old, ...identity } = f.reconcile;
  f.reconcile.digest = canonicalHash(identity);
  return f;
}

const normalize = (operation, input, body, httpStatus = 200) =>
  normalizeGovernedAssetResult({ operation, input, body, httpStatus });

test('USD evidence accepts exact API producer outputs across decimals and multiplier schedules', () => {
  for (const { name, binding } of API.cases) {
    assert.deepEqual(GOVERNED_USD_VALUE_BINDING_SCHEMA.parse(binding), binding, name);
  }
  assert.equal(API.cases.find((x) => x.name === 'precise-eighteen-decimals').binding.amountAtomic,
    '999999999999999999');
  assert.equal(API.stock.binding.price.marketBlockId, 123);
  assert.ok(API.stock.binding.price.marketBlockId < API.stock.binding.mintObservedSlot);
  assert.equal(API.stock.binding.selectedReferenceValueUsd, '0.999996');
  assert.equal(API.stock.binding.price.settlementUsdPrice.retrievedAtUnixMs, API.stock.binding.price.retrievedAtUnixMs);
  assert.equal(Object.hasOwn(API.stock.binding.price, 'observedAtUnixMs'), false);
  assert.deepEqual(governedStockPrepareSummarySnapshot(API.stock.summary), API.stock.snapshot);
  assert.deepEqual(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.parse(API.stock.summary), API.stock.summary);
});

test('selected reference value retains the full precision emitted by the API producer', () => {
  const { binding } = API.cases.find((x) => x.name === 'precise-reference-value');
  assert.equal(binding.amountAtomic, '1');
  assert.equal(binding.selectedReferenceValueUsd, `1.${'0'.repeat(63)}2${'0'.repeat(63)}1`);
  assert.deepEqual(GOVERNED_USD_VALUE_BINDING_SCHEMA.parse(binding), binding);
  const rounded = structuredClone(binding);
  rounded.selectedReferenceValueUsd = rounded.selectedReferenceValueUsd.slice(0, -1);
  assert.equal(GOVERNED_USD_VALUE_BINDING_SCHEMA.safeParse(rounded).success, false);
});

test('USD evidence rejects inconsistent arithmetic, formatting, identity, and observation times', () => {
  const mutations = [
    (b) => { b.amountAtomic = (BigInt(b.amountAtomic) + 1n).toString(); },
    (b) => { b.requestedValueUsd = '2'; },
    (b) => { b.requestedValueUsd = '1.00'; },
    (b) => { delete b.selectedReferenceValueUsd; },
    (b) => { b.selectedReferenceValueUsd = '1'; },
    (b) => { b.selectedReferenceValueUsd += '0'; },
    (b) => { b.rawDecimalAmount = '0.1666660'; },
    (b) => { b.displayAmount = b.rawDecimalAmount; },
    (b) => { b.rounding = 'ceil'; },
    (b) => { b.semantics = 'exact-proceeds'; },
    (b) => { b.price.usdPrice = '4'; },
    (b) => { b.price.usdPrice = 'bad'; },
    (b) => { b.price.quantityUnit = 'raw-decimals'; },
    (b) => { b.price.mint = '11111111111111111111111111111111'; },
    (b) => { b.price.contextSlot = b.price.marketBlockId; },
    (b) => { b.price.expiresAtUnixMs = b.preparedAtUnixMs; },
    (b) => { b.price.retrievedAtUnixMs = b.preparedAtUnixMs + 1; },
    (b) => { b.price.observedAtUnixMs = b.price.retrievedAtUnixMs; },
    (b) => { delete b.price.settlementUsdPrice; },
    (b) => { b.price.settlementUsdPrice.mint = b.mint; },
    (b) => { b.price.settlementUsdPrice.usdPrice = '0'; },
    (b) => { b.price.settlementUsdPrice.usdPrice = '-1'; },
    (b) => { b.price.settlementUsdPrice.usdPrice = 'bad'; },
    (b) => { b.price.settlementUsdPrice.source += '-different'; },
    (b) => { b.price.settlementUsdPrice.retrievedAtUnixMs += 1; },
    (b) => { b.price.settlementUsdPrice.marketBlockId = -1; },
    (b) => { b.price.settlementUsdPrice.marketBlockId = 1.5; },
    (b) => { b.price.settlementUsdPrice.observedAtUnixMs = b.price.retrievedAtUnixMs; },
    (b) => { b.balance.amountAtomic = '1'; },
    (b) => { b.balance.amountAtomic = 'bad'; },
    (b) => { b.balance.observedAtUnixMs = b.preparedAtUnixMs + 1; },
    (b) => { b.mintObservedSlot += 1; },
    (b) => { b.mintObservedAtUnixMs += 1; },
    (b) => { b.mintStateDigest = 'b'.repeat(64); },
    (b) => { b.assetDecimals = 1_000_000_000; },
    (b) => { b.tokenProgram = 'spl-token'; },
    (b) => { b.amountModel = 'raw-decimals'; },
    (b) => { b.multiplier.value = '3'; },
    (b) => { b.multiplier.currentValue = '2.0'; },
    (b) => { b.multiplier.nextValue = '4'; },
    (b) => { b.multiplier.source = 'token-2022-scaled-ui-scheduled'; },
    (b) => { b.multiplier.scheduledEffectiveTimestampUnixSeconds = b.preparedAtUnixMs / 1000 - 1; },
    (b) => { b.preparedAtUnixMs = (b.multiplier.scheduledEffectiveTimestampUnixSeconds + 1) * 1000;
      b.price.expiresAtUnixMs = b.preparedAtUnixMs + 1000; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const binding = structuredClone(API.stock.binding);
    mutate(binding);
    assert.equal(GOVERNED_USD_VALUE_BINDING_SCHEMA.safeParse(binding).success, false, `mutation ${index}`);
  }
});

test('dollar Sell normalizes the actual API binding through Prepare and model result projection', () => {
  const f = fixture();
  const result = normalize('prepare', f.input, f.prepared);
  assert.equal(result.isError, false);
  const toolResult = buildGovernedAssetToolResult(result);
  assert.deepEqual(governedDetailedBody(toolResult.structuredContent), f.prepared);
  const presentation = JSON.parse(toolResult.content[0].text);
  assert.deepEqual(toolResult.structuredContent.presentation, presentation);
  assert.deepEqual(presentation.preview.requestedValue, {
    amount: '1', currency: 'USD', basis: 'market_value_at_preparation',
    priceRetrievedAtUnixMs: API.stock.binding.price.retrievedAtUnixMs,
  });
  assert.deepEqual(presentation.preview.selectedReferenceValue, {
    amount: '0.999996', currency: 'USD', basis: 'floor_rounded_reference_value',
  });
  assert.equal(presentation.preview.input.amount, '0.333332');
  assert.equal(presentation.preview.input.symbol, 'NVDAx');
  assert.equal(presentation.preview.input.decimals, 6);
  assert.equal(presentation.preview.input.amountModel, 'scaled-ui-amount');
  assert.deepEqual(presentation.preview.input.multiplierObservation, {
    value: '2', observedAtUnixMs: API.stock.binding.multiplier.observedAtUnixMs,
    observedSlot: API.stock.binding.multiplier.observedSlot,
  });
  assert.deepEqual(presentation.preview.maximumInput, presentation.preview.input);
  assert.equal(presentation.preview.expectedOutput.amount, '0.98');
  assert.equal(presentation.preview.expectedOutput.symbol, 'USDC');
  assert.equal(presentation.preview.minimumOutput.amount, '0.95');
  assert.equal(presentation.preview.basis, 'estimated_quote');
  assert.equal(presentation.actual, undefined);
  assert.doesNotMatch(presentation.summary, /sold|received|confirmed|finalized/i);
  assert.equal(result.body.preview.expectedOutputAtomic, '980000');
  assert.equal(result.body.preview.usdValue.requestedValueUsd, '1');
  assert.equal(result.body.preview.amountAtomic, '166666');
});

test('readable dollar Sell text uses each API producer decimal and multiplier observation', () => {
  for (const { name, binding } of API.cases) {
    const f = fixture();
    f.input.valueUsd = binding.requestedValueUsd;
    f.prepared.business.amountAtomic = binding.amountAtomic;
    Object.assign(f.prepared.preview, { amountAtomic: binding.amountAtomic,
      maximumInputAmountAtomic: binding.amountAtomic, usdValue: structuredClone(binding) });
    for (const identity of [f.prepared.preview.productIdentity, f.prepared.preview.stockSelection]) {
      Object.assign(identity, { mint: binding.mint, decimals: binding.assetDecimals, tokenProgram: binding.tokenProgram });
    }
    const result = normalize('prepare', f.input, f.prepared);
    assert.equal(result.isError, false, name);
    const toolResult = buildGovernedAssetToolResult(result);
    const presentation = JSON.parse(toolResult.content[0].text);
    assert.deepEqual(governedDetailedBody(toolResult.structuredContent), f.prepared, name);
    assert.deepEqual(toolResult.structuredContent.presentation, presentation, name);
    assert.equal(presentation.preview.selectedReferenceValue.amount, binding.selectedReferenceValueUsd, name);
    for (const amount of [presentation.preview.input, presentation.preview.maximumInput]) {
      assert.equal(amount.amount, binding.displayAmount, name);
      assert.equal(amount.decimals, binding.assetDecimals, name);
      assert.equal(amount.amountModel, binding.amountModel, name);
      assert.equal(amount.multiplierObservation.value, binding.multiplier.value, name);
      assert.equal(amount.multiplierObservation.observedAtUnixMs, binding.multiplier.observedAtUnixMs, name);
      assert.equal(amount.multiplierObservation.observedSlot, binding.multiplier.observedSlot, name);
      assert.equal(amount.displayStatus, undefined, name);
    }
  }
});

test('a stored successful receipt takes precedence over requested USD and quoted proceeds', () => {
  const f = fixture();
  const receipt = structuredClone(receiptFixture().status.receiptOutcome);
  Object.assign(receipt, { intentId: f.status.intentId, attemptId: f.status.attemptId });
  Object.assign(receipt.debit, { amountRaw: API.stock.binding.amountAtomic,
    baseAmount: API.stock.binding.rawDecimalAmount, balanceBeforeRaw: API.stock.binding.amountAtomic,
    balanceAfterRaw: '0' });
  Object.assign(receipt.credit, { amountRaw: '970001', baseAmount: '0.970001', displayAmount: '0.970001',
    balanceBeforeRaw: '0', balanceAfterRaw: '970001' });
  f.execute.receiptOutcome = structuredClone(receipt);
  f.status.receiptOutcome = structuredClone(receipt);
  f.history.items = [structuredClone(f.status)];
  f.reconcile.statusAfter = structuredClone(f.status);
  const { digest: _old, ...identity } = f.reconcile;
  f.reconcile.digest = canonicalHash(identity);
  for (const [operation, input, body, code] of [
    ['execute', { operationId: OPERATION_ID, intentId: f.status.intentId }, f.execute, 200],
    ['status', { intentId: f.status.intentId }, f.status, 200],
    ['history', { limit: 25 }, f.history, 200],
    ['reconcile', { intentId: f.status.intentId }, f.reconcile, 202],
  ]) {
    const result = normalize(operation, input, body, code);
    assert.equal(result.isError, false, operation);
    const toolResult = buildGovernedAssetToolResult(result);
    assert.deepEqual(governedDetailedBody(toolResult.structuredContent), body, operation);
    const text = JSON.parse(toolResult.content[0].text);
    assert.deepEqual(toolResult.structuredContent.presentation, text, operation);
    const presentation = operation === 'history' ? text.items[0] : text;
    assert.equal(presentation.actual.credit.amount, '0.970001', operation);
    assert.match(presentation.summary, /Received 0\.970001 USDC/);
    assert.equal(presentation.preview, undefined, operation);
    assert.equal(presentation.actual.debit.amount, null, operation);
    assert.equal(presentation.actual.debit.baseTokenAmount, API.stock.binding.rawDecimalAmount, operation);
    assert.match(presentation.actual.debit.displayStatus, /Historical display scaling is unavailable/, operation);
    assert.doesNotMatch(presentation.summary, /requested|0\.98|\$1|ready to execute/, operation);
  }
});

test('an approved non-stock asset uses the same USD binding without a catalog stock identity', () => {
  const f = fixture();
  delete f.prepared.stockRuntime;
  delete f.prepared.preview.stockSelection;
  delete f.prepared.business.requestedCompanyQuery;
  f.prepared.business.assetId = f.prepared.preview.assetId = 'approved-token-42';
  f.prepared.preview.symbol = 'TOK';
  Object.assign(f.prepared.preview.productIdentity, {
    assetId: 'approved-token-42', assetClass: 'token', companyName: null,
    productName: 'Approved Token', symbol: 'TOK', issuer: null,
  });
  delete f.prepared.preview.productIdentity.providerName;
  delete f.prepared.preview.productIdentity.legalIssuerName;
  const input = { operationId: OPERATION_ID, action: 'sell', assetId: 'approved-token-42', valueUsd: '1' };
  const result = normalize('prepare', input, f.prepared);
  assert.equal(result.isError, false);
  const presentation = JSON.parse(buildGovernedAssetToolResult(result).content[0].text);
  assert.equal(presentation.preview.input.amount, API.stock.binding.displayAmount);
  assert.equal(presentation.preview.input.symbol, 'TOK');
  assert.equal(presentation.preview.requestedValue.amount, '1');
  for (const [field, value] of [
    ['assetId', 'different-approved-token'],
    ['mint', '11111111111111111111111111111111'],
  ]) {
    const contradictory = structuredClone(f.prepared);
    contradictory.preview.productIdentity[field] = value;
    const rejected = normalize('prepare', input, contradictory);
    assert.equal(rejected.isError, true, field);
    assert.equal(rejected.body.code, 'governed_backend_response_invalid', field);
    const projected = buildGovernedAssetToolResult(rejected);
    assert.equal(projected.isError, true, field);
    assert.deepEqual(projected.structuredContent, { presentation: JSON.parse(projected.content[0].text) }, field);
    assert.deepEqual(projected._meta['dexter/governedWidgetResult'], rejected.body, field);
    assert.equal(JSON.parse(projected.content[0].text).preview, undefined, field);
  }
});

test('dollar Sell rejects substituted requested value, raw amount, asset, or request mode', () => {
  const f = fixture();
  for (const mutate of [
    (b) => { b.preview.usdValue.requestedValueUsd = '2'; },
    (b) => { b.business.amountAtomic = '166667'; },
    (b) => { b.preview.amountAtomic = '166667'; },
    (b) => { b.preview.usdValue.mint = b.preview.usdValue.price.mint = '11111111111111111111111111111111'; },
    (b) => { b.preview.productIdentity.decimals = 8; },
    (b) => { b.preview.requestAmountKind = 'input'; },
    (b) => { delete b.preview.usdValue; },
    (b) => { b.preview.usdValue.multiplier.value = '3'; },
    (b) => { b.preview.expectedOutputAtomic = '940000'; },
  ]) {
    const body = structuredClone(f.prepared);
    mutate(body);
    assert.equal(normalize('prepare', f.input, body).isError, true);
  }
  assert.equal(normalize('prepare', { ...f.input, valueUsd: '2' }, f.prepared).isError, true);
  assert.equal(normalize('prepare', { ...f.input, action: 'buy' }, f.prepared).isError, true);
  const raw = { ...f.input, amountAtomic: f.prepared.preview.amountAtomic };
  delete raw.valueUsd;
  assert.equal(normalize('prepare', raw, f.prepared).isError, true);
  for (const mutate of [
    (s) => { s.action = 'buy'; },
    (s) => { s.productIdentity.mint = '11111111111111111111111111111111'; },
    (s) => { s.requestAmountKind = 'input'; },
    (s) => { delete s.usdValue; },
  ]) {
    const summary = structuredClone(API.stock.summary);
    mutate(summary);
    assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(summary).success, false);
  }
});

test('USD request terms persist through Status, History, Reconcile, and the existing snapshot digest', () => {
  const f = fixture();
  for (const [operation, input, body, code] of [
    ['status', { intentId: f.status.intentId }, f.status, 200],
    ['history', { limit: 25 }, f.history, 200],
    ['reconcile', { intentId: f.status.intentId }, f.reconcile, 202],
  ]) {
    assert.equal(normalize(operation, input, body, code).isError, false, operation);
  }
  for (const mutate of [
    (p) => { p.marketBlockId += 1; },
    (p) => { p.settlementUsdPrice.usdPrice = '0.98'; },
    (p) => { p.settlementUsdPrice.marketBlockId = p.settlementUsdPrice.marketBlockId === null ? 0 : null; },
  ]) {
    const changed = structuredClone(f.status);
    mutate(changed.tradeSummary.usdValue.price);
    assert.equal(GOVERNED_USD_VALUE_BINDING_SCHEMA.safeParse(changed.tradeSummary.usdValue).success, true,
      'A distinct, valid price observation still needs its original summary digest');
    assert.equal(normalize('status', { intentId: changed.intentId }, changed).isError, true);
  }
  const legacy = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  assert.equal('usdValue' in governedStockPrepareSummarySnapshot(legacy.status.tradeSummary), false);
  assert.equal(normalize('status', { intentId: legacy.status.intentId }, legacy.status).isError, false);
});

test('a covered dollar Sell continues with exactly the returned intent and one Execute request', async () => {
  const f = fixture();
  const prepare = normalize('prepare', f.input, f.prepared);
  const executeInput = { operationId: OPERATION_ID, intentId: prepare.body.intentId };
  let calls = 0;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test', secret: SECRET, operation: 'execute', input: executeInput,
    mcpSessionId: 'mcp-session-usd-fixture', now: API.stock.binding.preparedAtUnixMs,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.ok(url.endsWith(`/transactions/${f.prepared.intentId}/execute`));
      assert.equal(options.body, '{}');
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(f.execute) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.isError, false);
  assert.equal(result.body.intentId, f.prepared.intentId);
  assert.deepEqual(result.body.tradeSummary.usdValue, API.stock.binding);
});
