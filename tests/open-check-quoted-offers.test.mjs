import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { buildHostedCheckModelResult, buildHostedCheckToolResult } from '../lib/open-check-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { withOpenResultText } from '../lib/open-result-text.mjs';

// Captured from the public API coordinator with synthetic seller/authority
// adapters. These are producer outputs, not evidence of a live seller payment.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/quoted-offers/api-producer.json', import.meta.url)));
const url = 'https://seller.example/resource';
const built = await build({ stdin: { contents: `
  export { normalizeX402PaymentRoutes } from './apps-sdk/ui/src/components/x402/check-result-model.ts';
`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

for (const fixture of fixtures) {
  test(`actual API ${fixture.name} offers survive fresh, recovered, selected model and widget projection`, () => {
    for (const stage of ['fresh', 'recovered', 'selected']) {
      const original = fixture[stage];
      const model = buildHostedCheckModelResult({ checkResult: original, url, recoveredCheck: stage === 'recovered' });
      OPEN_TOOL_CONTRACTS[stage === 'recovered' ? 'x402_status' : 'x402_check'].outputSchema.parse(model);
      assert.deepEqual(model.quote, original.quote);
      assert.equal(model.paymentOptions.length, original.paymentOptions.length);
      for (const [index, option] of original.paymentOptions.entries()) {
        assert.deepEqual(Object.fromEntries(Object.keys(option).map(key => [key, model.paymentOptions[index][key]])), option);
        assert.equal(model.paymentOptions[index].priceFormatted, '0.000025 USDC');
      }
      const routes = ui.normalizeX402PaymentRoutes(model.paymentOptions);
      assert.equal(routes.length, original.paymentOptions.length);
      assert.deepEqual(routes.map(route => route.amountAtomic), original.paymentOptions.map(offer => offer.amountAtomic));
      const text = withOpenResultText('x402_check', buildHostedCheckToolResult(model)).content[0].text;
      assert.match(text, /Quoted offers:/);
      for (const option of original.paymentOptions) assert.ok(text.includes(option.network));
      if (original.paymentOptions.some(option => option.smartWalletSupport === 'unknown')) assert.match(text, /support declaration: unknown/);
      assert.equal(text.includes('; selected.'), stage === 'selected');
      assert.equal(model.executionGuidance.readyForFetch, true);
    }
  });
}

for (const [name, mutate] of [
  ['missing offer', value => { value.paymentOptions = []; }],
  ['too many offers', value => { value.paymentOptions = Array(5).fill(value.paymentOptions[0]); }],
  ['duplicate offers', value => { value.paymentOptions = [value.paymentOptions[0], value.paymentOptions[0]]; }],
  ['decimal amount', value => { value.paymentOptions[0].amountAtomic = '0.5'; }],
  ['unknown network', value => { value.paymentOptions[0].network = 'eip155:1'; }],
  ['wrong asset', value => { value.paymentOptions[0].asset = 'secret'; }],
  ['unknown declaration', value => { value.paymentOptions[0].smartWalletSupport = 'probably'; }],
  ['missing declaration', value => { delete value.paymentOptions[0].smartWalletSupport; }],
  ['seller extras', value => { value.paymentOptions[0].extra = { authorization: 'do-not-copy' }; }],
  ['different amount', value => { value.paymentOptions[1].amountAtomic = '26'; }],
  ['scalar amount mismatch', value => { value.amountAtomic = '26'; }],
  ['invalid expiry', value => { value.paymentOptions[0].expiresAt = 'never'; }],
  ['expiry beyond check', value => { value.expiresAtUnixMs -= 1; }],
  ['invented selected index', value => { value.quote = { ...value.quote, state: 'selected', selectedOfferIndex: 3 }; }],
  ['unbound selected terms', value => { value.quote = { ...value.quote, state: 'selected', selectedOfferIndex: 1 }; }],
  ['unknown quote kind', value => { value.quote.kind = 'runnable_routes'; }],
]) {
  test(`malformed producer ${name} cannot fall back to a ready legacy quote`, () => {
    const value = structuredClone(fixtures[0].fresh);
    mutate(value);
    const model = buildHostedCheckModelResult({ checkResult: value, url, checkRequestId: 'saved-quote' });
    OPEN_TOOL_CONTRACTS.x402_check.outputSchema.parse(model);
    assert.equal(model.ok, false);
    assert.equal(model.error, 'invalid_payment_quote');
    assert.equal(model.intentId, null);
    assert.equal(model.executionGuidance.readyForFetch, false);
    assert.equal(model.paymentOptions, undefined);
    assert.ok(!JSON.stringify(model).includes('do-not-copy'));
  });
}

test('large exact atomic strings survive while numeric display is never a ceiling', () => {
  const value = structuredClone(fixtures[0].fresh);
  value.amountAtomic = '18446744073709551615';
  value.paymentOptions.forEach(option => { option.amountAtomic = value.amountAtomic; });
  const model = buildHostedCheckModelResult({ checkResult: value, url });
  assert.equal(model.paymentOptions[0].amountAtomic, value.amountAtomic);
  assert.equal(model.paymentOptions[0].priceFormatted, '18446744073709.551615 USDC');
  assert.deepEqual(model.executionGuidance.fetchArguments, ['intentId', 'maxAmountAtomic']);
  assert.equal(model.executionGuidance.requiredCeilingField, 'maxAmountAtomic');
});

test('separate expiry terms preserve their row index and bound selection in the widget', () => {
  const value = structuredClone(fixtures[0].fresh);
  const earlier = { ...value.paymentOptions[0], expiresAt: new Date(value.expiresAtUnixMs - 1000).toISOString() };
  value.paymentOptions = [value.paymentOptions[0], earlier];
  value.quote = { ...value.quote, state: 'selected', selectedOfferIndex: 1 };
  const model = buildHostedCheckModelResult({ checkResult: value, url });
  const routes = ui.normalizeX402PaymentRoutes(model.paymentOptions);
  assert.equal(routes.length, 2);
  assert.equal(routes[model.quote.selectedOfferIndex].expiresAt, earlier.expiresAt);
  assert.match(model.executionGuidance.message, /Payment network: Solana/);
});

test('actual installed SDK and registered handlers preserve API quote and final route evidence', async t => {
  const oldFetch = globalThis.fetch;
  const oldSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'synthetic-quote-protocol-secret-at-least-32-bytes';
  const calls = [];
  let active = fixtures[0];
  globalThis.fetch = async (input, init) => {
    const target = new URL(String(input));
    calls.push(target.pathname);
    if (target.pathname.startsWith('/api/passkey-anon/mcp-binding/')) return Response.json({ ok: true, user_handle: 'quoted-offer-fixture' });
    if (target.pathname === '/api/x402/resource') return Response.json({ ok: true, found: false });
    assert.ok(target.pathname.startsWith('/v2/pay/anon/x402/'), `Forbidden network request: ${target.pathname}`);
    const body = JSON.parse(init.body);
    if (target.pathname.endsWith('/check/status')) return Response.json({ ...active.recovered, checkRequestId: body.requestId });
    if (target.pathname.endsWith('/check')) return Response.json(active.fresh);
    if (target.pathname.endsWith('/status')) return Response.json(active.status);
    throw new Error(`Unexpected mocked route: ${target.pathname}`);
  };
  const server = createOpenMcpServer({ includeResources: false });
  const client = new Client({ name: 'quoted-offers-api-composition', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  b.sessionId = 'quoted-offer-protocol-session';
  t.after(async () => {
    await client.close(); await server.close(); globalThis.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = oldSecret;
  });
  await Promise.all([client.connect(a), server.connect(b)]);
  for (const fixture of fixtures) {
    active = fixture;
    const fresh = await client.callTool({ name: 'x402_check', arguments: { url } });
    assert.equal(fresh.isError, false, JSON.stringify(fresh));
    assert.deepEqual(fresh.structuredContent.quote, fixture.fresh.quote);
    assert.equal(fresh.structuredContent.paymentOptions.length, fixture.fresh.paymentOptions.length);
    const recovered = await client.callTool({ name: 'x402_status', arguments: { checkRequestId: fresh.structuredContent.checkRequestId } });
    assert.deepEqual(recovered.structuredContent.paymentOptions, fresh.structuredContent.paymentOptions);
    if (fixture.name === 'unknown-dual') {
      const final = await client.callTool({ name: 'x402_status', arguments: { intentId: fixture.status.intentId } });
      assert.equal(final.structuredContent.payment.network, 'eip155:8453');
      assert.equal(final.structuredContent.payment.sourceNetwork, 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      assert.equal(final.structuredContent.quote, undefined);
    }
  }
  assert.equal(calls.filter(path => path.endsWith('/fetch')).length, 0);
});
