import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PORTFOLIO_READ_INPUT_SCHEMA, PORTFOLIO_READ_INPUT_SHAPE } from '../lib/portfolio-read-contract.mjs';
import { validatePortfolioSelectedRead, fetchSessionPortfolioSelection } from '../lib/session-portfolio-selection.mjs';
import { modelSafePortfolioSnapshot, validateAndBoundPortfolioSnapshotV1 } from '../lib/session-portfolio.mjs';
import { portfolioResultText } from '../lib/customer-result-presentation.mjs';
import { OPEN_TOOL_CONTRACTS, OPEN_TOOL_NAMES, applyOpenToolResultPolicy,
  installOpenToolContracts, finalizeOpenToolContracts } from '../lib/open-tool-contracts.mjs';
import { approvedActionTarget } from './fixtures/approved-action-target-fixtures.mjs';
import { MINTS, WALLET_ADDRESS } from './fixtures/wallet-portfolio-fixtures.mjs';
import { ambiguousReadFixture, compactHolding, detailReadFixture, largeSourceSummaryFixture,
  manySelectedHoldings, NEXT_CURSOR, portfolioReady, retainedPortfolioSource, retainedRichHoldings,
  selectedReadFixture, targetReadFixture, WRAPPED_SOL_MINT } from './fixtures/portfolio-selected-read-fixtures.mjs';

const SESSION_ID = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const SECRET = 'offline-selected-portfolio-test-only';
const outputSchema = OPEN_TOOL_CONTRACTS.dexter_wallet_portfolio.outputSchema;
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const validate = value => validatePortfolioSelectedRead(value, { expectedWalletAddress: WALLET_ADDRESS });
const config = { apiBase: 'https://api.invalid', sessionId: SESSION_ID,
  expectedWalletAddress: WALLET_ADDRESS, secret: SECRET,
  now: () => Date.parse('2026-07-25T10:30:10.000Z') };

test('selected read inputs admit each view and keep native SOL distinct from wrapped SOL', () => {
  for (const input of [
    {}, { view: 'summary', network: 'solana-mainnet' },
    { view: 'holdings', limit: 1 }, { view: 'holdings', query: 'DEXTER', limit: 32 },
    { view: 'detail', mint: 'native:SOL' }, { view: 'detail', mint: WRAPPED_SOL_MINT },
    { view: 'detail', mint: MINTS.dexter, tokenAccount: retainedRichHoldings()[0].tokenAccount },
    { view: 'targets', query: 'SpaceX' }, { cursor: NEXT_CURSOR },
    { view: 'detail', cursor: NEXT_CURSOR },
    { cursor: NEXT_CURSOR, mint: MINTS.dexter, tokenAccount: retainedRichHoldings()[0].tokenAccount },
    { snapshotId: 'saved-snapshot' },
  ]) assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.safeParse(input).success, true, JSON.stringify(input));
  assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.parse({ view: 'detail', query: 'Dexter AI' }).query, 'Dexter AI');
  assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.parse({ view: 'detail', mint: 'native:SOL' }).mint, 'native:SOL');
  assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.parse({ view: 'detail', mint: WRAPPED_SOL_MINT }).mint, WRAPPED_SOL_MINT);
});

