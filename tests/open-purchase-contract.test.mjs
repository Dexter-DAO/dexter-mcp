import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PURCHASE_CONTRACT_VERSION,
  PURCHASE_MODES,
  attachPurchaseReceipt,
  buildPurchaseIntegrationRequired,
  buildPurchaseOptions,
  sellerAcceptSha256,
  validatePurchaseExecution,
} from '../lib/open-purchase-contract.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import {
  normalizePreparedPurchaseOptions,
} from '../apps-sdk/ui/src/components/x402/purchase-model.ts';

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/purchase-contract-v1.json', import.meta.url),
    'utf8',
  ),
);

function options(surface = 'hosted', checkResult = fixture.checkResult) {
  let index = 0;
  return buildPurchaseOptions({
    checkResult,
    url: fixture.resourceUrl,
    method: fixture.method,
    payload: fixture.payload,
    requestBound: true,
    surface,
    now: () => new Date(fixture.preparedAt),
    idFactory: () => fixture.preparedIds[index++],
  });
}

function rawAcceptFor(option, extra = {}) {
  return {
    scheme: option.scheme,
    network: option.network,
    asset: option.asset,
    amount: option.amountAtomic,
    payTo: option.payTo,
    extra: {
      facilitator: option.facilitator,
      expiresAt: option.expiresAt,
      ...extra,
    },
  };
}

function withOfferWitness(option, extra = {}) {
  return {
    ...option,
    rawAcceptSha256: sellerAcceptSha256(rawAcceptFor(option, extra)),
  };
}

test('canonical fixture exposes all four explicit modes without changing the seller route', () => {
  const prepared = options('local');
  assert.equal(PURCHASE_CONTRACT_VERSION, fixture.contractVersion);
  assert.deepEqual(PURCHASE_MODES, [
    'direct_exact',
    'native_tab',
    'gateway_cash',
    'gateway_credit',
  ]);
  assert.deepEqual(prepared.map((entry) => entry.mode), [
    'direct_exact',
    'gateway_cash',
    'gateway_credit',
    'native_tab',
  ]);

  const [direct, cash, credit, tab] = prepared;
  assert.equal(direct.preparedPurchase.route.routeId, cash.preparedPurchase.route.routeId);
  assert.equal(cash.preparedPurchase.route.routeId, credit.preparedPurchase.route.routeId);
  assert.notEqual(tab.preparedPurchase.route.routeId, direct.preparedPurchase.route.routeId);
  assert.equal(direct.preparedPurchase.route.sellerOffer.amountAtomic, '10000');
  assert.equal(typeof direct.preparedPurchase.route.sellerOffer.amountAtomic, 'string');
  assert.equal(direct.availability.state, 'ready');
  assert.equal(tab.availability.state, 'ready');
  assert.equal(cash.availability.state, 'integration_required');
  assert.equal(credit.availability.state, 'integration_required');
  assert.equal(
    direct.preparedPurchase.route.resolvedUrl,
    fixture.resourceUrl,
  );
});

test('seller offer witness is canonical, complete, and shared with the fixture', () => {
  const option = fixture.checkResult.paymentOptions[0];
  const raw = rawAcceptFor(option);
  assert.equal(sellerAcceptSha256(raw), option.rawAcceptSha256);
  assert.equal(
    sellerAcceptSha256({
      payTo: raw.payTo,
      amount: raw.amount,
      extra: {
        expiresAt: raw.extra.expiresAt,
        facilitator: raw.extra.facilitator,
      },
      asset: raw.asset,
      network: raw.network,
      scheme: raw.scheme,
    }),
    option.rawAcceptSha256,
  );
  assert.notEqual(
    sellerAcceptSha256({
      ...raw,
      extra: { ...raw.extra, feePayer: 'DIFFERENT_FEE_PAYER' },
    }),
    option.rawAcceptSha256,
  );
});

