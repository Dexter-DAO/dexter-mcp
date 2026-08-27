import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkedResponseData,
  exactCheckRequestBody,
  exactAtomicString,
  selectPaymentRequiredChallenge,
  sellerAcceptSha256,
} from './check.js';

test('unprotected JSON and text responses retain the provider result', async () => {
  assert.deepEqual(
    await checkedResponseData(new Response('{"price":42}', {
      headers: { 'content-type': 'application/json' },
    })),
    { price: 42 },
  );
  assert.equal(
    await checkedResponseData(new Response('available', {
      headers: { 'content-type': 'text/plain' },
    })),
    'available',
  );
});

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

test('header-only SIWX remains a wallet-proof challenge with no paid accepts', () => {
  const challenge = {
    x402Version: 2,
    accepts: [],
    resource: { url: 'https://seller.example/private' },
    extensions: {
      'sign-in-with-x': {
        info: { domain: 'seller.example', nonce: 'abc123' },
      },
    },
  };
  const encoded = Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64url');

  assert.deepEqual(selectPaymentRequiredChallenge({}, encoded), challenge);
});

test('a usable body challenge wins without consulting a conflicting header', () => {
  const body = { accepts: [acceptA], x402Version: 2 };
  const conflicting = Buffer.from(JSON.stringify({
    accepts: [],
    extensions: { 'sign-in-with-x': {} },
  }), 'utf8').toString('base64url');

  assert.equal(selectPaymentRequiredChallenge(body, conflicting), body);
});
