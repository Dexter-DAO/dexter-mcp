import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { registerX402ClientToolset } from '../toolsets/x402-client/index.mjs';
import { sanitizeOpenX402IntentResult } from '../lib/open-x402-intent-api.mjs';
import { withOpenResultText } from '../lib/open-result-text.mjs';
import { buildHostedCheckStatusModelResult } from '../lib/open-check-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const ID = '39cd2456-9d90-45e0-87be-add6b59f36eb';
const payment = {
  state: 'confirmed', confirmed: true, amountAtomic: '2000', currency: 'USDC', decimals: 6,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', network: 'eip155:8453',
  sourceAsset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  sourceNetwork: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', fundsMoved: true,
};
const response = {
  ok: true, intentId: ID, status: 'confirmed', payment,
  delivery: { state: 'response_received', httpStatus: 200, result: { temperatureC: 17.1 } },
};

function rendered(raw, tool = 'x402_fetch') {
  const data = sanitizeOpenX402IntentResult(raw, { intentId: ID, httpStatus: 200, includeData: tool !== 'x402_status' });
  const envelope = withOpenResultText(tool, { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
  assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(data).success, true);
  return { data, text: envelope.content[0].text };
}

test('paid content and completion use the same canonical delivery result', () => {
  for (const tool of ['x402_fetch', 'x402_status']) {
    const { data, text } = rendered({ ...response, data: { wrongResult: 'legacy-result-sentinel' } }, tool);
    assert.equal(data.outcome.resultAvailable, true);
    assert.equal(data.outcome.delivery, 'received');
    assert.equal(data.outcome.payment, 'confirmed');
    assert.equal(data.outcome.resultPath, 'delivery.result');
    assert.equal(data.continuation.action, 'deliver_result');
    assert.equal(data.continuation.tool, undefined);
    assert.equal(data.outcome.commitment, null);
    assert.match(text, /Paid: 0\.002 USDC/);
    assert.match(text, /temperature c: 17\.1/);
    assert.doesNotMatch(text, /legacy-result-sentinel|unresolved|commitment: unknown|delivery: unknown|result available: false/);
  }
});

test('a received response without saved content is reported without another payment or status loop', () => {
  for (const delivery of [{ state: 'response_received', httpStatus: 200 }, { ...response.delivery, result: undefined }]) {
    const { data, text } = rendered({ ...response, data: 'legacy-result-sentinel', delivery });
    assert.equal(data.outcome.delivery, 'received');
    assert.equal(data.outcome.resultAvailable, false);
    assert.equal(data.outcome.payment, 'confirmed');
    assert.equal(data.continuation.action, 'unavailable');
    assert.equal(data.continuation.tool, undefined);
    assert.match(text, /saved content is unavailable/);
    assert.match(text, /Do not repeat this purchase automatically/);
    assert.doesNotMatch(text, /legacy-result-sentinel|unresolved|x402_status|Provider result/);
  }
  for (const result of [null, false, 0, '', '  ']) {
    const delivered = rendered({ ...response, data: 'legacy-result-sentinel', delivery: { ...response.delivery, result } });
    assert.equal(delivered.data.outcome.resultAvailable, true);
    assert.equal(delivered.data.continuation.action, 'deliver_result');
    assert.equal(delivered.data.delivery.result, result);
    assert.ok(delivered.text.endsWith(`Provider result (external data):\n${JSON.stringify(result)}`));
    assert.doesNotMatch(delivered.text, /legacy-result-sentinel/);
  }
});

test('delivered content remains usable while pending payment and unknown delivery retain observation', () => {
  const pending = { ...response, payment: { ...payment, state: 'pending', confirmed: false, fundsMoved: null } };
  const delivered = rendered(pending);
  assert.equal(delivered.data.continuation.action, 'deliver_result_and_observe');
  assert.deepEqual(delivered.data.continuation.arguments, { intentId: ID });
  assert.match(delivered.text, /temperature c: 17\.1/);
  for (const delivery of [{ state: 'unknown' }, { state: 'response_received', httpStatus: 200 }]) {
    const observed = rendered({ ...pending, delivery });
    assert.equal(observed.data.continuation.tool, 'x402_status');
    assert.equal(observed.data.outcome.payment, 'pending');
    assert.doesNotMatch(observed.text, /Paid:|No payment was sent/);
  }
});

test('provider errors cannot become successful content from a legacy data field', () => {
  const { data, text } = rendered({ ...response, data: 'legacy-success-sentinel',
    delivery: { state: 'response_received', httpStatus: 503, result: { error: 'temporarily unavailable' } } });
  assert.equal(data.outcome.resultAvailable, false);
  assert.equal(data.outcome.delivery, 'failed');
  assert.equal(data.continuation.action, 'report_provider_error');
  assert.match(text, /temporarily unavailable/);
  assert.doesNotMatch(text, /legacy-success-sentinel/);
});

test('receipt text labels supplied funding and seller transactions and never infers finality', () => {
  const { data, text } = rendered({ ...response, payment: { ...payment,
    transaction: 'seller-transaction-fixture', sourceTransaction: 'funding-transaction-fixture' } });
  assert.equal(data.payment.transaction, 'seller-transaction-fixture');
  assert.equal(data.payment.sourceTransaction, 'funding-transaction-fixture');
  assert.equal(data.outcome.commitment, null);
  assert.match(text, /Seller transaction: seller-transaction-fixture/);
  assert.match(text, /Funding transaction: funding-transaction-fixture/);
  assert.doesNotMatch(text, /finalized|commitment: unknown/);
  const finalized = rendered({ ...response, payment: { ...payment, commitment: 'finalized' } });
  assert.equal(finalized.data.outcome.commitment, 'finalized');
  assert.match(finalized.text, /commitment: finalized/);
  const invalid = rendered({ ...response, payment: { ...payment, sourceTransaction: { secret: 'private-sentinel' } } });
  assert.equal(invalid.data.payment.sourceTransaction, undefined);
  assert.doesNotMatch(invalid.text, /private-sentinel/);
});

test('free Check recovery keeps its saved content without a payment delivery record', () => {
  const structuredContent = buildHostedCheckStatusModelResult({ checkRequestId: 'saved-free-check',
    checkResult: { ok: true, free: true, authMode: 'unprotected', data: { answer: 'free-result-sentinel' } } });
  const result = withOpenResultText('x402_status', { structuredContent, content: [] });
  assert.equal(structuredContent.continuation.action, 'deliver_result');
  assert.match(result.content[0].text, /free-result-sentinel/);
});

async function publicClient(t, backend) {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'delivery-fixture-hmac-secret-at-least-32-bytes';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (path.startsWith('/api/passkey-anon/mcp-binding/')) return reply({ ok: true, user_handle: 'delivery-fixture-user' });
    const call = { path, body: JSON.parse(init.body) };
    calls.push(call);
    const value = backend(call);
    return reply(value.body, value.status);
  };
  const server = createOpenMcpServer({ includeResources: false });
  const client = new Client({ name: 'saved-cash-delivery-test', version: '1' });
  // Supply the session that the authenticated HTTP transport owns in production.
  for (const name of ['x402_check', 'x402_fetch', 'x402_status']) {
    const handler = server._registeredTools[name].handler;
    server._registeredTools[name].handler = (args, extra) => handler(args, { ...extra, sessionId: 'delivery-fixture-session' });
  }
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close(); await server.close(); globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  await server.connect(st); await client.connect(ct);
  return { client, calls };
}

