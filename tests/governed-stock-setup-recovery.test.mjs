import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, GOVERNED_PRESENTED_OUTPUT_SCHEMAS } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/stock-setup-pending-api.json', import.meta.url), 'utf8'));
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
