import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, governedDetailedBody, GOVERNED_PRESENTED_OUTPUT_SCHEMAS, buildGovernedAssetFailure } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy, installOpenToolContracts, finalizeOpenToolContracts, OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { GOVERNED_ASSET_TOOL_NAMES, GOVERNED_ASSET_INPUT_SCHEMAS } from '../lib/governed-asset-contract.mjs';
import { receiptFixture, OPERATION_ID } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const API = JSON.parse(readFileSync(new URL('./fixtures/governed-program-transition-hold-api.json', import.meta.url)));
const INTENT_ID = receiptFixture().status.intentId;
const inputs = {
  prepare: { operationId: OPERATION_ID, action: 'sell', companyQuery: 'NVIDIA', valueUsd: '25' },
  execute: { operationId: OPERATION_ID, intentId: INTENT_ID },
  reconcile: { intentId: INTENT_ID },
};
function normalize(operation, body = API.body, httpStatus = API.httpStatus) {
  return normalizeGovernedAssetResult({ operation, input: inputs[operation], body, httpStatus });
}
function assertNoExecutionClaim(body) {
  for (const key of ['executed', 'signed', 'submitted', 'settlementFinalized', 'executionSucceeded',
    'business', 'statusAfter', 'transactionSignature', 'attemptId', 'actual']) {
    assert.equal(Object.hasOwn(body, key), false, key);
  }
}

test('exact producer maintenance responses preserve caller identity through the client and MCP envelope', async () => {
  for (const operation of ['prepare', 'execute', 'reconcile']) {
    let calls = 0;
    const normalized = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test', secret: 'test-only-secret-at-least-thirty-two-characters',
      operation, input: inputs[operation], mcpSessionId: 'test-maintenance-session',
      now: 1787270400000,
      fetchImpl: async () => { calls += 1; return new Response(JSON.stringify(API.body), {
        status: API.httpStatus, headers: { 'content-type': 'application/json' },
      }); },
    });
    assert.equal(calls, 1, operation);
    assert.equal(normalized.httpStatus, 503);
    assert.equal(normalized.isError, true);
    assert.deepEqual(normalized.body, { ...API.body, namespace: 'opendexter-governed-maintenance/v1',
      operation, operationId: inputs[operation].operationId ?? null, intentId: inputs[operation].intentId ?? null });
    assertNoExecutionClaim(normalized.body);
    const envelope = applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[operation], buildGovernedAssetToolResult(normalized));
    assert.equal(envelope.isError, true);
    assert.deepEqual(Object.keys(envelope.structuredContent), ['presentation']);
    assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS[operation].safeParse(envelope.structuredContent).success, true);
    assert.deepEqual(envelope.structuredContent.presentation, JSON.parse(envelope.content[0].text));
    const shown = JSON.parse(envelope.content[0].text);
    assert.equal(shown.status, 'paused');
    assert.match(shown.summary, /temporarily unavailable.*maintenance/);
    assert.equal(shown.executionOutcome, 'not_reported');
    assert.equal(shown.retryWithSameRequestOnly, true);
    assert.equal(shown.operationId, inputs[operation].operationId ?? null);
    assert.equal(shown.intentId, inputs[operation].intentId ?? null);
    assertNoExecutionClaim(shown);
    if (operation === 'prepare') {
      assert.equal(shown.nextActions[0].operationId, OPERATION_ID);
      assert.equal(shown.nextActions[0].action, 'resume_original_prepare_after_maintenance');
      assert.match(shown.nextActions[0].reason, /unchanged terms/);
    } else {
      assert.deepEqual(shown.nextActions[0].arguments, { intentId: INTENT_ID });
      assert.equal(shown.nextActions[0].tool, 'dexter_asset_action_status');
      assert.equal(shown.nextActions[0].condition, undefined);
      assert.match(shown.nextActions[0].reason, /Read the saved outcome/);
    }
    assert.deepEqual(envelope._meta['dexter/governedWidgetResult'], normalized.body);
  }
});