test('hosted options expose unsupported modes without pretending they are executable', () => {
  const prepared = options('hosted');
  const availability = Object.fromEntries(
    prepared.map((entry) => [entry.mode, entry.availability]),
  );
  assert.deepEqual(availability.direct_exact, {
    state: 'integration_required',
    reason: 'hosted_direct_exact_contract_required',
  });
  assert.equal(availability.native_tab.state, 'integration_required');
  assert.equal(availability.gateway_cash.state, 'integration_required');
  assert.equal(availability.gateway_credit.state, 'integration_required');
});

test('hosted Direct Exact does not claim an EVM seller route is wallet-payable', () => {
  const checkResult = structuredClone(fixture.checkResult);
  checkResult.paymentOptions = [withOfferWitness({
    ...fixture.checkResult.paymentOptions[0],
    network: 'eip155:8453',
  })];
  const [direct, cash, credit] = options('hosted', checkResult);
  assert.equal(direct.mode, 'direct_exact');
  assert.deepEqual(direct.availability, {
    state: 'unavailable',
    reason: 'hosted_direct_network_not_supported',
  });
  assert.equal(cash.availability.state, 'integration_required');
  assert.equal(credit.availability.state, 'integration_required');
});

test('route identity preserves same-network offers that differ by asset', () => {
  const checkResult = structuredClone(fixture.checkResult);
  checkResult.paymentOptions = [
    fixture.checkResult.paymentOptions[0],
    withOfferWitness({
      ...fixture.checkResult.paymentOptions[0],
      asset: 'PYUSD_MINT',
    }),
  ];
  const prepared = options('hosted', checkResult).filter(
    (entry) => entry.mode === 'direct_exact',
  );
  assert.equal(prepared.length, 2);
  assert.notEqual(
    prepared[0].preparedPurchase.route.routeId,
    prepared[1].preparedPurchase.route.routeId,
  );
  assert.notEqual(
    prepared[0].preparedPurchase.route.sellerOffer.offerId,
    prepared[1].preparedPurchase.route.sellerOffer.offerId,
  );
});

