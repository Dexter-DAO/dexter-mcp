import { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Pager } from './Pager';
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

function BoundedReasonText({ reason, suffix = '' }: { reason: string; suffix?: string }) {
  const exact = `${reason}${suffix}`;
  const normalized = reason.replace(/\s+/g, ' ').trim();
  const truncated = normalized.length > 96;
  const visible = truncated
    ? `${normalized.slice(0, 95)}…`
    : normalized;
  return (
    <span className="dxw-bounded-reason" title={exact}>
      {truncated ? (
        <>
          <span aria-hidden="true">{visible}{suffix}</span>
          <span className="sr-only">{exact}</span>
        </>
      ) : `${visible}${suffix}`}
    </span>
  );
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
  compact = false,
  onBack,
}: {
  holding: PortfolioHolding;
  receiveAvailable: boolean;
  onReceive: () => void;
  compact?: boolean;
  onBack?: () => void;
}) {
  const reasonListId = useId();
  const detailTitleId = useId();
  const detailRef = useRef<HTMLDivElement>(null);
  const [compactPage, setCompactPage] = useState(0);
  const status = approvalCopy(holding);
  const account = accountStateCopy(holding);
  const visibleActions = PORTFOLIO_ACTIONS.filter((action) => action !== 'view');
  const facts = [
    { label: 'Asset', value: holding.assetClass, className: undefined },
    { label: 'Program', value: holding.tokenProgram, className: undefined },
    {
      label: 'Display',
      value: holding.amountModel === 'scaled-ui-amount'
        ? `Scaled × ${holding.displayMultiplier}`
        : holding.amountModel === 'unknown'
          ? 'Amount semantics unavailable'
          : 'Token decimals',
      className: undefined,
    },
    { label: 'Review', value: status.label, className: `dxw-asset-status-${status.tone}` },
    { label: 'Account', value: account.label, className: `dxw-asset-status-${account.tone}` },
  ];
  const actions = visibleActions.map((action) => ({
    action,
    label: action.charAt(0).toUpperCase() + action.slice(1),
    state: getPortfolioActionState(holding, action, {
      receiveHandlerAvailable: receiveAvailable,
    }),
  }));
  const unavailableGroups = groupPortfolioUnavailableActions(
    holding,
    visibleActions,
    { receiveHandlerAvailable: receiveAvailable },
  );
  const factPageCount = Math.ceil(facts.length / 3);
  const actionPageCount = Math.ceil(actions.length / 4);
  const compactPageCount = factPageCount + actionPageCount + unavailableGroups.length;
  const safeCompactPage = Math.min(compactPage, compactPageCount - 1);
  const factStart = safeCompactPage < factPageCount ? safeCompactPage * 3 : -1;
  const actionPage = safeCompactPage - factPageCount;
  const actionStart = actionPage >= 0 && actionPage < actionPageCount ? actionPage * 4 : -1;
  const reasonIndex = safeCompactPage - factPageCount - actionPageCount;
  const shownFacts = compact && factStart >= 0 ? facts.slice(factStart, factStart + 3) : facts;
  const shownActions = compact && actionStart >= 0
    ? actions.slice(actionStart, actionStart + 4)
    : actions;
  const shownReasonGroups = compact && reasonIndex >= 0
    ? unavailableGroups.slice(reasonIndex, reasonIndex + 1)
    : unavailableGroups;
  const showFacts = !compact || factStart >= 0;
  const showActions = !compact || actionStart >= 0;
  const showReasons = unavailableGroups.length > 0 && (!compact || reasonIndex >= 0);

  useEffect(() => {
    if (compact) detailRef.current?.focus();
  }, [compact]);

  useEffect(() => {
    if (compactPage > compactPageCount - 1) {
      setCompactPage(Math.max(0, compactPageCount - 1));
    }
  }, [compactPage, compactPageCount]);

  return (
    <div
      className={`dxw-asset-details${compact ? ' dxw-asset-details--compact' : ''}`}
      ref={detailRef}
      tabIndex={compact ? -1 : undefined}
      role={compact ? 'region' : undefined}
      aria-labelledby={compact ? detailTitleId : undefined}
    >
      {compact ? (
        <div className="dxw-asset-detail-identity">
          <span>
            <strong id={detailTitleId}>{holding.symbol}</strong>
            <small>{holding.name}</small>
          </span>
          <span>
            <strong
              className="dxw-asset-amount dxw-mono"
              data-exact-value={holding.displayAmount}
              title={`Exact display amount: ${holding.displayAmount}`}
            >
              <span aria-hidden="true">{formatPortfolioAmount(holding.displayAmount)}</span>
              <span className="sr-only">Exact display amount: {holding.displayAmount}</span>
            </strong>
            <small
              data-exact-value={holding.valueUsd ?? undefined}
              title={holding.valueUsd === null ? undefined : `Exact value: ${holding.valueUsd} USD`}
            >
              {holding.valueUsd === null ? 'Unpriced' : (
                <>
                  <span aria-hidden="true">{formatPortfolioUsd(holding.valueUsd)}</span>
                  <span className="sr-only">Exact value: {holding.valueUsd} USD</span>
                </>
              )}
            </small>
          </span>
        </div>
      ) : null}
      {showFacts ? <dl className="dxw-asset-facts">
        {shownFacts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd className={fact.className}>{fact.value}</dd>
          </div>
        ))}
      </dl> : null}
      {showActions ? <div className="dxw-asset-actions" aria-label={`${holding.symbol} actions`}>
        {shownActions.map(({ action, label, state }) => (
            <button
              key={action}
              className={action === 'receive' && state.available ? 'dxw-asset-action-live' : ''}
              disabled={!state.available}
              onClick={state.available && action === 'receive' ? onReceive : undefined}
              aria-describedby={!compact && !state.available ? reasonListId : undefined}
              aria-label={compact && !state.available
                ? `${label} unavailable: ${state.reason}`
                : undefined}
              type="button"
            >
              {label}
            </button>
        ))}
      </div> : null}
      {showReasons ? (
        <div className="dxw-asset-reasons" id={reasonListId}>
          <span className="dxw-asset-reasons-label">Unavailable</span>
          <ul>
            {shownReasonGroups.map((group) => (
              <li key={`${group.reason}:${group.actions.join(',')}`}>
                <span>
                  {group.actions
                    .map((action) => action.charAt(0).toUpperCase() + action.slice(1))
                    .join(', ')}
                </span>
                <BoundedReasonText reason={group.reason} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {compact ? (
        <nav className="dxw-pager" aria-label="Asset detail pages">
          <span aria-live="polite">Detail {safeCompactPage + 1} of {compactPageCount}</span>
          <span className="dxw-pager__actions">
            <button
              type="button"
              onClick={() => {
                if (safeCompactPage === 0) onBack?.();
                else setCompactPage((current) => current - 1);
              }}
            >
              {safeCompactPage === 0 ? 'Assets' : 'Previous'}
            </button>
            <button
              type="button"
              disabled={safeCompactPage === compactPageCount - 1}
              onClick={() => setCompactPage((current) => (
                Math.min(compactPageCount - 1, current + 1)
              ))}
            >
              Next
            </button>
          </span>
        </nav>
      ) : null}
    </div>
  );
}

export function AssetsSheet({
  portfolio,
  receiveAvailable,
  onReceive,
  onClose,
  isFullscreen,
  condensed,
}: {
  portfolio: PortfolioReadState;
  receiveAvailable: boolean;
  onReceive: (holding: PortfolioHolding) => void;
  onClose: () => void;
  isFullscreen: boolean;
  condensed: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const holdings = portfolio.snapshot?.holdings ?? [];
  const pageSize = isFullscreen ? Math.max(1, holdings.length) : condensed ? 1 : 3;
  const pageCount = Math.max(1, Math.ceil(holdings.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageHoldings = holdings.slice(pageStart, pageStart + pageSize);
  const expandedIndex = expanded === null
    ? -1
    : holdings.findIndex((holding, index) => holdingKey(holding, index) === expanded);
  const expandedHolding = expandedIndex >= 0 ? holdings[expandedIndex] : null;
  const visibleHoldings = pageHoldings;
  const inlineDetail = !isFullscreen && expandedIndex >= 0;

  const changePage = (nextPage: number) => {
    setExpanded(null);
    setPage(nextPage);
  };

  const closeInlineDetail = () => {
    const key = expanded;
    setExpanded(null);
    requestAnimationFrame(() => {
      if (key) rowRefs.current.get(key)?.focus();
    });
  };

  return (
    <Sheet title="Assets" onClose={onClose}>
      {!inlineDetail ? <PortfolioSummary portfolio={portfolio} /> : null}
      {inlineDetail && expandedHolding ? (
        <HoldingDetails
          holding={expandedHolding}
          receiveAvailable={receiveAvailable}
          onReceive={() => onReceive(expandedHolding)}
          compact
          onBack={closeInlineDetail}
        />
      ) : holdings.length > 0 ? (
        <div className="dxw-assets-list">
          {visibleHoldings.map((holding) => {
            const index = holdings.indexOf(holding);
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
                    ref={(element) => {
                      if (element) rowRefs.current.set(key, element);
                      else rowRefs.current.delete(key);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`${holding.symbol} ${holding.name}. Exact display amount ${holding.displayAmount}.${holding.valueUsd === null ? ' Unpriced.' : ` Exact value ${holding.valueUsd} USD.`}`}
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
                    <BoundedReasonText
                      reason={viewState.reason || 'Unavailable'}
                      suffix=". Details are blocked."
                    />
                  </div>
                ) : null}
                {isExpanded ? (
                  <HoldingDetails
                    holding={holding}
                    receiveAvailable={receiveAvailable}
                    onReceive={() => onReceive(holding)}
                    compact={false}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : portfolio.status === 'available' ? (
        <div className="dxw-assets-empty">No holdings in this verified snapshot.</div>
      ) : null}
      {!inlineDetail ? (
        <Pager
          label="Asset pages"
          page={safePage}
          pageCount={pageCount}
          start={holdings.length === 0 ? 0 : pageStart + 1}
          end={pageStart + pageHoldings.length}
          total={holdings.length}
          onPage={changePage}
        />
      ) : null}
      {portfolio.status !== 'unavailable' && !inlineDetail ? (
        <div className="dxw-assets-footnote">
          Balances are read-only. Estimated portfolio values do not change your
          spendable balance or available credit.
        </div>
      ) : null}
    </Sheet>
  );
}