test('maintenance identity is accepted only with exact HTTP503 and the complete producer contract', () => {
  for (const operation of Object.keys(inputs)) {
    for (const status of [200, 202, 400, 409, 502, 504, 0]) {
      assert.equal(normalize(operation, API.body, status).body.code, 'governed_backend_response_invalid');
    }
    const wrongRefusal = { namespace: 'dexter-governed-agent-http-refusal/v1', status: 'refused',
      code: API.body.code, explanation: API.body.message, executed: false, signed: false,
      submitted: false, settlementFinalized: false };
    assert.equal(normalize(operation, wrongRefusal).body.code, 'governed_backend_response_invalid');
    for (const mutate of [
      b => { b.status = 'refused'; }, b => { b.code = 'unknown_service_failure'; },
      b => { b.message = 'Service unavailable'; }, b => { b.retryable = false; },
      b => { b.retryWithSameRequestOnly = false; }, b => { b.executed = false; },
      b => { b.intentId = INTENT_ID; }, b => { b.operationId = OPERATION_ID; },
      ...Object.keys(API.body).map(key => b => { delete b[key]; }),
    ]) {
      const body = structuredClone(API.body); mutate(body);
      const result = normalize(operation, body);
      assert.equal(result.body.code, 'governed_backend_response_invalid', JSON.stringify(body));
      assert.equal(result.body.namespace, 'opendexter-governed-backend-failure/v1');
    }
  }
});

test('an unrelated HTTP503 keeps the existing uncertain Execute and Reconcile recovery behavior', () => {
  for (const operation of ['execute', 'reconcile']) {
    const normalized = normalize(operation, { message: 'unavailable' });
    assert.equal(normalized.body.status, 'unknown');
    assert.equal(normalized.body.intentId, INTENT_ID);
    const shown = JSON.parse(buildGovernedAssetToolResult(normalized).content[0].text);
    assert.equal(shown.nextActions[0].tool, 'dexter_asset_action_status');
    assert.deepEqual(shown.nextActions[0].arguments, { intentId: INTENT_ID });
  }
});

test('a held continuation does not rewrite a prior confirmed result or imply a prior ambiguous attempt failed', () => {
  const fixture = receiptFixture();
  for (const operation of ['execute', 'reconcile']) {
    const previous = structuredClone(fixture.status);
    const held = buildGovernedAssetToolResult(normalize(operation));
    assertNoExecutionClaim(JSON.parse(held.content[0].text));
    assert.deepEqual(previous, fixture.status);
    const status = normalizeGovernedAssetResult({ operation: 'status', input: { intentId: INTENT_ID },
      httpStatus: 200, body: previous });
    assert.equal(status.isError, false);
    assert.deepEqual(governedDetailedBody(buildGovernedAssetToolResult(status).structuredContent), previous);
  }
  const ambiguous = structuredClone(fixture.status);
  delete ambiguous.receiptOutcome;
  Object.assign(ambiguous, { status: 'ambiguous', ledgerState: 'ambiguous', landingProof: false,
    executionSucceeded: null, confirmationSlot: null, confirmationCommitment: null,
    settlementFinalized: false, reconciliationKind: null, reconciliationEvidenceDigest: null,
    submitted: null, receiptPhases: ['dispatch_fenced', 'uncertain'] });
  const original = structuredClone(ambiguous);
  normalize('execute');
  const read = normalizeGovernedAssetResult({ operation: 'status', input: { intentId: INTENT_ID },
    httpStatus: 200, body: ambiguous });
  assert.equal(read.isError, false);
  assert.deepEqual(governedDetailedBody(buildGovernedAssetToolResult(read).structuredContent), original);
});

test('saved Status and History retain their existing contracts rather than accepting the write hold envelope', () => {
  const fixture = receiptFixture();
  for (const [operation, input, body] of [
    ['status', { intentId: INTENT_ID }, fixture.status], ['history', { limit: 25 }, fixture.history],
  ]) {
    const normalized = normalizeGovernedAssetResult({ operation, input, body, httpStatus: 200 });
    assert.equal(normalized.isError, false);
    assert.deepEqual(governedDetailedBody(buildGovernedAssetToolResult(normalized).structuredContent), body);
    const held = normalizeGovernedAssetResult({ operation, input, body: API.body, httpStatus: 503 });
    assert.equal(held.body.code, 'governed_backend_response_invalid');
  }
});


test('ordinary-error policy refuses malformed maintenance metadata and changed recovery', () => {
  for (const operation of Object.keys(inputs)) {
    const original = buildGovernedAssetToolResult(normalize(operation));
    for (const mutate of [
      b => { b.operation = 'status'; }, b => { b.intentId = 'invalid'; },
      b => { b.operationId = ''; }, b => { b.executed = false; },
      b => { b.retryWithSameRequestOnly = false; }, b => { b.retryable = false; },
      b => { b.message = 'Other maintenance'; }, b => { b.presentation = {}; },
      b => { delete b.intentId; }, b => { delete b.operationId; },
    ]) {
      const changed = structuredClone(original);
      mutate(changed._meta['dexter/governedWidgetResult']);
      assert.equal(applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[operation], changed).structuredContent, undefined);
    }
    for (const mutate of [
      p => { p.intentId = '00000000-0000-4000-8000-000000000000'; },
      p => { p.nextActions = []; }, p => { p.summary = 'Sale failed.'; },
    ]) {
      const changed = structuredClone(original); mutate(changed.structuredContent.presentation);
      assert.equal(applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[operation], changed).structuredContent, undefined);
    }
    for (const wrong of ['status', 'history', ...Object.keys(inputs).filter(o => o !== operation)]) {
      assert.equal(applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[wrong], structuredClone(original)).structuredContent, undefined);
    }
  }
});