test('execution validation pins URL, method, body, mode, offer, route, and ceiling', () => {
  const purchase = options('local')[0].preparedPurchase;
  const valid = validatePurchaseExecution({
    purchase,
    url: fixture.resourceUrl,
    method: fixture.method,
    payload: fixture.payload,
    approvedAmountCeilingAtomic: '10000',
  });
  assert.equal(valid.ok, true);

  for (const [field, value, code] of [
    ['url', 'https://merchant.example/other', 'purchase_request_mismatch'],
    ['payload', '{"q":"stocks"}', 'purchase_payload_mismatch'],
    ['approvedAmountCeilingAtomic', '9999', 'purchase_ceiling_exceeded'],
  ]) {
    const result = validatePurchaseExecution({
      purchase,
      url: fixture.resourceUrl,
      method: fixture.method,
      payload: fixture.payload,
      approvedAmountCeilingAtomic: '10000',
      [field]: value,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }

  const changedMode = structuredClone(purchase);
  changedMode.mode = 'native_tab';
  const mismatch = validatePurchaseExecution({
    purchase: changedMode,
    url: fixture.resourceUrl,
    method: fixture.method,
    payload: fixture.payload,
    approvedAmountCeilingAtomic: '10000',
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'purchase_mode_offer_mismatch');

  const changedExpiry = structuredClone(purchase);
  changedExpiry.expiresAt = '2030-01-01T00:00:00.000Z';
  const expiryMismatch = validatePurchaseExecution({
    purchase: changedExpiry,
    url: fixture.resourceUrl,
    method: fixture.method,
    payload: fixture.payload,
    approvedAmountCeilingAtomic: '10000',
  });
  assert.equal(expiryMismatch.ok, false);
  assert.equal(expiryMismatch.code, 'purchase_expiry_mismatch');
});

test('non-GET pricing without the exact body is not execution-ready', () => {
  const prepared = buildPurchaseOptions({
    checkResult: fixture.checkResult,
    url: fixture.resourceUrl,
    method: 'POST',
    payload: '{}',
    requestBound: false,
    surface: 'hosted',
  });
  assert.ok(prepared.length > 0);
  assert.ok(
    prepared.every(
      (entry) => entry.availability.state === 'request_required',
    ),
  );
});

test('mode-specific unavailable receipts do not collapse cash, Tab, and credit', () => {
  for (const entry of options('local')) {
    const purchase = {
      ...entry.preparedPurchase,
      approvedAmountCeilingAtomic: '10000',
    };
    const result = buildPurchaseIntegrationRequired(
      entry.preparedPurchase,
      '10000',
      `${entry.mode}_adapter_required`,
    );
    const receipt = result.purchaseReceipt;
    assert.equal(receipt.mode, entry.mode);
    assert.equal(receipt.dispatch, 'not_dispatched');
    assert.equal(receipt.retry, 'integration_required');
    if (entry.mode === 'native_tab') {
      assert.equal(receipt.voucher.state, 'not_issued');
      assert.equal(receipt.sellerCashSettlement, 'not_settled');
    } else if (entry.mode === 'gateway_cash') {
      assert.equal(receipt.buyerCash.state, 'not_committed');
    } else if (entry.mode === 'gateway_credit') {
      assert.equal(receipt.exposure.state, 'not_reserved');
      assert.equal(receipt.buyerObligation.state, 'not_finalized');
    } else {
      assert.equal(receipt.sellerSettlement.state, 'not_dispatched');
    }
    assert.equal(purchase.approvedAmountCeilingAtomic, '10000');
  }
});

test('a dispatched legacy result without a typed backend receipt becomes reconciliation-only', () => {
  const purchase = options('hosted')[0].preparedPurchase;
  const result = attachPurchaseReceipt(
    {
      status: 200,
      payment: { dispatched: true, settled: true },
    },
    {
      ...purchase,
      approvedAmountCeilingAtomic: '10000',
    },
  );
  assert.equal(result.purchaseReceipt.mode, 'direct_exact');
  assert.equal(result.purchaseReceipt.dispatch, 'dispatched');
  assert.equal(result.purchaseReceipt.retry, 'reconcile_only');
  assert.equal(result.purchaseReceipt.sellerSettlement.state, 'unconfirmed');
  assert.equal(result.retryable, false);
});

test('a backend receipt must match the selected offer, ceiling, and retry state', () => {
  const prepared = options('hosted')[0].preparedPurchase;
  const purchase = {
    ...prepared,
    approvedAmountCeilingAtomic: '10000',
  };
  const validReceipt = {
    contractVersion: PURCHASE_CONTRACT_VERSION,
    receiptId: 'receipt-12345678',
    preparedId: purchase.preparedId,
    routeId: purchase.route.routeId,
    sellerOfferId: purchase.route.sellerOffer.offerId,
    mode: 'direct_exact',
    dispatch: 'dispatched',
    retry: 'none',
    correlationId: 'correlation-1',
    approvedAmountCeilingAtomic: '10000',
    sellerSettlement: {
      state: 'settled',
      amountAtomic: purchase.route.sellerOffer.amountAtomic,
      network: purchase.route.sellerOffer.network,
      asset: purchase.route.sellerOffer.asset,
      transaction: 'transaction-1',
    },
  };
  const accepted = attachPurchaseReceipt(
    { status: 200, payment: { dispatched: true, settled: true } },
    purchase,
    { backendReceipt: validReceipt },
  );
  assert.deepEqual(accepted.purchaseReceipt, validReceipt);
  assert.equal(accepted.payment.dispatched, true);
  assert.equal(accepted.payment.settled, true);

  const settlementContradiction = attachPurchaseReceipt(
    { status: 200, payment: { dispatched: true, settled: false } },
    purchase,
    { backendReceipt: validReceipt },
  );
  assert.notDeepEqual(settlementContradiction.purchaseReceipt, validReceipt);
  assert.equal(
    settlementContradiction.purchaseReceipt.sellerSettlement.state,
    'unconfirmed',
  );

  const rejected = attachPurchaseReceipt(
    { status: 200, payment: { dispatched: true, settled: true } },
    purchase,
    {
      backendReceipt: {
        ...validReceipt,
        sellerSettlement: {
          ...validReceipt.sellerSettlement,
          asset: 'DIFFERENT_ASSET',
        },
      },
    },
  );
  assert.equal(rejected.purchaseReceipt.sellerSettlement.state, 'unconfirmed');
  assert.equal(rejected.purchaseReceipt.retry, 'reconcile_only');

  const malformedCorrelation = attachPurchaseReceipt(
    { status: 200, payment: { dispatched: true, settled: true } },
    purchase,
    {
      backendReceipt: {
        ...validReceipt,
        correlationId: { unsafe: true },
      },
    },
  );
  assert.equal(
    malformedCorrelation.purchaseReceipt.sellerSettlement.state,
    'unconfirmed',
  );
  assert.equal(
    malformedCorrelation.purchaseReceipt.retry,
    'reconcile_only',
  );
});

test('Native Tab typed receipt requires complete voucher identity when accepted', () => {
  const prepared = options('local').find((entry) => entry.mode === 'native_tab');
  assert.ok(prepared);
  const purchase = {
    ...prepared.preparedPurchase,
    approvedAmountCeilingAtomic: '10000',
  };
  const incomplete = buildPurchaseIntegrationRequired(
    prepared.preparedPurchase,
    '10000',
    'test',
  ).purchaseReceipt;
  incomplete.dispatch = 'dispatched';
  incomplete.retry = 'none';
  incomplete.voucher.state = 'accepted';

  const rejected = attachPurchaseReceipt(
    { status: 200, payment: { dispatched: true, settled: false } },
    purchase,
    { backendReceipt: incomplete },
  );
  assert.equal(rejected.purchaseReceipt.voucher.state, 'unconfirmed');
  assert.equal(rejected.purchaseReceipt.retry, 'reconcile_only');

  const complete = structuredClone(incomplete);
  complete.voucher = {
    state: 'accepted',
    incrementAtomic: '10000',
    cumulativeAtomic: '30000',
    channelId: 'channel-1',
    sequenceNumber: '3',
  };
  const accepted = attachPurchaseReceipt(
    {
      status: 200,
      payment: { dispatched: true, settled: 'accrued_to_tab' },
    },
    purchase,
    { backendReceipt: complete },
  );
  assert.deepEqual(accepted.purchaseReceipt, complete);
  assert.equal(accepted.payment.settled, 'accrued_to_tab');
});

test('Gateway receipts require terminal settlement or explicit reconciliation', () => {
  const prepared = options('local');
  for (const mode of ['gateway_cash', 'gateway_credit']) {
    const entry = prepared.find((candidate) => candidate.mode === mode);
    assert.ok(entry);
    const purchase = {
      ...entry.preparedPurchase,
      approvedAmountCeilingAtomic: '10000',
    };
    const receipt = buildPurchaseIntegrationRequired(
      entry.preparedPurchase,
      '10000',
      'test',
    ).purchaseReceipt;
    receipt.dispatch = 'dispatched';
    receipt.retry = 'none';
    if (mode === 'gateway_cash') {
      receipt.buyerCash.state = 'charged';
    } else {
      receipt.exposure.state = 'reserved';
      receipt.buyerObligation = {
        state: 'finalized',
        claimId: 'claim-1',
      };
    }

    const rejected = attachPurchaseReceipt(
      { status: 200, payment: { dispatched: true, settled: false } },
      purchase,
      { backendReceipt: receipt },
    );
    assert.notDeepEqual(rejected.purchaseReceipt, receipt);
    assert.equal(rejected.purchaseReceipt.retry, 'reconcile_only');

    const terminal = structuredClone(receipt);
    terminal.sellerSettlement = {
      ...terminal.sellerSettlement,
      state: 'settled',
      transaction: 'seller-transaction-1',
    };
    const accepted = attachPurchaseReceipt(
      { status: 200, payment: { dispatched: true, settled: true } },
      purchase,
      { backendReceipt: terminal },
    );
    assert.deepEqual(accepted.purchaseReceipt, terminal);
    assert.equal(accepted.payment.settled, true);
  }
});

test('typed receipts reject contradictory dispatch and money states in every mode', () => {
  const prepared = options('local');
  const fixtures = prepared.map((entry) => {
    const purchase = {
      ...entry.preparedPurchase,
      approvedAmountCeilingAtomic: '10000',
    };
    const receipt = buildPurchaseIntegrationRequired(
      entry.preparedPurchase,
      '10000',
      'test',
    ).purchaseReceipt;
    if (entry.mode === 'native_tab') {
      receipt.voucher.state = 'accepted';
    } else if (entry.mode === 'gateway_cash') {
      receipt.buyerCash.state = 'charged';
      receipt.sellerSettlement.state = 'settled';
    } else if (entry.mode === 'gateway_credit') {
      receipt.exposure.state = 'reserved';
      receipt.buyerObligation.state = 'finalized';
      receipt.sellerSettlement.state = 'settled';
    } else {
      receipt.sellerSettlement.state = 'settled';
    }
    receipt.retry = 'none';
    return { purchase, receipt };
  });

  for (const { purchase, receipt } of fixtures) {
    const normalized = attachPurchaseReceipt(
      { status: 200, payment: { dispatched: false, settled: false } },
      purchase,
      { backendReceipt: receipt },
    );
    assert.notDeepEqual(normalized.purchaseReceipt, receipt);
    assert.equal(normalized.purchaseReceipt.dispatch, 'not_dispatched');
    assert.equal(normalized.purchaseReceipt.retry, 'new_prepare_required');
  }
});

test('known pre-dispatch continuation preserves only the same prepared identity', () => {
  const prepared = options('local')[0].preparedPurchase;
  const result = attachPurchaseReceipt(
    {
      status: 401,
      mode: 'authentication_required',
      payment: { dispatched: false, settled: false },
    },
    {
      ...prepared,
      approvedAmountCeilingAtomic: '10000',
    },
    { preDispatchRetry: 'same_prepared_only' },
  );
  assert.equal(result.purchaseReceipt.dispatch, 'not_dispatched');
  assert.equal(result.purchaseReceipt.retry, 'same_prepared_only');
  assert.equal(result.purchaseReceipt.sellerSettlement.state, 'not_dispatched');
});

test('hosted intent schemas reject caller-carried purchases and route receipts', () => {
  const checkOutput = OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse({
    intentId: 'opaque-intent-1',
    quoteOnly: false,
    requiresPayment: true,
    statusCode: 402,
    checkedRequest: {
      url: fixture.resourceUrl,
      method: fixture.method,
      body: fixture.payload,
      requestBound: true,
    },
    executionGuidance: {
      supportedPath: 'fetch_by_intent',
      readyForFetch: true,
      intentRequired: true,
      requiredCeilingField: 'maxAmountAtomic',
      fetchArguments: ['intentId', 'maxAmountAtomic'],
      dispatchAtMostOnce: true,
    },
  });
  assert.equal(checkOutput.success, true);
  const checkShape = OPEN_TOOL_CONTRACTS.x402_check.outputSchema.shape;
  assert.equal(Object.hasOwn(checkShape, 'purchaseContractVersion'), false);
  assert.equal(Object.hasOwn(checkShape, 'preparedPayload'), false);
  assert.equal(Object.hasOwn(checkShape, 'purchaseOptions'), false);

  const fetchOutput = OPEN_TOOL_CONTRACTS.x402_fetch.outputSchema.safeParse({
    intentId: 'opaque-intent-1',
    status: 'preparing',
    delivery: { state: 'not_dispatched' },
    payment: { state: 'not_built', confirmed: false },
    reconciliation: { required: false, performed: false },
    retryable: false,
    retryWithSameIntentOnly: true,
  });
  assert.equal(fetchOutput.success, true);
  assert.equal(
    OPEN_TOOL_CONTRACTS.x402_fetch.outputSchema.safeParse({
      intentId: 'opaque-intent-1',
      purchaseReceipt: { mode: 'direct_exact' },
    }).success,
    false,
  );
});

test('widget normalization rejects a prepared expiry that differs from the seller offer', () => {
  const prepared = options('hosted')[0];
  assert.equal(normalizePreparedPurchaseOptions([prepared]).length, 1);
  const changed = structuredClone(prepared);
  changed.preparedPurchase.expiresAt = '2031-01-01T00:00:00.000Z';
  assert.equal(normalizePreparedPurchaseOptions([changed]).length, 0);
});
