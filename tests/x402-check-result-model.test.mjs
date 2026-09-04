import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeX402CheckResult,
  normalizeX402PaymentRoutes,
} from '../apps-sdk/ui/src/components/x402/check-result-model.ts';
import {
  isSearchCheckRequestBound,
} from '../apps-sdk/ui/src/components/indexter/search/utils.ts';

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
  assert.equal(state.summary, 'Current quote: $0.01 on eip155:8453.');
  assert.equal(state.nextStep, 'review-payment');
  assert.equal(state.paymentStatus, 'not_attempted');
  assert.equal(state.paymentOccurred, false);
  assert.equal('purchaseOptions' in state, false);
  assert.deepEqual(state.checkedRequest, {
    targetKind: 'direct_url',
    url: 'https://merchant.example/quote',
    resourceId: null,
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

test('preserves a managed resource target without inventing or exposing a URL', () => {
  const resourceId = 'f617448d-62b1-44f1-a27f-80cff197d855';
  const state = normalizeX402CheckResult({
    ok: true,
    requiresPayment: true,
    intentId: 'intent-managed-1',
    statusCode: 402,
    authMode: 'paid',
    paymentOptions: [baseRoute],
    checkedRequest: {
      resourceId,
      method: 'POST',
      body: '{"query":"AAPL"}',
      requestBound: true,
    },
    resourceIdentity: {
      kind: 'endpoint',
      resourceId,
      displayName: 'Ticker details',
      description: 'Current company and listing details.',
      merchant: {
        providerKey: 'massive',
        providerSlug: 'massive',
        displayName: 'Massive',
        logoUrl: 'https://assets.example/massive.svg',
        technicalHost: null,
      },
    },
  });

  assert.deepEqual(state.checkedRequest, {
    targetKind: 'managed_resource',
    url: null,
    resourceId,
    method: 'POST',
    body: '{"query":"AAPL"}',
    requestBound: true,
  });
  assert.equal(state.resourceIdentity?.merchant.displayName, 'Massive');
  assert.equal(state.resourceIdentity?.displayName, 'Ticker details');
  assert.equal(JSON.stringify(state).includes('assets.example'), true);
  assert.equal(JSON.stringify(state).includes('paysponge'), false);
});

test('rejects ambiguous targets and mismatched managed identity', () => {
  const resourceId = 'f617448d-62b1-44f1-a27f-80cff197d855';
  const ambiguous = normalizeX402CheckResult({
    checkedRequest: {
      url: 'https://merchant.example/quote',
      resourceId,
      method: 'GET',
      requestBound: true,
    },
  });
  const mismatched = normalizeX402CheckResult({
    checkedRequest: {
      resourceId,
      method: 'GET',
      requestBound: true,
    },
    resourceIdentity: {
      kind: 'endpoint',
      resourceId: '37f59863-9170-442f-97e0-4464ce949042',
      displayName: 'Wrong resource',
      description: null,
      merchant: {
        providerKey: null,
        providerSlug: null,
        displayName: 'Wrong merchant',
        logoUrl: null,
        technicalHost: null,
      },
    },
  });

  assert.equal(ambiguous.checkedRequest, null);
  assert.equal(mismatched.checkedRequest?.targetKind, 'managed_resource');
  assert.equal(mismatched.resourceIdentity, null);
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
  assert.equal(state.summary, 'Available without payment.');
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
  assert.equal(state.summary, 'Sign in with a compatible wallet to continue.');
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
    'Authenticate to use the 2 payment routes from $0.01 to $0.05 quote.',
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
    assert.doesNotMatch(state.summary, /made no payment/i);
  }
});

test('pre-payment truth remains structured without repetitive reader copy', () => {
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
    assert.doesNotMatch(state.summary, /made no payment/i);
    assert.doesNotMatch(
      state.summary,
      /\b(?:you paid|payment (?:was|has been) (?:sent|settled|completed))\b/i,
    );
  }
});
