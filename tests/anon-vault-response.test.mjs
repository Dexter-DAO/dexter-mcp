import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnonVaultToolResult,
  isAnonVaultFailureResponse,
  normalizeAnonVaultFetchResponse,
} from '../lib/anon-vault-response.mjs';

const REQUEST_ID = 'mcp-req-123';

function normalize(body, httpStatus = 200) {
  return normalizeAnonVaultFetchResponse({
    body,
    httpStatus,
    roundtripMs: 321,
    requestId: REQUEST_ID,
  });
}

test('paid settlement stays a successful dispatched payment with timing', () => {
  const result = normalize({
    ok: true,
    status: 200,
    paid: true,
    data: { answer: 42 },
    payment: {
      settlement: {
        transaction: 'tx-1',
        extensions: { 'dexter-timing': { settleDurationMs: 87 } },
      },
    },
    vault: { vaultPda: 'vault-1' },
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_ready');
  assert.equal(result.response.payment.dispatched, true);
  assert.equal(result.response.payment.settled, true);
  assert.equal(result.response.payment.details.settlementMs, 321);
  assert.equal(result.response.payment.details.settleDurationMs, 87);
  assert.equal(result.response.requestId, REQUEST_ID);
  assert.equal(isAnonVaultFailureResponse(result.response), false);
});

test('a genuine successful free response is the only no-payment-required state', () => {
  const result = normalize({
    ok: true,
    status: 200,
    paid: false,
    data: { public: true },
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.dispatched, false);
  assert.equal(result.response.mode, 'vault_no_payment_required');
  assert.equal(result.response.phase, 'discovery');
  assert.deepEqual(result.response.payment, { dispatched: false, settled: false });
});

test('merchant rejection never becomes no-payment-required and keeps human detail', () => {
  const result = normalize({
    ok: true,
    status: 402,
    paid: false,
    reason: 'merchant_rejected',
    data: {
      error: 'invalid_payment',
      message: 'The facilitator rejected this payment proof.',
      correlationId: 'merchant-correlation-456',
    },
    payment: {
      amountAtomic: '1000',
      network: 'solana:mainnet',
    },
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_rejected');
  assert.notEqual(result.response.mode, 'vault_no_payment_required');
  assert.equal(result.response.phase, 'dispatch');
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.error, 'invalid_payment');
  assert.equal(
    result.response.message,
    'The facilitator rejected this payment proof.',
  );
  assert.equal(result.response.requestId, REQUEST_ID);
  assert.equal(result.response.merchantCorrelationId, 'merchant-correlation-456');
  assert.deepEqual(result.response.correlation, {
    requestId: REQUEST_ID,
    merchantCorrelationId: 'merchant-correlation-456',
  });
  assert.equal(result.response.payment.dispatched, true);
  assert.equal(result.response.payment.settled, false);
  assert.match(result.response.instructions, /Do not retry automatically/);
  assert.equal('retry' in result.response, false);
  assert.equal(isAnonVaultFailureResponse(result.response), true);
});

test('post-dispatch uncertainty is terminal and preserves correlation', () => {
  const result = normalize({
    ok: true,
    status: 503,
    paid: false,
    reason: 'settlement_unconfirmed',
    error: 'payment_unconfirmed',
    message: 'The merchant stopped responding after dispatch.',
    data: { request_id: 'seller-request-789' },
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_unconfirmed');
  assert.equal(result.response.phase, 'settlement');
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.payment.dispatched, true);
  assert.equal(result.response.payment.settled, 'unknown');
  assert.equal(result.response.merchantCorrelationId, 'seller-request-789');
  assert.match(result.response.instructions, /Do not retry automatically/);
  assert.equal('retry' in result.response, false);
  assert.equal(isAnonVaultFailureResponse(result.response), true);
});

test('authorization build failure is distinct and explicitly pre-dispatch', () => {
  const result = normalize({
    ok: false,
    error: 'facilitator_build_failed',
    detail: 'facilitator_build_failed_422: unsupported transaction',
  }, 502);

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, false);
  assert.equal(result.response.mode, 'vault_payment_build_error');
  assert.equal(result.response.phase, 'authorization_build');
  assert.equal(result.response.retryable, true);
  assert.equal(result.response.payment.dispatched, false);
  assert.equal(result.response.payment.settled, false);
  assert.equal(
    result.response.detail,
    'facilitator_build_failed_422: unsupported transaction',
  );
  assert.equal(result.response.requestId, REQUEST_ID);
});

test('payment-requirement discovery failure has its own taxonomy', () => {
  const result = normalize({
    ok: false,
    error: 'requirements_missing',
    requirements: { x402Version: 2 },
  }, 402);

  assert.equal(result.response.mode, 'vault_discovery_error');
  assert.equal(result.response.phase, 'discovery');
  assert.equal(result.response.retryable, false);
  assert.deepEqual(result.response.requirements, { x402Version: 2 });
  assert.equal(result.response.payment.dispatched, false);
});

test('an error returned before payment dispatch is not mislabeled as free', () => {
  const result = normalize({
    ok: true,
    status: 404,
    paid: false,
    data: { error: 'not_found', message: 'No matching resource.' },
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, false);
  assert.equal(result.response.mode, 'vault_resource_error');
  assert.notEqual(result.response.mode, 'vault_no_payment_required');
  assert.equal(result.response.phase, 'discovery');
  assert.equal(result.response.error, 'not_found');
  assert.equal(result.response.message, 'No matching resource.');
  assert.equal(result.response.payment.dispatched, false);
});

test('a legacy second 402 without reason still means dispatched rejection', () => {
  const result = normalize({
    ok: true,
    status: 402,
    paid: false,
    data: { error: 'invalid_payment' },
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_rejected');
  assert.equal(result.response.phase, 'dispatch');
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.payment.dispatched, true);
});

test('ok-shaped 5xx without a reason remains settlement-ambiguous', () => {
  const result = normalize({
    ok: true,
    status: 503,
    paid: false,
    data: { message: 'Temporary upstream failure.' },
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_unconfirmed');
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.payment.dispatched, 'unknown');
  assert.equal(result.response.payment.settled, 'unknown');
});

test('only a 2xx response can mean no payment was required', () => {
  const result = normalize({
    ok: true,
    status: 302,
    paid: false,
    data: 'redirect',
  });

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, false);
  assert.equal(result.response.mode, 'vault_resource_error');
  assert.notEqual(result.response.mode, 'vault_no_payment_required');
});

test('unknown API failure fails closed as ambiguous and correlated', () => {
  const result = normalize(null, 502);

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_unconfirmed');
  assert.equal(result.response.phase, 'settlement');
  assert.equal(result.response.error, 'anon_fetch_failed');
  assert.equal(result.response.requestId, REQUEST_ID);
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.payment.dispatched, 'unknown');
  assert.equal(result.response.payment.settled, 'unknown');
  assert.match(result.response.instructions, /Do not retry automatically/);
  assert.equal(isAnonVaultFailureResponse(result.response), true);
});

test('replay refusal requires reconciliation of the prior attempt', () => {
  const result = normalize({
    ok: false,
    error: 'replay_detected',
    message: 'That request ID was already used.',
  }, 409);

  assert.equal(result.succeeded, false);
  assert.equal(result.dispatched, true);
  assert.equal(result.response.mode, 'vault_payment_unconfirmed');
  assert.equal(result.response.phase, 'reconciliation');
  assert.equal(result.response.retryable, false);
  assert.equal(result.response.payment.dispatched, 'prior_attempt');
  assert.equal(result.response.payment.settled, 'unknown');
  assert.match(result.response.instructions, /Do not retry automatically/);
});

test('plain merchant response text remains visible', () => {
  const result = normalize({
    ok: true,
    status: 402,
    paid: false,
    reason: 'merchant_rejected',
    data: 'Payment signature did not match the advertised requirements.',
  });

  assert.equal(
    result.response.message,
    'Payment signature did not match the advertised requirements.',
  );
});

test('missing correlation identifiers stay absent instead of being invented', () => {
  const result = normalizeAnonVaultFetchResponse({
    body: { ok: false, error: 'requirements_missing' },
    httpStatus: 402,
  });

  assert.equal('requestId' in result.response, false);
  assert.equal('merchantCorrelationId' in result.response, false);
  assert.equal('correlation' in result.response, false);
});

test('wallet read failure becomes an MCP tool error', () => {
  const response = {
    mode: 'vault_read_error',
    error: 'vault_state_read_failed',
  };
  const result = buildAnonVaultToolResult(response, { ui: { resourceUri: 'ui://wallet' } });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, response);
  assert.deepEqual(result._meta, { ui: { resourceUri: 'ui://wallet' } });
});

test('healthy wallet response remains an MCP tool success', () => {
  const response = { mode: 'vault_ready', balances: { usdc: 1 } };
  const result = buildAnonVaultToolResult(response);

  assert.equal('isError' in result, false);
  assert.equal(result.structuredContent, response);
});
