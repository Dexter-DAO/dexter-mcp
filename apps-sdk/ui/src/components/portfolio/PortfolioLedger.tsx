import { useEffect, useMemo, useRef, useState, type RefObject, type ReactNode, type SyntheticEvent } from 'react';

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
  formatPortfolioMoney,
  formatPortfolioQuantity,
  formatPortfolioPrice,
  accumulatePortfolioRows,
  governedActionReason,
  holdingCapabilityReason,
  normalizeDexterPortfolio,
  portfolioReadRequest,
  portfolioReadMatchesRequest,
  portfolioHoldingsSource,
  type ApprovedActionAvailability,
  type ApprovedActionTarget,
  type PortfolioAction,
  type HoldingCapabilityReason,
  type PortfolioEnrichment,
  type PortfolioHolding,
  type SelectedPortfolioHolding,
  type PortfolioHoldingIdentity,
  type CompactPortfolioHolding,
  type CompactPortfolioTarget,
  type PortfolioReadView,
  type PortfolioViewModel,
  type PortfolioReadCollection,
  type SelectedPortfolioRead,
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

type SelectedModel = Extract<PortfolioViewModel, { state: 'selected' }>;
type SelectedProblem = Extract<PortfolioViewModel, { state: 'authentication_required' | 'read_error' | 'invalid' }>;
type SelectedScreen = {
  model: SelectedModel;
  collection: PortfolioReadCollection;
  target: CompactPortfolioTarget | null;
  scrollTop: number;
  focusKey: string | null;
};
type SelectedSession = {
  owner: SelectedModel;
  screen: SelectedScreen;
  history: SelectedScreen[];
  problem: SelectedProblem | null;
  restore: boolean;
};

function holdingKey(holding: Pick<CompactPortfolioHolding, 'mint' | 'tokenAccount'>): string {
  return `${holding.mint}:${holding.tokenAccount ?? ''}`;
}

function holdingLabel(holding: CompactPortfolioHolding): string {
  return holding.symbol ?? holding.name ?? 'Unidentified asset';
}

function holdingDetailLabel(holding: CompactPortfolioHolding): string {
  return `View details for ${holdingLabel(holding)}${holding.symbol && holding.name && holding.symbol !== holding.name ? ` (${holding.name})` : ''}`;
}

function readDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value));
}

function SelectedMoney({ value }: { value: string | null }) {
  if (value === null) return <div className="dxp-selected-money dxp-selected-money--unknown">Value unavailable</div>;
  const text = formatPortfolioMoney(value);
  const parts = text.match(/^\$([\d,]+)(\.\d{2})$/u);
  return (
    <div className="dxp-selected-money" data-testid="portfolio-value">
      {parts ? <><span className="dxp-selected-money__currency">$</span>{parts[1]}<span className="dxp-selected-money__cents">{parts[2]}</span></> : text}
    </div>
  );
}

function SelectedChange({ value }: { value: string | null }) {
  const tone = value === null || value === '0' ? '' : value.startsWith('-') ? ' negative' : ' positive';
  return <span className={`dxp-selected-change${tone}`}>{value === null ? '24h change unavailable' : `24h price ${formatPriceChangePercent(value)}`}</span>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children ?? 'Unavailable'}</dd></div>;
}

