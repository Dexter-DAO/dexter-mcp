import { useEffect, useId, useState } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import {
  buildSearchDecision,
  summarizeSearchResource,
} from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

export type SearchDecisionBriefCheckState =
  | { status: 'idle'; resultOrdinal?: null; message?: null }
  | { status: 'checking'; resultOrdinal?: number | null; message?: string | null }
  | { status: 'details_sent'; resultOrdinal?: number | null; message?: string | null }
  | { status: 'checked'; resultOrdinal?: number | null; message?: string | null }
  | { status: 'error'; resultOrdinal?: number | null; message: string };

export type SearchDecisionBriefProps = {
  resources: SearchResource[];
  selectedOrdinal?: number | null;
  checkState?: SearchDecisionBriefCheckState;
  onSelect: (resource: SearchResource) => void;
  onUseService: (resource: SearchResource) => void;
  onCompareAll: () => void;
  comparisonOpen: boolean;
  comparisonId: string;
  canCheckCurrentTerms?: boolean;
  canProvideDetailsInChat?: boolean;
  canCompare?: boolean;
  interactionLocked?: boolean;
  heading?: string;
  alternativeLimit?: number;
  compact?: boolean;
};

function listedPrice(resource: SearchResource): string {
  const summary = summarizeSearchResource(resource);
  return formatListedPrice(
    summary.priceLabel,
    summary.priceUsdc,
    summary.priceFallback,
  );
}

