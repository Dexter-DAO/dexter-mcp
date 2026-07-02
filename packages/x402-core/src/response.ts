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

function buildTip(result: CapabilitySearchResult): string {
  // Triangulation tip — load-bearing. When the top match has no structured
  // input semantics AND profile-backed alternates exist, we need the agent to
  // know NOT to blindly pay the top result on an ambiguous query. This is the
  // m01 wrong-token-pick scenario: the catalog ranks a confident-looking but
  // marketing-text-only candidate first, and the agent has nothing to flag
  // that confidence as thin unless we say so explicitly here.
  if (result.triangulate) {
    return (
      'Top match has no structured input semantics — the ranking is based on its description alone. ' +
      `Before paying, call one of the profile-backed alternates (resourceId: ${result.triangulate.alternateResourceIds[0]}) ` +
      "and confirm the answer agrees. If the query is unambiguous (e.g. you passed an exact contract address, not a name), you can skip this step."
    );
  }
  if (result.strongCount > 0) {
    return 'Use x402_fetch to call any of these endpoints. Strong matches are high-confidence; related matches are adjacent capabilities.';
  }
  if (result.relatedCount > 0) {
    return 'No exact match. These are the closest related services — confirm with the user before calling.';
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
  const totalCount = result.strongResults.length + result.relatedResults.length;

  return {
    success: true,
    count: totalCount,
    strongResults: result.strongResults,
    relatedResults: result.relatedResults,
    strongCount: result.strongCount,
    relatedCount: result.relatedCount,
    topSimilarity: result.topSimilarity,
    noMatchReason: result.noMatchReason,
    rerank: {
      enabled: result.rerank.enabled,
      applied: result.rerank.applied,
    },
    intent: {
      capabilityText: result.intent.capabilityText,
      expandedCapabilityText: result.intent.expandedCapabilityText,
    },
    searchMeta: buildSearchMeta(result),
    // Honesty diagnostics — forwarded verbatim. Confidence is always present
    // when the upstream supports it; triangulate is present only when
    // actionable (top match unprofiled AND profile-backed alternates exist).
    ...(result.confidence ? { confidence: result.confidence } : {}),
    ...(result.triangulate ? { triangulate: result.triangulate } : {}),
    tip: buildTip(result),
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
 * own `mode: 'error'`, a calm human-facing `note`, and the raw detail kept
 * separately in `errorDetail` for logs/debugging.
 */
export function buildSearchErrorResponse(error: string): SearchResponse {
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
    searchMeta: {
      mode: 'error',
      note: 'Marketplace search is temporarily unavailable. Please try again in a moment.',
    },
    errorDetail: error,
    tip: 'This is a temporary backend error, not an empty result — retry the same query shortly.',
    source: SOURCE,
  };
}
