import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeOpenX402IntentResult, callOpenX402IntentApi } from '../lib/open-x402-intent-api.mjs';
import { buildHostedCheckModelResult, buildHostedCheckStatusModelResult } from '../lib/open-check-result.mjs';
import { readablePurchaseAmount } from '../lib/open-purchase-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const paidResponse = {
  ok: true, intentId: ID, status: 'resolved',
  delivery: { transport: 'mcp', state: 'response_received', httpStatus: null, toolError: false,
    result: { content: [{ type: 'text', text: 'The seller returned the requested report.' }], structuredContent: { report: [1, 2, 3] } } },
  payment: { state: 'confirmed', confirmed: true, amountAtomic: '10000', asset: USDC, network: NETWORK, transaction: 'saved-transaction' },
  reconciliation: { required: false, performed: true }, replacementAllowed: false,
};

function valid(tool, result) {
  const parsed = OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
}

test('delivered native MCP output remains usable during payment observation and through status recovery', () => {
  const value = { ...paidResponse, status: 'ambiguous', payment: { ...paidResponse.payment, state: 'unknown', confirmed: false }, reconciliation: { required: true, performed: false }, retryAfterMs: 1200 };
  const fetched = sanitizeOpenX402IntentResult(value, { intentId: ID });
  assert.equal(fetched.outcome.resultAvailable, true);
  assert.equal(fetched.outcome.payment, 'unknown');
  assert.equal(fetched.outcome.commitment, null);
  assert.equal(fetched.outcome.amount.displayAmount, '0.01');
  assert.equal(fetched.outcome.amount.basis, 'requested_payment');
  assert.deepEqual(fetched.delivery.result, value.delivery.result);
  assert.equal(fetched.continuation.action, 'deliver_result_and_observe');
  assert.deepEqual(fetched.continuation.arguments, { intentId: ID });
  assert.equal(fetched.continuation.tool, 'x402_status');
  assert.equal(fetched.continuation.retryAfterMs, 1200);
  const status = sanitizeOpenX402IntentResult({ ...value, data: 'legacy top-level data' }, { intentId: ID, includeData: false });
  assert.equal(Object.hasOwn(status, 'data'), false);
  assert.deepEqual(status.delivery.result, value.delivery.result);
  valid('x402_fetch', fetched);
  valid('x402_status', status);
});

test('confirmed outcome reports the exact stored amount while retaining raw payment evidence', () => {
  const result = sanitizeOpenX402IntentResult(paidResponse);
  assert.equal(result.outcome.amount.displayAmount, '0.01');
  assert.equal(result.outcome.amount.basis, 'confirmed_payment');
  assert.equal(result.payment.amountAtomic, '10000');
  assert.equal(result.payment.transaction, 'saved-transaction');
  assert.equal(result.outcome.purchaseReference, ID);
  assert.equal(result.continuation.action, 'deliver_result');
  valid('x402_fetch', result);
  assert.equal(readablePurchaseAmount({ ...paidResponse.payment, amountAtomic: '25' }).displayAmount, '0.000025');
  assert.equal(readablePurchaseAmount({ ...paidResponse.payment, amountAtomic: '1' }).displayAmount, '0.000001');
  assert.equal(readablePurchaseAmount({ ...paidResponse.payment, amountAtomic: '123456789123456789123456789' }).displayAmount, '123456789123456789123.456789');
});

test('unknown asset or conflicting precision keeps raw evidence without inventing USDC value', () => {
  for (const patch of [{ asset: 'unknown-token', decimals: 9 }, { decimals: 9 }, { network: 'solana:devnet' }, { amountAtomic: '1e6' }]) {
    const result = sanitizeOpenX402IntentResult({ ...paidResponse, payment: { ...paidResponse.payment, ...patch } });
    assert.equal(Object.hasOwn(result.outcome, 'amount'), false);
    assert.equal(result.payment.asset, patch.asset ?? USDC);
    assert.equal(result.outcome.resultAvailable, true);
  }
});

test('provider errors and partial responses do not become successful content or a second purchase', () => {
  for (const delivery of [
    { ...paidResponse.delivery, toolError: true },
    { ...paidResponse.delivery, httpStatus: 503 },
    { state: 'response_received', httpStatus: 503, result: { message: 'outage' } },
    { state: 'response_unsupported', httpStatus: 200, result: 'unparsed' },
    { state: 'response_unavailable', result: null },
  ]) {
    const result = sanitizeOpenX402IntentResult({ ...paidResponse, delivery });
    assert.equal(result.outcome.resultAvailable, false);
    assert.notEqual(result.continuation.tool, 'x402_fetch');
    valid('x402_fetch', result);
  }
  const uncertain = sanitizeOpenX402IntentResult({ intentId: ID, status: 'delivery_outcome_unknown', ok: false, error: 'delivery_outcome_unknown', retryable: false, retryWithSameIntentOnly: true, replacementAllowed: false });
  assert.equal(uncertain.continuation.tool, 'x402_status');
  assert.deepEqual(uncertain.continuation.arguments, { intentId: ID });
  assert.equal(uncertain.replacementAllowed, false);
  assert.equal(uncertain.dispatch.boundary, 'unknown');
});

