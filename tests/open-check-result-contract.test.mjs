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

test('authenticated checks do not expose backend route names through errors', () => {
  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      ok: false,
      error: 'native_tab_execution_disabled',
      message: 'Selected gateway credit rail is unavailable.',
    },
    url: 'https://seller.example/paid',
    method: 'GET',
  });

  assert.equal(structuredContent.error, 'purchase_unavailable');
  assert.equal(Object.hasOwn(structuredContent, 'message'), false);
  assert.doesNotMatch(JSON.stringify(structuredContent), /native|gateway|rail/i);
});

test('hosted check repairs only the schema while preserving live quote evidence', () => {
  const persistedSchema = {
    type: 'object',
    properties: { contents: { type: 'array' } },
    required: ['contents'],
    additionalProperties: false,
  };
  const livePaymentOptions = [{
    amountAtomic: '20000',
    network: 'solana:mainnet',
    payTo: 'seller-wallet',
  }];
  const enrichment = {
    resource: {
      input_schema: persistedSchema,
      input_schema_source: 'openapi',
      input_schema_rejected_sources: ['bazaar'],
    },
    history: [],
  };

  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      requiresPayment: true,
      statusCode: 402,
      authMode: 'paid',
      paymentOptions: livePaymentOptions,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    url: 'https://seller.example/v1/models/model:generateContent',
    method: 'POST',
    rawBodyProvided: false,
    enrichment,
    enrichmentSource: 'live_db',
  });

  assert.equal(structuredContent.inputSchema, persistedSchema);
  assert.equal(structuredContent.inputSchemaSource, 'openapi');
  assert.deepEqual(structuredContent.inputSchemaRejectedSources, ['bazaar']);
  assert.deepEqual(structuredContent.paymentOptions, livePaymentOptions);
  assert.equal(structuredContent.statusCode, 402);
  assert.equal(structuredContent.authMode, 'paid');
  assert.equal(structuredContent.enrichment, enrichment);
  assert.equal(structuredContent.enrichment_source, 'live_db');
});

test('hosted check labels an unchanged informative seller schema as live', () => {
  const liveSchema = {
    type: 'object',
    properties: { prompt: { type: 'string' } },
    required: ['prompt'],
    additionalProperties: false,
  };

  const structuredContent = buildHostedCheckModelResult({
    checkResult: {
      requiresPayment: true,
      statusCode: 402,
      paymentOptions: [{ amountAtomic: '1000', network: 'solana:mainnet' }],
      inputSchema: liveSchema,
    },
    url: 'https://seller.example/v1/generate',
    method: 'POST',
    rawBodyProvided: false,
    enrichment: null,
    enrichmentSource: 'not_found',
  });

  assert.equal(structuredContent.inputSchema, liveSchema);
  assert.equal(structuredContent.inputSchemaSource, 'live');
  assert.equal(
    Object.hasOwn(structuredContent, 'inputSchemaRejectedSources'),
    false,
  );
});
