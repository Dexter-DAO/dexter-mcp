import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, GOVERNED_PRESENTED_OUTPUT_SCHEMAS } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stock-setup-pending-api.json', import.meta.url), 'utf8'));
const dependencyFailure = JSON.parse(readFileSync(new URL('./fixtures/stock-prepare-dependency-unavailable-api.json', import.meta.url), 'utf8'));
const firstContactFailure = JSON.parse(readFileSync(new URL('./fixtures/stock-prepare-first-contact-uncertain-api.json', import.meta.url), 'utf8'));
const principalLookupFailure = JSON.parse(readFileSync(new URL('./fixtures/stock-principal-lookup-unavailable-api.json', import.meta.url), 'utf8'));
const normalize = (body = fixture.body, input = fixture.input, operation = 'prepare') => normalizeGovernedAssetResult({ operation, input, httpStatus: 503, body });
test('actual normalized stock setup retains an exact unsent recovery through the output policy', () => {
  const normalized = normalize();
  assert.equal(normalized.isError, true);
  const tool = buildGovernedAssetToolResult(normalized);
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.deepEqual(tool.structuredContent.recovery.arguments, fixture.input);
  assert.equal(tool.structuredContent.recovery.settlement, 'not-submitted');
  assert.equal(tool.structuredContent.recovery.executed, false);
  assert.equal('intentId' in tool.structuredContent.recovery, false);
  assert.equal('business' in tool.structuredContent, false);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'retry_same_preparation');
  const policy = applyOpenToolResultPolicy('dexter_prepare_asset_action', tool);
  assert.deepEqual(policy.structuredContent.recovery, tool.structuredContent.recovery);
});
for (const [label, change] of [
  ['submitted', body => { body.business.settlement = 'landed'; }],
  ['executed', body => { body.executed = true; }],
  ['changed amount', body => { body.business.amountAtomic = '6000000'; }],
  ['changed company', body => { body.business.requestedCompanyQuery = 'Microsoft'; }],
  ['changed operation', body => { body.requestId = 'another-operation'; }],
  ['unknown dependency', body => { body.code = 'stock_prepare_dependency_unavailable'; }],
  ['succeeded execution', body => { body.business.executionSucceeded = true; }],
  ['intent exists', body => { body.intentId = '11111111-1111-4111-8111-111111111111'; }],
]) test(`does not advertise safe stock setup retry for ${label}`, () => {
  const body = structuredClone(fixture.body); change(body);
  const tool = buildGovernedAssetToolResult(normalize(body));
  assert.equal(tool.structuredContent.recovery, undefined);
});
test('an Execute response cannot gain stock setup retry even with the pending code', () => {
  const tool = buildGovernedAssetToolResult(normalize(fixture.body, { operationId: fixture.input.operationId, intentId: '11111111-1111-4111-8111-111111111111' }, 'execute'));
  assert.equal(tool.structuredContent.recovery, undefined);
});
test('rejects a substituted presentation beside the recovery', () => {
  const content = buildGovernedAssetToolResult(normalize()).structuredContent;
  content.presentation.operationId = 'different-operation';
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(content).success, false);
});

test('the dollar-sale dependency failure preserves the operation without inviting another Prepare', () => {
  const normalized = normalize(dependencyFailure.body, dependencyFailure.input);
  assert.deepEqual(normalized.body, dependencyFailure.body);
  const tool = applyOpenToolResultPolicy('dexter_prepare_asset_action', buildGovernedAssetToolResult(normalized));
  assert.equal(tool.isError, true);
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.equal(tool.structuredContent.recovery, undefined);
  const presentation = tool.structuredContent.presentation;
  assert.equal(presentation.status, 'uncertain');
  assert.equal(presentation.code, 'stock_prepare_dependency_unavailable');
  assert.equal(presentation.operationId, dependencyFailure.input.operationId);
  assert.equal(presentation.retryWithSameRequestOnly, true);
  assert.equal(presentation.summary, 'Dexter could not verify that its trading service is ready.');
  assert.deepEqual(presentation.nextActions.map(step => step.action), ['use_returned_recovery']);
  assert.match(presentation.nextActions[0].reason, /keep the original operationId and request terms/);
  assert.doesNotMatch(presentation.summary, /service is down|not submitted|failed to execute/i);
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], dependencyFailure.body);
});

