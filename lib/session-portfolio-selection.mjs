import { fetchInternalApi, normalizeInternalApiOrigin } from './internal-api-fetch.mjs';
import { signedSessionPortfolioHeaders } from './session-portfolio.mjs';
import { PORTFOLIO_READ_SCHEMAS } from './open-tool-contracts.mjs';
import { normalizePortfolioReadInput, PORTFOLIO_SELECTED_MAX_BYTES } from './portfolio-read-contract.mjs';

const readFailure = (error = 'portfolio_read_unavailable') => ({ ok: false, error });
const HTTP_ERRORS = new Map([
  [400, 'portfolio_query_invalid'], [409, 'portfolio_snapshot_expired'], [413, 'portfolio_snapshot_too_large'],
  [422, 'portfolio_result_budget_exceeded'], [503, 'portfolio_read_unavailable'],
]);
export function validatePortfolioSelectedRead(value, { expectedWalletAddress } = {}) {
  const result = PORTFOLIO_READ_SCHEMAS.response.safeParse(value);
  return result.success && result.data.portfolio.walletAddress === expectedWalletAddress ? result.data : null;
}

async function readBounded(response, signal) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > PORTFOLIO_SELECTED_MAX_BYTES) {
    await response.body?.cancel?.();
    return null;
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    signal.throwIfAborted();
    return Buffer.byteLength(text, 'utf8') <= PORTFOLIO_SELECTED_MAX_BYTES ? text : null;
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0; let text = '';
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array)) return null;
      size += value.byteLength;
      if (size > PORTFOLIO_SELECTED_MAX_BYTES) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock?.(); }
}
function matchesRequest(input, portfolio) {
  const selection = portfolio.selection;
  for (const key of ['view', 'query', 'mint', 'tokenAccount', 'limit']) {
    if (input[key] !== undefined && input[key] !== selection[key]) return false;
  }
  if (input.snapshotId !== undefined && input.snapshotId !== portfolio.snapshotId) return false;
  if (input.network !== undefined && input.network !== portfolio.network) return false;
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
}) {
  let selected;
  try { selected = normalizePortfolioReadInput(input); } catch { return readFailure('portfolio_query_invalid'); }
  if (!sessionId || !expectedWalletAddress || !secret) return readFailure();
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
      const query = new URLSearchParams(Object.entries(selected).map(([key, value]) => [key, String(value)]));
      const response = await fetchInternalApi(`/api/passkey-anon/mcp-portfolio/${encodeURIComponent(sessionId)}?${query}`, {
        headers: signedSessionPortfolioHeaders(sessionId, secret, now()), signal: controller.signal,
      }, { origin: normalizeInternalApiOrigin(apiBase), fetchImpl });
      const text = await readBounded(response, controller.signal);
      if (text === null) return readFailure();
      const body = JSON.parse(text);
      if (!response.ok) {
        const error = HTTP_ERRORS.get(response.status);
        return readFailure(error && body?.ok === false && body?.error === error
          && Object.keys(body).length === 2 ? error : undefined);
      }
      const checked = validatePortfolioSelectedRead(body, { expectedWalletAddress });
      if (!checked || !matchesRequest(selected, checked.portfolio)) return readFailure();
      if (Date.parse(checked.portfolio.expiresAt) <= now()) return readFailure('portfolio_snapshot_expired');
      return checked;
    };
    return await Promise.race([task(), aborted]);
  } catch { return readFailure(); }
  finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
