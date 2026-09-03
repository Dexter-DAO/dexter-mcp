import { useEffect, useState } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

type Props = {
  resources: SearchResource[];
  selectedOrdinal?: number | null;
  onSelect: (resource: SearchResource) => void;
  onInspect: (resource: SearchResource) => void;
  openDetailOrdinal?: number | null;
  comparisonId: string;
  isFullscreen: boolean;
  condensed: boolean;
  detailsId: string;
  interactionLocked?: boolean;
};

const CONDENSED_PAGE_SIZE = 1;
const INLINE_PAGE_SIZE = 2;

export function SearchComparisonPanel({
  resources,
  selectedOrdinal,
  onSelect,
  onInspect,
  openDetailOrdinal = null,
  comparisonId,
  isFullscreen,
  condensed,
  detailsId,
  interactionLocked = false,
}: Props) {
  const pageSize = condensed ? CONDENSED_PAGE_SIZE : INLINE_PAGE_SIZE;
  const selectedIndex =
    Number.isSafeInteger(selectedOrdinal)
    && Number(selectedOrdinal) >= 1
    && Number(selectedOrdinal) <= resources.length
      ? Number(selectedOrdinal) - 1
      : -1;
  const selectedPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / pageSize)
    : 0;
  const [pageIndex, setPageIndex] = useState(selectedPage);
  const pageCount = Math.max(1, Math.ceil(resources.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    setPageIndex((previousPage) => Math.min(previousPage, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (isFullscreen || selectedIndex < 0) return;
    setPageIndex((previousPage) => {
      const pageStart = previousPage * pageSize;
      const pageEnd = pageStart + pageSize;
      return selectedIndex >= pageStart && selectedIndex < pageEnd
        ? previousPage
        : selectedPage;
    });
  }, [isFullscreen, pageSize, selectedIndex, selectedPage]);

  if (resources.length < 2) return null;

  const indexedResources = resources.map((resource, index) => ({
    resource,
    ordinal: index + 1,
  }));
  const pageStart = currentPage * pageSize;
  const visibleResources = isFullscreen
    ? indexedResources
    : indexedResources.slice(pageStart, pageStart + pageSize);
  const rangeStart = pageStart + 1;
  const rangeEnd = Math.min(pageStart + pageSize, resources.length);

  return (
    <section
      id={comparisonId}
      className="dx-search-compare"
      aria-labelledby={`${comparisonId}-title`}
    >
      <div className="dx-search-compare__header">
        <h2 id={`${comparisonId}-title`}>Compare services</h2>
        <p>{resources.length} results for this request</p>
      </div>

      <div className="dx-search-compare__grid">
        {visibleResources.map(({ resource, ordinal }) => {
          const summary = summarizeSearchResource(resource);
          const price = formatListedPrice(
            summary.priceLabel,
            summary.priceUsdc,
            summary.priceFallback,
          );
          const selected = selectedOrdinal === ordinal;

          return (
            <article
              key={`${resource.resourceId || resource.url}:${ordinal}`}
              className="dx-search-compare__card"
              data-selected={selected ? 'true' : undefined}
            >
              <div className="dx-search-compare__identity">
                <SearchIdentityIcon resource={resource} size={36} />
                <div>
                  <strong>{resource.name}</strong>
                  <small>
                    {ordinal === 1 ? 'Recommended · ' : ''}{hostLabel(resource.url)}
                  </small>
                  <span className="sr-only">Result {ordinal} of {resources.length}</span>
                </div>
              </div>

              <div className="dx-search-compare__rationale">
                <p className="dx-search-compare__why">{summary.why}</p>
                {summary.safetyWarning ? (
                  <p className="dx-search-safety-note" role="note">
                    {summary.safetyWarning}
                  </p>
                ) : null}
              </div>

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
                  aria-expanded={openDetailOrdinal === ordinal}
                  aria-controls={detailsId}
                  data-indexter-detail-trigger={ordinal}
                  disabled={interactionLocked}
                >
                  Details
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!isFullscreen && pageCount > 1 ? (
        <nav className="dx-search-compare__pagination" aria-label="Comparison result pages">
          <button
            type="button"
            className="dx-search-compare__previous"
            aria-controls={comparisonId}
            disabled={interactionLocked || currentPage === 0}
            onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
          >
            Previous
          </button>
          <span className="dx-search-compare__range" aria-live="polite">
            {rangeStart}–{rangeEnd} of {resources.length}
          </span>
          <button
            type="button"
            className="dx-search-compare__next"
            aria-controls={comparisonId}
            disabled={interactionLocked || currentPage >= pageCount - 1}
            onClick={() => setPageIndex((page) => Math.min(pageCount - 1, page + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