test('held writes preserve saved confirmed failure without changing completed success or ambiguous recovery', () => {
  const status = receiptFixture().status;
  delete status.receiptOutcome;
  Object.assign(status, { executionSucceeded: false, reconciliationKind: 'landed_program_error' });
  const original = structuredClone(status);
  for (const operation of ['execute', 'reconcile']) {
    normalize(operation);
    for (const [readOperation, body, input] of [
      ['status', status, { intentId: INTENT_ID }],
      ['history', { namespace: 'dexter-governed-transaction-history/v1', items: [status], nextCursor: null }, { limit: 25 }],
    ]) {
      const read = normalizeGovernedAssetResult({ operation: readOperation, input, body, httpStatus: 200 });
      assert.equal(read.isError, false);
      const envelope = applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[readOperation], buildGovernedAssetToolResult(read));
      assert.deepEqual(governedDetailedBody(envelope.structuredContent), body);
      assert.equal(status.executionSucceeded, false);
      assert.deepEqual(status, original);
    }
  }
});

const hostedSource = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const handlerStart = hostedSource.indexOf('async function governedAssetAction(');
const handlerEnd = hostedSource.indexOf('// ─── MCP Server Setup', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);

for (const operation of Object.keys(inputs)) {
  test(`current hosted handler and actual SDK preserve the declared ${operation} maintenance envelope`, async t => {
    let calls = 0;
    const handler = runInNewContext(`${hostedSource.slice(handlerStart, handlerEnd)}; governedAssetAction`, {
      GOVERNED_ASSET_TOOL_NAMES, GOVERNED_ASSET_META: {},
      API_BASE_FALLBACK: 'https://api.example.invalid',
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'fixture-only-unused-secret-with-enough-characters',
      extractMcpSessionId: extra => extra.sessionId,
      buildVaultAuthenticationRequired: value => value,
      vaultAuthenticationResult: () => ({ isError: true, content: [{ type: 'text', text: 'Connect your wallet.' }] }),
      buildGovernedAssetToolResult, buildGovernedAssetFailure,
      safeErrorLabel: () => 'fixture', console: { warn() {} },
      callGovernedAssetBackend: args => callGovernedAssetBackend({ ...args,
        fetchImpl: async () => {
          calls += 1;
          assert.equal(args.mcpSessionId, 'original-bound-session');
          assert.equal(JSON.stringify(args.input), JSON.stringify(inputs[operation]));
          return new Response(JSON.stringify(API.body), { status: 503, headers: { 'content-type': 'application/json' } });
        },
      }),
    });
    const server = new McpServer({ name: 'maintenance-current-handler', version: '1' });
    installOpenToolContracts(server);
    const name = GOVERNED_ASSET_TOOL_NAMES[operation];
    server.registerTool(name, { inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation] },
      args => handler(operation, args, { sessionId: 'original-bound-session' }));
    for (const other of OPEN_TOOL_NAMES.filter(tool => tool !== name)) {
      server.registerTool(other, { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: '{}' }] }));
    }
    finalizeOpenToolContracts(server);
    const client = new Client({ name: 'maintenance-client', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    t.after(async () => { await client.close(); await server.close(); });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 15);
    assert.ok(tools.some(tool => tool.name === 'dexter_report_work'));
    const listed = tools.find(tool => tool.name === name);
    const result = await client.callTool({ name, arguments: inputs[operation] });
    assert.equal(calls, 1);
    assert.equal(result.isError, true);
    assert.deepEqual(Object.keys(result.structuredContent), ['presentation']);
    assert.deepEqual(result.structuredContent.presentation, JSON.parse(result.content[0].text));
    assert.deepEqual(result._meta['dexter/governedWidgetResult'], normalize(operation).body);
    const validation = new AjvJsonSchemaValidator().getValidator(listed.outputSchema)(result.structuredContent);
    assert.equal(validation.valid, true, validation.errorMessage);
    assertNoExecutionClaim(result.structuredContent.presentation);
    const unauthenticated = await handler(operation, inputs[operation], {});
    assert.equal(unauthenticated.isError, true);
    assert.equal(calls, 1);
  });
}
