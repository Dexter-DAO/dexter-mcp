import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';

import {
  formatAtomicDecimal,
  normalizeGovernedHistory,
  normalizeStockTrade,
} from '../apps-sdk/ui/src/components/stock-trade/stock-trade-model.ts';
import {
  SPCX_MINT,
  spcxProductIdentity,
  spcxShareQuantityTradeSummary,
  stockFeeSummary,
} from './fixtures/stock-trade-summary.fixtures.mjs';
import {
  dynamicStockV2Fixture,
} from './fixtures/governed-stock-v2.fixtures.mjs';
import { receiptFixture, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';
import { normalizeGovernedAssetResult } from '../lib/governed-asset-result.mjs';

const SIGNATURE = '5'.repeat(88);
const USD_API = JSON.parse(readFileSync(new URL('./fixtures/governed-usd-value-api.json', import.meta.url)));

function dollarSellFixture() {
  // Synthetic lifecycle envelopes around the actual API-produced binding and summary.
  const fixture = dynamicStockV2Fixture('nvidia', '019f981c-9215-7141-84f2-d89ffe9cbece');
  const binding = structuredClone(USD_API.stock.binding);
  Object.assign(fixture.prepared.business, { amountAtomic: binding.amountAtomic });
  Object.assign(fixture.prepared.preview, {
    amountAtomic: binding.amountAtomic, maximumInputAmountAtomic: binding.amountAtomic,
    requestAmountKind: 'usd-value', usdValue: binding,
    expectedOutputAtomic: '980000', minimumOutputAtomic: '950000',
  });
  fixture.execute.business.amountAtomic = binding.amountAtomic;
  fixture.execute.tradeSummary = structuredClone(USD_API.stock.summary);
  fixture.status.amountAtomic = binding.amountAtomic;
  fixture.status.tradeSummary = structuredClone(USD_API.stock.summary);
  fixture.status.stockV2Identity.tradeSummarySnapshotDigest = canonicalHash(USD_API.stock.snapshot);
  fixture.reconcile.statusAfter = structuredClone(fixture.status);
  fixture.history.items = [structuredClone(fixture.status)];
  return fixture;
}

test('widget preserves actual API dollar binding through prepared and successful lifecycle responses', () => {
  const fixture = dollarSellFixture();
  const prepared = normalizeStockTrade(fixture.prepared);
  assert.equal(prepared.stage, 'prepared');
  assert.equal(prepared.requestAmountKind, 'usd-value');
  assert.equal(prepared.requestedValueUsd, USD_API.stock.binding.requestedValueUsd);
  assert.equal(prepared.usdValueObservedAtUnixMs, USD_API.stock.binding.preparedAtUnixMs);
  assert.equal(prepared.amountDisplay, USD_API.stock.binding.displayAmount);
  assert.equal(prepared.expectedOutput, '0.98');
  assert.equal(prepared.minimumOutput, '0.95');

  for (const operation of ['execute', 'status', 'reconcile', 'history']) {
    const model = operation === 'history'
      ? normalizeGovernedHistory(fixture.history).items[0]
      : normalizeStockTrade(fixture[operation]);
    assert.equal(model.stage, 'success', operation);
    assert.equal(model.requestAmountKind, 'usd-value', operation);
    assert.equal(model.requestedValueUsd, USD_API.stock.binding.requestedValueUsd);
    assert.equal(model.isShareQuantityOrder, false);
    assert.equal(model.amountDisplay, USD_API.stock.binding.rawDecimalAmount);
    assert.equal(model.amountUnit, 'NVDAx (base quantity)');
    assert.equal(model.expectedOutput, null, 'USD request is never actual or estimated USDC proceeds');
    assert.equal(model.needsStatusCheck, false);
    assert.equal(model.transactionSignature, SIGNATURE);
  }
});

test('widget validates dollar evidence before trusting a matching stock summary hash', () => {
  for (const mutate of [
    summary => { delete summary.usdValue; },
    summary => { summary.usdValue.requestedValueUsd = '2'; },
    summary => { summary.usdValue.multiplier.value = '3'; },
    summary => { summary.usdValue.displayAmount = '6589'; },
    summary => { summary.usdValue.mint = '11111111111111111111111111111111'; },
    summary => { summary.requestAmountKind = 'input'; },
  ]) {
    const fixture = dollarSellFixture();
    mutate(fixture.status.tradeSummary);
    const snapshot = structuredClone(USD_API.stock.snapshot);
    snapshot.requestAmountKind = fixture.status.tradeSummary.requestAmountKind;
    if (fixture.status.tradeSummary.usdValue === undefined) delete snapshot.usdValue;
    else snapshot.usdValue = fixture.status.tradeSummary.usdValue;
    fixture.status.stockV2Identity.tradeSummarySnapshotDigest = canonicalHash(snapshot);
    assert.notEqual(normalizeStockTrade(fixture.status).stage, 'success');
    fixture.execute.tradeSummary = structuredClone(fixture.status.tradeSummary);
    assert.notEqual(normalizeStockTrade(fixture.execute).stage, 'success');
  }
  const fixture = dollarSellFixture();
  fixture.status.stockV2Identity.tradeSummarySnapshotDigest = '0'.repeat(64);
  assert.notEqual(normalizeStockTrade(fixture.status).stage, 'success');
});

test('prepared dollar quantities use each API observation decimals and effective scaling', () => {
  for (const { name, binding } of USD_API.cases) {
    const payload = dollarSellFixture().prepared;
    Object.assign(payload.preview, {
      amountAtomic: binding.amountAtomic, maximumInputAmountAtomic: binding.amountAtomic,
      usdValue: structuredClone(binding),
    });
    Object.assign(payload.preview.productIdentity, {
      mint: binding.mint, tokenProgram: binding.tokenProgram, decimals: binding.assetDecimals,
    });
    const model = normalizeStockTrade(payload);
    assert.equal(model.amountDisplay, binding.displayAmount, name);
    assert.equal(model.requestedValueUsd, binding.requestedValueUsd, name);
    assert.equal(model.usdValueObservedAtUnixMs, binding.preparedAtUnixMs, name);
  }
});

test('dollar request metadata does not alter uncertain dispatch or definite nonlanding states', () => {
  const fixture = dollarSellFixture();
  Object.assign(fixture.status, {
    status: 'ambiguous', confirmationCommitment: null, executionSucceeded: null,
  });
  const pending = normalizeStockTrade(fixture.status);
  assert.equal(pending.stage, 'pending');
  assert.equal(pending.recovery.kind, 'reconcile');
  assert.match(pending.recovery.sentence, /Do not execute again/);
  fixture.status.definitiveNonlandingProof = true;
  assert.equal(normalizeStockTrade(fixture.status).stage, 'failure');
});

function productIdentity() {
  return spcxProductIdentity();
}

function feeSummary() {
  return stockFeeSummary();
}

function preparedPayload() {
  return {
    namespace: 'dexter-governed-agent-action/v1',
    status: 'prepared',
    intentId: '33333333-3333-4333-8333-333333333333',
    preview: {
      action: 'buy',
      assetId: 'backpack-spcx',
      symbol: 'SPCX',
      amountAtomic: '1349344730',
      maximumInputAmountAtomic: '1349344730',
      requestedMaximumSpendAtomic: '1500000000',
      requestedShareQuantity: '10',
      expectedShareQuantity: '10.05',
      minimumShareQuantity: '10.006782',
      shareQuantityUnit: 'underlying-share-equivalent',
      shareQuantitySemantics: 'minimum-receive',
      overfillPossible: true,
      slippageBps: 50,
      priceImpactBps: 80,
      quoteExpiresAtUnixMs: 1_785_024_030_000,
      productIdentity: productIdentity(),
      feeSummary: feeSummary(),
    },
  };
}

function executionPayload(overrides = {}) {
  return {
    namespace: 'dexter-governed-agent-execute/v1',
    status: 'confirmed',
    intentId: '33333333-3333-4333-8333-333333333333',
    transactionSignature: SIGNATURE,
    business: {
      action: 'buy',
      assetId: 'backpack-spcx',
      amountAtomic: '1349344730',
      lifecycle: 'confirmed',
      finality: 'confirmed',
      executionSucceeded: true,
      programError: false,
      definitiveNonlandingProof: false,
    },
    tradeSummary: spcxShareQuantityTradeSummary(),
    ...overrides,
  };
}

function statusPayload(overrides = {}) {
  return {
    namespace: 'dexter-governed-transaction-status/v1',
    status: 'confirmed',
    intentId: '33333333-3333-4333-8333-333333333333',
    action: 'buy',
    assetId: 'backpack-spcx',
    assetMint: SPCX_MINT,
    tokenProgram: 'token-2022',
    amountAtomic: '1349344730',
    transactionSignature: SIGNATURE,
    confirmationCommitment: 'confirmed',
    executionSucceeded: true,
    tradeSummary: spcxShareQuantityTradeSummary(),
    ...overrides,
  };
}

test('normalizes a share-quantity preview without claiming a purchase', () => {
  const model = normalizeStockTrade(preparedPayload());

  assert.ok(model);
  assert.equal(model.operation, 'prepare');
  assert.equal(model.stage, 'prepared');
  assert.equal(model.stageLabel, 'Prepared');
  assert.equal(model.headline, 'Buy 10 shares of SpaceX');
  assert.equal(model.supporting, 'This exact action is prepared. Nothing has been signed or submitted.');
  assert.equal(model.requestedShareQuantity, '10');
  assert.equal(model.expectedShareQuantity, '10.05');
  assert.equal(model.minimumShareQuantity, '10.006782');
  assert.equal(model.quotedSpend, '1,349.34473');
  assert.equal(model.requestedMaximumSpend, '1,500');
  assert.equal(model.product.issuer, 'Trek Nexus Markets Ltd');
  assert.equal(model.product.providerName, 'Backpack Securities');
  assert.equal(model.product.legalIssuerName, 'Trek Nexus Markets Ltd');
  assert.equal(model.fees?.networkFeeStatus, 'not-yet-calculated');
});

test('confirmed signature plus successful execution is success', () => {
  const model = normalizeStockTrade(executionPayload());

  assert.ok(model);
  assert.equal(model.operation, 'execute');
  assert.equal(model.stage, 'success');
  assert.equal(model.confirmedExecutionOutcome, true);
  assert.equal(model.landingProof, null);
  assert.equal(model.stageLabel, 'Confirmed');
  assert.equal(model.headline, '10 shares of SpaceX bought');
  assert.match(model.supporting, /successful execution/);
  assert.equal(model.confirmationCommitment, 'confirmed');
  assert.equal(model.executionSucceeded, true);
  assert.equal(model.transactionSignature, SIGNATURE);
  assert.equal(model.solscanUrl, `https://solscan.io/tx/${SIGNATURE}`);
  assert.equal(model.finalizedEvidence, false);
});

test('status reconnect restores the exact 10-share SpaceX receipt terms', () => {
  const model = normalizeStockTrade(statusPayload());

  assert.ok(model);
  assert.equal(model.operation, 'status');
  assert.equal(model.stage, 'success');
  assert.equal(model.headline, '10 shares of SpaceX bought');
  assert.equal(model.requestedShareQuantity, '10');
  assert.equal(model.minimumShareQuantity, '10.006782');
  assert.equal(model.requestedMaximumSpend, '1,500');
  assert.equal(model.product.mint, SPCX_MINT);
  assert.equal(model.product.tokenProgram, 'token-2022');
});

test('reconcile reconnect reads the durable terms from statusAfter', () => {
  const model = normalizeStockTrade({
    namespace: 'dexter-governed-agent-reconcile/v1',
    outcome: 'advanced',
    statusAfter: statusPayload(),
  });

  assert.ok(model);
  assert.equal(model.operation, 'reconcile');
  assert.equal(model.stage, 'success');
  assert.equal(model.headline, '10 shares of SpaceX bought');
  assert.equal(model.expectedShareQuantity, '10.05');
  assert.equal(model.fees?.networkFeeStatus, 'not-yet-calculated');
});

test('the confirmed success evidence has no second lifecycle-label gate', () => {
  const model = normalizeStockTrade(executionPayload({ status: 'pending' }));

  assert.ok(model);
  assert.equal(model.stage, 'success');
  assert.equal(model.stageLabel, 'Confirmed');
});

test('finalized satisfies confirmed and is only additional evidence', () => {
  const payload = executionPayload();
  payload.business.finality = 'finalized';
  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.stage, 'success');
  assert.equal(model.confirmationCommitment, 'finalized');
  assert.equal(model.finalizedEvidence, true);
});

