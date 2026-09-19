import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import {
  buildGovernedAssetToolResult, buildGovernedAssetFailure, governedDetailedBody,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import {
  installOpenToolContracts, finalizeOpenToolContracts, OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import { GOVERNED_ASSET_TOOL_NAMES, GOVERNED_ASSET_INPUT_SCHEMAS } from '../lib/governed-asset-contract.mjs';
import { presentGovernedAgentResult } from '../lib/governed-agent-presentation.mjs';
import { receiptFixture, OPERATION_ID, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const delegated = (action, phase) => fixture(`governed-jupiter-service-fee-delegated/delegated-stock-fee-${action}-${phase}.json`);
const observations = fixture('governed-preview-amount-observation-api.json');
const maintenance = fixture('governed-program-transition-hold-api.json');
const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function governedAssetAction(');
const end = source.indexOf('// ─── MCP Server Setup', start);
assert.ok(start >= 0 && end > start);

// Reuse the current maintenance regression's actual-handler/SDK boundary.
// The only replaced transport is backend fetch; all bodies are offline fixtures.
async function hosted(t) {
  let current;
  let calls = 0;
  const handler = runInNewContext(`${source.slice(start, end)}; governedAssetAction`, {
    GOVERNED_ASSET_TOOL_NAMES, GOVERNED_ASSET_META: {},
    API_BASE_FALLBACK: 'https://api.example.invalid',
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'fixture-only-unused-secret-with-enough-characters',
    extractMcpSessionId: extra => extra.sessionId,
    buildVaultAuthenticationRequired: value => value,
    vaultAuthenticationResult: () => ({ isError: true, content: [{ type: 'text', text: 'fixture-auth-required' }] }),
    buildGovernedAssetToolResult, buildGovernedAssetFailure,
    safeErrorLabel: () => 'fixture', console: { warn() {} },
    callGovernedAssetBackend: args => callGovernedAssetBackend({ ...args,
      fetchImpl: async () => {
        calls += 1;
        assert.equal(args.mcpSessionId, 'original-bound-session');
        assert.equal(args.operation, current.operation);
        assert.equal(JSON.stringify(args.input), JSON.stringify(current.input));
        return new Response(JSON.stringify(current.body), { status: current.httpStatus });
      },
    }),
  });
  const server = new McpServer({ name: 'owner-current-composition', version: '1' });
  installOpenToolContracts(server);
  const publicOperations = Object.entries(GOVERNED_ASSET_TOOL_NAMES).filter(([, name]) => OPEN_TOOL_NAMES.includes(name));
  for (const [operation, name] of publicOperations) {
    server.registerTool(name, { inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation] },
      args => handler(operation, args, { sessionId: 'original-bound-session' }));
  }
  for (const name of OPEN_TOOL_NAMES.filter(name => !Object.values(GOVERNED_ASSET_TOOL_NAMES).includes(name))) {
    server.registerTool(name, { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: '{}' }] }));
  }
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'owner-current-composition-client', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = (await client.listTools()).tools;
  assert.equal(listed.length, 15);
  assert.ok(listed.some(tool => tool.name === 'dexter_report_work'));
  const validators = new Map();
  for (const [, name] of publicOperations) {
    const schema = listed.find(tool => tool.name === name).outputSchema;
    assert.equal(schema.type, 'object');
    assert.equal(schema.anyOf.length, 2);
    validators.set(name, new AjvJsonSchemaValidator().getValidator(schema));
  }
  return async (operation, input, body, httpStatus = operation === 'reconcile' && body.outcome === 'pending' ? 202 : 200) => {
    current = { operation, input, body, httpStatus };
    const original = structuredClone(body);
    const before = calls;
    const name = GOVERNED_ASSET_TOOL_NAMES[operation];
    const result = await client.callTool({ name, arguments: input });
    assert.equal(calls, before + 1, JSON.stringify(result));
    assert.deepEqual(body, original);
    const validation = validators.get(name)(result.structuredContent);
    assert.equal(validation.valid, true, validation.errorMessage);
    assert.deepEqual(result.structuredContent.presentation, JSON.parse(result.content[0].text));
    return result;
  };
}

