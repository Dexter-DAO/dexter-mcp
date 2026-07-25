import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatPortfolioAmount,
  formatPortfolioUsd,
  getPortfolioActionState,
  groupPortfolioUnavailableActions,
  normalizePortfolioRead,
} from '../apps-sdk/ui/src/components/wallet/portfolioModel.ts';
import {
  ASSET_IMAGE_SOURCES,
  WALLET_ADDRESS,
  completePortfolio,
  governancePortfolio,
  partialEnrichmentPortfolio,
  partialOmittedPortfolio,
  partialUnpricedPortfolio,
} from './fixtures/wallet-portfolio-fixtures.mjs';

test('accepts the exact E2 complete contract for SOL, USDC, syrupUSDC, DEXTER, and scaled SPCX', () => {
  const state = normalizePortfolioRead(completePortfolio(), WALLET_ADDRESS);

  assert.equal(state.status, 'available');
  assert.ok(state.snapshot);
  assert.deepEqual(
    state.snapshot.holdings.map(({ symbol, tokenProgram }) => ({ symbol, tokenProgram })),
    [
      { symbol: 'SOL', tokenProgram: 'native' },
      { symbol: 'USDC', tokenProgram: 'spl-token' },
      { symbol: 'syrupUSDC', tokenProgram: 'spl-token' },
      { symbol: 'DEXTER', tokenProgram: 'spl-token' },
      { symbol: 'SPCX', tokenProgram: 'token-2022' },
    ],
  );
  const spcx = state.snapshot.holdings.find(({ symbol }) => symbol === 'SPCX');
  assert.equal(spcx?.amountRaw, '4426');
  assert.equal(spcx?.displayMultiplier, '1.25');
  assert.equal(spcx?.displayAmount, '0.0055325');
  assert.equal(spcx?.graphics.canonicalImageUrl, ASSET_IMAGE_SOURCES.spcx);
  assert.equal(state.snapshot.pricedValueUsd, '265.33325');
  assert.equal(state.snapshot.portfolioValueUsd, '265.33325');
});

test('derives partial independently for unpriced, scaled-semantics, enrichment, and omitted inventory', () => {
  const unpriced = normalizePortfolioRead(partialUnpricedPortfolio(), WALLET_ADDRESS);
  assert.equal(unpriced.status, 'partial');
  assert.equal(unpriced.snapshot?.portfolioValueUsd, null);
  assert.equal(unpriced.snapshot?.pricedValueUsd, '264.78');
  assert.equal(unpriced.snapshot?.unpricedHoldings, 1);
  assert.equal(
    unpriced.snapshot?.holdings.find(({ symbol }) => symbol === 'SPCX')?.amountModel,
    'unknown',
  );

  const omitted = normalizePortfolioRead(partialOmittedPortfolio(), WALLET_ADDRESS);
  assert.equal(omitted.status, 'partial');
  assert.equal(omitted.snapshot?.holdingsComplete, false);
  assert.equal(omitted.snapshot?.omittedHoldings, 2);
  assert.equal(omitted.snapshot?.portfolioValueUsd, null);

  const degradedEnrichment = normalizePortfolioRead(
    partialEnrichmentPortfolio(),
    WALLET_ADDRESS,
  );
  assert.equal(degradedEnrichment.status, 'partial');
  assert.equal(degradedEnrichment.snapshot?.portfolioValueUsd, '265.33325');
  assert.equal(degradedEnrichment.snapshot?.enrichment.metadata, 'partial');
});

test('never turns absent, malformed, or wallet-mismatched input into zero assets', () => {
  const absent = normalizePortfolioRead(undefined, WALLET_ADDRESS);
  assert.deepEqual(absent, {
    status: 'unavailable',
    snapshot: null,
    reason: 'not_provided',
  });

  const malformedTotal = {
    ...partialOmittedPortfolio(),
    portfolioValueUsd: '264.7',
  };
  assert.equal(
    normalizePortfolioRead(malformedTotal, WALLET_ADDRESS).reason,
    'invalid_snapshot',
  );

  assert.equal(
    normalizePortfolioRead(
      { ...completePortfolio(), walletAddress: '11111111111111111111111111111111' },
      WALLET_ADDRESS,
    ).reason,
    'wallet_mismatch',
  );
});

test('fails closed on fabricated sums and malformed capability arrays', () => {
  assert.equal(
    normalizePortfolioRead(
      { ...completePortfolio(), pricedValueUsd: '999', portfolioValueUsd: '999' },
      WALLET_ADDRESS,
    ).status,
    'unavailable',
  );

  const malformed = completePortfolio();
  malformed.holdings[0] = {
    ...malformed.holdings[0],
    capabilities: [
      ...malformed.holdings[0].capabilities,
      malformed.holdings[0].capabilities[0],
    ],
  };
  assert.equal(normalizePortfolioRead(malformed, WALLET_ADDRESS).status, 'unavailable');
});

test('fails closed on duplicate holding identities and missing token accounts', () => {
  const duplicateNative = completePortfolio();
  duplicateNative.holdings.push({ ...duplicateNative.holdings[0] });
  duplicateNative.pricedHoldings = 6;
  duplicateNative.pricedValueUsd = '515.33325';
  duplicateNative.portfolioValueUsd = '515.33325';
  assert.equal(
    normalizePortfolioRead(duplicateNative, WALLET_ADDRESS).reason,
    'invalid_snapshot',
  );

  const duplicateTokenAccount = completePortfolio();
  duplicateTokenAccount.holdings[2] = {
    ...duplicateTokenAccount.holdings[2],
    tokenAccount: duplicateTokenAccount.holdings[1].tokenAccount,
  };
  assert.equal(
    normalizePortfolioRead(duplicateTokenAccount, WALLET_ADDRESS).reason,
    'invalid_snapshot',
  );

  const missingTokenAccount = completePortfolio();
  missingTokenAccount.holdings[1] = {
    ...missingTokenAccount.holdings[1],
    tokenAccount: null,
  };
  assert.equal(
    normalizePortfolioRead(missingTokenAccount, WALLET_ADDRESS).reason,
    'invalid_snapshot',
  );
});