test('account delta is optional receipt detail and never gates confirmed success', () => {
  const withoutDelta = normalizeStockTrade(executionPayload());
  const withDelta = normalizeStockTrade(executionPayload({
    accountDeltaEvidence: { observed: true, matchesExpected: false },
  }));

  assert.equal(withoutDelta?.stage, 'success');
  assert.equal(withoutDelta?.accountDeltaObserved, null);
  assert.equal(withDelta?.stage, 'success');
  assert.equal(withDelta?.accountDeltaObserved, true);
  assert.equal(withDelta?.accountDeltaMatchesExpected, false);
});

test('submitted, signed, unknown, and incomplete confirmed evidence remain pending', () => {
  const submitted = executionPayload({ status: 'pending' });
  submitted.business.lifecycle = 'submitted';
  submitted.business.finality = 'not-final';
  submitted.business.executionSucceeded = null;

  const signed = structuredClone(submitted);
  signed.business.lifecycle = 'signed';
  signed.transactionSignature = null;

  const unknown = structuredClone(submitted);
  unknown.status = 'unknown';
  unknown.business.lifecycle = 'unknown';

  const missingSignature = executionPayload({ transactionSignature: null });
  const missingExecution = executionPayload();
  missingExecution.business.executionSucceeded = null;

  for (const payload of [submitted, signed, unknown, missingSignature, missingExecution]) {
    assert.equal(normalizeStockTrade(payload)?.stage, 'pending');
  }
});