test('invalid selection or authority inputs fail locally rather than silently changing the read', () => {
  for (const input of [
    { walletAddress: WALLET_ADDRESS }, { sessionId: SESSION_ID }, { userHandle: 'some-wallet' },
    { network: 'eip155:8453' }, { view: 'all' }, { view: 'detail' },
    { view: 'holdings', query: 'DEXTER', mint: MINTS.dexter },
    { view: 'holdings', tokenAccount: WALLET_ADDRESS },
    { view: 'holdings', cursor: NEXT_CURSOR, mint: MINTS.dexter, tokenAccount: WALLET_ADDRESS }, { view: 'detail', query: 'DEXTER', tokenAccount: WALLET_ADDRESS },
    { view: 'summary', query: 'DEXTER' }, { view: 'summary', mint: MINTS.dexter },
    { view: 'summary', limit: 5 }, { view: 'summary', cursor: NEXT_CURSOR },
    { view: 'holdings', limit: 0 }, { view: 'holdings', limit: 33 }, { view: 'holdings', limit: 1.5 },
    { view: 'holdings', query: '' }, { view: 'holdings', query: '   ' },
    { view: 'holdings', query: ' DEXTER ' }, { view: 'holdings', query: '界'.repeat(43) },
    { view: 'detail', mint: 'SOL' }, { view: 'detail', mint: 'native:sol' },
    { view: 'detail', mint: 'native:SOL', tokenAccount: WALLET_ADDRESS },
    { view: 'detail', mint: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
    { view: 'detail', mint: '1'.repeat(31) },
    { snapshotId: '界' }, { snapshotId: 's'.repeat(129) }, { cursor: 'c'.repeat(1025) },
  ]) assert.equal(PORTFOLIO_READ_INPUT_SCHEMA.safeParse(input).success, false, JSON.stringify(input));
});

test('a selected summary represents more than 128 source holdings without transferring them', () => {
  const wire = largeSourceSummaryFixture();
  const checked = validate(wire);
  assert.deepEqual(checked, wire);
  assert.notEqual(checked, wire, 'the boundary returns a detached value');
  assert.equal(checked.portfolio.sourceSummary.holdingCount, 200);
  assert.equal(checked.portfolio.sourceSummary.unpricedHoldings, 197);
  assert.equal(checked.portfolio.sourceSummary.portfolioValueUsd, null);
  assert.equal(checked.portfolio.selection.returnedCount, 3);
  assert.equal(checked.portfolio.selection.omittedCount, 197);
  assert.equal(checked.portfolio.selection.nextCursor, null);
  assert.equal(checked.card.holdings.length, 3);
  assert.equal(outputSchema.safeParse(portfolioReady(checked.portfolio)).success, true);
  assert.ok(bytes(portfolioReady(checked.portfolio)) <= 2048);
  assert.equal(checked.portfolio.sourceSummary.pricedValueUsd, '18446744174.262801615');
});

test('saved legacy v1 output stays valid without inventing snapshot or continuation identity', () => {
  const raw = retainedPortfolioSource();
  assert.deepEqual(validateAndBoundPortfolioSnapshotV1(raw), raw);
  const saved = portfolioReady(modelSafePortfolioSnapshot(raw));
  const before = structuredClone(saved);
  assert.equal(outputSchema.safeParse(saved).success, true);
  assert.deepEqual(saved, before);
  assert.equal(saved.portfolio.contractVersion, 'opendexter.portfolio.v1');
  assert.equal(Object.hasOwn(saved.portfolio, 'snapshotId'), false);
  assert.equal(Object.hasOwn(saved.portfolio, 'selection'), false);
});

test('detail preserves exact amount units, nulls, provenance, issuer identity and capability reasons', () => {
  const wire = detailReadFixture();
  const checked = validate(wire);
  assert.deepEqual(checked, wire);
  assert.deepEqual(checked.portfolio.holdings[0], retainedRichHoldings()[2]);
  const holding = checked.portfolio.holdings[0];
  assert.equal(holding.amountRaw, '4426');
  assert.equal(holding.displayAmount, '0.0055325');
  assert.equal(holding.displayMultiplier, '1.25');
  assert.equal(holding.priceSource, 'jupiter-exact-in-quote');
  assert.equal(holding.priceBlockId, 101);
  assert.equal(holding.change24hPercent, null);
  assert.equal(holding.marketContext.liquidityUsd, null);
  assert.equal(holding.registryIdentity.legalIssuerName, 'Trek Nexus Markets Ltd');
  assert.equal(holding.capabilities.find(row => row.action === 'send').reasonCode, 'governed_asset_rail_not_live');
  assert.deepEqual(validate(detailReadFixture(1)).portfolio.holdings[0].marketContext,
    retainedRichHoldings()[1].marketContext, 'explicit zero observations survive');
  assert.ok(bytes(portfolioReady(checked.portfolio)) <= 8192);
});

test('ambiguous mint detail preserves separate token accounts as compact choices', () => {
  const checked = validate(ambiguousReadFixture());
  assert.ok(checked);
  assert.equal(checked.portfolio.selection.match, 'ambiguous');
  assert.equal(checked.portfolio.selection.matchedCount, 2);
  assert.equal(checked.portfolio.holdings[0].mint, checked.portfolio.holdings[1].mint);
  assert.notEqual(checked.portfolio.holdings[0].tokenAccount, checked.portfolio.holdings[1].tokenAccount);
  assert.equal(Object.hasOwn(checked.portfolio.holdings[0], 'amountRaw'), false);
  assert.equal(checked.card.holdings.length, 2);
});

test('later pages preserve full source totals and count every absent row as omitted', () => {
  const wire = selectedReadFixture({ view: 'holdings', holdings: [retainedRichHoldings()[2]],
    selection: { limit: 1, offset: 2, matchedCount: 3, omittedCount: 2 } });
  assert.deepEqual(validate(wire), wire);
  assert.equal(wire.portfolio.sourceSummary.pricedHoldings, 3);
  assert.equal(wire.portfolio.sourceSummary.pricedValueUsd, retainedPortfolioSource().pricedValueUsd);
  assert.equal(wire.portfolio.selection.omittedCount, 2, 'earlier pages remain absent from this response');
});

test('negative selected search does not turn other holdings or unknown source value into zero', () => {
  const wire = selectedReadFixture({ view: 'detail', holdings: [],
    sourceSummary: { holdingsComplete: false, omittedHoldings: 7, portfolioValueUsd: null,
      enrichment: { metadata: 'partial', pricing: 'partial', tokenExtensions: 'complete' } },
    selection: { query: 'absent literal', matchedCount: 0, match: 'none', omittedCount: 3 } });
  const checked = validate(wire);
  assert.ok(checked);
  assert.equal(checked.portfolio.sourceSummary.holdingCount, 3);
  assert.equal(checked.portfolio.sourceSummary.portfolioValueUsd, null);
  assert.equal(checked.portfolio.sourceSummary.holdingsComplete, false);
  assert.equal(checked.portfolio.sourceSummary.omittedHoldings, 7);
  assert.equal(checked.portfolio.holdings.length, 0);
});

test('approved targets remain separate from holdings and retain card availability evidence', () => {
  const wire = targetReadFixture();
  wire.portfolio.sourceSummary = { ...wire.portfolio.sourceSummary, holdingCount: 0,
    pricedHoldings: 0, unpricedHoldings: 0, pricedValueUsd: '0', portfolioValueUsd: '0' };
  const checked = validate(wire);
  assert.ok(checked);
  assert.equal(checked.portfolio.holdings.length, 0);
  assert.equal(checked.portfolio.targets.length, 1);
  assert.deepEqual(checked.card.approvedActionTargets, [approvedActionTarget()]);
  assert.equal(checked.portfolio.targets[0].actions[2].reason, 'protected_agent_send_sdk_required');
  assert.equal(Object.hasOwn(checked.portfolio.targets[0], 'targetDigest'), false);
});

test('unavailable target source and known empty target source remain different', () => {
  const unavailable = selectedReadFixture({ view: 'targets' });
  const empty = selectedReadFixture({ view: 'targets', sourceSummary: { targetCount: 0 } });
  assert.ok(validate(unavailable));
  assert.ok(validate(empty));
  assert.deepEqual([unavailable.portfolio.selection.matchedCount, unavailable.portfolio.selection.omittedCount,
    unavailable.portfolio.selection.match], [null, null, 'unavailable']);
  assert.deepEqual([empty.portfolio.selection.matchedCount, empty.portfolio.selection.omittedCount,
    empty.portfolio.selection.match], [0, 0, 'none']);
});

test('contradictory source counts, selection counts and continuation fail closed', () => {
  const invalid = [
    value => { value.portfolio.sourceSummary.holdingCount++; },
    value => { value.portfolio.sourceSummary.pricedHoldings = -1; },
    value => { value.portfolio.sourceSummary.omittedHoldings = 1; },
    value => { value.portfolio.selection.returnedCount--; },
    value => { value.portfolio.selection.omittedCount++; },
    value => { value.portfolio.selection.matchedCount = 2; },
    value => { value.portfolio.selection.offset = 1; },
    value => { value.portfolio.selection.nextCursor = NEXT_CURSOR; },
    value => { value.portfolio.selection.match = 'none'; },
  ];
  for (const [index, mutate] of invalid.entries()) {
    const wire = selectedReadFixture(); mutate(wire);
    assert.equal(validate(wire), null, `invalid count/continuation ${index}`);
  }
  const missingContinuation = selectedReadFixture({ view: 'holdings', holdings: [retainedRichHoldings()[0]],
    selection: { limit: 1, nextCursor: null } });
  assert.equal(validate(missingContinuation), null);
  missingContinuation.portfolio.selection.nextCursor = NEXT_CURSOR;
  assert.ok(validate(missingContinuation));
});

test('source identity, selected-card correspondence and rich holding invariants are checked', () => {
  const invalid = [
    value => { value.modelLeak = 'extra'; },
    value => { value.portfolio.walletAddress = 'Stake11111111111111111111111111111111111111'; },
    value => { value.portfolio.network = 'eip155:8453'; },
    value => { value.card.snapshotId = 'another-observation'; },
    value => { value.card.holdings.reverse(); },
    value => { value.card.holdings.pop(); },
    value => { value.card.holdings.push(retainedRichHoldings()[0]); },
    value => { value.card.holdings[0].valueUsd = '0'; },
    value => { value.card.holdings[0].amountRaw = '1'; },
    value => { value.card.holdings[0].marketContext.mint = MINTS.usdc; },
    value => { value.card.holdings[1].tokenAccount = WALLET_ADDRESS; },
    value => { value.card.holdings[2].displayMultiplier = null; },
    value => { value.portfolio.holdings[0].change24hPercent = 'NaN'; },
    value => { value.portfolio.expiresAt = value.portfolio.observedAt; },
  ];
  for (const [index, mutate] of invalid.entries()) {
    const wire = selectedReadFixture(); mutate(wire);
    assert.equal(validate(wire), null, `invalid source/card binding ${index}`);
  }
  const target = targetReadFixture();
  target.card.approvedActionTargets[0].name = 'Changed without digest';
  assert.equal(validate(target), null);
});

test('model budget is measured in UTF-8 bytes and cannot be bypassed with multibyte labels', () => {
  const holdings = manySelectedHoldings();
  const wire = selectedReadFixture({ view: 'holdings', holdings,
    sourceSummary: { holdingCount: 32, pricedHoldings: 32 }, selection: { matchedCount: 32 } });
  assert.ok(JSON.stringify(portfolioReady(wire.portfolio)).length < bytes(portfolioReady(wire.portfolio)));
  assert.ok(bytes(portfolioReady(wire.portfolio)) > 6144);
  assert.equal(validate(wire), null);
  wire.portfolio.selection.view = 'detail';
  wire.portfolio.selection.mint = holdings[0].mint;
  wire.portfolio.selection.match = 'ambiguous';
  assert.ok(bytes(portfolioReady(wire.portfolio)) > 8192);
  assert.equal(validate(wire), null);
});

test('selected transport requests an explicit view and forwards selectors without an authority override', async () => {
  const wire = detailReadFixture();
  const input = { view: 'detail', network: 'solana-mainnet', mint: wire.portfolio.selection.mint,
    snapshotId: wire.portfolio.snapshotId };
  let calls = 0;
  const result = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2, ...input }, fetchImpl: async (url, init) => {
    calls++;
    const request = new URL(url);
    assert.equal(request.pathname, `/api/passkey-anon/mcp-portfolio/${SESSION_ID}`);
    assert.deepEqual(Object.fromEntries(request.searchParams), input);
    assert.equal(init.headers['x-internal-signature'].length, 64);
    assert.doesNotMatch(request.search, /walletAddress|userHandle|vaultPda/);
    return new Response(JSON.stringify(wire));
  } });
  assert.deepEqual(result, wire);
  assert.equal(calls, 1);
  await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 }, fetchImpl: async url => {
    assert.equal(new URL(url).searchParams.get('view'), 'summary');
    return new Response(JSON.stringify(selectedReadFixture()));
  } });
});

