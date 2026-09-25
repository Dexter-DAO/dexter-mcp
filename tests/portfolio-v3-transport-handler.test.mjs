import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PORTFOLIO_READ_INPUT_SCHEMA, PORTFOLIO_READ_INPUT_SHAPE,
  normalizePortfolioReadInput, portfolioReady } from '../lib/portfolio-read-contract.mjs';
import { fetchSessionPortfolioSelection, validatePortfolioSelectedRead } from '../lib/session-portfolio-selection.mjs';
import { portfolioResultText } from '../lib/customer-result-presentation.mjs';
import { OPEN_TOOL_NAMES, OPEN_TOOL_CONTRACTS, applyOpenToolResultPolicy,
  installOpenToolContracts, finalizeOpenToolContracts } from '../lib/open-tool-contracts.mjs';
import { buildVaultAuthenticationRequired, isVaultAuthenticationRequired,
  vaultAuthenticationReason, vaultAuthenticationResult } from '../lib/open-tool-auth.mjs';
import { selectedReadFixture } from './fixtures/portfolio-selected-read-fixtures.mjs';

const literals = JSON.parse(readFileSync(new URL('./fixtures/portfolio-selected-v3-api.json', import.meta.url), 'utf8')).valid;
const clone = value => JSON.parse(JSON.stringify(value));
const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const start = source.indexOf("  registerOpenTool(server, 'dexter_wallet_portfolio'");
const registration = source.slice(start, source.indexOf('  registerOpenTool(server, AGENT_WORK_REPORT_TOOL_NAME', start));
const producer = source.slice(source.indexOf('function buildPortfolioReadError('), source.indexOf('async function governedAssetAction('));
const sessionId = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const config = wire => ({ apiBase: 'https://api.invalid', sessionId, secret: 'offline-v3-fixture-only',
  expectedWalletAddress: wire.portfolio.walletAddress,
  now: () => Date.parse(wire.portfolio.observedAt) + 1, onDiagnostic() {} });

test('fresh reads select 3; unversioned saved handles select 2 without decoding a cursor', () => {
  for (const [input, version, view] of [
    [{}, 3, 'summary'], [{ view: 'holdings' }, 3, 'holdings'],
    [{ readVersion: 2 }, 2, 'summary'], [{ snapshotId: 'saved-v2' }, 2, 'summary'],
    [{ cursor: 'opaque-v2' }, 2, undefined], [{ readVersion: 3, cursor: 'opaque-v3' }, 3, undefined],
    [{ readVersion: 3, view: 'targets', holdingSnapshotId: 'parent-v3' }, 3, 'targets'],
  ]) {
    const actual = normalizePortfolioReadInput(input);
    assert.equal(actual.readVersion, version);
    assert.equal(actual.view, view);
  }
  for (const input of [
    { readVersion: 1 }, { readVersion: '3' }, { readVersion: null },
    { view: 'targets', holdingSnapshotId: 'p' }, { readVersion: 2, view: 'targets', holdingSnapshotId: 'p' },
    { readVersion: 3, holdingSnapshotId: 'p' },
    { readVersion: 3, view: 'targets', holdingSnapshotId: 'p', cursor: 'c' },
    { readVersion: 3, view: 'targets', holdingSnapshotId: 'p', snapshotId: 's' },
    { readVersion: 3, walletAddress: literals.native_summary.portfolio.walletAddress },
  ]) assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.safeParse(input).success, false, JSON.stringify(input));
});

test('version header is exact and never becomes a query parameter; one request only', async () => {
  const v2 = selectedReadFixture();
  const v3 = literals.native_summary;
  for (const [wire, input, version] of [
    [v3, {}, 3], [v3, { readVersion: 3, snapshotId: v3.portfolio.snapshotId }, 3],
    [v2, { readVersion: 2 }, 2], [v2, { snapshotId: v2.portfolio.snapshotId }, 2],
    [v2, { cursor: 'opaque-old' }, 2],
  ]) {
    let calls = 0;
    const actual = await fetchSessionPortfolioSelection({ ...config(wire), input, fetchImpl: async (url, init) => {
      calls++;
      const query = new URL(url).searchParams;
      assert.equal(query.has('readVersion'), false);
      assert.equal(query.has('walletAddress'), false);
      assert.equal(query.has('sessionId'), false);
      assert.equal(init.headers['X-Dexter-Portfolio-Read-Version'], version === 3 ? '3' : undefined);
      assert.match(init.headers['x-internal-signature'], /^[0-9a-f]{64}$/);
      assert.match(init.headers['X-Dexter-Portfolio-Request-Id'], /^[0-9a-f-]{36}$/);
      if (input.cursor) assert.equal(query.has('view'), false);
      return new Response(JSON.stringify(wire));
    } });
    assert.deepEqual(actual, wire);
    assert.equal(calls, 1);
  }
});

