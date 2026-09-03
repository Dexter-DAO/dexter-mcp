import type { WalletActivityItem } from '../x402';
import { fmtExactSignedUsd, fmtSignedUsd, relativeTime } from './format';

/** One recorded money event. Payment amounts are negative (money left). */
export function ActivityRow({ item }: { item: WalletActivityItem }) {
  const sub =
    item.kind === 'payment' ? `${relativeTime(item.at)} · paid API call`
    : relativeTime(item.at);
  return (
    <div className="dxw-act-row">
      <div>
        <div className="dxw-act-main">{item.label}</div>
        <div className="dxw-act-sub">{sub}</div>
      </div>
      <span
        className="dxw-act-amt dxw-mono"
        title={`Exact amount: ${fmtExactSignedUsd(item.amountUsd)}`}
      >
        <span aria-hidden="true">{fmtSignedUsd(item.amountUsd)}</span>
        <span className="sr-only">Exact amount: {fmtExactSignedUsd(item.amountUsd)}</span>
      </span>
    </div>
  );
}
