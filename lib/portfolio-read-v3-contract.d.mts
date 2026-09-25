import type { z } from 'zod';

export type PortfolioAssetClassV3 = 'cash' | 'yield' | 'token' | 'stock' | 'fund' | 'nft' | 'rwa';
export interface PortfolioRegistryMaterialV3 {
  namespace: 'dexter-governed-asset-registry-identity/v1';
  network: 'solana-mainnet';
  assetId: string;
  assetClass: PortfolioAssetClassV3;
  symbol: string;
  name: string;
  issuer: string | null;
  providerName?: string | null;
  legalIssuerName?: string | null;
  mint: string;
  tokenProgram: 'spl-token' | 'token-2022';
  decimals: number;
  registryIdentityDigest: string;
}
export interface PortfolioReleasedIdentityProvenanceV3 {
  variantId: string; variantDigest: string;
  profileId: string; profileDigest: string;
  releaseId: string; releaseDigest: string;
  productId: string; productDigest: string;
  issuerId: string; issuerDigest: string;
  onchainId: string; onchainDigest: string;
}
export type PortfolioHoldingIdentityV3 =
  | { state: 'native'; source: 'solana' }
  | { state: 'recognized'; source: 'static_registry'; registryState: 'not_observed'; material: PortfolioRegistryMaterialV3 }
  | { state: 'recognized'; source: 'released_catalog'; registryState: 'approved' | 'retired'; observedAt: string;
    material: PortfolioRegistryMaterialV3; provenance: PortfolioReleasedIdentityProvenanceV3 }
  | { state: 'unreviewed'; source: 'none' }
  | { state: 'unavailable'; source: 'none'; reason: 'source_unavailable' | 'read_inconsistent'
    | 'token_identity_mismatch' | 'release_missing' | 'lineage_invalid' | 'conflicting_material' | 'registry_digest_mismatch' };
export type PortfolioIdentityStatusV3 = 'native' | 'recognized' | 'retired' | 'unreviewed' | 'unavailable';
export interface RichPortfolioHoldingV3 {
  assetId: string | null;
  mint: string;
  tokenAccount: string | null;
  tokenProgram: 'native' | 'spl-token' | 'token-2022';
  assetClass: PortfolioAssetClassV3;
  symbol?: string;
  name?: string;
  amountRaw: string;
  decimals: number;
  displayAmount: string;
  amountModel: 'raw-decimals' | 'scaled-ui-amount' | 'unknown';
  displayMultiplier?: string | null;
  accountState: 'initialized' | 'frozen' | 'unknown';
  valueUsd: string | null;
  priceUsd: string | null;
  priceObservedAt: string | null;
  change24hPercent?: string | null;
  priceSource?: 'jupiter-price-v3' | 'jupiter-exact-in-quote' | 'unknown' | null;
  priceBlockId?: number | null;
  metadataObservedAt?: string | null;
  marketContext?: { source: 'jupiter-tokens-v2'; mint: string; observedAt: string;
    liquidityUsd: string | null; holderCount: number | null; activity24h: { traderCount: number | null } } | null;
  registryIdentity?: { source: 'dexter-registry'; providerName: string | null; legalIssuerName: string | null } | null;
  identity: PortfolioHoldingIdentityV3;
}
export interface CompactPortfolioHoldingV3 {
  assetId: string | null; mint: string; tokenAccount: string | null;
  symbol: string | null; name: string | null; displayAmount: string;
  amountModel: 'raw-decimals' | 'scaled-ui-amount' | 'unknown';
  valueUsd: string | null; change24hPercent: string | null; identityStatus: PortfolioIdentityStatusV3;
}
type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;
export const portfolioRegistryMaterialV3Schema: Schema<PortfolioRegistryMaterialV3>;
export const portfolioReleasedIdentityProvenanceV3Schema: Schema<PortfolioReleasedIdentityProvenanceV3>;
export const portfolioHoldingIdentityV3Schema: Schema<PortfolioHoldingIdentityV3>;
export const portfolioIdentityStatusV3Schema: Schema<PortfolioIdentityStatusV3>;
export const compactPortfolioHoldingV3Schema: Schema<CompactPortfolioHoldingV3>;
export const portfolioSourceV3Schema: Schema<unknown>;
export function isPortfolioPublicKey(value: unknown): value is string;
export function isPortfolioObservedAtV3(value: unknown): value is string;
export function canonicalPortfolioRegistryJson(value: unknown): string;
export function portfolioRegistryMaterialV3IsValid(value: unknown): value is PortfolioRegistryMaterialV3;
/** Semantic check only. Apply the strict holding shape separately before treating a value as a holding. */
export function portfolioHoldingV3IsValid(value: unknown): boolean;
export function portfolioIdentityStatusV3(value: PortfolioHoldingIdentityV3): PortfolioIdentityStatusV3;
export function compactPortfolioHoldingV3(value: RichPortfolioHoldingV3): CompactPortfolioHoldingV3;
export function createPortfolioReadV3Schemas(options: {
  holdingSchema: Schema<unknown>; targetSchema: Schema<unknown>; validateTargets: (value: unknown) => boolean;
}): Readonly<{
  portfolio: Schema<unknown>; card: Schema<unknown>; envelope: Schema<unknown>; response: Schema<unknown>;
  holding: Schema<RichPortfolioHoldingV3>; identity: typeof portfolioHoldingIdentityV3Schema;
  registryMaterial: typeof portfolioRegistryMaterialV3Schema; source: typeof portfolioSourceV3Schema;
}>;