test('v2/v3 response mismatch refuses without retry, fallback or a second observation', async () => {
  for (const [wire, input] of [[selectedReadFixture(), {}], [literals.native_summary, { readVersion: 2 }],
    [literals.native_summary, { snapshotId: literals.native_summary.portfolio.snapshotId }]]) {
    let calls = 0;
    const actual = await fetchSessionPortfolioSelection({ ...config(wire), input,
      fetchImpl: async () => { calls++; return new Response(JSON.stringify(wire)); } });
    assert.deepEqual(actual, { ok: false, error: 'portfolio_read_unavailable' });
    assert.equal(calls, 1);
  }
});

test('linked targets bind the exact requested parent; standalone targets cannot inherit a parent', async () => {
  const linked = literals.linked_empty_targets;
  const parent = linked.portfolio.source.holdingSnapshotId;
  for (const [wire, input, succeeds] of [
    [linked, { readVersion: 3, view: 'targets', holdingSnapshotId: parent }, true],
    [linked, { readVersion: 3, view: 'targets', holdingSnapshotId: 'another-parent' }, false],
    [linked, { readVersion: 3, view: 'targets' }, false],
    [literals.standalone_unavailable_targets, { readVersion: 3, view: 'targets' }, true],
  ]) {
    let calls = 0;
    const actual = await fetchSessionPortfolioSelection({ ...config(wire), input, fetchImpl: async (url, init) => {
      calls++;
      assert.equal(new URL(url).searchParams.get('holdingSnapshotId'), input.holdingSnapshotId ?? null);
      assert.equal(init.headers['X-Dexter-Portfolio-Read-Version'], '3');
      return new Response(JSON.stringify(wire));
    } });
    assert.deepEqual(actual, succeeds ? wire : { ok: false, error: 'portfolio_read_unavailable' });
    assert.equal(calls, 1);
  }
});

test('validated parent handles stay opaque while added credential fields still refuse', () => {
  const wire = clone(literals.linked_empty_targets);
  wire.portfolio.source.holdingSnapshotId = 'open_' + 'a'.repeat(24);
  const result = { structuredContent: portfolioReady(wire.portfolio),
    content: [{ type: 'text', text: 'fixture' }], _meta: { portfolioCard: wire.card } };
  assert.deepEqual(applyOpenToolResultPolicy('dexter_wallet_portfolio', result).structuredContent, result.structuredContent);
  const labelWire = clone(literals.native_summary);
  // Keep the strict native identity intact; inject into an otherwise valid
  // opaque parent is the only accepted case above. An added credential field
  // must not acquire the same exemption.
  const invalid = { ...result, structuredContent: { ...portfolioReady(labelWire.portfolio), token: 'open_' + 'a'.repeat(24) } };
  assert.throws(() => applyOpenToolResultPolicy('dexter_wallet_portfolio', invalid));
});

test('v3 expiry and API refusals preserve the existing recovery contract without refresh', async () => {
  const wire = literals.native_summary;
  for (const [status, error] of [[400, 'portfolio_query_invalid'], [409, 'portfolio_snapshot_expired'],
    [413, 'portfolio_snapshot_too_large'], [422, 'portfolio_result_budget_exceeded'], [503, 'portfolio_read_unavailable']]) {
    let calls = 0;
    const actual = await fetchSessionPortfolioSelection({ ...config(wire), input: { readVersion: 3, snapshotId: wire.portfolio.snapshotId },
      fetchImpl: async () => { calls++; return new Response(JSON.stringify({ ok: false, error }), { status }); } });
    assert.deepEqual(actual, { ok: false, error }); assert.equal(calls, 1);
  }
  assert.ok(validatePortfolioSelectedRead(wire, { expectedWalletAddress: wire.portfolio.walletAddress }), 'saved evidence remains valid');
  let calls = 0;
  const expired = await fetchSessionPortfolioSelection({ ...config(wire), now: () => Date.parse(wire.portfolio.expiresAt),
    input: { readVersion: 3, snapshotId: wire.portfolio.snapshotId },
    fetchImpl: async () => { calls++; return new Response(JSON.stringify(wire)); } });
  assert.deepEqual(expired, { ok: false, error: 'portfolio_snapshot_expired' }); assert.equal(calls, 1);
});