test('invalid signatures cannot produce success or an explorer URL', () => {
  const model = normalizeStockTrade(executionPayload({ transactionSignature: 'not-a-signature' }));

  assert.ok(model);
  assert.equal(model.stage, 'pending');
  assert.equal(model.transactionSignature, null);
  assert.equal(model.solscanUrl, null);
});

test('base58-looking text must decode to exactly 64 signature bytes', () => {
  const payload = executionPayload({ transactionSignature: '2'.repeat(64) });
  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.stage, 'pending');
  assert.equal(model.transactionSignature, null);
  assert.equal(model.solscanUrl, null);
});

test('stock success fails closed when the envelope substitutes identity', () => {
  const fixture = dynamicStockV2Fixture(
    'tesla',
    '019f981c-9215-7141-84f2-d89ffe9cbece',
  );
  const valid = normalizeStockTrade(fixture.status);
  assert.equal(valid?.stage, 'success');

  const mutations = [
    (payload) => { payload.tradeSummary.assetId = 'xstocks-other'; },
    (payload) => { payload.tradeSummary.productIdentity.mint = SPCX_MINT; },
    (payload) => { payload.tradeSummary.productIdentity.companyName = 'Substituted Co.'; },
    (payload) => { payload.tradeSummary.productIdentity.providerName = 'Substituted Provider'; },
    (payload) => { payload.tradeSummary.productIdentity.issuer = 'Substituted Issuer'; },
    (payload) => { payload.tradeSummary.productIdentity.decimals = 9; },
    (payload) => { payload.stockSelection.registryIdentityDigest = 'f'.repeat(64); },
    (payload) => {
      payload.stockV2Identity.intentId = '11111111-1111-4111-8111-111111111111';
    },
    (payload) => {
      payload.stockSelection.companyName = 'Attacker Corp';
      payload.tradeSummary.productIdentity.companyName = 'Attacker Corp';
    },
    (payload) => { delete payload.stockV2Identity; },
  ];
  for (const mutate of mutations) {
    const payload = structuredClone(fixture.status);
    mutate(payload);
    assert.notEqual(normalizeStockTrade(payload)?.stage, 'success');
  }

  const reconcile = structuredClone(fixture.reconcile);
  reconcile.intentId = '11111111-1111-4111-8111-111111111111';
  assert.notEqual(normalizeStockTrade(reconcile)?.stage, 'success');
});

