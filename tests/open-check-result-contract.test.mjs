import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostedCheckModelResult } from '../lib/open-check-result.mjs';

test('Hermes-visible check result contains only the supported request-and-ceiling path', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
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
    sampleInputBody: { q: 'weather' },
    sampleInputBodyProvided: true,
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
    body: '{"q":"weather"}',
    requestBound: true,
  });
  assert.equal(
    structuredContent.executionGuidance.supportedPath,
    'check_then_fetch',
  );
  assert.equal(
    Object.hasOwn(structuredContent.executionGuidance, 'omitPurchase'),
    false,
  );
  assert.equal(
    structuredContent.executionGuidance.requiredCeilingField,
    'maxAmountAtomic',
  );
});

test('non-GET check without a body requires body formation and a recheck', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: { requiresPayment: true, statusCode: 402, authMode: 'paid' },
    url: 'https://seller.example/query',
    method: 'POST',
    sampleInputBodyProvided: false,
  });

  assert.equal(structuredContent.checkedRequest.body, null);
  assert.equal(structuredContent.checkedRequest.requestBound, false);
  assert.equal(structuredContent.executionGuidance.readyForFetch, false);
  assert.equal(
    structuredContent.executionGuidance.supportedPath,
    'form_body_then_recheck',
  );
});
