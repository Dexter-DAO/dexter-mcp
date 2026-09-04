import { useEffect, useState } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import {
  compactEvidenceLabel,
  formatListedPrice,
  merchantLabel,
} from './utils';

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

function evidenceDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

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
          const evidenceDate = evidenceDateLabel(resource.lastVerifiedAt);
          const evidence = compactEvidenceLabel(resource);
          const showRequiredInputs = summary.requiredInputsLabel !== 'None';

          return (
            <article
              key={`${resource.resourceId || resource.url}:${ordinal}`}
              className="dx-search-compare__card"
              data-selected={selected ? 'true' : undefined}
            >
              <div className="dx-search-compare__identity">
                <SearchIdentityIcon resource={resource} size={36} />
                <div>
                  <small>{merchantLabel(resource)}</small>
                  <strong>{resource.name}</strong>
                  <span className="sr-only">Result {ordinal} of {resources.length}</span>
                </div>
                <span className="dx-search-compare__price">{price}</span>
              </div>

              <div className="dx-search-compare__rationale">
                <p className="dx-search-compare__why">{summary.why}</p>
                {summary.safetyWarning ? (
                  <p className="dx-search-safety-note" role="note">
                    {summary.safetyWarning}
                  </p>
                ) : null}
              </div>

              {evidence || showRequiredInputs ? (
                <dl className="dx-search-compare__facts">
                  {evidence ? (
                    <div>
                      <dt>Evidence</dt>
                      <dd className="dx-search-compare__evidence">
                        <span
                          className="dx-search-compare__evidence-dot"
                          data-basis={summary.evidenceBasis || 'none'}
                          aria-hidden="true"
                        />
                        <span>{evidence}</span>
                        {evidenceDate ? (
                          <time dateTime={resource.lastVerifiedAt ?? undefined}>{evidenceDate}</time>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                  {showRequiredInputs ? (
                    <div>
                      <dt>Needs</dt>
                      <dd>{summary.requiredInputsLabel}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <div className="dx-search-compare__footer">
                <div className="dx-search-compare__actions">
                  {selected ? (
                    <span className="dx-search-compare__selected-label">Selected</span>
                  ) : (
                    <button
                      type="button"
                      className="dx-search-compare__choose"
                      onClick={() => onSelect(resource)}
                      aria-label={`Select ${resource.name} from ${merchantLabel(resource)}`}
                      disabled={interactionLocked}
                    >
                      Select
                    </button>
                  )}
                  <button
                    type="button"
                    className="dx-search-compare__details"
                    onClick={() => onInspect(resource)}
                    aria-label={`View ${resource.name} details from ${merchantLabel(resource)}`}
                    aria-expanded={openDetailOrdinal === ordinal}
                    aria-controls={detailsId}
                    data-indexter-detail-trigger={ordinal}
                    disabled={interactionLocked}
                  >
                    Details
                  </button>
                </div>
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
