/**
 * @dexterai/x402-core — Capability search HTTP client
 *
 * ONE canonical search function that replaces the duplicated HTTP clients in:
 *   - packages/mcp/src/tools/search.ts (capabilitySearch)
 *   - dexter-x402-sdk/src/client/discovery.ts (capabilitySearch)
 *   - open-mcp-server.mjs (inline fetch)
 *   - toolsets/x402-client/index.mjs (inline fetch)
 */

import type {
  CapabilitySearchOptions,
  CapabilitySearchResult,
  RawCapabilityResponse,
} from './types.js';
import { formatResource } from './format.js';
import { normalizeRankingState } from './ranking.js';

const DEFAULT_ENDPOINT = 'https://x402.dexter.cash/api/x402gle/capability';
const DEFAULT_TIMEOUT = 20_000;

function assertUsdcPriceConstraint(
  field: 'maxPriceUsdc' | 'minPriceUsdc',
  value: unknown,
): asserts value is number | undefined {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `capabilitySearch: ${field} must be a finite nonnegative number`,
    );
  }
}

function returnedUsdcPriceConstraint(
  field: 'maxPriceUsdc' | 'minPriceUsdc',
  value: unknown,
): number | null | undefined {
  if (value === undefined || value === null) return value;
  assertUsdcPriceConstraint(field, value);
  return value;
}

/**
 * Search the Dexter x402 marketplace using semantic capability search.
 *
 * Returns tiered results (strongResults + relatedResults) with every field
 * run through the canonical formatResource(). Handles synonym expansion and
 * cross-encoder LLM rerank internally — pass the user's natural-language
 * intent directly.
 *
 * @example
 * ```typescript
 * import { capabilitySearch } from '@dexterai/x402-core';
 *
 * const result = await capabilitySearch({ query: 'get ETH spot price' });
 * for (const api of result.strongResults) {
 *   console.log(`${api.name} (${api.tier}): ${api.price}`);
 * }
 * ```
 */
