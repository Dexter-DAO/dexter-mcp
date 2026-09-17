import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, buildGovernedAssetFailure } from '../lib/governed-asset-result.mjs';
import { GOVERNED_ASSET_INPUT_SCHEMAS, GOVERNED_ASSET_TOOL_NAMES } from '../lib/governed-asset-contract.mjs';
import { buildVaultReadError } from '../lib/wallet-read-recovery.mjs';
import { receiptFixture, OPERATION_ID, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

function output(operation, body, httpStatus = 200) {
  const input = operation === 'history' ? {} : { intentId: body.intentId,
    ...(operation === 'execute' ? { operationId: OPERATION_ID } : {}),
  };
  const normalized = normalizeGovernedAssetResult({ operation, input, httpStatus, body });
  const result = buildGovernedAssetToolResult(normalized);
  return { normalized, result, presentation: JSON.parse(result.content[0].text) };
}

function assertSupportedNextArguments(steps) {
  for (const next of steps) {
    if (next.tool === 'dexter_wallet_portfolio') {
      assert.deepEqual(next.arguments, {}); continue;
    }
    if (!next.tool) continue;
    const operation = Object.entries(GOVERNED_ASSET_TOOL_NAMES).find(([, tool]) => tool === next.tool)?.[0];
    assert.ok(operation, next.tool);
    assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS[operation].safeParse(next.arguments).success, true);
    assert.equal(next.requiredArgument, undefined, 'A complete continuation cannot request an unsupported additional argument');
  }
}

test('confirmed trade with actual proceeds offers same-attempt recovery and current holdings without calling either', () => {
  const fixture = receiptFixture({ captured: true });
  const { normalized, presentation } = output('status', fixture.status);
  assert.equal(normalized.isError, false);
  assert.match(presentation.summary, /confirmed/);
  assert.doesNotMatch(presentation.summary, /finalized/);
  assert.equal(presentation.actual.credit.amount, '1.002443');
  const recovery = presentation.nextActions.find((next) => next.tool === 'dexter_reconcile_asset_action');
  assert.ok(recovery);
  assert.deepEqual(recovery.arguments, { intentId: fixture.status.intentId });
  assert.match(recovery.condition, /original task/);
  assert.match(recovery.condition, /status-only/);
  assert.ok(presentation.nextActions.some((next) => next.tool === 'dexter_wallet_portfolio'));
  assertSupportedNextArguments(presentation.nextActions);
});

test('pending Reconcile result continues observation without immediately proposing another Reconcile', () => {
  const { normalized, presentation } = output('reconcile', receiptFixture().reconcile, 202);
  assert.equal(normalized.isError, false);
  assert.equal(presentation.recoveryOutcome, 'pending');
  assert.equal(presentation.nextActions[0].tool, 'dexter_asset_action_status');
  assert.equal(presentation.nextActions.some((next) => next.tool === 'dexter_reconcile_asset_action'), false);
  assertSupportedNextArguments(presentation.nextActions);
});

test('valid HTTP409 not-required recovery remains a no-op success through normalization', () => {
  const body = receiptFixture().reconcile;
  const state = body.statusAfter;
  delete state.receiptOutcome;
  Object.assign(state, { attemptId: null, stateVersion: null, status: 'prepared', ledgerState: 'prepared',
    transactionSignature: null, submitted: false, landingProof: false, executionSucceeded: null,
    confirmationSlot: null, confirmationCommitment: null, settlementFinalized: false, reconciliationRequired: false,
    canReconcile: false, reconciliationKind: null, reconciliationEvidenceDigest: null, receiptPhases: [] });
  Object.assign(body, { outcome: 'not-required', phase: 'none', attemptId: null, stateVersionBefore: null,
    code: 'reconciliation_not_required', mutated: false });
  refreshReconcileDigest(body);
  const { normalized, result, presentation } = output('reconcile', body, 409);
  assert.equal(normalized.body.namespace, 'dexter-governed-agent-reconcile/v1', JSON.stringify(normalized.body));
  assert.equal(normalized.isError, false);
  assert.equal(result.isError, false);
  assert.equal(presentation.recoveryOutcome, 'not-required');
  assert.deepEqual(result.structuredContent, body);
});

test('confirmed landed program error remains failure and never reports an actual successful fill', () => {
  const body = receiptFixture().execute;
  delete body.receiptOutcome;
  Object.assign(body, { executed: false, code: 'landed_program_error', explanation: 'The transaction landed, but the action failed.' });
  Object.assign(body.business, { executionSucceeded: false, programError: true });
  const { normalized, result, presentation } = output('execute', body);
  assert.equal(normalized.isError, true);
  assert.equal(normalized.body.code, 'landed_program_error');
  assert.equal(result.structuredContent.business.executionSucceeded, false);
  assert.equal(presentation.actual, undefined);
  assert.match(presentation.summary, /landed/);
  assert.match(presentation.summary, /failed/);
  assert.doesNotMatch(presentation.summary, /Sale confirmed/);
});

