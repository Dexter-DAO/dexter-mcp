import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult,
  GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA, governedStockTradeSummarySnapshotDigest,
} from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { receiptFixture, OPERATION_ID, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const API = JSON.parse(readFileSync(new URL('./fixtures/governed-jupiter-service-fee-api.json', import.meta.url)));
const RAW = JSON.parse(readFileSync(new URL('./fixtures/governed-raw-preview-api.json', import.meta.url)));
const USD = JSON.parse(readFileSync(new URL('./fixtures/governed-usd-value-api.json', import.meta.url)));
const RECOVERY = JSON.parse(readFileSync(new URL('./fixtures/governed-preview-amount-observation-api.json', import.meta.url)));
const stockFee = action => structuredClone(API.cases.find(c => c.name === `backpack-spcx-${action}`).feeSummary);

// Only the captured quote/fee fragments are producer output; surrounding
// authority, asset catalog and lifecycle records are existing synthetic fixtures.
function prepared(c) {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  const stock = c.asset === 'backpack-spcx';
  if (!stock) {
    f.prepared.preview = structuredClone(RAW.cases.find(r => r.action === c.action).preview);
    delete f.prepared.stockRuntime;
    delete f.prepared.business.requestedCompanyQuery;
  }
  const p = f.prepared.preview;
  Object.assign(p, { action: c.action, amountAtomic: c.inputAmountAtomic,
    maximumInputAmountAtomic: c.inputAmountAtomic, inputMint: c.inputMint, outputMint: c.outputMint,
    expectedOutputAtomic: c.expectedOutputAtomic, minimumOutputAtomic: c.minimumOutputAtomic,
    feeSummary: structuredClone(c.feeSummary) });
  const mint = c.action === 'buy' ? c.outputMint : c.inputMint;
  p.productIdentity.mint = mint;
  if (stock) p.stockSelection.mint = mint;
  Object.assign(f.prepared.business, { action: c.action, assetId: p.assetId, amountAtomic: c.inputAmountAtomic });
  f.input = { operationId: OPERATION_ID, action: c.action, amountAtomic: c.inputAmountAtomic,
    ...(stock ? { companyQuery: 'NVIDIA' } : { assetId: p.assetId }) };
  return f;
}
function envelope(operation, input, body, httpStatus = operation === 'reconcile' && body.outcome === 'pending' ? 202 : 200) {
  return buildGovernedAssetToolResult(normalizeGovernedAssetResult({ operation, input, body, httpStatus }));
}
function reject(f, label) {
  const r = envelope('prepare', f.input, f.prepared);
  assert.equal(r.isError, true, label);
  assert.equal(r.structuredContent, undefined, label);
  assert.equal(JSON.parse(r.content[0].text).code, 'governed_backend_response_invalid', label);
}

test('actual stock and token Buy/Sell fee fragments cross the real client and Prepare envelope unchanged', async () => {
  for (const c of API.cases) {
    const f = prepared(c);
    let calls = 0;
    const normalized = await callGovernedAssetBackend({ apiBase: 'https://api.dexter.test',
      secret: 'test-only-secret-at-least-thirty-two-characters', operation: 'prepare', input: f.input,
      mcpSessionId: 'fee-consumer-session', now: 1787270400000,
      fetchImpl: async () => { calls++; return new Response(JSON.stringify(f.prepared), { status: 200 }); } });
    const result = buildGovernedAssetToolResult(normalized);
    assert.equal(calls, 1);
    assert.equal(result.isError, false, c.name);
    assert.deepEqual(result.structuredContent, f.prepared, c.name);
    const shown = JSON.parse(result.content[0].text);
    assert.deepEqual(shown.preview.quotedFees, c.feeSummary);
    assert.equal(Object.hasOwn(shown, 'actual'), false);
    assert.equal(result.structuredContent.preview.expectedOutputAtomic, c.expectedOutputAtomic);
    assert.equal(result.structuredContent.preview.minimumOutputAtomic, c.minimumOutputAtomic);
    const replay = structuredClone(f.prepared);
    replay.replayed = true;
    assert.deepEqual(envelope('prepare', f.input, replay).structuredContent, replay);
  }
});

test('fee metadata is exact, bounded, and agrees with its quoted platform fee', () => {
  const mutations = [
    fee => { fee.serviceFee.version = 'dexter-jupiter-service-fee/v2'; },
    fee => { fee.serviceFee.rateBps = 76; }, fee => { fee.serviceFee.rateBps = '75'; },
    fee => { fee.serviceFee.side = 'both'; }, fee => { fee.serviceFee.tokenProgram = 'native'; },
    ...['mint', 'feeAccount', 'owner'].map(k => fee => { fee.serviceFee[k] = 'O'.repeat(32); }),
    ...['mint', 'feeAccount', 'owner'].map(k => fee => { fee.serviceFee[k] = '1'.repeat(33); }),
    ...['-1', '01', '1.0', '1e3', '18446744073709551616', 75, null].map(v => fee => {
      fee.serviceFee.quotedFeeAmountAtomic = v;
    }),
    fee => { fee.platformFee = null; }, fee => { fee.platformFee.amountAtomic = '1'; },
    fee => { fee.platformFee.mint = '11111111111111111111111111111111'; },
    fee => { fee.serviceFee.extra = true; }, fee => { fee.extra = true; },
    fee => { fee.serviceFee = null; }, fee => { fee.platformFee.extra = true; },
    fee => { fee.networkFee.amountLamports = '1'; },
    fee => { fee.ownerSwapFee = { version: 'unsupported-owner-fee' }; },
    ...Object.keys(stockFee('sell').serviceFee).map(k => fee => { delete fee.serviceFee[k]; }),
  ];
  for (const c of API.cases) for (const [index, mutate] of mutations.entries()) {
    const f = prepared(c); mutate(f.prepared.preview.feeSummary); reject(f, `${c.name}/${index}`);
  }
  for (const amount of ['0', '18446744073709551615']) {
    const f = prepared(API.cases[0]);
    f.prepared.preview.feeSummary.serviceFee.quotedFeeAmountAtomic = amount;
    f.prepared.preview.feeSummary.platformFee.amountAtomic = amount;
    assert.equal(envelope('prepare', f.input, f.prepared).isError, false);
  }
});

test('fee-absent historical Prepare and stock summaries keep their exact old shape and snapshot identity', () => {
  for (const name of ['nvidia', 'tesla']) {
    const f = dynamicStockV2Fixture(name, OPERATION_ID);
    const p = f.prepared.preview;
    assert.deepEqual(envelope('prepare', f.input, f.prepared).structuredContent, f.prepared);
    const before = governedStockTradeSummarySnapshotDigest(f.status.tradeSummary);
    assert.deepEqual(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.parse(f.status.tradeSummary), f.status.tradeSummary);
    const charged = structuredClone(f.status.tradeSummary);
    charged.feeSummary = stockFee(p.action);
    assert.deepEqual(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.parse(charged), charged);
    // This snapshot freezes pre-build request/product facts; fee facts are
    // bound by the producer's final quote/attestation, not added to old snapshots.
    assert.equal(governedStockTradeSummarySnapshotDigest(charged), before);
    const invalid = structuredClone(f.status.tradeSummary);
    invalid.feeSummary.platformFee = stockFee(p.action).platformFee;
    assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(invalid).success, false);
  }
  const generic = prepared(API.cases[0]);
  delete generic.prepared.preview.feeSummary.serviceFee;
  assert.equal(envelope('prepare', generic.input, generic.prepared).isError, false);
});

