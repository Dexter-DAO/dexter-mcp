import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAtomicDecimal,
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

const SIGNATURE = '5'.repeat(88);

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
  assert.equal(model.stage, 'prepared');
  assert.equal(model.stageLabel, 'Preview');
  assert.equal(model.headline, 'Buy 10 shares of SpaceX');
  assert.match(model.supporting, /prepared, not yet bought/i);
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
  assert.equal(model.stage, 'success');
  assert.equal(model.stageLabel, 'Confirmed');
  assert.equal(model.headline, '10-share SpaceX purchase confirmed');
  assert.match(model.supporting, /Dexter reports that execution succeeded/);
  assert.equal(model.confirmationCommitment, 'confirmed');
  assert.equal(model.executionSucceeded, true);
  assert.equal(model.transactionSignature, SIGNATURE);
  assert.equal(model.solscanUrl, `https://solscan.io/tx/${SIGNATURE}`);
  assert.equal(model.finalizedEvidence, false);
});

test('status reconnect restores the exact 10-share SpaceX receipt terms', () => {
  const model = normalizeStockTrade(statusPayload());

  assert.ok(model);
  assert.equal(model.stage, 'success');
  assert.equal(model.headline, '10-share SpaceX purchase confirmed');
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
  assert.equal(model.stage, 'success');
  assert.equal(model.headline, '10-share SpaceX purchase confirmed');
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
  assert.equal(model.headline, 'Sell SpaceX');
  assert.equal(model.supporting, 'Review the exact Solana asset and quote. This is prepared, not yet sold.');
  assert.equal(model.inputAssetAmount, '2');
  assert.equal(model.expectedOutput, '265');
  assert.equal(model.minimumOutput, '262');
});
