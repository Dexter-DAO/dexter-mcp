import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { sanitizeOpenX402IntentResult } from '../lib/open-x402-intent-api.mjs';
import { withOpenResultText } from '../lib/open-result-text.mjs';
import { OPEN_TOOL_CONTRACTS, installOpenToolContracts } from '../lib/open-tool-contracts.mjs';
import { registerOpenTool } from '../lib/open-tool-auth.mjs';

const INTENT = '1ea74367-6719-4e5c-8a74-0e90613417e2';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// The refused weather request used 2000 atomic USDC, with a Base seller and
// Solana funding. These are the paired API's corrected public response fields.
const refused = {
  ok: false, intentId: INTENT, status: 'refused', error: 'payment_refused',
  reason: 'charge_preflight_failed',
  message: 'Payment validation failed before submission. No payment was sent.',
  detail: 'Dexter could not submit the wallet payment.',
  nextAction: 'contact_support', retryable: false, replacementAllowed: false,
  retryWithSameIntentOnly: false,
  delivery: { state: 'not_dispatched', httpStatus: null },
  payment: {
    state: 'not_sent', confirmed: false, fundsMoved: false,
    amountAtomic: '2000', asset: BASE_USDC, network: 'eip155:8453',
    currency: 'USDC', decimals: 6,
    sourceAsset: SOLANA_USDC, sourceNetwork: 'solana:mainnet',
  },
  reconciliation: { required: false, performed: false },
  reservationState: 'unreserved',
};

function project(raw, httpStatus = 409) {
  const structuredContent = sanitizeOpenX402IntentResult(raw, { intentId: INTENT, httpStatus });
  return { structuredContent, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], isError: httpStatus >= 400 };
}

async function connected(t, response) {
  const server = new McpServer({ name: 'cash-failure-test', version: '1.0.0' });
  installOpenToolContracts(server);
  for (const tool of ['x402_fetch', 'x402_status']) {
    registerOpenTool(server, tool, { inputSchema: {} }, async () => response);
  }
  const client = new Client({ name: 'cash-failure-client', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(st);
  await client.connect(ct);
  return client;
}

test('Fetch and Status expose the same readable refusal through the actual MCP SDK', async t => {
  const client = await connected(t, project(refused));
  const results = [];
  for (const tool of ['x402_fetch', 'x402_status']) {
    const result = await client.callTool({ name: tool, arguments: {} });
    const data = result.structuredContent;
    const text = result.content[0].text;
    assert.equal(result.isError, true);
    assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(data).success, true);
    assert.equal(data.outcome.payment, 'not_started');
    assert.equal(data.outcome.delivery, 'not_started');
    assert.equal(data.payment.fundsMoved, false);
    assert.equal(data.outcome.amount.displayAmount, '0.002');
    assert.equal(data.payment.currency, 'USDC');
    assert.equal(data.payment.sourceAsset, SOLANA_USDC);
    assert.equal(data.nextAction, 'contact_support');
    assert.equal(data.continuation.action, 'report_failure');
    assert.equal(Object.hasOwn(data.continuation, 'tool'), false);
    assert.equal(data.replacementAllowed, false);
    assert.ok(text.startsWith(refused.message));
    assert.match(text, /reason: charge_preflight_failed/);
    assert.match(text, /Requested amount: 0\.002 USDC/);
    assert.match(text, /Funding network: Solana/);
    assert.match(text, /Seller network: Base/);
    assert.match(text, /Contact Dexter support with this intent ID/);
    assert.doesNotMatch(text, /unknown asset|payment: pending|state: pending|unresolved|x402_status|Charge:|Paid:/i);
    results.push(data);
  }
  assert.deepEqual(results[0], results[1]);
});

for (const [state, fundsMoved, expected] of [
  ['refunded', true, 'refunded'],
  ['failed_final', null, 'failed'],
  ['unknown', null, 'unknown'],
]) {
  test(`terminal ${state} preserves its money evidence without inventing an unpaid outcome`, () => {
    const raw = { ...refused, reason: 'recorded_payment_failure',
      message: 'The purchase stopped. Review its recorded payment outcome.',
      payment: { ...refused.payment, state, fundsMoved } };
    const result = project(raw);
    const data = result.structuredContent;
    const text = withOpenResultText('x402_status', result).content[0].text;
    assert.equal(data.outcome.payment, expected);
    assert.equal(data.payment.fundsMoved, fundsMoved);
    assert.equal(data.continuation.action, 'report_failure');
    assert.equal(Object.hasOwn(data.continuation, 'tool'), false);
    assert.doesNotMatch(text, /No payment was sent|No money moved|Paid:|Charge:|x402_status/);
    assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(data).success, true);
  });
}

