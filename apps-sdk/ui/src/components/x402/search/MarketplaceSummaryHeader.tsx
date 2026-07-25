import { X402gleLockup } from '../../brand/X402gleLockup';

/**
 * Marketplace header — x402gle composite lockup + meta line.
 *
 * Search is an x402gle product, not a bare-Dexter one — the header now
 * uses the full "x402gle by Dexter" lockup (multi-color wordmark plus
 * the small "by [dexter glyph + wordmark]" tagline beneath). When this
 * widget was first built, x402gle didn't exist yet and the bare Dexter
 * wordmark was the right call; that's no longer true.
 *
 * The on-widget search input was removed: agents communicate via chat,
 * nobody types into the widget input, and on mobile it ate ~140px of
 * vertical space above the actual results. The toolbar keeps one calm
 * reviewed-count label and the expand affordance.
 */
export function MarketplaceSummaryHeader({
  resultCount,
  rerankApplied = false,
  isFullscreen,
  canToggleFullscreen,
  onToggleFullscreen,
}: {
  resultCount: number;
  rerankApplied?: boolean;
  isFullscreen: boolean;
  canToggleFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const tierLabel =
    `${resultCount.toLocaleString()} service${resultCount !== 1 ? 's' : ''} reviewed`;
  return (
    <div className="dx-search-header">
      <div className="dx-search-header__brand">
        <X402gleLockup size="sm" showBeta />
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
        {canToggleFullscreen && (
          <button
            type="button"
            className="dx-search-header__expand"
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? 'Close comparison' : 'Compare'}
          </button>
        )}
      </div>
    </div>
  );
}
