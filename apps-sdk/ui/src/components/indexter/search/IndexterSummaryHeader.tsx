import { IndexterLockup } from '../../brand/IndexterLockup';

/**
 * Indexter owns discovery. The renderer uses the canonical Indexter asset
 * while the host remains responsible for its own OpenDexter tool chrome.
 */
export function IndexterSummaryHeader({
  resultCount,
  rerankApplied = false,
  comparisonOpen,
  comparisonId,
  showViewControl,
  onViewControl,
}: {
  resultCount: number;
  rerankApplied?: boolean;
  comparisonOpen: boolean;
  comparisonId: string;
  showViewControl: boolean;
  onViewControl: () => void;
}) {
  const tierLabel =
    `${resultCount.toLocaleString()} service${resultCount !== 1 ? 's' : ''} reviewed`;
  return (
    <div className="dx-search-header">
      <div className="dx-search-header__brand">
        <IndexterLockup />
      </div>

      <div className="dx-search-header__meta">
        <span className="dx-search-header__count">{tierLabel}</span>
        {rerankApplied && (
          <span
            className="sr-only"
          >
            Ranking refined for this request
          </span>
        )}
        {showViewControl && (
          <button
            type="button"
            className="dx-search-header__expand"
            onClick={onViewControl}
            aria-controls={comparisonId}
            aria-expanded={comparisonOpen}
          >
            {comparisonOpen
              ? 'Close comparison'
              : 'Compare'}
          </button>
        )}
      </div>
    </div>
  );
}
