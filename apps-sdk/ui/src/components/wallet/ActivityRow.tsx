import type { WalletActivityItem } from '../x402';
import { fmtSignedUsd, relativeTime } from './format';

/** One recorded money event. Payment amounts are negative (money left). */
export function ActivityRow({ item }: { item: WalletActivityItem }) {
  const sub =
    item.kind === 'payment' ? `${relativeTime(item.at)} · paid API call`
    : relativeTime(item.at);
  return (
    <div className="dxw-act-row">
      <span>
        <div className="dxw-act-main">{item.label}</div>
        <div className="dxw-act-sub">{sub}</div>
      </span>
      <span className="dxw-act-amt dxw-mono">{fmtSignedUsd(item.amountUsd)}</span>
    </div>
  );
}
