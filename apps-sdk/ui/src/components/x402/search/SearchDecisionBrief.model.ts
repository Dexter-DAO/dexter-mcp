import type { SearchResource } from './types';

export type SearchDecision = {
  recommended: SearchResource | null;
  recommendationKind: 'strong' | 'related' | null;
  selected: SearchResource | null;
  actionTarget: SearchResource | null;
  alternatives: SearchResource[];
  hiddenAlternativeCount: number;
  isRecommendationSelected: boolean;
};

export type SearchResourceSummary = {
  why: string;
  qualityScore: number | null;
  priceLabel: string | null;
  priceUsdc: number | null;
  priceFallback: string;
};

/**
 * Keeps recommendation rank and user selection separate.
 *
 * The first resource remains the recommendation. A valid user selection
 * controls the next action without rewriting that recommendation.
 */
export function buildSearchDecision(
  resources: SearchResource[],
  selectedUrl?: string | null,
  alternativeLimit = 3,
): SearchDecision {
  const recommended = resources[0] ?? null;

  if (!recommended) {
    return {
      recommended: null,
      recommendationKind: null,
      selected: null,
      actionTarget: null,
      alternatives: [],
      hiddenAlternativeCount: 0,
      isRecommendationSelected: false,
    };
  }

  const selected =
    resources.find((resource) => resource.url === selectedUrl) ?? null;
  const actionTarget = selected ?? recommended;
  const limit = Math.max(0, Math.floor(alternativeLimit));
  // The visible hero follows the user's choice while recommendation rank
  // remains stable in `recommended`. Keep the hero out of the alternative
  // rail so the interface never shows the same service twice.
  const alternativePool = resources.filter(
    (resource) => resource.url !== actionTarget.url,
  );
  const alternatives = alternativePool.slice(0, limit);

  return {
    recommended,
    recommendationKind: recommended.tier === 'related' ? 'related' : 'strong',
    selected,
    actionTarget,
    alternatives,
    hiddenAlternativeCount: Math.max(
      0,
      alternativePool.length - alternatives.length,
    ),
    isRecommendationSelected: selected?.url === recommended.url,
  };
}

export function summarizeSearchResource(
  resource: SearchResource,
): SearchResourceSummary {
  const primaryRoute = resource.chains?.[0];
  const qualityScore =
    typeof resource.qualityScore === 'number' &&
    Number.isFinite(resource.qualityScore)
      ? Math.min(100, Math.max(0, Math.round(resource.qualityScore)))
      : null;
  const listedAsFree = resource.price.trim().toLowerCase() === 'free';

  return {
    why:
      resource.why?.trim() ||
      resource.description.trim() ||
      'Matches the capability you asked for.',
    qualityScore,
    priceLabel:
      primaryRoute?.priceLabel?.trim() ||
      (listedAsFree ? 'Free' : resource.price.trim()) ||
      null,
    priceUsdc: primaryRoute?.priceUsdc ?? resource.priceUsdc ?? null,
    priceFallback: listedAsFree ? 'Free' : 'Price on check',
  };
}