function SelectedActionFacts({ holding, target, onExpand }: {
  holding?: PortfolioHolding;
  target?: CompactPortfolioTarget;
  onExpand: () => void;
}) {
  const available = (holding?.availableActions ?? target?.actions.filter((item) => item.available).map((item) => item.action) ?? [])
    .filter((action) => action !== 'view');
  const unavailable = new Map<string, { actions: string[]; explanation: string }>();
  const records = holding ? holding.capabilities.map((item) => ({ action: item.action,
    available: item.available, reason: item.reasonCode })) : target?.actions ?? [];
  for (const item of records) {
    if (item.available || item.action === 'view') continue;
    const code = item.reason ?? 'unknown';
    const group = unavailable.get(code) ?? { actions: [], explanation: holdingCapabilityReason(code) };
    group.actions.push(sentenceCase(item.action));
    unavailable.set(code, group);
  }
  return (
    <section className="dxp-selected-actions" aria-label="Action availability">
      <h2>Actions</h2>
      <p>{available.length > 0 ? `${readableList(available.map(sentenceCase))} available.` : 'No actions are currently available.'}</p>
      {unavailable.size > 0 ? (
        <details className="dxp-selected-disclosure" onToggle={(event) => { if (event.currentTarget.open) onExpand(); }}>
          <summary>Unavailable actions</summary>
          <dl className="dxp-selected-facts dxp-selected-facts--reasons">
            {[...unavailable].map(([code, group]) => <Fact key={code} label={readableList(group.actions)}>{group.explanation}</Fact>)}
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function holdingIdentityLabel(identity: PortfolioHoldingIdentity): string {
  if (identity.state === 'native') return 'Native SOL';
  if (identity.state === 'unreviewed') return 'Identity has not been reviewed';
  if (identity.state === 'unavailable') return 'Identity verification unavailable';
  return identity.registryState === 'retired' ? 'Verified identity; registry entry retired' : 'Verified identity';
}

function holdingIdentityReason(identity: Extract<PortfolioHoldingIdentity, { state: 'unavailable' }>): string {
  const reasons: Record<typeof identity.reason, string> = {
    source_unavailable: 'The identity source is unavailable.', read_inconsistent: 'The identity records could not be read consistently.',
    token_identity_mismatch: 'The token does not match its identity record.', release_missing: 'The identity release is unavailable.',
    lineage_invalid: 'The identity release history could not be verified.', conflicting_material: 'The identity records disagree.',
    registry_digest_mismatch: 'The registry identity could not be verified.',
  };
  return reasons[identity.reason];
}

function SelectedHoldingDetail({ holding, read, onExpand }: {
  holding: SelectedPortfolioHolding;
  read: SelectedPortfolioRead;
  onExpand: () => void;
}) {
  const market = holding.marketContext;
  const registry = holding.registryIdentity;
  const metrics = [market?.liquidityUsd ?? null, market?.holderCount ?? null, market?.activity24h.traderCount ?? null];
  const knownMetrics = metrics.filter((value) => value !== null).length;
  const program = holding.tokenProgram === 'native' ? 'Native SOL' : holding.tokenProgram === 'token-2022' ? 'Token-2022' : 'SPL Token';
  const priceSource = holding.priceSource === 'jupiter-price-v3' ? 'Jupiter Price V3'
    : holding.priceSource === 'jupiter-exact-in-quote' ? 'Jupiter ExactIn quote' : 'Unavailable';
  const openDisclosure = (event: SyntheticEvent<HTMLDetailsElement>) => { if (event.currentTarget.open) onExpand(); };
  return (
    <>
      <h1 id="dxp-selected-title" tabIndex={-1}>{holding.name ?? holdingLabel(holding)}</h1>
      <div className="dxp-selected-detail-value">
        <SelectedMoney value={holding.valueUsd} />
        <p>{holding.amountModel === 'unknown' ? 'Amount unavailable' : `${formatPortfolioQuantity(holding.displayAmount)}${holding.symbol ? ` ${holding.symbol}` : ''} held`}</p>
        <SelectedChange value={holding.change24hPercent} />
      </div>
      <section className="dxp-selected-market" aria-label="Market data">
        <h2>Market data</h2>
        <dl className="dxp-selected-facts">
          <Fact label="Token price">{holding.priceUsd === null ? null : formatPortfolioPrice(holding.priceUsd)}</Fact>
          {market?.liquidityUsd !== null && market?.liquidityUsd !== undefined ? <Fact label="Liquidity">{formatPortfolioMoney(market.liquidityUsd)}</Fact> : null}
          {market?.holderCount !== null && market?.holderCount !== undefined ? <Fact label="Holders">{market.holderCount.toLocaleString()}</Fact> : null}
          {market?.activity24h.traderCount !== null && market?.activity24h.traderCount !== undefined ? <Fact label="Traders in 24h">{market.activity24h.traderCount.toLocaleString()}</Fact> : null}
        </dl>
        {market && holding.mint === 'native:SOL' ? <p className="dxp-selected-note">Liquidity, holders and traders refer to wrapped SOL.</p> : null}
        {knownMetrics < 3 ? <p className="dxp-selected-note">{knownMetrics === 0 ? 'Liquidity, holder counts and trading activity are unavailable.' : 'Some market data is unavailable.'}</p> : null}
      </section>
      {registry && (registry.providerName !== null || registry.legalIssuerName !== null) ? (
        <section className="dxp-selected-registry" aria-label="Registry identity">
          <h2>Registry identity</h2>
          <dl className="dxp-selected-facts">
            {registry.providerName !== null ? <Fact label="Provider">{registry.providerName}</Fact> : null}
            {registry.legalIssuerName !== null ? <Fact label="Legal issuer">{registry.legalIssuerName}</Fact> : null}
          </dl>
        </section>
      ) : null}
      <details className="dxp-selected-disclosure" data-testid="exact-balance" onToggle={openDisclosure}>
        <summary>Exact balance</summary>
        <dl className="dxp-selected-facts dxp-selected-facts--exact">
          <Fact label={holding.symbol ? `Amount (${holding.symbol})` : 'Amount'}>{holding.amountModel === 'unknown' ? 'Unavailable' : formatExactDecimal(holding.displayAmount)}</Fact>
          <Fact label="Holding value (USD)">{holding.valueUsd === null ? null : formatExactUsd(holding.valueUsd)}</Fact>
          <Fact label="Token price (USD)">{holding.priceUsd === null ? null : formatExactUsd(holding.priceUsd)}</Fact>
          {holding.amountModel === 'scaled-ui-amount' ? <Fact label="Display multiplier">{holding.displayMultiplier}</Fact> : null}
        </dl>
      </details>
      <details className="dxp-selected-disclosure" data-testid="asset-diagnostics" onToggle={openDisclosure}>
        <summary>Identity and data sources</summary>
        <dl className="dxp-selected-facts dxp-selected-facts--diagnostics">
          <Fact label="Asset class">{sentenceCase(holding.assetClass)}</Fact>
          <Fact label="Token program">{program}</Fact>
          <Fact label="Mint"><code>{holding.mint}</code></Fact>
          {holding.tokenAccount !== null ? <Fact label="Token account"><code>{holding.tokenAccount}</code></Fact> : null}
          <Fact label="Wallet"><code>{read.walletAddress}</code></Fact>
          <Fact label="Account state">{sentenceCase(holding.accountState)}</Fact>
          {'identity' in holding ? <>
            <Fact label="Asset identity">{holdingIdentityLabel(holding.identity)}</Fact>
            {holding.identity.state === 'unavailable' ? <Fact label="Identity availability">{holdingIdentityReason(holding.identity)}</Fact> : null}
            {holding.identity.state === 'recognized' ? <>
              <Fact label="Identity source">{holding.identity.source === 'static_registry' ? 'Dexter asset definitions' : 'Released asset catalog'}</Fact>
              <Fact label="Registry status">{holding.identity.registryState === 'not_observed' ? 'Not observed' : sentenceCase(holding.identity.registryState)}</Fact>
              {holding.identity.source === 'released_catalog' ? <Fact label="Identity observed at">{readDate(holding.identity.observedAt)}</Fact> : null}
            </> : null}
          </> : <Fact label="Asset review">{sentenceCase(holding.approvalStatus)}</Fact>}
          <Fact label="Amount display">{holding.amountModel === 'scaled-ui-amount' ? 'Scaled token amount' : holding.amountModel === 'raw-decimals' ? 'Token decimals' : 'Unavailable'}</Fact>
          <Fact label="Raw amount"><code>{holding.amountRaw}</code></Fact>
          <Fact label="Decimals">{holding.decimals}</Fact>
          <Fact label="Display multiplier">{holding.tokenProgram === 'native' ? 'Not applicable to native SOL' : holding.amountModel === 'raw-decimals' ? 'Not applied' : holding.displayMultiplier}</Fact>
          <Fact label="Market source">{market ? 'Jupiter Tokens V2' : null}</Fact>
          <Fact label="Market mint">{market ? <code>{market.mint}</code> : null}</Fact>
          <Fact label="Liquidity (USD)">{market?.liquidityUsd === null || market?.liquidityUsd === undefined ? null : formatExactUsd(market.liquidityUsd)}</Fact>
          <Fact label="Holders">{market?.holderCount?.toLocaleString() ?? null}</Fact>
          <Fact label="Traders in 24h">{market?.activity24h.traderCount?.toLocaleString() ?? null}</Fact>
          <Fact label="Market observed at">{market ? readDate(market.observedAt) : null}</Fact>
          <Fact label="Price source">{priceSource}</Fact>
          <Fact label="Price observed at">{holding.priceObservedAt === null ? null : readDate(holding.priceObservedAt)}</Fact>
          <Fact label="Price block">{holding.priceBlockId?.toLocaleString() ?? null}</Fact>
          <Fact label="Metadata observed at">{holding.metadataObservedAt === null ? null : readDate(holding.metadataObservedAt)}</Fact>
          {registry ? <Fact label="Registry identity source">{'identity' in holding ? 'Dexter asset registry' : 'Dexter approved asset registry'}</Fact> : null}
          <Fact label="Portfolio observed at">{readDate(read.observedAt)}</Fact>
        </dl>
        {'identity' in holding && holding.identity.state === 'recognized' ? (
          <details className="dxp-selected-disclosure" onToggle={openDisclosure}>
            <summary>Identity verification details</summary>
            <dl className="dxp-selected-facts dxp-selected-facts--diagnostics">
              <Fact label="Registry identity digest"><code>{holding.identity.material.registryIdentityDigest}</code></Fact>
              {holding.identity.source === 'released_catalog' ? Object.entries(holding.identity.provenance).map(([key, value]) => (
                <Fact key={key} label={sentenceCase(key.replace(/([A-Z])/g, ' $1'))}><code>{value}</code></Fact>
              )) : null}
            </dl>
          </details>
        ) : null}
      </details>
      {'identity' in holding ? <section className="dxp-selected-actions" aria-label="Trading availability">
        <h2>Trading availability</h2><p>Trading availability has not been checked. Explore assets to check available actions.</p>
      </section> : <SelectedActionFacts holding={holding} onExpand={onExpand} />}
    </>
  );
}

function SelectedPortfolio({ model, condensed, maxHeight, isFullscreen, onExpand, onClose }: {
  model: SelectedModel;
  condensed: boolean;
  maxHeight: number | null;
  isFullscreen: boolean;
  onExpand: (() => void) | null;
  onClose: (() => void) | null;
}) {
  const callTool = useAdaptiveCallToolFn();
  const capabilities = useAdaptiveHostCapabilities();
  const owner = useRef(model);
  owner.current = model;
  const requestId = useRef(0);
  const mounted = useRef(true);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [stored, setStored] = useState<SelectedSession | null>(null);
  const [pending, setPending] = useState<SelectedModel | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const initialCollection = useMemo(() => accumulatePortfolioRows(null, model.read)!, [model]);
  const session: SelectedSession = stored?.owner === model ? stored : {
    owner: model, screen: { model, collection: initialCollection, target: null, scrollTop: 0, focusKey: null },
    history: [], problem: null, restore: false,
  };
  const { screen, problem } = session;
  const { read } = screen.model;
  const source = portfolioHoldingsSource(read);
  const selection = read.selection;
  const busy = pending === model;
  const expired = Date.now() >= Date.parse(read.expiresAt) || Boolean(problem && 'expired' in problem && problem.expired);
  const locked = problem !== null || expired;
  const isDetail = screen.target === null && selection.view === 'detail' && selection.match === 'matched';
  const isTargets = screen.target === null && selection.view === 'targets';
  const isHoldings = !isDetail && !isTargets && screen.target === null;
  const displayValue = source ? source.portfolioValueUsd ?? (source.pricedHoldings > 0 ? source.pricedValueUsd : null) : null;
  const expand = () => onExpand?.();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; };
  }, []);

  useEffect(() => {
    const remaining = Date.parse(read.expiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setClockTick((value) => value + 1), Math.min(remaining + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [read.expiresAt, clockTick]);

  useEffect(() => {
    if (stored?.owner !== model) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      if (stored.restore) {
        container.scrollTop = stored.screen.scrollTop;
        const element = [...container.querySelectorAll<HTMLElement>('[data-holding-key]')]
          .find((item) => item.dataset.holdingKey === stored.screen.focusKey);
        element?.focus({ preventScroll: true });
      } else {
        container.scrollTop = 0;
        container.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [stored, model]);

  const captureScreen = (focusKey: string | null = null): SelectedScreen => ({ ...screen,
    scrollTop: scrollRef.current?.scrollTop ?? 0, focusKey });

  const request = async (view: PortfolioReadView | 'next' | 'refresh', holding?: CompactPortfolioHolding) => {
    if (!capabilities.callTool || busy || (locked && view !== 'refresh')) return;
    if (view !== 'refresh' && Date.now() >= Date.parse(read.expiresAt)) {
      setClockTick((value) => value + 1);
      return;
    }
    const requestOwner = model;
    const id = ++requestId.current;
    const args = view === 'refresh' ? { view: 'summary', network: read.network, readVersion: 3 } : portfolioReadRequest(read, view, holding);
    const savedScreen = captureScreen(holding ? holdingKey(holding) : null);
    if (view === 'detail' || view === 'holdings' || view === 'next') expand();
    setPending(requestOwner);
    let next: PortfolioViewModel;
    try {
      const result = await callTool('dexter_wallet_portfolio', args);
      next = normalizeDexterPortfolio(result);
      if (next.state === 'selected' && (result.isError || (view === 'refresh'
        ? next.read.contractVersion !== 'opendexter.portfolio.v3' || next.read.selection.view !== 'summary' || next.read.walletAddress !== read.walletAddress || next.read.network !== read.network
        : !portfolioReadMatchesRequest(read, next.read, args)))) {
        next = { state: 'invalid', title: 'Portfolio data unavailable', body: 'The response did not match this portfolio request.' };
      }
      if (next.state === 'ready' || next.state === 'loading') {
        next = { state: 'invalid', title: 'Portfolio data unavailable', body: 'The response did not match this portfolio request.' };
      }
    } catch {
      next = { state: 'read_error', title: 'Portfolio unavailable', body: 'The portfolio request could not be completed. Refresh to try again.' };
    }
    if (!mounted.current || owner.current !== requestOwner || requestId.current !== id) return;
    setPending(null);
    if (next.state !== 'selected') {
      setStored({ ...session, owner: model, problem: next, restore: true });
      return;
    }
    const append = view === 'next' || view === 'holdings' && selection.view === 'summary';
    const collection = accumulatePortfolioRows(append ? screen.collection : null, next.read);
    if (!collection) {
      setStored({ ...session, owner: model, problem: { state: 'invalid', title: 'Portfolio data unavailable', body: 'The response did not match the holdings already displayed.' }, restore: true });
      return;
    }
    setStored({
      owner: model,
      screen: { model: next, collection, target: null, scrollTop: append ? savedScreen.scrollTop : 0, focusKey: null },
      history: view === 'refresh' || view === 'summary' ? [] : append ? session.history : [...session.history, savedScreen],
      problem: null, restore: append,
    });
  };

  const back = () => {
    if (busy) return;
    const previous = session.history.at(-1);
    if (previous) setStored({ ...session, screen: previous, history: session.history.slice(0, -1), problem: null, restore: true });
    else void request('summary');
  };
  const openTarget = (target: CompactPortfolioTarget) => {
    if (busy || locked) return;
    expand();
    setStored({ ...session, screen: { ...screen, target, scrollTop: 0, focusKey: null },
      history: [...session.history, captureScreen(target.assetId)], restore: false });
  };
  const holdingSnapshotId = read.contractVersion === 'opendexter.portfolio.v3' && read.source.kind === 'action_targets'
    ? read.source.holdingSnapshotId : read.snapshotId;
  const holdingScreens = [screen, ...session.history].filter((item) => item.model.read.snapshotId === holdingSnapshotId
    && item.model.read.walletAddress === read.walletAddress && item.model.read.network === read.network
    && portfolioHoldingsSource(item.model.read) !== null);
  const loadedHoldings = holdingScreens.flatMap((item) => item.collection.holdings);
  const correlatedSource = holdingScreens.length ? portfolioHoldingsSource(holdingScreens[0].model.read) : null;
  const allObservedLoaded = correlatedSource?.holdingsComplete && new Set(loadedHoldings.map((item) => holdingKey(item.holding))).size === correlatedSource.holdingCount;
  const heldLabel = (mint: string) => loadedHoldings.some((item) => item.holding.mint === mint)
    ? read.contractVersion === 'opendexter.portfolio.v3' ? 'Held in portfolio observation' : 'Held'
    : allObservedLoaded ? read.contractVersion === 'opendexter.portfolio.v3' ? 'Not held in portfolio observation' : 'Not held' : null;
  const hasMore = selection.nextCursor !== null || selection.view === 'summary' && source !== null && source.holdingCount > screen.collection.holdings.length;
  const narrowedSelection = selection.match === 'ambiguous' || selection.query !== null || selection.mint !== null;
  const listedCount = isTargets ? screen.collection.targets.length : screen.collection.holdings.length;
  const collectionCount = isTargets || narrowedSelection ? selection.matchedCount : source?.holdingCount ?? null;
  const coverage = source ? [
    source.omittedHoldings > 0 ? `${formatCount(source.omittedHoldings, 'holding')} could not be included.` : !source.holdingsComplete ? 'Some holdings could not be read.' : null,
    source.unpricedHoldings > 0 ? `Prices are unavailable for ${formatCount(source.unpricedHoldings, 'asset')}.` : null,
  ].filter(Boolean).join(' ') : '';
  const title = screen.target ? screen.target.name : isTargets ? 'Explore assets'
    : selection.match === 'ambiguous' ? 'Choose an asset' : narrowedSelection ? 'Matching holdings'
      : locked ? 'Last observed value' : screen.model.summary?.label === 'Priced subtotal' ? 'Priced subtotal' : 'Portfolio value';
  const detailedHolding = isDetail ? read.richHoldings[0] : null;
  const backLabel = session.history.at(-1)?.model.read.selection.view === 'targets' ? 'Back to Explore assets'
    : session.history.length === 0 && read.contractVersion === 'opendexter.portfolio.v3' && read.source.kind === 'action_targets'
      ? 'Read current portfolio' : 'Back to portfolio';

  if (problem?.state === 'authentication_required') return <StateLedger model={problem} compact={condensed} />;

  return (
    <article ref={scrollRef} className={`dxp-selected${condensed ? ' dxp-selected--condensed' : ''}`}
      data-testid="portfolio-selected" data-view={screen.target ? 'target' : selection.view}
      data-expired={expired ? 'true' : undefined}
      style={{ maxHeight: maxHeight ?? (isFullscreen ? '100dvh' : undefined) }}
      aria-labelledby="dxp-selected-title" aria-busy={busy} tabIndex={-1}>
      <header className="dxp-selected-header">
        <Lockup />
        <span>Solana</span>
        {isFullscreen && onClose ? <button type="button" onClick={onClose}>Close</button>
          : onExpand ? <button type="button" onClick={onExpand}>Expand</button> : null}
      </header>
      {session.history.length > 0 || isDetail || isTargets || screen.target !== null ? (
        <button className="dxp-selected-back" data-testid="portfolio-back" type="button"
          disabled={busy || session.history.length === 0 && (locked || !capabilities.callTool)} onClick={back}>
          <span className="dxp-selected-chevron dxp-selected-chevron--back" aria-hidden="true" />{backLabel}
        </button>
      ) : null}
      {problem || expired ? (
        <div className="dxp-selected-problem" role="alert">
          <p>{problem?.body ?? `This observation expired on ${readDate(read.expiresAt)}. Refresh to read your portfolio again.`}</p>
          {capabilities.callTool ? <button type="button" className="dxp-selected-refresh" data-testid="portfolio-refresh" onClick={() => void request('refresh')} disabled={busy}>Refresh portfolio</button> : null}
        </div>
      ) : null}
      {screen.target ? (
        <>
          <h1 id="dxp-selected-title" tabIndex={-1}>{screen.target.name}</h1>
          <p className="dxp-selected-note">{screen.target.symbol}{heldLabel(screen.target.mint) ? ` · ${heldLabel(screen.target.mint)}` : ''}</p>
          <SelectedActionFacts target={screen.target} onExpand={expand} />
          <details className="dxp-selected-disclosure" data-testid="asset-diagnostics" onToggle={(event) => { if (event.currentTarget.open) expand(); }}>
            <summary>Identity and data sources</summary>
            <dl className="dxp-selected-facts dxp-selected-facts--diagnostics">
              <Fact label="Supported asset">{screen.target.assetId}</Fact>
              <Fact label="Mint"><code>{screen.target.mint}</code></Fact>
              <Fact label="Token program">{screen.target.tokenProgram === 'token-2022' ? 'Token-2022' : 'SPL Token'}</Fact>
              <Fact label="Observed at">{readDate(read.observedAt)}</Fact>
            </dl>
          </details>
        </>
      ) : detailedHolding ? <SelectedHoldingDetail holding={detailedHolding} read={read} onExpand={expand} /> : (
        <>
          <section className={isTargets ? 'dxp-selected-explore' : 'dxp-selected-summary'}>
            <h1 id="dxp-selected-title" tabIndex={-1}>{title}</h1>
            {isTargets ? <p>Supported assets on Solana. Open an asset to see its available actions.</p> : narrowedSelection ? (
              <p className="dxp-selected-note">{selection.match === 'ambiguous' ? 'Select the matching mint and token account.' : readDate(read.observedAt)}</p>
            ) : (
              <>
                <SelectedMoney value={displayValue} />
                {source ? <p className="dxp-selected-freshness">{formatCount(source.holdingCount, source.holdingsComplete ? 'holding' : 'observed holding')} · {readDate(read.observedAt)}</p> : null}
                {coverage ? <p className="dxp-selected-note">{coverage}</p> : null}
              </>
            )}
            {selection.query ? <p className="dxp-selected-note">Results for {selection.query}</p> : null}
          </section>
          {isHoldings ? (
            <ul className="dxp-selected-list">
              {screen.collection.holdings.map(({ holding }) => {
                const row = <>
                  <span className="dxp-selected-identity"><strong>{holdingLabel(holding)}</strong>{holding.name && holding.name !== holding.symbol ? <span>{holding.name}</span> : null}
                    {holding.identityStatus === 'retired' ? <span>Registry entry retired</span>
                      : holding.identityStatus === 'unreviewed' ? <span>Identity unreviewed</span>
                        : holding.identityStatus === 'unavailable' ? <span>Identity unavailable</span> : null}
                  </span>
                  <span className="dxp-selected-values"><strong>{holding.valueUsd === null ? 'Unpriced' : formatPortfolioMoney(holding.valueUsd)}</strong>
                    <span>{holding.amountModel === 'unknown' ? 'Amount unavailable' : `${formatPortfolioQuantity(holding.displayAmount)}${holding.symbol ? ` ${holding.symbol}` : ''}`}</span>
                    <SelectedChange value={holding.change24hPercent} />
                  </span>
                  {!locked && capabilities.callTool ? <span className="dxp-selected-chevron" aria-hidden="true" /> : null}
                </>;
                return <li key={holdingKey(holding)}>
                  {!locked && capabilities.callTool ? <button type="button" className="dxp-selected-row" data-testid="holding-row" data-holding-key={holdingKey(holding)}
                    disabled={busy} aria-label={holdingDetailLabel(holding)} onClick={() => void request('detail', holding)}>{row}</button>
                    : <div className="dxp-selected-row">{row}</div>}
                  {selection.match === 'ambiguous' ? <div className="dxp-selected-ambiguous"><code>{holding.mint}</code>{holding.tokenAccount ? <code>{holding.tokenAccount}</code> : null}</div> : null}
                </li>;
              })}
            </ul>
          ) : (
            <ul className="dxp-selected-list">
              {screen.collection.targets.map((target) => {
                const actions = target.actions.filter((item) => item.available).map((item) => sentenceCase(item.action));
                return <li key={target.assetId}><button type="button" className="dxp-selected-row" data-testid="explore-asset" data-holding-key={target.assetId}
                  disabled={busy || locked} onClick={() => openTarget(target)}>
                  <span className="dxp-selected-identity"><strong>{target.symbol}</strong>{target.name !== target.symbol ? <span>{target.name}</span> : null}</span>
                  <span className="dxp-selected-values dxp-selected-values--target"><span>{actions.length > 0 ? readableList(actions) : 'Actions unavailable'}</span>{heldLabel(target.mint) ? <span>{heldLabel(target.mint)}</span> : null}</span>
                  <span className="dxp-selected-chevron" aria-hidden="true" />
                </button></li>;
              })}
            </ul>
          )}
          {selection.match === 'none' ? <p className="dxp-selected-note">{isTargets ? 'No supported assets match this request.' : source?.holdingCount === 0 && source.holdingsComplete ? 'No assets held.' : 'No matching holdings were found.'}</p> : null}
          {selection.match === 'unavailable' ? <p className="dxp-selected-note">Supported asset information is unavailable.</p> : null}
          {collectionCount !== null && listedCount < collectionCount ? <p className="dxp-selected-note" data-testid="portfolio-list-count">Showing {listedCount.toLocaleString()} of {formatCount(collectionCount, isTargets ? 'supported asset' : 'holding')}</p> : null}
          {hasMore && !locked && capabilities.callTool ? <button type="button" className="dxp-selected-more" data-testid="more-holdings" disabled={busy}
            onClick={() => void request(selection.nextCursor ? 'next' : 'holdings')}>{isTargets ? 'More assets' : 'More holdings'}</button> : null}
        </>
      )}
      {busy ? <p className="dxp-selected-note" role="status">Reading portfolio...</p> : null}
      {!locked && !capabilities.callTool ? <p className="dxp-selected-note">Ask for holdings or asset details to continue.</p> : null}
      <footer className="dxp-selected-footer">
        {(isHoldings || isDetail && read.contractVersion === 'opendexter.portfolio.v3') && !locked && capabilities.callTool ? <button type="button" data-testid="explore-assets" disabled={busy} onClick={() => void request('targets')}>Explore assets</button> : null}
        <details className="dxp-selected-disclosure" data-testid="observation-details" onToggle={(event) => { if (event.currentTarget.open) expand(); }}>
          <summary>Observation details</summary>
          <dl className="dxp-selected-facts dxp-selected-facts--diagnostics">
            <Fact label="Observed at">{readDate(read.observedAt)}</Fact>
            <Fact label="Read expires at">{readDate(read.expiresAt)}</Fact>
            <Fact label="Wallet"><code>{read.walletAddress}</code></Fact>
            {source ? <>
            <Fact label="Observed holdings">{source.holdingCount.toLocaleString()}</Fact>
            <Fact label="Loaded holdings">{new Set(loadedHoldings.map((item) => holdingKey(item.holding))).size.toLocaleString()}</Fact>
            <Fact label="Exact portfolio value (USD)">{source.portfolioValueUsd === null ? null : formatExactUsd(source.portfolioValueUsd)}</Fact>
            <Fact label="Exact priced subtotal (USD)">{formatExactUsd(source.pricedValueUsd)}</Fact>
            <Fact label="Inventory">{source.holdingsComplete ? 'Complete' : 'Incomplete'}</Fact>
            <Fact label="Omitted holdings">{source.omittedHoldings.toLocaleString()}</Fact>
            <Fact label="Pricing">{sentenceCase(source.enrichment.pricing)}</Fact>
            <Fact label="Asset metadata">{sentenceCase(source.enrichment.metadata)}</Fact>
            <Fact label="Token display data">{sentenceCase(source.enrichment.tokenExtensions)}</Fact>
            <Fact label="Solana slot">{read.contextSlot?.toLocaleString() ?? null}</Fact>
            {'identityCoverage' in source ? <>
              <Fact label="Recognized identities">{source.identityCoverage.recognized.toLocaleString()}</Fact>
              <Fact label="Unreviewed identities">{source.identityCoverage.unreviewed.toLocaleString()}</Fact>
              <Fact label="Identity verification unavailable">{source.identityCoverage.unavailable.toLocaleString()}</Fact>
              <Fact label="Trading availability">Not checked</Fact>
            </> : null}
            </> : read.contractVersion === 'opendexter.portfolio.v3' && read.source.kind === 'action_targets' ? <>
              <Fact label="Supported assets">{read.source.targetCount?.toLocaleString() ?? null}</Fact>
              <Fact label="Holdings observation">{read.source.holdingSnapshotId ? <code>{read.source.holdingSnapshotId}</code> : 'Not linked'}</Fact>
            </> : null}
          </dl>
          {!locked && capabilities.callTool ? <button type="button" data-testid="portfolio-refresh" disabled={busy} onClick={() => void request('refresh')}>Refresh portfolio</button> : null}
        </details>
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
        <SelectedPortfolio model={model} condensed={condensed} isFullscreen={isFullscreen}
          maxHeight={maxHeight === null ? null : Math.max(0, maxHeight - (isFullscreen ? hostContext.safeAreaInsets.top + hostContext.safeAreaInsets.bottom : 0))}
          onExpand={canFullscreen ? () => requestMode('fullscreen') : null}
          onClose={canReturnInline ? () => requestMode('inline') : null} />
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
