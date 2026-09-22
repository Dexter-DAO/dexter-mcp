import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchSessionPortfolio, modelSafePortfolioSnapshot, validateAndBoundPortfolioSnapshotV1 } from '../lib/session-portfolio.mjs';
import { portfolioResultText } from '../lib/customer-result-presentation.mjs';
import { OPEN_TOOL_CONTRACTS, applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import { completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';

// Byte-identical to the API fixture verified from raw provider JSON by
// src/portfolio/__tests__/marketDataFlow.test.ts in dexter-api.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/held-token-market-data.json', import.meta.url), 'utf8'));
const ready = (portfolio) => ({ mode: 'portfolio_ready', portfolio_status: 'ready', user_bound: true, portfolio });
const schema = OPEN_TOOL_CONTRACTS.dexter_wallet_portfolio.outputSchema;

for (const entry of fixture.cases) {
  test(`API market snapshot reaches the shared tool result: ${entry.name}`, async () => {
    let calls = 0;
    const snapshot = await fetchSessionPortfolio({
      apiBase: 'https://api.example', sessionId: 'current-account-session', secret: 'test-only-secret',
      expectedWalletAddress: fixture.identity.walletAddress,
      fetchImpl: async (url) => {
        calls++;
        assert.equal(String(url), 'https://api.example/api/passkey-anon/mcp-portfolio/current-account-session');
        return new Response(JSON.stringify({ ok: true, portfolio: entry.snapshot }), { status: 200 });
      },
    });
    assert.deepEqual(snapshot, entry.snapshot);
    const result = ready(modelSafePortfolioSnapshot(snapshot));
    assert.equal(schema.safeParse(result).success, true);
    const envelope = applyOpenToolResultPolicy('dexter_wallet_portfolio', {
      structuredContent: result, content: [{ type: 'text', text: portfolioResultText(result) }],
    });
    const holding = envelope.structuredContent.portfolio.holdings[0];
    const summary = JSON.parse(envelope.content[0].text);
    for (const value of [holding, summary.holdings[0]]) {
      assert.equal(value.priceUsd, entry.priceUsd);
      assert.equal(value.change24hPercent, entry.change24hPercent);
      assert.equal(value.priceObservedAt, entry.priceUsd === null ? null : (entry.observedAt ?? fixture.identity.observedAt));
    }
    assert.equal(holding.mint, fixture.identity.mint);
    assert.equal(holding.amountRaw, fixture.identity.amountRaw);
    assert.equal(holding.decimals, fixture.identity.decimals);
    assert.match(summary.marketDataMeaning, /USD per displayed token unit/);
    assert.match(summary.marketDataMeaning, /2.5 means 2.5%/);
    assert.match(summary.marketDataMeaning, /upstream market update time can be earlier/);
    assert.equal(calls, 1);
  });
}

test('legacy output remains valid while new daily movement rejects malformed decimals', () => {
  const result = ready(modelSafePortfolioSnapshot(fixture.cases[0].snapshot));
  const holding = result.portfolio.holdings[0];
  delete holding.change24hPercent;
  assert.equal(schema.safeParse(result).success, true);
  for (const invalid of ['', ' ', '-0', '01', '1.0', 'NaN', 'Infinity', '1e3', false, 0, {}]) {
    holding.change24hPercent = invalid;
    assert.equal(schema.safeParse(result).success, false, JSON.stringify(invalid));
  }
  for (const value of [null, '0', '-2.5', '2.5']) {
    holding.change24hPercent = value;
    assert.equal(schema.safeParse(result).success, true);
  }
});

test('invalid upstream daily movement and foreign wallet responses fail before presentation', async () => {
  const snapshot = structuredClone(fixture.cases[0].snapshot);
  snapshot.holdings[0].price.change24hPercent = 'NaN';
  assert.equal(validateAndBoundPortfolioSnapshotV1(snapshot), null);
  assert.equal(await fetchSessionPortfolio({
    apiBase: 'https://api.example', sessionId: 'current-account-session', secret: 'test-only-secret',
    expectedWalletAddress: 'Stake11111111111111111111111111111111111111',
    fetchImpl: async () => new Response(JSON.stringify({ portfolio: fixture.cases[0].snapshot })),
  }), null);
});

test('scaled prices and missing movement pass through without recomputing units or freshness', () => {
  const snapshot = completePortfolio();
  const stock = snapshot.holdings.find((holding) => holding.amountModel === 'scaled-ui-amount');
  stock.price.change24hPercent = null;
  const result = ready(modelSafePortfolioSnapshot(validateAndBoundPortfolioSnapshotV1(snapshot)));
  const shown = JSON.parse(portfolioResultText(result)).holdings.find((holding) => holding.amountModel === 'scaled-ui-amount');
  assert.equal(shown.priceUsd, stock.price.usd);
  assert.equal(shown.priceObservedAt, stock.price.observedAt);
  assert.equal(shown.change24hPercent, null);
  assert.equal(shown.displayAmount, stock.displayAmount);
  assert.equal(shown.displayMultiplier, stock.displayMultiplier);
});