test('a malformed execution response retains uncertain identity and only same-intent inspection', () => {
  const body = receiptFixture().execute;
  body.receiptOutcome.credit.amountRaw = '1';
  const { normalized, result, presentation } = output('execute', body);
  assert.equal(normalized.body.status, 'unknown');
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(presentation.intentId, body.intentId);
  assert.equal(presentation.operationId, OPERATION_ID);
  assert.equal(presentation.retry, 'reconcile_same_intent_only');
  assert.equal(presentation.nextActions[0].tool, 'dexter_asset_action_status');
  assertSupportedNextArguments(presentation.nextActions);
});

test('a lost Reconcile response does not become an automatic mutation retry', () => {
  const fixture = receiptFixture();
  const failure = buildGovernedAssetFailure({ operation: 'reconcile', input: { intentId: fixture.status.intentId }, code: 'governed_backend_transport_failed' });
  const result = buildGovernedAssetToolResult(failure);
  const presentation = JSON.parse(result.content[0].text);
  assert.equal(result.isError, true);
  assert.equal(presentation.retry, 'manual_same_intent_only');
  assert.deepEqual(presentation.nextActions.map((next) => next.tool), ['dexter_asset_action_status']);
  assertSupportedNextArguments(presentation.nextActions);
});

test('finalized status preserves receipt observation commitment without asking to finalize again', () => {
  const state = receiptFixture({ captured: true }).status;
  Object.assign(state, { confirmationCommitment: 'finalized', settlementFinalized: true,
    reconciliationRequired: false, canReconcile: false, receiptPhases: [...state.receiptPhases, 'reconciled_finalized'] });
  state.receiptOutcome.transactionCommitment = 'finalized';
  const { normalized, result, presentation } = output('status', state);
  assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
  assert.match(presentation.summary, /finalized/);
  assert.equal(result.structuredContent.receiptOutcome.receiptCommitment, 'confirmed');
  assert.equal(presentation.nextActions.some((next) => next.tool === 'dexter_asset_action_status'), false);
  assert.equal(presentation.nextActions.some((next) => next.tool === 'dexter_reconcile_asset_action'), false);
});

test('temporary wallet read failures provide bounded read continuation without pretending binding is known', () => {
  for (const userBound of [true, false, null]) {
    const body = buildVaultReadError({ userBound });
    assert.equal(body.user_bound, userBound === true ? true : null);
    assert.equal(body.continuation.kind, 'retry_read');
    assert.equal(body.continuation.tool, 'dexter_wallet');
    assert.equal(body.continuation.maxAttempts, 2);
    assert.equal(body.continuation.retryAfterMs, 2000);
    assert.equal(body.continuation.userActionRequired, false);
    assert.equal(Object.hasOwn(body, 'cash'), false);
    assert.equal(Object.hasOwn(body, 'balance'), false);
  }
});

function preparedOutput(fixture) {
  const normalized = normalizeGovernedAssetResult({ operation: 'prepare', input: fixture.input,
    httpStatus: 200, body: fixture.prepared });
  assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
  const result = buildGovernedAssetToolResult(normalized);
  return { result, presentation: JSON.parse(result.content[0].text) };
}

test('covered Prepare exposes estimated terms and stable executable continuation at the result boundary', () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const original = structuredClone(fixture.prepared);
  const { result, presentation } = preparedOutput(fixture);
  assert.deepEqual(result.structuredContent, original);
  assert.deepEqual(presentation.approval, { status: 'not-required', reasons: [] });
  assert.equal(presentation.effectiveExpiresAt, original.effectiveExpiresAt);
  assert.equal(presentation.preview.quoteExpiresAtUnixMs, original.preview.quoteExpiresAtUnixMs);
  assert.equal(presentation.preview.basis, 'estimated_quote');
  assert.equal(presentation.preview.product.name, 'Tesla Tokenized Stock');
  assert.equal(presentation.preview.product.symbol, 'TSLAx');
  assert.equal(presentation.preview.input.amount, '250');
  assert.equal(presentation.preview.input.symbol, 'USDC');
  assert.equal(presentation.preview.requestedMaximumSpend.amount, '300');
  assert.equal(presentation.preview.maximumInput.amountAtomic, original.preview.amountAtomic);
  assert.equal(presentation.preview.requestedShareQuantity, '1.25');
  assert.equal(presentation.preview.expectedShareQuantity, '1.26');
  assert.equal(presentation.preview.minimumShareQuantity, '1.25');
  assert.equal(presentation.preview.shareQuantitySemantics, 'minimum-receive');
  assert.equal(presentation.preview.overfillPossible, true);
  assert.deepEqual(presentation.preview.quotedFees, original.preview.feeSummary);
  assert.equal(presentation.actual, undefined);
  assert.doesNotMatch(presentation.summary, /sold|bought|confirmed|finalized/i);
  const next = presentation.nextActions[0];
  assert.equal(next.tool, 'dexter_execute_asset_action');
  assert.equal(next.arguments.intentId, original.intentId);
  assert.notEqual(next.arguments.operationId, fixture.input.operationId);
  assertSupportedNextArguments(presentation.nextActions);
  assert.deepEqual(preparedOutput(fixture).presentation.nextActions[0].arguments, next.arguments);
});

