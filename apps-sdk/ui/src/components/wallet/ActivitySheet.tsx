import { Sheet } from './Sheet';
import { ActivityRow } from './ActivityRow';
import type { WalletActivityItem } from '../x402';

/** The wallet's recorded money events — real data from the /activity stream. */
export function ActivitySheet({ items, onClose }: {
  items: WalletActivityItem[];
  onClose: () => void;
}) {
  return (
    <Sheet title="Activity" onClose={onClose}>
      {items.length === 0 ? (
        <div className="dxw-empty">No activity yet. Payments and earning moves show up here.</div>
      ) : (
        <div className="dxw-act-list">
          {items.map((item, i) => <ActivityRow key={`${item.at}-${i}`} item={item} />)}
        </div>
      )}
    </Sheet>
  );
}
