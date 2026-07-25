import { Sheet } from './Sheet';
import { fmtUsd } from './format';

/*
 * The credit chit as a sheet — the blessed #115 design in the widget's own
 * language (design-once source: dexter-thesis/design/money-credit-chit-
 * 2026-07-24/credit-chit-b2-widget-language.html). Read-only today: line and
 * drawn are live data; the REPAY button and per-draw provenance arrive WITH
 * the draw build (#113) — nothing can be owed until draws exist, so this
 * ships the state-one shape and grows the state-two rows when they're real.
 *
 * Display law (Branch, Jul 24): the HEADLINE is spending power and never
 * negative; the debt truth lives HERE — balance · owed · net, one gesture
 * down, visible never hidden. The rate line deliberately waits for the draw
 * build: quoting a price for an action that cannot happen yet is a forecast,
 * not a fact (b2 design call, Jul 25).
 */
export function CreditSheet({ lineUsd, drawnUsd, cashUsd, onClose }: {
  lineUsd: number;
  drawnUsd: number;
  cashUsd: number;
  onClose: () => void;
}) {
  const openUsd = Math.max(0, lineUsd - drawnUsd);
  const drawnPct = lineUsd > 0 ? Math.min(100, (drawnUsd / lineUsd) * 100) : 0;
  const netUsd = cashUsd - drawnUsd;
  return (
    <Sheet title="Credit" onClose={onClose}>
      <div className="dxw-chit-head">
        <span className="dxw-chit-line dxw-mono">{fmtUsd(lineUsd)}</span>
        <span className="dxw-chit-line-label">line</span>
      </div>
      <div className="dxw-chit-bar">
        {drawnUsd > 0 ? <div className="dxw-chit-drawn" style={{ width: `${drawnPct}%` }} /> : null}
        <div className="dxw-chit-open" />
      </div>
      <div className="dxw-chit-legend">
        <span>drawn <b className="dxw-mono">{fmtUsd(drawnUsd)}</b></span>
        <span>open <b className="dxw-mono">{fmtUsd(openUsd)}</b></span>
      </div>
      <p className="dxw-chit-body">
        When your balance runs short, purchases can use this — and money that
        arrives later pays it back first.
      </p>
      {drawnUsd > 0 ? (
        <p className="dxw-chit-owed">
          You owe <b className="dxw-mono">{fmtUsd(drawnUsd)}</b> — money arriving repays it first.
        </p>
      ) : null}
      <div className="dxw-chit-net">
        <span>balance <b className="dxw-mono">{fmtUsd(cashUsd)}</b></span>
        <span className={drawnUsd > 0 ? 'dxw-chit-neg' : ''}>owed <b className="dxw-mono">{fmtUsd(drawnUsd)}</b></span>
        <span className={netUsd < 0 ? 'dxw-chit-neg' : ''}>net <b className="dxw-mono">{netUsd < 0 ? `−${fmtUsd(-netUsd)}` : `+${fmtUsd(netUsd)}`}</b></span>
      </div>
      <div className="dxw-chit-meta">{drawnUsd > 0 ? 'Money arriving repays first' : 'Nothing owed'}</div>
    </Sheet>
  );
}
