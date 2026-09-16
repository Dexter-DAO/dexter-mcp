import { useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { ActivityRow } from './ActivityRow';
import { Pager } from './Pager';
import type { ActivityPage } from './activityModel';

export function ActivitySheet({ initialPage, onClose, isFullscreen, condensed, onLoad, onOpenExternal }: {
  initialPage: ActivityPage | null;
  onClose: () => void;
  isFullscreen: boolean;
  condensed: boolean;
  onLoad: ((cursor?: string) => Promise<ActivityPage | null>) | null;
  onOpenExternal: (url: string) => void;
}) {
  const [snapshot, setSnapshot] = useState(initialPage);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const load = async (older = false) => {
    if (!onLoad) return;
    const request = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const next = await onLoad(older ? snapshot?.nextCursor ?? undefined : undefined);
      if (request !== generation.current) return;
      if (!next) { setError(true); return; }
      setSnapshot((prior) => {
        if (!older || !prior) return next;
        const seen = new Set(prior.items.map((item) => item.id));
        return {
          ...next,
          items: [...prior.items, ...next.items.filter((item) => !seen.has(item.id))],
          coverage: {
            ...next.coverage,
            state: prior.coverage.state === 'partial' || next.coverage.state === 'partial' ? 'partial' : 'complete',
          },
        };
      });
      if (!older) setPage(0);
    } catch { if (request === generation.current) setError(true); }
    finally { if (request === generation.current) setLoading(false); }
  };
  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, []);
  const items = snapshot?.items ?? [];
  const pageSize = isFullscreen ? 10 : condensed ? 2 : 5;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const visibleItems = items.slice(pageStart, pageStart + pageSize);
  const hasFailedSource = snapshot?.coverage.sources.some((source) => source.reason === 'read_failed');
  const staleTransfers = snapshot?.coverage.sources.some((source) => source.category === 'transfers' && source.state !== 'available');
  return (
    <Sheet title="Activity" onClose={onClose} actions={onLoad ? <button className="dxw-activity-refresh-icon" type="button" aria-label="Refresh activity" title="Refresh activity" disabled={loading} onClick={() => void load()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1a8.3 8.3 0 0 1 13.6 4.1M17.9 17.9A8.3 8.3 0 0 1 4.3 13.8" /></svg></button> : null}>
      {loading ? <p className="dxw-activity-notice" role="status">Loading activity…</p> : null}
      {error || (!snapshot && !loading) ? <p className="dxw-activity-notice" role="status">Activity could not be loaded.{snapshot ? ' Previously loaded entries are shown.' : ''}</p> : null}
      {snapshot && !items.length ? <div className="dxw-empty">No recorded activity in this page.</div> : null}
      <div className="dxw-act-list">
        {visibleItems.map((item) => <ActivityRow key={item.id} item={item} onOpenExternal={onOpenExternal} />)}
      </div>
      {items.length ? <Pager label="Activity pages" page={safePage} pageCount={pageCount} start={pageStart + 1} end={pageStart + visibleItems.length} total={items.length} onPage={setPage} /> : null}
      {snapshot?.nextCursor && safePage === pageCount - 1 && onLoad ? <button className="dxw-activity-refresh" type="button" disabled={loading} onClick={() => void load(true)}>Load older activity</button> : null}
      {snapshot?.coverage.state === 'partial' ? <p className="dxw-activity-notice">{hasFailedSource ? 'Some activity could not be refreshed.' : staleTransfers ? 'Transfers may be delayed.' : 'Transfers include USDC. Other token transfers may be missing.'}</p> : null}
    </Sheet>
  );
}
