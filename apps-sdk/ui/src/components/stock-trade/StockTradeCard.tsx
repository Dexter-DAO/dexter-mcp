import { useEffect, useMemo } from 'react';

import {
  useAdaptiveOpenExternal,
  useAdaptiveTheme,
  useToolInput,
  useToolOutput,
} from '../../sdk';
import {
  WidgetEmpty,
  WidgetHeader,
  WidgetSection,
  WidgetShell,
} from '../widget';
import {
  displayShareQuantity,
  formatAtomicDecimal,
  normalizeStockTrade,
  shortenSolanaIdentity,
  type StockTradeStage,
  type StockTradeViewModel,
} from './stock-trade-model';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11 4h5v5M9 11l7-7M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusMark({ stage }: { stage: StockTradeStage }) {
  if (stage === 'success') return <CheckIcon />;
  if (stage === 'failure') return <span aria-hidden="true">×</span>;
  return <span className="dx-stock-status__pulse" aria-hidden="true" />;
}

function formatBps(value: number | null): string | null {
  if (value === null) return null;
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  const percentage = absolute / 100;
  return `${sign}${percentage.toLocaleString('en-US', {
    minimumFractionDigits: percentage % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatExpiry(value: number | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function productName(model: StockTradeViewModel): string {
  return model.product.companyName
    ?? model.product.productName
    ?? model.product.symbol
    ?? model.product.assetId
    ?? 'Selected product';
}

function ProductIdentity({ model }: { model: StockTradeViewModel }) {
  const product = model.product;
  const mint = shortenSolanaIdentity(product.mint);
  const digest = shortenSolanaIdentity(product.registryIdentityDigest, 6);
  return (
    <WidgetSection
      title="Solana product"
      description="The exact tokenized product Dexter selected for this company."
      framed
    >
      <div className="dx-stock-product">
        <div className="dx-stock-product__mark" aria-hidden="true">
          {(product.symbol ?? productName(model)).slice(0, 2).toUpperCase()}
        </div>
        <div className="dx-stock-product__identity">
          <div className="dx-stock-product__name-row">
            <strong>{productName(model)}</strong>
            {product.symbol ? <span>{product.symbol}</span> : null}
          </div>
          <p>
            {product.issuer ? `Provider: ${product.issuer}` : 'Provider information unavailable'}
          </p>
        </div>
        <span className="dx-stock-network">Solana</span>
      </div>
      <dl className="dx-stock-identity-grid">
        {mint ? (
          <div>
            <dt>Mint</dt>
            <dd title={product.mint ?? undefined}>{mint}</dd>
          </div>
        ) : null}
        {product.tokenProgram ? (
          <div>
            <dt>Token standard</dt>
            <dd>{product.tokenProgram === 'token-2022' ? 'Token-2022' : product.tokenProgram}</dd>
          </div>
        ) : null}
        {digest ? (
          <div>
            <dt>Registry proof</dt>
            <dd title={product.registryIdentityDigest ?? undefined}>{digest}</dd>
          </div>
        ) : null}
      </dl>
    </WidgetSection>
  );
}

function TradeFlow({ model }: { model: StockTradeViewModel }) {
  const requested = displayShareQuantity(model.requestedShareQuantity);
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const symbol = model.product.symbol ?? 'shares';
  const shareValue = requested ?? expected ?? minimum;
  const spend = model.quotedSpend ?? model.requestedMaximumSpend;
  const spendLabel = model.quotedSpend
    ? 'Spend'
    : model.requestedMaximumSpend
      ? 'Limit'
      : model.action === 'buy'
        ? 'Order'
        : 'Order';
  const orderState = model.stage === 'success'
    ? 'Confirmed'
    : model.stage === 'failure'
      ? 'Failed'
      : model.stage === 'pending'
        ? 'Pending'
        : 'Prepared';

  return (
    <section className="dx-stock-flow" aria-label="Trade terms">
      <div className="dx-stock-flow__side">
        <span className="dx-stock-flow__label">{spendLabel}</span>
        <strong className="dx-stock-flow__amount">
          {spend ? `$${spend}` : orderState}
        </strong>
        <span className="dx-stock-flow__unit">
          {spend ? 'USDC' : model.action === 'buy' ? 'Governed purchase' : 'Governed trade'}
        </span>
      </div>
      <span className="dx-stock-flow__arrow"><ArrowIcon /></span>
      <div className="dx-stock-flow__side dx-stock-flow__side--receive">
        <span className="dx-stock-flow__label">
          {model.action === 'buy' ? 'Buy' : model.action === 'sell' ? 'Sell' : 'Amount'}
        </span>
        <strong className="dx-stock-flow__amount">
          {shareValue ?? '—'}
        </strong>
        <span className="dx-stock-flow__unit">
          {shareValue ? `${symbol} share equivalent${shareValue === '1' ? '' : 's'}` : symbol}
        </span>
      </div>
    </section>
  );
}

type TimelineState = 'complete' | 'current' | 'waiting' | 'failed';

function timelineFor(model: StockTradeViewModel): Array<{ label: string; state: TimelineState }> {
  if (model.stage === 'success') {
    return [
      { label: 'Prepared', state: 'complete' },
      { label: 'Sent', state: 'complete' },
      { label: 'Confirmed', state: 'complete' },
    ];
  }
  if (model.stage === 'failure') {
    const sent = Boolean(model.transactionSignature);
    return [
      { label: 'Prepared', state: 'complete' },
      { label: 'Sent', state: sent ? 'complete' : 'failed' },
      { label: 'Failed', state: 'failed' },
    ];
  }
  if (model.stage === 'prepared') {
    return [
      { label: 'Prepared', state: 'complete' },
      { label: 'Sent', state: 'waiting' },
      { label: 'Confirmed', state: 'waiting' },
    ];
  }
  const sent = Boolean(model.transactionSignature)
    || ['submitted', 'confirmed'].includes(model.rawStatus);
  return [
    { label: 'Prepared', state: 'complete' },
    { label: 'Sent', state: sent ? 'complete' : 'current' },
    { label: 'Confirmed', state: sent ? 'current' : 'waiting' },
  ];
}

function TradeTimeline({ model }: { model: StockTradeViewModel }) {
  const steps = timelineFor(model);
  return (
    <ol className="dx-stock-timeline" aria-label="Transaction progress">
      {steps.map((step, index) => (
        <li key={step.label} data-state={step.state}>
          <span className="dx-stock-timeline__dot" aria-hidden="true">
            {step.state === 'complete' ? <CheckIcon /> : step.state === 'failed' ? '×' : null}
          </span>
          <span>{step.label}</span>
          {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

function QuoteDetails({ model }: { model: StockTradeViewModel }) {
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const slippage = formatBps(model.slippageBps);
  const priceImpact = formatBps(model.priceImpactBps);
  const expiry = formatExpiry(model.quoteExpiresAtUnixMs);
  const items = [
    expected ? ['Expected', `${expected} shares`] : null,
    minimum ? ['Minimum', `${minimum} shares`] : null,
    model.requestedMaximumSpend && model.quotedSpend
      ? ['Your limit', `$${model.requestedMaximumSpend} USDC`]
      : null,
    slippage ? ['Slippage', slippage] : null,
    priceImpact ? ['Price impact', priceImpact] : null,
    expiry ? ['Quote expires', expiry] : null,
  ].filter((item): item is string[] => item !== null);
  if (items.length === 0) return null;

  return (
    <dl className="dx-stock-quote-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FeeSummary({ model }: { model: StockTradeViewModel }) {
  if (!model.fees) return null;
  const networkFee = model.fees.networkFeeLamports
    ? `${formatAtomicDecimal(model.fees.networkFeeLamports, 9, 9) ?? model.fees.networkFeeLamports} SOL`
    : model.fees.networkFeeStatus === 'not-yet-calculated'
      ? 'Calculated at execution'
      : 'Not reported';
  return (
    <WidgetSection title="Fees" description={model.fees.summary}>
      <dl className="dx-stock-fees">
        <div>
          <dt>Platform fee</dt>
          <dd>{model.fees.platformFee ? 'Included in quote' : 'None'}</dd>
        </div>
        <div>
          <dt>Route fees</dt>
          <dd>{model.fees.routeFees.length > 0 ? `Included (${model.fees.routeFees.length})` : 'None reported'}</dd>
        </div>
        <div>
          <dt>Network fee</dt>
          <dd>{networkFee}</dd>
        </div>
      </dl>
    </WidgetSection>
  );
}

function StatusEvidence({ model }: { model: StockTradeViewModel }) {
  const signature = shortenSolanaIdentity(model.transactionSignature, 7);
  const solanaStatus = model.confirmationCommitment !== null
    ? 'Confirmed'
    : model.stage === 'prepared'
      ? 'Not sent'
      : model.transactionSignature
        ? 'Not confirmed'
        : 'Not sent';
  const executionStatus = model.executionSucceeded === true
    ? 'Succeeded'
    : model.executionSucceeded === false
      ? 'Failed'
      : model.confirmationCommitment !== null
        ? 'Not yet proven'
        : null;
  return (
    <section className="dx-stock-evidence" aria-label="Transaction evidence" aria-live="polite">
      <div
        data-evidence="commitment"
        data-result={model.confirmationCommitment !== null ? 'confirmed' : 'unconfirmed'}
      >
        <span>Solana status</span>
        <strong>{solanaStatus}</strong>
      </div>
      {executionStatus ? (
        <div
          data-evidence="execution"
          data-result={model.executionSucceeded === true
            ? 'succeeded'
            : model.executionSucceeded === false
              ? 'failed'
              : 'unknown'}
        >
          <span>Execution</span>
          <strong>{executionStatus}</strong>
        </div>
      ) : null}
      {signature ? (
        <div>
          <span>Signature</span>
          <strong title={model.transactionSignature ?? undefined}>{signature}</strong>
        </div>
      ) : null}
      {model.finalizedEvidence ? (
        <div>
          <span>Additional evidence</span>
          <strong>Finalized</strong>
        </div>
      ) : null}
      {model.accountDeltaObserved === true ? (
        <div>
          <span>Wallet change</span>
          <strong>{model.accountDeltaMatchesExpected === true ? 'Matches trade' : 'Observed'}</strong>
        </div>
      ) : null}
    </section>
  );
}

function TradeLoading() {
  return (
    <WidgetShell width="full">
      <div className="dx-stock-card dx-stock-card--loading" role="status" aria-live="polite" aria-label="Loading trade update">
        <span className="dx-stock-skeleton dx-stock-skeleton--eyebrow" />
        <span className="dx-stock-skeleton dx-stock-skeleton--title" />
        <div className="dx-stock-skeleton-flow">
          <span className="dx-stock-skeleton" />
          <span className="dx-stock-skeleton" />
        </div>
        <span className="dx-stock-skeleton dx-stock-skeleton--footer" />
      </div>
    </WidgetShell>
  );
}

export function StockTradeCard() {
  const output = useToolOutput<unknown>();
  const input = useToolInput<unknown>();
  const theme = useAdaptiveTheme();
  const openExternal = useAdaptiveOpenExternal();
  const model = useMemo(() => normalizeStockTrade(output, input), [output, input]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (output === null) return <TradeLoading />;

  if (!model) {
    return (
      <WidgetShell width="full">
        <div className="dx-stock-card">
          <WidgetEmpty
            title="No trade details to show"
            description="Ask OpenDexter to check the same trade again. It will not place a replacement order."
          />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell width="full">
      <article className="dx-stock-card" data-stage={model.stage}>
        <WidgetHeader
          eyebrow={{
            label: model.product.assetClass === 'stock'
              ? 'Tokenized stock · Solana'
              : 'Governed asset · Solana',
            tone: model.stage === 'success'
              ? 'success'
              : model.stage === 'failure'
                ? 'danger'
                : model.stage === 'pending'
                  ? 'warn'
                  : 'accent',
          }}
          title={model.headline}
          supporting={model.supporting}
          trailing={(
            <span className="dx-stock-status" data-stage={model.stage}>
              <StatusMark stage={model.stage} />
              {model.stageLabel}
            </span>
          )}
        />

        <TradeFlow model={model} />
        <QuoteDetails model={model} />
        <TradeTimeline model={model} />
        <ProductIdentity model={model} />
        <FeeSummary model={model} />
        <StatusEvidence model={model} />

        {model.stage === 'failure' && model.explanation ? (
          <p className="dx-stock-failure" role="alert">{model.explanation}</p>
        ) : null}

        <footer className="dx-stock-footer">
          <p>
            Share amounts are underlying-share equivalents represented by the selected Solana tokenized product.
          </p>
          {model.solscanUrl ? (
            <button
              type="button"
              className="dx-stock-explorer"
              onClick={() => openExternal(model.solscanUrl!)}
              aria-label="View this transaction on Solscan"
            >
              View on Solscan
              <ExternalIcon />
            </button>
          ) : null}
        </footer>
      </article>
    </WidgetShell>
  );
}