export function SearchDecisionBrief({
  resources,
  selectedOrdinal,
  checkState = { status: 'idle' },
  onSelect,
  onUseService,
  onCompareAll,
  comparisonOpen,
  comparisonId,
  canCheckCurrentTerms = true,
  canProvideDetailsInChat = true,
  canCompare = true,
  interactionLocked = false,
  alternativeLimit = 3,
  compact = false,
}: SearchDecisionBriefProps) {
  const headingId = useId();
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);

  useEffect(() => {
    setShowAllAlternatives(false);
  }, [resources]);

  const decision = buildSearchDecision(
    resources,
    selectedOrdinal,
    showAllAlternatives ? resources.length : alternativeLimit,
  );

  if (!decision.recommended || !decision.actionTarget) {
    return (
      <section className="dx-search-brief dx-search-brief--empty" aria-labelledby={headingId}>
        <h2 id={headingId}>No matching capabilities</h2>
        <p>Describe the result you need in a different way.</p>
      </section>
    );
  }

  const { recommended, recommendationKind, actionTarget, alternatives } = decision;
  const actionTargetOrdinal = resources.indexOf(actionTarget) + 1;
  const summary = summarizeSearchResource(actionTarget);
  const price = listedPrice(actionTarget);
  const isRecommended = actionTargetOrdinal === 1;
  const relevantCheckState =
    !checkState.resultOrdinal || checkState.resultOrdinal === actionTargetOrdinal
      ? checkState
      : { status: 'idle' as const };
  const isChecking = relevantCheckState.status === 'checking';
  const detailsSent = relevantCheckState.status === 'details_sent';
  const hasCurrentTerms = relevantCheckState.status === 'checked';
  const resourceAction = summary.action;
  const canPerformAction = !resourceAction.disabled && (
    resourceAction.kind === 'provide_details'
      ? canProvideDetailsInChat
      : resourceAction.kind === 'check_live_terms'
        ? canCheckCurrentTerms
        : false
  );
  const unavailableInHost = !resourceAction.disabled && !canPerformAction;
  const selectionLabel = isRecommended && !selectedOrdinal
    ? (recommendationKind === 'related' ? 'Closest match' : 'Recommended')
    : 'Selected';

  const actionLabel = resourceAction.disabled
    ? resourceAction.label
    : unavailableInHost
      ? 'Unavailable in this host'
      : isChecking
        ? resourceAction.kind === 'provide_details'
          ? 'Opening chat…'
          : 'Opening terms…'
        : detailsSent
          ? 'Opened in chat'
          : relevantCheckState.status === 'error'
            ? 'Try again'
            : resourceAction.label;
  const actionDisabled =
    isChecking
    || interactionLocked
    || detailsSent
    || resourceAction.disabled
    || !canPerformAction;
  const actionNote = resourceAction.disabled
    ? resourceAction.helperText
    : unavailableInHost
      ? resourceAction.kind === 'provide_details'
        ? "This host can't continue the request in chat."
        : "This host can't open the current-terms check in chat."
      : relevantCheckState.status === 'error'
        ? relevantCheckState.message
        : relevantCheckState.status === 'checking'
          ? relevantCheckState.message || 'Opening the terms check in chat…'
          : relevantCheckState.status === 'details_sent'
            ? relevantCheckState.message || 'Continue in chat to provide the missing request details.'
            : resourceAction.helperText;

  if (compact) {
    return (
      <section className="dx-search-brief dx-search-brief--compact" aria-labelledby={headingId}>
        <div className="dx-search-brief__identity">
          <SearchIdentityIcon resource={actionTarget} size={36} />
          <div className="dx-search-brief__identity-copy">
            <h2 id={headingId} className="dx-search-brief__title">{actionTarget.name}</h2>
            <p className="dx-search-brief__host">
              {selectionLabel} · {hostLabel(actionTarget.url)}
            </p>
          </div>
          <strong className="dx-search-brief__compact-price">{price}</strong>
        </div>

        {!hasCurrentTerms ? (
          <>
            <p className="dx-search-brief__why">{summary.why}</p>

            {summary.safetyWarning ? (
              <p className="dx-search-safety-note" role="note">
                {summary.safetyWarning}
              </p>
            ) : null}

            <div className="dx-search-brief__compact-footer">
              <span>{summary.networkLabel} · {summary.evidenceBadgeLabel}</span>
              <button
                type="button"
                className="dx-search-primary-action"
                onClick={() => onUseService(actionTarget)}
                aria-busy={isChecking}
                aria-label={`${resourceAction.label} for ${actionTarget.name}`}
                disabled={actionDisabled}
              >
                {actionLabel}
              </button>
            </div>

            <p
              className={`dx-search-brief__action-note${relevantCheckState.status === 'error' ? ' dx-search-brief__action-note--error' : ''}`}
              aria-live="polite"
            >
              {actionNote}
            </p>

            {alternatives.length > 0 ? (
              <ul className="dx-search-brief__compact-alternatives" aria-label="Other ranked results">
                {alternatives.map((resource) => (
                  <li key={`${resource.resourceId || resource.url}:${resources.indexOf(resource)}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(resource)}
                      disabled={interactionLocked}
                    >
                      <SearchIdentityIcon resource={resource} size={28} />
                      <span>
                        <strong>{resource.name}</strong>
                        <small>{hostLabel(resource.url)}</small>
                      </span>
                      <b>{listedPrice(resource)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {alternativeLimit > 0 && decision.hiddenAlternativeCount > 0 ? (
              <button
                type="button"
                className="dx-search-brief__compact-compare"
                onClick={onCompareAll}
                aria-controls={comparisonId}
                aria-expanded={comparisonOpen}
                disabled={interactionLocked}
              >
                Compare all {resources.length} results
              </button>
            ) : null}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`dx-search-brief${hasCurrentTerms ? ' dx-search-brief--confirmed' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="dx-search-brief__recommendation">
        <div className="dx-search-brief__identity">
          <SearchIdentityIcon resource={actionTarget} size={44} />
          <div className="dx-search-brief__identity-copy">
            <h2 id={headingId} className="dx-search-brief__title">
              {actionTarget.name}
            </h2>
            <div className="dx-search-brief__standing">
              <span>{selectionLabel}</span>
              <span>{summary.evidenceBadgeLabel}</span>
            </div>
            <p className="dx-search-brief__host">{hostLabel(actionTarget.url)}</p>
          </div>
        </div>

        {!hasCurrentTerms ? (
          <>
            <p className="dx-search-brief__why">{summary.why}</p>

            {summary.safetyWarning ? (
              <p className="dx-search-safety-note" role="note">
                {summary.safetyWarning}
              </p>
            ) : null}

            <dl className="dx-search-brief__facts">
              <div>
                <dt>Price</dt>
                <dd>{price}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{summary.qualityScore === null ? 'Not scored' : `${summary.qualityScore}/100`}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{summary.networkLabel}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{summary.evidenceLabel}</dd>
              </div>
            </dl>

            <div className="dx-search-brief__actions">
              <button
                type="button"
                className="dx-search-primary-action"
                onClick={() => onUseService(actionTarget)}
                aria-busy={isChecking}
                aria-label={`${resourceAction.label} for ${actionTarget.name}`}
                disabled={actionDisabled}
              >
                {actionLabel}
                <span aria-hidden>{price}</span>
              </button>
            </div>

            <p
              className={`dx-search-brief__action-note${relevantCheckState.status === 'error' ? ' dx-search-brief__action-note--error' : ''}`}
              aria-live="polite"
            >
              {actionNote}
            </p>
          </>
        ) : null}
      </div>

      {!hasCurrentTerms && alternatives.length > 0 ? (
        <div className="dx-search-brief__alternatives">
          <p className="dx-search-brief__alternatives-title">Other results</p>
          <ul className="dx-search-brief__alternative-list">
            {alternatives.map((resource) => {
              const alternativeSummary = summarizeSearchResource(resource);
              const status = resource === recommended
                ? recommendationKind === 'related' ? 'Closest match' : 'Recommended'
                : resource.tier === 'related' ? 'Related' : null;

              return (
                <li key={`${resource.resourceId || resource.url}:${resources.indexOf(resource)}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(resource)}
                    disabled={interactionLocked}
                  >
                    <SearchIdentityIcon resource={resource} size={32} />
                    <span className="dx-search-brief__alternative-copy">
                      <strong>{resource.name}</strong>
                      <small>{status ? `${status} · ` : ''}{hostLabel(resource.url)}</small>
                    </span>
                    <span className="dx-search-brief__alternative-evidence">
                      <strong>{listedPrice(resource)}</strong>
                      <small>{alternativeSummary.qualityScore === null ? 'Unscored' : `${alternativeSummary.qualityScore}/100`}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!canCompare && decision.hiddenAlternativeCount > 0 ? (
            <button
              type="button"
              className="dx-search-brief__show-more"
              onClick={() => setShowAllAlternatives(true)}
              disabled={interactionLocked}
            >
              Show {decision.hiddenAlternativeCount} more
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