test('invalid inputs are refused before HTTP and without a full-route fallback', async () => {
  let calls = 0;
  const result = await fetchSessionPortfolioSelection({ ...config, input: { network: 'eip155:8453' },
    fetchImpl: async () => { calls++; throw new Error('must not fetch'); } });
  assert.equal(calls, 0);
  assert.equal(result.error, 'portfolio_query_invalid');
});

test('structurally valid responses must still match the requested observation and selectors', async () => {
  const firstPage = selectedReadFixture({ view: 'holdings', holdings: [retainedRichHoldings()[0]],
    selection: { nextCursor: NEXT_CURSOR } });
  const filtered = selectedReadFixture({ view: 'holdings', holdings: [retainedRichHoldings()[0]],
    selection: { query: 'DEXTER', matchedCount: 1 } });
  const laterPage = selectedReadFixture({ view: 'holdings', holdings: [retainedRichHoldings()[2]],
    selection: { offset: 2 } });
  for (const [input, wire] of [
    [{ snapshotId: 'different-observation' }, selectedReadFixture()],
    [{ view: 'holdings' }, selectedReadFixture()],
    [{ view: 'detail', mint: MINTS.usdc }, detailReadFixture()],
    [{ view: 'detail', query: 'SpaceX' }, detailReadFixture()],
    [{ view: 'holdings', limit: 1 }, firstPage],
    [{ view: 'holdings' }, filtered],
    [{ view: 'holdings' }, laterPage],
  ]) {
    assert.ok(validate(wire), 'the response is valid independently of the request');
    let calls = 0;
    const result = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2, ...input }, fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(wire));
    } });
    assert.deepEqual(result, { ok: false, error: 'portfolio_read_unavailable' });
    assert.equal(calls, 1);
  }
  const resumed = await fetchSessionPortfolioSelection({ ...config, input: { cursor: NEXT_CURSOR },
    fetchImpl: async url => {
      assert.deepEqual(Object.fromEntries(new URL(url).searchParams), { cursor: NEXT_CURSOR });
      return new Response(JSON.stringify(laterPage));
    } });
  assert.deepEqual(resumed, laterPage, 'the API resolves a cursor-only read without an inferred view');
});

