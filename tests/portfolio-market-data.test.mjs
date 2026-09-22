import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchSessionPortfolio, modelSafePortfolioSnapshot, validateAndBoundPortfolioSnapshotV1 } from '../lib/session-portfolio.mjs';
import { portfolioResultText } from '../lib/customer-result-presentation.mjs';
import { OPEN_TOOL_CONTRACTS, OPEN_TOOL_NAMES, applyOpenToolResultPolicy, installOpenToolContracts, finalizeOpenToolContracts } from '../lib/open-tool-contracts.mjs';
import { completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';

// Byte-identical to the API fixture verified from raw provider JSON by
// src/portfolio/__tests__/marketDataFlow.test.ts in dexter-api.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/held-token-market-data.json', import.meta.url), 'utf8'));
// Actual API reader output with synthetic provider/account input; retained byte-for-byte.
const contextFixture = JSON.parse(readFileSync(new URL('./fixtures/portfolio-market-context-api.json', import.meta.url), 'utf8'));
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

// Synthetic boundary cases, separate from the retained API-produced fixtures above.
function contextPortfolio() {
  const snapshot = completePortfolio();
  for (const holding of snapshot.holdings) {
    holding.capabilities = holding.capabilities.map((value) => ({
      ...value, reasonCode: value.available ? null : value.reason,
    }));
    holding.marketContext = {
      source: 'jupiter-tokens-v2',
      mint: holding.mint === 'native:SOL' ? 'So11111111111111111111111111111111111111112' : holding.mint,
      observedAt: snapshot.observedAt,
      liquidityUsd: '12345.67', holderCount: 0, activity24h: { traderCount: null },
    };
    holding.registryIdentity = { source: 'dexter-registry', providerName: 'Registry provider', legalIssuerName: null };
    holding.price.source = 'jupiter-price-v3';
  }
  snapshot.enrichment.metadata = 'partial';
  return snapshot;
}

test('defined context survives validation, public schema, text and SDK response without another read', async (t) => {
  const input = contextFixture.snapshot;
  const before = structuredClone(input);
  let reads = 0;
  const snapshot = await fetchSessionPortfolio({
    apiBase: 'https://api.example', sessionId: 'synthetic-context', secret: 'synthetic-secret',
    expectedWalletAddress: input.walletAddress,
    fetchImpl: async () => { reads++; return new Response(JSON.stringify({ ok: true, portfolio: input })); },
  });
  assert.deepEqual(snapshot, input);
  const result = ready(modelSafePortfolioSnapshot(snapshot));
  assert.equal(schema.safeParse(result).success, true);
  const server = new McpServer({ name: 'portfolio-context-test', version: '1.0.0' });
  installOpenToolContracts(server);
  for (const name of OPEN_TOOL_NAMES) server.registerTool(name, { inputSchema: {} }, async () => {
    assert.equal(name, 'dexter_wallet_portfolio');
    return { structuredContent: result, content: [{ type: 'text', text: portfolioResultText(result) }] };
  });
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'portfolio-context-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(b); await client.connect(a);
  const listed = (await client.listTools()).tools.find((tool) => tool.name === 'dexter_wallet_portfolio');
  assert.ok(listed.outputSchema);
  for (const key of ['marketContext', 'registryIdentity', 'priceSource', 'priceBlockId', 'metadataObservedAt', 'capabilities', 'enrichment']) {
    assert.ok(JSON.stringify(listed.outputSchema).includes(`"${key}"`), key);
  }
  const envelope = await client.callTool({ name: 'dexter_wallet_portfolio', arguments: {} });
  assert.notEqual(envelope.isError, true);
  const shown = envelope.structuredContent.portfolio;
  const text = JSON.parse(envelope.content[0].text);
  for (const projection of [shown, text]) {
    assert.deepEqual(projection.enrichment, input.enrichment);
    for (const [index, holding] of input.holdings.entries()) {
      assert.deepEqual(projection.holdings[index].marketContext, holding.marketContext);
      assert.deepEqual(projection.holdings[index].registryIdentity, holding.registryIdentity);
      assert.equal(projection.holdings[index].displayAmount, holding.displayAmount);
      assert.equal(projection.holdings[index].change24hPercent, holding.price.change24hPercent);
    }
    assert.equal(projection.holdings[0].priceSource, 'jupiter-price-v3');
    assert.equal(projection.holdings[0].priceBlockId, input.holdings[0].price.blockId);
    assert.equal(projection.holdings[0].metadataObservedAt, input.holdings[0].metadataObservedAt);
    assert.deepEqual(projection.holdings[0].capabilities, input.holdings[0].capabilities.map(({ action, available, reasonCode }) => ({ action, available, reasonCode })));
  }
  assert.equal(reads, 1);
  assert.deepEqual(input, before);
});

test('legacy absence, null observations and explicit zero remain distinct without repricing', () => {
  const old = completePortfolio();
  assert.deepEqual(validateAndBoundPortfolioSnapshotV1(old), old);
  const oldResult = ready(modelSafePortfolioSnapshot(old));
  assert.equal(oldResult.portfolio.holdings[0].capabilities[2].reasonCode, 'unknown');
  for (const holding of oldResult.portfolio.holdings) for (const key of [
    'marketContext', 'registryIdentity', 'priceSource', 'priceBlockId', 'metadataObservedAt', 'capabilities',
  ]) delete holding[key];
  delete oldResult.portfolio.enrichment;
  assert.equal(schema.safeParse(oldResult).success, true);
  const input = contextPortfolio();
  input.holdings[0].marketContext = null;
  input.holdings[0].registryIdentity = null;
  input.holdings[1].marketContext.liquidityUsd = '0';
  input.holdings[1].marketContext.activity24h.traderCount = 0;
  input.holdings[2].marketContext.liquidityUsd = null;
  input.holdings[2].marketContext.holderCount = null;
  const result = ready(modelSafePortfolioSnapshot(validateAndBoundPortfolioSnapshotV1(input)));
  assert.equal(schema.safeParse(result).success, true);
  assert.equal(result.portfolio.holdings[0].marketContext, null);
  assert.equal(result.portfolio.holdings[1].marketContext.liquidityUsd, '0');
  assert.equal(result.portfolio.holdings[1].marketContext.activity24h.traderCount, 0);
  assert.equal(result.portfolio.holdings[2].marketContext.liquidityUsd, null);
  assert.equal(result.portfolio.holdings[2].marketContext.holderCount, null);
  assert.equal(result.portfolio.portfolioValueUsd, old.portfolioValueUsd);
});

test('malformed context and identity or capability contradictions refuse at the incoming boundary', () => {
  const corruptions = [
    (h) => { h.marketContext.mint = h.mint; }, // Native SOL requires the wrapped lookup mint.
    (h) => { h.marketContext.mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; },
    (h) => { h.marketContext.source = 'other'; },
    (h) => { h.marketContext.riskVerdict = 'safe'; },
    (h) => { h.marketContext.activity24h.volumeUsd = '1'; },
    (h) => { h.marketContext.holderCount = Number.MAX_SAFE_INTEGER + 1; },
    (h) => { h.marketContext.activity24h.traderCount = 0.5; },
    (h) => { h.marketContext.observedAt = 'not-a-date'; },
    (h) => { h.registryIdentity.source = 'jupiter'; },
    (h) => { h.registryIdentity.providerName = ' provider'; },
    (h) => { h.registryIdentity.legalIssuerName = 'é'.repeat(65); },
    (h) => { h.capabilities[0].reasonCode = 'unknown'; },
    (h) => { h.capabilities[2].reasonCode = null; },
    (h) => { h.capabilities[2].reasonCode = 'asset_not_approved'; },
    (h) => { h.capabilities[2].reasonCode = 'arbitrary'; },
  ];
  for (const invalid of ['', ' ', false, 0, '-1', '01', '1.0', '1e3', 'NaN']) {
    corruptions.push((h) => { h.marketContext.liquidityUsd = invalid; });
  }
  for (const [index, mutate] of corruptions.entries()) {
    const input = contextPortfolio(); mutate(input.holdings[0]);
    assert.equal(validateAndBoundPortfolioSnapshotV1(input), null, `case ${index}`);
  }
  const input = contextPortfolio();
  input.holdings[0].approval = { status: 'unreviewed', assetId: null, group: null, source: 'none' };
  assert.equal(validateAndBoundPortfolioSnapshotV1(input), null);
});

test('public output rejects incompatible context instead of silently dropping its fields', () => {
  for (const mutate of [
    (h) => { h.marketContext.mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; },
    (h) => { h.marketContext.activity24h.extra = 1; },
    (h) => { h.registryIdentity.providerName = 'é'.repeat(65); },
    (h) => { h.capabilities.pop(); },
    (h) => { h.capabilities[2].reasonCode = null; },
    (h) => { h.capabilities[2].available = true; h.capabilities[2].reasonCode = null; },
    (h) => { h.capabilities[2].action = h.capabilities[1].action; },
  ]) {
    const result = ready(modelSafePortfolioSnapshot(contextPortfolio())); mutate(result.portfolio.holdings[0]);
    assert.equal(schema.safeParse(result).success, false);
  }
});
