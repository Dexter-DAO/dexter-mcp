import { fmtUsd } from './format';

/**
 * The money composition: a proportional bar (own funds / open credit / at-work)
 * plus a legend. Segments and legend rows appear only when their value is > 0,
 * so a cash-only wallet reads clean instead of showing empty categories.
 */
export function CompositionBar({ own, credit, atWork, earnPct, onOpen }: {
  own: number;
  credit: number;
  atWork: number;
  /** Live attested rate in percent; null = no fresh number, show no rate. */
  earnPct: number | null;
  /** When set, the bar is tappable (opens the credit chit sheet) — the
   *  hatched segment is the learned word for credit, so the bar itself is
   *  the affordance; no fifth action button (calm-surface law). */
  onOpen?: () => void;
}) {
  const Root: any = onOpen ? 'button' : 'div';
  return (
    <Root className={`dxw-comp${onOpen ? ' dxw-comp-tap' : ''}`} {...(onOpen ? { onClick: onOpen, type: 'button' } : {})}>
      <div className="dxw-comp-bar">
        <div className="dxw-seg dxw-seg-own" style={{ flex: `${Math.max(own, 0.001)} 1 0` }} />
        {credit > 0 ? <div className="dxw-seg dxw-seg-credit" style={{ flex: `${credit} 1 0` }} /> : null}
        {atWork > 0 ? <div className="dxw-seg dxw-seg-work" style={{ flex: `${atWork} 1 0` }} /> : null}
      </div>
      <div className="dxw-legend">
        <div className="dxw-row">
          <span className="dxw-cluster">
            <span className="dxw-dot dxw-dot-own" />Yours&nbsp;<span className="dxw-amt">{fmtUsd(own)}</span>
          </span>
          {credit > 0 ? (
            <span className="dxw-cluster">
              <span className="dxw-dot dxw-dot-credit" />Credit&nbsp;<span className="dxw-amt">{fmtUsd(credit)}</span>
            </span>
          ) : null}
        </div>
        {atWork > 0 ? (
          <div className="dxw-row">
            <span className="dxw-cluster"><span className="dxw-dot dxw-dot-work" />{earnPct != null ? `At work, earning ${earnPct}%` : 'At work, earning'}</span>
            <span className="dxw-amt">{fmtUsd(atWork)}</span>
          </div>
        ) : null}
      </div>
    </Root>
  );
}
