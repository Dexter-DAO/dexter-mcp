import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeX402CheckResult,
  normalizeX402PaymentRoutes,
} from '../apps-sdk/ui/src/components/x402/check-result-model.ts';
import {
  isSearchCheckRequestBound,
} from '../apps-sdk/ui/src/components/x402/search/utils.ts';

const baseRoute = {
  price: 0.01,
  priceFormatted: '$0.01',
  network: 'eip155:8453',
  asset: 'USDC',
  scheme: 'exact',
  payTo: '0xmerchant-a',
};

test('classifies a paid quote without implying that payment occurred', () => {
  const state = normalizeX402CheckResult({
    requiresPayment: true,
    intentId: 'intent-bound-1',
    quoteOnly: false,
    statusCode: 402,
    authMode: 'paid',
    paymentOptions: [baseRoute],
    purchaseOptions: [{ preparedPurchase: { preparedId: 'legacy' } }],
    checkedRequest: {
      url: 'https://merchant.example/quote',
      method: 'get',
      body: null,
      requestBound: true,
    },
  });

  assert.equal(state.classification, 'paid');
  assert.equal(state.intentId, 'intent-bound-1');
  assert.equal(state.quoteOnly, false);
  assert.equal(state.title, 'Payment required');
  assert.equal(state.summary, 'Current quote: $0.01 on eip155:8453. This check made no payment.');
  assert.equal(state.nextStep, 'review-payment');
  assert.equal(state.paymentStatus, 'not_attempted');
  assert.equal(state.paymentOccurred, false);
  assert.equal('purchaseOptions' in state, false);
  assert.deepEqual(state.checkedRequest, {
    url: 'https://merchant.example/quote',
    method: 'GET',
    body: null,
    requestBound: true,
  });
});

test('missing-intent or malformed check output remains quote-only', () => {
  const explicitQuoteOnly = normalizeX402CheckResult({
    requiresPayment: true,
    statusCode: 402,
    authMode: 'paid',
    paymentOptions: [baseRoute],
    intentId: null,
    quoteOnly: true,
  });
  const missingIntent = normalizeX402CheckResult({
    requiresPayment: true,
    statusCode: 402,
    authMode: 'paid',
    paymentOptions: [baseRoute],
    quoteOnly: false,
  });

  assert.equal(explicitQuoteOnly.intentId, null);
  assert.equal(explicitQuoteOnly.quoteOnly, true);
  assert.equal(missingIntent.intentId, null);
  assert.equal(missingIntent.quoteOnly, true);
});

test('search checks bind GET URLs but require a body before binding non-GET requests', () => {
  assert.equal(isSearchCheckRequestBound('GET'), true);
  assert.equal(isSearchCheckRequestBound(undefined), true);
  assert.equal(isSearchCheckRequestBound('POST'), false);
  assert.equal(isSearchCheckRequestBound('PUT'), false);
  assert.equal(isSearchCheckRequestBound('DELETE'), false);
});

test('preserves routes that differ by any route-identity field', () => {
  const routes = normalizeX402PaymentRoutes([
    baseRoute,
    { ...baseRoute, asset: 'PYUSD' },
    { ...baseRoute, scheme: 'upto' },
    { ...baseRoute, payTo: '0xmerchant-b' },
    { ...baseRoute, price: 0.02, priceFormatted: '$0.02' },
    { ...baseRoute, network: 'solana:mainnet' },
    // Only an exact duplicate tuple is redundant.
    { ...baseRoute, priceFormatted: '$0.0100' },
  ]);

  assert.equal(routes.length, 6);
  assert.deepEqual(
    routes.map(({ network, asset, scheme, payTo, price }) => ({
      network,
      asset,
      scheme,
      payTo,
      price,
    })),
    [
      {
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xmerchant-a',
        price: 0.01,
      },
      {
        network: 'eip155:8453',
        asset: 'PYUSD',
        scheme: 'exact',
        payTo: '0xmerchant-a',
        price: 0.01,
      },
      {
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'upto',
        payTo: '0xmerchant-a',
        price: 0.01,
      },
      {
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xmerchant-b',
        price: 0.01,
      },
      {
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xmerchant-a',
        price: 0.02,
      },
      {
        network: 'solana:mainnet',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xmerchant-a',
        price: 0.01,
      },
    ],
  );
  assert.equal(new Set(routes.map((route) => route.routeKey)).size, 6);
});

