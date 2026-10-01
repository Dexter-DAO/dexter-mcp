import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  normalizeGovernedAssetResult, buildGovernedAssetToolResult,
  GOVERNED_PRESENTED_OUTPUT_SCHEMAS,
} from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const cases = [
  ['generic stock dependency', fixture('stock-prepare-dependency-unavailable-api'), false],
  ['pending stock setup', fixture('stock-setup-pending-api'), true],
  ['stock first-contact receipt loss', fixture('stock-prepare-first-contact-uncertain-api'), true],
  ['stock principal lookup', fixture('stock-principal-lookup-unavailable-api'), true],
];
const legacy = structuredClone(cases[0][1]);
legacy.input = { operationId: legacy.input.operationId, action: 'buy', assetId: 'dexter', amountAtomic: '5000000' };
delete legacy.body.business.requestedCompanyQuery;
legacy.body.business.action = 'buy'; legacy.body.business.assetId = 'dexter'; legacy.body.business.amountAtomic = '5000000';
legacy.body.code = 'intent_persistence_receipt_unavailable';
legacy.body.business.refusalOrEscalationReasons = [legacy.body.code];
cases.push(['legacy asset-id receipt loss', legacy, true]);
function project(f, retryable) {
  const body = structuredClone(f.body);
  if (retryable !== undefined) body.retryable = retryable;
  const normalized = normalizeGovernedAssetResult({ operation: 'prepare', input: f.input, httpStatus: 503, body });
  assert.deepEqual(normalized.body, body, 'The API uncertainty and optional permission must survive strict normalization.');
  const tool = applyOpenToolResultPolicy('dexter_prepare_asset_action', buildGovernedAssetToolResult(normalized));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], body);
  assert.equal(tool.structuredContent.presentation.operationId, f.input.operationId);
  assert.equal(tool.structuredContent.presentation.status, 'uncertain');
  assert.equal(tool.structuredContent.presentation.retryWithSameRequestOnly, true);
  return tool;
}
for (const [label, f, absentContinues] of cases) {
  test(`${label}: absent permission preserves the preceding release`, () => {
    const p = project(f).structuredContent.presentation;
    assert.equal(p.retryable, undefined);
    assert.equal(p.nextActions[0].action, absentContinues ? 'retry_same_preparation' : 'use_returned_recovery');
  });
  test(`${label}: explicit permission permits the same preparation`, () => {
    const p = project(f, true).structuredContent.presentation;
    assert.equal(p.retryable, true);
    assert.equal(p.nextActions[0].action, 'retry_same_preparation');
    assert.equal(p.nextActions[0].operationId, f.input.operationId);
  });
  test(`${label}: explicit refusal overrides legacy and code-based continuation`, () => {
    const tool = project(f, false);
    assert.equal(tool.structuredContent.presentation.retryable, false);
    assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
    assert.equal(tool.structuredContent.recovery, undefined, 'A declined retry cannot create an automatic setup wait.');
  });
}
for (const permission of [undefined, true]) test(`pending setup ${String(permission)} retains its existing exact five-second recovery`, () => {
  const f = cases[1][1]; const tool = project(f, permission);
  assert.equal(tool.structuredContent.recovery.retryAfterMs, 5000);
  assert.deepEqual(tool.structuredContent.recovery.arguments, f.input);
});
test('a contradictory false presentation and setup recovery cannot satisfy the public output contract', () => {
  const f = cases[1][1]; const tool = project(f, true);
  tool.structuredContent.presentation.retryable = false;
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, false);
});
for (const invalid of [null, 'false', 0, {}, []]) test(`malformed retry permission ${JSON.stringify(invalid)} remains invalid`, () => {
  const f = cases[0][1];
  const normalized = normalizeGovernedAssetResult({operation: 'prepare', input: f.input, httpStatus: 503, body: {...f.body, retryable: invalid}});
  assert.equal(normalized.body.code, 'governed_backend_response_invalid');
});
test('optional permission does not permit unrelated unknown response fields', () => {
  const f = cases[0][1];
  const normalized = normalizeGovernedAssetResult({operation: 'prepare', input: f.input, httpStatus: 503, body: {...f.body, retryable: false, newAuthority: true}});
  assert.equal(normalized.body.code, 'governed_backend_response_invalid');
});

test('a database rejection stays an internal failure through the complete tool result boundary', () => {
  const f = structuredClone(cases[0][1]);
  f.body.code = 'stock_prepare_internal_error';
  f.body.retryable = false;
  f.body.status = 'refused';
  delete f.body.retryWithSameRequestOnly;
  f.body.business.lifecycle = 'not-created';
  f.body.business.ambiguity = { status: 'none', retrySameRequestOnly: false };
  f.body.business.refusalOrEscalationReasons = [f.body.code];
  f.body.explanation = 'Dexter could not prepare this trade because of an internal error. No trade was submitted.';
  const normalized = normalizeGovernedAssetResult({ operation: 'prepare', input: f.input, httpStatus: 422, body: f.body });
  assert.deepEqual(normalized.body, f.body);
  const tool = applyOpenToolResultPolicy('dexter_prepare_asset_action', buildGovernedAssetToolResult(normalized));
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(tool.structuredContent).success, true);
  assert.equal(tool.structuredContent.presentation.summary, f.body.explanation);
  assert.equal(tool.structuredContent.presentation.retryable, false);
  assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'use_returned_recovery');
  assert.equal(tool.structuredContent.recovery, undefined);
  assert.deepEqual(tool._meta['dexter/governedWidgetResult'], f.body);
});

for (const code of ['stock_prepare_storage_unavailable', 'jupiter_request_failed']) {
  test(`${code} preserves same-request recovery without inventing a missing route`, () => {
    const f = structuredClone(cases[0][1]);
    f.body.code = code;
    f.body.business.refusalOrEscalationReasons = [code];
    const tool = project(f, true);
    assert.equal(tool.structuredContent.presentation.nextActions[0].action, 'retry_same_preparation');
    assert.match(tool.structuredContent.presentation.summary, /same request/);
    assert.doesNotMatch(tool.structuredContent.presentation.summary, /no.*route|usable.*route/i);
    assert.equal(tool.structuredContent.recovery, undefined, 'Uncertainty cannot acquire the unsent setup recovery.');
  });
}
