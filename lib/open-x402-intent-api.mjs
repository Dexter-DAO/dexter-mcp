import { createHash, createHmac } from 'node:crypto';
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
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const POSITIVE_ATOMIC_RE = /^[1-9]\d{0,19}$/;
const OWNER_APPROVAL_PATH_RE =
  /^\/wallet\/approvals\/x402\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NATIVE_TAB_CONSENT_PATH = '/tabs/new';
// The largest SDK-valid SpendGrantRequest (including the optional 512-char
// icon and 1024-char callback URLs) encodes below this ceiling. Keep the URL
// transport bounded while admitting every request the consent page can parse.
const NATIVE_TAB_REQUEST_MAX_CHARS = 4_096;
const NATIVE_TAB_REQUEST_RE =
  /^[A-Za-z0-9_-]+$/;
const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const SERVICE_PROOF_DOMAIN = 'dexter.native-exact.mcp-service.v1';
const MIN_SERVICE_SECRET_BYTES = 32;

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

function exactCheckRequestId(value) {
  if (
    typeof value !== 'string'
    || !REQUEST_ID_RE.test(value)
    || value !== value.trim()
  ) {
    throw new TypeError('invalid_x402_check_request_id');
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
      requestId: exactCheckRequestId(input.requestId),
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

/**
 * Bind the exact internal request bytes to the MCP service identity. Dexter API
 * verifies this same domain-separated message against req.originalUrl and the
 * raw JSON body captured before parsing, so a caller cannot reuse a proof for
 * another action, path, or body.
 */
export function buildOpenX402ServiceProofHeaders({
  path,
  method = 'POST',
  body,
  timestamp,
  secret,
}) {
  if (
    typeof path !== 'string'
    || !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('#')
    || path.includes('\\')
  ) {
    throw new TypeError('invalid_x402_service_proof_path');
  }
  if (typeof body !== 'string') {
    throw new TypeError('invalid_x402_service_proof_body');
  }
  if (
    typeof timestamp !== 'string'
    || !/^[0-9]{13}$/.test(timestamp)
  ) {
    throw new TypeError('invalid_x402_service_proof_timestamp');
  }
  const normalizedSecret = typeof secret === 'string' ? secret.trim() : '';
  if (Buffer.byteLength(normalizedSecret, 'utf8') < MIN_SERVICE_SECRET_BYTES) {
    throw new Error('native_exact_mcp_service_secret_unavailable');
  }
  const bodyDigest = createHash('sha256')
    .update(body, 'utf8')
    .digest('hex');
  const message = [
    SERVICE_PROOF_DOMAIN,
    timestamp,
    String(method).toUpperCase(),
    path,
    bodyDigest,
  ].join('\n');
  return {
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', normalizedSecret)
      .update(message, 'utf8')
      .digest('hex'),
  };
}

export async function callOpenX402IntentApi(
  action,
  input,
  {
    fetchImpl = fetchInternalApi,
    now = Date.now,
    serviceSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET,
  } = {},
) {
  const path = OPEN_X402_INTENT_API_PATHS[action];
  if (!path) throw new TypeError('invalid_x402_intent_action');
  const request = buildOpenX402IntentRequest(action, input);
  const body = JSON.stringify(request);
  const timestamp = String(now());
  const serviceProof = buildOpenX402ServiceProofHeaders({
    path,
    method: 'POST',
    body,
    timestamp,
    secret: serviceSecret,
  });
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...serviceProof,
    },
    body,
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
    'approval_required',
    'governed_principal_required',
  ]).has(error);
}

function isCanonicalNativeTabRequest(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > NATIVE_TAB_REQUEST_MAX_CHARS
    || !NATIVE_TAB_REQUEST_RE.test(value)
    // An unpadded base64url string can never have a one-character tail.
    || value.length % 4 === 1
  ) return false;
  try {
    return Buffer.from(value, 'base64url').toString('base64url') === value;
  } catch {
    return false;
  }
}

function isCanonicalNativeTabConsentUrl(candidate, parsed) {
  if (parsed.pathname !== NATIVE_TAB_CONSENT_PATH) return false;
  const requests = parsed.searchParams.getAll('req');
  if (
    parsed.searchParams.size !== 1
    || requests.length !== 1
    || !isCanonicalNativeTabRequest(requests[0])
  ) return false;
  // The producer uses URLSearchParams.set with an unpadded base64url value.
  // Requiring those exact bytes rejects duplicate/extra params, alternate
  // percent encodings, default-port spellings, and other URL normalizations.
  return candidate === `${parsed.origin}${NATIVE_TAB_CONSENT_PATH}?req=${requests[0]}`;
}

