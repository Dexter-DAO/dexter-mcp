import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePurchaseReceipt,
} from '../apps-sdk/ui/src/components/receipt/purchase-receipt-model.ts';

const base = {
  contractVersion: 'opendexter.purchase.v1',
  receiptId: 'receipt-12345678',
  preparedId: 'prepared-12345678',
  routeId: 'route-12345678',
  sellerOfferId: 'offer-12345678',
  dispatch: 'dispatched',
  retry: 'reconcile_only',
  correlationId: 'correlation-1',
};

const settlement = {
  state: 'settled',
  amountAtomic: '5000',
  network: 'solana:mainnet',
  asset: 'USDC',
  transaction: 'transaction-1',
};

test('direct receipt states seller settlement without collapsing other modes', () => {
  const receipt = normalizePurchaseReceipt({
    ...base,
    mode: 'direct_exact',
    sellerSettlement: settlement,
  });

  assert.equal(receipt?.title, 'Seller paid directly');
  assert.equal(receipt?.sellerSettled, true);
  assert.match(receipt?.retryNote ?? '', /Do not retry automatically/);
});

test('native Tab keeps voucher acceptance separate from cash settlement', () => {
  const receipt = normalizePurchaseReceipt({
    ...base,
    mode: 'native_tab',
    voucher: {
      state: 'accepted',
      incrementAtomic: '5000',
      cumulativeAtomic: '15000',
      channelId: 'channel-1',
      sequenceNumber: '3',
    },
    sellerCashSettlement: 'not_settled',
  });

  assert.equal(receipt?.title, 'Seller tab accepted');
  assert.equal(receipt?.sellerSettled, false);
  assert.deepEqual(
    receipt?.rows.slice(0, 2),
    [
      { label: 'Tab voucher', value: 'Accepted' },
      { label: 'Seller cash settlement', value: 'Not Settled' },
    ],
  );
});

test('Gateway cash keeps buyer cash separate from seller settlement', () => {
  const receipt = normalizePurchaseReceipt({
    ...base,
    mode: 'gateway_cash',
    buyerCash: { state: 'charged' },
    sellerSettlement: settlement,
  });

  assert.equal(receipt?.title, 'Seller paid through Gateway cash');
  assert.equal(receipt?.rows[0]?.label, 'Buyer cash');
  assert.equal(receipt?.rows[1]?.label, 'Seller settlement');
});

test('Gateway credit presents exposure, obligation, and settlement independently', () => {
  const receipt = normalizePurchaseReceipt({
    ...base,
    mode: 'gateway_credit',
    exposure: { state: 'reserved' },
    buyerObligation: { state: 'finalized', claimId: 'claim-1' },
    sellerSettlement: settlement,
  });

  assert.equal(receipt?.title, 'Seller paid; credit obligation finalized');
  assert.deepEqual(
    receipt?.rows.slice(0, 3),
    [
      { label: 'Credit exposure', value: 'Reserved' },
      { label: 'Buyer obligation', value: 'Finalized' },
      { label: 'Claim', value: 'claim-1' },
    ],
  );
});

test('uncertain dispatched receipts direct the caller to reconciliation only', () => {
  const receipt = normalizePurchaseReceipt({
    ...base,
    mode: 'direct_exact',
    sellerSettlement: { ...settlement, state: 'unconfirmed', transaction: null },
  });

  assert.equal(receipt?.title, 'Direct settlement unconfirmed');
  assert.equal(receipt?.tone, 'warning');
  assert.match(receipt?.retryNote ?? '', /Do not retry automatically/);
});

test('malformed or unversioned receipts are not rendered', () => {
  assert.equal(normalizePurchaseReceipt(null), null);
  assert.equal(normalizePurchaseReceipt({ ...base, mode: 'direct_exact' }), null);
  assert.equal(
    normalizePurchaseReceipt({
      ...base,
      contractVersion: 'other',
      mode: 'direct_exact',
      sellerSettlement: settlement,
    }),
    null,
  );
});
