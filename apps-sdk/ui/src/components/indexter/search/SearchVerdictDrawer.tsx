import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import {
  compactEvidenceLabel,
  formatListedPrice,
  merchantLabel,
} from './utils';

interface Props {
  resource: SearchResource;
  onClose: () => Promise<void> | void;
  onUseService?: (resource: SearchResource) => Promise<void>;
}

export function SearchVerdictDrawer({ resource, onClose, onUseService }: Props) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const summary = summarizeSearchResource(resource);
  const action = summary.action;
  const description = resource.description.trim();
  const detailSummary = description || summary.why.trim();
  const showRequiredInputs = summary.requiredInputsLabel !== 'None';
  const evidence = compactEvidenceLabel(resource);
  const price = formatListedPrice(
    summary.priceLabel,
    summary.priceUsdc,
    summary.priceFallback,
  );

  async function handleUseService(event: MouseEvent) {
    event.stopPropagation();
    if (!onUseService || action.disabled) return;
    setCheckError(null);
    setChecking(true);
    try {
      await onUseService(resource);
    } catch {
      setCheckError("Couldn't open this in chat. Try again.");
    } finally {
      setChecking(false);
    }
  }

  const actionLabel = action.disabled
    ? action.label
    : !onUseService
      ? 'Unavailable'
      : checking
        ? 'Opening…'
        : action.kind === 'provide_details'
          ? 'Add details'
          : 'Check terms';

  return (
    <div className="dx-search-drawer">
      <div className="dx-search-drawer__header">
        <div className="dx-search-drawer__identity">
          <SearchIdentityIcon resource={resource} size={44} />
          <div className="dx-search-drawer__identity-text">
            <p className="dx-search-drawer__merchant">{merchantLabel(resource)}</p>
            <h3 className="dx-search-drawer__name">{resource.name}</h3>
          </div>
          <strong className="dx-search-drawer__price">{price}</strong>
        </div>
        <button
          type="button"
          className="dx-search-drawer__close"
          onClick={() => void onClose()}
          aria-label={`Close ${resource.name} details`}
        >
          Close
        </button>
      </div>

      <p className="dx-search-drawer__why">{detailSummary}</p>

      {showRequiredInputs ? (
        <dl className="dx-search-drawer__request">
          <div>
            <dt>Needs</dt>
            <dd>{summary.requiredInputsLabel}</dd>
          </div>
        </dl>
      ) : null}

      {summary.safetyWarning ? (
        <p className="dx-search-safety-note" role="note">{summary.safetyWarning}</p>
      ) : null}

      <div className="dx-search-drawer__footer">
        {evidence ? (
          <span className="dx-search-result-evidence" data-basis={summary.evidenceBasis || 'none'}>
            <span aria-hidden="true" />
            {evidence}
          </span>
        ) : null}
        <button
          type="button"
          className="dx-search-primary-action"
          onClick={handleUseService}
          disabled={checking || action.disabled || !onUseService}
          aria-busy={checking}
          aria-label={`${action.label} for ${resource.name} from ${merchantLabel(resource)}`}
        >
          {actionLabel}
        </button>
      </div>

      {checkError ? (
        <p className="dx-search-drawer__action-error" role="alert">{checkError}</p>
      ) : null}
    </div>
  );
}