test('failed execution is failure even with confirmed chain evidence', () => {
  const payload = executionPayload();
  payload.business.executionSucceeded = false;
  payload.business.programError = true;
  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.stage, 'failure');
  assert.equal(model.stageLabel, 'Failed');
});

test('strict confirmed failure keeps receipt evidence without recovery or a finality gate', () => {
  const fixture = receiptFixture();
  delete fixture.status.receiptOutcome;
  Object.assign(fixture.status, { executionSucceeded: false, reconciliationKind: 'landed_program_error' });
  fixture.reconcile.statusAfter = structuredClone(fixture.status);
  fixture.reconcile.explanation = 'The same durable attempt is still ambiguous; no signing or submission request was repeated.';
  refreshReconcileDigest(fixture.reconcile);
  for (const [operation, body, httpStatus] of [
    ['status', fixture.status, 200], ['reconcile', fixture.reconcile, 202],
  ]) {
    const normalized = normalizeGovernedAssetResult({ operation, body, httpStatus,
      input: { intentId: fixture.status.intentId } });
    assert.equal(normalized.isError, false);
    const model = normalizeStockTrade(normalized.body);
    assert.equal(model.stage, 'failure');
    assert.equal(model.stageLabel, 'Failed');
    assert.equal(model.confirmedExecutionOutcome, true);
    assert.equal(model.executionSucceeded, false);
    assert.equal(model.confirmationCommitment, 'confirmed');
    assert.equal(model.settlementFinalized, false);
    assert.equal(model.needsStatusCheck, false);
    assert.deepEqual(model.recovery, { kind: 'none', sentence: null });
    assert.equal(model.intentId, fixture.status.intentId);
    assert.equal(model.transactionSignature, fixture.status.transactionSignature);
    if (operation === 'reconcile') {
      assert.equal(model.reconcileOutcome, 'pending');
      assert.equal(model.explanation, fixture.reconcile.explanation);
    }
  }
  const unconfirmed = normalizeStockTrade({ ...fixture.status, confirmationCommitment: 'processed' });
  assert.equal(unconfirmed.confirmationCommitment, null);
  assert.equal(unconfirmed.confirmedExecutionOutcome, false);
  assert.equal(unconfirmed.recovery.kind, 'reconcile');
});

