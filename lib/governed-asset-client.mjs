import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  GOVERNED_ASSET_CONTRACT_VERSION,
  GOVERNED_ASSET_INPUT_SCHEMAS,
  assertNoGovernedAuthorityOverrides,
} from './governed-asset-contract.mjs';
import { normalizeGovernedAssetResult } from './governed-asset-result.mjs';

export const GOVERNED_BACKEND_AUTH_PURPOSE =
  'opendexter-governed-asset-request-v1';
export const MAX_GOVERNED_BACKEND_RESPONSE_BYTES = 128 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalJson(value) {
  if (value === undefined) {
    throw new TypeError('undefined_governed_request_value');
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('governed_backend_secret_unavailable');
  }
}

function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new TypeError(`invalid_${name}`);
  }
}

function normalizeMethod(value) {
  const method = String(value || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new TypeError('invalid_governed_backend_method');
  }
  return method;
}

function normalizePath(value) {
  if (
    typeof value !== 'string'
    || !value.startsWith('/internal/mcp/governed-assets/')
    || value.includes('?')
    || value.includes('#')
    || value.includes('..')
  ) {
    throw new TypeError('invalid_governed_backend_path');
  }
  return value;
}

function signatureInput({
  timestamp,
  method,
  path,
  bodySha256,
  operationId,
  correlationId,
}) {
  return [
    GOVERNED_BACKEND_AUTH_PURPOSE,
    timestamp,
    method,
    path,
    bodySha256,
    operationId,
    correlationId,
  ].join('\n');
}

export function buildGovernedBackendRequestAuth({
  secret,
  method,
  path,
  bodyText,
  operationId,
  correlationId,
  now = Date.now(),
}) {
  requireSecret(secret);
  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = normalizePath(path);
  requireUuid(operationId, 'operation_id');
  requireUuid(correlationId, 'correlation_id');
  if (typeof bodyText !== 'string') throw new TypeError('invalid_body_text');
  if (!Number.isSafeInteger(now) || now <= 0) throw new TypeError('invalid_timestamp');

  const timestamp = String(now);
  const bodySha256 = sha256(bodyText);
  const signature = createHmac('sha256', secret)
    .update(signatureInput({
      timestamp,
      method: normalizedMethod,
      path: normalizedPath,
      bodySha256,
      operationId,
      correlationId,
    }))
    .digest('hex');
  return {
    'content-type': 'application/json',
    'idempotency-key': operationId,
    'x-dexter-purpose': GOVERNED_BACKEND_AUTH_PURPOSE,
    'x-dexter-timestamp': timestamp,
    'x-dexter-body-sha256': bodySha256,
    'x-dexter-operation-id': operationId,
    'x-dexter-correlation-id': correlationId,
    'x-dexter-signature': signature,
  };
}

