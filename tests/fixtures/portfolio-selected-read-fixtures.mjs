import { readFileSync } from 'node:fs';
import { modelSafePortfolioSnapshot } from '../../lib/session-portfolio.mjs';
import { approvedActionTarget } from './approved-action-target-fixtures.mjs';

// Retained output from the actual API reader with offline provider/account input.
// This does not represent a live account or provider observation.
const retained = JSON.parse(readFileSync(new URL('./portfolio-market-context-api.json', import.meta.url), 'utf8'));
export const SNAPSHOT_ID = 'selected-read-offline-snapshot';
export const EXPIRES_AT = '2026-07-25T10:35:00.000Z';
export const NEXT_CURSOR = 'selected-read-offline-continuation';
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

export function retainedPortfolioSource() {
  return structuredClone(retained.snapshot);
}

export function retainedRichHoldings() {
  return modelSafePortfolioSnapshot(retainedPortfolioSource()).holdings;
}

export function compactHolding(holding) {
  const { assetId, mint, tokenAccount, symbol, name, displayAmount, amountModel, valueUsd, change24hPercent } = holding;
  return { assetId, mint, tokenAccount, symbol, name, displayAmount, amountModel, valueUsd, change24hPercent };
}

export function compactTarget(target) {
  const { assetId, mint, tokenProgram, symbol, name } = target;
  return { assetId, mint, tokenProgram, symbol, name,
    actions: target.actions.map(({ action, available, reason }) => ({ action, available, reason })) };
}

export function portfolioReady(portfolio) {
  return { portfolio_status: 'ready', mode: 'portfolio_ready', user_bound: true, portfolio };
}

export function selectedReadFixture({ view = 'summary', holdings, targets = [], sourceSummary = {}, selection = {} } = {}) {
  const source = retainedPortfolioSource();
  const rich = holdings ?? (view === 'targets' ? [] : retainedRichHoldings());
  const returnedCount = view === 'targets' ? targets.length : rich.length;
  const summary = {
    holdingCount: source.pricedHoldings + source.unpricedHoldings,
    pricedHoldings: source.pricedHoldings,
    unpricedHoldings: source.unpricedHoldings,
    holdingsComplete: source.holdingsComplete,
    omittedHoldings: source.omittedHoldings,
    pricedValueUsd: source.pricedValueUsd,
    portfolioValueUsd: source.portfolioValueUsd,
    enrichment: source.enrichment,
    targetCount: targets.length || null,
    ...sourceSummary,
  };
  const sourceCount = view === 'targets' ? summary.targetCount : summary.holdingCount;
  const selected = {
    view, query: null, mint: null, tokenAccount: null,
    limit: view === 'summary' ? 5 : 32, offset: 0,
    matchedCount: sourceCount, returnedCount,
    omittedCount: sourceCount === null ? null : sourceCount - returnedCount,
    nextCursor: null,
    match: sourceCount === null ? 'unavailable' : returnedCount === 0 ? 'none' : 'matched',
    ...selection,
  };
  const portfolio = {
    contractVersion: 'opendexter.portfolio.v2', network: source.network,
    walletAddress: source.walletAddress, observedAt: source.observedAt,
    contextSlot: source.contextSlot, snapshotId: SNAPSHOT_ID, expiresAt: EXPIRES_AT,
    sourceSummary: summary, selection: selected,
    holdings: view === 'detail' && selected.matchedCount === 1 ? structuredClone(rich) : rich.map(compactHolding),
    targets: targets.map(compactTarget),
  };
  return {
    ok: true, portfolio,
    card: { contractVersion: 'opendexter.portfolio-card.v2', snapshotId: SNAPSHOT_ID,
      holdings: structuredClone(rich), approvedActionTargets: structuredClone(targets) },
  };
}

export function detailReadFixture(index = 2) {
  const holding = retainedRichHoldings()[index];
  return selectedReadFixture({ view: 'detail', holdings: [holding],
    selection: { mint: holding.mint, matchedCount: 1 } });
}

export function ambiguousReadFixture() {
  const holding = retainedRichHoldings()[0];
  const second = { ...structuredClone(holding), tokenAccount: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' };
  return selectedReadFixture({ view: 'detail', holdings: [holding, second],
    selection: { mint: holding.mint, matchedCount: 2, match: 'ambiguous' } });
}

export function targetReadFixture() {
  return selectedReadFixture({ view: 'targets', targets: [approvedActionTarget()] });
}

export function largeSourceSummaryFixture() {
  // Only three selected records cross the wire. The other 197 observed holdings
  // have no prices, so their existence cannot imply a complete dollar value.
  return selectedReadFixture({ sourceSummary: {
    holdingCount: 200, pricedHoldings: 3, unpricedHoldings: 197,
    portfolioValueUsd: null, enrichment: { metadata: 'partial', pricing: 'partial', tokenExtensions: 'complete' },
  } });
}

export function manySelectedHoldings(count = 32) {
  const template = retainedRichHoldings()[0];
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template), tokenAccount: `${'1'.repeat(31)}${alphabet[index + 1]}`,
    symbol: '界'.repeat(10), name: '界'.repeat(42),
  }));
}
