import { useMemo, useState } from 'react';
import type { CheckResourceIdentity, EnrichedResource } from './types';
import { providerImageSources } from '../x402/providerImage';

interface Props {
  identity: CheckResourceIdentity | null;
  resource: EnrichedResource | null;
  fallbackUrl: string | null;
  /** The raw `resource` field from the 402 body. Only a human description may
   *  be used as a title fallback; transport URLs never outrank checked input. */
  resourceRef?: unknown;
}

/**
 * The "what is this thing" header.
 *
 * Merchant comes first, followed by the specific resource. Public identity
 * supplied by the check result outranks legacy catalog enrichment.
 */
export function ResourceIdentity({ identity, resource, fallbackUrl, resourceRef }: Props) {
  const refUrl = fallbackUrl;
  const directHost = hostFromUrl(fallbackUrl);
  const resourceName =
    identity?.displayName?.trim() ||
    resource?.display_name?.trim() ||
    hostPath(refUrl) ||
    descriptionFrom(resourceRef) ||
    'Unknown service';
  const merchantName =
    identity?.merchant.displayName?.trim() ||
    resource?.upstream_service?.trim() ||
    resource?.og_site_name?.trim() ||
    directHost ||
    (!fallbackUrl ? prettyHost(identity?.merchant.technicalHost) : null);
  const showMerchant = merchantName
    && merchantName.toLocaleLowerCase() !== resourceName.toLocaleLowerCase();
  const sources = useMemo(() => providerImageSources({
    iconUrl: identity?.merchant.logoUrl || resource?.icon_url,
    resourceUrl: refUrl,
  }), [identity?.merchant.logoUrl, resource?.icon_url, refUrl]);
  const sourceKey = sources.join('\n');
  const [loadState, setLoadState] = useState({
    sourceKey: '',
    attempt: 0,
  });
  const attempt = loadState.sourceKey === sourceKey ? loadState.attempt : 0;
  const icon = sources[attempt] || null;

  return (
    <div className="dx-pricing__identity">
      {icon ? (
        <div className="dx-pricing__identity-icon">
          <img
            src={icon}
            alt=""
            width={32}
            height={32}
            className="dx-pricing__identity-icon-img"
            aria-hidden
            loading="lazy"
            onError={() => {
              setLoadState((current) => ({
                sourceKey,
                attempt:
                  current.sourceKey === sourceKey
                    ? current.attempt + 1
                    : 1,
              }));
            }}
          />
        </div>
      ) : null}
      <div className="dx-pricing__identity-text">
        {showMerchant ? (
          <p className="dx-pricing__identity-merchant">{merchantName}</p>
        ) : null}
        <h1 className="dx-pricing__identity-name">{resourceName}</h1>
      </div>
    </div>
  );
}

/** Pull a human description out of the 402 `resource` field, if present. */
function descriptionFrom(ref: unknown): string | null {
  if (ref && typeof ref === 'object') {
    const o = ref as Record<string, unknown>;
    if (typeof o.description === 'string' && o.description.trim()) return o.description.trim();
  }
  return null;
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Host plus path with no scheme or query, for example "api.example.com/v1/price". */
function hostPath(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '';
    return `${host}${path}`;
  } catch {
    return null;
  }
}

function prettyHost(host: string | null | undefined): string | null {
  if (!host) return null;
  // Strip www. for display only.
  return host.replace(/^www\./i, '');
}
