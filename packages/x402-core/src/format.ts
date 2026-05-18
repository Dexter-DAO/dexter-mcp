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

/**
 * The ONE canonical resource formatter.
 *
 * Takes a raw capability result from the dexter-api response and returns
 * the FormattedResource that every consumer surface uses. This is the
 * single source of truth — no more 4 divergent copies.
 */
export function formatResource(r: RawCapabilityResult): FormattedResource {
  const priceUsdc = r.pricing.usdc;

  return {
    // Identity
    resourceId: r.resourceId,
    name: r.displayName ?? r.resourceUrl,
    url: r.resourceUrl,
    method: r.method || 'GET',

    // Pricing
    price: formatPrice(priceUsdc),
    priceUsdc,
    priceAsset: r.pricing.asset ?? null,
    network: r.pricing.network ?? null,
    chains: buildChains(r.pricing),

    // Content
    description: r.description ?? '',
    category: r.category ?? 'uncategorized',

    // Verification
    qualityScore: r.verification.qualityScore,
    verified: r.verification.status === 'pass',
    verificationStatus: r.verification.status,
    lastVerifiedAt: r.verification.lastVerifiedAt ?? null,

    // Usage
    totalCalls: r.usage.totalSettlements,
    totalVolumeUsdc: r.usage.totalVolumeUsdc,
    totalVolume: formatVolume(r.usage.totalVolumeUsdc),
    lastActive: r.usage.lastSettlementAt ?? null,

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
  };
}
