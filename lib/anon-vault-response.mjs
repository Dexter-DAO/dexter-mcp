const DISCOVERY_ERRORS = new Set([
  'requirements_missing',
  'no_exact_scheme_accept',
  'no_solana_accept',
  'invalid_requirement_amount',
]);

const BUILD_ERRORS = new Set([
  'facilitator_build_failed',
  'payment_build_failed',
  'build_failed',
]);

const IDENTITY_ERRORS = new Set([
  'binding_check_failed',
  'binding_handle_mismatch',
  'mcp_session_id_required',
  'no_live_binding',
  'vault_not_found',
]);

const POLICY_ERRORS = new Set([
  'agent_spend_disabled',
  'daily_cap_check_failed',
  'daily_cap_exceeded',
  'single_spend_limit_exceeded',
]);

const REQUEST_ERRORS = new Set([
  'expected_multipart_form_data',
  'invalid_mcp_session_id',
  'invalid_method',
  'invalid_url',
  'invalid_user_handle',
  'method_not_supported_for_multipart',
  'multipart_files_invalid',
  'multipart_parse_failed',
  'multipart_too_large',
]);

const FAILURE_MODES = new Set([
  'vault_discovery_error',
  'vault_error',
  'vault_identity_error',
  'vault_payment_build_error',
  'vault_payment_rejected',
  'vault_payment_unconfirmed',
  'vault_policy_error',
  'vault_read_error',
  'vault_request_error',
  'vault_resource_error',
]);

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2_000) : null;
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function statusOf(body, httpStatus) {
  const candidate = Number(body?.status ?? httpStatus ?? 500);
  return Number.isInteger(candidate) && candidate >= 100 && candidate <= 599
    ? candidate
    : 500;
}

function merchantDetailOf(body) {
  const data = asObject(body?.data);
  const nestedError = asObject(data?.error);
  const error = firstText(
    typeof data?.error === 'string' ? data.error : null,
    data?.error_code,
    data?.code,
    nestedError?.code,
    nestedError?.error,
  );
  const message = firstText(
    body?.message,
    typeof body?.data === 'string' ? body.data : null,
    data?.message,
    data?.error_description,
    data?.detail,
    nestedError?.message,
    nestedError?.error_description,
    body?.detail,
  );
  const correlationId = firstText(
    body?.correlationId,
    body?.correlation_id,
    data?.correlationId,
    data?.correlation_id,
    data?.requestId,
    data?.request_id,
    data?.traceId,
    data?.trace_id,
    nestedError?.correlationId,
    nestedError?.correlation_id,
  );
  return { error, message, correlationId };
}

function correlationFields(requestId, merchantCorrelationId) {
  if (!requestId && !merchantCorrelationId) return {};
  return {
    correlation: {
      ...(requestId ? { requestId } : {}),
      ...(merchantCorrelationId ? { merchantCorrelationId } : {}),
    },
    ...(requestId ? { requestId } : {}),
    ...(merchantCorrelationId ? { merchantCorrelationId } : {}),
  };
}

function paymentFailureTaxonomy(code, httpStatus) {
  if (BUILD_ERRORS.has(code)) {
    return {
      phase: 'authorization_build',
      mode: 'vault_payment_build_error',
      retryable: httpStatus >= 500,
      fallbackMessage: 'OpenDexter could not prepare the payment. No payment was sent.',
    };
  }
  if (DISCOVERY_ERRORS.has(code)) {
    return {
      phase: 'discovery',
      mode: 'vault_discovery_error',
      retryable: false,
      fallbackMessage:
        'OpenDexter could not obtain usable payment terms from this endpoint. No payment was sent.',
    };
  }
  if (IDENTITY_ERRORS.has(code)) {
    return {
      phase: 'identity',
      mode: 'vault_identity_error',
      retryable: code === 'binding_check_failed',
      fallbackMessage: 'OpenDexter could not verify the wallet connection. No payment was sent.',
    };
  }
  if (POLICY_ERRORS.has(code)) {
    return {
      phase: 'policy',
      mode: 'vault_policy_error',
      retryable: code === 'daily_cap_check_failed',
      fallbackMessage: 'This payment was stopped before it was sent.',
    };
  }
  if (REQUEST_ERRORS.has(code)) {
    return {
      phase: 'request',
      mode: 'vault_request_error',
      retryable: false,
      fallbackMessage: 'OpenDexter could not prepare this request. No payment was sent.',
    };
  }
  return null;
}

export function isAnonVaultFailureResponse(response) {
  return FAILURE_MODES.has(response?.mode);
}

