import { createHmac } from 'node:crypto';
import { canonicalHash } from './governed-canonical-identity.mjs';
import { normalizeGovernedBackendOrigin } from './governed-asset-client.mjs';
import { GOVERNED_AGENT_API_PROFILE } from './governed-asset-backend-profile.mjs';
import { AGENT_WORK_REPORT_INPUT_SCHEMA, AGENT_WORK_REPORT_OUTPUT_SCHEMA } from './agent-work-report-contract.mjs';

const WORK_PATH = '/api/passkey-vault/agents/self/work';
const MAX_RESPONSE_BYTES = 16 * 1_024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const API_ERROR_STATUS = Object.freeze({
  agent_work_invalid_request: 400,
  agent_work_runtime_auth_invalid: 401,
  agent_work_identity_invalid: 403,
  agent_work_idempotency_conflict: 409,
  agent_work_revision_conflict: 409,
  agent_work_store_unavailable: 503,
});

export function buildAgentWorkReportLocalError({ input, code, retryAfterMs = null }) {
  return AGENT_WORK_REPORT_OUTPUT_SCHEMA.parse({
    namespace: 'opendexter-agent-work-report-local-error/v1',
    code,
    operationId: input.operationId,
    retryable: code !== 'configuration_unavailable',
    retryWithSameOperationOnly: true,
    retryAfterMs,
  });
}

function signedHeaders({ input, secret, mcpSessionId, now }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret.trim(), 'utf8') < 32) {
    throw new TypeError('governed_backend_secret_unavailable');
  }
  if (typeof mcpSessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(mcpSessionId)) {
    throw new TypeError('invalid_mcp_session_id');
  }
  if (!Number.isSafeInteger(now) || !/^[1-9][0-9]{12}$/.test(String(now))) {
    throw new TypeError('invalid_governed_timestamp');
  }
  const timestamp = String(now);
  const transcript = [
    GOVERNED_AGENT_API_PROFILE.authPurpose,
    timestamp,
    mcpSessionId,
    'POST',
    WORK_PATH,
    input.operationId,
    canonicalHash(input),
  ].join('\n');
  return {
    'content-type': 'application/json',
    'mcp-session-id': mcpSessionId,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', secret.trim()).update(transcript, 'utf8').digest('hex'),
    'idempotency-key': input.operationId,
  };
}

function retryAfter(response, now) {
  const value = response.headers?.get?.('retry-after');
  if (typeof value !== 'string' || value.length > 128) return null;
  let milliseconds;
  if (/^[0-9]{1,8}$/.test(value)) milliseconds = Number(value) * 1_000;
  else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    milliseconds = Math.max(0, Date.parse(value) - now);
  }
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= 86_400_000
    ? milliseconds : null;
}

async function readJson(response) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('oversize');
  const reader = response.body?.getReader?.();
  let text = '';
  if (reader) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new Error('invalid_chunk');
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel('response_too_large');
          throw new Error('oversize');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock?.();
    }
  } else {
    text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('oversize');
  }
  return JSON.parse(text);
}

function matchesRequest(body, status, input, now) {
  if (body.operationId !== null && body.operationId !== input.operationId) return false;
  const reports = body.namespace === 'dexter-agent-work-report-ack/v1'
    ? [body.report] : body.currentReport ? [body.currentReport] : [];
  if (reports.some((report) => Date.parse(report.observedAt) > now + MAX_CLOCK_SKEW_MS)) return false;
  if (body.namespace === 'dexter-agent-work-report-ack/v1') {
    const report = body.report;
    const expectedTtl = input.ttlSeconds ?? (body.replayed ? undefined : 300);
    return status === 200 && report.state === input.state && report.summary === input.summary
      && report.revision === input.expectedRevision + 1
      && (expectedTtl === undefined
        || Date.parse(report.expiresAt) - Date.parse(report.observedAt) === expectedTtl * 1_000);
  }
  if (body.namespace !== 'dexter-agent-work-report-error/v1' || API_ERROR_STATUS[body.code] !== status) return false;
  return body.code !== 'agent_work_revision_conflict'
    || (body.currentRevision !== input.expectedRevision && body.currentReport?.reportId !== input.operationId);
}

export async function callAgentWorkReportBackend({
  apiBase,
  secret,
  input,
  mcpSessionId,
  fetchImpl = fetch,
  now = Date.now(),
  timeoutMs = 5_000,
}) {
  const parsedInput = AGENT_WORK_REPORT_INPUT_SCHEMA.parse(input);
  const origin = normalizeGovernedBackendOrigin(apiBase);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('invalid_agent_work_report_timeout');
  }
  const headers = signedHeaders({ input: parsedInput, secret, mcpSessionId, now });
  const url = `${origin}${WORK_PATH}`;
  const controller = new AbortController();
  const failure = (code, retryAfterMs = null) => buildAgentWorkReportLocalError({ input: parsedInput, code, retryAfterMs });
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(failure('transport_failed'));
    }, timeoutMs);
  });
  const request = async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', headers, body: JSON.stringify(parsedInput),
        redirect: 'error', signal: controller.signal,
      });
    } catch {
      return failure('transport_failed');
    }
    try {
      if (!response || typeof response !== 'object' || !Number.isInteger(response.status)
        || response.status < 200 || response.status > 599 || response.redirected === true
        || (response.url && response.url !== url)) return failure('response_invalid');
      if (response.status === 429) return failure('rate_limited', retryAfter(response, now));
      const parsed = AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(await readJson(response));
      return parsed.success && matchesRequest(parsed.data, response.status, parsedInput, now)
        ? parsed.data : failure('response_invalid');
    } catch {
      return failure('response_invalid');
    }
  };
  try {
    return await Promise.race([request(), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
