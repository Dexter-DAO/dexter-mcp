import { fmtExactUsd, fmtUsd } from './format';
import type { Ref } from 'react';

/**
 * The money composition: a proportional bar (own funds / open credit / at-work)
 * plus a legend. Segments and legend rows appear only when their value is > 0,
 * so a cash-only wallet reads clean instead of showing empty categories.
 */
export function CompositionBar({ own, credit, atWork, earnPct, onOpen, triggerRef }: {
  own: number;
  credit: number;
  atWork: number;
  /** Live attested rate in percent; null = no fresh number, show no rate. */
  earnPct: number | null;
  /** When set, the bar is tappable (opens the credit chit sheet) — the
   *  hatched segment is the learned word for credit, so the bar itself is
   *  the affordance; no fifth action button (calm-surface law). */
  onOpen?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const Root: any = onOpen ? 'button' : 'div';
  const hasOwn = own > 0;
  const hasCredit = credit > 0;
  const hasAtWork = atWork > 0;
  const isEmpty = !hasOwn && !hasCredit && !hasAtWork;
  const exactComposition = `Yours ${fmtExactUsd(own)}, credit ${fmtExactUsd(credit)}, at work ${fmtExactUsd(atWork)}.`;
  return (
    <Root
      className={`dxw-comp${onOpen ? ' dxw-comp-tap' : ''}`}
      role={onOpen ? undefined : 'group'}
      aria-label={onOpen
        ? `Review balance composition and credit details. ${exactComposition}`
        : `Balance composition. ${exactComposition}`}
      {...(onOpen ? {
        onClick: onOpen,
        ref: triggerRef,
        type: 'button',
      } : {})}
    >
      <div
        className={`dxw-comp-bar${isEmpty ? ' dxw-comp-bar--empty' : ''}`}
        aria-label={isEmpty ? 'No money in this composition yet' : undefined}
      >
        {hasOwn ? <div className="dxw-seg dxw-seg-own" style={{ flex: `${own} 1 0` }} /> : null}
        {hasCredit ? <div className="dxw-seg dxw-seg-credit" style={{ flex: `${credit} 1 0` }} /> : null}
        {hasAtWork ? <div className="dxw-seg dxw-seg-work" style={{ flex: `${atWork} 1 0` }} /> : null}
      </div>
      <div className="dxw-legend">
        <div className="dxw-row">
          <span className="dxw-cluster">
            <span className="dxw-dot dxw-dot-own" />Yours&nbsp;<span className="dxw-amt">{fmtUsd(own)}</span>
          </span>
          {hasCredit ? (
            <span className="dxw-cluster">
              <span className="dxw-dot dxw-dot-credit" />Credit&nbsp;<span className="dxw-amt">{fmtUsd(credit)}</span>
            </span>
          ) : null}
        </div>
        {hasAtWork ? (
          <div className="dxw-row">
            <span className="dxw-cluster"><span className="dxw-dot dxw-dot-work" />{earnPct != null ? `At work, earning ${earnPct}%` : 'At work, earning'}</span>
            <span className="dxw-amt">{fmtUsd(atWork)}</span>
          </div>
        ) : null}
      </div>
    </Root>
  );
}
