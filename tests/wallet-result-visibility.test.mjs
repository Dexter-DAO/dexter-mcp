import assert from 'node:assert/strict';
import test from 'node:test';
import { completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';
import { projectWalletResultForModel } from '../lib/wallet-result-visibility.mjs';

test('full portfolio display data is widget-only while model output is numeric', () => {
  const portfolio = completePortfolio();
  portfolio.holdings[0].name = 'MODEL-MUST-NOT-SEE';
  portfolio.holdings[0].symbol = 'SECRET-SYMBOL';
  portfolio.holdings[0].issuer = 'SECRET-ISSUER';
  portfolio.holdings[0].graphics.canonicalImageUrl =
    'https://issuer-controlled.example/secret.png';
  portfolio.holdings[0].capabilities[2].reason =
    'SECRET-CAPABILITY-REASON';

  const { publicResult, meta } = projectWalletResultForModel(
    {
      mode: 'vault_ready',
      portfolioSummary: {
        holdings: 5,
        pricedHoldings: 5,
        unpricedHoldings: 0,
        holdingsComplete: true,
        pricedValueUsd: '265.33325',
        portfolioValueUsd: '265.33325',
      },
      _portfolio: portfolio,
      _cardToken: 'card-token',
      _walletToken: 'wallet-token',
    },
    { ui: { resourceUri: 'ui://dexter/x402-wallet' } },
  );

  const modelJson = JSON.stringify(publicResult);
  assert.doesNotMatch(
    modelJson,
    /MODEL-MUST-NOT-SEE|SECRET-|issuer-controlled/,
  );
  assert.equal(Object.hasOwn(publicResult, 'portfolio'), false);
  assert.deepEqual(publicResult.portfolioSummary, {
    holdings: 5,
    pricedHoldings: 5,
    unpricedHoldings: 0,
    holdingsComplete: true,
    pricedValueUsd: '265.33325',
    portfolioValueUsd: '265.33325',
  });
  assert.equal(meta.dexterPortfolio, portfolio);
  assert.equal(meta.dexterCardToken, 'card-token');
  assert.equal(meta.dexterWalletToken, 'wallet-token');
});
