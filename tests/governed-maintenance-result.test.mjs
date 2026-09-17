import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { callGovernedAssetBackend } from '../lib/governed-asset-client.mjs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
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
    const envelope = buildGovernedAssetToolResult(normalized);
    assert.equal(envelope.isError, true);
    assert.equal(envelope.structuredContent, undefined);
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
    assert.deepEqual(buildGovernedAssetToolResult(status).structuredContent, previous);
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
  assert.deepEqual(buildGovernedAssetToolResult(read).structuredContent, original);
});

test('saved Status and History retain their existing contracts rather than accepting the write hold envelope', () => {
  const fixture = receiptFixture();
  for (const [operation, input, body] of [
    ['status', { intentId: INTENT_ID }, fixture.status], ['history', { limit: 25 }, fixture.history],
  ]) {
    const normalized = normalizeGovernedAssetResult({ operation, input, body, httpStatus: 200 });
    assert.equal(normalized.isError, false);
    assert.deepEqual(buildGovernedAssetToolResult(normalized).structuredContent, body);
    const held = normalizeGovernedAssetResult({ operation, input, body: API.body, httpStatus: 503 });
    assert.equal(held.body.code, 'governed_backend_response_invalid');
  }
});
