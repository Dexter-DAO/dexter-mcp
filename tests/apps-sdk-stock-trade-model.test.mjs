import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAtomicDecimal,
  normalizeStockTrade,
} from '../apps-sdk/ui/src/components/stock-trade/stock-trade-model.ts';

const SIGNATURE = '5'.repeat(88);
const MINT = 'S'.repeat(44);

function productIdentity() {
  return {
    assetId: 'backpack-spcx',
    assetClass: 'stock',
    companyName: 'SpaceX',
    productName: 'SpaceX',
    symbol: 'SPCX',
    issuer: 'Backpack Securities',
    network: 'solana-mainnet',
    mint: MINT,
    tokenProgram: 'token-2022',
    decimals: 6,
    registryIdentityDigest: 'e'.repeat(64),
  };
}

function feeSummary() {
  return {
    summary: 'Trading fees are included in this quote; network fee is calculated at execution.',
    platformFee: null,
    routeFees: [],
    networkFee: {
      status: 'not-yet-calculated',
      amountLamports: null,
    },
  };
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
      lifecycle: 'confirmed',
      finality: 'confirmed',
      executionSucceeded: true,
      programError: false,
      definitiveNonlandingProof: false,
      productIdentity: productIdentity(),
    },
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
  assert.equal(model.product.issuer, 'Backpack Securities');
  assert.equal(model.fees?.networkFeeStatus, 'not-yet-calculated');
});

test('confirmed signature plus successful execution is success', () => {
  const model = normalizeStockTrade(executionPayload());

  assert.ok(model);
  assert.equal(model.stage, 'success');
  assert.equal(model.stageLabel, 'Confirmed');
  assert.equal(model.headline, 'SpaceX purchase confirmed');
  assert.match(model.supporting, /Dexter reports that execution succeeded/);
  assert.equal(model.confirmationCommitment, 'confirmed');
  assert.equal(model.executionSucceeded, true);
  assert.equal(model.transactionSignature, SIGNATURE);
  assert.equal(model.solscanUrl, `https://solscan.io/tx/${SIGNATURE}`);
  assert.equal(model.finalizedEvidence, false);
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