test('selection HTTP failures preserve only matching public codes and never retry', async () => {
  for (const [status, error] of [
    [400, 'portfolio_query_invalid'], [409, 'portfolio_snapshot_expired'],
    [413, 'portfolio_snapshot_too_large'], [422, 'portfolio_result_budget_exceeded'],
    [503, 'portfolio_read_unavailable'],
  ]) {
    let calls = 0;
    const result = await fetchSessionPortfolioSelection({ ...config, input: { cursor: NEXT_CURSOR },
      fetchImpl: async () => { calls++; return new Response(JSON.stringify({ ok: false, error }), { status }); } });
    assert.equal(result.error, error);
    assert.equal(calls, 1);
  }
  for (const [status, body] of [[500, { ok: false, error: 'internal secret' }],
    [400, { ok: false, error: 'portfolio_snapshot_expired' }], [503, 'not-json']]) {
    let calls = 0;
    const result = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 }, fetchImpl: async () => {
      calls++; return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    } });
    assert.equal(result.error, 'portfolio_read_unavailable');
    assert.equal(calls, 1);
  }
});

test('the public read-error schema accepts only the five defined selected-read codes', () => {
  const base = { portfolio_status: 'read_error', mode: 'portfolio_read_error', user_bound: true,
    retryable: false, message: 'This portfolio read could not finish.' };
  for (const readError of ['portfolio_query_invalid', 'portfolio_snapshot_expired',
    'portfolio_snapshot_too_large', 'portfolio_result_budget_exceeded', 'portfolio_read_unavailable']) {
    assert.equal(outputSchema.safeParse({ ...base, readError }).success, true, readError);
  }
  assert.equal(outputSchema.safeParse({ ...base, readError: 'provider_secret_failure' }).success, false);
});