export function readOpenX402ConsentUrl(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const nestedApproval =
    value.approval
    && typeof value.approval === 'object'
    && !Array.isArray(value.approval)
      ? value.approval
      : null;
  const topLevelConsentUrl = typeof value.consentUrl === 'string'
    ? value.consentUrl
    : null;
  const candidate = topLevelConsentUrl !== null
    ? topLevelConsentUrl
    : new Set([
      'dexter-gateway-owner-consent-link/v1',
      'dexter-native-exact-owner-consent-link/v1',
    ]).has(nestedApproval?.namespace)
      && typeof nestedApproval.consentUrl === 'string'
      ? nestedApproval.consentUrl
      : null;
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    if (
      parsed.origin !== 'https://dexter.cash'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.hash !== ''
    ) return undefined;
    if (
      topLevelConsentUrl !== null
      && isCanonicalNativeTabConsentUrl(candidate, parsed)
    ) {
      return candidate;
    }
    if (!OWNER_APPROVAL_PATH_RE.test(parsed.pathname)) return undefined;
    const queryless = parsed.searchParams.size === 0;
    const legacyCeilingOnly =
      parsed.searchParams.size === 1
      && POSITIVE_ATOMIC_RE.test(
        parsed.searchParams.get('maxAmountAtomic') ?? '',
      );
    if (!queryless && !legacyCeilingOnly) return undefined;
    if (
      nestedApproval?.namespace === 'dexter-gateway-owner-consent-link/v1'
      && !queryless
    ) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function projectOpenX402AuthorizationRequired({
  intentId,
  maxAmountAtomic,
  data,
}) {
  const retry = {
    intentId,
    ...(maxAmountAtomic ? { maxAmountAtomic } : {}),
  };
  const consentUrl = readOpenX402ConsentUrl(data);
  if (consentUrl) {
    return sanitizeOpenX402IntentResult({
      ok: false,
      intentId,
      status: 'authorization_required',
      authorizationRequired: true,
      consentUrl,
      delivery: data?.delivery,
      payment: data?.payment,
      reconciliation: data?.reconciliation,
      retry,
      reason: typeof data?.error === 'string'
        ? data.error
        : 'authorization_required',
      retryable: false,
      retryWithSameIntentOnly: true,
    });
  }
  return sanitizeOpenX402IntentResult({
    ok: false,
    intentId,
    status: 'authorization_required',
    authorizationRequired: true,
    error: 'hosted_consent_unavailable',
    delivery: data?.delivery,
    payment: data?.payment,
    reconciliation: data?.reconciliation,
    reason: typeof data?.error === 'string'
      ? data.error
      : 'governed_principal_required',
    retry,
    retryable: false,
    retryWithSameIntentOnly: true,
  });
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

function publicDispatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const state = typeof value.state === 'string' ? value.state : null;
  if (state === 'not_dispatched') {
    return {
      boundary: 'not_crossed',
      evidence: 'backend_delivery_state',
    };
  }
  if (new Set([
    'dispatch_possible',
    'response_received',
    'response_unavailable',
  ]).has(state)) {
    return {
      boundary: 'crossed',
      evidence: 'backend_delivery_state',
    };
  }
  if (state === 'unknown') {
    return {
      boundary: 'unknown',
      evidence: 'backend_delivery_state',
    };
  }
  return undefined;
}

function publicUnavailableDispatch(source) {
  if (
    source?.ok !== false
    || source?.status !== 'delivery_outcome_unknown'
    || source?.error !== 'delivery_outcome_unknown'
    || source?.retryable !== false
    || source?.retryWithSameIntentOnly !== true
  ) return undefined;
  return {
    boundary: 'unknown',
    evidence: 'backend_result_unavailable',
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

const INTERNAL_ROUTE_LABEL =
  /native[_ -]?(?:exact|tab)|direct[_ -]?exact|gateway[_ -]?(?:cash|credit)|selected[_ -]?rail|purchase[_ -]?mode/i;

function publicRouteNeutralError(value) {
  if (typeof value !== 'string') return undefined;
  return INTERNAL_ROUTE_LABEL.test(value) ? 'purchase_unavailable' : value;
}

function publicRouteNeutralDetail(value) {
  if (typeof value !== 'string' || INTERNAL_ROUTE_LABEL.test(value)) {
    return undefined;
  }
  return value;
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
  const consentUrl = readOpenX402ConsentUrl(source);
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
    ...(publicRouteNeutralError(source.error)
      ? { error: publicRouteNeutralError(source.error) }
      : {}),
    ...(publicRouteNeutralDetail(source.detail)
      ? { detail: publicRouteNeutralDetail(source.detail) }
      : {}),
    ...(publicRouteNeutralDetail(source.reason)
      ? { reason: publicRouteNeutralDetail(source.reason) }
      : {}),
    ...(typeof source.retryable === 'boolean'
      ? { retryable: source.retryable }
      : {}),
    ...(typeof source.retryWithSameIntentOnly === 'boolean'
      ? { retryWithSameIntentOnly: source.retryWithSameIntentOnly }
      : {}),
    ...(typeof source.authorizationRequired === 'boolean'
      ? { authorizationRequired: source.authorizationRequired }
      : {}),
    ...(consentUrl ? { consentUrl } : {}),
    ...(includeData && Object.prototype.hasOwnProperty.call(source, 'data')
      ? { data: source.data }
      : {}),
  };
  const delivery = publicDelivery(source.delivery);
  if (delivery) result.delivery = delivery;
  const dispatch = publicDispatch(source.delivery)
    ?? publicUnavailableDispatch(source);
  if (dispatch) result.dispatch = dispatch;
  const payment = publicPayment(source.payment);
  if (payment) result.payment = payment;
  const reconciliation = publicReconciliation(source.reconciliation);
  if (reconciliation) result.reconciliation = reconciliation;
  const retry = publicRetry(source.retry, safeIntentId);
  if (retry) result.retry = retry;
  if (Number.isInteger(httpStatus)) result.httpStatus = httpStatus;
  return result;
}