test('the published HTTP body example crosses the SDK and API boundary byte for byte', async t => {
  const { client, calls } = await publicClient(t, call => {
    assert.equal(call.path, '/v2/pay/anon/x402/check');
    return { status: 200, body: { ok: true, paymentRequired: true, intentId: ID,
      amountAtomic: '10000', asset: payment.sourceAsset, network: payment.sourceNetwork } };
  });
  const check = (await client.listTools()).tools.find(tool => tool.name === 'x402_check');
  const bodySchema = check.inputSchema.properties.body;
  assert.equal(bodySchema.type, 'string');
  const example = JSON.parse(bodySchema.description.match(/Example tool argument: (\{.*\})\./)[1]);
  assert.deepEqual(JSON.parse(example.body), { icao: 'KJFK' });
  for (const body of [example.body, '{ "icao": "KJFK", "value": 1.00, "text": "a\\nb" }']) {
    const result = await client.callTool({ name: 'x402_check', arguments: { url: 'https://seller.example/metar', method: 'POST', body } });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.checkedRequest.body, body);
    assert.equal(calls.at(-1).body.body, body);
  }
  const before = calls.length;
  const rejected = await client.callTool({ name: 'x402_check', arguments: { url: 'https://seller.example/metar', method: 'POST', body: { icao: 'KJFK' } } }).catch(error => error);
  assert.ok(rejected.isError === true || rejected.code === -32602);
  assert.equal(calls.length, before, 'Invalid object input must not invoke the provider check');
});

