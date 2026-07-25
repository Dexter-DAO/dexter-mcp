import { useId, useState } from 'react';
import { Sheet } from './Sheet';
import {
  PORTFOLIO_ACTIONS,
  formatPortfolioAmount,
  formatPortfolioUsd,
  getPortfolioActionState,
  groupPortfolioUnavailableActions,
  type PortfolioHolding,
  type PortfolioReadState,
} from './portfolioModel';
import { Chevron } from './icons';

function holdingKey(holding: PortfolioHolding, index: number): string {
  return `${holding.mint}:${holding.tokenAccount ?? 'native'}:${index}`;
}

function approvalCopy(holding: PortfolioHolding): { label: string; detail: string; tone: string } {
  if (holding.approval.status === 'blocked') {
    return {
      label: 'Blocked',
      detail: 'Token program does not match the reviewed asset',
      tone: 'blocked',
    };
  }
  if (holding.approval.status === 'unreviewed') {
    return {
      label: 'Unreviewed',
      detail: 'Visible, but not approved for wallet actions',
      tone: 'caution',
    };
  }
  return { label: 'Reviewed', detail: 'Verified asset identity', tone: 'approved' };
}

function accountStateCopy(
  holding: PortfolioHolding,
): { label: string; detail: string; tone: string } {
  if (holding.accountState === 'frozen') {
    return {
      label: 'Frozen',
      detail: 'This token account cannot move assets',
      tone: 'blocked',
    };
  }
  if (holding.accountState === 'unknown') {
    return {
      label: 'State unknown',
      detail: 'Account state could not be verified',
      tone: 'caution',
    };
  }
  return { label: 'Active', detail: 'Token account state verified', tone: 'approved' };
}

function enrichmentCopy(
  kind: 'metadata' | 'pricing' | 'tokenExtensions',
  status: 'partial' | 'unavailable',
): string {
  const copy = {
    metadata: {
      partial: 'Some asset details incomplete',
      unavailable: 'Asset details unavailable',
    },
    pricing: {
      partial: 'Some prices unavailable',
      unavailable: 'Prices unavailable',
    },
    tokenExtensions: {
      partial: 'Some token details incomplete',
      unavailable: 'Token details unavailable',
    },
  } as const;
  return copy[kind][status];
}

type PortfolioImageCandidate = {
  sourceUrl: string;
  proxyUrl: string;
};

function portfolioImageUrls(holding: PortfolioHolding): PortfolioImageCandidate[] {
  return [
    holding.graphics.canonicalImageUrl,
    holding.graphics.dexScreenerImageUrl,
    holding.graphics.openGraphImageUrl,
  ]
    .filter((source): source is string => Boolean(source))
    .filter((source, index, sources) => sources.indexOf(source) === index)
    .map((sourceUrl) => ({
      sourceUrl,
      proxyUrl: `https://api.dexter.cash/api/img?url=${encodeURIComponent(sourceUrl)}`,
    }));
}

function AssetMark({ holding }: { holding: PortfolioHolding }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const image =
    holding.approval.status === 'approved'
      ? portfolioImageUrls(holding).find(({ proxyUrl }) => !failedUrls.includes(proxyUrl))
      : undefined;
  const fallbackMark =
    holding.approval.status === 'unreviewed'
      ? '?'
      : holding.approval.status === 'blocked'
        ? '×'
        : holding.symbol.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={[
        'dxw-asset-mark',
        `dxw-asset-mark-${holding.assetClass}`,
        image ? 'dxw-asset-mark-artwork' : 'dxw-asset-mark-fallback',
      ].join(' ')}
    >
      {image ? (
        <img
          src={image.proxyUrl}
          data-source-url={image.sourceUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() =>
            setFailedUrls((current) =>
              current.includes(image.proxyUrl) ? current : [...current, image.proxyUrl],
            )
          }
        />
      ) : (
        fallbackMark
      )}
    </span>
  );
}

