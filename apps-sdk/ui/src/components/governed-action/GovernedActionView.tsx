import { useEffect, useMemo, type Ref } from 'react';

import {
  useAdaptiveDisplayMode,
  useAdaptiveHostCapabilities,
  useAdaptiveOpenExternal,
  useAdaptiveRequestDisplayMode,
  useAdaptiveTheme,
  useToolInput,
  useToolOutput,
  useToolResponseMetadata,
} from '../../sdk';
import { WidgetEmpty, WidgetShell } from '../widget';
import { useIntrinsicHeight } from '../x402/useIntrinsicHeight';
import {
  displayShareQuantity,
  formatAtomicDecimal,
  normalizeGovernedAction,
  shortenSolanaIdentity,
  type GovernedActionStage,
  type GovernedActionViewModel,
} from './governed-action-model';

const XSTOCKS_SYMBOL_URL = new URL(
  '../../assets/xstocks-symbol-gradient.svg',
  import.meta.url,
).href;
const XSTOCKS_LEGAL_ISSUER = 'Backed Assets (JE) Limited';
const XSTOCKS_PROVIDER_NAMES = new Set(['Backed Finance', 'xStocks']);

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16 10H4m5-5-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusMark({ stage }: { stage: GovernedActionStage }) {
  if (stage === 'success') return <CheckIcon />;
  if (stage === 'failure') return <span aria-hidden="true">x</span>;
  return <span className="dx-action__status-dot" aria-hidden="true" />;
}

function formatBps(value: number | null): string | null {
  if (value === null) return null;
  const percentage = value / 100;
  return `${percentage.toLocaleString('en-US', {
    minimumFractionDigits: percentage % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateTime(value: string | number | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function feeLineLabel(amountAtomic: string, mint: string): string {
  const amount = amountAtomic.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount} base units / ${shortenSolanaIdentity(mint, 5) ?? mint}`;
}

function productName(model: GovernedActionViewModel): string {
  return [
    model.product.companyName,
    model.product.productName,
    model.product.symbol,
    model.product.assetId,
  ].find((value): value is string => Boolean(value)) ?? 'Selected asset';
}

function isOfficialXStocksProduct(model: GovernedActionViewModel): boolean {
  return model.product.assetClass === 'stock'
    && model.product.legalIssuerName === XSTOCKS_LEGAL_ISSUER
    && model.product.providerName !== null
    && XSTOCKS_PROVIDER_NAMES.has(model.product.providerName);
}

function displayCode(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ');
}

function operationLabel(operation: GovernedActionViewModel['operation']): string {
  if (operation === 'prepare') return 'Preparation';
  if (operation === 'execute') return 'Execution request';
  if (operation === 'status') return 'Status read';
  if (operation === 'reconcile') return 'Reconciliation';
  return 'Governed action';
}

type Term = {
  label: string;
  value: string;
  detail?: string;
  presentation?: 'identity';
};

