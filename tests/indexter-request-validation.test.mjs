import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  parseIndexterRequestInputFailure,
  parseIndexterRequestInputValidation,
} from '../lib/indexter-request-validation.mjs';
import {
  buildHostedCheckModelResult,
  buildHostedCheckStatusModelResult,
  buildHostedCheckToolResult,
} from '../lib/open-check-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const RESOURCE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHECK_ID = 'nested-contract-check-1';
const BODY = '{\n  "document": "synthetic", "options": {}\n}';
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
function proof(overrides = {}) {
  const value = {
    version: 1, requestInputVersion: 2, policy: 'current_catalog', status: 'validated',
    resourceId: RESOURCE_ID, method: 'POST', checkRequestId: CHECK_ID,
    schemaSource: 'openapi', contractDigest: 'a'.repeat(64), payloadDigest: hash(BODY),
    ...overrides,
  };
  return { ...value, bindingDigest: hash(JSON.stringify([
    'dexter.indexter.request-input-validation/v1', 2, value.resourceId,
    value.method, value.checkRequestId, value.schemaSource,
    value.contractDigest, value.payloadDigest,
  ])) };
}
const association = {
  resourceId: RESOURCE_ID, method: 'POST', checkRequestId: CHECK_ID,
  rawBody: BODY, rawBodyProvided: true,
};
function build(checkResult, overrides = {}) {
  return buildHostedCheckModelResult({ ...association, checkResult, ...overrides });
}
function success(overrides = {}) {
  return { ok: true, free: true, httpStatus: 200, checkRequestId: CHECK_ID,
    requestInputValidation: proof(), ...overrides };
}
function refusal(code, httpStatus = 400) {
  return { ok: false, error: 'indexter_request_input_invalid', retryable: false,
    checkRequestId: CHECK_ID, httpStatus, requestInputFailure: { version: 2, code } };
}

// Synthetic output receipt only. API owns schema/body validation and its fixtures.
test('API proof retains exact fields through the model and tool result', () => {
  const expected = proof();
  assert.deepEqual(parseIndexterRequestInputValidation(expected, association), expected);
  const model = build(success());
  assert.deepEqual(model.requestInputValidation, expected);
  assert.equal(model.checkedRequest.body, BODY);
  const tool = buildHostedCheckToolResult(model);
  assert.deepEqual(tool.structuredContent.requestInputValidation, expected);
  assert.deepEqual(JSON.parse(tool.content[0].text).requestInputValidation, expected);
  assert.equal(OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(model).success, true);
});

test('proof rejects unknown keys, partial shape, noncanonical identities and binding tampering', () => {
  const missing = proof();
  delete missing.schemaSource;
  for (const invalid of [
    null, [], {}, missing, { ...proof(), extra: true },
    proof({ version: 2 }), proof({ requestInputVersion: 1 }),
    proof({ policy: 'historical_catalog' }), proof({ status: 'unverified' }),
    proof({ resourceId: RESOURCE_ID.toUpperCase() }), proof({ method: 'GET' }),
    proof({ schemaSource: 'unknown' }), proof({ contractDigest: 'A'.repeat(64) }),
    { ...proof(), payloadDigest: 'b'.repeat(64) }, { ...proof(), bindingDigest: '0'.repeat(64) },
  ]) assert.equal(parseIndexterRequestInputValidation(invalid, association), undefined);
});