test('transport exceptions and oversized responses do not cause another request', async () => {
  let calls = 0;
  const failed = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 }, fetchImpl: async () => {
    calls++; throw new Error('offline transport failed');
  } });
  assert.equal(calls, 1);
  assert.equal(failed.error, 'portfolio_read_unavailable');
  let bodyReads = 0;
  const oversized = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 }, fetchImpl: async () => ({
    ok: true, status: 200, headers: { get: () => String(512 * 1024 + 1) },
    text: async () => { bodyReads++; return JSON.stringify(selectedReadFixture()); },
  }) });
  assert.equal(bodyReads, 0);
  assert.equal(oversized.error, 'portfolio_read_unavailable');
  const oversizedBody = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 },
    fetchImpl: async () => new Response(`${' '.repeat(512 * 1024)}${JSON.stringify(selectedReadFixture())}`) });
  assert.equal(oversizedBody.error, 'portfolio_read_unavailable', 'the body ceiling does not trust Content-Length');
});

test('an expired successful response remains historical data and cannot become a fresh read', async () => {
  const wire = selectedReadFixture();
  assert.ok(validate(wire), 'the timeless validator can still validate saved evidence');
  let calls = 0;
  const result = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 },
    now: () => Date.parse(wire.portfolio.expiresAt), fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(wire));
    } });
  assert.deepEqual(result, { ok: false, error: 'portfolio_snapshot_expired' });
  assert.equal(calls, 1, 'expiry does not silently replace the observation');
});

