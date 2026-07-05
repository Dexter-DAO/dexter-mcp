import type { EnrichedResource } from './types';
import { formatHitCount } from './types';

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
 * (category · host · hit count). Title falls back through catalog name →
 * catalog host → the 402 resource URL's host+path → the 402 resource
 * description → "Unknown endpoint", so a live 402 with no catalog entry still
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
  const icon = resource?.icon_url || null;

  return (
    <div className="dx-pricing__identity">
      <div className="dx-pricing__identity-icon">
        {icon ? (
          <img
            src={icon}
            alt=""
            width={32}
            height={32}
            className="dx-pricing__identity-icon-img"
            aria-hidden
            loading="lazy"
          />
        ) : (
          <div className="dx-pricing__identity-icon-placeholder" aria-hidden />
        )}
      </div>
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

/** host + path (no scheme, no query) — e.g. "api.example.com/v1/price". */
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
