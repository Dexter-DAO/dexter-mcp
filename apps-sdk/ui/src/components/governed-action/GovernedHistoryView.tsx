import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  useAdaptiveMaxHeight,
  useAdaptiveOpenExternal,
  useAdaptiveTheme,
  useToolOutput,
  useToolResponseMetadata,
} from '../../sdk';
import { WidgetEmpty, WidgetError, WidgetShell } from '../widget';
import { GovernedActionDetail } from './GovernedActionView';
import {
  normalizeGovernedHistory,
  type GovernedActionViewModel,
} from './governed-action-model';

function formatActivityTime(model: GovernedActionViewModel): string | null {
  const value = model.lastActivityAt ?? model.createdAt;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function HistoryLoading({ maxHeight }: { maxHeight: number | null }) {
  return (
    <WidgetShell
      width="full"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <div className="dx-history dx-history--loading" role="status" aria-live="polite" aria-label="Loading wallet history">
        <span className="dx-action__skeleton dx-history__skeleton-title" />
        <span className="dx-action__skeleton dx-history__skeleton-copy" />
        <div className="dx-history__skeleton-list">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} className="dx-action__skeleton" />
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}

export function GovernedHistoryView() {
  const output = useToolOutput<unknown>();
  const responseMetadata = useToolResponseMetadata<Record<string, unknown>>();
  const renderOutput = output
    ?? responseMetadata?.['dexter/governedWidgetResult']
    ?? null;
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const openExternal = useAdaptiveOpenExternal();
  const model = useMemo(() => normalizeGovernedHistory(renderOutput), [renderOutput]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const returnFocusIndex = useRef<number | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    returnFocusIndex.current = null;
    setSelectedIndex(null);
  }, [renderOutput]);

  useLayoutEffect(() => {
    if (selectedIndex !== null || returnFocusIndex.current === null) return;
    const target = rowRefs.current[returnFocusIndex.current];
    if (target?.isConnected) target.focus();
    returnFocusIndex.current = null;
  }, [selectedIndex]);

  if (renderOutput === null) return <HistoryLoading maxHeight={maxHeight} />;

  const selected = model && selectedIndex !== null
    ? model.items[selectedIndex] ?? null
    : null;

  return (
    <WidgetShell
      width="full"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {selected ? (
        <GovernedActionDetail
          model={selected}
          openExternal={openExternal}
          onBack={() => setSelectedIndex(null)}
        />
      ) : !model ? (
        <WidgetError
          title="Wallet history unavailable"
          description="Ask OpenDexter to read wallet history again. No action was started."
        />
      ) : model.items.length === 0 ? (
        <section className="dx-history">
          <header className="dx-history__header">
            <h2>Wallet history</h2>
          </header>
          <WidgetEmpty
            title="No governed actions yet"
            description="Send, Buy, and Sell receipts will appear here."
          />
        </section>
      ) : (
        <section className="dx-history" aria-labelledby="dx-history-title">
          <header className="dx-history__header">
            <h2 id="dx-history-title">Wallet history</h2>
            <p>Send, Buy, and Sell receipts from this wallet.</p>
          </header>

          <ul className="dx-history__list">
            {model.items.map((item, index) => {
              const time = formatActivityTime(item);
              return (
                <li key={`${item.intentId ?? item.requestId ?? 'action'}:${index}`}>
                  <button
                    type="button"
                    className="dx-history__row"
                    ref={(element) => { rowRefs.current[index] = element; }}
                    onClick={() => {
                      returnFocusIndex.current = index;
                      setSelectedIndex(index);
                    }}
                    aria-label={`Open details for ${item.headline}`}
                  >
                    <span className="dx-history__row-copy">
                      <strong>{item.headline}</strong>
                      <span>
                        {time ? <time dateTime={item.lastActivityAt ?? item.createdAt ?? undefined}>{time}</time> : null}
                        {time && item.actor !== 'unknown' ? ' / ' : null}
                        {item.actor !== 'unknown' ? item.actor === 'agent' ? 'Agent' : 'Owner' : null}
                      </span>
                    </span>
                    <span className="dx-history__row-state" data-stage={item.stage}>
                      <i aria-hidden="true" />
                      {item.stageLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {model.omittedItems > 0 ? (
            <p className="dx-history__notice" role="alert">
              {model.omittedItems} malformed {model.omittedItems === 1 ? 'entry was' : 'entries were'} omitted.
            </p>
          ) : null}
          {model.hasMore ? (
            <p className="dx-history__notice">More history is available on the next page.</p>
          ) : null}
        </section>
      )}
    </WidgetShell>
  );
}

export default GovernedHistoryView;
