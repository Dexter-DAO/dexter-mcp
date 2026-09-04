import { useEffect, useId, useState } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import {
  buildSearchDecision,
  summarizeSearchResource,
} from './SearchDecisionBrief.model';
import {
  compactEvidenceLabel,
  formatListedPrice,
  merchantLabel,
} from './utils';

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

function visibleActionLabel(
  resource: SearchResource,
  status: SearchDecisionBriefCheckState['status'],
  unavailableInHost: boolean,
): string {
  const action = summarizeSearchResource(resource).action;
  if (action.disabled) return action.label;
  if (unavailableInHost) return 'Unavailable';
  if (status === 'checking') return 'Opening…';
  if (status === 'details_sent') return 'Opened';
  if (status === 'error') return 'Try again';
  return action.kind === 'provide_details' ? 'Add details' : 'Check terms';
}

function evidenceLabel(resource: SearchResource): string {
  return compactEvidenceLabel(resource);
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
        <h2 id={headingId}>No matching services</h2>
        <p>Try describing the result you need another way.</p>
      </section>
    );
  }

  const { actionTarget, alternatives } = decision;
  const actionTargetOrdinal = resources.indexOf(actionTarget) + 1;
  const summary = summarizeSearchResource(actionTarget);
  const action = summary.action;
  const currentState = !checkState.resultOrdinal || checkState.resultOrdinal === actionTargetOrdinal
    ? checkState
    : { status: 'idle' as const };
  const unavailableInHost = !action.disabled && !(
    action.kind === 'provide_details'
      ? canProvideDetailsInChat
      : action.kind === 'check_live_terms'
        ? canCheckCurrentTerms
        : false
  );
  const actionDisabled = interactionLocked
    || currentState.status === 'checking'
    || currentState.status === 'details_sent'
    || currentState.status === 'checked'
    || action.disabled
    || unavailableInHost;
  const stateMessage = currentState.status === 'error'
    ? currentState.message
    : currentState.status === 'checking'
      ? currentState.message || 'Opening in chat…'
      : currentState.status === 'details_sent'
        ? currentState.message || 'Continue in chat.'
        : null;

  return (
    <section
      className={`dx-search-brief dx-search-brief--results${compact ? ' dx-search-brief--compact' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="dx-search-result-primary">
        <div className="dx-search-result-primary__identity">
          <SearchIdentityIcon resource={actionTarget} size={compact ? 42 : 48} />
          <div className="dx-search-result-primary__copy">
            <p className="dx-search-result-primary__merchant">{merchantLabel(actionTarget)}</p>
            <h2 id={headingId} className="dx-search-brief__title">{actionTarget.name}</h2>
          </div>
          <strong className="dx-search-result-primary__price">{listedPrice(actionTarget)}</strong>
        </div>

        <p className="dx-search-brief__why">{summary.why}</p>

        {summary.safetyWarning ? (
          <p className="dx-search-safety-note" role="note">{summary.safetyWarning}</p>
        ) : null}

        <div className="dx-search-result-primary__footer">
          <span className="dx-search-result-evidence" data-basis={summary.evidenceBasis || 'none'}>
            <span aria-hidden="true" />
            {evidenceLabel(actionTarget)}
          </span>
          {currentState.status !== 'checked' ? (
            <button
              type="button"
              className="dx-search-primary-action"
              onClick={() => onUseService(actionTarget)}
              aria-busy={currentState.status === 'checking'}
              aria-label={`${action.label} for ${actionTarget.name}`}
              disabled={actionDisabled}
            >
              {visibleActionLabel(actionTarget, currentState.status, unavailableInHost)}
            </button>
          ) : null}
        </div>

        {stateMessage ? (
          <p
            className={`dx-search-result-primary__state${currentState.status === 'error' ? ' dx-search-result-primary__state--error' : ''}`}
            aria-live="polite"
          >
            {stateMessage}
          </p>
        ) : null}
      </div>

      {alternatives.length > 0 ? (
        <div className="dx-search-result-alternatives">
          <ul aria-label="Other matches">
            {alternatives.map((resource) => (
              <li key={`${resource.resourceId || resource.url}:${resources.indexOf(resource)}`}>
                <button
                  type="button"
                  onClick={() => onSelect(resource)}
                  disabled={interactionLocked}
                >
                  <SearchIdentityIcon resource={resource} size={32} />
                  <span className="dx-search-result-alternatives__copy">
                    <small>{merchantLabel(resource)}</small>
                    <strong>{resource.name}</strong>
                  </span>
                  <span className="dx-search-result-alternatives__price">{listedPrice(resource)}</span>
                </button>
              </li>
            ))}
          </ul>

          {decision.hiddenAlternativeCount > 0 ? (
            canCompare ? (
              <button
                type="button"
                className="dx-search-result-alternatives__more"
                onClick={onCompareAll}
                aria-controls={comparisonId}
                aria-expanded={comparisonOpen}
                disabled={interactionLocked}
              >
                Compare all {resources.length}
              </button>
            ) : (
              <button
                type="button"
                className="dx-search-result-alternatives__more"
                onClick={() => setShowAllAlternatives(true)}
                disabled={interactionLocked}
              >
                Show {decision.hiddenAlternativeCount} more
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
