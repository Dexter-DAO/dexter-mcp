/**
 * @dexterai/x402-core — Canonical types
 *
 * These types represent the shapes flowing through the Dexter x402 ecosystem:
 *
 *   dexter-api response → RawCapabilityResult / RawCapabilityResponse
 *         ↓ formatResource()
 *   FormattedResource (the canonical consumer-facing shape)
 *         ↓ buildSearchResponse()
 *   SearchResponse (the MCP tool output shape)
 *
 * Every consumer (Open MCP, Auth MCP, OpenDexter npm, SDK, widget) imports
 * from here. No more divergent copies.
 */

// ─── Raw API response types (what dexter-api returns) ────────────────────────

export interface RawPricing {
  usdc: number | null;
  network: string | null;
  asset: string | null;
  chains?: RawPricingChain[];
}

export interface RawPricingChain {
  network: string;
  asset: string | null;
  priceAtomic: string | null;
  priceUsdc: number | null;
  priceLabel?: string;
}

export interface RawVerification {
  status: string;
  paid: boolean;
  qualityScore: number | null;
  lastVerifiedAt: string | null;
  responseStatus?: number | null;
}

export interface RawUsage {
  totalSettlements: number;
  totalVolumeUsdc: number;
  lastSettlementAt: string | null;
}

export interface RawGaming {
  flags: string[];
  suspicious: boolean;
}

export interface RawEnrichment {
  ogImage: string | null;
  docsUrl: string | null;
  openapiSpecUrl: string | null;
  latency: { p50Ms: number | null; p95Ms: number | null } | null;
  uptime: { pct: number | null } | null;
}

export interface RawCapabilityResult {
  resourceId: string;
  resourceUrl: string;
  displayName: string | null;
  description: string | null;
  category: string | null;
  host: string | null;
  method: string;
  icon: string | null;
  pricing: RawPricing;
  verification: RawVerification;
  usage: RawUsage;
  /** Gaming-analysis signals. Optional — absent on rows that predate or
   *  skipped gaming analysis; consumers must guard access. */
  gaming?: RawGaming;
  score: number;
  similarity: number;
  why: string;
  tier: 'strong' | 'related';
  // Enrichment fields (present when enrichment pipeline has run)
  ogImage?: string | null;
  docsUrl?: string | null;
  openapiSpecUrl?: string | null;
  latency?: { p50Ms: number | null; p95Ms: number | null } | null;
  uptime?: { pct: number | null } | null;
  // Schemas extracted from the resource's accepts[] JSONB (when the verifier
  // has captured them). Null when the resource doesn't publish them. Corpus-
  // cached as of the last verification pass — call `x402_check` for live data.
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export interface RawCapabilityResponse {
  ok: boolean;
  query: string;
  intent: {
    capabilityText: string;
    expandedCapabilityText?: string;
    maxPriceUsdc?: number | null;
    minPriceUsdc?: number | null;
    minQualityScore?: number | null;
    networks?: string[] | null;
    categories?: string[] | null;
    requireVerified?: boolean;
  };
  strongResults: RawCapabilityResult[];
  relatedResults: RawCapabilityResult[];
  results?: RawCapabilityResult[];
  totalCandidates?: number;
  strongCount: number;
  relatedCount: number;
  topSimilarity: number | null;
  noMatchReason: NoMatchReason;
  thresholds?: { similarityFloor: number; strongMatch: number };
  rerank: {
    enabled: boolean;
    applied: boolean;
    reason?: string;
    reasoning?: string;
  };
  embeddingTokens?: number;
  durationMs: number;
  error?: string;
  stage?: string;
}

// ─── Formatted consumer-facing types ─────────────────────────────────────────

/**
 * The canonical consumer-facing resource shape.
 *
 * This is the SUPERSET — it includes every field any consumer currently uses.
 * Consumers that don't need certain fields simply ignore them. Adding a field
 * here and in formatResource() is the ONLY place a new field needs to land.
 */
export interface FormattedResource {
  resourceId: string;
  name: string;
  url: string;
  method: string;

  // Pricing
  price: string;
  priceUsdc: number | null;
  priceAsset: string | null;
  network: string | null;
  chains: RawPricingChain[];

  // Content
  description: string;
  category: string;

  // Verification
  qualityScore: number | null;
  verified: boolean;
  verificationStatus: string;
  lastVerifiedAt: string | null;

  // Usage
  totalCalls: number;
  totalVolumeUsdc: number;
  totalVolume: string | null;
  lastActive: string | null;

  // Identity
  iconUrl: string | null;
  host: string | null;

  // Gaming
  gamingFlags: string[];
  gamingSuspicious: boolean;

  // Ranking
  tier: 'strong' | 'related';
  similarity: number;
  why: string;
  score: number;

  // Enrichment
  ogImageUrl: string | null;
  docsUrl: string | null;
  openapiSpecUrl: string | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  uptimePct: number | null;

  // Schemas (corpus-cached; call x402_check for live data)
  inputSchema: unknown | null;
  outputSchema: unknown | null;
}

/**
 * Why a response has no strong matches.
 */
export type NoMatchReason =
  | 'below_similarity_threshold'
  | 'below_strong_threshold'
  | null;

/**
 * Options for semantic capability search.
 */
export interface CapabilitySearchOptions {
  query: string;
  limit?: number;
  unverified?: boolean;
  testnets?: boolean;
  rerank?: boolean;
  debug?: boolean;
  endpoint?: string;
}

/**
 * Full response from capability search — the shape consumers work with
 * after the raw API response has been mapped through formatResource().
 */
export interface CapabilitySearchResult {
  query: string;
  strongResults: FormattedResource[];
  relatedResults: FormattedResource[];
  strongCount: number;
  relatedCount: number;
  topSimilarity: number | null;
  noMatchReason: NoMatchReason;
  rerank: {
    enabled: boolean;
    applied: boolean;
    reason?: string;
  };
  intent: {
    capabilityText: string;
    expandedCapabilityText?: string;
  };
  durationMs: number;
}

// ─── MCP search response shape ───────────────────────────────────────────────

/**
 * Search outcome mode.
 *   direct       — strong matches found
 *   related_only — no strong matches, only adjacent ones
 *   empty        — the search ran fine, the index genuinely has nothing
 *   error        — the search FAILED (backend/network). Distinct from `empty`
 *                  so a failure is never mistaken for "no results".
 */
export type SearchMode = 'direct' | 'related_only' | 'empty' | 'error';

export interface SearchMeta {
  mode: SearchMode;
  note: string;
}

export interface SearchResponse {
  success: boolean;
  /** Total count: strongResults.length + relatedResults.length. The legacy
   *  `resources` field (a flat concatenation of the two) was removed when
   *  it was found to double the response size and push broad searches past
   *  MCP client max-result limits. Consumers read the two tiers directly. */
  count: number;
  strongResults: FormattedResource[];
  relatedResults: FormattedResource[];
  strongCount: number;
  relatedCount: number;
  topSimilarity: number | null;
  noMatchReason: NoMatchReason;
  rerank: { enabled: boolean; applied: boolean };
  intent: { capabilityText: string; expandedCapabilityText?: string };
  searchMeta: SearchMeta;
  /** Raw error detail — present only when success is false. Kept separate
   *  from searchMeta.note so the user-facing note stays clean while logs
   *  still get the underlying cause. */
  errorDetail?: string;
  tip: string;
  source: string;
}
