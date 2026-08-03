export type SearchSeller = {
  payTo?: string | null;
  displayName: string | null;
  logoUrl?: string | null;
  twitterHandle?: string | null;
};

export type SearchChainOption = {
  network: string | null;
  asset?: string | null;
  priceAtomic?: string | null;
  priceUsdc?: number | null;
  priceLabel?: string | null;
};

export type SearchTier = 'strong' | 'related';

export type SearchResource = {
  resourceId: string;
  name: string;
  url: string;
  method: string;
  price: string;
  priceAtomic?: string | null;
  priceUsdc?: number | null;
  priceAsset?: string | null;
  network: string | null;
  chains?: SearchChainOption[];
  description: string;
  category: string;
  qualityScore: number | null;
  verified: boolean;
  verificationStatus?: 'pass' | 'fail' | 'inconclusive' | 'skipped' | null;
  verificationNotes?: string | null;
  verificationFixInstructions?: string | null;
  lastVerifiedAt?: string | null;
  totalCalls: number;
  totalVolume?: string | null;
  totalVolumeUsdc?: number | null;
  iconUrl?: string | null;
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
  | null;

export type SearchWidgetState = {
  selectedUrl?: string;
  detailOpen?: boolean;
  searchQuery?: string;
};