test('prepared owner escalation retains exact reasons and the missing direct handoff without proposing Execute', () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  fixture.prepared.approval = { status: 'owner-approval-required', reasons: ['amount_limit_exceeded'] };
  const { result, presentation } = preparedOutput(fixture);
  assert.deepEqual(presentation.approval, fixture.prepared.approval);
  assert.deepEqual(result.structuredContent, fixture.prepared);
  assert.match(presentation.summary, /needs owner approval/);
  assert.equal(presentation.nextActions.some((next) => next.tool === 'dexter_execute_asset_action'), false);
  assert.equal(presentation.nextActions[0].url, 'https://dexter.cash/wallet');
  assert.equal(presentation.nextActions[0].directApprovalLinkAvailable, false);
  assert.match(presentation.nextActions[0].reason, /No direct approval link was returned/);
});

test('prepared sell preserves varying mint precision while tiny estimated USDC proceeds remain exact', () => {
  const fixture = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  fixture.prepared.preview.productIdentity.decimals = 9;
  fixture.prepared.preview.stockSelection.decimals = 9;
  fixture.prepared.preview.expectedOutputAtomic = '1';
  fixture.prepared.preview.minimumOutputAtomic = '1';
  const { result, presentation } = preparedOutput(fixture);
  assert.equal(presentation.preview.input.decimals, 9);
  assert.equal(presentation.preview.input.amountAtomic, fixture.input.amountAtomic);
  assert.equal(presentation.preview.input.displayAmount, null);
  assert.equal(Object.hasOwn(presentation.preview.input, 'amount'), false);
  assert.equal(presentation.preview.requestedShareQuantity, null);
  assert.equal(presentation.preview.expectedOutput.amount, '0.000001');
  assert.equal(presentation.preview.expectedOutput.symbol, 'USDC');
  assert.equal(presentation.preview.minimumOutput.amount, '0.000001');
  assert.equal(presentation.actual, undefined);
  assert.deepEqual(result.structuredContent, fixture.prepared);
});

test('prepared continuation never reuses the Prepare operation identity even if its label matches the suggested Execute identity', () => {
  const original = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const fixture = dynamicStockV2Fixture('tesla', `execute:${original.prepared.intentId}`);
  const { presentation } = preparedOutput(fixture);
  const next = presentation.nextActions[0];
  assert.notEqual(next.arguments.operationId, fixture.input.operationId);
  assertSupportedNextArguments(presentation.nextActions);
  assert.deepEqual(preparedOutput(fixture).presentation.nextActions[0].arguments, next.arguments);
});


test('unavailable action through another connection is a failed read without replacement guidance', () => {
  const body = {
    namespace: 'dexter-governed-agent-http-refusal/v1', status: 'refused', code: 'execution_not_found',
    explanation: 'Dexter refused the request because its exact governed identity or current state could not be proven.',
    executed: false, signed: false, submitted: false, settlementFinalized: false,
  };
  const normalized = normalizeGovernedAssetResult({ operation: 'status', input: { intentId: receiptFixture().status.intentId }, httpStatus: 404, body });
  assert.equal(normalized.body.code, 'execution_not_found');
  const result = buildGovernedAssetToolResult(normalized);
  assert.equal(result.isError, true);
  assert.deepEqual(result._meta['dexter/governedWidgetResult'], body);
  const presentation = JSON.parse(result.content[0].text);
  assert.equal(presentation.actual, undefined);
  assert.match(presentation.summary, /outcome is unknown/);
  assert.equal(presentation.nextActions[0].action, 'inspect_original_connection');
  assert.equal(presentation.nextActions.some(step => step.tool === 'dexter_execute_asset_action'), false);
  assert.match(presentation.nextActions[0].reason, /does not establish that execution failed/);
});
