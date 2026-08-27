import assert from 'node:assert/strict';
import test from 'node:test';

import { buildX402AccessModelResult } from '../lib/open-x402-access-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

function assertContract(result) {
  assert.equal(
    OPEN_TOOL_CONTRACTS.x402_access.outputSchema.safeParse(result).success,
    true,
  );
}

test('paid access returns the canonical check intent unchanged', () => {
  const check = {
    authMode: 'paid',
    requiresPayment: true,
    intentId: 'intent-1',
    quoteOnly: false,
  };

  const result = buildX402AccessModelResult(check);
  assert.equal(result, check);
  assertContract(result);
});

test('free access returns the canonical provider check result unchanged', () => {
  const check = {
    ok: true,
    free: true,
    authMode: 'unprotected',
    statusCode: 200,
  };

  const result = buildX402AccessModelResult(check);
  assert.equal(result, check);
  assertContract(result);
});

test('SIWX access reports the missing connected signer without a session wallet', () => {
  const result = buildX402AccessModelResult({
    authMode: 'siwx',
    authRequired: true,
    checkedRequest: {
      url: 'https://seller.example/private',
      method: 'GET',
      body: null,
      requestBound: true,
    },
  });

  assert.equal(result.error, 'siwx_signer_unavailable');
  assert.equal(result.reason, 'connected_siwx_signer_unavailable');
  assert.equal(result.retryable, false);
  assert.deepEqual(result.siwx, {
    recognized: true,
    signerAvailable: false,
  });
  assert.equal(result.executionGuidance.reprobeAllowed, false);
  assert.equal(
    Object.hasOwn(
      OPEN_TOOL_CONTRACTS.x402_access.outputSchema.shape,
      'executionGuidance',
    ),
    true,
  );
  assert.equal(Object.hasOwn(result, 'session'), false);
  assert.equal(Object.hasOwn(result, 'sessionFunding'), false);
  assertContract(result);
});

test('non-GET SIWX reports that the exact request was already checked', () => {
  const result = buildX402AccessModelResult({
    authMode: 'siwx',
    checkedRequest: {
      url: 'https://seller.example/private',
      method: 'POST',
      body: '{"q":"hello"}',
      requestBound: true,
    },
  });

  assert.equal(result.requestAlreadyChecked, true);
  assert.equal(result.executionGuidance.reprobeAllowed, false);
  assert.equal(result.executionGuidance.dispatchAtMostOnce, true);
  assertContract(result);
});