test('check recovery identity is usable only for observation until a paid check is complete', async () => {
  let call;
  const response = await callOpenX402IntentApi('checkStatus', { sessionId: 'original-session', checkRequestId: 'original-check-1' }, {
    serviceSecret: 'existing-hmac-secret-at-least-32-bytes', now: () => 1900000000000,
    fetchImpl: async (path, init) => { call = { path, body: JSON.parse(init.body) }; return { status: 202, json: async () => ({ ok: true, status: 'check_in_progress', retryAfterMs: 600 }) }; },
  });
  assert.equal(call.path, '/v2/pay/anon/x402/check/status');
  assert.deepEqual(call.body, { mcp_session_id: 'original-session', requestId: 'original-check-1' });
  const observed = buildHostedCheckStatusModelResult({ checkResult: response.data, checkRequestId: 'original-check-1' });
  assert.equal(observed.intentId, null);
  assert.equal(observed.executionGuidance.readyForFetch, false);
  assert.equal(observed.executionGuidance.reprobeAllowed, false);
  assert.equal(observed.recovery.tool, 'x402_status');
  assert.deepEqual(observed.recovery.arguments, { checkRequestId: 'original-check-1' });
  assert.equal(observed.recovery.retryAfterMs, 600);
  for (const status of ['check_unknown', 'check_ambiguous']) {
    const unknown = buildHostedCheckStatusModelResult({ checkResult: { ok: false, status }, checkRequestId: 'original-check-1' });
    assert.equal(unknown.intentId, null);
    assert.equal(unknown.executionGuidance.reprobeAllowed, false);
  }
  const completed = buildHostedCheckStatusModelResult({ checkResult: { ok: true, paymentRequired: true, intentId: ID, amountAtomic: '25', asset: USDC, network: NETWORK }, checkRequestId: 'original-check-1' });
  assert.equal(completed.intentId, ID);
  assert.equal(completed.paymentOptions[0].priceFormatted, '0.000025 USDC');
  assert.equal(completed.executionGuidance.readyForFetch, true);
  valid('x402_status', observed);
  valid('x402_status', completed);
});

test('lost initial check and saved free response retain the task without another provider invocation', () => {
  const lost = buildHostedCheckModelResult({ checkResult: { ok: false, status: 'check_unknown', error: 'x402_check_unavailable' }, checkRequestId: 'saved-request', url: 'https://seller.example/task', method: 'POST', rawBody: '{"task":"original"}', rawBodyProvided: true });
  assert.equal(lost.intentId, null);
  assert.equal(lost.recovery.checkRequestId, 'saved-request');
  assert.equal(lost.checkedRequest.body, '{"task":"original"}');
  assert.equal(lost.executionGuidance.readyForFetch, false);
  const completed = buildHostedCheckStatusModelResult({ checkResult: { ok: true, free: true, authMode: 'unprotected', data: { answer: 'saved free response' } }, checkRequestId: 'saved-request' });
  assert.equal(completed.continuation.action, 'deliver_result');
  assert.deepEqual(completed.data, { answer: 'saved free response' });
  assert.equal(completed.intentId, null);
  valid('x402_check', lost);
  valid('x402_status', completed);
});

test('confirmed payment and finalized observation stay distinct from unresolved states', () => {
  const confirmed = sanitizeOpenX402IntentResult({ ...paidResponse, payment: { ...paidResponse.payment, commitment: 'confirmed' } });
  assert.equal(confirmed.outcome.commitment, 'confirmed');
  const finalized = sanitizeOpenX402IntentResult({ ...paidResponse, payment: { ...paidResponse.payment, commitment: 'finalized' } });
  assert.equal(finalized.outcome.commitment, 'finalized');
  for (const state of ['unknown', 'not_confirmed']) {
    const result = sanitizeOpenX402IntentResult({ ...paidResponse, payment: { ...paidResponse.payment, state, confirmed: false } });
    assert.equal(result.outcome.payment, 'unknown');
    assert.equal(result.outcome.commitment, null);
    assert.equal(result.continuation.tool, 'x402_status');
  }
});

test('saved successful native purchase retains its exact output and receipt with no HTTP status guess', async () => {
  const { readFile } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/native-purchase-completion-20260917.json', import.meta.url), 'utf8'));
  assert.equal(fixture.savedResponse.intentId, 'c9c09d32-bb78-4d9e-9b1d-e7b581cb40a6');
  assert.equal(Object.hasOwn(fixture.savedResponse.delivery, 'httpStatus'), false);
  const result = sanitizeOpenX402IntentResult({ ...fixture.savedResponse, payment: { ...fixture.savedResponse.payment, ...fixture.storedPayment } });
  assert.equal(result.outcome.resultAvailable, true);
  assert.equal(result.outcome.amount.displayAmount, '0.01');
  assert.equal(result.outcome.amount.basis, 'confirmed_payment');
  assert.equal(result.outcome.commitment, 'finalized');
  assert.deepEqual(result.delivery.result, fixture.savedResponse.delivery.result);
  assert.equal(result.delivery.result._meta['x402/payment-response'].extensions['dexter-signed-transaction'].evidence.outcomeProof.confirmationCommitment, 'confirmed');
  assert.equal(result.continuation.action, 'deliver_result');
  valid('x402_status', result);
});

test('a failed free-provider result is not presented as completed work', () => {
  const result = buildHostedCheckModelResult({ checkResult: { ok: false, free: true, error: 'provider_error', data: { error: 'unavailable' } }, url: 'https://seller.example/free' });
  assert.equal(Object.hasOwn(result, 'continuation'), false);
  assert.equal(result.executionGuidance.readyForFetch, false);
});