test('a blocked identity cannot contribute a price or value to portfolio totals', () => {
  const snapshot = governancePortfolio();
  snapshot.holdings[2] = {
    ...snapshot.holdings[2],
    valueUsd: '1',
    price: {
      usd: '1',
      source: 'fixture',
      observedAt: snapshot.observedAt,
      blockId: snapshot.contextSlot,
      change24hPercent: null,
    },
  };
  snapshot.pricedHoldings = 2;
  snapshot.unpricedHoldings = 1;
  snapshot.pricedValueUsd = '13.5';

  assert.equal(normalizePortfolioRead(snapshot, WALLET_ADDRESS).status, 'unavailable');
});

test('keeps unreviewed visible, wrong-program blocked, and frozen movement disabled', () => {
  const state = normalizePortfolioRead(governancePortfolio(), WALLET_ADDRESS);
  assert.equal(state.status, 'partial');
  const frozen = state.snapshot?.holdings.find(({ accountState }) => accountState === 'frozen');
  const unreviewed = state.snapshot?.holdings.find(
    ({ approval }) => approval.status === 'unreviewed',
  );
  const blocked = state.snapshot?.holdings.find(
    ({ approval }) => approval.status === 'blocked',
  );
  assert.ok(frozen);
  assert.ok(unreviewed);
  assert.ok(blocked);

  assert.deepEqual(
    getPortfolioActionState(frozen, 'receive', { receiveHandlerAvailable: true }),
    { available: false, reason: 'This token account is frozen' },
  );
  assert.deepEqual(
    getPortfolioActionState(frozen, 'view'),
    { available: true, reason: null },
  );
  assert.deepEqual(
    getPortfolioActionState(unreviewed, 'receive', { receiveHandlerAvailable: true }),
    { available: false, reason: 'Asset not reviewed' },
  );
  assert.deepEqual(
    getPortfolioActionState(blocked, 'view'),
    { available: false, reason: 'Token program does not match' },
  );
  assert.deepEqual(
    getPortfolioActionState(state.snapshot.holdings[0], 'send'),
    { available: false, reason: 'Not available yet' },
  );
});

test('preserves distinct disabled-action reasons for visible presentation', () => {
  const state = normalizePortfolioRead(completePortfolio(), WALLET_ADDRESS);
  assert.ok(state.snapshot);
  const holding = {
    ...state.snapshot.holdings[0],
    capabilities: state.snapshot.holdings[0].capabilities.map((capability) => {
      if (capability.action === 'send') {
        return { ...capability, reason: 'manual_review_required' };
      }
      if (capability.action === 'buy') {
        return { ...capability, reason: 'provider_unavailable' };
      }
      return capability;
    }),
  };

  assert.deepEqual(
    groupPortfolioUnavailableActions(holding, ['send', 'buy', 'sell']),
    [
      { actions: ['send'], reason: 'manual review required' },
      { actions: ['buy'], reason: 'provider unavailable' },
      { actions: ['sell'], reason: 'Not available yet' },
    ],
  );
});

test('preserves approved receive truth while the read-only gate blocks future execution', () => {
  const snapshot = completePortfolio();
  snapshot.holdings[0] = {
    ...snapshot.holdings[0],
    capabilities: snapshot.holdings[0].capabilities.map((capability) => {
      if (capability.action === 'receive') {
        return { action: 'receive', available: false, reason: 'receive_rail_unavailable' };
      }
      if (capability.action === 'buy') {
        return { action: 'buy', available: true, reason: null };
      }
      return capability;
    }),
  };
  const state = normalizePortfolioRead(snapshot, WALLET_ADDRESS);
  assert.equal(state.status, 'available');
  assert.ok(state.snapshot);

  assert.deepEqual(
    getPortfolioActionState(state.snapshot.holdings[0], 'receive', {
      receiveHandlerAvailable: true,
    }),
    { available: false, reason: 'receive rail unavailable' },
  );
  assert.deepEqual(
    getPortfolioActionState(state.snapshot.holdings[0], 'buy'),
    { available: false, reason: 'A prepared action is required' },
  );
});

test('the normalized portfolio contract has no spendable or credit field', () => {
  const state = normalizePortfolioRead(completePortfolio(), WALLET_ADDRESS);
  assert.ok(state.snapshot);
  assert.equal('spendableUsd' in state.snapshot, false);
  assert.equal('creditAvailableUsd' in state.snapshot, false);
  assert.equal('creditDrawnUsd' in state.snapshot, false);
});

test('formats portfolio money with string arithmetic and preserves exact source values', () => {
  assert.equal(formatPortfolioUsd('18446744174.262801615'), '$18,446,744,174.26');
  assert.equal(formatPortfolioUsd('0.005'), '$0.01');
  assert.equal(formatPortfolioAmount('18446744073.709551615'), '18,446,744,073.70955161…');
  assert.equal(formatPortfolioAmount('0.0055325'), '0.0055325');
});

test('portfolio model contains no numeric coercion of money strings', async () => {
  const source = await readFile(
    new URL('../apps-sdk/ui/src/components/wallet/portfolioModel.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:Number|parseFloat|parseInt)\s*\(/);
});
