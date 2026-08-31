/**
 * @dexterai/x402-core — MCP search response builder
 *
 * Builds the standardized SearchResponse shape that MCP tool handlers return.
 * This replaces the duplicated response-building logic in each consumer's
 * x402_search tool handler.
 */

import type {
  CapabilitySearchResult,
  SearchResponse,
  SearchMeta,
} from './types.js';
import { normalizeRankingState } from './ranking.js';

const SOURCE = 'Dexter x402 Marketplace (https://dexter.cash)';

function buildSearchMeta(result: CapabilitySearchResult): SearchMeta {
  if (result.strongCount > 0) {
    return {
      mode: 'direct',
      note: `${result.strongCount} strong matches${result.rerank.applied ? ' (LLM-reranked)' : ''}`,
    };
  }
  if (result.relatedCount > 0) {
    return {
      mode: 'related_only',
      note: 'No exact matches — showing closest related services',
    };
  }
  return {
    mode: 'empty',
    note: 'No results in the index match this query',
  };
}

function hasPublishedInput(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.required) && record.required.length > 0) return true;
  if (
    record.properties
    && typeof record.properties === 'object'
    && Object.keys(record.properties as Record<string, unknown>).length > 0
  ) {
    return true;
  }
  return Object.keys(record).some(
    (key) => ![
      '$schema',
      'additionalProperties',
      'description',
      'properties',
      'required',
      'title',
      'type',
    ].includes(key),
  );
}

