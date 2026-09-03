import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import {
  useAdaptiveDisplayMode,
  useAdaptiveHostCapabilities,
  useAdaptiveHostContext,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveTheme,
  useToolOutput,
} from '../../sdk';
import { Lockup } from '../wallet/Lockup';
import { useIntrinsicHeight } from '../x402/useIntrinsicHeight';
import {
  formatExactDecimal,
  formatExactUsd,
  formatDisplayUsd,
  normalizeDexterPortfolio,
  type ApprovedActionAvailability,
  type ApprovedActionTarget,
  type PortfolioAction,
  type PortfolioHolding,
  type PortfolioViewModel,
} from './portfolio-model';

function shortenIdentity(value: string, leading = 7, trailing = 7): string {
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

function sentenceCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replace(/-/g, ' ')}`;
}

function formatObservedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

function readableList(values: string[]): string {
  if (values.length < 2) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function holdingActionText(actions: PortfolioAction[]): string {
  if (actions.length === 0) return 'No actions are listed for this asset.';
  const names = actions.map((action) => action.replace(/-/g, ' '));
  const subject = readableList(names);
  return `${sentenceCase(subject)} ${actions.length === 1 ? 'is' : 'are'} available.`;
}

function holdingStateText(holding: PortfolioHolding): string {
  const approval = `${sentenceCase(holding.approvalStatus)} asset`;
  if (holding.accountState === 'initialized') return `${approval}.`;
  if (holding.accountState === 'frozen') return `${approval}; account frozen.`;
  return `${approval}; account state unknown.`;
}

function unavailableActionText(action: ApprovedActionAvailability): string {
  const name = sentenceCase(action.action);
  if (action.reason === 'protected_agent_send_sdk_required') {
    return 'Send requires the protected agent SDK.';
  }
  if (action.reason === 'governed_asset_action_not_supported') {
    return `${name} is unavailable for this asset.`;
  }
  return `${name} is unavailable because the governed asset rail is not live.`;
}

function targetActionText(target: ApprovedActionTarget): string {
  const available = target.actions
    .filter((action) => action.available)
    .map((action) => action.action);
  const unavailable = target.actions
    .filter((action) => !action.available)
    .map(unavailableActionText);
  const sentences: string[] = [];

  if (available.length > 0) {
    const names = readableList(available.map((action) => action.replace(/-/g, ' ')));
    sentences.push(`${sentenceCase(names)} ${available.length === 1 ? 'is' : 'are'} available.`);
  } else {
    sentences.push('No governed actions are currently available.');
  }

  return [...sentences, ...unavailable].join(' ');
}

function WalletLockup() {
  return (
    <div className="dxp-lockup">
      <Lockup width={132} />
    </div>
  );
}

function summaryDisplayValue(
  model: Extract<PortfolioViewModel, { state: 'ready' }>,
): string | null {
  const value = model.snapshot.portfolioValueUsd ?? (
    model.snapshot.pricedHoldings > 0 ? model.snapshot.pricedValueUsd : null
  );
  return value === null ? null : formatDisplayUsd(value);
}

const ASSET_WORDMARKS: Readonly<Record<string, string>> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  solana: 'Solana',
};

function displayAssetLabel(assetId: string | null, assetClass: PortfolioHolding['assetClass']): string {
  if (!assetId) return sentenceCase(assetClass);

  return assetId
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => ASSET_WORDMARKS[part] ?? (
      part.length <= 5 ? part.toUpperCase() : sentenceCase(part)
    ))
    .join(' ');
}

function InlineHolding({ holding }: { holding: PortfolioHolding }) {
  const name = displayAssetLabel(holding.assetId, holding.assetClass);
  return (
    <li className="dxp-inline-holding">
      <span className="dxp-inline-holding__name" title={holding.assetId ?? holding.mint}>
        {name}
      </span>
      <span className="dxp-inline-holding__amount">
        {formatExactDecimal(holding.displayAmount)}
      </span>
      <strong className={holding.valueUsd === null ? 'dxp-value-unknown' : undefined}>
        {holding.valueUsd === null ? 'Unpriced' : formatDisplayUsd(holding.valueUsd)}
      </strong>
    </li>
  );
}

function InlinePortfolio({
  model,
  onExpand,
  condensed,
  triggerRef,
}: {
  model: Extract<PortfolioViewModel, { state: 'ready' }>;
  onExpand: (() => void) | null;
  condensed: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const displayValue = summaryDisplayValue(model);
  const exactValue = model.summary.value ?? 'Unknown';
  const visibleHoldings = condensed ? [] : model.snapshot.holdings.slice(0, 2);
  const hiddenCount = Math.max(0, model.snapshot.holdings.length - visibleHoldings.length);

  return (
    <article className="dxp-inline" aria-labelledby="dxp-title">
      <header className="dxp-inline__header">
        <WalletLockup />
        <span>{formatObservedAt(model.snapshot.observedAt)}</span>
      </header>

      <div className="dxp-inline__summary">
        <div>
          <h1 id="dxp-title">{model.summary.label}</h1>
          <strong
            className={displayValue === null ? 'dxp-unknown' : undefined}
            aria-label={`${model.summary.label}: ${exactValue}`}
            title={`${model.summary.label}: ${exactValue}`}
          >
            {displayValue ?? 'Unknown'}
          </strong>
        </div>
        <p>
          {formatCount(model.snapshot.holdings.length, 'asset')}
          {model.snapshot.unpricedHoldings > 0
            ? ` · ${formatCount(model.snapshot.unpricedHoldings, 'unpriced asset')}`
            : model.isPartial ? ' · partial read' : ' · current snapshot'}
        </p>
      </div>

      {visibleHoldings.length > 0 ? (
        <ul className="dxp-inline-holdings">
          {visibleHoldings.map((holding) => (
            <InlineHolding
              key={`${holding.tokenProgram}:${holding.tokenAccount ?? holding.mint}`}
              holding={holding}
            />
          ))}
        </ul>
      ) : !condensed ? (
        <p className="dxp-inline__empty">
          {model.isEmpty ? 'No assets held.' : 'No holdings returned in this snapshot.'}
        </p>
      ) : null}

      <div className="dxp-inline__footer">
        <span>
          {hiddenCount > 0
            ? visibleHoldings.length > 0
              ? `${formatCount(hiddenCount, 'more asset')} in the full view`
              : `${formatCount(hiddenCount, 'asset')} in the full view`
            : model.coverage ?? 'Session-bound · read only'}
        </span>
        {onExpand ? (
          <button ref={triggerRef} type="button" onClick={onExpand}>View portfolio</button>
        ) : null}
      </div>
    </article>
  );
}

type InlinePortfolioItem =
  | { kind: 'holding'; holding: PortfolioHolding }
  | { kind: 'target'; target: ApprovedActionTarget };

function InlineBrowserItem({ item }: { item: InlinePortfolioItem }) {
  if (item.kind === 'target') {
    return (
      <li className="dxp-browser-item">
        <div className="dxp-browser-item__identity">
          <strong>{item.target.symbol}</strong>
          <span>{item.target.name} · available to discover</span>
        </div>
        <code aria-label={`Asset identifier ${item.target.assetId}`}>{item.target.assetId}</code>
        <p>{targetActionText(item.target)}</p>
      </li>
    );
  }

  const { holding } = item;
  const name = displayAssetLabel(holding.assetId, holding.assetClass);
  return (
    <li className="dxp-browser-item">
      <div className="dxp-browser-item__identity">
        <strong>{name}</strong>
        <span>{holdingStateText(holding)}</span>
      </div>
      <div className="dxp-browser-item__values">
        <strong>{formatExactDecimal(holding.displayAmount)}</strong>
        <span>{holding.valueUsd === null ? 'Unpriced' : formatExactUsd(holding.valueUsd)}</span>
      </div>
      <p>{holdingActionText(holding.availableActions)}</p>
      <code aria-label={`Mint ${holding.mint}`}>Mint {holding.mint}</code>
    </li>
  );
}

function InlinePortfolioBrowser({
  model,
  condensed,
  detailRef,
  onClose,
}: {
  model: Extract<PortfolioViewModel, { state: 'ready' }>;
  condensed: boolean;
  detailRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const items = useMemo<InlinePortfolioItem[]>(() => [
    ...model.snapshot.holdings.map((holding) => ({ kind: 'holding' as const, holding })),
    ...model.snapshot.approvedActionTargets.map((target) => ({ kind: 'target' as const, target })),
  ], [model]);
  const pageSize = condensed ? 1 : 2;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visibleItems = items.slice(start, start + pageSize);
  const end = start + visibleItems.length;

  return (
    <article
      className={`dxp-browser${condensed ? ' dxp-browser--condensed' : ''}`}
      aria-labelledby="dxp-browser-title"
      ref={detailRef}
      tabIndex={-1}
    >
      <header className="dxp-browser__header">
        <WalletLockup />
        <button type="button" onClick={onClose}>Back</button>
      </header>

      <div className="dxp-browser__intro">
        <h1 id="dxp-browser-title">Portfolio details</h1>
        <p>
          {items.length === 0
            ? 'No held or discoverable assets in this snapshot.'
            : `${start + 1}\u2013${end} of ${items.length} held and discoverable assets`}
        </p>
      </div>

      {visibleItems.length > 0 ? (
        <ul className="dxp-browser__items">
          {visibleItems.map((item) => (
            <InlineBrowserItem
              key={item.kind === 'holding'
                ? `holding:${item.holding.tokenProgram}:${item.holding.tokenAccount ?? item.holding.mint}`
                : `target:${item.target.assetId}`}
              item={item}
            />
          ))}
        </ul>
      ) : null}

      <footer className="dxp-browser__footer">
        <p>
          Wallet <code>{model.snapshot.walletAddress}</code> · observed{' '}
          {formatObservedAt(model.snapshot.observedAt)}
        </p>
        {pageCount > 1 ? (
          <nav aria-label="Portfolio detail pages">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span aria-live="polite">Page {safePage + 1} of {pageCount}</span>
            <button
              type="button"
              disabled={safePage === pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </button>
          </nav>
        ) : null}
      </footer>
    </article>
  );
}

function HoldingRow({ holding }: { holding: PortfolioHolding }) {
  const identity = holding.assetId ?? shortenIdentity(holding.mint);
  const unit = holding.assetId ?? sentenceCase(holding.assetClass);

  return (
    <li className="dxp-holding">
      <div className="dxp-holding__identity">
        <code title={holding.assetId ?? holding.mint}>{identity}</code>
        <p>{sentenceCase(holding.assetClass)}. {holdingStateText(holding)}</p>
      </div>

      <div className="dxp-holding__amount">
        <strong>{formatExactDecimal(holding.displayAmount)}</strong>
        <span>{unit}</span>
      </div>

      <div className="dxp-holding__value">
        <strong className={holding.valueUsd === null ? 'dxp-value-unknown' : undefined}>
          {holding.valueUsd === null ? 'Unpriced' : formatExactUsd(holding.valueUsd)}
        </strong>
        <span>
          {holding.priceUsd === null
            ? 'No current price'
            : `${formatExactUsd(holding.priceUsd)} per unit`}
        </span>
      </div>

      <p className="dxp-holding__details">
        {holdingActionText(holding.availableActions)} Mint{' '}
        <code title={holding.mint}>{shortenIdentity(holding.mint, 9, 9)}</code>.
      </p>
    </li>
  );
}

function Holdings({ model }: { model: Extract<PortfolioViewModel, { state: 'ready' }> }) {
  const { snapshot } = model;

  if (snapshot.holdings.length === 0) {
    return (
      <section className="dxp-section dxp-empty" aria-labelledby="dxp-assets-title">
        <h2 id="dxp-assets-title">
          {model.isEmpty ? 'No assets held' : 'No assets returned'}
        </h2>
        <p>
          {model.isEmpty
            ? 'This complete portfolio snapshot contains no holdings.'
            : 'This incomplete portfolio snapshot did not return any holdings.'}
          {snapshot.approvedActionTargets.length > 0
            ? ' Assets available for discovery appear below.'
            : ''}
        </p>
      </section>
    );
  }

  return (
    <section className="dxp-section" aria-labelledby="dxp-assets-title">
      <h2 id="dxp-assets-title">
        {model.isPartial
          ? `${formatCount(snapshot.holdings.length, 'asset')} shown`
          : `${formatCount(snapshot.holdings.length, 'asset')} held`}
      </h2>
      <p className="dxp-section__note">
        Actions describe each asset rail. Prepare verifies current authority.
      </p>
      <ul className="dxp-holdings">
        {snapshot.holdings.map((holding) => (
          <HoldingRow
            key={`${holding.tokenProgram}:${holding.tokenAccount ?? holding.mint}`}
            holding={holding}
          />
        ))}
      </ul>
    </section>
  );
}

function TargetRow({ target }: { target: ApprovedActionTarget }) {
  return (
    <li className="dxp-target" data-discovery-context="true">
      <div className="dxp-target__title">
        <strong>{target.symbol}</strong>
        <span>{target.name}</span>
      </div>
      <code title={target.assetId}>{target.assetId}</code>
      <p>{targetActionText(target)}</p>
      <span className="dxp-target__holding-state">Not held</span>
    </li>
  );
}

function ApprovedTargets({ targets }: { targets: ApprovedActionTarget[] }) {
  if (targets.length === 0) return null;

  return (
    <section className="dxp-section dxp-targets" aria-labelledby="dxp-targets-title">
      <h2 id="dxp-targets-title">Available to discover</h2>
      <p className="dxp-targets__note">
        These assets are discovery context. Holdings, balances, and authority remain separate.
        Prepare checks current authority before any action.
      </p>
      <ul className="dxp-target-list">
        {targets.map((target) => <TargetRow key={target.assetId} target={target} />)}
      </ul>
    </section>
  );
}

function ReadDetails({ model }: { model: Extract<PortfolioViewModel, { state: 'ready' }> }) {
  const { snapshot } = model;
  return (
    <footer className="dxp-read-details">
      <p>
        Wallet <code>{snapshot.walletAddress}</code>
      </p>
      <p>
        Observed {formatObservedAt(snapshot.observedAt)}
        {snapshot.contextSlot === null ? '.' : (
          <> at Solana slot <code>{snapshot.contextSlot.toLocaleString()}</code>.</>
        )}
      </p>
    </footer>
  );
}

function ReadyLedger({
  model,
  onClose,
}: {
  model: Extract<PortfolioViewModel, { state: 'ready' }>;
  onClose: (() => void) | null;
}) {
  const { summary } = model;
  const displayValue = summaryDisplayValue(model);
  return (
    <article className="dxp-ledger" aria-labelledby="dxp-title">
      <header className="dxp-header">
        <WalletLockup />
        {onClose ? <button type="button" onClick={onClose}>Close</button> : null}
      </header>

      <section className="dxp-hero" aria-label="Portfolio summary">
        <h1 id="dxp-title">{summary.label}</h1>
        <strong
          className={summary.value === null ? 'dxp-unknown' : undefined}
          aria-label={`${summary.label}: ${summary.value ?? 'Unknown'}`}
          title={`${summary.label}: ${summary.value ?? 'Unknown'}`}
        >
          {displayValue ?? 'Unknown'}
        </strong>
        {model.coverage ? <p className="dxp-coverage" role="status">{model.coverage}</p> : null}
      </section>

      <Holdings model={model} />
      <ApprovedTargets targets={model.snapshot.approvedActionTargets} />
      <ReadDetails model={model} />
    </article>
  );
}

function LoadingLedger({ compact }: { compact: boolean }) {
  return (
    <article
      className={`dxp-ledger dxp-ledger--loading${compact ? ' dxp-ledger--compact-state' : ''}`}
      aria-busy="true"
      aria-label="Loading portfolio"
    >
      <header className="dxp-header">
        <WalletLockup />
      </header>
      <section className="dxp-hero">
        <h1>Portfolio value</h1>
        <div className="dxp-skeleton dxp-skeleton--value" />
        <div className="dxp-skeleton dxp-skeleton--line" />
      </section>
      <div className="dxp-skeleton dxp-skeleton--asset" />
      <span className="dxp-visually-hidden">Loading the current portfolio.</span>
    </article>
  );
}

function StateLedger({ model, compact }: {
  model: Extract<PortfolioViewModel, {
    state: 'authentication_required' | 'read_error' | 'invalid';
  }>;
  compact: boolean;
}) {
  return (
    <article
      className={`dxp-ledger dxp-ledger--state${compact ? ' dxp-ledger--compact-state' : ''}`}
      aria-labelledby="dxp-state-title"
    >
      <header className="dxp-header">
        <WalletLockup />
      </header>
      <section className="dxp-state" role={model.state === 'authentication_required' ? 'status' : 'alert'}>
        <h1 id="dxp-state-title">{model.title}</h1>
        <p>{model.body}</p>
      </section>
    </article>
  );
}

export function PortfolioLedger() {
  const toolOutput = useToolOutput();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const model = useMemo(() => normalizeDexterPortfolio(toolOutput), [toolOutput]);
  const [inlineExpanded, setInlineExpanded] = useState(false);
  const overviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inlineDetailRef = useRef<HTMLElement | null>(null);
  const restoreOverviewFocus = useRef(false);
  const desiredDisplayMode = useRef<'inline' | 'fullscreen'>('inline');
  const displayModeRequestId = useRef(0);
  const isFullscreen = displayMode === 'fullscreen';
  const condensed = !isFullscreen && maxHeight !== null && maxHeight < 520;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (inlineExpanded) {
      inlineDetailRef.current?.focus();
      return;
    }
    if (!isFullscreen && restoreOverviewFocus.current) {
      overviewTriggerRef.current?.focus();
      restoreOverviewFocus.current = false;
    }
  }, [inlineExpanded, isFullscreen]);

  const requestMode = (mode: 'inline' | 'fullscreen') => {
    if (!requestDisplayMode) return;
    desiredDisplayMode.current = mode;
    const requestId = ++displayModeRequestId.current;

    const issueRequest = async (
      requestedMode: 'inline' | 'fullscreen',
      activeRequestId: number,
    ): Promise<void> => {
      try {
        await Promise.resolve(requestDisplayMode({ mode: requestedMode }));
      } catch {
        return;
      }

      const desiredMode = desiredDisplayMode.current;
      if (
        activeRequestId !== displayModeRequestId.current
        && desiredMode !== requestedMode
      ) {
        const correctionId = ++displayModeRequestId.current;
        await issueRequest(desiredMode, correctionId);
      }
    };

    void issueRequest(mode, requestId);
  };

  const canFullscreen = Boolean(
    requestDisplayMode
    && hostCapabilities.requestDisplayMode
    && hostContext.availableDisplayModes.includes('fullscreen'),
  );
  const canReturnInline = Boolean(
    requestDisplayMode
    && hostCapabilities.requestDisplayMode
    && hostContext.availableDisplayModes.includes('inline'),
  );

  const openPortfolio = () => {
    // Respond immediately even if the host takes time to decide on fullscreen.
    // The bounded inline pager remains usable when the request is declined.
    setInlineExpanded(true);
    if (canFullscreen) requestMode('fullscreen');
  };

  const closePortfolio = () => {
    restoreOverviewFocus.current = true;
    setInlineExpanded(false);
    if (canReturnInline) requestMode('inline');
  };

  return (
    <div
      className={`dxp-root ${isFullscreen ? 'dxp-root--fullscreen' : 'dxp-root--inline'}`}
      ref={rootRef}
      data-theme={theme}
      data-host-max-height={maxHeight ?? undefined}
      style={isFullscreen ? {
        paddingTop: hostContext.safeAreaInsets.top || undefined,
        paddingRight: hostContext.safeAreaInsets.right || undefined,
        paddingBottom: hostContext.safeAreaInsets.bottom || undefined,
        paddingLeft: hostContext.safeAreaInsets.left || undefined,
      } : undefined}
    >
      {model.state === 'loading' ? <LoadingLedger compact={condensed} /> : null}
      {model.state === 'ready' && !isFullscreen && !inlineExpanded ? (
        <InlinePortfolio
          model={model}
          onExpand={openPortfolio}
          condensed={condensed}
          triggerRef={overviewTriggerRef}
        />
      ) : null}
      {model.state === 'ready' && !isFullscreen && inlineExpanded ? (
        <InlinePortfolioBrowser
          model={model}
          condensed={condensed}
          detailRef={inlineDetailRef}
          onClose={closePortfolio}
        />
      ) : null}
      {model.state === 'ready' && isFullscreen ? (
        <ReadyLedger
          model={model}
          onClose={closePortfolio}
        />
      ) : null}
      {model.state !== 'loading' && model.state !== 'ready' ? (
        <StateLedger model={model} compact={condensed} />
      ) : null}
    </div>
  );
}