// Extract the same actual producer/registration boundary used by the existing
// customer-result-handler suite. Only state/HTTP dependencies are mocked.
function actualHandler(wire, { state = { status: 'ready', vault: {} }, bound = true } = {}) {
  let handler; let stateReads = 0; let httpReads = 0; let marked = 0; let cleared = 0;
  const requests = [];
  runInNewContext(`${producer}\n${registration}`, {
    server: {}, PORTFOLIO_META: { 'ui/resourceUri': 'ui://fixture/portfolio.html' },
    PORTFOLIO_READ_INPUT_SCHEMA, PORTFOLIO_READ_INPUT_SHAPE, portfolioReady, portfolioResultText,
    API_BASE_FALLBACK: 'https://api.invalid', INTERNAL_HMAC_SECRET: 'offline-v3-fixture-only',
    extractMcpSessionId: () => sessionId,
    fetchVaultStateBySession: async () => { stateReads++; return state; },
    getVaultReceiveAddress: () => wire.portfolio.walletAddress,
    fetchSessionPortfolioSelection: input => fetchSessionPortfolioSelection({ ...input,
      now: config(wire).now, onDiagnostic() {}, fetchImpl: async (url, init) => {
        httpReads++; requests.push({ url: String(url), headers: init.headers });
        return new Response(JSON.stringify(wire));
      } }),
    checkSessionVaultBinding: async () => ({ ok: true, bound }),
    markSessionVaultBound() { marked++; }, clearSessionVaultBinding() { cleared++; },
    buildVaultAuthenticationRequired, isVaultAuthenticationRequired, vaultAuthenticationReason, vaultAuthenticationResult,
    registerOpenTool: (_server, _name, _descriptor, fn) => { handler = fn; },
    console: { warn() {} }, safeErrorLabel: () => 'offline-fixture',
  });
  return { invoke: args => handler(args, {}), counts: () => ({ stateReads, httpReads, marked, cleared }), requests };
}

test('actual handler preserves each v3 literal through result policy; neighboring auth remains enforced', async t => {
  for (const [fixtureName, wire] of Object.entries(literals)) {
    const s = wire.portfolio.selection;
    const input = { readVersion: 3, view: s.view,
      ...(s.mint ? { mint: s.mint } : {}), ...(s.query ? { query: s.query } : {}),
      ...(s.tokenAccount ? { tokenAccount: s.tokenAccount } : {}),
      ...(wire.portfolio.source.holdingSnapshotId ? { holdingSnapshotId: wire.portfolio.source.holdingSnapshotId } : {}) };
    const actual = actualHandler(wire);
    const result = applyOpenToolResultPolicy('dexter_wallet_portfolio', clone(await actual.invoke(input)));
    assert.deepEqual(result.structuredContent, portfolioReady(wire.portfolio));
    assert.deepEqual(result._meta.portfolioCard, wire.card);
    assert.equal(result.isError, false);
    assert.equal(actual.counts().stateReads, 1); assert.equal(actual.counts().httpReads, 1);
    assert.ok(Buffer.byteLength(result.content[0].text, 'utf8') <= 384);
    assert.equal(OPEN_TOOL_CONTRACTS.dexter_wallet_portfolio.outputSchema.safeParse(result.structuredContent).success, true);
    // Retain the actual model-safe envelope for the separately owned Primary
    // normalization/replay check during the assigned offline qualification.
    t.diagnostic(`DEXTER_PORTFOLIO_V3_ENVELOPE ${JSON.stringify({ fixtureName, result })}`);
  }
  const revoked = actualHandler(literals.native_summary, { state: { status: 'authentication_required' }, bound: false });
  const refused = await revoked.invoke({});
  assert.equal(refused.isError, true); assert.equal(revoked.counts().httpReads, 0);
  assert.equal(revoked.counts().stateReads, 1);
});

test('actual SDK contract accepts v3 and retains v1/v2; structuredContent alone holds complete model facts', async t => {
  const wire = literals.native_summary;
  const handler = actualHandler(wire);
  const server = new McpServer({ name: 'portfolio-v3-offline', version: '1.0.0' });
  installOpenToolContracts(server);
  for (const name of OPEN_TOOL_NAMES) server.registerTool(name,
    { inputSchema: name === 'dexter_wallet_portfolio' ? PORTFOLIO_READ_INPUT_SHAPE : {} },
    args => { assert.equal(name, 'dexter_wallet_portfolio'); return handler.invoke(args); });
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'portfolio-v3-offline', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport); await client.connect(clientTransport);
  const tool = (await client.listTools()).tools.find(row => row.name === 'dexter_wallet_portfolio');
  assert.ok(tool.inputSchema.properties.readVersion); assert.ok(tool.inputSchema.properties.holdingSnapshotId);
  for (const version of [1, 2, 3]) assert.ok(JSON.stringify(tool.outputSchema).includes(`opendexter.portfolio.v${version}`));
  const result = await client.callTool({ name: 'dexter_wallet_portfolio', arguments: {} });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, portfolioReady(wire.portfolio));
  assert.deepEqual(result._meta.portfolioCard, wire.card);
  assert.equal(result.structuredContent.portfolio.source.tradingAvailability.state, 'not_evaluated');
  assert.equal(Object.hasOwn(result.structuredContent.portfolio, 'sourceSummary'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(result.structuredContent), 'utf8') <= 2048);
  const before = handler.counts();
  const invalid = await client.callTool({ name: 'dexter_wallet_portfolio', arguments: { view: 'targets', holdingSnapshotId: 'p' } });
  assert.equal(invalid.isError, true); assert.deepEqual(handler.counts(), before);
});
