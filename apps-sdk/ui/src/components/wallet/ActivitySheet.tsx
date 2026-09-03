import { useState } from 'react';
import { Sheet } from './Sheet';
import { ActivityRow } from './ActivityRow';
import { Pager } from './Pager';
import type { WalletActivityItem } from '../x402';

/** The wallet's recorded money events — real data from the /activity stream. */
export function ActivitySheet({ items, onClose, isFullscreen, condensed }: {
  items: WalletActivityItem[];
  onClose: () => void;
  isFullscreen: boolean;
  condensed: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = isFullscreen ? Math.max(1, items.length) : condensed ? 2 : 5;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const visibleItems = items.slice(pageStart, pageStart + pageSize);

  return (
    <Sheet title="Activity" onClose={onClose}>
      {items.length === 0 ? (
        <div className="dxw-empty">No activity yet. Payments and earning moves show up here.</div>
      ) : (
        <div className="dxw-act-list">
          {visibleItems.map((item, i) => (
            <ActivityRow key={`${item.at}-${pageStart + i}`} item={item} />
          ))}
        </div>
      )}
      <Pager
        label="Activity pages"
        page={safePage}
        pageCount={pageCount}
        start={items.length === 0 ? 0 : pageStart + 1}
        end={pageStart + visibleItems.length}
        total={items.length}
        onPage={setPage}
      />
    </Sheet>
  );
}