function safeEqualHex(left, right) {
  if (
    typeof left !== 'string'
    || typeof right !== 'string'
    || !/^[a-f0-9]{64}$/.test(left)
    || !/^[a-f0-9]{64}$/.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function verifyGovernedBackendRequestAuth({
  secret,
  method,
  path,
  bodyText,
  headers,
  now = Date.now(),
  maxSkewMs = 60_000,
}) {
  try {
    requireSecret(secret);
    const normalizedMethod = normalizeMethod(method);
    const normalizedPath = normalizePath(path);
    if (!headers || typeof headers !== 'object') return false;
    const timestamp = headers['x-dexter-timestamp'];
    const operationId = headers['x-dexter-operation-id'];
    const correlationId = headers['x-dexter-correlation-id'];
    const bodySha256 = headers['x-dexter-body-sha256'];
    const presented = headers['x-dexter-signature'];
    requireUuid(operationId, 'operation_id');
    requireUuid(correlationId, 'correlation_id');
    if (
      headers['x-dexter-purpose'] !== GOVERNED_BACKEND_AUTH_PURPOSE
      || headers['idempotency-key'] !== operationId
      || !/^[0-9]{10,16}$/.test(timestamp)
      || Math.abs(now - Number(timestamp)) > maxSkewMs
      || !safeEqualHex(bodySha256, sha256(bodyText))
    ) {
      return false;
    }
    const expected = createHmac('sha256', secret)
      .update(signatureInput({
        timestamp,
        method: normalizedMethod,
        path: normalizedPath,
        bodySha256,
        operationId,
        correlationId,
      }))
      .digest('hex');
    return safeEqualHex(presented, expected);
  } catch {
    return false;
  }
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_GOVERNED_BACKEND_RESPONSE_BYTES
  ) {
    throw new Error('governed_backend_response_too_large');
  }
  const reader = response.body?.getReader?.();
  let text = '';
  if (!reader) {
    text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_GOVERNED_BACKEND_RESPONSE_BYTES) {
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
        if (bytesRead > MAX_GOVERNED_BACKEND_RESPONSE_BYTES) {
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
  if (!text) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : {};
}

export function governedBackendPath(phase, action) {
  if (!Object.hasOwn(GOVERNED_ASSET_INPUT_SCHEMAS, phase)) {
    throw new TypeError('invalid_governed_phase');
  }
  if (!['send', 'buy', 'sell'].includes(action)) {
    throw new TypeError('invalid_governed_action');
  }
  return `/internal/mcp/governed-assets/${phase}/${action}`;
}

export async function callGovernedAssetBackend({
  apiBase,
  secret,
  phase,
  input,
  mcpSessionId,
  fetchImpl = fetch,
  correlationId = randomUUID(),
  now = Date.now(),
  timeoutMs = 5_000,
}) {
  if (typeof apiBase !== 'string' || !/^https?:\/\//.test(apiBase)) {
    throw new TypeError('invalid_governed_backend_origin');
  }
  requireUuid(mcpSessionId, 'mcp_session_id');
  requireUuid(correlationId, 'correlation_id');
  assertNoGovernedAuthorityOverrides(input);
  const parsed = GOVERNED_ASSET_INPUT_SCHEMAS[phase]?.safeParse(input);
  if (!parsed?.success) throw new TypeError('invalid_governed_tool_input');

  const { operationId, action, ...request } = parsed.data;
  const path = governedBackendPath(phase, action);
  const bodyText = canonicalJson({
    contractVersion: GOVERNED_ASSET_CONTRACT_VERSION,
    operationId,
    correlationId,
    mcpSessionId,
    action,
    request,
  });
  const headers = buildGovernedBackendRequestAuth({
    secret,
    method: 'POST',
    path,
    bodyText,
    operationId,
    correlationId,
    now,
  });

  let response;
  try {
    // Deliberately one fetch. A transport failure after execution begins is
    // ambiguous; retrying here could create a second on-chain action.
    response = await fetchImpl(`${apiBase.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: bodyText,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return normalizeGovernedAssetResult({
      phase,
      action,
      operationId,
      correlationId,
      httpStatus: 0,
      body: {
        status: phase === 'execute' ? 'unknown' : 'uncertain',
        code: 'governed_backend_transport_failed',
        explanation:
          phase === 'execute'
            ? 'Execution outcome is unknown and must be reconciled before any retry.'
            : 'The backend response was unavailable. Retry only with the same operationId.',
      },
    });
  }

  let body;
  try {
    body = await readBoundedJson(response);
  } catch {
    body = {
      status: phase === 'execute' ? 'unknown' : 'uncertain',
      code: 'governed_backend_response_invalid',
      explanation:
        phase === 'execute'
          ? 'Execution outcome is unknown and must be reconciled before any retry.'
          : 'The backend response was invalid. Retry only with the same operationId.',
    };
  }
  return normalizeGovernedAssetResult({
    phase,
    action,
    operationId,
    correlationId,
    httpStatus: response.status,
    body,
  });
}
