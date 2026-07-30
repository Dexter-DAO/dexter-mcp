import type { SearchResource } from './types';

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

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return shortenUrl(url);
  }
}

export function resourceIconUrl(resource: SearchResource): string {
  if (resource.iconUrl) return resource.iconUrl;
  try {
    const hostname = new URL(resource.url).hostname;
    return `https://dexter.cash/api/favicon?domain=${encodeURIComponent(hostname)}`;
  } catch {
    return resource.sellerMeta.logoUrl || '';
  }
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

  return priceUsdc.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: priceUsdc < 0.01 ? 2 : 0,
    maximumFractionDigits: priceUsdc < 0.01 ? 6 : 4,
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
 * has no request body. Non-GET search results still need the exact raw body
 * before their price can be treated as approval-ready.
 */
export function isSearchCheckRequestBound(
  method: string | null | undefined,
): boolean {
  return String(method || 'GET').toUpperCase() === 'GET';
}
