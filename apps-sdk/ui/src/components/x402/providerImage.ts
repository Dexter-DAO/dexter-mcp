const IMAGE_PROXY_URL = 'https://api.dexter.cash/api/img';
const FAVICON_PROXY_URL = 'https://dexter.cash/api/favicon';

function externalHttpUrl(value: string | null | undefined): URL | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.hostname.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function proxyProviderImageUrl(
  value: string | null | undefined,
): string | null {
  const parsed = externalHttpUrl(value);
  if (!parsed) return null;

  if (
    parsed.protocol === 'https:'
    && parsed.origin === 'https://api.dexter.cash'
    && parsed.pathname === '/api/img'
  ) {
    return parsed.href;
  }

  return `${IMAGE_PROXY_URL}?url=${encodeURIComponent(parsed.href)}`;
}

export function providerFaviconUrl(
  resourceUrl: string | null | undefined,
): string | null {
  const parsed = externalHttpUrl(resourceUrl);
  if (!parsed) return null;
  return `${FAVICON_PROXY_URL}?domain=${encodeURIComponent(parsed.hostname)}`;
}

export function providerImageSources({
  iconUrl,
  logoUrl,
  resourceUrl,
}: {
  iconUrl?: string | null;
  logoUrl?: string | null;
  resourceUrl?: string | null;
}): string[] {
  const sources = [
    proxyProviderImageUrl(iconUrl),
    proxyProviderImageUrl(logoUrl),
    providerFaviconUrl(resourceUrl),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(sources)];
}
