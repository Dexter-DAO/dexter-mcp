import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, GOVERNED_PRESENTED_OUTPUT_SCHEMAS } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stock-setup-pending-api.json', import.meta.url), 'utf8'));
const dependencyFailure = JSON.parse(readFileSync(new URL('./fixtures/stock-prepare-dependency-unavailable-api.json', import.meta.url), 'utf8'));
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