function detail(result, body) {
  assert.deepEqual(governedDetailedBody(result.structuredContent), body);
  assert.deepEqual(result.structuredContent.presentation, JSON.parse(JSON.stringify(presentGovernedAgentResult(body))));
}

function ordinaryError(result, operation, input, body, httpStatus = 200) {
  assert.equal(result.isError, true);
  assert.deepEqual(Object.keys(result.structuredContent), ['presentation']);
  const normalized = normalizeGovernedAssetResult({ operation, input, body, httpStatus });
  assert.deepEqual(result._meta['dexter/governedWidgetResult'], normalized.body);
  assert.deepEqual(result.structuredContent.presentation,
    JSON.parse(JSON.stringify(presentGovernedAgentResult(normalized.body))));
}

test('current hosted SDK preserves complete producer fee previews and their declared quoted presentation', async t => {
  const call = await hosted(t);
  for (const action of ['buy', 'sell']) {
    const proof = delegated(action, 'proof');
    for (const phase of ['prepared', 'recovered']) {
      const body = delegated(action, phase);
      const input = { operationId: body.requestId, ...proof.request };
      const result = await call('prepare', input, body);
      assert.equal(result.isError, false);
      detail(result, body);
      assert.deepEqual(result.structuredContent.presentation.preview.quotedFees, body.preview.feeSummary);
      assert.equal(result.structuredContent.presentation.preview.basis, 'estimated_quote');
      assert.equal(result.structuredContent.presentation.actual, undefined);
      assert.equal(result.structuredContent.intentId, proof.prepared.intentId);
      assert.equal(result.structuredContent.replayed, phase === 'recovered');
    }
  }
});

test('current hosted SDK preserves actual raw and Dollar observation projections and legacy recovery', async t => {
  const call = await hosted(t);
  for (const c of observations.cases) {
    const { requestId, ...terms } = c.input;
    const input = { operationId: requestId, ...terms };
    for (const body of [c.firstProjectedResponse, c.replayProjectedResponse, c.legacyControl.projectedResponse]) {
      const result = await call('prepare', input, body);
      assert.equal(result.isError, false);
      detail(result, body);
      assert.deepEqual(result.structuredContent.preview.productIdentity, body.preview.productIdentity);
      assert.equal(result.structuredContent.requestId, requestId);
      if (c.requestAmountKind === 'usd-value') {
        assert.equal(result.structuredContent.presentation.preview.requestedValue.amount, '25');
        assert.deepEqual(result.structuredContent.preview.usdValue, c.firstProjectedResponse.preview.usdValue);
      }
    }
  }
});

test('current hosted SDK refuses observation and fee substitutions using the ordinary-error union', async t => {
  const call = await hosted(t);
  const c = observations.cases.find(c => c.requestAmountKind === 'usd-value');
  const { requestId, ...terms } = c.input;
  const input = { operationId: requestId, ...terms };
  for (const mutate of [
    body => { body.preview.productIdentity.displayMultiplier = '2'; },
    body => { body.preview.productIdentity.amountObservedAtSlot = '124'; },
    body => { body.preview.productIdentity.assetId = 'different-stock'; },
    body => { body.presentation = { summary: 'injected' }; },
  ]) {
    const body = structuredClone(c.replayProjectedResponse);
    mutate(body);
    const result = await call('prepare', input, body);
    ordinaryError(result, 'prepare', input, body);
    assert.equal(result.structuredContent.presentation.code, 'governed_backend_response_invalid');
  }
  const proof = delegated('sell', 'proof');
  const feeInput = { operationId: proof.prepared.requestId, ...proof.request };
  for (const mutate of [
    body => { body.preview.feeSummary.platformFee.amountAtomic = '1'; },
    body => { body.preview.feeSummary.serviceFee.ownerSwapFee = true; },
    body => { body.preview.feeSummary.serviceFee.rateBps = 76; },
  ]) {
    const body = structuredClone(proof.recovered);
    mutate(body);
    ordinaryError(await call('prepare', feeInput, body), 'prepare', feeInput, body);
  }
});