function exactTerms(model: GovernedActionViewModel): Term[] {
  const requested = displayShareQuantity(model.requestedShareQuantity);
  const expectedShares = displayShareQuantity(model.expectedShareQuantity);
  const minimumShares = displayShareQuantity(model.minimumShareQuantity);
  const symbol = model.product.symbol ?? model.product.assetId ?? 'asset';
  const terms: Term[] = [];

  if (model.action === 'buy') {
    if (model.quotedSpend) {
      terms.push({ label: 'Spend', value: `$${model.quotedSpend}`, detail: 'USDC' });
    }
    if (requested) {
      terms.push({
        label: 'Buy',
        value: requested,
        detail: requested === '1' ? 'share' : 'shares',
      });
    } else if (model.expectedOutput) {
      terms.push({ label: 'Expected', value: model.expectedOutput, detail: symbol });
    }
    if (minimumShares) {
      terms.push({ label: 'Minimum', value: minimumShares, detail: 'shares' });
    } else if (model.minimumOutput) {
      terms.push({ label: 'Minimum', value: model.minimumOutput, detail: symbol });
    }
  } else if (model.action === 'sell') {
    if (model.amountDisplay) {
      terms.push({ label: 'Sell', value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    if (model.expectedOutput) {
      terms.push({ label: 'Expected', value: `$${model.expectedOutput}`, detail: 'USDC' });
    }
    if (model.minimumOutput) {
      terms.push({ label: 'Minimum', value: `$${model.minimumOutput}`, detail: 'USDC' });
    }
  } else if (model.action === 'send') {
    if (model.amountDisplay) {
      terms.push({ label: 'Send', value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    const destination = shortenSolanaIdentity(model.destinationOwner, 7);
    if (destination) {
      terms.push({
        label: 'To',
        value: destination,
        detail: 'Solana address',
        presentation: 'identity',
      });
    }
  } else if (model.amountDisplay) {
    terms.push({ label: 'Amount', value: model.amountDisplay, detail: model.amountUnit ?? undefined });
  }

  if (model.requestedMaximumSpend && model.quotedSpend) {
    terms.push({ label: 'Spend limit', value: `$${model.requestedMaximumSpend}`, detail: 'USDC' });
  }
  return terms;
}

function Economics({ model }: { model: GovernedActionViewModel }) {
  const terms = exactTerms(model);
  if (terms.length === 0) return null;
  return (
    <dl className="dx-action__terms" aria-label="Exact financial terms">
      {terms.map((term) => (
        <div key={`${term.label}:${term.value}`} data-presentation={term.presentation}>
          <dt>{term.label}</dt>
          <dd>
            <strong>{term.value}</strong>
            {term.detail ? <span>{term.detail}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AssetIdentity({ model }: { model: GovernedActionViewModel }) {
  const product = model.product;
  if (!product.assetId && !product.productName && !product.symbol) return null;
  const provider = product.providerName
    ?? (product.assetClass === 'stock' ? product.issuer : null);
  return (
    <section className="dx-action__section" aria-labelledby="dx-action-asset-title">
      <h3 id="dx-action-asset-title">Asset</h3>
      <div className="dx-action__asset">
        {isOfficialXStocksProduct(model) ? (
          <img
            src={XSTOCKS_SYMBOL_URL}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="dx-action__asset-mark"
          />
        ) : null}
        <div>
          <strong>{productName(model)}</strong>
          <p>
            {[product.symbol, provider ? `Provider: ${provider}` : null]
              .filter(Boolean)
              .join(' / ')}
          </p>
        </div>
      </div>
    </section>
  );
}

function approvalLabel(model: GovernedActionViewModel): string {
  if (model.ownerDecision === 'approved') return 'Approved by owner';
  if (model.ownerDecision === 'refused') return 'Refused by owner';
  if (model.approvalRequired || model.ownerDecision === 'pending') return 'Pending in Dexter Wallet';
  if (model.ownerDecision === 'not-required') return 'Not required';
  return 'Not reported';
}

function Authority({ model }: { model: GovernedActionViewModel }) {
  const grant = shortenSolanaIdentity(model.grantId, 6);
  const expires = formatDateTime(model.authorityExpiresAt);
  const authorityPresent = model.actor !== 'unknown'
    || grant !== null
    || model.policyDecision !== null
    || model.ownerDecision !== null
    || model.approvalRequired;
  if (!authorityPresent) return null;

  const authoritySentence = model.actor === 'agent'
    ? grant
      ? `Agent authority came from mandate ${grant}.`
      : 'Dexter recorded agent authority for this action.'
    : model.actor === 'owner'
      ? 'The wallet owner acted directly.'
      : 'Dexter returned an authority decision for this action.';

  return (
    <section className="dx-action__section" aria-labelledby="dx-action-authority-title">
      <h3 id="dx-action-authority-title">Authority</h3>
      <p>{authoritySentence}</p>
      <dl className="dx-action__facts">
        <div>
          <dt>Owner approval</dt>
          <dd>{approvalLabel(model)}</dd>
        </div>
        {model.policyDecision ? (
          <div>
            <dt>Policy</dt>
            <dd>{model.policyDecision === 'allowed' ? 'Within mandate' : 'Approval required'}</dd>
          </div>
        ) : null}
        {model.grantRevision !== null ? (
          <div>
            <dt>Mandate revision</dt>
            <dd>{model.grantRevision.toLocaleString('en-US')}</dd>
          </div>
        ) : null}
        {expires ? (
          <div>
            <dt>Authority expires</dt>
            <dd>{expires}</dd>
          </div>
        ) : null}
      </dl>
      {model.approvalRequired && model.ownerDecision !== 'approved' ? (
        <p className="dx-action__approval-note">
          Approval belongs in Dexter Wallet. This view cannot grant it or execute the action.
        </p>
      ) : null}
      {model.approvalReasons.length > 0 ? (
        <p className="dx-action__reasons">
          {model.approvalReasons.map(displayCode).join(', ')}
        </p>
      ) : null}
    </section>
  );
}

function executionSentence(model: GovernedActionViewModel): string {
  if (model.stage === 'success') {
    return model.confirmationCommitment === 'finalized'
      ? 'Finalized on Solana with successful execution.'
      : 'Confirmed on Solana with successful execution.';
  }
  if (model.definitiveNonlandingProof) return 'Dexter proved that the transaction did not land.';
  if (model.stage === 'prepared') return 'The action is unsigned and has not been submitted.';
  if (model.rawStatus === 'signed') return 'The transaction is signed; submission and landing remain unproven.';
  if (model.submitted === true) return 'The transaction was submitted; landing and execution remain unproven.';
  if (model.stage === 'failure') return 'The action stopped without successful execution.';
  return 'The execution outcome remains open.';
}

function Execution({ model }: { model: GovernedActionViewModel }) {
  const signature = shortenSolanaIdentity(model.transactionSignature, 7);
  const chainStatus = model.confirmationCommitment
    ? model.confirmationCommitment === 'finalized' ? 'Finalized' : 'Confirmed'
    : model.definitiveNonlandingProof
      ? 'Proven not landed'
      : model.landingProof === true
        ? 'Landed'
        : model.submitted === true
          ? 'Submitted'
          : 'No landing proof';
  const executionStatus = model.executionSucceeded === true
    ? 'Succeeded'
    : model.executionSucceeded === false
      ? 'Failed'
      : 'Unproven';

  return (
    <section className="dx-action__section" aria-labelledby="dx-action-execution-title">
      <h3 id="dx-action-execution-title">Execution</h3>
      <p>{executionSentence(model)}</p>
      <dl className="dx-action__facts dx-action__facts--evidence" aria-live="polite">
        <div data-evidence="commitment" data-result={model.confirmationCommitment ? 'confirmed' : 'unconfirmed'}>
          <dt>Solana status</dt>
          <dd>{chainStatus}</dd>
        </div>
        <div data-evidence="execution" data-result={model.executionSucceeded === true ? 'succeeded' : model.executionSucceeded === false ? 'failed' : 'unknown'}>
          <dt>Execution</dt>
          <dd>{executionStatus}</dd>
        </div>
        {signature ? (
          <div>
            <dt>Signature</dt>
            <dd title={model.transactionSignature ?? undefined}>{signature}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function ReceiptDetails({ model }: { model: GovernedActionViewModel }) {
  const fields: Term[] = [
    { label: 'Operation', value: operationLabel(model.operation) },
    model.intentId ? { label: 'Intent', value: shortenSolanaIdentity(model.intentId, 7) ?? model.intentId } : null,
    model.attemptId ? { label: 'Attempt', value: shortenSolanaIdentity(model.attemptId, 7) ?? model.attemptId } : null,
    model.requestId ? { label: 'Request', value: shortenSolanaIdentity(model.requestId, 7) ?? model.requestId } : null,
    model.protocolId ? { label: 'Protocol', value: model.protocolId } : null,
    model.product.mint ? { label: 'Mint', value: shortenSolanaIdentity(model.product.mint, 7) ?? model.product.mint } : null,
    model.product.tokenProgram ? { label: 'Token standard', value: model.product.tokenProgram === 'token-2022' ? 'Token-2022' : model.product.tokenProgram } : null,
    model.product.legalIssuerName ? { label: 'Legal issuer', value: model.product.legalIssuerName } : null,
    model.reconcileOutcome ? { label: 'Reconciliation', value: displayCode(model.reconcileOutcome) } : null,
    model.reconcilePhase ? { label: 'Reconciliation phase', value: displayCode(model.reconcilePhase) } : null,
    model.reconcileMutated !== null
      ? { label: 'Reconciliation change', value: model.reconcileMutated ? 'State advanced' : 'No state change' }
      : null,
    model.settlementFinalized !== null
      ? { label: 'Settlement finality', value: model.settlementFinalized ? 'Finalized' : 'Not finalized' }
      : null,
    model.accountDeltaObserved !== null
      ? { label: 'Account delta', value: model.accountDeltaObserved ? 'Observed' : 'Not observed' }
      : null,
    model.accountDeltaMatchesExpected !== null
      ? { label: 'Expected delta', value: model.accountDeltaMatchesExpected ? 'Matched' : 'Did not match' }
      : null,
    model.statusReadSafe === true ? { label: 'Status read', value: 'Read-only' } : null,
    model.reconcileSameAttemptOnly === true
      ? { label: 'Reconciliation scope', value: 'Same attempt only' }
      : null,
    model.executeFromStatusForbidden === true
      ? { label: 'Execute from status', value: 'Forbidden' }
      : null,
    model.receiptPhases.length > 0 ? { label: 'Receipt phases', value: model.receiptPhases.map(displayCode).join(', ') } : null,
    model.evidenceDigest ? { label: 'Execution evidence', value: shortenSolanaIdentity(model.evidenceDigest, 7) ?? model.evidenceDigest } : null,
    model.reconciliationEvidenceDigest ? { label: 'Reconciliation evidence', value: shortenSolanaIdentity(model.reconciliationEvidenceDigest, 7) ?? model.reconciliationEvidenceDigest } : null,
  ].filter((field): field is Term => field !== null);
  if (fields.length === 0) return null;

  return (
    <details className="dx-action__details">
      <summary>Receipt details</summary>
      <dl className="dx-action__receipt-grid">
        {fields.map((field) => (
          <div key={`${field.label}:${field.value}`}>
            <dt>{field.label}</dt>
            <dd title={field.value}>{field.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function QuoteDetails({ model }: { model: GovernedActionViewModel }) {
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const slippage = formatBps(model.slippageBps);
  const priceImpact = formatBps(model.priceImpactBps);
  const expiry = formatDateTime(model.quoteExpiresAtUnixMs);
  const feeLines = model.fees
    ? [
        model.fees.platformFee
          ? ['Platform fee', feeLineLabel(
              model.fees.platformFee.amountAtomic,
              model.fees.platformFee.mint,
            )]
          : null,
        ...model.fees.routeFees.map((fee, index) => [
          `Route fee ${index + 1}`,
          feeLineLabel(fee.amountAtomic, fee.mint),
        ]),
      ].filter((field): field is string[] => field !== null)
    : [];
  const fields = [
    expected ? ['Expected shares', expected] : null,
    minimum ? ['Minimum shares', minimum] : null,
    slippage ? ['Slippage limit', slippage] : null,
    priceImpact ? ['Price-impact limit', priceImpact] : null,
    expiry ? ['Quote expires', expiry] : null,
    model.fees ? ['Fees', model.fees.summary] : null,
    model.fees?.networkFeeStatus === 'not-yet-calculated'
      ? ['Network fee', 'Calculated at execution']
      : model.fees?.networkFeeLamports
        ? ['Network fee', `${formatAtomicDecimal(model.fees.networkFeeLamports, 9, 9) ?? model.fees.networkFeeLamports} SOL`]
        : null,
    ...feeLines,
  ].filter((field): field is string[] => field !== null);
  if (fields.length === 0) return null;

  return (
    <details className="dx-action__details">
      <summary>Quote details</summary>
      <dl className="dx-action__receipt-grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function GovernedLoading({ rootRef }: { rootRef: Ref<HTMLDivElement> }) {
  return (
    <WidgetShell width="full" rootRef={rootRef}>
      <div className="dx-action dx-action--loading" role="status" aria-live="polite" aria-label="Loading governed action">
        <span className="dx-action__skeleton dx-action__skeleton--state" />
        <span className="dx-action__skeleton dx-action__skeleton--title" />
        <span className="dx-action__skeleton dx-action__skeleton--copy" />
        <div className="dx-action__skeleton-terms">
          <span className="dx-action__skeleton" />
          <span className="dx-action__skeleton" />
        </div>
      </div>
    </WidgetShell>
  );
}

export function GovernedActionDetail({
  model,
  openExternal,
  onBack,
  compact = false,
  onExpand,
}: {
  model: GovernedActionViewModel;
  openExternal: (href: string) => void;
  onBack?: () => void;
  compact?: boolean;
  onExpand?: () => void;
}) {
  const updated = formatDateTime(model.lastActivityAt ?? model.createdAt);
  return (
    <article className={`dx-action${compact ? ' dx-action--compact' : ''}`} data-stage={model.stage} aria-live="polite">
      {onBack ? (
        <button type="button" className="dx-action__back" onClick={onBack}>
          <BackIcon />
          Back to history
        </button>
      ) : null}

      <header className="dx-action__header">
        <div className="dx-action__status" data-stage={model.stage}>
          <StatusMark stage={model.stage} />
          <span>{model.stageLabel}</span>
          {updated ? <time dateTime={model.lastActivityAt ?? model.createdAt ?? undefined}>{updated}</time> : null}
        </div>
        <h2>{model.headline}</h2>
        <p>{model.supporting}</p>
      </header>

      <Economics model={model} />

      {compact ? (
        <section className="dx-action__compact-evidence" aria-label="Authority and execution summary">
          <dl className="dx-action__facts">
            <div>
              <dt>Owner approval</dt>
              <dd>{approvalLabel(model)}</dd>
            </div>
            <div data-evidence="execution" data-result={model.executionSucceeded === true ? 'succeeded' : model.executionSucceeded === false ? 'failed' : 'unknown'}>
              <dt>Execution</dt>
              <dd>{executionSentence(model)}</dd>
            </div>
          </dl>
          {model.approvalRequired && model.ownerDecision !== 'approved' ? (
            <p className="dx-action__approval-note">
              Approval belongs in Dexter Wallet. This view cannot grant it or execute the action.
            </p>
          ) : null}
          {model.recovery.sentence ? (
            <p className="dx-action__recovery" data-kind={model.recovery.kind} role="status">
              {model.recovery.sentence}
            </p>
          ) : null}
          {onExpand ? (
            <button type="button" className="dx-action__expand" onClick={onExpand}>
              View full receipt
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <Authority model={model} />
          <Execution model={model} />
          <AssetIdentity model={model} />

          {model.explanation && model.explanation !== model.supporting ? (
            <p className="dx-action__explanation" role={model.stage === 'failure' ? 'alert' : undefined}>
              {model.explanation}
            </p>
          ) : null}

          {model.recovery.sentence ? (
            <p className="dx-action__recovery" data-kind={model.recovery.kind} role="status">
              {model.recovery.sentence}
            </p>
          ) : null}

          <QuoteDetails model={model} />
          <ReceiptDetails model={model} />

          {model.solscanUrl ? (
            <button
              type="button"
              className="dx-action__external"
              onClick={() => openExternal(model.solscanUrl!)}
              aria-label="View this transaction on Solscan"
            >
              View on Solscan
              <ExternalIcon />
            </button>
          ) : null}
        </>
      )}
    </article>
  );
}

export function GovernedActionView() {
  const output = useToolOutput<unknown>();
  const responseMetadata = useToolResponseMetadata<Record<string, unknown>>();
  const renderOutput = output
    ?? responseMetadata?.['dexter/governedWidgetResult']
    ?? null;
  const input = useToolInput<unknown>();
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const openExternal = useAdaptiveOpenExternal();
  const rootRef = useIntrinsicHeight<HTMLDivElement>();
  const model = useMemo(
    () => normalizeGovernedAction(renderOutput, input),
    [renderOutput, input],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const canExpand = Boolean(requestDisplayMode && hostCapabilities.requestDisplayMode);
  const isFullscreen = displayMode === 'fullscreen';
  const requestMode = (mode: 'inline' | 'fullscreen') => {
    if (!requestDisplayMode) return;
    void requestDisplayMode({ mode }).catch(() => {});
  };

  if (renderOutput === null) return <GovernedLoading rootRef={rootRef} />;

  return (
    <WidgetShell width="full" rootRef={rootRef}>
      {model ? (
        <GovernedActionDetail
          model={model}
          openExternal={openExternal}
          compact={!isFullscreen && canExpand}
          onExpand={canExpand ? () => requestMode('fullscreen') : undefined}
        />
      ) : (
        <WidgetEmpty
          title="No governed-action details available"
          description="Read the same intent again. This view will not start an execution."
        />
      )}
    </WidgetShell>
  );
}

export default GovernedActionView;