test('new check proof binds submitted identity and exact UTF8 body bytes', () => {
  for (const overrides of [
    { resourceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    { resourceId: undefined }, { method: 'PUT' }, { checkRequestId: 'another-check' },
    { rawBody: BODY + ' ' }, { rawBodyProvided: false }, { rawBody: {} },
  ]) assert.equal(parseIndexterRequestInputValidation(proof(), { ...association, ...overrides }), undefined);
  const unicodeBody = '{"document":"é","options":{}}';
  const unicodeProof = proof({ payloadDigest: hash(unicodeBody) });
  assert.deepEqual(parseIndexterRequestInputValidation(unicodeProof, {
    ...association, rawBody: unicodeBody,
  }), unicodeProof);
  assert.equal(parseIndexterRequestInputValidation(unicodeProof, {
    ...association, rawBody: '{"document":"é","options":{}}',
  }), undefined);
  const overflow = 'é'.repeat(131073);
  assert.equal(parseIndexterRequestInputValidation(proof({ payloadDigest: hash(overflow) }), {
    ...association, rawBody: overflow,
  }), undefined);
  assert.equal(build(success(), { method: 'POST', validationMethod: 'PUT' }).requestInputValidation, undefined);
  assert.equal(build(success(), { resourceId: undefined, url: 'https://example.org' }).requestInputValidation, undefined);
});

test('proof cannot be inferred from markers or retained on failed or uncertain responses', () => {
  assert.equal(build(success({ requestInputValidation: undefined }), {
    requestInputVersion: 2,
  }).requestInputValidation, undefined);
  for (const overrides of [
    { ok: false }, { httpStatus: 503 }, { error: 'unknown_failure' },
    { status: 'check_in_progress' }, { status: 'check_unknown' }, { status: 'check_ambiguous' },
    { authMode: 'siwx' }, { checkRequestId: 'another-check' },
    { requestInputFailure: { version: 2, code: 'body_invalid' } },
  ]) assert.equal(build(success(overrides)).requestInputValidation, undefined);
});

test('all finite input refusals retain their correlation and remain non-executable', () => {
  const codes = [
    ['unsupported_version', 400], ['target_not_supported', 400], ['method_not_supported', 400],
    ['body_missing', 400], ['body_invalid_json', 400], ['body_duplicate_key', 400], ['body_invalid', 400],
    ['version_required', 409], ['schema_unavailable', 409], ['schema_unsupported', 409], ['body_too_large', 413],
  ];
  for (const [code, status] of codes) {
    const response = { ...refusal(code, status), intentId: 'provisional-intent', paymentRequired: true,
      authMode: 'siwx', data: { unsafe: 'discard' }, inputSchema: { unsafe: 'discard' },
      requestInputValidation: proof(), message: 'discard', reason: 'discard' };
    const model = build(response);
    assert.deepEqual(model.requestInputFailure, { version: 2, code });
    assert.equal(model.checkRequestId, CHECK_ID);
    assert.equal(model.error, 'indexter_request_input_invalid');
    assert.equal(model.retryable, false);
    assert.equal(model.intentId, null);
    assert.equal(model.executionGuidance.readyForFetch, false);
    assert.equal(model.executionGuidance.reprobeAllowed, false);
    for (const key of ['requestInputValidation', 'data', 'inputSchema', 'message', 'reason']) {
      assert.equal(Object.hasOwn(model, key), false);
    }
    const tool = buildHostedCheckToolResult(model);
    assert.equal(tool.isError, true);
    assert.deepEqual(tool.structuredContent.requestInputFailure, { version: 2, code });
    assert.equal(OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(model).success, true);
  }
});

test('malformed, mismatched or extended failure details are withheld without changing other errors', () => {
  for (const patch of [
    { requestInputFailure: { version: 2, code: 'unknown_code' } },
    { requestInputFailure: { version: 2, code: 'body_invalid', raw: 'discard' } },
    { requestInputFailure: { code: 'body_invalid' } }, { retryable: true },
    { checkRequestId: 'another-check' }, { httpStatus: 200 },
  ]) {
    const value = { ...refusal('body_invalid'), ...patch };
    assert.equal(parseIndexterRequestInputFailure(value, CHECK_ID), undefined);
    assert.equal(build(value).requestInputFailure, undefined);
  }
  const existing = build({ ok: false, error: 'agent_role_state_unavailable', retryable: true,
    reason: 'swig_role_rpc_context_unavailable', httpStatus: 503 });
  assert.equal(existing.retryable, true);
  assert.equal(existing.reason, 'swig_role_rpc_context_unavailable');
  assert.equal(existing.executionGuidance.supportedPath, 'local_authority_unavailable');
});

test('saved check preserves only a self-bound proof for the exact status request', () => {
  const recover = (checkResult) => buildHostedCheckStatusModelResult({ checkResult, checkRequestId: CHECK_ID });
  assert.equal(recover({ ok: true, free: true }).requestInputValidation, undefined);
  const saved = recover(success());
  assert.deepEqual(saved.requestInputValidation, proof());
  assert.equal(Object.hasOwn(saved, 'checkedRequest'), false);
  assert.equal(OPEN_TOOL_CONTRACTS.x402_status.outputSchema.safeParse(saved).success, true);
  assert.equal(recover(success({ requestInputValidation: proof({ checkRequestId: 'another-check' }) })).requestInputValidation, undefined);
  assert.equal(recover(success({ requestInputValidation: { ...proof(), bindingDigest: '0'.repeat(64) } })).requestInputValidation, undefined);
  assert.equal(recover(success({ ok: false, status: 'check_unknown' })).requestInputValidation, undefined);
  const started = recover(success({ status: 'purchase_already_started', intentId: 'existing-intent' }));
  assert.deepEqual(started.requestInputValidation, proof());
  const failed = recover({ ...refusal('body_invalid'), status: 'purchase_already_started', intentId: 'untrusted' });
  assert.equal(failed.intentId, null);
  assert.deepEqual(failed.requestInputFailure, { version: 2, code: 'body_invalid' });
});
