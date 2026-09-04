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

import type {
  FormattedResource,
  IndexterEndpointAccess,
  IndexterEvidence,
  IndexterMerchantIdentity,
  PricingMode,
  RawCapabilityResult,
  RawPricingChain,
  ResourceExecution,
  TrustBasis,
} from './types.js';

const INDEXTER_EVIDENCE_LABELS = {
  delivered_recently: 'Delivered recently',
  terms_checked: 'Terms checked',
  no_current_confirmation: 'No current confirmation',
} as const;

/**
 * Format a price in USDC to a human-readable label.
 *
 * Thresholds:
 *   null         → "price on request"
 *   0            → "free"
 *   < $0.01      → up to 6 decimal places ("$0.00001")
 *   >= $0.01     → 2 decimal places  ("$0.05")
 */
export function formatPrice(priceUsdc: number | null): string {
  if (priceUsdc == null) return 'price on request';
  if (priceUsdc === 0) return 'free';
  if (priceUsdc < 0.000001) return '<$0.000001';
  if (priceUsdc < 0.01) {
    return `$${priceUsdc.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
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
    network: pricing.network ?? null,
    networkLabel: pricing.networkLabel ?? null,
    asset: pricing.asset,
    scheme: null,
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

const EMPTY_EXECUTION: ResourceExecution = {
  sideEffectful: false,
  effect: null,
  automatedVerification: 'manual_only',
  userExecution: 'unsupported',
  confirmationRequired: false,
  availability: 'unsupported',
  requiresExplicitInput: false,
  quoteMayCreateProviderReservation: false,
};

function normalizePricingMode(value: unknown): PricingMode {
  return value === 'fixed' || value === 'dynamic' || value === 'quote'
    ? value
    : 'unknown';
}

function fallbackTrustBasis(
  verification: RawCapabilityResult['verification'],
): TrustBasis {
  if (verification.paidQualityTestPassed ?? verification.paid) return 'paid_test';
  if (verification.status === 'pass') return 'quality_test';
  return 'none';
}

function fallbackTrustLabel(basis: TrustBasis): string {
  switch (basis) {
    case 'paid_test':
      return 'Paid quality test passed';
    case 'quality_test':
      return 'Quality test passed';
    case 'recent_paid_delivery':
      return 'Recent paid delivery succeeded';
    case 'trusted_catalog':
      return 'Trusted catalog listing; live payment offer confirmed';
    case 'none':
      return 'No independent paid quality test';
  }
}

function currentEvidence(
  verification: RawCapabilityResult['verification'],
): IndexterEvidence | undefined {
  const state = verification.evidenceState;
  if (!state || !(state in INDEXTER_EVIDENCE_LABELS)) return undefined;
  const label = verification.evidenceLabel;
  if (label !== INDEXTER_EVIDENCE_LABELS[state]) return undefined;
  const observedAt = verification.evidenceAt;
  if (observedAt !== null && typeof observedAt !== 'string') return undefined;
  return { state, label, observedAt };
}

function currentEndpointAccess(
  result: RawCapabilityResult,
  resourceUrl: string | null,
): IndexterEndpointAccess | undefined {
  const access = result.access;
  if (
    !access
    || !['direct_url', 'managed_resolvable'].includes(access.kind)
    || typeof access.checkable !== 'boolean'
    || access.requiresFreshCheck !== true
  ) {
    return undefined;
  }
  if (access.kind === 'direct_url' && resourceUrl === null) return undefined;
  if (access.kind === 'managed_resolvable' && resourceUrl !== null) return undefined;
  return { ...access };
}

function cleanIdentityText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function directHost(resourceUrl: string | null): string | null {
  if (!resourceUrl) return null;
  try {
    return new URL(resourceUrl).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function currentMerchantIdentity(
  result: RawCapabilityResult,
  resourceUrl: string | null,
): IndexterMerchantIdentity {
  const supplied = result.merchant;
  // A managed resource intentionally has no public route. Never revive an
  // internal transport host from legacy or malformed rows when its URL is null.
  const technicalHost = resourceUrl === null
    ? null
    : cleanIdentityText(supplied?.technicalHost)
      ?? cleanIdentityText(result.host)?.toLowerCase()
      ?? directHost(resourceUrl);
  const providerKey = cleanIdentityText(supplied?.providerKey)
    ?? technicalHost
    ?? `resource:${result.resourceId}`;
  return {
    providerKey,
    providerSlug: cleanIdentityText(supplied?.providerSlug) ?? providerKey,
    displayName: cleanIdentityText(supplied?.displayName),
    logoUrl: cleanIdentityText(supplied?.logoUrl),
    technicalHost,
  };
}

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
  const chains = buildChains(pricing);
  const trustBasis = verification.trustBasis ?? fallbackTrustBasis(verification);
  const paidQualityTestPassed =
    verification.paidQualityTestPassed ?? verification.paid === true;
  const safetyFlags = Array.isArray(r.safetyFlags)
    ? r.safetyFlags
    : r.gaming?.flags ?? [];
  const primaryPriceLabel = chains[0]?.priceLabel?.trim();
  const resourceUrl = typeof r.resourceUrl === 'string' ? r.resourceUrl : null;
  const access = currentEndpointAccess(r, resourceUrl);
  const evidence = currentEvidence(verification);
  const merchant = currentMerchantIdentity(r, resourceUrl);

  return {
    // Identity
    ...(r.kind === 'endpoint' ? { kind: 'endpoint' as const } : {}),
    resourceId: r.resourceId,
    name: r.displayName ?? resourceUrl ?? r.resourceId,
    resourceUrl,
    url: resourceUrl,
    ...(access ? { access } : {}),
    ...(evidence ? { evidence } : {}),
    merchant,
    method: r.method || 'GET',

    // Pricing
    price: primaryPriceLabel || formatPrice(priceUsdc),
    priceUsdc,
    priceAsset: pricing.asset ?? null,
    network: pricing.network ?? null,
    networkLabel: pricing.networkLabel ?? chains[0]?.networkLabel ?? null,
    pricingMode: normalizePricingMode(pricing.mode),
    quoteRequired: pricing.quoteRequired === true,
    chains,
    execution: r.execution ?? EMPTY_EXECUTION,

    // Content
    description: r.description ?? '',
    category: r.category ?? 'uncategorized',

    // Verification
    qualityScore: verification.qualityScore,
    verified: verification.status === 'pass',
    verificationStatus: verification.status,
    paidQualityTestPassed,
    trustBasis,
    trustLabel: verification.trustLabel?.trim() || fallbackTrustLabel(trustBasis),
    lastVerifiedAt: verification.lastVerifiedAt ?? null,

    // Usage
    totalCalls: usage.totalSettlements,
    totalVolumeUsdc: usage.totalVolumeUsdc,
    totalVolume: formatVolume(usage.totalVolumeUsdc),
    lastActive: usage.lastSettlementAt ?? null,

    // Identity / visual
    iconUrl: r.icon ?? null,
    host: resourceUrl === null
      ? null
      : cleanIdentityText(r.host)?.toLowerCase() ?? directHost(resourceUrl),

    // Gaming — `gaming` may be absent on a raw row (e.g. a result that
    // predates gaming analysis); guard it like every other optional field
    // in this mapper rather than throwing on `.flags` of undefined.
    gamingFlags: safetyFlags,
    gamingSuspicious: r.gaming?.suspicious ?? safetyFlags.length > 0,
    safetyFlags,

    // Ranking
    tier: r.tier,
    similarity: roundSimilarity(r.similarity),
    why: r.why,
    score: typeof r.score === 'number' ? r.score : 0,

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
    pathParams: r.pathParams ?? null,
    schemaSource: r.schemaSource ?? 'none',

    // Structured behavioral profile. Pass through verbatim — already shaped
    // for clients by the dexter-api response builder. NULL when the resource
    // has no OpenAPI to derive from; a null serviceProfile on a strong-banded
    // result is a load-bearing honesty signal, not a missing field.
    serviceProfile: r.serviceProfile ?? null,
  };
}