for (const stage of ['headers', 'body']) {
  test(`the selected-read deadline includes a stalled ${stage} without retry`, { timeout: 1000 }, async () => {
    let calls = 0;
    let signal;
    const result = await fetchSessionPortfolioSelection({ ...config, input: { readVersion: 2 }, timeoutMs: 20,
      fetchImpl: async (_url, init) => {
        calls++;
        signal = init.signal;
        const pending = new Promise(() => {});
        if (stage === 'headers') return pending;
        return { ok: true, status: 200, headers: { get: () => null }, text: () => pending };
      } });
    assert.deepEqual(result, { ok: false, error: 'portfolio_read_unavailable' });
    assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  });
}

test('SDK emits bounded model output while selected rich data stays in card metadata', async t => {
  const wire = largeSourceSummaryFixture();
  const result = portfolioReady(wire.portfolio);
  const response = { structuredContent: result,
    content: [{ type: 'text', text: portfolioResultText(result) }], _meta: { portfolioCard: wire.card } };
  assert.ok(Buffer.byteLength(response.content[0].text, 'utf8') <= 384);
  assert.doesNotMatch(response.content[0].text, /amountRaw|marketContext|targetDigest/);
  assert.deepEqual(applyOpenToolResultPolicy('dexter_wallet_portfolio', response).structuredContent, result);
  const server = new McpServer({ name: 'selected-portfolio-offline', version: '1.0.0' });
  let handlerCalls = 0;
  installOpenToolContracts(server);
  for (const name of OPEN_TOOL_NAMES) server.registerTool(name,
    { inputSchema: name === 'dexter_wallet_portfolio' ? PORTFOLIO_READ_INPUT_SHAPE : {} },
    async () => { assert.equal(name, 'dexter_wallet_portfolio'); handlerCalls++; return response; });
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'selected-portfolio-offline', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tool = (await client.listTools()).tools.find(row => row.name === 'dexter_wallet_portfolio');
  assert.ok(tool.inputSchema.properties.view);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.ok(JSON.stringify(tool.outputSchema).includes('opendexter.portfolio.v2'));
  assert.ok(JSON.stringify(tool.outputSchema).includes('opendexter.portfolio.v1'));
  const envelope = await client.callTool({ name: 'dexter_wallet_portfolio', arguments: {} });
  assert.notEqual(envelope.isError, true);
  assert.deepEqual(envelope.structuredContent, result);
  assert.deepEqual(envelope._meta.portfolioCard, wire.card);
  assert.deepEqual(envelope.structuredContent.portfolio.holdings, wire.card.holdings.map(compactHolding));
  assert.equal(Object.hasOwn(envelope.structuredContent, 'card'), false);
  assert.ok(bytes(envelope.structuredContent) <= 2048);
  assert.equal(handlerCalls, 1);
  for (const args of [
    { walletAddress: WALLET_ADDRESS },
    { view: 'holdings', query: ' DEXTER ' },
    { view: 'holdings', cursor: NEXT_CURSOR, mint: MINTS.dexter,
      tokenAccount: retainedRichHoldings()[0].tokenAccount },
  ]) {
    const rejected = await client.callTool({ name: 'dexter_wallet_portfolio', arguments: args });
    assert.equal(rejected.isError, true, JSON.stringify(args));
    assert.equal(handlerCalls, 1, 'SDK validation must reject rather than strip or reinterpret input');
  }
});


test('actual API selector envelopes cross MCP validation and result policy without field loss', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/portfolio-selected-api.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(fixtures), ['summary', 'holdings', 'next', 'detail', 'ambiguous', 'targets', 'none']);
  for (const [name, fixture] of Object.entries(fixtures)) {
    const checked = validatePortfolioSelectedRead(fixture, { expectedWalletAddress: fixture.portfolio.walletAddress });
    assert.deepEqual(checked, fixture, name);
    const body = portfolioReady(checked.portfolio);
    const result = applyOpenToolResultPolicy('dexter_wallet_portfolio', {
      structuredContent: body, content: [{ type: 'text', text: portfolioResultText(body) }],
      _meta: { portfolioCard: checked.card },
    });
    assert.deepEqual(result.structuredContent, body, name);
    assert.deepEqual(result._meta.portfolioCard, fixture.card, name);
    assert.ok(Buffer.byteLength(result.content[0].text, 'utf8') <= 384, name);
    assert.equal(outputSchema.safeParse(result.structuredContent).success, true, name);
  }
});
