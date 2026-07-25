import { useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ChainIcon, getChain } from '..';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import {
  formatAssetLabel,
  formatCompactNumber,
  formatListedPrice,
  hostLabel,
} from './utils';

interface Props {
  resource: SearchResource;
  index: number;
  featured?: boolean;
  selected?: boolean;
  onInspect: (resource: SearchResource) => void;
  onCheckPrice: (resource: SearchResource) => Promise<void>;
}

export function SearchVerdictRow({
  resource,
  index,
  featured = false,
  selected = false,
  onInspect,
  onCheckPrice,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50 + index * 35);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    setCheckError(null);
  }, [resource.url]);

  async function handleCheckPrice(e: React.MouseEvent) {
    e.stopPropagation();
    setCheckError(null);
    setChecking(true);
    try {
      await onCheckPrice(resource);
    } catch {
      setCheckError('Couldn’t check the current price. Try again.');
    } finally {
      setChecking(false);
    }
  }

  const host = hostLabel(resource.url);
  const chainOptions = resource.chains?.length
    ? resource.chains
    : [{
        network: resource.network ?? null,
        priceUsdc: resource.priceUsdc,
        priceLabel: resource.price === 'free' ? 'Free' : resource.price,
      }];

  const tier = resource.tier;
  const whyText = resource.why?.trim() ?? '';
  const qualityScore =
    typeof resource.qualityScore === 'number' && Number.isFinite(resource.qualityScore)
      ? resource.qualityScore
      : null;
  const gamingSuspicious = resource.gamingSuspicious === true;

  return (
    <article
      className={`dx-search-cell ${visible ? 'dx-search-cell--visible' : ''} ${selected ? 'dx-search-cell--selected' : ''} ${featured ? 'dx-search-cell--featured' : ''}`}
      data-featured={featured ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="dx-search-cell__inspect"
        onClick={() => onInspect(resource)}
        aria-label={`Inspect ${resource.name}`}
        aria-current={selected ? 'true' : undefined}
      />
      <div className="dx-search-cell__identity">
        <SearchIdentityIcon resource={resource} size={44} />
        <div className="dx-search-cell__identity-text">
          <h3 className="dx-search-cell__name">{resource.name}</h3>
          <div className="dx-search-cell__meta">
            <span className="dx-search-cell__host">{host}</span>
            {resource.verified && (
              <span className="dx-search-cell__badge dx-search-cell__badge--verified">
                <CheckIcon /> verified
              </span>
            )}
            {gamingSuspicious && (
              <span className="dx-search-cell__badge dx-search-cell__badge--warn">
                ⚠ flagged
              </span>
            )}
            {tier === 'strong' && (
              <span className="dx-search-cell__tier">strong</span>
            )}
            {featured && (
              <span className="dx-search-cell__badge dx-search-cell__badge--featured">
                top match
              </span>
            )}
            {selected && (
              <span className="dx-search-cell__badge dx-search-cell__badge--selected">
                selected
              </span>
            )}
            {resource.totalCalls > 0 && (
              <span className="dx-search-cell__usage">{formatCompactNumber(resource.totalCalls)} calls</span>
            )}
          </div>
        </div>
      </div>

      {resource.description && (
        <p className="dx-search-cell__description">{resource.description}</p>
      )}

      {(whyText || qualityScore !== null) && (
        <div className="dx-search-cell__signals">
          {qualityScore !== null && (
            <div className="dx-search-cell__quality" aria-label={`Quality ${qualityScore} out of 100`}>
              <span>Quality</span>
              <strong>{qualityScore}</strong>
              <span>/100</span>
            </div>
          )}
          {whyText && (
            <div className="dx-search-cell__why">
              <span className="dx-search-cell__why-label">Why this matched</span>
              <p>{whyText}</p>
            </div>
          )}
        </div>
      )}

      <div className="dx-search-cell__footer">
        <div className="dx-search-cell__chains">
          {chainOptions.map((chain, i) => {
            const networkName = getChain(chain.network).name || 'Unknown network';
            const assetLabel = formatAssetLabel(chain.asset);
            const priceLabel = formatListedPrice(
              chain.priceLabel,
              chain.priceUsdc,
              resource.price === 'free' ? 'Free' : resource.price,
            );
            return (
              <span
                key={`${chain.network ?? 'x'}-${chain.asset ?? 'asset'}-${priceLabel}-${i}`}
                className="dx-search-cell__chain"
                title={`${networkName} · ${assetLabel} · listed price ${priceLabel}`}
                aria-label={`${networkName}, ${assetLabel}, listed price ${priceLabel}`}
              >
                <ChainIcon network={chain.network} size={16} />
                <span className="dx-search-cell__chain-asset">{assetLabel}</span>
                <span className="dx-search-cell__chain-price">{priceLabel}</span>
              </span>
            );
          })}
          {resource.authRequired && (
            <span
              className="dx-search-cell__auth"
              title={resource.authHint || 'Provider authentication required.'}
            >
              auth
            </span>
          )}
        </div>
        <div className="dx-search-cell__actions">
          <Button
            variant="soft"
            color="secondary"
            size="sm"
            onClick={handleCheckPrice}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Check fresh price'}
          </Button>
        </div>
      </div>
      {checkError && (
        <p className="dx-search-cell__action-error" role="alert">{checkError}</p>
      )}
    </article>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true">
      <path
        d="M2 6.5 L5 9 L10 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