test('landed business execution proves confirmed failure without a top-level landing flag', () => {
  const payload = executionPayload();
  Object.assign(payload.business, { executionSucceeded: false, settlement: 'landed', programError: true });
  const model = normalizeStockTrade(payload);
  assert.equal(model.confirmedExecutionOutcome, true);
  assert.equal(model.landingProof, null);
  assert.equal(model.recovery.kind, 'none');
});

test('saved widget contradictions cannot suppress recovery as confirmed failure', () => {
  const fixture = receiptFixture();
  delete fixture.status.receiptOutcome;
  Object.assign(fixture.status, { executionSucceeded: false, reconciliationKind: 'landed_program_error' });
  for (const [name, mutate, recoveryKind] of [
    ['ambiguous without landing proof', body => Object.assign(body, {
      landingProof: false, ledgerState: 'ambiguous', status: 'ambiguous',
    }), 'reconcile'],
    ['definitive nonlanding', body => { body.definitiveNonlandingProof = true; }, 'none'],
    ['different durable identity', body => {
      body.stockV2Identity.intentId = '11111111-1111-4111-8111-111111111111';
    }, 'reconcile'],
  ]) {
    const body = structuredClone(fixture.status);
    mutate(body);
    const strict = normalizeGovernedAssetResult({ operation: 'status', httpStatus: 200,
      input: { intentId: fixture.status.intentId }, body });
    assert.equal(strict.isError, true, name);
    const model = normalizeStockTrade(body);
    assert.equal(model.confirmedExecutionOutcome, false, name);
    assert.equal(model.recovery.kind, recoveryKind, name);
    if (body.definitiveNonlandingProof) {
      assert.equal(model.supporting, 'Dexter proved that this transaction did not land.');
    }
  }
});

test('atomic decimal formatting keeps financial values exact', () => {
  assert.equal(formatAtomicDecimal('1349344730', 6, 6), '1,349.34473');
  assert.equal(formatAtomicDecimal('1500000000', 6, 6), '1,500');
  assert.equal(formatAtomicDecimal('1', 9, 9), '0.000000001');
  assert.equal(formatAtomicDecimal('1.5', 6), null);
});