test('uncertain source and seller outcomes retain observation and never become unpaid', () => {
  for (const delivery of [{ state: 'not_dispatched' }, { state: 'unknown' }, { state: 'response_unavailable' }]) {
    for (const state of ['pending', 'unknown']) {
      const raw = { ...refused, status: 'ambiguous', error: 'payment_reconciliation_required',
        reason: undefined, message: undefined, detail: undefined, nextAction: undefined,
        delivery, payment: { ...refused.payment, state, fundsMoved: null },
        reconciliation: { required: true, performed: false }, retryWithSameIntentOnly: true };
      const result = project(raw, 202);
      const data = result.structuredContent;
      const text = withOpenResultText('x402_status', result).content[0].text;
      assert.equal(data.outcome.payment, state);
      assert.equal(data.continuation.action, 'inspect_same_intent');
      assert.deepEqual(data.continuation.arguments, { intentId: INTENT });
      assert.equal(data.continuation.tool, 'x402_status');
      assert.doesNotMatch(text, /No payment was sent|No money moved|Paid:|Charge:/);
    }
  }
});

test('a legacy refusal without definitive evidence remains uncertain', () => {
  const result = project({ ok: false, intentId: INTENT, status: 'refused', error: 'payment_refused',
    delivery: { state: 'not_dispatched' }, payment: { state: 'pending', confirmed: false, amountAtomic: '2000' } });
  assert.equal(result.structuredContent.continuation.tool, 'x402_status');
  assert.equal(result.structuredContent.outcome.payment, 'pending');
  assert.equal(Object.hasOwn(result.structuredContent.payment, 'fundsMoved'), false);
  assert.doesNotMatch(withOpenResultText('x402_fetch', result).content[0].text, /No payment was sent|No money moved|Paid:|Charge:/);
});

test('confirmed payment and useful delivered content retain the existing completion behavior', () => {
  const raw = { ok: true, intentId: INTENT, status: 'resolved',
    delivery: { state: 'response_received', httpStatus: 200, result: { weather: 'Cloudy' } },
    payment: { ...refused.payment, state: 'confirmed', confirmed: true, fundsMoved: true, commitment: 'finalized' } };
  const paid = project(raw, 200);
  assert.equal(paid.structuredContent.continuation.action, 'deliver_result');
  assert.match(withOpenResultText('x402_fetch', paid).content[0].text, /Paid: 0\.002 USDC/);
  const pending = project({ ...raw, payment: { ...raw.payment, state: 'pending', confirmed: false, commitment: undefined } }, 202);
  assert.equal(pending.structuredContent.outcome.resultAvailable, true);
  assert.equal(pending.structuredContent.continuation.action, 'deliver_result_and_observe');
  assert.match(withOpenResultText('x402_fetch', pending).content[0].text, /Cloudy/);
});

test('only the allowlisted support action and payment evidence cross the API boundary', () => {
  const result = project({ ...refused, nextAction: 'repeat_payment', privateDiagnostic: 'private-sentinel',
    payment: { ...refused.payment, rawTransaction: 'signed-bytes-sentinel', providerCredentials: 'secret-sentinel' } });
  assert.equal(Object.hasOwn(result.structuredContent, 'nextAction'), false);
  assert.doesNotMatch(JSON.stringify(result), /private-sentinel|signed-bytes-sentinel|secret-sentinel|repeat_payment/);
});