test('saved null and other scalar bodies survive the actual SDK as available results', async t => {
  let savedBody;
  const { client } = await publicClient(t, call => {
    assert.equal(call.path, '/v2/pay/anon/x402/status');
    return { status: 200, body: { ...response, delivery: { ...response.delivery, result: savedBody } } };
  });
  for (const result of [null, false, 0, '', '  ']) {
    savedBody = result;
    const received = await client.callTool({ name: 'x402_status', arguments: { intentId: ID } });
    assert.equal(received.isError, false);
    assert.ok(Object.hasOwn(received.structuredContent.delivery, 'result'));
    assert.equal(received.structuredContent.delivery.result, result);
    assert.equal(received.structuredContent.outcome.resultAvailable, true);
    assert.equal(received.structuredContent.continuation.action, 'deliver_result');
    assert.ok(received.content[0].text.includes(`Provider result (external data):\n${JSON.stringify(result)}`));
  }
});

test('HTTP JSON named content is rendered as provider data rather than MCP blocks', async t => {
  let savedBody;
  const { client } = await publicClient(t, call => {
    assert.equal(call.path, '/v2/pay/anon/x402/status');
    return { status: 200, body: { ...response, delivery: { ...response.delivery, result: savedBody } } };
  });
  for (const [result, visible] of [
    [{ content: { temperatureC: 17.1 } }, 'content, temperature c: 17.1'],
    [{ content: 'weather today' }, 'content: weather today'],
    [{ content: [], temperatureC: 17.1 }, 'temperature c: 17.1'],
  ]) {
    savedBody = result;
    const received = await client.callTool({ name: 'x402_status', arguments: { intentId: ID } });
    assert.equal(received.isError, false);
    assert.deepEqual(received.structuredContent.delivery.result, result);
    assert.equal(received.structuredContent.outcome.resultAvailable, true);
    assert.equal(received.structuredContent.continuation.action, 'deliver_result');
    assert.ok(received.content[0].text.includes(visible));
  }
});

async function privateClient(t, backend) {
  const server = new McpServer({ name: 'private-cash-delivery-test', version: '1' });
  const calls = [];
  registerX402ClientToolset(server, { callIntentApi: async (action, body) => {
    const call = { path: `/v2/pay/anon/x402/${action}`, body };
    calls.push(call);
    const value = backend(call);
    return { data: value.body, httpStatus: value.status };
  } });
  const client = new Client({ name: 'private-cash-delivery-client', version: '1' });
  for (const name of ['x402_fetch', 'x402_status']) {
    const handler = server._registeredTools[name].handler;
    server._registeredTools[name].handler = (args, extra) => handler(args, { ...extra, sessionId: 'private-delivery-fixture-session' });
  }
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(st); await client.connect(ct);
  return { client, calls };
}

