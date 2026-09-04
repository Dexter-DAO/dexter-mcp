import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import {
  compactEvidenceLabel,
  formatListedPrice,
  merchantLabel,
} from './utils';

type Props = {
  resource: SearchResource;
  ordinal: number;
  resultCount: number;
  onBack: () => void;
  onUseService?: (resource: SearchResource) => void;
  interactionLocked?: boolean;
};

export function SearchInlineDetail({
  resource,
  ordinal,
  resultCount,
  onBack,
  onUseService,
  interactionLocked = false,
}: Props) {
  const summary = summarizeSearchResource(resource);
  const action = summary.action;
  const description = resource.description.trim();
  const showDescription = description.length > 0 && description !== summary.why.trim();
  const showRequiredInputs = summary.requiredInputsLabel !== 'None';
  const price = formatListedPrice(
    summary.priceLabel,
    summary.priceUsdc,
    summary.priceFallback,
  );
  const actionAvailable = !action.disabled && Boolean(onUseService);
  const actionLabel = action.disabled
    ? action.label
    : actionAvailable
      ? action.label
      : 'Unavailable in this host';

  return (
    <div className="dx-search-inline-detail">
      <div className="dx-search-inline-detail__nav">
        <button type="button" onClick={onBack} aria-label="Back to comparison">Back</button>
        <span>{ordinal} of {resultCount}</span>
      </div>

      <div className="dx-search-inline-detail__identity">
        <SearchIdentityIcon resource={resource} size={40} />
        <div>
          <p>{merchantLabel(resource)}</p>
          <h2>{resource.name}</h2>
        </div>
        <strong>{price}</strong>
      </div>

      <p className="dx-search-inline-detail__why" title={summary.why}>
        {summary.why}
      </p>

      {showDescription ? (
        <p className="dx-search-inline-detail__description" title={description}>
          {description}
        </p>
      ) : null}

      {showRequiredInputs ? (
        <p className="dx-search-inline-detail__needs">
          <span>Needs</span> {summary.requiredInputsLabel}
        </p>
      ) : null}

      {summary.safetyWarning ? (
        <p className="dx-search-inline-detail__safety" role="note" title={summary.safetyWarning}>
          {summary.safetyWarning}
        </p>
      ) : null}

      <div className="dx-search-inline-detail__action">
        <span className="dx-search-result-evidence" data-basis={summary.evidenceBasis || 'none'}>
          <span aria-hidden="true" />
          {compactEvidenceLabel(resource)}
        </span>
        <button
          type="button"
          className="dx-search-primary-action"
          aria-label={`${action.label} for ${resource.name}`}
          disabled={interactionLocked || !actionAvailable}
          onClick={() => onUseService?.(resource)}
        >
          {action.kind === 'provide_details' && actionAvailable
            ? 'Add details'
            : action.kind === 'check_live_terms' && actionAvailable
              ? 'Check terms'
              : actionLabel}
        </button>
      </div>
    </div>
  );
}