test('fee-bearing saved outcomes retain confirmed success, actual fills and landed failure across current SDK tools', async t => {
  const call = await hosted(t);
  for (const failed of [false, true]) {
    const f = receiptFixture();
    const originalReceipt = structuredClone(f.status.receiptOutcome);
    f.status.tradeSummary.feeSummary = structuredClone(delegated('sell', 'prepared').preview.feeSummary);
    f.execute.tradeSummary = structuredClone(f.status.tradeSummary);
    if (failed) {
      delete f.status.receiptOutcome;
      delete f.execute.receiptOutcome;
      Object.assign(f.status, { executionSucceeded: false, reconciliationKind: 'landed_program_error' });
      Object.assign(f.execute, { executed: false, code: 'landed_program_error', explanation: 'The transaction landed, but the action failed.' });
      Object.assign(f.execute.business, { executionSucceeded: false, programError: true });
    }
    f.history.items = [structuredClone(f.status)];
    f.reconcile.statusAfter = structuredClone(f.status);
    refreshReconcileDigest(f.reconcile);
    for (const operation of ['execute', 'status', 'history', 'reconcile']) {
      const input = operation === 'execute' ? { operationId: OPERATION_ID, intentId: f.status.intentId }
        : operation === 'history' ? { limit: 25 } : { intentId: f.status.intentId };
      const body = f[operation];
      const result = await call(operation, input, body);
      assert.equal(result.isError, failed && operation === 'execute');
      detail(result, body);
      const shown = operation === 'history' ? result.structuredContent.presentation.items[0] : result.structuredContent.presentation;
      assert.equal(shown.intentId, f.status.intentId);
      if (failed) {
        assert.match(shown.summary, /action failed/);
        assert.equal(shown.actual, undefined);
        assert.deepEqual(shown.nextActions.map(next => next.tool), ['dexter_asset_action_status']);
      } else {
        assert.match(shown.summary, /Sale confirmed/);
        assert.equal(shown.actual.credit.amount, originalReceipt.credit.displayAmount);
        assert.equal(shown.actual.fees, 'Verified fee amounts are unavailable.');
        assert.deepEqual(f.status.receiptOutcome, originalReceipt);
      }
    }
  }
});

test('current maintenance and unrelated503 recovery remain intact alongside fee-bearing saved reads', async t => {
  const call = await hosted(t);
  const saved = receiptFixture().status;
  saved.tradeSummary.feeSummary = structuredClone(delegated('sell', 'prepared').preview.feeSummary);
  const original = structuredClone(saved);
  for (const operation of ['prepare', 'execute', 'reconcile']) {
    const input = operation === 'prepare' ? { operationId: OPERATION_ID, action: 'sell', companyQuery: 'NVIDIA', valueUsd: '25' }
      : operation === 'execute' ? { operationId: OPERATION_ID, intentId: saved.intentId } : { intentId: saved.intentId };
    const held = await call(operation, input, maintenance.body, 503);
    ordinaryError(held, operation, input, maintenance.body, 503);
    const shown = held.structuredContent.presentation;
    assert.equal(shown.status, 'paused');
    assert.equal(shown.executionOutcome, 'not_reported');
    assert.equal(shown.operationId, input.operationId ?? null);
    assert.equal(shown.intentId, input.intentId ?? null);
    assert.equal(shown.retryWithSameRequestOnly, true);
    assert.equal(shown.actual, undefined);
    assert.equal(shown.nextActions[0].tool, operation === 'prepare' ? undefined : 'dexter_asset_action_status');
    if (operation === 'prepare') {
      assert.equal(shown.nextActions[0].action, 'resume_original_prepare_after_maintenance');
      assert.equal(shown.nextActions[0].operationId, OPERATION_ID);
    } else {
      const body = { message: 'unavailable' };
      const unknown = await call(operation, input, body, 503);
      ordinaryError(unknown, operation, input, body, 503);
      assert.equal(unknown.structuredContent.presentation.status, 'unknown');
      assert.equal(unknown.structuredContent.presentation.nextActions[0].tool, 'dexter_asset_action_status');
      assert.deepEqual(unknown.structuredContent.presentation.nextActions[0].arguments, { intentId: saved.intentId });
    }
    const result = await call('status', { intentId: saved.intentId }, saved);
    assert.equal(result.isError, false);
    detail(result, original);
  }
});
