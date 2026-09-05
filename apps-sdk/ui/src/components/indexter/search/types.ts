export type SearchSeller = {
  payTo?: string | null;
  displayName: string | null;
  logoUrl?: string | null;
  twitterHandle?: string | null;
};

export type SearchMerchant = {
  providerKey?: string | null;
  providerSlug?: string | null;
  displayName?: string | null;
  logoUrl?: string | null;
  technicalHost?: string | null;
};

export type SearchChainOption = {
  network: string | null;
  networkLabel?: string | null;
  asset?: string | null;
  scheme?: string | null;
  priceAtomic?: string | null;
  priceUsdc?: number | null;
  priceLabel?: string | null;
};

export type SearchTier = 'strong' | 'related';

/** Exact method set accepted by the live x402_check tool schema. */
export const SEARCH_CHECK_SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

export type SearchPricingMode = 'fixed' | 'dynamic' | 'quote' | 'unknown';

export type SearchTrustBasis =
  | 'paid_test'
  | 'quality_test'
  | 'recent_paid_delivery'
  | 'trusted_catalog'
  | 'none';

export type SearchResourceExecution = {
  sideEffectful: boolean;
  effect: string | null;
  automatedVerification: 'enabled' | 'manual_only';
  userExecution: 'allowed' | 'unsupported';
  confirmationRequired: boolean;
  availability: 'available' | 'catalog_only' | 'unsupported';
  requiresExplicitInput: boolean;
  quoteMayCreateProviderReservation: boolean;
};

export type SearchRequestInputField = {
  name: string;
  location: 'body' | 'path' | 'query';
  type: 'boolean' | 'integer' | 'number' | 'string';
  required: boolean;
};

export type SearchRequestInput = {
  version: 1;
  fields: SearchRequestInputField[];
};

export type SearchResource = {
  kind: 'endpoint';
  resourceId: string;
  name: string;
  url: string | null;
  access: {
    kind: 'direct_url' | 'managed_resolvable';
    checkable: true;
    requiresFreshCheck: true;
  };
  method: string;
  price: string;
  priceAtomic?: string | null;
  priceUsdc?: number | null;
  priceAsset?: string | null;
  network: string | null;
  networkLabel?: string | null;
  pricingMode?: SearchPricingMode;
  quoteRequired?: boolean;
  chains?: SearchChainOption[];
  execution?: SearchResourceExecution;
  requestInput: SearchRequestInput | null;
  action?: {
    kind: 'endpoint_unavailable';
    label: 'Unavailable';
    state: 'unavailable';
    reason: 'input_contract_unavailable';
    resourceId: string;
    resourceUrl: string | null;
  };
  description: string;
  category: string;
  qualityScore: number | null;
  verified: boolean;
  verificationStatus?: string | null;
  paidQualityTestPassed?: boolean;
  trustBasis?: SearchTrustBasis;
  trustLabel?: string;
  verificationNotes?: string | null;
  verificationFixInstructions?: string | null;
  lastVerifiedAt?: string | null;
  totalCalls: number;
  totalVolume?: string | null;
  totalVolumeUsdc?: number | null;
  iconUrl?: string | null;
  merchant?: SearchMerchant | null;
  seller: string | null;
  sellerMeta: SearchSeller;
  sellerReputation?: number | null;
  authRequired?: boolean;
  authType?: string | null;
  authHint?: string | null;
  sessionCompatible?: boolean;
  // Capability-search signals (added in the 2026-04-16 widget rebuild)
  tier?: SearchTier;
  similarity?: number;
  why?: string;
  score?: number;
  gamingFlags?: string[];
  gamingSuspicious?: boolean;
  safetyFlags?: string[];
  outputSchema?: unknown | null;
  schemaSource?: 'bazaar' | 'openapi' | 'profile' | 'none';
};

export type SearchRerankInfo = {
  enabled: boolean;
  applied: boolean;
  reason?: string | null;
};

export type SearchIntent = {
  capabilityText?: string;
};

export type SearchMeta = {
  mode?: string;
  note?: string;
  rankingMode?: string;
  degradedMessage?: string;
};

export type SearchNoMatchReason =
  | 'below_similarity_threshold'
  | 'below_strong_threshold'
  | 'no_results_with_price_controls'
  | null;

export type SearchWidgetState = {
  selectedOrdinal?: number;
  selectedResourceId?: string;
  detailOpen?: boolean;
  comparisonOpen?: boolean;
  searchQuery?: string;
};