function buildTip(result: CapabilitySearchResult): string {
  const top = result.strongResults[0] ?? result.relatedResults[0] ?? null;
  const method = top?.method?.toUpperCase() ?? 'GET';
  if (top && !['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    return `The leading result uses ${method}, which OpenDexter cannot currently check or execute. Choose a result using GET, POST, PUT, or DELETE; do not present this listing as callable.`;
  }
  if (
    top?.execution.availability === 'unsupported'
    || top?.execution.userExecution === 'unsupported'
  ) {
    return 'The leading result is not executable through OpenDexter. Choose a supported result; do not present this listing as callable.';
  }
  if (top?.execution.availability === 'catalog_only') {
    return 'The leading result is a catalog listing but is not currently callable. Choose an available result or check again later; do not present the listing as executable.';
  }
  if (
    top
    && (
      top.execution.sideEffectful
      || top.execution.confirmationRequired
      || top.execution.quoteMayCreateProviderReservation
    )
  ) {
    return 'The leading result requires a pre-check review. Form and show the exact URL, method, path parameters, raw body, stated effect, and any provider-reservation warning. If the user already authorized that exact request and possible check effect, do not ask twice; otherwise obtain confirmation before x402_check. That confirmation does not approve payment.';
  }
  if (
    top
    && (
      top.execution.requiresExplicitInput
      || hasPublishedInput(top.inputSchema)
      || hasPublishedInput(top.pathParams)
      || method !== 'GET'
    )
  ) {
    return 'The leading result needs exact request details before a live price check. Gather the required fields from inputSchema and pathParams, then run x402_check with the exact method, URL, and raw body. Search output does not authorize payment.';
  }
  // Triangulation tip — load-bearing. When the top match has no structured
  // input semantics AND profile-backed alternates exist, we need the agent to
  // know NOT to blindly pay the top result on an ambiguous query. This is the
  // m01 wrong-token-pick scenario: the catalog ranks a confident-looking but
  // marketing-text-only candidate first, and the agent has nothing to flag
  // that confidence as thin unless we say so explicitly here.
  if (result.triangulate) {
    return (
      'Top match has no structured input semantics — the ranking is based on its description alone. ' +
      `Before choosing it, compare one of the profile-backed alternates (resourceId: ${result.triangulate.alternateResourceIds[0]}) ` +
      'and confirm the answer agrees. For any paid call, run x402_check on the chosen endpoint. Before spending, confirm the current instruction or delegated policy covers the exact checked request and a positive maxAmountAtomic ceiling; if it already does, do not ask twice. ' +
      'If the query is unambiguous (e.g. you passed an exact contract address, not a name), you can skip the comparison.'
    );
  }
  if (result.strongCount > 0) {
    return 'Choose a service, then run x402_check to confirm its current access and price. Before spending, confirm the current instruction or delegated policy covers the exact checked request and a positive maxAmountAtomic ceiling; if it already does, do not ask twice.';
  }
  if (result.relatedCount > 0) {
    return 'No exact match. Confirm which related service fits the request, then run x402_check. Search rank and listing text never authorize payment.';
  }
  return 'Nothing in the index matches this query yet. Try a broader phrasing.';
}

/**
 * Build the standardized MCP search response from a CapabilitySearchResult.
 *
 * This is the shape that gets returned from x402_search tool handlers across
 * all MCP surfaces (Open MCP, Auth MCP, OpenDexter npm).
 */
export function buildSearchResponse(result: CapabilitySearchResult): SearchResponse {
  // No `resources` concat field anymore — it was a duplicate of
  // strongResults+relatedResults that nearly doubled the response size,
  // pushing broad searches past MCP client max-result limits. Consumers
  // read strongResults/relatedResults directly (count remains as a
  // convenience for "how many total did I get").
  const strongCount = result.strongResults.length;
  const relatedCount = result.relatedResults.length;
  const totalCount = strongCount + relatedCount;
  const topResult = result.strongResults[0] ?? result.relatedResults[0] ?? null;
  const topSimilarity =
    topResult && Number.isFinite(topResult.similarity)
      ? topResult.similarity
      : totalCount > 0 && Number.isFinite(result.topSimilarity)
        ? result.topSimilarity
        : null;
  const noMatchReason = strongCount > 0
    ? null
    : relatedCount > 0
      ? 'below_strong_threshold'
      : result.noMatchReason;
  const normalizedResult: CapabilitySearchResult = {
    ...result,
    strongCount,
    relatedCount,
    topSimilarity,
    noMatchReason,
  };
  const ranking = normalizeRankingState(
    result.rankingMode,
    result.degradedMessage,
  );
  const constraintSource = result.appliedConstraints ?? result.intent;
  let maxPriceUsdc =
    typeof constraintSource.maxPriceUsdc === 'number'
    && Number.isFinite(constraintSource.maxPriceUsdc)
    && constraintSource.maxPriceUsdc >= 0
      ? constraintSource.maxPriceUsdc
      : null;
  let minPriceUsdc =
    typeof constraintSource.minPriceUsdc === 'number'
    && Number.isFinite(constraintSource.minPriceUsdc)
    && constraintSource.minPriceUsdc >= 0
      ? constraintSource.minPriceUsdc
      : null;
  if (
    maxPriceUsdc !== null
    && minPriceUsdc !== null
    && minPriceUsdc > maxPriceUsdc
  ) {
    maxPriceUsdc = null;
    minPriceUsdc = null;
  }

  return {
    success: true,
    ...(ranking.rankingMode ? { rankingMode: ranking.rankingMode } : {}),
    ...(ranking.degradedMessage
      ? { degradedMessage: ranking.degradedMessage }
      : {}),
    count: totalCount,
    strongResults: result.strongResults,
    relatedResults: result.relatedResults,
    strongCount,
    relatedCount,
    topSimilarity,
    noMatchReason,
    rerank: {
      enabled: result.rerank.enabled,
      applied: result.rerank.applied,
    },
    intent: {
      capabilityText: result.intent.capabilityText,
      expandedCapabilityText: result.intent.expandedCapabilityText,
      ...(result.intent.maxPriceUsdc !== undefined
        ? { maxPriceUsdc: result.intent.maxPriceUsdc }
        : {}),
      ...(result.intent.minPriceUsdc !== undefined
        ? { minPriceUsdc: result.intent.minPriceUsdc }
        : {}),
    },
    appliedConstraints: {
      maxPriceUsdc,
      minPriceUsdc,
    },
    searchMeta: {
      ...buildSearchMeta(normalizedResult),
      ...(ranking.rankingMode ? { rankingMode: ranking.rankingMode } : {}),
      ...(ranking.degradedMessage
        ? { degradedMessage: ranking.degradedMessage }
        : {}),
    },
    // Honesty diagnostics — forwarded verbatim. Confidence is always present
    // when the upstream supports it; triangulate is present only when
    // actionable (top match unprofiled AND profile-backed alternates exist).
    ...(result.confidence ? { confidence: result.confidence } : {}),
    ...(result.triangulate ? { triangulate: result.triangulate } : {}),
    tip: buildTip(normalizedResult),
    source: SOURCE,
  };
}

/**
 * Build the error response shape for a failed search.
 *
 * A failed search is NOT an empty result. Earlier this returned
 * `mode: 'empty'` with the raw error string crammed into `note` — which made
 * a backend outage indistinguishable from "the marketplace has nothing for
 * you", and leaked stack-trace text to the model/user. A failure now has its
 * own `mode: 'error'` and a calm human-facing `note`. Raw upstream detail is
 * deliberately excluded because this response is model- and user-visible;
 * callers may log a locally sanitized diagnostic before invoking this helper.
 */
export function buildSearchErrorResponse(_error: string): SearchResponse {
  return {
    success: false,
    count: 0,
    strongResults: [],
    relatedResults: [],
    strongCount: 0,
    relatedCount: 0,
    topSimilarity: null,
    noMatchReason: null,
    rerank: { enabled: false, applied: false },
    intent: { capabilityText: '' },
    appliedConstraints: {
      maxPriceUsdc: null,
      minPriceUsdc: null,
    },
    searchMeta: {
      mode: 'error',
      note: 'Marketplace search is temporarily unavailable. Please try again in a moment.',
    },
    tip: 'This is a temporary backend error, not an empty result — retry the same query shortly.',
    source: SOURCE,
  };
}
