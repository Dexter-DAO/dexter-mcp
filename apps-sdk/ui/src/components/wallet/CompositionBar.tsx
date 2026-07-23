import { fmtUsd } from './format';

/**
 * The money composition: a proportional bar (own funds / open credit / at-work)
 * plus a legend. Segments and legend rows appear only when their value is > 0,
 * so a cash-only wallet reads clean instead of showing empty categories.
 */
export function CompositionBar({ own, credit, atWork, earnPct }: {
  own: number;
  credit: number;
  atWork: number;
  earnPct: number;
}) {
  return (
    <div className="dxw-comp">
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
            <span className="dxw-cluster"><span className="dxw-dot dxw-dot-work" />At work, earning {earnPct}%</span>
            <span className="dxw-amt">{fmtUsd(atWork)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