for (const retryable of [false, true]) test(`explicit retryable=${retryable} controls refused preparation advice`, () => {
  const body = structuredClone(dependencyFailure.body);
  body.status = 'refused'; body.retryable = retryable;
  delete body.retryWithSameRequestOnly;
  body.business.lifecycle = 'not-created';
  body.business.ambiguity = { status: 'none', retrySameRequestOnly: false };
  const tool = buildGovernedAssetToolResult(normalize(body, dependencyFailure.input));
  assert.equal(tool.structuredContent.presentation.retryable, retryable);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action,
    retryable ? 'retry_same_preparation' : 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
  assert.equal(tool.structuredContent.presentation.operationId, dependencyFailure.input.operationId);
});

for (const settlement of ['submission-pending', 'unknown', 'landed']) test(`pending setup wording cannot authorize a retry when settlement is ${settlement}`, () => {
  const body = structuredClone(fixture.body);
  body.business.settlement = settlement;
  const tool = buildGovernedAssetToolResult(normalize(body));
  assert.equal(tool.structuredContent.recovery, undefined);
  assert.equal(tool.structuredContent.presentation.operationId, fixture.input.operationId);
  assert.equal(tool.structuredContent.presentation.retryWithSameRequestOnly, true);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
});

test('generic submission uncertainty preserves the response and never proposes a new trade', () => {
  const body = structuredClone(dependencyFailure.body);
  body.business.settlement = 'unknown'; body.business.lifecycle = 'ambiguous';
  const tool = buildGovernedAssetToolResult(normalize(body, dependencyFailure.input));
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
  assert.equal(tool.structuredContent.presentation.status, 'uncertain');
  assert.equal(tool.structuredContent.presentation.operationId, dependencyFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
});

test('lost first-contact receipt continues the exact Prepare recovery without claiming unsent setup', () => {
  const normalized = normalize(firstContactFailure.body, firstContactFailure.input);
  assert.deepEqual(normalized.body, firstContactFailure.body);
  const tool = applyOpenToolResultPolicy('dexter_prepare_asset_action', buildGovernedAssetToolResult(normalized));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.equal(tool.structuredContent.presentation.status, 'uncertain');
  assert.equal(tool.structuredContent.presentation.operationId, firstContactFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.retryWithSameRequestOnly, true);
  assert.equal(tool.structuredContent.presentation.intentId, undefined);
  assert.equal(tool.structuredContent.recovery, undefined, 'Receipt loss cannot acquire the typed unsent setup wait.');
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], firstContactFailure.body);
  const next = tool.structuredContent.presentation.nextActions[0];
  assert.equal(next.action, 'retry_same_preparation');
  assert.equal(next.operationId, firstContactFailure.input.operationId);
  assert.match(next.reason, /every original request argument unchanged/);
  assert.match(next.reason, /checks for a saved receipt first/);
});

test('the runtime recovery-unavailable refusal retains its explicit retry permission', () => {
  const body = structuredClone(dependencyFailure.body);
  body.status = 'refused'; body.retryable = true; delete body.retryWithSameRequestOnly;
  body.code = 'stock_prepare_recovery_unavailable';
  body.explanation = 'Dexter could not prove or finalize the immutable stock Prepare winner.';
  body.business.lifecycle = 'not-created';
  body.business.refusalOrEscalationReasons = [body.code];
  body.business.ambiguity = { status: 'none', retrySameRequestOnly: false };
  const tool = buildGovernedAssetToolResult(normalize(body, dependencyFailure.input));
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'retry_same_preparation');
  assert.equal(tool.structuredContent.presentation.nextActions[0].operationId, dependencyFailure.input.operationId);
  assert.equal(tool.structuredContent.recovery, undefined);
});