function PortfolioSummary({ portfolio }: { portfolio: PortfolioReadState }) {
  if (portfolio.status === 'unavailable') {
    return (
      <div className="dxw-assets-unavailable" role="status">
        <div className="dxw-assets-unavailable-title">Assets unavailable</div>
        <p>
          Your wallet is still available. The portfolio inventory could not be
          verified, so no asset count or value is shown.
        </p>
      </div>
    );
  }

  const { snapshot } = portfolio;
  const hasCompleteTotal = snapshot.portfolioValueUsd !== null;
  const shownValue = snapshot.portfolioValueUsd ?? snapshot.pricedValueUsd;
  const disclosures: string[] = [];
  if (!snapshot.holdingsComplete) disclosures.push('inventory incomplete');
  if (snapshot.unpricedHoldings > 0) {
    disclosures.push(
      `${snapshot.unpricedHoldings} unpriced ${snapshot.unpricedHoldings === 1 ? 'holding' : 'holdings'}`,
    );
  }
  if (snapshot.omittedHoldings > 0) {
    disclosures.push(
      `${snapshot.omittedHoldings} omitted ${snapshot.omittedHoldings === 1 ? 'holding' : 'holdings'}`,
    );
  }
  if (snapshot.holdings.some((holding) => holding.amountModel === 'unknown')) {
    disclosures.push('Some display amounts need review');
  }
  const degraded = Object.entries(snapshot.enrichment)
    .filter(([, status]) => status !== 'complete')
    .map(([kind, status]) =>
      enrichmentCopy(
        kind as 'metadata' | 'pricing' | 'tokenExtensions',
        status as 'partial' | 'unavailable',
      ),
    );
  disclosures.push(...degraded);

  return (
    <div className="dxw-assets-summary">
      <div className="dxw-assets-summary-label">
        {hasCompleteTotal ? 'Portfolio value' : 'Priced subtotal'}
      </div>
      <div
        className="dxw-assets-summary-value dxw-mono"
        data-exact-value={shownValue}
        title={`Exact value: ${shownValue} USD`}
      >
        {formatPortfolioUsd(shownValue)}
      </div>
      <div className="dxw-assets-summary-meta">
        {snapshot.holdings.length}{' '}
        {snapshot.holdings.length === 1 ? 'holding' : 'holdings'}
        {' · '}read-only inventory
      </div>
      {!hasCompleteTotal || portfolio.status === 'partial' ? (
        <div className="dxw-assets-disclosure">
          {hasCompleteTotal
            ? disclosures.join(' · ') || 'Some details could not be verified'
            : `No portfolio total · ${
                disclosures.join(' · ') || 'Not all details could be verified'
              }`}
        </div>
      ) : null}
    </div>
  );
}