test('saved stock fees survive Execute, Status, History and Reconcile without becoming actual receipt fees', () => {
  for (const buy of [false, true]) {
    const f = receiptFixture({ buy });
    const priorReceipt = structuredClone(f.status.receiptOutcome);
    const priorActual = JSON.parse(envelope('status', { intentId: f.status.intentId }, f.status).content[0].text).actual;
    f.status.tradeSummary.feeSummary = stockFee(buy ? 'buy' : 'sell');
    f.execute.tradeSummary = structuredClone(f.status.tradeSummary);
    f.history.items = [structuredClone(f.status)];
    f.reconcile.statusAfter = structuredClone(f.status);
    refreshReconcileDigest(f.reconcile);
    for (const [op, input, body] of [
      ['execute', { operationId: OPERATION_ID, intentId: f.status.intentId }, f.execute],
      ['status', { intentId: f.status.intentId }, f.status],
      ['history', { limit: 25 }, f.history],
      ['reconcile', { intentId: f.status.intentId }, f.reconcile],
    ]) {
      const shown = envelope(op, input, body);
      assert.equal(shown.isError, false, `${buy}/${op}`);
      assert.deepEqual(shown.structuredContent, body);
      const model = JSON.parse(shown.content[0].text);
      const outcome = op === 'history' ? model.items[0] : model;
      assert.deepEqual(outcome.actual, priorActual);
    }
    assert.deepEqual(f.status.receiptOutcome, priorReceipt);
    const staleDigest = structuredClone(f.reconcile);
    staleDigest.statusAfter.tradeSummary.feeSummary.serviceFee.owner = '11111111111111111111111111111111';
    assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(staleDigest.statusAfter.tradeSummary).success, true);
    assert.equal(envelope('reconcile', { intentId: f.status.intentId }, staleDigest).isError, true);
    refreshReconcileDigest(staleDigest);
    assert.equal(envelope('reconcile', { intentId: f.status.intentId }, staleDigest).isError, false);
  }
});

