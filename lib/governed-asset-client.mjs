import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import {
  canonicalHash,
  canonicalJson,
} from './governed-canonical-identity.mjs';
import {
  GOVERNED_ASSET_INPUT_SCHEMAS,
  assertNoGovernedAuthorityOverrides,
} from './governed-asset-contract.mjs';
import {
  buildGovernedAssetFailure,
  normalizeGovernedAssetResult,
} from './governed-asset-result.mjs';
import {
  GOVERNED_AGENT_API_PROFILE,
  assertGovernedBackendOriginalUrl,
  governedBackendOriginalUrl,
  requireGovernedBackendProfile,
} from './governed-asset-backend-profile.mjs';

export const GOVERNED_BACKEND_AUTH_PURPOSE =
  GOVERNED_AGENT_API_PROFILE.authPurpose;
export const MAX_GOVERNED_BACKEND_RESPONSE_BYTES = 128 * 1024;
// A history page may contain 100 strict status records. Each record's arrays
// and strings are bounded by the response schema, so 2 MiB admits the full
// canonical page while retaining a finite, history-only memory ceiling.
export const MAX_GOVERNED_HISTORY_RESPONSE_BYTES = 2 * 1024 * 1024;

const INTERNAL_SIGNATURE = /^[0-9a-f]{64}$/;
const MCP_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const INTERNAL_TIMESTAMP = /^[1-9][0-9]{12}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export { canonicalHash, canonicalJson };

function requireSecret(secret) {
  if (typeof secret !== 'string') {
    throw new TypeError('governed_backend_secret_unavailable');
  }
  const trimmed = secret.trim();
  if (Buffer.byteLength(trimmed, 'utf8') < 32) {
    throw new TypeError('governed_backend_secret_unavailable');
  }
  return trimmed;
}

function requireMcpSessionId(value) {
  if (typeof value !== 'string' || !MCP_SESSION_ID.test(value)) {
    throw new TypeError('invalid_mcp_session_id');
  }
  return value;
}

function isLoopbackHostname(hostname) {
  return hostname === '127.0.0.1'
    || hostname === 'localhost'
    || hostname === '[::1]'
    || hostname === '::1';
}

export function normalizeGovernedBackendOrigin(apiBase) {
  if (
    typeof apiBase !== 'string'
    || apiBase.length === 0
    || apiBase.length > 512
    || apiBase !== apiBase.trim()
    || apiBase.includes('?')
    || apiBase.includes('#')
  ) {
    throw new TypeError('invalid_governed_backend_origin');
  }

  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    throw new TypeError('invalid_governed_backend_origin');
  }
  const authorityStart = apiBase.indexOf('://') + 3;
  const rawPathStart = apiBase.indexOf('/', authorityStart);
  const rawPath = rawPathStart === -1 ? '' : apiBase.slice(rawPathStart);
  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (rawPath !== '' && rawPath !== '/')
    || parsed.pathname !== '/'
    || !parsed.hostname
    || (
      parsed.protocol !== 'https:'
      && !(parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))
    )
  ) {
    throw new TypeError('invalid_governed_backend_origin');
  }
  return parsed.origin;
}

function normalizeMethod(value) {
  const method = String(value || '').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new TypeError('invalid_governed_backend_method');
  }
  return method;
}

function normalizeIdempotencyKey(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    throw new TypeError('invalid_governed_idempotency_key');
  }
  return value;
}

export function buildGovernedRuntimeBindingPayload({
  timestamp,
  mcpSessionId,
  method,
  originalUrl,
  idempotencyKey = '',
  body,
  profile = GOVERNED_AGENT_API_PROFILE,
}) {
  if (typeof timestamp !== 'string' || !INTERNAL_TIMESTAMP.test(timestamp)) {
    throw new TypeError('invalid_governed_timestamp');
  }
  return [
    requireGovernedBackendProfile(profile).authPurpose,
    timestamp,
    requireMcpSessionId(mcpSessionId),
    normalizeMethod(method),
    assertGovernedBackendOriginalUrl(profile, originalUrl),
    normalizeIdempotencyKey(idempotencyKey),
    canonicalHash(body ?? null),
  ].join('\n');
}

export function buildGovernedBackendRequestAuth({
  secret,
  method,
  originalUrl,
  body,
  mcpSessionId,
  idempotencyKey = '',
  now = Date.now(),
  profile = GOVERNED_AGENT_API_PROFILE,
}) {
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new TypeError('invalid_governed_timestamp');
  }
  const timestamp = String(now);
  const normalizedSecret = requireSecret(secret);
  const payload = buildGovernedRuntimeBindingPayload({
    timestamp,
    mcpSessionId,
    method,
    originalUrl,
    idempotencyKey,
    body,
    profile,
  });
  const headers = {
    'mcp-session-id': mcpSessionId,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', normalizedSecret)
      .update(payload, 'utf8')
      .digest('hex'),
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return headers;
}

