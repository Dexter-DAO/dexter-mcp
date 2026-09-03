import { useEffect, useMemo } from 'react';

import {
  useAdaptiveMaxHeight,
  useAdaptiveTheme,
  useToolOutput,
} from '../../sdk';
import { Lockup } from '../wallet/Lockup';
import { useIntrinsicHeight } from '../x402/useIntrinsicHeight';
import {
  formatExactDecimal,
  formatExactUsd,
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

function ReadyLedger({ model }: { model: Extract<PortfolioViewModel, { state: 'ready' }> }) {
  const { summary } = model;
  return (
    <article className="dxp-ledger" aria-labelledby="dxp-title">
      <header className="dxp-header">
        <WalletLockup />
      </header>

      <section className="dxp-hero" aria-label="Portfolio summary">
        <h1 id="dxp-title">Portfolio</h1>
        <strong
          className={summary.value === null ? 'dxp-unknown' : undefined}
          aria-label={summary.label}
        >
          {summary.value ?? 'Unknown'}
        </strong>
        {summary.label === 'Priced subtotal' ? <p>Priced subtotal.</p> : null}
        {model.coverage ? <p className="dxp-coverage" role="status">{model.coverage}</p> : null}
      </section>

      <Holdings model={model} />
      <ApprovedTargets targets={model.snapshot.approvedActionTargets} />
      <ReadDetails model={model} />
    </article>
  );
}

function LoadingLedger() {
  return (
    <article className="dxp-ledger dxp-ledger--loading" aria-busy="true" aria-label="Loading portfolio">
      <header className="dxp-header">
        <WalletLockup />
      </header>
      <section className="dxp-hero">
        <h1>Portfolio</h1>
        <div className="dxp-skeleton dxp-skeleton--value" />
        <div className="dxp-skeleton dxp-skeleton--line" />
      </section>
      <div className="dxp-skeleton dxp-skeleton--asset" />
      <span className="dxp-visually-hidden">Loading the current portfolio.</span>
    </article>
  );
}

function StateLedger({ model }: {
  model: Extract<PortfolioViewModel, {
    state: 'authentication_required' | 'read_error' | 'invalid';
  }>;
}) {
  return (
    <article className="dxp-ledger dxp-ledger--state" aria-labelledby="dxp-state-title">
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
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const model = useMemo(() => normalizeDexterPortfolio(toolOutput), [toolOutput]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div
      className="dxp-root"
      ref={rootRef}
      style={maxHeight === null ? undefined : { maxHeight }}
    >
      {model.state === 'loading' ? <LoadingLedger /> : null}
      {model.state === 'ready' ? <ReadyLedger model={model} /> : null}
      {model.state !== 'loading' && model.state !== 'ready' ? <StateLedger model={model} /> : null}
    </div>
  );
}
