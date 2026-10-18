import { integer } from '../../lib/zod-contract-primitives.mjs';
import { z } from 'zod';
import { createWidgetMeta } from '../widgetMeta.mjs';

const LIVE_ENDPOINT = process.env.PUMPSTREAM_LIVE_URL || 'https://pump.dexter.cash/api/live';

const PUMPSTREAM_WIDGET_META = createWidgetMeta({
  templateUri: 'ui://dexter/pumpstream',
  invoking: 'Loading live streams…',
  invoked: 'Streams ready',
  widgetDescription: 'Shows active Pump.fun live streams with thumbnails, viewer counts, and momentum indicators.',
});
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function clampPageSize(value) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  const normalized = Math.floor(value);
  if (normalized < 1) return 1;
  if (normalized > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return normalized;
}

function parsePageSize(args = {}) {
  if (typeof args === 'number') return clampPageSize(args);
  if (typeof args === 'string') return clampPageSize(Number.parseInt(args, 10));
  if (typeof args === 'object' && args !== null) {
    if (args.pageSize !== undefined) return parsePageSize(args.pageSize);
    if (args.limit !== undefined) return parsePageSize(args.limit);
  }
  return DEFAULT_PAGE_SIZE;
}

function parsePositiveInt(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return undefined;
}

function parsePage(value) {
  const raw = parsePositiveInt(value);
  if (raw === undefined) return undefined;
  if (raw < 1) return 1;
  return raw;
}

function parseSearchTerm(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function parseStringList(value, { lowercase = true } = {}) {
  if (!value && value !== 0) return [];
  const normalize = (item) => {
    const text = String(item || '').trim();
    if (!text) return '';
    return lowercase ? text.toLowerCase() : text;
  };
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/)
      .map(normalize)
      .filter(Boolean);
  }
  return [];
}

function parseSort(value) {
  if (!value || typeof value !== 'string') return undefined;
  const normalised = value.toLowerCase();
  if (normalised === 'viewers') return 'viewers';
  if (normalised === 'marketcap' || normalised === 'market_cap') return 'marketCap';
  return undefined;
}

function parseStatus(value) {
  if (!value || typeof value !== 'string') return undefined;
  const normalised = value.toLowerCase();
  if (normalised === 'live' || normalised === 'disconnecting') return normalised;
  if (normalised === 'all') return 'all';
  return undefined;
}

