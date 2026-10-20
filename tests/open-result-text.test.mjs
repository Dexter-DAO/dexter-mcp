import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { withOpenResultText } from '../lib/open-result-text.mjs';
import { OPEN_TOOL_NAMES, applyOpenToolResultPolicy, installOpenToolContracts, finalizeOpenToolContracts } from '../lib/open-tool-contracts.mjs';
import { registerOpenTool, buildVaultAuthenticationRequired, vaultAuthenticationResult } from '../lib/open-tool-auth.mjs';
import { buildGovernedAssetToolResult, buildGovernedAssetFailure } from '../lib/governed-asset-result.mjs';
import { buildAgentWorkReportModelResult } from '../lib/agent-work-report-result.mjs';
import { buildHostedCheckModelResult, buildHostedCheckToolResult } from '../lib/open-check-result.mjs';
import { sanitizeOpenX402IntentResult } from '../lib/open-x402-intent-api.mjs';
import { buildIndexterToolResult, completeIndexterToolResultBytes, INDEXTER_TOOL_RESULT_MAX_JSON_BYTES } from '../lib/indexter-tool-result.mjs';
import { portfolioReady } from '../lib/portfolio-read-contract.mjs';
import { NATIVE_MCP_PROTOCOL_VERSION } from '../lib/native-mcp-contract.mjs';
import { buildAnonVaultToolResult } from '../lib/anon-vault-response.mjs';
import { projectWalletResultForModel } from '../lib/wallet-result-visibility.mjs';
import { walletOutput, completePortfolio, partialUnpricedPortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { receiptFixture } from './fixtures/governed-receipt-outcome.fixtures.mjs';
import { buildRendererGallerySurfaces } from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const v3 = fixture('portfolio-selected-v3-api').valid;
const stockRegistry = fixture('portfolio-stock-registry-v3-api');
const saved = fixture('native-purchase-completion-20260917');
const report = fixture('agent-work-report-producer').fixtures.firstAccepted;
const trade = dynamicStockV2Fixture('tesla', 'text-fixture-0001');
const receipts = receiptFixture({ captured: true });
const gallery = await buildRendererGallerySurfaces();
const discovery = { ...gallery.find(row => row.id === 'indexter-discovery').output, error: null, message: null };
const purchase = sanitizeOpenX402IntentResult({ ...saved.savedResponse, payment: { ...saved.savedResponse.payment, ...saved.storedPayment } });
const checked = buildHostedCheckModelResult({ checkResult: {
  ok: true, paymentRequired: true, intentId: saved.savedResponse.intentId,
  amountAtomic: '25', asset: saved.storedPayment.asset, network: saved.storedPayment.network,
  expiresAtUnixMs: 1789623999000,
}, url: 'https://seller.example/paid', method: 'GET' });
const envelope = data => ({ structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
const portfolioEnvelope = wire => ({ ...envelope(portfolioReady(wire.portfolio)), _meta: { portfolioCard: wire.card } });
const governed = body => buildGovernedAssetToolResult({ body, isError: false });
const search = buildIndexterToolResult({ route: 'overview', payload: discovery, resolvedQuery: 'Explore services', routingReason: 'overview_requested' });
const asset = stockRegistry.portfolio.holdings[0];
const assets = { namespace: 'dexter-asset-search/v1', query: 'SpaceX', kind: 'stocks', observedAt: stockRegistry.portfolio.observedAt,
  stocks: { status: 'ok', items: [{ mint: asset.mint, underlyingId: '11111111-1111-4111-8111-111111111111',
    variantId: '22222222-2222-4222-8222-222222222222', provider: 'Backpack Securities', symbol: asset.symbol, name: asset.name,
    issuerName: null, sourceObservedAt: stockRegistry.portfolio.observedAt, lifecycle: 'routeable', selectedForTrading: true }], nextOffset: null },
  tokens: { status: 'not_requested', items: [], hasMore: false, coverage: 'provider_results' }, tradingAvailability: 'requires_prepare' };
// The retained renderer fixture predates the explicit credit read-status fields.
// Match the producer's legacy-fields projection; absent capacity facts stay null.
const wallet = walletOutput();
wallet.spendingPower.note = 'Cash plus reported credit; check the exact purchase for eligibility.';
Object.assign(wallet.credit, { readStatus: 'available', readStatusSource: 'legacy_fields', hardLimitAtomic: null,
  totalOwedAtomic: null, velocityRemainingAtomic: null, sharedHeadroomAtomic: null, pathFrozen: null, graphPaused: null });
wallet.paymentReadiness = { status: 'cash_available', cashAvailable: true, creditReadStatus: 'available',
  creditCapacityReported: true, exactIntentCheckRequired: true, note: 'Check the exact intent before purchase.' };
const cases = {
  indexter_discover: [envelope(discovery), ['Massive', 'Market snapshots']],
  indexter_search: [search, ['Massive']],
  x402_mcp_tools: [envelope({ ok: true, serverUrl: 'https://seller.example/mcp', protocolVersion: NATIVE_MCP_PROTOCOL_VERSION,
    tools: [{ name: 'weather', description: 'Current weather', inputSchemaJson: '{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}' }] }), ['weather', 'Current weather', 'city']],
  x402_check: [buildHostedCheckToolResult(checked), ['25', '0.000025', saved.savedResponse.intentId]],
  x402_access: [buildHostedCheckToolResult(checked), ['25', '0.000025', saved.savedResponse.intentId]],
  x402_fetch: [envelope(purchase), ['0.01 USDC', 'finalized', 'dexter-native-customer-20260917d']],
  x402_status: [envelope(purchase), ['0.01 USDC', 'finalized', 'dexter-native-customer-20260917d']],
  dexter_wallet: [buildAnonVaultToolResult(wallet), ['42.25 USDC', wallet.address, '-0.001 USDC', '2026-07-25T10:20:00.000Z', 'finalized', 'cash_available']],
  dexter_wallet_portfolio: [portfolioEnvelope(stockRegistry), ['Portfolio total: $100', 'SpaceX (SPCX; stock): 1; value $100', '2026-09-24T00:00:00.000Z']],
  dexter_find_assets: [envelope(assets), ['SpaceX', 'SPCX', asset.mint]],
  dexter_prepare_asset_action: [governed(trade.prepared), ['Input: 250 USDC', 'Approved spending limit: 300 USDC', '1.25', '1.26', 'TSLAx']],
  dexter_execute_asset_action: [governed(receipts.execute), ['1.002443', 'USDC', 'SPCX', 'confirmed']],
  dexter_asset_action_status: [governed(receipts.status), ['1.002443', 'USDC', 'SPCX', 'confirmed']],
  dexter_reconcile_asset_action: [governed(receipts.reconcile), ['1.002443', 'USDC', 'SPCX', 'confirmed']],
  dexter_wallet_history: [governed(receipts.history), ['1.002443', 'USDC', 'SPCX', receipts.status.createdAt, 'confirmed']],
  dexter_trade: [envelope({ namespace: 'dexter-governed-agent-trade/v1', operationId: 'text-fixture-0001', action: 'sell',
    outcome: 'filled', retrySafe: false, intentId: receipts.execute.intentId, execute: receipts.execute }), ['filled', '1002443', 'SPCX']],
  dexter_report_work: [buildAgentWorkReportModelResult({ input: { operationId: report.operationId }, result: report }), ['Reviewing deployment logs', 'Working', report.report.observedAt]],
};

function registered(tool, result) {
  let call;
  const server = { registerTool(_name, _config, handler) { call = handler; return {}; } };
  installOpenToolContracts(server);
  registerOpenTool(server, tool, { inputSchema: {} }, async () => result);
  return call({}, { requestId: 'text-only-host' });
}

assert.deepEqual(Object.keys(cases).sort(), [...OPEN_TOOL_NAMES].sort(), 'Every registered tool needs a text fixture');
for (const [tool, [result, facts]] of Object.entries(cases)) {
  test(`${tool}: registered result answers a content-only host and preserves structured/widget data`, async () => {
    const before = structuredClone(result);
    const expected = applyOpenToolResultPolicy(tool, result);
    const actual = await registered(tool, result);
    const text = actual.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
    for (const fact of facts) assert.ok(text.includes(fact), `${tool} missing ${fact}: ${text}`);
    assert.doesNotMatch(text, /^\s*[{[]/);
    assert.deepEqual(actual.structuredContent, expected.structuredContent);
    const { 'dexter/toolInvocation': invocation, ...meta } = actual._meta;
    assert.deepEqual(meta, expected._meta ?? {});
    assert.deepEqual(result, before, 'Formatting must not mutate the handler result');
    assert.equal(invocation.toolName, tool);
  });
}

for (const [name, wire] of Object.entries({ ...v3, stock_registry: stockRegistry })) {
  test(`portfolio V3 ${name} reports each returned holding and observation`, async () => {
    const result = await registered('dexter_wallet_portfolio', portfolioEnvelope(wire));
    const text = result.content[0].text;
    assert.ok(text.includes(wire.portfolio.observedAt));
    for (const h of wire.portfolio.holdings) {
      for (const value of [h.name, h.symbol, h.displayAmount, h.valueUsd]) if (value !== null) assert.ok(text.includes(value));
      assert.ok(text.includes(wire.card.holdings.find(c => c.mint === h.mint).assetClass));
    }
    if (wire.portfolio.source.kind === 'action_targets') assert.match(text, /Supported assets; these are not holdings/);
  });
}

test('large holdings are sorted and bounded with exact omitted and cash values; unavailable prices stay unknown', () => {
  const portfolio = completePortfolio();
  portfolio.holdings = Array.from({ length: 25 }, (_, index) => ({ ...portfolio.holdings[1], name: `Holding ${index}`, valueUsd: String(index + 1) }));
  const text = withOpenResultText('dexter_wallet_portfolio', envelope({ portfolio })).content[0].text;
  assert.match(text, /And 5 more in this page worth \$15/);
  assert.match(text, /Cash: \$325/);
  assert.ok(text.indexOf('Holding 24') < text.indexOf('Holding 23'));
  assert.doesNotMatch(text, /Holding 0 \(/);
  assert.ok(text.length < 5000);
  const unknown = withOpenResultText('dexter_wallet_portfolio', envelope({ portfolio: partialUnpricedPortfolio() })).content[0].text;
  assert.match(unknown, /Portfolio total: unknown/);
  assert.match(unknown, /SPCX; stock.*value unknown/);
  assert.match(unknown, /Display scaling is unknown/);
});

test('dust and large exact atomic amounts survive wallet activity formatting', async () => {
  const data = walletOutput();
  data.activityPage.items[0].amount.atomic = '9007199254740993';
  const result = await registered('dexter_wallet', buildAnonVaultToolResult(data));
  assert.match(result.content[0].text, /9007199254\.740993 USDC/);
});

test('auth, read failure and governed refusal carry a cause and recovery without private widget secrets', async () => {
  const auth = await registered('dexter_wallet', vaultAuthenticationResult(buildVaultAuthenticationRequired({ tool: 'dexter_wallet' })));
  assert.match(auth.content[0].text, /Connect.*OpenDexter/);
  const refused = buildGovernedAssetToolResult(buildGovernedAssetFailure({ operation: 'execute',
    input: { operationId: 'text-error-0001', intentId: trade.execute.intentId }, code: 'governed_backend_unavailable' }));
  const error = await registered('dexter_execute_asset_action', refused);
  assert.match(error.content[0].text, /same|original/i);
  const privateWallet = { ...walletOutput(), _walletToken: 'private-sentinel', _portfolio: { secret: 'private-portfolio' } };
  const { publicResult, meta } = projectWalletResultForModel(privateWallet, {});
  const result = await registered('dexter_wallet', buildAnonVaultToolResult(publicResult, meta));
  assert.doesNotMatch(result.content[0].text, /private-sentinel|private-portfolio/);
  assert.equal(result._meta.dexterWalletToken, 'private-sentinel');
});

test('Indexter size accounting includes readable text', async () => {
  assert.ok(completeIndexterToolResultBytes('indexter_search', search) <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES);
  const result = await registered('indexter_search', search);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES);
});

test('actual MCP SDK serializes every tool result for a content-only host', async t => {
  const server = new McpServer({ name: 'text-only-test', version: '1.0.0' });
  installOpenToolContracts(server);
  for (const name of OPEN_TOOL_NAMES) registerOpenTool(server, name, { inputSchema: {} }, async () => cases[name][0]);
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'text-only-client', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(st); await client.connect(ct);
  for (const [name, [original, facts]] of Object.entries(cases)) {
    const result = await client.callTool({ name, arguments: name === 'dexter_find_assets' ? { query: 'SpaceX' } : {} });
    assert.notEqual(result.isError, true, `${name}: ${result.content[0]?.text}`);
    for (const fact of facts) assert.ok(result.content[0].text.includes(fact), `${name} missing ${fact}`);
    assert.deepEqual(result.structuredContent, applyOpenToolResultPolicy(name, original).structuredContent);
    if (name === 'dexter_wallet_portfolio') assert.deepEqual(result._meta.portfolioCard, stockRegistry.card);
  }
});

// These handlers can return a session-authentication challenge. Catalog and
// asset discovery authenticate at transport entry and have no such result branch.
for (const tool of ['dexter_wallet', 'dexter_wallet_portfolio', 'dexter_report_work',
  'dexter_prepare_asset_action', 'dexter_execute_asset_action', 'dexter_asset_action_status',
  'dexter_reconcile_asset_action', 'dexter_wallet_history', 'x402_fetch', 'x402_status']) {
  test(`${tool}: connection refusal stays readable and preserves host authorization metadata`, async () => {
    const raw = vaultAuthenticationResult(buildVaultAuthenticationRequired({ tool }));
    if (tool === 'dexter_report_work') delete raw.structuredContent; // Actual report handler's text-only challenge.
    const result = await registered(tool, raw);
    assert.match(result.content[0].text, /Connect.*OpenDexter/);
    assert.match(result.content[0].text, /original request/);
    assert.doesNotMatch(result.content[0].text, /"mode"|"instructions"/);
    assert.deepEqual(result._meta['mcp/www_authenticate'], raw._meta['mcp/www_authenticate']);
  });
}

test('bounded history retains each displayed date, fill, and outcome, then names the omitted row count', async () => {
  const body = structuredClone(receipts.history);
  body.items = Array.from({ length: 25 }, () => structuredClone(body.items[0]));
  const result = await registered('dexter_wallet_history', governed(body));
  assert.equal(result.content[0].text.split(receipts.status.createdAt).length - 1, 20);
  assert.equal(result.content[0].text.split('received 1.002443 USDC').length - 1, 20);
  assert.match(result.content[0].text, /And 5 more actions/);
  assert.ok(result.content[0].text.length < 24000);
});

test('text-only purchase recovery preserves the same handle and never presents pending payment as confirmed', async () => {
  const pending = sanitizeOpenX402IntentResult({ ...saved.savedResponse,
    payment: { ...saved.storedPayment, state: 'pending', confirmed: false, commitment: null } });
  const result = await registered('x402_fetch', envelope(pending));
  assert.match(result.content[0].text, /Payment, state: pending/);
  assert.match(result.content[0].text, /0.01 USDC; requested payment/);
  assert.match(result.content[0].text, /x402_status/);
  assert.ok(result.content[0].text.includes(saved.savedResponse.intentId));
  assert.ok(result.content[0].text.includes('dexter-native-customer-20260917d'));
  assert.doesNotMatch(result.content[0].text, /confirmed payment/);
});

test('catalog text alone shrinks at the wire limit; structured data and widget bytes remain intact', () => {
  const raw = structuredClone(cases.indexter_search[0]);
  raw._meta.padding = 'x'.repeat(INDEXTER_TOOL_RESULT_MAX_JSON_BYTES - Buffer.byteLength(JSON.stringify(raw)) - 250);
  const before = structuredClone(raw);
  const result = withOpenResultText('indexter_search', raw);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES);
  assert.deepEqual(result.structuredContent, before.structuredContent);
  assert.deepEqual(result._meta, before._meta);
  assert.match(result.content[0].text, /smaller.*page/);
});
