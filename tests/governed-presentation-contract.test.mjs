import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  buildGovernedAssetToolResult, buildGovernedAssetFailure,
  normalizeGovernedAssetResult, GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS,
  GOVERNED_PRESENTED_OUTPUT_SCHEMAS, GOVERNED_PRESENTED_SUCCESS_SCHEMAS,
} from '../lib/governed-asset-result.mjs';
import { GOVERNED_ASSET_TOOL_NAMES } from '../lib/governed-asset-contract.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import { receiptFixture, OPERATION_ID } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const fixture = receiptFixture({ captured: true });
function policy(operation, result) {
  return applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[operation], result);
}
for (const operation of ['prepare', 'execute', 'status', 'reconcile', 'history']) {
  test(`${operation} exposes a declared presentation while its strict backend schema refuses it`, () => {
    const body = operation === 'prepare' ? fixture.prepared : fixture[operation];
    const result = buildGovernedAssetToolResult({ body, isError: false });
    assert.equal(GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS[operation].safeParse(body).success, true);
    assert.equal(GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS[operation].safeParse(result.structuredContent).success, false);
    assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS[operation].safeParse(result.structuredContent).success, true);
    const schema = zodToJsonSchema(GOVERNED_PRESENTED_OUTPUT_SCHEMAS[operation], { $refStrategy: 'none' });
    assert.equal(schema.anyOf.length, 2);
    for (const branch of schema.anyOf) {
      assert.ok(branch.required.includes('presentation'));
      assert.equal(branch.additionalProperties, false);
    }
    const human = operation === 'history'
      ? schema.anyOf[0].properties.presentation.properties.items.items
      : schema.anyOf[0].properties.presentation;
    for (const required of ['status', 'summary', 'nextActions']) assert.ok(human.required.includes(required));
    const changed = structuredClone(result.structuredContent);
    const presentation = operation === 'history' ? changed.presentation.items[0] : changed.presentation;
    presentation.summary = 'An invented successful outcome.';
    assert.equal(GOVERNED_PRESENTED_SUCCESS_SCHEMAS[operation].safeParse(changed).success, false);
    assert.throws(() => policy(operation, { ...result, structuredContent: changed }));
  });

  test(`${operation} error retains IDs and redacts private strings in both presentation channels`, () => {
    const failure = buildGovernedAssetFailure({ operation,
      input: { operationId: OPERATION_ID, intentId: fixture.status.intentId },
      code: 'governed_backend_transport_failed' });
    failure.body.explanation = 'Internal call failed for private@example.com at /home/branchmanager/private.env';
    const result = policy(operation, buildGovernedAssetToolResult(failure));
    assert.deepEqual(Object.keys(result.structuredContent), ['presentation']);
    const human = result.structuredContent.presentation;
    assert.deepEqual(human, JSON.parse(result.content[0].text));
    assert.equal(human.intentId, failure.body.intentId);
    assert.equal(human.operationId, failure.body.operationId);
    assert.doesNotMatch(JSON.stringify(result.structuredContent), /private@example|branchmanager/);
    assert.deepEqual(result._meta['dexter/governedWidgetResult'], failure.body);
    const wrongOperation = operation === 'execute' ? 'prepare' : 'execute';
    const wrong = policy(wrongOperation, buildGovernedAssetToolResult(failure));
    assert.equal(wrong.structuredContent, undefined);
  });
}

test('ordinary error projection requires a recognized body and matching presentation', () => {
  const forged = { namespace: 'unvalidated-body', status: 'confirmed', executed: true,
    intentId: fixture.status.intentId, requestId: OPERATION_ID,
    business: { action: 'sell', executionSucceeded: true, finality: 'finalized' } };
  assert.equal(policy('execute', buildGovernedAssetToolResult({ body: forged, isError: true })).structuredContent, undefined);
  const failure = buildGovernedAssetFailure({ operation: 'execute',
    input: { operationId: OPERATION_ID, intentId: fixture.status.intentId }, code: 'governed_backend_transport_failed' });
  const result = buildGovernedAssetToolResult(failure);
  result.structuredContent.presentation.intentId = '00000000-0000-4000-8000-000000000000';
  assert.equal(policy('execute', result).structuredContent, undefined);
});

for (const operation of ['prepare', 'execute', 'reconcile']) {
  test(`${operation} successful body cannot masquerade as an ordinary structured error`, () => {
    const body = operation === 'prepare' ? fixture.prepared : fixture[operation];
    assert.equal(policy(operation, buildGovernedAssetToolResult({ body, isError: true })).structuredContent, undefined);
  });
}

test('backend-injected presentation is rejected before any human success projection', () => {
  const body = { ...fixture.prepared, presentation: { summary: 'Sold.' } };
  const normalized = normalizeGovernedAssetResult({ operation: 'prepare', input: fixture.input, httpStatus: 200, body });
  assert.equal(normalized.isError, true);
  assert.equal(normalized.body.code, 'governed_backend_response_invalid');
});

const hostedSource = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const handlerStart = hostedSource.indexOf('async function governedAssetAction(');
const handlerEnd = hostedSource.indexOf('// ─── MCP Server Setup', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);

test('actual hosted handler preserves the original call and produces the declared presentation', async () => {
  let calls = 0;
  const challenge = { isError: true, content: [{ type: 'text', text: 'Connect your wallet.' }] };
  const handler = runInNewContext(`${hostedSource.slice(handlerStart, handlerEnd)}; governedAssetAction`, {
    GOVERNED_ASSET_TOOL_NAMES, GOVERNED_ASSET_META: {},
    API_BASE_FALLBACK: 'https://api.example.invalid',
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'fixture-only-unused-secret',
    extractMcpSessionId: (extra) => extra.sessionId,
    buildVaultAuthenticationRequired: (value) => value,
    vaultAuthenticationResult: () => challenge,
    buildGovernedAssetToolResult, buildGovernedAssetFailure,
    safeErrorLabel: () => 'fixture', console: { warn() {} },
    callGovernedAssetBackend: async ({ operation, input, mcpSessionId }) => {
      calls += 1;
      assert.equal(mcpSessionId, 'original-bound-session');
      const body = operation === 'prepare' ? fixture.prepared : fixture[operation];
      return normalizeGovernedAssetResult({ operation, input,
        httpStatus: operation === 'reconcile' ? 202 : 200, body });
    },
  });
  for (const operation of ['prepare', 'execute', 'status', 'reconcile', 'history']) {
    const body = operation === 'prepare' ? fixture.prepared : fixture[operation];
    const input = operation === 'prepare' ? fixture.input : operation === 'history' ? { limit: 25 }
      : { intentId: body.intentId, ...(operation === 'execute' ? { operationId: OPERATION_ID } : {}) };
    const result = policy(operation, await handler(operation, input, { sessionId: 'original-bound-session' }));
    assert.equal(result.isError, false);
    assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS[operation].safeParse(result.structuredContent).success, true);
    assert.deepEqual(result.structuredContent.presentation, JSON.parse(result.content[0].text));
  }
  assert.equal(calls, 5);
  assert.equal(await handler('execute', {}, {}), challenge);
  assert.equal(calls, 5, 'authentication challenge never calls the backend');
});
