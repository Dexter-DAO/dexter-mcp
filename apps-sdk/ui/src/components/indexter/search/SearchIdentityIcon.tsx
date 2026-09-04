import { useMemo, useState } from 'react';
import type { SearchResource } from './types';
import { resourceImageSources } from './utils';

/**
 * Identity icon fallback order: Dexter-proxied provider art, Dexter favicon proxy,
 * a neutral missing-art marker. No arbitrary provider URL is requested by
 * the browser and the fallback never impersonates a provider logo.
 */
export function SearchIdentityIcon({ resource, size = 44 }: { resource: SearchResource; size?: number }) {
  const sources = useMemo(() => {
    return resourceImageSources(resource);
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
  const initial = (
    resource.merchant?.displayName?.trim()
    || resource.sellerMeta?.displayName?.trim()
    || resource.seller?.trim()
    || resource.name.trim()
  ).slice(0, 1).toUpperCase() || '·';

  if (!currentSrc || allFailed) {
    return <UnsignedMark size={size} initial={initial} />;
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
 * An intentionally plain marker for a provider with no usable image.
 */
function UnsignedMark({ size, initial }: { size: number; initial: string }) {
  return (
    <div
      className="dx-search-identity__unsigned"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