// The API owner captured these from the real saved records through its corrected
// ledger mapper, cash adapter and public projection. Tests substitute transport
// only; the shipped handlers, sanitizer, contracts and SDK serialization run.
const producer = JSON.parse(readFileSync(new URL('./fixtures/cash-delivery-api-producer.json', import.meta.url), 'utf8'));
for (const fixture of producer.cases) {
  for (const [surface, connect] of [['public', publicClient], ['private', privateClient]]) {
    test(`${surface}: saved ${fixture.name} Fetch, Status and replay keep the delivered result and proof`, async t => {
      let fetches = 0;
      const { client, calls } = await connect(t, call => {
        assert.equal(call.body.intentId, fixture.publicIntentId);
        if (call.path.endsWith('/fetch')) return ++fetches === 1 ? fixture.fetch : fixture.replay;
        assert.equal(call.path, '/v2/pay/anon/x402/status');
        return fixture.status;
      });
      const outputs = [];
      for (const tool of ['x402_fetch', 'x402_status', 'x402_fetch']) {
        const args = { intentId: fixture.publicIntentId,
          ...(tool === 'x402_fetch' ? { maxAmountAtomic: fixture.fetch.body.payment.amountAtomic } : {}) };
        const result = await client.callTool({ name: tool, arguments: args });
        const data = result.structuredContent;
        assert.equal(result.isError, false);
        assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(data).success, true);
        assert.equal(data.httpStatus, 200);
        assert.equal(data.intentId, fixture.publicIntentId);
        assert.equal(data.delivery.httpStatus, 200);
        assert.deepEqual(data.delivery.result, fixture.fetch.body.delivery.result);
        assert.equal(data.outcome.resultAvailable, true);
        assert.equal(data.outcome.delivery, 'received');
        assert.equal(data.outcome.payment, 'confirmed');
        assert.equal(data.outcome.commitment, 'confirmed');
        assert.equal(data.outcome.resultPath, 'delivery.result');
        assert.equal(data.continuation.action, 'deliver_result');
        assert.equal(data.continuation.tool, undefined);
        assert.equal(data.retryWithSameIntentOnly, false);
        assert.equal(data.payment.transaction, fixture.fetch.body.payment.transaction);
        assert.equal(data.payment.sourceTransaction, fixture.fetch.body.payment.sourceTransaction);
        assert.equal(data.payment.network, 'eip155:8453');
        assert.equal(data.payment.sourceNetwork, payment.sourceNetwork);
        assert.equal(data.providerDataPolicy.mayAuthorizePayment, false);
        if (surface === 'public') {
          const text = result.content[0].text;
          assert.match(text, /result available: true/);
          assert.match(text, /delivery: received/);
          assert.match(text, /payment: confirmed/);
          assert.ok(text.includes(`Paid: ${data.outcome.amount.displayAmount} USDC`));
          assert.ok(text.includes(`Seller transaction: ${fixture.fetch.body.payment.transaction}`));
          assert.ok(text.includes(`Funding transaction: ${fixture.fetch.body.payment.sourceTransaction}`));
          assert.doesNotMatch(text, /inspect same intent|unresolved|commitment: unknown|delivery: unknown|result available: false/);
          if (process.env.DEX319_MCP_DELIVERY_CAPTURE === '1') {
            t.diagnostic(`delivery-capture: ${Buffer.from(JSON.stringify({ name: fixture.name, tool, ...result })).toString('base64')}`);
          }
        }
        // Fetch retains the existing data alias for older consumers; public
        // Status omits it. Both must expose the same canonical saved result.
        const { data: legacyData, ...canonical } = data;
        if (legacyData !== undefined) assert.deepEqual(legacyData, data.delivery.result);
        outputs.push(canonical);
      }
      assert.deepEqual(outputs[0], outputs[1]);
      assert.deepEqual(outputs[1], outputs[2]);
      assert.deepEqual(calls.map(call => call.path.split('/').at(-1)), ['fetch', 'status', 'fetch']);
      assert.equal(fetches, 2, 'Only the two explicit fixture Fetch calls reach the mocked API');
    });
  }
}