test('the producer-authorized principal lookup retry keeps the same stock request and rechecks permission', () => {
  const normalized = normalize(principalLookupFailure.body, principalLookupFailure.input);
  assert.deepEqual(normalized.body, principalLookupFailure.body);
  const tool = applyOpenToolResultPolicy('dexter_prepare_asset_action', buildGovernedAssetToolResult(normalized));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.equal(tool.structuredContent.presentation.status, 'uncertain');
  assert.equal(tool.structuredContent.presentation.operationId, principalLookupFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.retryWithSameRequestOnly, true);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'retry_same_preparation');
  assert.match(tool.structuredContent.presentation.nextActions[0].reason, /every original request argument unchanged/);
  assert.match(tool.structuredContent.presentation.nextActions[0].reason, /current connection permission.*checked again/);
  assert.equal(tool.structuredContent.recovery, undefined, 'Principal lookup retry cannot acquire a stock setup wait.');
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], principalLookupFailure.body);
});

for (const code of [
  'stock_vault_v2_runtime_identity_invalid', 'stock_principal_authentication_unavailable',
  'stock_prepare_recovery_unavailable', 'stock_prepare_recovery_result_invalid',
  'stock_prepare_recovery_identity_mismatch', 'stock_prepare_intent_identity_unavailable',
  'stock_prepare_result_identity_mismatch', 'stock_prepare_dependency_unavailable',
]) test(`stock uncertainty ${code} alone does not advertise a continuation`, () => {
  const body = structuredClone(firstContactFailure.body);
  body.code = code; body.business.refusalOrEscalationReasons = [code];
  body.explanation = 'The returned evidence does not establish a usable result.';
  const tool = buildGovernedAssetToolResult(normalize(body, firstContactFailure.input));
  assert.equal(tool.structuredContent.presentation.operationId, firstContactFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.status, 'uncertain');
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
});

for (const settlement of ['submission-pending', 'unknown', 'landed']) test(`first-contact code with ${settlement} cannot authorize a fresh Prepare`, () => {
  const body = structuredClone(firstContactFailure.body);
  body.business.settlement = settlement;
  const tool = buildGovernedAssetToolResult(normalize(body, firstContactFailure.input));
  assert.equal(tool.structuredContent.presentation.operationId, firstContactFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
});

for (const settlement of ['submission-pending', 'unknown', 'landed']) test(`principal lookup code with ${settlement} does not authorize Prepare`, () => {
  const body = structuredClone(principalLookupFailure.body);
  body.business.settlement = settlement;
  const tool = buildGovernedAssetToolResult(normalize(body, principalLookupFailure.input));
  assert.equal(tool.structuredContent.presentation.operationId, principalLookupFailure.input.operationId);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
});

for (const code of ['prepare_service_unavailable', 'intent_persistence_receipt_unavailable']) {
  test(`legacy asset-id preparation retains its prior same-request recovery for ${code}`, () => {
    const input = { operationId: fixture.input.operationId, action: 'buy', assetId: 'dexter', amountAtomic: '5000000' };
    const body = structuredClone(fixture.body);
    delete body.business.requestedCompanyQuery;
    body.business.assetId = 'dexter'; body.business.ambiguity.status = 'none';
    body.code = code; body.business.refusalOrEscalationReasons = [];
    body.explanation = 'Dexter could not reread the complete immutable intent, risk, and authority receipt.';
    const normalized = normalize(body, input);
    assert.deepEqual(normalized.body, body);
    const tool = buildGovernedAssetToolResult(normalized);
    assert.deepEqual(tool.structuredContent.presentation.nextActions, [{
      action: 'retry_same_preparation', operationId: input.operationId,
      reason: 'Continue this preparation with its original operationId and request terms. Preserve the task and wait for the returned retry delay when present.',
    }]);
    assert.equal(tool.structuredContent.recovery, undefined);
    assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
  });
}