function HoldingDetails({
  holding,
  receiveAvailable,
  onReceive,
}: {
  holding: PortfolioHolding;
  receiveAvailable: boolean;
  onReceive: () => void;
}) {
  const reasonListId = useId();
  const status = approvalCopy(holding);
  const account = accountStateCopy(holding);
  const visibleActions = PORTFOLIO_ACTIONS.filter((action) => action !== 'view');
  const unavailableGroups = groupPortfolioUnavailableActions(
    holding,
    visibleActions,
    { receiveHandlerAvailable: receiveAvailable },
  );

  return (
    <div className="dxw-asset-details">
      <dl className="dxw-asset-facts">
        <div>
          <dt>Asset</dt>
          <dd>{holding.assetClass}</dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{holding.tokenProgram}</dd>
        </div>
        <div>
          <dt>Display</dt>
          <dd>
            {holding.amountModel === 'scaled-ui-amount'
              ? `Scaled × ${holding.displayMultiplier}`
              : holding.amountModel === 'unknown'
                ? 'Amount semantics unavailable'
                : 'Token decimals'}
          </dd>
        </div>
        <div>
          <dt>Review</dt>
          <dd className={`dxw-asset-status-${status.tone}`}>{status.label}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className={`dxw-asset-status-${account.tone}`}>{account.label}</dd>
        </div>
      </dl>
      <div className="dxw-asset-actions" aria-label={`${holding.symbol} actions`}>
        {visibleActions.map((action) => {
          const state = getPortfolioActionState(holding, action, {
            receiveHandlerAvailable: receiveAvailable,
          });
          const label = action.charAt(0).toUpperCase() + action.slice(1);
          return (
            <button
              key={action}
              className={action === 'receive' && state.available ? 'dxw-asset-action-live' : ''}
              disabled={!state.available}
              onClick={state.available && action === 'receive' ? onReceive : undefined}
              aria-describedby={!state.available ? reasonListId : undefined}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      {unavailableGroups.length > 0 ? (
        <div className="dxw-asset-reasons" id={reasonListId}>
          <span className="dxw-asset-reasons-label">Unavailable</span>
          <ul>
            {unavailableGroups.map((group) => (
              <li key={`${group.reason}:${group.actions.join(',')}`}>
                <span>
                  {group.actions
                    .map((action) => action.charAt(0).toUpperCase() + action.slice(1))
                    .join(', ')}
                </span>
                <span>{group.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AssetsSheet({
  portfolio,
  receiveAvailable,
  onReceive,
  onClose,
}: {
  portfolio: PortfolioReadState;
  receiveAvailable: boolean;
  onReceive: (holding: PortfolioHolding) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const holdings = portfolio.snapshot?.holdings ?? [];

  return (
    <Sheet title="Assets" onClose={onClose}>
      <PortfolioSummary portfolio={portfolio} />
      {holdings.length > 0 ? (
        <div className="dxw-assets-list">
          {holdings.map((holding, index) => {
            const key = holdingKey(holding, index);
            const isExpanded = expanded === key;
            const status = approvalCopy(holding);
            const account = accountStateCopy(holding);
            const viewState = getPortfolioActionState(holding, 'view');
            const rowFlags = [
              status.tone !== 'approved' ? status.label : null,
              account.tone !== 'approved' ? account.label : null,
            ].filter((label): label is string => Boolean(label));
            const rowContent = (
              <>
                <AssetMark holding={holding} />
                <span className="dxw-asset-identity">
                  <span className="dxw-asset-name">{holding.symbol}</span>
                  <span className="dxw-asset-sub">
                    {holding.name}
                    {rowFlags.length > 0 ? ` · ${rowFlags.join(' · ')}` : ''}
                  </span>
                </span>
                <span className="dxw-asset-balance">
                  <span
                    className="dxw-asset-amount dxw-mono"
                    data-exact-value={holding.displayAmount}
                    title={`Exact display amount: ${holding.displayAmount}`}
                  >
                    {formatPortfolioAmount(holding.displayAmount)}
                  </span>
                  <span
                    className="dxw-asset-value dxw-mono"
                    data-exact-value={holding.valueUsd ?? undefined}
                  >
                    {holding.valueUsd === null
                      ? 'Unpriced'
                      : formatPortfolioUsd(holding.valueUsd)}
                  </span>
                </span>
                {viewState.available ? <Chevron /> : <span aria-hidden="true">—</span>}
              </>
            );
            return (
              <div className="dxw-asset" key={key}>
                {viewState.available ? (
                  <button
                    className="dxw-asset-row"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                    type="button"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div
                    className="dxw-asset-row dxw-asset-row-blocked"
                    role="group"
                    aria-disabled="true"
                  >
                    {rowContent}
                  </div>
                )}
                {!viewState.available ? (
                  <div className="dxw-asset-blocked-copy">
                    {viewState.reason}. Details are blocked.
                  </div>
                ) : null}
                {isExpanded ? (
                  <HoldingDetails
                    holding={holding}
                    receiveAvailable={receiveAvailable}
                    onReceive={() => onReceive(holding)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : portfolio.status === 'available' ? (
        <div className="dxw-assets-empty">No holdings in this verified snapshot.</div>
      ) : null}
      {portfolio.status !== 'unavailable' ? (
        <div className="dxw-assets-footnote">
          Balances are read-only. Estimated portfolio values do not change your
          spendable balance or available credit.
        </div>
      ) : null}
    </Sheet>
  );
}