function parseNumber(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeUrlWithSort(endpoint, sort) {
  if (!sort) return endpoint;
  try {
    const url = new URL(endpoint);
    url.searchParams.set('sort', sort);
    return url.toString();
  } catch {
    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}sort=${encodeURIComponent(sort)}`;
  }
}

function filterStreams(streams, { status, minMarketCapUsd, minViewers, searchTerm, symbols, mintIds }) {
  return streams.filter((stream) => {
    if (status && status !== 'all') {
      if (stream.status !== status) return false;
    }
    if (Number.isFinite(minMarketCapUsd)) {
      const usd = stream?.metrics?.marketCap?.usd ?? stream?.metrics?.marketCap?.current ?? null;
      if (!(typeof usd === 'number' && usd >= minMarketCapUsd)) return false;
    }
    if (Number.isFinite(minViewers)) {
      const viewers = stream?.metrics?.viewers?.current ?? null;
      if (!(typeof viewers === 'number' && viewers >= minViewers)) return false;
    }
    if (symbols?.length) {
      const symbol = String(stream?.symbol || '').trim().toLowerCase();
      if (!symbol || !symbols.includes(symbol)) return false;
    }
    if (mintIds?.length) {
      const mintId = String(stream?.mintId || '').trim().toLowerCase();
      if (!mintId || !mintIds.includes(mintId)) return false;
    }
    if (searchTerm) {
      const haystack = `${stream?.name || ''} ${stream?.symbol || ''}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
}

function summariseStream(stream) {
  const marketCap = stream?.metrics?.marketCap || {};
  return {
    mintId: stream.mintId,
    name: stream.name,
    symbol: stream.symbol ?? null,
    status: stream.status,
    currentViewers: stream?.metrics?.viewers?.current ?? null,
    marketCapUsd: marketCap.usd ?? marketCap.current ?? null,
    marketCapSol: marketCap.sol ?? null,
    latestAt: stream.latestAt ?? null,
    lastSnapshotAgeSeconds: stream?.metrics?.lastSnapshotAgeSeconds ?? null,
    thumbnail: stream.thumbnail ?? null,
  };
}

function buildContent(livePayload, options) {
  const generatedAt = livePayload?.generatedAt || null;
  const windowMinutes = livePayload?.windowMinutes || null;
  const streams = Array.isArray(livePayload?.streams) ? livePayload.streams : [];
  const appliedFilters = {
    status: options?.status ?? null,
    minMarketCapUsd: options?.minMarketCapUsd ?? null,
    minViewers: options?.minViewers ?? null,
    search: options?.searchTerm ?? null,
    symbols: options?.symbolsDisplay?.length ? options.symbolsDisplay : null,
    mintIds: options?.mintIdsDisplay?.length ? options.mintIdsDisplay : null,
  };
  const filtered = filterStreams(streams, {
    status: appliedFilters.status ?? undefined,
    minMarketCapUsd: options?.minMarketCapUsd,
    minViewers: options?.minViewers,
    searchTerm: options?.searchTerm,
    symbols: options?.symbols,
    mintIds: options?.mintIds,
  });
  const pageSize = options?.pageSize ?? (filtered.length > 0 ? filtered.length : DEFAULT_PAGE_SIZE);
  const rawOffset = Math.max(options?.offset ?? 0, 0);
  const offset = rawOffset >= filtered.length ? filtered.length : rawOffset;
  const paged = filtered.slice(offset, offset + pageSize);
  const currentPage = pageSize > 0 ? Math.floor(offset / pageSize) + 1 : 1;
  const totalPages = pageSize > 0 ? Math.ceil(filtered.length / pageSize) : 0;
  const nextOffsetCandidate = offset + paged.length;
  const nextOffset = nextOffsetCandidate < filtered.length ? nextOffsetCandidate : null;
  const previousOffset = offset > 0 ? Math.max(offset - pageSize, 0) : null;
  const remainingAfterPage = Math.max(filtered.length - nextOffsetCandidate, 0);

  const summary = {
    generatedAt,
    windowMinutes,
    totalAvailable: streams.length,
    totalAfterFilter: filtered.length,
    totalReturned: paged.length,
    appliedSort: options?.sort ?? livePayload?.sort ?? null,
    appliedFilters,
    paging: {
      pageSize,
      offset,
      currentPage,
      totalPages,
      requestedPage: options?.page ?? null,
      hasMore: nextOffset !== null,
      nextOffset,
      previousOffset,
      remainingAfterPage,
    },
    totals: livePayload?.totals
      ? {
          totalStreams: livePayload.totals.totalStreams ?? null,
          liveStreams: livePayload.totals.liveStreams ?? null,
          disconnectingStreams: livePayload.totals.disconnectingStreams ?? null,
          totalLiveViewers: livePayload.totals.totalLiveViewers ?? null,
          totalLiveMarketCapUsd: livePayload.totals.totalLiveMarketCap ?? null,
        }
      : null,
    streams: paged.map(summariseStream),
  };

  if (options?.includeSpotlight) {
    const spotlight = Array.isArray(livePayload?.spotlight) ? livePayload.spotlight : [];
    summary.spotlight = spotlight.map(summariseStream);
  }

  return {
    structuredContent: summary,
    content: [{ type: 'text', text: JSON.stringify(summary) }],
  };
}

async function fetchLiveData(options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const requestUrl = normalizeUrlWithSort(LIVE_ENDPOINT, options?.sort);
    const response = await fetch(requestUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'pumpstream_http_error', status: response.status, body: text.slice(0, 200) }),
          },
        ],
        isError: true,
      };
    }
    const json = await response.json().catch(() => null);
    if (!json) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'pumpstream_invalid_json' }) }],
        isError: true,
      };
    }
    return buildContent(json, options);
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'pumpstream_fetch_failed', message: error?.message || String(error) }) }],
      isError: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function registerPumpstreamToolset(server) {
  server.registerTool(
    'pumpstream_live_summary',
    {
      title: 'Pumpstream Live Summary',
      description: 'Returns a quick summary of live pump.fun streams.',
      annotations: {
        readOnlyHint: true,
      },
      _meta: {
        category: 'analytics',
        access: 'guest',
        tags: ['pump.fun', 'streams'],
        ...PUMPSTREAM_WIDGET_META,
      },
      inputSchema: {
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .describe(`Number of streams to include per page (1-${MAX_PAGE_SIZE}). Defaults to ${DEFAULT_PAGE_SIZE}.`)
          .optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .describe('Deprecated alias for pageSize; kept for backward compatibility.')
          .optional(),
        offset: integer()
          .min(0)
          .describe('Zero-based index of the first stream to return after filtering. Use with pageSize for pagination.')
          .optional(),
        page: integer()
          .min(1)
          .describe('1-based page number. Overrides offset when provided.')
          .optional(),
        sort: z
          .enum(['marketCap', 'viewers'])
          .describe('Sort order applied by the API (marketCap or viewers).')
          .optional(),
        status: z
          .enum(['live', 'disconnecting', 'all'])
          .describe('Filter streams by connection status.')
          .optional(),
        minMarketCapUsd: z
          .number()
          .nonnegative()
          .describe('Minimum USD market cap required for streams to appear.')
          .optional(),
        minViewers: z
          .number()
          .nonnegative()
          .describe('Minimum live viewer count required for streams to appear.')
          .optional(),
        search: z
          .string()
          .describe('Case-insensitive search term applied to name and symbol.')
          .optional(),
        symbols: z
          .union([z.string(), z.array(z.string())])
          .describe('Restrict results to one or more symbols (string or string array).')
          .optional(),
        symbol: z
          .string()
          .describe('Single-symbol shorthand; equivalent to providing symbols with one entry.')
          .optional(),
        mintIds: z
          .union([z.string(), z.array(z.string())])
          .describe('Restrict results to one or more mint IDs (string or string array).')
          .optional(),
        mintId: z
          .string()
          .describe('Single mint shorthand; equivalent to providing mintIds with one entry.')
          .optional(),
        includeSpotlight: z
          .boolean()
          .describe('Include the spotlight list in the response payload.')
          .optional(),
      },
    },
    async (args = {}) => {
      const pageSize = parsePageSize(args);
      const page = parsePage(args?.page);
      let offset = 0;
      if (typeof args === 'object' && args !== null) {
        if (args.offset !== undefined) offset = parsePositiveInt(args.offset) ?? 0;
        else if (args.skip !== undefined) offset = parsePositiveInt(args.skip) ?? 0;
        else if (args.cursor !== undefined) offset = parsePositiveInt(args.cursor) ?? 0;
      }
      if (page !== undefined) {
        offset = (page - 1) * pageSize;
      }
      const sort = parseSort(args.sort);
      const status = parseStatus(args.status);
      const minMarketCapUsd = parseNumber(args.minMarketCapUsd);
      const minViewers = parseNumber(args.minViewers);
      const includeSpotlight = Boolean(args.includeSpotlight);
      const searchTerm = parseSearchTerm(args.search ?? args.query ?? '');
      const symbolsInput = args.symbols ?? args.symbol ?? null;
      const symbolFilters = parseStringList(symbolsInput, { lowercase: true });
      const symbolFiltersDisplay = parseStringList(symbolsInput, { lowercase: false });
      const mintsInput = args.mintIds ?? args.mintId ?? null;
      const mintFilters = parseStringList(mintsInput, { lowercase: true });
      const mintFiltersDisplay = parseStringList(mintsInput, { lowercase: false });

      return fetchLiveData({
        sort,
        status,
        minMarketCapUsd,
        minViewers,
        includeSpotlight,
        pageSize,
        offset,
        page,
        searchTerm,
        symbols: symbolFilters,
        symbolsDisplay: symbolFiltersDisplay,
        mintIds: mintFilters,
        mintIdsDisplay: mintFiltersDisplay,
      });
    }
  );
}
