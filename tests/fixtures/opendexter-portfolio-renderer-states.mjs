import { PORTFOLIO_WIDGET_URIS } from '../../apps-sdk/widget-uris.mjs';
import { buildVaultAuthenticationRequired } from '../../lib/open-tool-auth.mjs';
import {
  modelSafePortfolioSnapshot,
  validateAndBoundPortfolioSnapshotV1,
} from '../../lib/session-portfolio.mjs';
import {
  completePortfolio,
  partialOmittedPortfolio,
  partialUnpricedPortfolio,
} from './wallet-portfolio-fixtures.mjs';

export const PORTFOLIO_RENDERER_STATE_IDS = Object.freeze([
  'portfolio-loading',
  'portfolio-authentication-required',
  'portfolio-read-error',
  'portfolio-invalid',
  'portfolio-empty',
  'portfolio-partial-unpriced',
  'portfolio-partial-omitted',
]);

function projectPortfolio(portfolio) {
  const validated = validateAndBoundPortfolioSnapshotV1(portfolio);
  if (!validated) throw new Error('Invalid portfolio renderer fixture');
  return modelSafePortfolioSnapshot(validated);
}

function readyOutput(portfolio) {
  return {
    portfolio_status: 'ready',
    mode: 'portfolio_ready',
    user_bound: true,
    portfolio: projectPortfolio(portfolio),
  };
}

function emptyPortfolio() {
  return {
    ...completePortfolio(),
    holdings: [],
    pricedValueUsd: '0',
    portfolioValueUsd: '0',
    pricedHoldings: 0,
    unpricedHoldings: 0,
  };
}

function unpricedHoldingFirst() {
  const portfolio = partialUnpricedPortfolio();
  const unpricedIndex = portfolio.holdings.findIndex((holding) => holding.valueUsd === null);
  if (unpricedIndex < 0) throw new Error('Unpriced portfolio fixture has no unpriced holding');
  const holdings = [...portfolio.holdings];
  const [unpricedHolding] = holdings.splice(unpricedIndex, 1);
  return {
    ...portfolio,
    holdings: [unpricedHolding, ...holdings],
  };
}

function rendererSurface({ id, output, readySelector, omitToolResult = false }) {
  return {
    id,
    title: 'Dexter Wallet Portfolio',
    file: 'dexter-portfolio.html',
    resourceUri: PORTFOLIO_WIDGET_URIS.overview,
    tools: [],
    input: {},
    output,
    metadata: {},
    ...(omitToolResult ? { omitToolResult: true } : {}),
    readySelector,
    outerSelector: '.dxp-root',
  };
}

export function buildPortfolioRendererStateSurfaces() {
  return [
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[0],
      output: {},
      omitToolResult: true,
      readySelector: '.dxp-ledger--loading',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[1],
      output: buildVaultAuthenticationRequired({ tool: 'dexter_wallet_portfolio' }),
      readySelector: '.dxp-state[role="status"]',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[2],
      output: {
        portfolio_status: 'read_error',
        mode: 'portfolio_read_error',
        user_bound: true,
        retryable: true,
        error: 'portfolio_state_read_failed',
      },
      readySelector: '.dxp-state[role="alert"]',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[3],
      output: {},
      readySelector: '.dxp-state[role="alert"]',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[4],
      output: readyOutput(emptyPortfolio()),
      readySelector: '.dxp-inline__empty',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[5],
      output: readyOutput(unpricedHoldingFirst()),
      readySelector: '.dxp-inline .dxp-value-unknown',
    }),
    rendererSurface({
      id: PORTFOLIO_RENDERER_STATE_IDS[6],
      output: readyOutput(partialOmittedPortfolio()),
      readySelector: '.dxp-inline',
    }),
  ];
}
