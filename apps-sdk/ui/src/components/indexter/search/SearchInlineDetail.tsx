import type { SearchResource } from './types';
import { SearchIdentityIcon } from './SearchIdentityIcon';
import { summarizeSearchResource } from './SearchDecisionBrief.model';
import { formatListedPrice, hostLabel } from './utils';

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
        <button type="button" onClick={onBack}>Back to comparison</button>
        <span>Result {ordinal} of {resultCount}</span>
      </div>

      <div className="dx-search-inline-detail__identity">
        <SearchIdentityIcon resource={resource} size={40} />
        <div>
          <h2>{resource.name}</h2>
          <p title={resource.url}>{hostLabel(resource.url)}</p>
        </div>
        <strong>{price}</strong>
      </div>

      {resource.description ? (
        <p className="dx-search-inline-detail__description" title={resource.description}>
          {resource.description}
        </p>
      ) : null}

      <p className="dx-search-inline-detail__why" title={summary.why}>
        {summary.why}
      </p>

      {summary.safetyWarning ? (
        <p className="dx-search-inline-detail__safety" role="note" title={summary.safetyWarning}>
          {summary.safetyWarning}
        </p>
      ) : null}

      <dl className="dx-search-inline-detail__facts">
        <div>
          <dt>Quality</dt>
          <dd>{summary.qualityScore === null ? 'Unscored' : `${summary.qualityScore}/100`}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{summary.networkLabel}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{summary.evidenceLabel}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>{action.label}</dd>
        </div>
      </dl>

      <div className="dx-search-inline-detail__action">
        <p>{action.helperText}</p>
        <button
          type="button"
          className="dx-search-primary-action"
          aria-label={`${action.label} for ${resource.name}`}
          disabled={interactionLocked || !actionAvailable}
          onClick={() => onUseService?.(resource)}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