function safeEqualHex(left, right) {
  if (
    typeof left !== 'string'
    || typeof right !== 'string'
    || !INTERNAL_SIGNATURE.test(left)
    || !INTERNAL_SIGNATURE.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function verifyGovernedBackendRequestAuth({
  secret,
  method,
  originalUrl,
  body,
  headers,
  now = Date.now(),
  maxSkewMs = INTERNAL_MAX_CLOCK_SKEW_MS,
  profile = GOVERNED_AGENT_API_PROFILE,
}) {
  try {
    const normalizedSecret = requireSecret(secret);
    if (!headers || typeof headers !== 'object') return false;
    const timestamp = headers['x-internal-timestamp'];
    const mcpSessionId = headers['mcp-session-id'];
    const presented = String(headers['x-internal-signature'] || '').toLowerCase();
    const idempotencyKey = headers['idempotency-key'] ?? '';
    if (
      typeof timestamp !== 'string'
      || !INTERNAL_TIMESTAMP.test(timestamp)
      || !Number.isSafeInteger(now)
      || Math.abs(now - Number(timestamp)) > maxSkewMs
      || !INTERNAL_SIGNATURE.test(presented)
    ) {
      return false;
    }
    const expected = createHmac('sha256', normalizedSecret)
      .update(buildGovernedRuntimeBindingPayload({
        timestamp,
        mcpSessionId,
        method,
        originalUrl,
        idempotencyKey,
        body,
        profile,
      }), 'utf8')
      .digest('hex');
    return safeEqualHex(presented, expected);
  } catch {
    return false;
  }
}

async function readBoundedJson(
  response,
  maxBytes = MAX_GOVERNED_BACKEND_RESPONSE_BYTES,
) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > maxBytes
  ) {
    throw new Error('governed_backend_response_too_large');
  }
  const reader = response.body?.getReader?.();
  let text = '';
  if (!reader) {
    text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('governed_backend_response_too_large');
    }
  } else {
    const decoder = new TextDecoder();
    let bytesRead = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          throw new Error('governed_backend_response_invalid');
        }
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel('governed_backend_response_too_large');
          throw new Error('governed_backend_response_too_large');
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock?.();
    }
  }
  if (!text) throw new Error('governed_backend_response_invalid');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('governed_backend_response_invalid');
  }
  return parsed;
}

export function governedBackendRequest(
  operation,
  input,
  { profile = GOVERNED_AGENT_API_PROFILE } = {},
) {
  requireGovernedBackendProfile(profile);
  assertNoGovernedAuthorityOverrides(input);
  const parsed = GOVERNED_ASSET_INPUT_SCHEMAS[operation]?.safeParse(input);
  if (!parsed?.success) throw new TypeError('invalid_governed_tool_input');

  if (operation === 'prepare') {
    const { operationId, ...body } = parsed.data;
    return {
      method: 'POST',
      originalUrl: governedBackendOriginalUrl(profile, operation, parsed.data),
      idempotencyKey: operationId,
      body,
      bodyText: JSON.stringify(body),
      input: parsed.data,
    };
  }
  if (operation === 'execute') {
    const { operationId, intentId } = parsed.data;
    return {
      method: 'POST',
      originalUrl: governedBackendOriginalUrl(profile, operation, parsed.data),
      idempotencyKey: operationId,
      body: {},
      bodyText: '{}',
      input: parsed.data,
    };
  }
  if (operation === 'status') {
    return {
      method: 'GET',
      originalUrl: governedBackendOriginalUrl(profile, operation, parsed.data),
      idempotencyKey: '',
      body: null,
      bodyText: null,
      input: parsed.data,
    };
  }
  if (operation === 'reconcile') {
    return {
      method: 'POST',
      originalUrl: governedBackendOriginalUrl(profile, operation, parsed.data),
      idempotencyKey: '',
      body: {},
      bodyText: '{}',
      input: parsed.data,
    };
  }
  if (operation === 'history') {
    return {
      method: 'GET',
      originalUrl: governedBackendOriginalUrl(profile, operation, parsed.data),
      idempotencyKey: '',
      body: null,
      bodyText: null,
      input: parsed.data,
    };
  }
  throw new TypeError('invalid_governed_operation');
}

export async function callGovernedAssetBackend({
  apiBase,
  secret,
  operation,
  input,
  mcpSessionId,
  fetchImpl = fetch,
  now = Date.now(),
  timeoutMs = 5_000,
  profile = GOVERNED_AGENT_API_PROFILE,
}) {
  const apiOrigin = normalizeGovernedBackendOrigin(apiBase);
  requireMcpSessionId(mcpSessionId);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('invalid_governed_backend_timeout');
  }
  const request = governedBackendRequest(operation, input, { profile });
  const headers = buildGovernedBackendRequestAuth({
    secret,
    method: request.method,
    originalUrl: request.originalUrl,
    body: request.body,
    mcpSessionId,
    idempotencyKey: request.idempotencyKey,
    now,
    profile,
  });
  if (request.bodyText !== null) headers['content-type'] = 'application/json';

  let response;
  try {
    // Exactly one request. A lost execute response is ambiguous and may only
    // be followed by status/reconciliation for the same intent.
    response = await fetchImpl(`${apiOrigin}${request.originalUrl}`, {
      method: request.method,
      headers,
      ...(request.bodyText === null ? {} : { body: request.bodyText }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return buildGovernedAssetFailure({
      operation,
      input: request.input,
      code: 'governed_backend_transport_failed',
    });
  }

  let body;
  try {
    body = await readBoundedJson(
      response,
      operation === 'history'
        ? MAX_GOVERNED_HISTORY_RESPONSE_BYTES
        : MAX_GOVERNED_BACKEND_RESPONSE_BYTES,
    );
  } catch {
    return buildGovernedAssetFailure({
      operation,
      input: request.input,
      code: 'governed_backend_response_invalid',
    });
  }
  return normalizeGovernedAssetResult({
    operation,
    input: request.input,
    httpStatus: response.status,
    body,
  });
}
