import type {
  SearchIntent,
  SearchMeta,
  SearchNoMatchReason,
  SearchRerankInfo,
  SearchResource,
} from './types';

export const SEARCH_WIDGET_BUILD = '2026-08-04.2';

export type SearchPayload = {
  success?: boolean;
  count: number;
  resources?: SearchResource[];
  strongResults?: SearchResource[];
  relatedResults?: SearchResource[];
  strongCount?: number;
  relatedCount?: number;
  topSimilarity?: number | null;
  noMatchReason?: SearchNoMatchReason;
  rerank?: SearchRerankInfo;
  intent?: SearchIntent;
  searchMeta?: SearchMeta;
  rankingMode?: string;
  degradedMessage?: string | null;
  triangulate?: {
    alternateResourceIds?: string[];
  };
  tip?: string;
  error?: string;
  errorDetail?: string;
};

export function getSearchGuidance(payload: SearchPayload): string | null {
  if (payload.rankingMode === 'degraded' || payload.searchMeta?.rankingMode === 'degraded') {
    return payload.degradedMessage?.trim()
      || payload.searchMeta?.degradedMessage?.trim()
      || 'Search quality is temporarily reduced. Treat these as fallback matches and verify the fit before continuing.';
  }
  if ((payload.triangulate?.alternateResourceIds?.length ?? 0) > 0) {
    return 'The leading match has limited structured evidence. Compare a profile-backed alternative before choosing.';
  }
  if (payload.searchMeta?.mode === 'related_only') {
    return 'These are the closest related services. Review the fit before continuing.';
  }
  return null;
}

export type SearchSections = {
  strongResults: SearchResource[];
  relatedResults: SearchResource[];
  resources: SearchResource[];
  hasTieredShape: boolean;
};

export type SearchErrorCopy = {
  title: string;
  description: string;
};

function normalizeSearchResource(
  resource: SearchResource,
  fallbackTier?: SearchResource['tier'],
): SearchResource {
  const sellerValue = resource.seller;
  const sellerMeta = resource.sellerMeta ?? {
    payTo: null,
    displayName: null,
    logoUrl: null,
    twitterHandle: null,
  };

  if (sellerValue && typeof sellerValue === 'object') {
    const sellerObj = sellerValue as Record<string, unknown>;
    return {
      ...resource,
      tier: resource.tier ?? fallbackTier,
      seller: typeof sellerObj.displayName === 'string' ? sellerObj.displayName : null,
      sellerMeta: {
        payTo: typeof sellerObj.payTo === 'string' ? sellerObj.payTo : sellerMeta.payTo ?? null,
        displayName: typeof sellerObj.displayName === 'string' ? sellerObj.displayName : sellerMeta.displayName ?? null,
        logoUrl: typeof sellerObj.logoUrl === 'string' ? sellerObj.logoUrl : sellerMeta.logoUrl ?? null,
        twitterHandle: typeof sellerObj.twitterHandle === 'string' ? sellerObj.twitterHandle : sellerMeta.twitterHandle ?? null,
      },
    };
  }

  return {
    ...resource,
    tier: resource.tier ?? fallbackTier,
    seller: typeof sellerValue === 'string' ? sellerValue : null,
    sellerMeta,
  };
}

export function normalizeSearchPayload(payload: SearchPayload | null): SearchPayload | null {
  if (!payload) return null;
  return {
    ...payload,
    resources: Array.isArray(payload.resources)
      ? payload.resources.map((resource) => normalizeSearchResource(resource))
      : [],
    strongResults: Array.isArray(payload.strongResults)
      ? payload.strongResults.map((resource) =>
          normalizeSearchResource(resource, 'strong'))
      : undefined,
    relatedResults: Array.isArray(payload.relatedResults)
      ? payload.relatedResults.map((resource) =>
          normalizeSearchResource(resource, 'related'))
      : undefined,
  };
}

export function getSearchSections(payload: SearchPayload): SearchSections {
  const strongResults = (payload.strongResults ?? []).map((resource) =>
    resource.tier ? resource : { ...resource, tier: 'strong' as const });
  const relatedResults = (payload.relatedResults ?? []).map((resource) =>
    resource.tier ? resource : { ...resource, tier: 'related' as const });
  const hasTieredShape =
    Array.isArray(payload.strongResults) || Array.isArray(payload.relatedResults);

  return {
    strongResults,
    relatedResults,
    hasTieredShape,
    resources: hasTieredShape
      ? [...strongResults, ...relatedResults]
      : (payload.resources ?? []),
  };
}

export function getSearchErrorCopy(payload: SearchPayload): SearchErrorCopy | null {
  const isBackendError =
    payload.searchMeta?.mode === 'error'
    || Boolean(payload.error)
    || Boolean(payload.errorDetail);

  if (!isBackendError) return null;

  const description =
    payload.searchMeta?.note?.trim()
    || payload.tip?.trim()
    || payload.error?.trim()
    || 'Dexter could not reach the marketplace. Retry the same search in a moment.';

  return {
    title: 'Marketplace search unavailable',
    description,
  };
}

export function findSelectedResource(
  resources: SearchResource[],
  selectedUrl: string | undefined,
): SearchResource | null {
  if (!selectedUrl) return null;
  return resources.find((resource) => resource.url === selectedUrl) ?? null;
}