test('normalizes a generic dollar-budget buy without inventing shares', () => {
  const payload = preparedPayload();
  payload.preview.assetId = 'dexter';
  payload.preview.symbol = 'DEXTER';
  payload.preview.amountAtomic = '1000000';
  payload.preview.expectedOutputAtomic = '2500000';
  payload.preview.minimumOutputAtomic = '2400000';
  payload.preview.productIdentity = {
    ...productIdentity(),
    assetId: 'dexter',
    assetClass: 'token',
    companyName: null,
    productName: 'Dexter',
    symbol: 'DEXTER',
    providerName: null,
    legalIssuerName: null,
    issuer: 'Dexter',
    tokenProgram: 'spl-token',
  };
  delete payload.preview.requestedMaximumSpendAtomic;
  delete payload.preview.maximumInputAmountAtomic;
  delete payload.preview.requestedShareQuantity;
  delete payload.preview.expectedShareQuantity;
  delete payload.preview.minimumShareQuantity;
  delete payload.preview.shareQuantityUnit;
  delete payload.preview.shareQuantitySemantics;
  delete payload.preview.overfillPossible;

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.isShareQuantityOrder, false);
  assert.equal(model.requestAmountKind, 'input');
  assert.equal(model.headline, 'Buy $1 of Dexter');
  assert.equal(model.quotedSpend, '1');
  assert.equal(model.expectedOutput, '2.5');
  assert.equal(model.minimumOutput, '2.4');
  assert.equal(model.requestedShareQuantity, null);
});

test('stock dollar-budget output stays token-denominated without a multiplier claim', () => {
  const payload = preparedPayload();
  payload.preview.amountAtomic = '500000000';
  payload.preview.expectedOutputAtomic = '3750000';
  payload.preview.minimumOutputAtomic = '3700000';
  delete payload.preview.requestedMaximumSpendAtomic;
  delete payload.preview.maximumInputAmountAtomic;
  delete payload.preview.requestedShareQuantity;
  delete payload.preview.expectedShareQuantity;
  delete payload.preview.minimumShareQuantity;
  delete payload.preview.shareQuantityUnit;
  delete payload.preview.shareQuantitySemantics;
  delete payload.preview.overfillPossible;

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.product.assetClass, 'stock');
  assert.equal(model.isShareQuantityOrder, false);
  assert.equal(model.expectedOutput, '3.75');
  assert.equal(model.minimumOutput, '3.7');
  assert.equal(model.expectedShareQuantity, null);
});

test('sell preview uses sell wording and token-denominated proceeds', () => {
  const payload = preparedPayload();
  payload.preview.action = 'sell';
  payload.preview.amountAtomic = '2000000';
  payload.preview.expectedOutputAtomic = '265000000';
  payload.preview.minimumOutputAtomic = '262000000';
  for (const field of [
    'requestedMaximumSpendAtomic',
    'maximumInputAmountAtomic',
    'requestedShareQuantity',
    'expectedShareQuantity',
    'minimumShareQuantity',
    'shareQuantityUnit',
    'shareQuantitySemantics',
    'overfillPossible',
  ]) {
    delete payload.preview[field];
  }

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.headline, 'Sell 2 SPCX of SpaceX');
  assert.equal(model.supporting, 'This exact action is prepared. Nothing has been signed or submitted.');
  assert.equal(model.inputAssetAmount, '2');
  assert.equal(model.expectedOutput, '265');
  assert.equal(model.minimumOutput, '262');
});

test('prepared Send leads with exact amount and destination without claiming dispatch', () => {
  const payload = preparedPayload();
  payload.preview.action = 'send';
  payload.preview.amountAtomic = '2500000';
  payload.preview.maximumInputAmountAtomic = '2500000';
  payload.preview.destinationOwner = '11111111111111111111111111111111';
  payload.preview.productIdentity = {
    ...payload.preview.productIdentity,
    assetId: 'usdc',
    assetClass: 'cash',
    companyName: null,
    productName: 'USD Coin',
    symbol: 'USDC',
    providerName: null,
    legalIssuerName: null,
    issuer: 'Circle',
    decimals: 6,
  };

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.action, 'send');
  assert.equal(model.stage, 'prepared');
  assert.equal(model.amountDisplay, '2.5');
  assert.equal(model.amountUnit, 'USDC');
  assert.equal(model.destinationOwner, '11111111111111111111111111111111');
  assert.equal(model.headline, 'Send 2.5 USDC to 11111...11111');
  assert.equal(model.submitted, null);
});