test('classifies free and unprotected results', () => {
  const state = normalizeX402CheckResult({
    requiresPayment: false,
    statusCode: 200,
    free: true,
    authMode: 'unprotected',
  });

  assert.equal(state.classification, 'free');
  assert.equal(state.requiresPayment, false);
  assert.equal(state.nextStep, 'use-without-payment');
  assert.match(state.summary, /no payment/i);
});

test('classifies SIWX identity gating separately from payment', () => {
  const state = normalizeX402CheckResult({
    requiresPayment: false,
    statusCode: 402,
    authMode: 'siwx',
    paymentOptions: [],
  });

  assert.equal(state.classification, 'siwx');
  assert.equal(state.requiresPayment, false);
  assert.equal(state.nextStep, 'sign-in');
  assert.match(state.summary, /wallet identity/i);
});

test('classifies API-key gating even though the canonical result sets error true', () => {
  const state = normalizeX402CheckResult({
    requiresPayment: false,
    statusCode: 401,
    error: true,
    authRequired: true,
    authMode: 'apiKey',
    message: 'Provider authentication required before x402 payment flow.',
  });

  assert.equal(state.classification, 'apiKey');
  assert.equal(state.requiresPayment, null);
  assert.equal(state.nextStep, 'authenticate');
  assert.equal(state.errorMessage, null);
});

test('classifies API-key plus paid access as hybrid', () => {
  const state = normalizeX402CheckResult({
    requiresPayment: true,
    statusCode: 402,
    authMode: 'apiKey+paid',
    paymentOptions: [
      baseRoute,
      {
        ...baseRoute,
        price: 0.05,
        priceFormatted: '$0.05',
        network: 'solana:mainnet',
      },
    ],
  });

  assert.equal(state.classification, 'hybrid');
  assert.equal(state.requiresPayment, true);
  assert.equal(state.nextStep, 'authenticate-then-review-payment');
  assert.equal(
    state.summary,
    'Authenticate first; the current quote is 2 payment routes from $0.01 to $0.05. This check made no payment.',
  );
});

test('maps unknown, malformed, and route-less paid probes to a safe error state', () => {
  const cases = [
    {
      authMode: 'unknown',
      statusCode: 500,
      error: true,
      message: 'Server error',
    },
    {
      authMode: 'paid',
      requiresPayment: true,
      statusCode: 402,
      paymentOptions: [],
    },
    null,
  ];

  for (const value of cases) {
    const state = normalizeX402CheckResult(value);
    assert.equal(state.classification, 'error');
    assert.equal(state.requiresPayment, null);
    assert.equal(state.nextStep, 'retry-check');
    assert.equal(state.paymentOccurred, false);
    assert.match(state.summary, /made no payment/i);
  }
});

test('every reader-facing classification explicitly remains pre-payment', () => {
  const inputs = [
    { authMode: 'paid', requiresPayment: true, statusCode: 402, paymentOptions: [baseRoute] },
    { authMode: 'unprotected', requiresPayment: false, statusCode: 200, free: true },
    { authMode: 'siwx', requiresPayment: false, statusCode: 402, paymentOptions: [] },
    { authMode: 'apiKey', requiresPayment: false, statusCode: 401, error: true },
    { authMode: 'apiKey+paid', requiresPayment: true, statusCode: 402, paymentOptions: [baseRoute] },
    { authMode: 'unknown', requiresPayment: false, statusCode: 500, error: true },
  ];

  for (const input of inputs) {
    const state = normalizeX402CheckResult(input);
    assert.equal(state.paymentStatus, 'not_attempted');
    assert.equal(state.paymentOccurred, false);
    assert.match(state.summary, /made no payment/i);
    assert.doesNotMatch(
      state.summary,
      /\b(?:you paid|payment (?:was|has been) (?:sent|settled|completed))\b/i,
    );
  }
});
