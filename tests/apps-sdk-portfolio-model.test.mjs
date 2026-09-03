import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatDisplayUsd,
  formatExactDecimal,
  formatExactUsd,
  governedActionReason,
  normalizeDexterPortfolio,
} from '../apps-sdk/ui/src/components/portfolio/portfolio-model.ts';
import { modelSafePortfolioSnapshot } from '../lib/session-portfolio.mjs';

const FIXTURE_URL = new URL(
  './fixtures/opendexter-portfolio-v1-zero-holding-approved-action-targets.json',
  import.meta.url,
);

async function zeroHoldingFixture() {
  return JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
}

function ready(portfolio) {
  return {
    portfolio_status: 'ready',
    mode: 'portfolio_ready',
    user_bound: true,
    portfolio,
  };
}

function holding(overrides = {}) {
  return {
    assetId: 'wrapped-solana',
    mint: 'native:SOL',
    tokenAccount: null,
    tokenProgram: 'native',
    assetClass: 'cash',
    amountRaw: '123456789',
    decimals: 9,
    displayAmount: '0.123456789',
    amountModel: 'raw-decimals',
    accountState: 'initialized',
    valueUsd: null,
    priceUsd: null,
    priceObservedAt: null,
    approvalStatus: 'approved',
    availableActions: ['view', 'receive', 'send'],
    ...overrides,
  };
}

function partialPortfolio(overrides = {}) {
  return {
    contractVersion: 'opendexter.portfolio.v1',
    network: 'solana-mainnet',
    walletAddress: 'Vote111111111111111111111111111111111111111',
    observedAt: '2026-08-02T00:00:00.000Z',
    contextSlot: 435090000,
    holdingsComplete: false,
    omittedHoldings: 2,
    pricedValueUsd: '0',
    portfolioValueUsd: null,
    pricedHoldings: 0,
    unpricedHoldings: 1,
    holdings: [holding()],
    approvedActionTargets: [],
    ...overrides,
  };
}

test('zero holdings remain separate from approved action targets', async () => {
  const fixture = await zeroHoldingFixture();
  const output = ready(modelSafePortfolioSnapshot(fixture));
  const model = normalizeDexterPortfolio(output);

  assert.equal(model.state, 'ready');
  assert.equal(model.isEmpty, true);
  assert.equal(model.snapshot.holdings.length, 0);
  assert.equal(model.snapshot.approvedActionTargets.length, 4);
  assert.equal(model.summary.label, 'Portfolio value');
  assert.equal(model.summary.value, '$0');
  assert.equal(model.summary.exact, true);
  assert.equal(model.snapshot.approvedActionTargets[0].name, 'SpaceX');
  assert.equal(model.snapshot.approvedActionTargets[0].actions[2].available, false);
  assert.equal(
    governedActionReason(model.snapshot.approvedActionTargets[0].actions[2].reason),
    'Send requires the protected agent SDK.',
  );
});

test('an incomplete unpriced read displays unknown instead of a zero total', () => {
  const model = normalizeDexterPortfolio(ready(partialPortfolio()));

  assert.equal(model.state, 'ready');
  assert.equal(model.isEmpty, false);
  assert.equal(model.isPartial, true);
  assert.equal(model.summary.label, 'Portfolio value unavailable');
  assert.equal(model.summary.value, null);
  assert.equal(
    model.coverage,
    'The holdings read is incomplete: 2 holdings were omitted, and 1 holding has no current price. The total value is unknown.',
  );
});

test('a partial read labels exact priced value as a subtotal', () => {
  const priced = holding({
    assetId: 'usd-coin',
    amountRaw: '12500000',
    decimals: 6,
    displayAmount: '12.5',
    valueUsd: '12.5',
    priceUsd: '1',
    priceObservedAt: '2026-08-02T00:00:00.000Z',
  });
  const model = normalizeDexterPortfolio(ready(partialPortfolio({
    pricedValueUsd: '12.5',
    pricedHoldings: 1,
    unpricedHoldings: 0,
    holdings: [priced],
  })));

  assert.equal(model.state, 'ready');
  assert.equal(model.summary.label, 'Priced subtotal');
  assert.equal(model.summary.value, '$12.5');
  assert.equal(model.summary.exact, false);
  assert.match(model.coverage, /total value is unknown/i);
});

test('decimal formatting preserves every returned digit without floating point', () => {
  assert.equal(
    formatExactDecimal('18446744073709551615.000000000000000001'),
    '18,446,744,073,709,551,615.000000000000000001',
  );
  assert.equal(formatExactUsd('9007199254740993.01'), '$9,007,199,254,740,993.01');
});

test('resting portfolio money rounds safely to cents without Number coercion', () => {
  assert.equal(formatDisplayUsd('1.11105480665322'), '$1.11');
  assert.equal(formatDisplayUsd('999999999999999999.995'), '$1,000,000,000,000,000,000.00');
  assert.equal(formatDisplayUsd('0'), '$0.00');
});

test('authentication and read failures stay distinct from empty holdings', () => {
  const authentication = normalizeDexterPortfolio({
    mode: 'authentication_required',
    status: 401,
  });
  const failure = normalizeDexterPortfolio({
    portfolio_status: 'read_error',
    mode: 'portfolio_read_error',
    message: 'Portfolio service timed out.',
  });

  assert.equal(authentication.state, 'authentication_required');
  assert.match(authentication.body, /passkey/i);
  assert.equal(failure.state, 'read_error');
  assert.equal(failure.body, 'Portfolio service timed out.');
});

test('contradictory summaries and target identities fail unavailable', async () => {
  const badSummary = partialPortfolio({
    portfolioValueUsd: '0',
  });
  const fixture = await zeroHoldingFixture();
  const projected = modelSafePortfolioSnapshot(fixture);
  projected.approvedActionTargets[0].actions[0].assetId = 'different-asset';

  assert.equal(normalizeDexterPortfolio(ready(badSummary)).state, 'invalid');
  assert.equal(normalizeDexterPortfolio(ready(projected)).state, 'invalid');
});

test('the adapter accepts a standard structured-content envelope', async () => {
  const fixture = await zeroHoldingFixture();
  const model = normalizeDexterPortfolio({
    structuredContent: ready(modelSafePortfolioSnapshot(fixture)),
  });

  assert.equal(model.state, 'ready');
  assert.equal(model.snapshot.contractVersion, 'opendexter.portfolio.v1');
});
