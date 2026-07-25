import { useMemo, useState } from 'react';
import type { SearchResource } from './types';
import { resourceIconUrl } from './utils';

/**
 * Identity icon: tries the resource's own icon → seller logo → favicon proxy
 * → a quiet geometric "unsigned" mark. No letter bubbles. Letter fallbacks
 * read as tacky contacts-app filler; a small geometric glyph reads as
 * "we don't have art for this seller yet" without making each row look
 * like a different brand entirely.
 */
export function SearchIdentityIcon({ resource, size = 44 }: { resource: SearchResource; size?: number }) {
  const sources = useMemo(() => {
    const list: string[] = [];
    if (resource.iconUrl) list.push(resource.iconUrl);
    if (resource.sellerMeta?.logoUrl) list.push(resource.sellerMeta.logoUrl);
    const proxied = resourceIconUrl(resource);
    if (proxied && !list.includes(proxied)) list.push(proxied);
    return list;
  }, [resource]);

  const sourceKey = sources.join('\n');
  const [loadState, setLoadState] = useState({
    sourceKey: '',
    attempt: 0,
  });
  const attempt =
    loadState.sourceKey === sourceKey ? loadState.attempt : 0;
  const currentSrc = sources[attempt];
  const allFailed = attempt >= sources.length;

  if (!currentSrc || allFailed) {
    return <UnsignedMark size={size} />;
  }

  return (
    <img
      src={currentSrc}
      alt=""
      width={size}
      height={size}
      className="dx-search-identity__img"
      style={{ width: size, height: size }}
      onError={() => {
        setLoadState((current) => ({
          sourceKey,
          attempt:
            current.sourceKey === sourceKey
              ? current.attempt + 1
              : 1,
        }));
      }}
      aria-hidden="true"
    />
  );
}

/**
 * "Unsigned" mark — quiet geometric placeholder for rows whose seller
 * hasn't supplied art yet. Concentric strokes (rounded square + diamond +
 * dot), neutral tone, no letters. Reads as "no signature on file" rather
 * than impersonating a logo.
 */
function UnsignedMark({ size }: { size: number }) {
  return (
    <div
      className="dx-search-identity__unsigned"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 44 44" width={size} height={size}>
        <defs>
          <linearGradient id="dx-id-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="44" height="44" rx="14" fill="url(#dx-id-grad)" />
        <rect
          x="6" y="6" width="32" height="32"
          rx="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.18"
        />
        <path
          d="M22 12 L32 22 L22 32 L12 22 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          opacity="0.32"
        />
        <circle cx="22" cy="22" r="2.6" fill="currentColor" opacity="0.42" />
      </svg>
    </div>
  );
}
