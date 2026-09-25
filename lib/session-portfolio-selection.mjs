import { fetchInternalApi, normalizeInternalApiOrigin } from './internal-api-fetch.mjs';
import { signedSessionPortfolioHeaders } from './session-portfolio.mjs';
import { PORTFOLIO_READ_SCHEMAS, PORTFOLIO_READ_V3_SCHEMAS } from './open-tool-contracts.mjs';
import { normalizePortfolioReadInput, PORTFOLIO_SELECTED_MAX_BYTES } from './portfolio-read-contract.mjs';

const readFailure = (error = 'portfolio_read_unavailable') => ({ ok: false, error });
const HTTP_ERRORS = new Map([
  [400, 'portfolio_query_invalid'], [409, 'portfolio_snapshot_expired'], [413, 'portfolio_snapshot_too_large'],
  [422, 'portfolio_result_budget_exceeded'], [503, 'portfolio_read_unavailable'],
]);

function logReadDiagnostic(diagnostic) {
  const line = `[open-mcp] portfolio-selected-read ${JSON.stringify(diagnostic)}`;
  if (diagnostic.outcome === 'success') console.log(line);
  else console.warn(line);
}
export function validatePortfolioSelectedRead(value, { expectedWalletAddress, expectedReadVersion } = {}) {
  const readVersion = value?.portfolio?.contractVersion === 'opendexter.portfolio.v3' ? 3 : 2;
  if (expectedReadVersion !== undefined && readVersion !== expectedReadVersion) return null;
  const schemas = readVersion === 3 ? PORTFOLIO_READ_V3_SCHEMAS : PORTFOLIO_READ_SCHEMAS;
  const result = schemas.response.safeParse(value);
  return result.success && result.data.portfolio.walletAddress === expectedWalletAddress ? result.data : null;
}

async function readBounded(response, signal) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > PORTFOLIO_SELECTED_MAX_BYTES) {
    await response.body?.cancel?.();
    return { failure: 'body_too_large' };
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    signal.throwIfAborted();
    return Buffer.byteLength(text, 'utf8') <= PORTFOLIO_SELECTED_MAX_BYTES
      ? { text } : { failure: 'body_too_large' };
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0; let text = '';
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array)) return { failure: 'body_invalid_chunk' };
      size += value.byteLength;
      if (size > PORTFOLIO_SELECTED_MAX_BYTES) { await reader.cancel(); return { failure: 'body_too_large' }; }
      text += decoder.decode(value, { stream: true });
    }
    return { text: text + decoder.decode() };
  } finally { reader.releaseLock?.(); }
}
function matchesRequest(input, portfolio) {
  const selection = portfolio.selection;
  for (const key of ['view', 'query', 'mint', 'tokenAccount', 'limit']) {
    if (input[key] !== undefined && input[key] !== selection[key]) return false;
  }
  if (input.snapshotId !== undefined && input.snapshotId !== portfolio.snapshotId) return false;
  if (input.network !== undefined && input.network !== portfolio.network) return false;
  if (input.holdingSnapshotId !== undefined && (portfolio.source?.kind !== 'action_targets'
    || portfolio.source.holdingSnapshotId !== input.holdingSnapshotId)) return false;
  if (input.readVersion === 3 && selection.view === 'targets' && !input.snapshotId && !input.cursor
    && portfolio.source?.holdingSnapshotId !== (input.holdingSnapshotId ?? null)) return false;
  if (!input.cursor) {
    if (selection.offset !== 0) return false;
    for (const key of ['query', 'mint', 'tokenAccount']) if (input[key] === undefined && selection[key] !== null) return false;
    if (input.limit === undefined && selection.limit !== (selection.view === 'summary' ? 5 : 32)) return false;
  }
  return true;
}

export async function fetchSessionPortfolioSelection({
  apiBase, sessionId, expectedWalletAddress, secret, input = {},
  fetchImpl = fetch, timeoutMs = 20_000, now = Date.now,
  onDiagnostic = logReadDiagnostic,
}) {
  const startedAt = performance.now();
  const attemptRef = randomUUID();
  let stage = 'input';
  let causeClass = null;
  let httpStatus = null;
  const finish = (result) => {
    // Only locally selected categories and a fresh opaque attempt ID leave this
    // boundary. Never retain caught errors, inputs, response bodies or identities.
    try {
      onDiagnostic({
        at: new Date().toISOString(), attemptRef, stage,
        outcome: result.ok ? 'success' : 'failure', causeClass,
        elapsedMs: Math.max(0, Math.ceil(performance.now() - startedAt)),
        budgetMs: timeoutMs, httpStatus,
      });
    } catch { /* Logging must not change the tool result or trigger a retry. */ }
    return result;
  };
  const fail = (cause, error) => {
    causeClass = cause;
    return readFailure(error);
  };
  let selected;
  try { selected = normalizePortfolioReadInput(input); }
  catch { return finish(fail('input_invalid', 'portfolio_query_invalid')); }
  stage = 'prerequisite';
  if (!sessionId || !expectedWalletAddress || !secret) return finish(fail('missing_prerequisite'));
  let timer; let onAbort;
  const controller = new AbortController();
  try {
    // Bound the whole fetch and body even if a test/custom fetch ignores abort.
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Error('portfolio_read_deadline'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs);
    });
    const task = async () => {
      stage = 'request_setup';
      const { readVersion, ...queryInput } = selected;
      const query = new URLSearchParams(Object.entries(queryInput).map(([key, value]) => [key, String(value)]));
      const origin = normalizeInternalApiOrigin(apiBase);
      const headers = {
        ...signedSessionPortfolioHeaders(sessionId, secret, now()),
        'X-Dexter-Portfolio-Request-Id': attemptRef,
        ...(readVersion === 3 ? { 'X-Dexter-Portfolio-Read-Version': '3' } : {}),
      };
      stage = 'request';
      const response = await fetchInternalApi(`/api/passkey-anon/mcp-portfolio/${encodeURIComponent(sessionId)}?${query}`, {
        headers, signal: controller.signal,
      }, { origin, fetchImpl });
      httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status : null;
      stage = 'response_body';
      const read = await readBounded(response, controller.signal);
      if (read.failure) return fail(read.failure);
      stage = 'response_json';
      const body = JSON.parse(read.text);
      stage = 'response_status';
      if (!response.ok) {
        const error = HTTP_ERRORS.get(response.status);
        return fail('http_error', error && body?.ok === false && body?.error === error
          && Object.keys(body).length === 2 ? error : undefined);
      }
      stage = 'response_validation';
      const checked = validatePortfolioSelectedRead(body, { expectedWalletAddress, expectedReadVersion: readVersion });
      if (!checked) return fail('schema_or_wallet_mismatch');
      stage = 'selection_binding';
      if (!matchesRequest(selected, checked.portfolio)) return fail('selection_mismatch');
      stage = 'snapshot_expiry';
      if (Date.parse(checked.portfolio.expiresAt) <= now()) return fail('snapshot_expired', 'portfolio_snapshot_expired');
      stage = 'complete';
      return checked;
    };
    return finish(await Promise.race([task(), aborted]));
  } catch {
    return finish(fail(controller.signal.aborted ? 'deadline_exceeded' : ({
      request_setup: 'request_setup_error', request: 'transport_error',
      response_body: 'body_read_error', response_json: 'invalid_json',
    }[stage] || 'unexpected_error')));
  }
  finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
