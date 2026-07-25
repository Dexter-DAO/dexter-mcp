import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

type Props = {
  resources: SearchResource[];
  selectedUrl?: string | null;
  onSelect: (resource: SearchResource) => void;
  onInspect: (resource: SearchResource) => void;
};

const INITIAL_SHORTLIST_SIZE = 4;

export function SearchComparisonPanel({
  resources,
  selectedUrl,
  onSelect,
  onInspect,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  if (resources.length < 2) return null;

  const selectedIndex = resources.findIndex(
    (resource) => resource.url === selectedUrl,
  );
  const keepSelectedVisible = selectedIndex >= INITIAL_SHORTLIST_SIZE;
  const visibleResources =
    showAll || keepSelectedVisible
      ? resources
      : resources.slice(0, INITIAL_SHORTLIST_SIZE);
  const hiddenCount = resources.length - visibleResources.length;

  return (
    <section className="dx-search-compare" aria-labelledby="dx-search-compare-title">
      <div className="dx-search-compare__header">
        <h2 id="dx-search-compare-title">Compare services</h2>
        <p>{resources.length} services reviewed for this request</p>
      </div>

      <div className="dx-search-compare__grid">
        {visibleResources.map((resource, index) => {
          const summary = summarizeSearchResource(resource);
          const price = formatListedPrice(
            summary.priceLabel,
            summary.priceUsdc,
            summary.priceFallback,
          );
          const selected = selectedUrl === resource.url;

          return (
            <article
              key={resource.resourceId || resource.url}
              className="dx-search-compare__card"
              data-selected={selected ? 'true' : undefined}
            >
              <div className="dx-search-compare__identity">
                <SearchIdentityIcon resource={resource} size={38} />
                <div>
                  <strong>{resource.name}</strong>
                  <small>{hostLabel(resource.url)}</small>
                </div>
                <div className="dx-search-compare__badges">
                  {index === 0 && (
                    <span>
                      {resource.tier === 'related'
                        ? 'Closest match'
                        : 'Recommended'}
                    </span>
                  )}
                  {selected && <span data-selected="true">Selected</span>}
                </div>
              </div>

              <p className="dx-search-compare__why">{summary.why}</p>

              <dl className="dx-search-compare__facts">
                <div>
                  <dt>Quality</dt>
                  <dd>
                    {summary.qualityScore === null
                      ? 'Not scored'
                      : `${summary.qualityScore}/100`}
                  </dd>
                </div>
                <div>
                  <dt>Listed price</dt>
                  <dd>{price}</dd>
                </div>
              </dl>

              <div className="dx-search-compare__actions">
                {selected ? (
                  <span className="dx-search-compare__selected-label">
                    Current choice
                  </span>
                ) : (
                  <button
                    type="button"
                    className="dx-search-compare__choose"
                    onClick={() => onSelect(resource)}
                  >
                    Choose
                  </button>
                )}
                <Button
                  className="dx-search-compare__details"
                  color="secondary"
                  variant="ghost"
                  size="sm"
                  onClick={() => onInspect(resource)}
                >
                  Details
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="dx-search-compare__more"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
    </section>
  );
}
