import { useMemo, useState } from 'react';
import type { EnrichedResource } from './types';
import { formatHitCount } from './types';
import { providerImageSources } from '../x402/providerImage';

interface Props {
  resource: EnrichedResource | null;
  fallbackUrl: string | null;
  /** The raw `resource` field from the 402 body (URL string or object with a
   *  description). Rescues the title when there's no catalog entry and the
   *  client never exposed the tool input URL. */
  resourceRef?: unknown;
}

/**
 * The "what is this thing" header.
 *
 * Composes: favicon (from icon_url) + display_name + meta line
 * (category · host · hit count). Title falls back through catalog name,
 * catalog host, the 402 resource URL's host and path, and the 402 resource
 * description before "Unknown endpoint", so a live 402 with no catalog entry still
 * gets a real title instead of "Unknown endpoint".
 */
export function ResourceIdentity({ resource, fallbackUrl, resourceRef }: Props) {
  const refUrl = fallbackUrl || resourceUrlFrom(resourceRef);
  const name =
    resource?.display_name?.trim() ||
    prettyHost(resource?.host) ||
    hostPath(refUrl) ||
    descriptionFrom(resourceRef) ||
    'Unknown endpoint';
  const meta = buildMetaLine(resource, refUrl);
  const sources = useMemo(() => providerImageSources({
    iconUrl: resource?.icon_url,
    resourceUrl: resource?.resource_url || refUrl,
  }), [resource?.icon_url, resource?.resource_url, refUrl]);
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
        <h1 className="dx-pricing__identity-name">{name}</h1>
        {meta ? <p className="dx-pricing__identity-meta">{meta}</p> : null}
      </div>
    </div>
  );
}

function buildMetaLine(resource: EnrichedResource | null, refUrl: string | null): string {
  const parts: string[] = [];
  if (resource?.category) parts.push(resource.category);
  const host = resource?.host || hostFromUrl(refUrl);
  if (host) parts.push(host);
  if (typeof resource?.hit_count === 'number' && resource.hit_count > 0) {
    parts.push(`${formatHitCount(resource.hit_count)} calls`);
  }
  return parts.join(' · ');
}

/** Pull a URL out of the 402 `resource` field (string, or object with url). */
function resourceUrlFrom(ref: unknown): string | null {
  if (typeof ref === 'string') return ref.trim() || null;
  if (ref && typeof ref === 'object') {
    const o = ref as Record<string, unknown>;
    if (typeof o.url === 'string' && o.url.trim()) return o.url.trim();
    if (typeof o.resource === 'string' && o.resource.trim()) return o.resource.trim();
  }
  return null;
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
