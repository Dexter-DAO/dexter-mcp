import { useMemo, useState } from 'react';
import type { SearchResource } from './types';
import { providerImageSources } from '../../x402/providerImage';

/**
 * Identity icon fallback order: Dexter-proxied provider art, Dexter favicon proxy,
 * a neutral missing-art marker. No arbitrary provider URL is requested by
 * the browser and the fallback never impersonates a provider logo.
 */
export function SearchIdentityIcon({ resource, size = 44 }: { resource: SearchResource; size?: number }) {
  const sources = useMemo(() => {
    return providerImageSources({
      iconUrl: resource.iconUrl,
      logoUrl: resource.sellerMeta?.logoUrl,
      resourceUrl: resource.url,
    });
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
 * An intentionally plain marker for a provider with no usable image.
 */
function UnsignedMark({ size }: { size: number }) {
  return (
    <div
      className="dx-search-identity__unsigned"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="dx-search-identity__unsigned-dot" />
    </div>
  );
}