test('Dollar stock summary preserves frozen conversion and product binding with the quoted service fee', () => {
  const summary = structuredClone(USD.stock.summary);
  const frozen = structuredClone(summary.usdValue);
  const snapshot = governedStockTradeSummarySnapshotDigest(summary);
  summary.feeSummary = stockFee('sell');
  assert.deepEqual(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.parse(summary), summary);
  assert.deepEqual(summary.usdValue, frozen);
  assert.equal(governedStockTradeSummarySnapshotDigest(summary), snapshot);
  for (const mutate of [s => { s.productIdentity.assetId = 'other'; },
    s => { s.productIdentity.mint = '11111111111111111111111111111111'; }]) {
    const invalid = structuredClone(summary); mutate(invalid);
    assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(invalid).success, false);
  }
});

test('fee-bearing Dollar recovery and share Buy previews preserve frozen terms in composed envelopes', () => {
  for (const c of RECOVERY.cases.filter(c => c.requestAmountKind === 'usd-value')) {
    const { requestId, ...terms } = c.input;
    const input = { operationId: requestId, ...terms };
    for (const original of [c.firstProjectedResponse, c.replayProjectedResponse]) {
      const body = structuredClone(original);
      body.preview.feeSummary = stockFee('sell');
      const result = envelope('prepare', input, body);
      assert.equal(result.isError, false);
      assert.deepEqual(result.structuredContent, body);
      assert.deepEqual(result.structuredContent.preview.usdValue, original.preview.usdValue);
      assert.equal(result.structuredContent.intentId, original.intentId);
      assert.equal(result.structuredContent.replayed, original.replayed);
    }
  }
  const f = dynamicStockV2Fixture('tesla', OPERATION_ID);
  f.prepared.preview.feeSummary = stockFee('buy');
  assert.deepEqual(envelope('prepare', f.input, f.prepared).structuredContent, f.prepared);
  for (const mutate of [
    fee => { fee.routeFees = [fee.routeFees[0], fee.routeFees[0]]; },
    fee => { fee.routeFees = [{ mint: 'z'.repeat(32), amountAtomic: '0' }, ...fee.routeFees]; },
  ]) {
    const invalid = structuredClone(f);
    mutate(invalid.prepared.preview.feeSummary);
    reject(invalid, 'stock route fees remain unique and mint-sorted');
  }
});
