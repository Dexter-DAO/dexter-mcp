import { useEffect, useId, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import {
  buildSearchDecision,
  summarizeSearchResource,
} from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

export type SearchDecisionBriefCheckState =
  | { status: 'idle'; resourceUrl?: null; message?: null }
  | { status: 'checking'; resourceUrl?: string | null; message?: string | null }
  | { status: 'checked'; resourceUrl?: string | null; message?: string | null }
  | { status: 'error'; resourceUrl?: string | null; message: string };

export type SearchDecisionBriefProps = {
  resources: SearchResource[];
  selectedUrl?: string | null;
  checkState?: SearchDecisionBriefCheckState;
  onSelect: (resource: SearchResource) => void;
  /**
   * Advance the selected resource into a fresh price/check step.
   * This component deliberately performs no payment action.
   */
  onUseService: (resource: SearchResource) => void;
  onCompareAll: () => void;
  canCheckCurrentTerms?: boolean;
  canCompare?: boolean;
  heading?: string;
  alternativeLimit?: number;
};

export function SearchDecisionBrief({
  resources,
  selectedUrl,
  checkState = { status: 'idle' },
  onSelect,
  onUseService,
  onCompareAll,
  canCheckCurrentTerms = true,
  canCompare = true,
  heading = 'Best match',
  alternativeLimit = 3,
}: SearchDecisionBriefProps) {
  const headingId = useId();
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);
  useEffect(() => {
    setShowAllAlternatives(false);
  }, [resources]);
  const decision = buildSearchDecision(
    resources,
    selectedUrl,
    showAllAlternatives ? resources.length : alternativeLimit,
  );

  if (!decision.recommended || !decision.actionTarget) {
    return (
      <section
        className="rounded-2xl border border-subtle bg-surface px-4 py-6 text-center"
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="text-base font-semibold text-primary">
          No matching services
        </h2>
        <p className="mt-1 text-sm leading-5 text-secondary">
          Try describing the outcome you need in a different way.
        </p>
      </section>
    );
  }

  const {
    recommended,
    recommendationKind,
    actionTarget,
    alternatives,
  } =
    decision;
  const displayedSummary = summarizeSearchResource(actionTarget);
  const displayedPrice = formatListedPrice(
    displayedSummary.priceLabel,
    displayedSummary.priceUsdc,
    displayedSummary.priceFallback,
  );
  const isShowingRecommendation = actionTarget.url === recommended.url;
  const leadingLabel =
    recommendationKind === 'related' ? 'Closest match' : 'Recommended';
  const relevantCheckState =
    !checkState.resourceUrl || checkState.resourceUrl === actionTarget.url
      ? checkState
      : { status: 'idle' as const };
  const isChecking = relevantCheckState.status === 'checking';
  const hasCurrentTerms = relevantCheckState.status === 'checked';

  return (
    <section
      className={`dx-search-brief overflow-hidden rounded-2xl border border-default bg-surface ${
        hasCurrentTerms ? 'dx-search-brief--confirmed' : ''
      }`}
      aria-labelledby={headingId}
    >
      <div className="dx-search-brief__recommendation p-4 sm:p-5">
        <div className="dx-search-brief__identity flex items-start gap-3">
          <SearchIdentityIcon resource={actionTarget} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dx-search-brief__badge">
                {isShowingRecommendation ? leadingLabel : 'Selected'}
              </span>
              {actionTarget.verified && (
                <span className="dx-search-brief__badge dx-search-brief__badge--verified">
                  Verified
                </span>
              )}
            </div>
            <h2
              id={headingId}
              className="dx-search-brief__title mt-2 truncate text-lg font-semibold leading-6 text-primary"
            >
              {actionTarget.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-tertiary">
              {isShowingRecommendation
                ? recommendationKind === 'related'
                  ? 'Closest related match'
                  : heading
                : 'Selected alternative'} ·{' '}
              {hostLabel(actionTarget.url)}
            </p>
          </div>
          {hasCurrentTerms && canCompare && resources.length > 1 && (
            <Button
              className="dx-search-brief__change"
              color="secondary"
              variant="soft"
              size="sm"
              onClick={onCompareAll}
              aria-label="Change service"
            >
              <span className="dx-search-brief__change-wide">Change service</span>
              <span className="dx-search-brief__change-compact" aria-hidden="true">
                Change
              </span>
            </Button>
          )}
        </div>

        {!hasCurrentTerms && (
          <>
            <p className="dx-search-brief__why mt-4 line-clamp-3 text-sm leading-6 text-secondary">
              {displayedSummary.why}
            </p>

            <dl className="dx-search-brief__facts mt-4 grid grid-cols-2 gap-3 border-t border-subtle pt-4">
              <div>
                <dt className="text-xs text-tertiary">Quality</dt>
                <dd className="mt-0.5 text-sm font-semibold text-primary">
                  {displayedSummary.qualityScore === null
                    ? 'Not scored'
                    : `${displayedSummary.qualityScore}/100`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-tertiary">Listed price</dt>
                <dd className="mt-0.5 text-sm font-semibold text-primary">
                  {displayedPrice}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      {!hasCurrentTerms && alternatives.length > 0 && (
        <fieldset className="dx-search-brief__alternatives border-t border-subtle px-4 py-4 sm:px-5">
          <legend className="px-1 text-xs font-medium text-tertiary">
            Other options
          </legend>
          <ul className="dx-search-brief__alternative-list mt-1 space-y-2">
            {alternatives.map((resource) => {
              const summary = summarizeSearchResource(resource);
              const listedPrice = formatListedPrice(
                summary.priceLabel,
                summary.priceUsdc,
                summary.priceFallback,
              );
              const isLeading = resource.url === recommended.url;

              return (
                <li key={resource.resourceId || resource.url}>
                  <button
                    type="button"
                    onClick={() => onSelect(resource)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-subtle px-3 py-2.5 transition-colors hover:bg-surface-secondary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-primary">
                        {resource.name}
                      </span>
                      <span className="block truncate text-xs text-tertiary">
                        {isLeading ? `${leadingLabel} · ` : ''}
                        {hostLabel(resource.url)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium text-primary">
                        {listedPrice}
                      </span>
                      <span className="block text-xs text-tertiary">
                        {summary.qualityScore === null
                          ? 'Not scored'
                          : `${summary.qualityScore}/100 quality`}
                      </span>
                    </span>
                    <span
                      className="dx-search-brief__choice"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!canCompare && decision.hiddenAlternativeCount > 0 && (
            <button
              type="button"
              className="dx-search-brief__show-more"
              onClick={() => setShowAllAlternatives(true)}
            >
              Show {decision.hiddenAlternativeCount} more
            </button>
          )}
        </fieldset>
      )}

      {!hasCurrentTerms && (
        <footer className="dx-search-brief__footer border-t border-subtle bg-surface-secondary px-4 py-4 sm:px-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {canCompare && resources.length > 1 && (
              <Button
                color="secondary"
                variant="soft"
                size="sm"
                onClick={onCompareAll}
              >
                Compare all
              </Button>
            )}
            <Button
              className="dx-search-primary-action"
              color="primary"
              variant="solid"
              size="sm"
              onClick={() => onUseService(actionTarget)}
              disabled={isChecking || !canCheckCurrentTerms}
            >
              {!canCheckCurrentTerms
                ? 'Unavailable in this host'
                : isChecking
                ? 'Confirming terms…'
                : relevantCheckState.status === 'error'
                  ? 'Try again'
                  : 'Use this service'}
            </Button>
          </div>

          <div className="mt-3 text-xs leading-5 text-tertiary" aria-live="polite">
            {!canCheckCurrentTerms ? (
              <p>This host can’t check current terms from the widget.</p>
            ) : relevantCheckState.status === 'error' ? (
              <p className="text-danger" role="alert">
                {relevantCheckState.message}
              </p>
            ) : relevantCheckState.status === 'checking' ? (
              <p>{relevantCheckState.message || 'Confirming the current terms…'}</p>
            ) : (
              <p>Dexter will confirm the current terms before approval.</p>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