export async function capabilitySearch(
  options: CapabilitySearchOptions,
): Promise<CapabilitySearchResult> {
  if (!options?.query?.trim()) {
    throw new Error('capabilitySearch: query is required');
  }

  const {
    query,
    limit = 20,
    unverified,
    testnets,
    rerank,
    maxPriceUsdc,
    minPriceUsdc,
    debug,
    endpoint = DEFAULT_ENDPOINT,
  } = options;

  assertUsdcPriceConstraint('maxPriceUsdc', maxPriceUsdc);
  assertUsdcPriceConstraint('minPriceUsdc', minPriceUsdc);
  if (
    maxPriceUsdc !== undefined
    && minPriceUsdc !== undefined
    && minPriceUsdc > maxPriceUsdc
  ) {
    throw new RangeError(
      'capabilitySearch: minPriceUsdc must be less than or equal to maxPriceUsdc',
    );
  }

  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(Math.min(Math.max(limit, 1), 50)));
  if (unverified) params.set('unverified', 'true');
  if (testnets) params.set('testnets', 'true');
  if (rerank === false) params.set('rerank', 'false');
  if (maxPriceUsdc !== undefined) {
    params.set('maxPriceUsdc', String(maxPriceUsdc));
  }
  if (minPriceUsdc !== undefined) {
    params.set('minPriceUsdc', String(minPriceUsdc));
  }
  if (debug) params.set('debug', 'true');

  const url = `${endpoint}?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Capability search failed: ${response.status} ${body.slice(0, 400)}`,
    );
  }

  let data: RawCapabilityResponse;
  try {
    data = (await response.json()) as RawCapabilityResponse;
  } catch (err) {
    throw new Error(
      `Capability search returned a non-JSON body: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!data || data.ok !== true) {
    throw new Error(
      `Capability search error${data?.stage ? ` at stage ${data.stage}` : ''}: ${data?.error ?? 'unknown'}`,
    );
  }

  // The result arrays are *supposed* to be present on every ok response.
  // Default missing/non-array fields to [] rather than calling .map on
  // undefined — a shape drift in the backend must degrade gracefully, not
  // crash the search. formatResource itself is crash-proof per-row.
  const strong = Array.isArray(data.strongResults) ? data.strongResults : [];
  const related = Array.isArray(data.relatedResults) ? data.relatedResults : [];
  const rerankInfo = data.rerank ?? { enabled: false, applied: false };
  const intentInfo = data.intent ?? { capabilityText: '' };
  const returnedMaxPriceUsdc = returnedUsdcPriceConstraint(
    'maxPriceUsdc',
    intentInfo.maxPriceUsdc,
  );
  const returnedMinPriceUsdc = returnedUsdcPriceConstraint(
    'minPriceUsdc',
    intentInfo.minPriceUsdc,
  );
  const confirmedMaxPriceUsdc = returnedUsdcPriceConstraint(
    'maxPriceUsdc',
    data.appliedConstraints?.maxPriceUsdc,
  );
  const confirmedMinPriceUsdc = returnedUsdcPriceConstraint(
    'minPriceUsdc',
    data.appliedConstraints?.minPriceUsdc,
  );
  const appliedMaxPriceUsdc = confirmedMaxPriceUsdc !== undefined
    ? confirmedMaxPriceUsdc
    : returnedMaxPriceUsdc ?? null;
  const appliedMinPriceUsdc = confirmedMinPriceUsdc !== undefined
    ? confirmedMinPriceUsdc
    : returnedMinPriceUsdc ?? null;
  if (
    typeof appliedMaxPriceUsdc === 'number'
    && typeof appliedMinPriceUsdc === 'number'
    && appliedMinPriceUsdc > appliedMaxPriceUsdc
  ) {
    throw new Error(
      'Capability search returned inconsistent applied price constraints',
    );
  }
  if (
    maxPriceUsdc !== undefined
    && (
      !data.appliedConstraints
      || typeof confirmedMaxPriceUsdc !== 'number'
      || confirmedMaxPriceUsdc > maxPriceUsdc
    )
  ) {
    throw new Error(
      'Capability search did not confirm the requested maxPriceUsdc constraint',
    );
  }
  if (
    minPriceUsdc !== undefined
    && (
      !data.appliedConstraints
      || typeof confirmedMinPriceUsdc !== 'number'
      || confirmedMinPriceUsdc < minPriceUsdc
    )
  ) {
    throw new Error(
      'Capability search did not confirm the requested minPriceUsdc constraint',
    );
  }
  const ranking = normalizeRankingState(
    data.rankingMode,
    data.degradedMessage,
  );

  return {
    query: data.query ?? query,
    ...(ranking.rankingMode ? { rankingMode: ranking.rankingMode } : {}),
    ...(ranking.degradedMessage
      ? { degradedMessage: ranking.degradedMessage }
      : {}),
    strongResults: strong.map(formatResource),
    relatedResults: related.map(formatResource),
    strongCount: typeof data.strongCount === 'number' ? data.strongCount : strong.length,
    relatedCount: typeof data.relatedCount === 'number' ? data.relatedCount : related.length,
    topSimilarity: data.topSimilarity ?? null,
    noMatchReason: data.noMatchReason ?? null,
    rerank: {
      enabled: rerankInfo.enabled,
      applied: rerankInfo.applied,
      reason: rerankInfo.reason,
    },
    intent: {
      capabilityText: intentInfo.capabilityText,
      expandedCapabilityText: intentInfo.expandedCapabilityText,
      ...(returnedMaxPriceUsdc !== undefined
        ? { maxPriceUsdc: returnedMaxPriceUsdc }
        : {}),
      ...(returnedMinPriceUsdc !== undefined
        ? { minPriceUsdc: returnedMinPriceUsdc }
        : {}),
    },
    appliedConstraints: {
      maxPriceUsdc: appliedMaxPriceUsdc,
      minPriceUsdc: appliedMinPriceUsdc,
    },
    // Forward honesty diagnostics verbatim. Older dexter-api builds may not
    // ship these; conditional spread keeps the property absent rather than
    // emitting `undefined` (which would lie about the field being known).
    ...(data.confidence ? { confidence: data.confidence } : {}),
    ...(data.triangulate ? { triangulate: data.triangulate } : {}),
    durationMs: data.durationMs,
  };
}
