import { fetchInternalApi } from './internal-api-fetch.mjs';

/**
 * One deliberately small collision point for the paired dexter-api candidate.
 * The API routes are not release-final; callers must not repeat these strings.
 */
export const OPEN_X402_INTENT_API_PATHS = Object.freeze({
  check: '/v2/pay/anon/x402/check',
  fetch: '/v2/pay/anon/x402/fetch',
  status: '/v2/pay/anon/x402/status',
});

const SESSION_ID_RE = /^[A-Za-z0-9_.\-]{1,256}$/;
const POSITIVE_ATOMIC_RE = /^[1-9]\d{0,19}$/;
const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

function requiredSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_RE.test(value)) {
    throw new TypeError('invalid_mcp_session_id');
  }
  return value;
}

function opaqueIntentId(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 256
    || value !== value.trim()
  ) {
    throw new TypeError('invalid_intent_id');
  }
  return value;
}

function canonicalMethod(value = 'GET') {
  const method = String(value || 'GET').toUpperCase();
  if (!SUPPORTED_METHODS.has(method)) throw new TypeError('invalid_method');
  return method;
}

function exactBody(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new TypeError('raw_request_body_must_be_string');
  }
  return value;
}

export function buildOpenX402IntentRequest(action, input = {}) {
  const mcpSessionId = requiredSessionId(input.sessionId);
  if (action === 'check') {
    if (typeof input.url !== 'string' || input.url.length === 0) {
      throw new TypeError('invalid_url');
    }
    const body = exactBody(input.body);
    return {
      mcp_session_id: mcpSessionId,
      url: input.url,
      method: canonicalMethod(input.method),
      ...(body === undefined ? {} : { body }),
    };
  }
  if (action === 'fetch') {
    if (
      typeof input.maxAmountAtomic !== 'string'
      || !POSITIVE_ATOMIC_RE.test(input.maxAmountAtomic)
    ) {
      throw new TypeError('invalid_max_amount_atomic');
    }
    return {
      mcp_session_id: mcpSessionId,
      intentId: opaqueIntentId(input.intentId),
      maxAmountAtomic: input.maxAmountAtomic,
    };
  }
  if (action === 'status') {
    return {
      mcp_session_id: mcpSessionId,
      intentId: opaqueIntentId(input.intentId),
    };
  }
  throw new TypeError('invalid_x402_intent_action');
}

const TIMEOUT_MS = Object.freeze({
  check: 35_000,
  fetch: 120_000,
  status: 10_000,
});

export async function callOpenX402IntentApi(
  action,
  input,
  { fetchImpl = fetchInternalApi } = {},
) {
  const path = OPEN_X402_INTENT_API_PATHS[action];
  if (!path) throw new TypeError('invalid_x402_intent_action');
  const request = buildOpenX402IntentRequest(action, input);
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(TIMEOUT_MS[action]),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    error: 'invalid_x402_intent_response',
  }));
  return {
    httpStatus: response.status,
    data:
      data && typeof data === 'object' && !Array.isArray(data)
        ? data
        : { ok: false, error: 'invalid_x402_intent_response' },
  };
}

export function isOpenX402AuthorityRequired(value) {
  const error = value && typeof value === 'object' ? value.error : null;
  return new Set([
    'authentication_required',
    'authorization_required',
    'governed_principal_required',
  ]).has(error);
}

function publicDelivery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    ...(typeof value.state === 'string' ? { state: value.state } : {}),
    ...(Number.isInteger(value.httpStatus) ? { httpStatus: value.httpStatus } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'result')
      ? { result: value.result }
      : {}),
  };
}

function publicPayment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    ...(typeof value.state === 'string' ? { state: value.state } : {}),
    ...(typeof value.confirmed === 'boolean' ? { confirmed: value.confirmed } : {}),
    ...(typeof value.amountAtomic === 'string'
      ? { amountAtomic: value.amountAtomic }
      : {}),
    ...(typeof value.transaction === 'string'
      ? { transaction: value.transaction }
      : {}),
  };
}

function publicReconciliation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return {
    ...(typeof value.required === 'boolean' ? { required: value.required } : {}),
    ...(typeof value.performed === 'boolean' ? { performed: value.performed } : {}),
  };
}

function publicRetry(value, pinnedIntentId = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const intentId =
    typeof pinnedIntentId === 'string' && pinnedIntentId.length > 0
      ? pinnedIntentId
      : typeof value.intentId === 'string' && value.intentId.length > 0
        ? value.intentId
        : null;
  if (!intentId) return undefined;
  return {
    intentId,
    ...(typeof value.maxAmountAtomic === 'string'
      ? { maxAmountAtomic: value.maxAmountAtomic }
      : {}),
  };
}

/**
 * The paired API remains route-internal. Whitelist its route-neutral public
 * lifecycle vocabulary so a provisional backend can never leak a challenge,
 * prepared purchase, rail selection, or caller-replay coordinates through MCP.
 */
export function sanitizeOpenX402IntentResult(
  value,
  { intentId = null, httpStatus = null, includeData = true } = {},
) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  // Once a caller supplies an intent, its public lifecycle can never switch
  // handles because of a backend response. This is the same-intent invariant
  // that prevents an ambiguous result from becoming a second dispatch.
  const safeIntentId =
    typeof intentId === 'string' && intentId.length > 0
      ? intentId
      : typeof source.intentId === 'string' && source.intentId.length > 0
        ? source.intentId
        : null;
  const result = {
    ...(typeof source.ok === 'boolean' ? { ok: source.ok } : {}),
    ...(typeof safeIntentId === 'string' && safeIntentId.length > 0
      ? { intentId: safeIntentId }
      : {}),
    ...(typeof source.status === 'string' || Number.isInteger(source.status)
      ? { status: source.status }
      : {}),
    ...(typeof source.reservationState === 'string'
      ? { reservationState: source.reservationState }
      : {}),
    ...(typeof source.error === 'string' ? { error: source.error } : {}),
    ...(typeof source.detail === 'string' ? { detail: source.detail } : {}),
    ...(typeof source.reason === 'string' ? { reason: source.reason } : {}),
    ...(typeof source.retryable === 'boolean'
      ? { retryable: source.retryable }
      : {}),
    ...(typeof source.retryWithSameIntentOnly === 'boolean'
      ? { retryWithSameIntentOnly: source.retryWithSameIntentOnly }
      : {}),
    ...(typeof source.authorizationRequired === 'boolean'
      ? { authorizationRequired: source.authorizationRequired }
      : {}),
    ...(typeof source.consentUrl === 'string'
      && source.consentUrl.startsWith('https://dexter.cash/')
      ? { consentUrl: source.consentUrl }
      : {}),
    ...(includeData && Object.prototype.hasOwnProperty.call(source, 'data')
      ? { data: source.data }
      : {}),
  };
  const delivery = publicDelivery(source.delivery);
  if (delivery) result.delivery = delivery;
  const payment = publicPayment(source.payment);
  if (payment) result.payment = payment;
  const reconciliation = publicReconciliation(source.reconciliation);
  if (reconciliation) result.reconciliation = reconciliation;
  const retry = publicRetry(source.retry, safeIntentId);
  if (retry) result.retry = retry;
  if (Number.isInteger(httpStatus)) result.httpStatus = httpStatus;
  return result;
}
