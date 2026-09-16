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
  return (
    <Sheet title="Activity" onClose={onClose}>
      {onLoad ? <button className="dxw-activity-refresh" type="button" disabled={loading} onClick={() => void load()}>Refresh</button> : null}
      {loading ? <p className="dxw-activity-notice" role="status">Loading activity…</p> : null}
      {error || (!snapshot && !loading) ? <p className="dxw-activity-notice" role="status">Activity could not be loaded.{snapshot ? ' Previously loaded entries are shown.' : ''}</p> : null}
      {snapshot?.coverage.state === 'partial' ? <p className="dxw-activity-notice">Some activity sources are unavailable. This list may be incomplete.</p> : null}
      {snapshot && !items.length ? <div className="dxw-empty">No recorded activity in this page.</div> : null}
      <div className="dxw-act-list">
        {visibleItems.map((item) => <ActivityRow key={item.id} item={item} onOpenExternal={onOpenExternal} />)}
      </div>
      {items.length ? <Pager label="Activity pages" page={safePage} pageCount={pageCount} start={pageStart + 1} end={pageStart + visibleItems.length} total={items.length} onPage={setPage} /> : null}
      {snapshot?.nextCursor && safePage === pageCount - 1 && onLoad ? <button className="dxw-activity-refresh" type="button" disabled={loading} onClick={() => void load(true)}>Load older activity</button> : null}
    </Sheet>
  );
}
