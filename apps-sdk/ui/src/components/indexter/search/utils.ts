import type { SearchResource } from './types.ts';
import { providerImageSources } from '../../x402/providerImage.ts';

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const compactPath = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    return compactPath.length > 72 ? `${compactPath.slice(0, 69)}...` : compactPath;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

export function hostLabel(url: string | null | undefined): string {
  if (typeof url !== 'string' || url.trim().length === 0) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return shortenUrl(url);
  }
}

export function merchantLabel(resource: SearchResource): string {
  const transportHost = resource.access.kind === 'direct_url'
    ? hostLabel(resource.url)
    : resource.merchant?.technicalHost?.trim();
  return resource.merchant?.displayName?.trim()
    || resource.sellerMeta?.displayName?.trim()
    || resource.seller?.trim()
    || transportHost
    || 'Merchant not listed';
}

export function resourceImageSources(resource: SearchResource): string[] {
  const canonicalMerchantSources = providerImageSources({
    iconUrl: resource.merchant?.logoUrl,
  });
  const legacySources = providerImageSources({
    iconUrl: resource.iconUrl,
    logoUrl: resource.sellerMeta?.logoUrl,
    resourceUrl: resource.url,
  });
  return [...new Set([...canonicalMerchantSources, ...legacySources])];
}

export function compactEvidenceLabel(resource: SearchResource): string | null {
  if (resource.trustBasis === 'trusted_catalog') return 'Trusted catalog';
  const explicitLabel = resource.trustLabel?.trim();
  // Shorten only canonical labels whose meaning is unchanged. A catalog
  // listing alone must never be promoted into a live check.
  if (explicitLabel === 'Recent paid delivery succeeded') return 'Delivered recently';
  if (explicitLabel === 'Paid quality test passed') return 'Paid test';
  if (explicitLabel === 'Quality test passed') return 'Quality test';
  if (explicitLabel === 'Current terms observed') return 'Terms checked';

  switch (resource.trustBasis) {
    case 'recent_paid_delivery':
      return 'Delivered recently';
    case 'paid_test':
      return 'Paid test';
    case 'quality_test':
      return 'Quality test';
    case 'none':
      return null;
    default:
      if (resource.paidQualityTestPassed) return 'Paid test';
      if (resource.verified) return 'Quality test';
      return null;
  }
}

export function resourceIconUrl(resource: SearchResource): string {
  return resourceImageSources(resource)[0] || '';
}

export function formatListedPrice(
  priceLabel: string | null | undefined,
  priceUsdc: number | null | undefined,
  fallback = 'Price on check',
): string {
  const label = priceLabel?.trim();
  if (label) return label;
  if (typeof priceUsdc !== 'number' || !Number.isFinite(priceUsdc)) return fallback;
  if (priceUsdc === 0) return 'Free';
  if (priceUsdc > 0 && priceUsdc < 0.000001) return '<$0.000001';
  if (priceUsdc > 0 && priceUsdc < 0.01) {
    return `$${priceUsdc.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
  }

  return priceUsdc.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatAssetLabel(
  asset: string | null | undefined,
  assetName?: string | null,
): string {
  const identifier = asset?.trim() ?? '';
  const name = assetName?.trim() ?? '';

  if (name && identifier && name.toLowerCase() !== identifier.toLowerCase()) {
    return `${name} · ${identifier}`;
  }
  return name || identifier || 'Asset not listed';
}

/**
 * A GET check binds the complete catalog URL, including its query string, and
 * has no request body. Other supported results still need the exact raw body
 * before their price can be treated as approval-ready.
 */
export function isSearchCheckRequestBound(
  method: string | null | undefined,
): boolean {
  return String(method || 'GET').toUpperCase() === 'GET';
}
