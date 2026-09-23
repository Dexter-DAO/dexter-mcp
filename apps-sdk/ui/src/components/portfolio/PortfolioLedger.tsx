import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import {
  useAdaptiveDisplayMode,
  useAdaptiveHostCapabilities,
  useAdaptiveHostContext,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveTheme,
  useAdaptiveCallToolFn,
  useToolOutput,
  useToolResponseMetadata,
} from '../../sdk';
import { Lockup } from '../wallet/Lockup';
import { useIntrinsicHeight } from '../x402/useIntrinsicHeight';
import {
  formatExactDecimal,
  formatExactUsd,
  formatDisplayUsd,
  formatPriceChangePercent,
  governedActionReason,
  holdingCapabilityReason,
  normalizeDexterPortfolio,
  portfolioReadRequest,
  portfolioReadMatchesRequest,
  type ApprovedActionAvailability,
  type ApprovedActionTarget,
  type PortfolioAction,
  type HoldingCapabilityReason,
  type PortfolioEnrichment,
  type PortfolioHolding,
  type CompactPortfolioHolding,
  type CompactPortfolioTarget,
  type PortfolioReadView,
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

function enrichmentText(enrichment: PortfolioEnrichment): string {
  return `Enrichment: pricing ${enrichment.pricing}; metadata ${enrichment.metadata}; token extensions ${enrichment.tokenExtensions}.`;
}

function HoldingContext({ holding, section = 'all' }: {
  holding: PortfolioHolding;
  section?: 'all' | 'overview' | 'market';
}) {
  const market = holding.marketContext;
  const registry = holding.registryIdentity;
  const unavailable = new Map<HoldingCapabilityReason, PortfolioAction[]>();
  for (const capability of holding.capabilities) {
    if (!capability.available && capability.reasonCode) {
      unavailable.set(capability.reasonCode, [...(unavailable.get(capability.reasonCode) ?? []), capability.action]);
    }
  }
  const priceSource = holding.priceSource === 'jupiter-price-v3' ? 'Jupiter Price V3'
    : holding.priceSource === 'jupiter-exact-in-quote' ? 'Jupiter ExactIn valuation quote' : 'Unknown';
  const marketMetrics = market ? [
    market.liquidityUsd === null ? null : `Liquidity: ${formatExactUsd(market.liquidityUsd)}`,
    market.holderCount === null ? null : `holders: ${market.holderCount.toLocaleString()}`,
    market.activity24h.traderCount === null ? null : `traders (24h): ${market.activity24h.traderCount.toLocaleString()}`,
  ].filter((metric) => metric !== null).join('; ') : '';
  return (
    <>
      {section !== 'overview' && market ? (
        <>
          <br />{marketMetrics ? `${marketMetrics}. ` : ''}
          Jupiter Tokens V2, observed {formatObservedAt(market.observedAt)}.
        </>
      ) : null}
      {section !== 'market' && registry && (registry.providerName !== null || registry.legalIssuerName !== null) ? (
        <>
          <br />Dexter registry:
          {registry.providerName !== null ? <> provider {registry.providerName}.</> : null}
          {registry.legalIssuerName !== null ? <> Legal issuer: {registry.legalIssuerName}.</> : null}
        </>
      ) : null}
      {section !== 'overview' && (holding.priceSource !== null || holding.priceObservedAt !== null || holding.priceBlockId !== null) ? (
        <>
          <br />Price source: {priceSource}.
          {holding.priceObservedAt !== null ? <> Observed {formatObservedAt(holding.priceObservedAt)}.</> : null}
          {holding.priceBlockId !== null ? <> Block: {holding.priceBlockId.toLocaleString()}.</> : null}
        </>
      ) : null}
      {section !== 'overview' && holding.metadataObservedAt !== null ? (
        <><br />Metadata observed {formatObservedAt(holding.metadataObservedAt)}.</>
      ) : null}
      {section !== 'market' && [...unavailable].map(([reason, actions]) => (
        <span key={reason}>
          <br />{sentenceCase(readableList(actions))}: {holdingCapabilityReason(reason)}
        </span>
      ))}
    </>
  );
}

function unavailableActionText(action: ApprovedActionAvailability): string {
  const name = sentenceCase(action.action);
  if (action.reason?.startsWith('stock_')) {
    return `${name} is unavailable. ${governedActionReason(action.reason)}`;
  }
  if (action.reason === 'protected_agent_send_sdk_required') {
    return 'Sending is unavailable through this connection.';
  }
  if (action.reason === 'governed_asset_action_not_supported') {
    return `${name} is unavailable for this asset.`;
  }
  return `${name} is currently unavailable for this asset.`;
}

function targetActionText(target: Pick<ApprovedActionTarget, 'actions'>): string {
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
    sentences.push('No actions are currently available.');
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
  const name = holding.symbol ?? holding.name ?? displayAssetLabel(holding.assetId, holding.assetClass);
  return (
    <li className="dxp-inline-holding">
      <span className="dxp-inline-holding__name" title={holding.name ?? holding.assetId ?? holding.mint}>
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
        <span>Solana · {formatObservedAt(model.snapshot.observedAt)}</span>
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

type DetailSection = 'overview' | 'market' | 'identity';

function InlineBrowserItem({ item, detailSection, walletAddress }: {
  item: InlinePortfolioItem;
  detailSection?: DetailSection;
  walletAddress?: string;
}) {
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
  const name = holding.name ?? holding.symbol ?? displayAssetLabel(holding.assetId, holding.assetClass);
  return (
    <li className="dxp-browser-item">
      <div className="dxp-browser-item__identity">
        <strong>{name}{holding.symbol && holding.symbol !== name ? ` (${holding.symbol})` : ''}</strong>
        <span>{holdingStateText(holding)}</span>
      </div>
      <div className="dxp-browser-item__values">
        <strong>{formatExactDecimal(holding.displayAmount)}{holding.symbol ? ` ${holding.symbol}` : ''}</strong>
        <span>{holding.valueUsd === null ? 'Unpriced' : formatExactUsd(holding.valueUsd)}</span>
      </div>
      <div className="dxp-browser-item__description dxp-detail-panel" data-detail-section={detailSection ?? 'all'}>
        {!detailSection || detailSection === 'overview' ? (
          <p>
            {holdingActionText(holding.availableActions)}
            <HoldingContext holding={holding} section="overview" />
          </p>
        ) : null}
        {!detailSection || detailSection === 'market' ? (
          <p>
            {holding.priceUsd === null ? 'Price unavailable.' : <>Price per unit: {formatExactUsd(holding.priceUsd)}.</>}
            {holding.change24hPercent !== null ? (
              <> 24h price change: {formatPriceChangePercent(holding.change24hPercent)}.</>
            ) : null}
            <HoldingContext holding={holding} section="market" />
          </p>
        ) : null}
        {!detailSection || detailSection === 'identity' ? (
          <div className="dxp-browser-item__codes">
            {holding.assetId ? <p>Asset identifier: <code>{holding.assetId}</code></p> : null}
            <p>Mint <code aria-label={`Mint ${holding.mint}`}>{holding.mint}</code></p>
            {holding.tokenAccount ? <p>Token account <code>{holding.tokenAccount}</code></p> : null}
            <p>Raw amount: <code>{holding.amountRaw}</code>. Decimals: {holding.decimals}. Token program: {holding.tokenProgram}.</p>
            {holding.displayMultiplier !== null ? <p>Display multiplier: {formatExactDecimal(holding.displayMultiplier)}.</p> : null}
            {walletAddress ? <p>Wallet <code>{walletAddress}</code></p> : null}
          </div>
        ) : null}
      </div>
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
        <h1 id="dxp-browser-title">Solana portfolio details</h1>
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
          {model.snapshot.enrichment ? <><br />{enrichmentText(model.snapshot.enrichment)}</> : null}
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
  const identity = holding.symbol ?? holding.name ?? holding.assetId ?? shortenIdentity(holding.mint);
  const unit = holding.symbol ?? holding.assetId ?? sentenceCase(holding.assetClass);

  return (
    <li className="dxp-holding">
      <div className="dxp-holding__identity">
        <code title={holding.assetId ?? holding.mint}>{identity}</code>
        <p>{holding.name ? `${holding.name}. ` : ''}{sentenceCase(holding.assetClass)}. {holdingStateText(holding)}</p>
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
        {holding.change24hPercent !== null ? (
          <span>24h price change: {formatPriceChangePercent(holding.change24hPercent)}</span>
        ) : null}
      </div>

      <p className="dxp-holding__details">
        {holdingActionText(holding.availableActions)}
        {holding.displayMultiplier !== null ? (
          <> Display multiplier: {formatExactDecimal(holding.displayMultiplier)}.</>
        ) : null}
        {holding.assetId ? <> Asset identifier: <code>{holding.assetId}</code>.</> : null}
        {' '}Mint <code>{holding.mint}</code>.
        <HoldingContext holding={holding} />
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

function TargetRow({ target, showHoldingState = true }: { target: CompactPortfolioTarget; showHoldingState?: boolean }) {
  return (
    <li className="dxp-target" data-discovery-context="true">
      <div className="dxp-target__title">
        <strong>{target.symbol}</strong>
        <span>{target.name}</span>
      </div>
      <code title={target.assetId}>{target.assetId}</code>
      <p>{targetActionText(target)}</p>
      {showHoldingState ? <span className="dxp-target__holding-state">Not held</span> : null}
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
        Solana wallet <code>{snapshot.walletAddress}</code>
      </p>
      <p>
        Observed {formatObservedAt(snapshot.observedAt)}
        {snapshot.contextSlot === null ? '.' : (
          <> at Solana slot <code>{snapshot.contextSlot.toLocaleString()}</code>.</>
        )}
      </p>
      {snapshot.enrichment ? <p>{enrichmentText(snapshot.enrichment)}</p> : null}
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

function SelectedPortfolio({
  model,
  condensed,
}: {
  model: Extract<PortfolioViewModel, { state: 'selected' }>;
  condensed: boolean;
}) {
  const callTool = useAdaptiveCallToolFn();
  const capabilities = useAdaptiveHostCapabilities();
  const owner = useRef(model);
  owner.current = model;
  const requestId = useRef(0);
  const mounted = useRef(true);
  const [response, setResponse] = useState<{ owner: typeof model; value: PortfolioViewModel } | null>(null);
  const [pending, setPending] = useState<typeof model | null>(null);
  const [position, setPosition] = useState<{ read: unknown; page: number }>({ read: null, page: 0 });
  const [detailPosition, setDetailPosition] = useState<{ read: unknown; section: DetailSection }>({ read: null, section: 'overview' });
  const active = response?.owner === model ? response.value : model;
  const busy = pending === model;
  const currentRead = active.state === 'selected' ? active.read : model.read;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; };
  }, []);

  const request = async (view: PortfolioReadView | 'next' | 'refresh', holding?: CompactPortfolioHolding) => {
    if (!capabilities.callTool || busy) return;
    const requestOwner = model;
    const id = ++requestId.current;
    const args = view === 'refresh'
      ? { view: 'summary', network: currentRead.network }
      : portfolioReadRequest(currentRead, view, holding);
    setPending(requestOwner);
    let next: PortfolioViewModel;
    try {
      const result = await callTool('dexter_wallet_portfolio', args);
      next = normalizeDexterPortfolio(result);
      if (next.state === 'selected' && (result.isError || (view === 'refresh'
        ? next.read.selection.view !== 'summary'
        : !portfolioReadMatchesRequest(currentRead, next.read, args)))) {
        next = { state: 'invalid', title: 'Portfolio data unavailable', body: 'The response did not match this portfolio request.' };
      }
      if (next.state === 'ready' || next.state === 'loading') {
        next = { state: 'invalid', title: 'Portfolio data unavailable', body: 'The response did not match this portfolio request.' };
      }
    } catch {
      next = { state: 'read_error', title: 'Portfolio unavailable', body: 'The portfolio request could not be completed. Request a fresh summary to try again.' };
    }
    if (!mounted.current || owner.current !== requestOwner || requestId.current !== id) return;
    setResponse({ owner: requestOwner, value: next });
    setPending(null);
    setPosition({ read: null, page: 0 });
  };

  if (active.state !== 'selected') {
    return (
      <div className="dxp-browser">
        {active.state !== 'loading' && active.state !== 'ready' ? <StateLedger model={active} compact={condensed} /> : null}
        {active.state !== 'authentication_required' && capabilities.callTool ? (
          <button type="button" disabled={busy} onClick={() => void request('refresh')}>Request fresh summary</button>
        ) : null}
        {busy ? <p role="status">Reading portfolio...</p> : null}
      </div>
    );
  }

  const { read, summary, coverage } = active;
  const selection = read.selection;
  const source = read.sourceSummary;
  const pageSize = condensed ? 1 : 2;
  const pageCount = Math.max(1, Math.ceil(selection.returnedCount / pageSize));
  const page = position.read === read ? Math.min(position.page, pageCount - 1) : 0;
  const start = page * pageSize;
  const end = Math.min(start + pageSize, selection.returnedCount);
  const isDetail = selection.view === 'detail' && selection.match === 'matched';
  const detailSection = detailPosition.read === read ? detailPosition.section : 'overview';
  const displayValue = source.portfolioValueUsd ?? (source.pricedHoldings > 0 ? source.pricedValueUsd : null);
  const title = selection.view === 'summary' ? summary.label
    : selection.view === 'targets' ? 'Approved assets'
      : isDetail ? 'Asset details' : selection.match === 'ambiguous' ? 'Choose an asset' : 'Holdings';
  const noMatches = selection.match === 'none'
    ? source.holdingCount === 0 && source.holdingsComplete && selection.view !== 'targets'
      ? 'No assets held.' : 'No matches in this observation.'
    : selection.match === 'unavailable' ? 'Approved asset information is unavailable.' : null;

  return (
    <article className={`dxp-browser dxp-browser--selected${condensed ? ' dxp-browser--condensed' : ''}`} aria-labelledby="dxp-selected-title" aria-busy={busy}>
      <header className="dxp-browser__header">
        <WalletLockup />
        {selection.view !== 'summary' ? (
          <button type="button" disabled={busy || !capabilities.callTool} onClick={() => void request('summary')}>View summary</button>
        ) : null}
      </header>
      <div className="dxp-browser__intro">
        <h1 id="dxp-selected-title">{title}</h1>
        {selection.view === 'summary' ? (
          <>
            <strong title={summary.value ?? 'Unknown'}>{displayValue === null ? 'Unknown' : formatDisplayUsd(displayValue)}</strong>
            <p>{formatCount(source.holdingCount, 'asset')} on Solana in this observation</p>
          </>
        ) : null}
        {selection.returnedCount > 0 ? (
          <p>
            Solana · {start + 1}–{end} of {selection.returnedCount} returned
            {selection.matchedCount === null ? '' : `; ${selection.matchedCount} ${selection.matchedCount === 1 ? 'match' : 'matches'} in this observation`}
          </p>
        ) : <p>Solana · {noMatches}</p>}
        {selection.query ? <p>Search: {selection.query}</p> : null}
        {coverage ? <p role="status">{coverage}</p> : null}
      </div>
      <ul className="dxp-browser__items">
        {read.holdings.slice(start, end).map((holding, index) => {
          const rich = read.richHoldings[start + index];
          if (isDetail && rich) return <InlineBrowserItem key={`${holding.mint}:${holding.tokenAccount}`} item={{ kind: 'holding', holding: rich }} detailSection={detailSection} walletAddress={read.walletAddress} />;
          return (
            <li className="dxp-browser-item" key={`${holding.mint}:${holding.tokenAccount}`}>
              <div className="dxp-browser-item__identity">
                <strong>{holding.name ?? holding.symbol ?? holding.assetId ?? holding.mint}</strong>
                {holding.name && holding.symbol ? <span>{holding.symbol}</span> : null}
              </div>
              <div className="dxp-browser-item__values">
                <strong>{formatExactDecimal(holding.displayAmount)}{holding.symbol ? ` ${holding.symbol}` : ''}</strong>
                <span>{holding.valueUsd === null ? 'Unpriced' : formatDisplayUsd(holding.valueUsd)}</span>
              </div>
              {holding.change24hPercent !== null ? <p>24h price change: {formatPriceChangePercent(holding.change24hPercent)}</p> : null}
              {selection.match === 'ambiguous' ? (
                <div className="dxp-browser-item__codes">
                  <p>Mint <code>{holding.mint}</code></p>
                  {holding.tokenAccount ? <p>Token account <code>{holding.tokenAccount}</code></p> : null}
                </div>
              ) : null}
              <button type="button" disabled={busy || !capabilities.callTool}
                onClick={() => void request('detail', holding)}
                aria-label={`View details for ${holding.symbol ?? holding.name ?? holding.mint}`}>View details</button>
            </li>
          );
        })}
        {read.targets.slice(start, end).map((target) => <TargetRow key={target.assetId} target={target} showHoldingState={false} />)}
      </ul>
      {isDetail ? (
        <nav className="dxp-detail-navigation" aria-label="Asset detail sections">
          {([['overview', 'Asset overview'], ['market', 'Market data'], ['identity', 'Token identity']] as const).map(([section, label]) => (
            <button key={section} type="button" aria-pressed={detailSection === section}
              onClick={() => setDetailPosition({ read, section })}>{label}</button>
          ))}
        </nav>
      ) : null}
      <footer className="dxp-browser__footer">
        {busy ? <p role="status">Reading portfolio...</p> : null}
        {pageCount > 1 ? (
          <nav aria-label="Returned portfolio rows">
            <button type="button" disabled={busy || page === 0} onClick={() => setPosition({ read, page: page - 1 })}>Previous</button>
            <span>Page {page + 1} of {pageCount}</span>
            <button type="button" disabled={busy || page + 1 === pageCount} onClick={() => setPosition({ read, page: page + 1 })}>Next</button>
          </nav>
        ) : null}
        <nav aria-label="Portfolio reads">
          {selection.view !== 'holdings' ? (
            <button type="button" disabled={busy || !capabilities.callTool} onClick={() => void request('holdings')}>View holdings</button>
          ) : null}
          {selection.view !== 'targets' ? (
            <button type="button" disabled={busy || !capabilities.callTool} onClick={() => void request('targets')}>View approved assets</button>
          ) : null}
          {selection.nextCursor !== null && page + 1 === pageCount ? (
            <button type="button" disabled={busy || !capabilities.callTool} onClick={() => void request('next')}>Load next page</button>
          ) : null}
        </nav>
        {!capabilities.callTool ? <p>Ask for holdings or asset details to continue.</p> : null}
        {selection.omittedCount !== null && selection.omittedCount > 0 ? (
          <p>{selection.omittedCount} observed {selection.view === 'targets' ? 'approved assets are' : 'holdings are'} outside this response.</p>
        ) : null}
        <p>Observed {formatObservedAt(read.observedAt)}.</p>
        <p>Read expires {formatObservedAt(read.expiresAt)}.</p>
      </footer>
    </article>
  );
}

export function PortfolioLedger() {
  const toolOutput = useToolOutput();
  const toolMetadata = useToolResponseMetadata();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const model = useMemo(() => normalizeDexterPortfolio(toolOutput, toolMetadata), [toolOutput, toolMetadata]);
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
      className={`dxp-root ${isFullscreen ? 'dxp-root--fullscreen' : 'dxp-root--inline'}${model.state === 'selected' ? ' dxp-root--selected' : ''}`}
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
      {model.state === 'selected' ? (
        <SelectedPortfolio model={model} condensed={condensed || hostContext.platform === 'mobile'
          || (hostContext.containerDimensions?.width ?? Number.POSITIVE_INFINITY) <= 480} />
      ) : null}
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
      {model.state !== 'loading' && model.state !== 'ready' && model.state !== 'selected' ? (
        <StateLedger model={model} compact={condensed} />
      ) : null}
    </div>
  );
}
