/**
 * @dexterai/x402-core — Resource formatting
 *
 * ONE canonical formatResource() that replaces the 4 divergent copies in:
 *   - open-mcp-server.mjs
 *   - toolsets/x402-client/index.mjs
 *   - packages/mcp/src/tools/search.ts
 *   - dexter-x402-sdk/src/client/discovery.ts
 *
 * Add a new field HERE and it propagates to every consumer on the next build.
 */

import type { RawCapabilityResult, RawPricingChain, FormattedResource } from './types.js';

/**
 * Format a price in USDC to a human-readable label.
 *
 * Thresholds:
 *   null         → "price on request"
 *   0            → "free"
 *   < $0.01      → 4 decimal places  ("$0.0011")
 *   >= $0.01     → 2 decimal places  ("$0.05")
 */
export function formatPrice(priceUsdc: number | null): string {
  if (priceUsdc == null) return 'price on request';
  if (priceUsdc === 0) return 'free';
  if (priceUsdc < 0.01) return `$${priceUsdc.toFixed(4)}`;
  return `$${priceUsdc.toFixed(2)}`;
}

/**
 * Round a similarity score to 3 decimal places.
 */
export function roundSimilarity(similarity: number): number {
  return Math.round(similarity * 1000) / 1000;
}

/**
 * Format total volume as a dollar string with locale separators.
 * Returns null if the input is null/undefined/0.
 */
export function formatVolume(volumeUsdc: number | null | undefined): string | null {
  if (volumeUsdc == null || volumeUsdc === 0) return null;
  return `$${Number(volumeUsdc).toLocaleString()}`;
}

/**
 * Build the canonical chains array from a raw pricing object.
 * If the API already returned a chains array, pass it through.
 * Otherwise, synthesize a single-element array from the flat fields.
 *
 * `pricing` is guarded by the caller (formatResource) — a row missing the
 * whole `pricing` object resolves to an empty stand-in, never undefined.
 */
function buildChains(pricing: RawCapabilityResult['pricing']): RawPricingChain[] {
  if (Array.isArray(pricing.chains) && pricing.chains.length > 0) {
    return pricing.chains;
  }
  return [{
    network: pricing.network ?? '',
    asset: pricing.asset,
    priceAtomic: null,
    priceUsdc: pricing.usdc,
    priceLabel: formatPrice(pricing.usdc),
  }];
}

// Empty stand-ins for the three sub-objects a raw row is *supposed* to always
// carry (pricing / verification / usage). The backend should never omit them,
// but a single malformed row must degrade to a low-quality result — never
// crash the whole search. formatResource() falls back to these.
const EMPTY_PRICING: RawCapabilityResult['pricing'] = {
  usdc: null,
  network: null,
  asset: null,
};
const EMPTY_VERIFICATION: RawCapabilityResult['verification'] = {
  status: 'unknown',
  paid: false,
  qualityScore: null,
  lastVerifiedAt: null,
};
const EMPTY_USAGE: RawCapabilityResult['usage'] = {
  totalSettlements: 0,
  totalVolumeUsdc: 0,
  lastSettlementAt: null,
};

/**
 * The ONE canonical resource formatter.
 *
 * Takes a raw capability result from the dexter-api response and returns
 * the FormattedResource that every consumer surface uses. This is the
 * single source of truth — no more 4 divergent copies.
 */
export function formatResource(r: RawCapabilityResult): FormattedResource {
  // Every sub-object is guarded. The backend is *supposed* to send pricing,
  // verification, and usage on every row — but a single malformed row must
  // not crash the entire search (one bad result used to throw
  // "Cannot read properties of undefined" and take down the whole response).
  // A missing sub-object degrades that one row; it never throws.
  const pricing = r.pricing ?? EMPTY_PRICING;
  const verification = r.verification ?? EMPTY_VERIFICATION;
  const usage = r.usage ?? EMPTY_USAGE;
  const priceUsdc = pricing.usdc;

  return {
    // Identity
    resourceId: r.resourceId,
    name: r.displayName ?? r.resourceUrl,
    url: r.resourceUrl,
    method: r.method || 'GET',

    // Pricing
    price: formatPrice(priceUsdc),
    priceUsdc,
    priceAsset: pricing.asset ?? null,
    network: pricing.network ?? null,
    chains: buildChains(pricing),

    // Content
    description: r.description ?? '',
    category: r.category ?? 'uncategorized',

    // Verification
    qualityScore: verification.qualityScore,
    verified: verification.status === 'pass',
    verificationStatus: verification.status,
    lastVerifiedAt: verification.lastVerifiedAt ?? null,

    // Usage
    totalCalls: usage.totalSettlements,
    totalVolumeUsdc: usage.totalVolumeUsdc,
    totalVolume: formatVolume(usage.totalVolumeUsdc),
    lastActive: usage.lastSettlementAt ?? null,

    // Identity / visual
    iconUrl: r.icon ?? null,
    host: r.host ?? null,

    // Gaming — `gaming` may be absent on a raw row (e.g. a result that
    // predates gaming analysis); guard it like every other optional field
    // in this mapper rather than throwing on `.flags` of undefined.
    gamingFlags: r.gaming?.flags ?? [],
    gamingSuspicious: r.gaming?.suspicious ?? false,

    // Ranking
    tier: r.tier,
    similarity: roundSimilarity(r.similarity),
    why: r.why,
    score: r.score,

    // Enrichment
    ogImageUrl: r.ogImage ?? null,
    docsUrl: r.docsUrl ?? null,
    openapiSpecUrl: r.openapiSpecUrl ?? null,
    latencyP50Ms: r.latency?.p50Ms ?? null,
    latencyP95Ms: r.latency?.p95Ms ?? null,
    uptimePct: r.uptime?.pct ?? null,

    // Schemas (corpus-cached; null when the resource doesn't publish them)
    inputSchema: r.inputSchema ?? null,
    outputSchema: r.outputSchema ?? null,

    // Structured behavioral profile. Pass through verbatim — already shaped
    // for clients by the dexter-api response builder. NULL when the resource
    // has no OpenAPI to derive from; a null serviceProfile on a strong-banded
    // result is a load-bearing honesty signal, not a missing field.
    serviceProfile: r.serviceProfile ?? null,
  };
}
