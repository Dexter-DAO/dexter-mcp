import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exactCheckRequestBody,
  exactAtomicString,
  sellerAcceptSha256,
} from './check.js';

const acceptA = {
  scheme: 'exact',
  network: 'solana:mainnet',
  asset: 'USDC_MINT',
  amount: '10000',
  payTo: 'SELLER',
  extra: {
    decimals: 6,
    feePayer: 'FEE_PAYER_A',
    smartWalletSupported: true,
  },
};

test('full seller accept witness is order-independent and extra-sensitive', () => {
  const reordered = {
    payTo: 'SELLER',
    extra: {
      smartWalletSupported: true,
      feePayer: 'FEE_PAYER_A',
      decimals: 6,
    },
    amount: '10000',
    asset: 'USDC_MINT',
    network: 'solana:mainnet',
    scheme: 'exact',
  };
  assert.equal(sellerAcceptSha256(acceptA), sellerAcceptSha256(reordered));
  assert.notEqual(
    sellerAcceptSha256(acceptA),
    sellerAcceptSha256({
      ...acceptA,
      extra: { ...acceptA.extra, feePayer: 'FEE_PAYER_B' },
    }),
  );
});

test('atomic amounts reject JSON numbers before precision can be implied', () => {
  assert.equal(exactAtomicString('9007199254740993'), '9007199254740993');
  assert.equal(exactAtomicString(9007199254740993), null);
  assert.equal(exactAtomicString('0'), null);
  assert.equal(exactAtomicString('1e6'), null);
});

test('raw check bodies retain lexical byte identity', () => {
  const raw = '{\n  "z": 1, "a": [ 2, 3 ]\n}\n';
  assert.equal(exactCheckRequestBody('POST', raw), raw);
  assert.equal(exactCheckRequestBody('GET', raw), undefined);
  assert.equal(exactCheckRequestBody('PUT', { z: 1, a: [2, 3] }), '{"z":1,"a":[2,3]}');
});
