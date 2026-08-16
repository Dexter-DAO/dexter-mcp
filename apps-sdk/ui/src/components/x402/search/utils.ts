import type { SearchResource } from './types';
import { providerImageSources } from '../providerImage';

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
  return providerImageSources({
    iconUrl: resource.iconUrl,
    logoUrl: resource.sellerMeta?.logoUrl,
    resourceUrl: resource.url,
  })[0] || '';
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