test('history Send keeps exact base units when durable status has no certified decimals', () => {
  const model = normalizeStockTrade({
    namespace: 'dexter-governed-transaction-status/v1',
    status: 'confirmed',
    intentId: '33333333-3333-4333-8333-333333333333',
    action: 'send',
    assetId: 'usdc',
    assetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenProgram: 'spl-token',
    amountAtomic: '2500000',
    destinationOwner: '11111111111111111111111111111111',
    transactionSignature: SIGNATURE,
    confirmationCommitment: 'confirmed',
    executionSucceeded: true,
  });

  assert.ok(model);
  assert.equal(model.operation, 'status');
  assert.equal(model.stage, 'success');
  assert.equal(model.amountDisplay, '2,500,000');
  assert.equal(model.amountUnit, 'usdc base units');
  assert.equal(model.headline, '2,500,000 usdc base units sent to 11111...11111');
});

test('owner approval remains out of band and visible in the model', () => {
  const payload = preparedPayload();
  payload.approval = {
    status: 'owner-approval-required',
    reasons: ['counterparty_requires_owner'],
  };

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.approvalRequired, true);
  assert.equal(model.ownerDecision, 'pending');
  assert.deepEqual(model.approvalReasons, ['counterparty_requires_owner']);
});

test('ambiguous execution requires same-intent reconciliation and forbids execute retry', () => {
  const payload = statusPayload({
    status: 'ambiguous',
    confirmationCommitment: null,
    executionSucceeded: null,
    reconciliationRequired: true,
    canReconcile: true,
    submitted: true,
    replay: {
      statusReadSafe: true,
      reconcileSameAttemptOnly: true,
      executeFromStatusForbidden: true,
    },
  });

  const model = normalizeStockTrade(payload);

  assert.ok(model);
  assert.equal(model.stage, 'pending');
  assert.equal(model.stageLabel, 'Outcome unknown');
  assert.equal(model.recovery.kind, 'reconcile');
  assert.match(model.recovery.sentence, /Do not execute again/);
  assert.equal(model.reconcileSameAttemptOnly, true);
  assert.equal(model.executeFromStatusForbidden, true);
});

test('execute transport uncertainty never becomes a failed or retryable transaction', () => {
  const model = normalizeStockTrade({
    namespace: 'opendexter-governed-backend-failure/v1',
    operation: 'execute',
    status: 'unknown',
    operationId: 'operation-1234',
    intentId: '33333333-3333-4333-8333-333333333333',
    code: 'governed_backend_transport_failed',
    explanation: 'The execute request may have reached Dexter, but no result was received.',
    retry: 'reconcile_same_intent_only',
  });

  assert.ok(model);
  assert.equal(model.operation, 'execute');
  assert.equal(model.stage, 'pending');
  assert.equal(model.stageLabel, 'Outcome unknown');
  assert.equal(model.recovery.kind, 'reconcile');
  assert.match(model.recovery.sentence, /same intent only/);
});

test('history normalizes every valid action and keeps pagination opaque', () => {
  const stock = dynamicStockV2Fixture(
    'tesla',
    '019f981c-9215-7141-84f2-d89ffe9cbece',
  ).status;
  const pending = statusPayload({
    status: 'submitted',
    confirmationCommitment: null,
    executionSucceeded: null,
  });
  const history = normalizeGovernedHistory({
    namespace: 'dexter-governed-transaction-history/v1',
    items: [stock, pending],
    nextCursor: 'opaque-next-page',
  });

  assert.ok(history);
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].headline, '1.25 shares of Tesla, Inc. bought');
  assert.equal(history.items[1].stage, 'pending');
  assert.equal(history.hasMore, true);
  assert.equal(history.nextCursor, 'opaque-next-page');
  assert.equal(history.omittedItems, 0);
});
