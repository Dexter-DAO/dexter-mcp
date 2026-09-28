import { fetchInternalApi, resolveInternalApiOrigin } from './internal-api-fetch.mjs';
import { ASSET_SEARCH_INPUT_SCHEMA, ASSET_SEARCH_OUTPUT_SCHEMA } from './asset-search-contract.mjs';

const MAX_RESPONSE_BYTES = 64 * 1024;

function unavailable(input, error = 'asset_search_unavailable') {
  const kind = input?.kind ?? 'all';
  return {
    namespace: 'dexter-asset-search/v1', query: input?.query ?? 'invalid query', kind,
    observedAt: new Date().toISOString(),
    stocks: { status: kind === 'tokens' ? 'not_requested' : 'unavailable', items: [], nextOffset: null },
    tokens: { status: kind === 'stocks' ? 'not_requested' : 'unavailable', items: [], hasMore: false, coverage: 'provider_results' },
    tradingAvailability: 'requires_prepare', error,
  };
}

async function boundedJson(response) {
  if (!response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('invalid response');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body.cancel(); throw new Error('oversize response');
  }
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('oversize response');
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function findAssets(args, { origin = resolveInternalApiOrigin(), fetchImpl = fetch } = {}) {
  const parsed = ASSET_SEARCH_INPUT_SCHEMA.safeParse(args);
  if (!parsed.success) return unavailable(null, 'asset_search_query_invalid');
  const input = parsed.data;
  const parameters = new URLSearchParams({ q: input.query, kind: input.kind ?? 'all',
    offset: String(input.offset ?? 0), limit: String(input.limit ?? 10) });
  try {
    const response = await fetchInternalApi(`/api/assets/v1/search?${parameters}`, {
      method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000),
    }, { origin, fetchImpl });
    if (!response.ok) { await response.body?.cancel(); return unavailable(input); }
    const result = ASSET_SEARCH_OUTPUT_SCHEMA.parse(await boundedJson(response));
    if (result.query !== input.query || result.kind !== (input.kind ?? 'all')
      || result.stocks.items.length > (input.limit ?? 10) || result.tokens.items.length > (input.limit ?? 10)
      || (result.stocks.nextOffset !== null && (result.stocks.items.length === 0
        || result.stocks.nextOffset !== (input.offset ?? 0) + result.stocks.items.length))) return unavailable(input);
    return result;
  } catch { return unavailable(input); }
}

export async function assetSearchTool(args, dependencies) {
  const result = await findAssets(args, dependencies);
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result,
    isError: Boolean(result.error) };
}