export function buildAnonVaultToolResult(response, meta = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    structuredContent: response,
    ...(isAnonVaultFailureResponse(response) ? { isError: true } : {}),
    _meta: meta,
  };
}

/**
 * Normalize dexter-api's anonymous-vault response at the MCP boundary.
 *
 * The API deliberately returns `ok: true` after it has completed its own
 * workflow, even when a merchant rejects the dispatched payment proof. `ok`
 * therefore cannot be treated as payment success. This mapper keeps:
 *
 * - discovery and authorization-build failures distinct and pre-dispatch;
 * - merchant rejection distinct from a genuine no-payment-required response;
 * - ambiguous settlement terminal and non-retryable;
 * - the MCP request id plus any merchant correlation id visible to operators.
 */
export function normalizeAnonVaultFetchResponse({
  body,
  httpStatus,
  roundtripMs,
  requestId,
}) {
  const anonBody = asObject(body);
  const status = statusOf(anonBody, httpStatus);
  const requestCorrelationId = cleanText(requestId);
  const merchant = merchantDetailOf(anonBody);
  const correlations = correlationFields(requestCorrelationId, merchant.correlationId);
  const paySource = 'anon_vault';

  if (anonBody?.ok) {
    if (
      anonBody.paymentUnconfirmed === true
      || anonBody.reason === 'settlement_unconfirmed'
    ) {
      return {
        succeeded: false,
        dispatched: true,
        response: {
          status,
          mode: 'vault_payment_unconfirmed',
          phase: 'settlement',
          retryable: false,
          reason: anonBody.reason || anonBody.error || 'payment_unconfirmed',
          error: anonBody.error || merchant.error || 'payment_unconfirmed',
          message:
            merchant.message
            || 'The payment may have settled, but OpenDexter could not confirm the result.',
          instructions:
            'Do not retry automatically. The payment was dispatched and settlement is uncertain. ' +
            'Report the error and correlation details, then verify the wallet or merchant before any new attempt.',
          data: anonBody.data ?? null,
          payment: {
            dispatched: true,
            settled: 'unknown',
            details: anonBody.payment ?? null,
          },
          vault: anonBody.vault ?? null,
          paySource,
          ...correlations,
        },
      };
    }

    if (anonBody.paid === true) {
      const settlement = anonBody.payment?.settlement ?? null;
      const details = settlement
        ? {
            ...settlement,
            settlementMs: roundtripMs,
            ...(typeof settlement?.extensions?.['dexter-timing']?.settleDurationMs === 'number'
              ? {
                  settleDurationMs:
                    settlement.extensions['dexter-timing'].settleDurationMs,
                }
              : {}),
          }
        : null;
      return {
        succeeded: true,
        dispatched: true,
        response: {
          status,
          mode: 'vault_ready',
          phase: 'settlement',
          data: anonBody.data,
          payment: {
            dispatched: true,
            settled: true,
            ...(details ? { details } : {}),
          },
          vault: anonBody.vault,
          paySource,
          ...correlations,
        },
      };
    }

    if (status >= 500) {
      return {
        succeeded: false,
        dispatched: true,
        response: {
          status,
          mode: 'vault_payment_unconfirmed',
          phase: 'settlement',
          retryable: false,
          reason: anonBody.reason || 'dispatch_state_unknown',
          error: anonBody.error || merchant.error || 'payment_unconfirmed',
          message:
            merchant.message
            || 'OpenDexter could not determine whether this payment was dispatched or settled.',
          instructions:
            'Do not retry automatically. The dispatch and settlement state are unknown. ' +
            'Report the error and correlation details, then reconcile the wallet or merchant before any new attempt.',
          data: anonBody.data ?? null,
          payment: {
            dispatched: 'unknown',
            settled: 'unknown',
            ...(anonBody.payment ? { details: anonBody.payment } : {}),
          },
          vault: anonBody.vault ?? null,
          paySource,
          ...correlations,
        },
      };
    }

    if (anonBody.reason === 'merchant_rejected' || status >= 400) {
      // In dexter-api's contract, a second 402 is the merchant's rejection of
      // the already-dispatched proof. Preserve that truth even if an older API
      // omitted the explicit merchant_rejected reason.
      const wasDispatched =
        anonBody.reason === 'merchant_rejected'
        || status === 402;
      return {
        succeeded: false,
        dispatched: wasDispatched,
        response: {
          status,
          mode: wasDispatched ? 'vault_payment_rejected' : 'vault_resource_error',
          phase: wasDispatched ? 'dispatch' : 'discovery',
          retryable: false,
          reason:
            anonBody.reason
            || (wasDispatched ? 'merchant_rejected' : 'resource_rejected'),
          error:
            anonBody.error
            || merchant.error
            || (wasDispatched ? 'merchant_rejected' : 'resource_rejected'),
          message:
            merchant.message
            || (
              wasDispatched
                ? 'The endpoint rejected the payment. No payment was confirmed.'
                : 'The endpoint returned an error before any payment was sent.'
            ),
          instructions: wasDispatched
            ? 'Do not retry automatically. The request was dispatched with a payment proof and rejected. Report the error and correlation details.'
            : 'No payment was dispatched. Report the endpoint error and correlation details.',
          data: anonBody.data ?? null,
          payment: {
            dispatched: wasDispatched,
            settled: false,
            ...(anonBody.payment ? { details: anonBody.payment } : {}),
          },
          vault: anonBody.vault ?? null,
          paySource,
          ...correlations,
        },
      };
    }

    if (status >= 200 && status < 300) {
      return {
        succeeded: true,
        dispatched: false,
        response: {
          status,
          mode: 'vault_no_payment_required',
          phase: 'discovery',
          data: anonBody.data,
          payment: { dispatched: false, settled: false },
          vault: anonBody.vault,
          paySource,
          ...correlations,
        },
      };
    }

    return {
      succeeded: false,
      dispatched: false,
      response: {
        status,
        mode: 'vault_resource_error',
        phase: 'discovery',
        retryable: false,
        reason: 'unexpected_resource_status',
        error: merchant.error || 'unexpected_resource_status',
        message:
          merchant.message
          || `The endpoint returned status ${status} before any payment was sent.`,
        instructions:
          'No payment was dispatched. Report the endpoint status and correlation details.',
        data: anonBody.data ?? null,
        payment: { dispatched: false, settled: false },
        vault: anonBody.vault ?? null,
        paySource,
        ...correlations,
      },
    };
  }

  const code = firstText(anonBody?.error, merchant.error) || 'anon_fetch_failed';
  const taxonomy = paymentFailureTaxonomy(code, Number(httpStatus) || status);
  if (code === 'replay_detected') {
    return {
      succeeded: false,
      dispatched: true,
      response: {
        status: Number(httpStatus) || status,
        mode: 'vault_payment_unconfirmed',
        phase: 'reconciliation',
        retryable: false,
        reason: 'prior_request_must_be_reconciled',
        error: code,
        message:
          merchant.message
          || 'OpenDexter refused to send this request again because the same request ID was already used. Check the prior result before starting anything new.',
        instructions:
          'Do not retry automatically. Reconcile the prior request using the correlation details before creating any new payment intent.',
        data: anonBody?.data ?? null,
        payment: { dispatched: 'prior_attempt', settled: 'unknown' },
        paySource,
        ...correlations,
      },
    };
  }
  if (!taxonomy) {
    return {
      succeeded: false,
      dispatched: true,
      response: {
        status: Number(httpStatus) || status,
        mode: 'vault_payment_unconfirmed',
        phase: 'settlement',
        retryable: false,
        reason: 'dispatch_state_unknown',
        error: code,
        message:
          merchant.message
          || 'OpenDexter could not determine whether this payment was dispatched or settled.',
        detail: firstText(anonBody?.detail, asObject(anonBody?.data)?.detail),
        instructions:
          'Do not retry automatically. The dispatch and settlement state are unknown. ' +
          'Report the error and correlation details, then reconcile the wallet or merchant before any new attempt.',
        requirements: anonBody?.requirements ?? null,
        data: anonBody?.data ?? null,
        payment: { dispatched: 'unknown', settled: 'unknown' },
        paySource,
        ...correlations,
      },
    };
  }
  return {
    succeeded: false,
    dispatched: false,
    response: {
      status: Number(httpStatus) || status,
      mode: taxonomy.mode,
      phase: taxonomy.phase,
      retryable: taxonomy.retryable,
      error: code,
      message: merchant.message || taxonomy.fallbackMessage,
      detail: firstText(anonBody?.detail, asObject(anonBody?.data)?.detail),
      instructions:
        `No payment was dispatched. Report phase=${taxonomy.phase}, error=${code}, ` +
        'and the correlation details before deciding whether a new attempt is appropriate.',
      requirements: anonBody?.requirements ?? null,
      data: anonBody?.data ?? null,
      payment: { dispatched: false, settled: false },
      paySource,
      ...correlations,
    },
  };
}
