import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostedCheckModelResult } from '../lib/open-check-result.mjs';

test('Hermes-visible check result contains only the supported request-and-ceiling path', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      intentId: 'intent-opaque-1',
      requiresPayment: true,
      statusCode: 402,
      authMode: 'paid',
      paymentOptions: [{ amountAtomic: '2500', network: 'eip155:8453' }],
      purchaseContractVersion: 'opendexter.purchase.v1',
      preparedPayload: '{"q":"weather"}',
      purchaseOptions: [{
        mode: 'gateway_cash',
        preparedPurchase: { preparedId: 'prepared-candidate' },
      }],
    },
    url: 'https://seller.example/weather',
    method: 'POST',
    rawBody: '{\n  "q": "weather"\n}',
    rawBodyProvided: true,
  });
  const content = JSON.stringify(structuredContent);
  const hermesVisibleResult = JSON.stringify({ content, structuredContent });

  assert.doesNotMatch(
    hermesVisibleResult,
    /purchaseOptions|preparedPurchase|purchaseContractVersion|preparedPayload/,
  );
  assert.deepEqual(structuredContent.checkedRequest, {
    url: 'https://seller.example/weather',
    method: 'POST',
    body: '{\n  "q": "weather"\n}',
    requestBound: true,
  });
  assert.equal(
    structuredContent.executionGuidance.supportedPath,
    'fetch_by_intent',
  );
  assert.equal(
    Object.hasOwn(structuredContent.executionGuidance, 'omitPurchase'),
    false,
  );
  assert.equal(
    structuredContent.executionGuidance.requiredCeilingField,
    'maxAmountAtomic',
  );
  assert.deepEqual(structuredContent.executionGuidance.fetchArguments, [
    'intentId',
    'maxAmountAtomic',
  ]);
  assert.equal(structuredContent.quoteOnly, false);
});

test('non-GET check without a body requires body formation and a recheck', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: { requiresPayment: true, statusCode: 402, authMode: 'paid' },
    url: 'https://seller.example/query',
    method: 'POST',
    rawBodyProvided: false,
  });

  assert.equal(structuredContent.checkedRequest.body, null);
  assert.equal(structuredContent.checkedRequest.requestBound, false);
  assert.equal(structuredContent.executionGuidance.readyForFetch, false);
  assert.equal(
    structuredContent.executionGuidance.supportedPath,
    'form_body_then_recheck',
  );
});

test('anonymous check is quote-only and cannot produce an executable intent', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      requiresPayment: true,
      statusCode: 402,
      paymentOptions: [{ amountAtomic: '2500', network: 'solana:mainnet' }],
      challenge: { accepts: ['must-not-leak'] },
      selectedRail: 'native_tab',
    },
    url: 'https://seller.example/query',
    method: 'GET',
  });

  assert.equal(structuredContent.intentId, null);
  assert.equal(structuredContent.quoteOnly, true);
  assert.equal(structuredContent.executionGuidance.readyForFetch, false);
  assert.equal(
    structuredContent.executionGuidance.supportedPath,
    'connect_then_recheck',
  );
  assert.doesNotMatch(JSON.stringify(structuredContent), /challenge|selectedRail/);
});

test('free and provider-authenticated quote states keep only typed public scalars', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      ok: true,
      free: true,
      authRequired: false,
      authMode: 'unprotected',
      message: 'No payment required.',
      // Malformed scalars from a provisional backend must not survive the
      // strict public output contract.
      unusedBoolean: true,
    },
    url: 'https://seller.example/free',
    method: 'GET',
  });

  assert.equal(structuredContent.ok, true);
  assert.equal(structuredContent.free, true);
  assert.equal(structuredContent.authRequired, false);
  assert.equal(structuredContent.authMode, 'unprotected');
  assert.equal(Object.hasOwn(structuredContent, 'unusedBoolean'), false);
});
