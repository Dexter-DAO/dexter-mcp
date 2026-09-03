import { useState } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

type Props = {
  resources: SearchResource[];
  selectedOrdinal?: number | null;
  onSelect: (resource: SearchResource) => void;
  onInspect: (resource: SearchResource) => void;
  interactionLocked?: boolean;
};

const INITIAL_SHORTLIST_SIZE = 4;

export function SearchComparisonPanel({
  resources,
  selectedOrdinal,
  onSelect,
  onInspect,
  interactionLocked = false,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  if (resources.length < 2) return null;

  const selectedIndex =
    Number.isSafeInteger(selectedOrdinal)
    && Number(selectedOrdinal) >= 1
    && Number(selectedOrdinal) <= resources.length
      ? Number(selectedOrdinal) - 1
      : -1;
  const visibleResources = showAll || selectedIndex >= INITIAL_SHORTLIST_SIZE
    ? resources
    : resources.slice(0, INITIAL_SHORTLIST_SIZE);
  const hiddenCount = resources.length - visibleResources.length;

  return (
    <section className="dx-search-compare" aria-labelledby="dx-search-compare-title">
      <div className="dx-search-compare__header">
        <h2 id="dx-search-compare-title">Compare services</h2>
        <p>{resources.length} results for this request</p>
      </div>

      <div className="dx-search-compare__grid">
        {visibleResources.map((resource, index) => {
          const summary = summarizeSearchResource(resource);
          const price = formatListedPrice(
            summary.priceLabel,
            summary.priceUsdc,
            summary.priceFallback,
          );
          const selected = selectedIndex === index;

          return (
            <article
              key={`${resource.resourceId || resource.url}:${index}`}
              className="dx-search-compare__card"
              data-selected={selected ? 'true' : undefined}
            >
              <div className="dx-search-compare__identity">
                <SearchIdentityIcon resource={resource} size={36} />
                <div>
                  <strong>{resource.name}</strong>
                  <small>
                    {index === 0 ? 'Recommended · ' : ''}{hostLabel(resource.url)}
                  </small>
                </div>
              </div>

              <p className="dx-search-compare__why">{summary.why}</p>

              {summary.safetyWarning ? (
                <p className="dx-search-safety-note" role="note">
                  {summary.safetyWarning}
                </p>
              ) : null}

              <dl className="dx-search-compare__facts">
                <div>
                  <dt>Price</dt>
                  <dd>{price}</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>{summary.qualityScore === null ? 'Unscored' : `${summary.qualityScore}/100`}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>{summary.networkLabel}</dd>
                </div>
              </dl>

              <div className="dx-search-compare__actions">
                {selected ? (
                  <span className="dx-search-compare__selected-label">Current choice</span>
                ) : (
                  <button
                    type="button"
                    className="dx-search-compare__choose"
                    onClick={() => onSelect(resource)}
                    aria-label={`Choose ${resource.name}`}
                    disabled={interactionLocked}
                  >
                    Choose
                  </button>
                )}
                <button
                  type="button"
                  className="dx-search-compare__details"
                  onClick={() => onInspect(resource)}
                  aria-label={`View details for ${resource.name}`}
                  disabled={interactionLocked}
                >
                  Details
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          className="dx-search-compare__more"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more
        </button>
      ) : null}
    </section>
  );
}
