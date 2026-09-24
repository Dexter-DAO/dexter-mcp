import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const fixtureBytes = readFileSync(new URL('./fixtures/indexter-request-input-v2.json', import.meta.url));
assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),
  'f41e1e39743fef1e1c8571d2d38936181073345e1d398052949a48d67a994853');
const fixture = JSON.parse(fixtureBytes);
const sample = fixture.valid[0];
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
function bindProof(checkRequestId, rawBody = sample.rawBody) {
  const value = { ...sample.expectedProof, checkRequestId, payloadDigest: sha(rawBody) };
  value.bindingDigest = sha(JSON.stringify([
    'dexter.indexter.request-input-validation/v1', 2, value.resourceId,
    value.method, value.checkRequestId, value.schemaSource, value.contractDigest, value.payloadDigest,
  ]));
  return value;
}
function assertSchema(tool, result) {
  const parsed = OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result.structuredContent);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
}

test('hosted Access and saved Status retain the managed validation boundary without extra calls', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 's'.repeat(32);
  const checks = [];
  const statuses = [];
  const unexpected = [];
  let checkReply;
  let statusReply;
  globalThis.fetch = async (input, init) => {
    const path = new URL(input).pathname;
    if (path.startsWith('/api/passkey-anon/mcp-binding/')) {
      return jsonResponse({ ok: true, user_handle: 'nested-wrapper-fixture-user' });
    }
    if (path === '/api/x402/resource') return jsonResponse({ ok: true, found: false });
    if (path.endsWith('/check/status')) {
      const request = JSON.parse(init.body);
      statuses.push(request);
      return statusReply(request);
    }
    if (path.endsWith('/check')) {
      const request = JSON.parse(init.body);
      checks.push(request);
      return checkReply(request);
    }
    unexpected.push(path);
    throw new Error('Unexpected mocked request');
  };
  const server = createOpenMcpServer({ includeResources: false });
  t.after(async () => {
    await server.close();
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  const session = { sessionId: 'nested-access-status-fixture-session' };
  const accessArgs = { url: 'https://seller.example/document', method: 'POST', body: sample.rawBody };

  await t.test('URL-only Access withholds an injected managed proof and preserves the exact request', async () => {
    checkReply = (request) => jsonResponse({ ok: true, free: true, checkRequestId: request.requestId,
      data: { text: 'synthetic response' }, requestInputValidation: bindProof(request.requestId, request.body) });
    const before = checks.length;
    const result = await server._registeredTools.x402_access.handler(accessArgs, session);
    assert.equal(checks.length, before + 1);
    assert.equal(statuses.length, 0);
    assert.equal(checks.at(-1).url, accessArgs.url);
    assert.equal(checks.at(-1).method, accessArgs.method);
    assert.equal(checks.at(-1).body, accessArgs.body);
    assert.equal(Object.hasOwn(checks.at(-1), 'resourceId'), false);
    assert.equal(Object.hasOwn(checks.at(-1), 'requestInputVersion'), false);
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.checkRequestId, checks.at(-1).requestId);
    assert.equal(Object.hasOwn(result.structuredContent, 'requestInputValidation'), false);
    assert.equal(result.structuredContent.checkedRequest.body, accessArgs.body);
    assertSchema('x402_access', result);
  });

  for (const authMode of [undefined, 'siwx']) {
    await t.test(`Access input refusal survives ${authMode ?? 'absent'} authentication hint`, async () => {
      checkReply = (request) => jsonResponse({ ok: false, error: 'indexter_request_input_invalid',
        retryable: false, checkRequestId: request.requestId,
        requestInputFailure: { version: 2, code: 'body_duplicate_key' },
        ...(authMode ? { authMode } : {}), intentId: 'provisional-fixture-intent', paymentRequired: true,
        requestInputValidation: bindProof(request.requestId, request.body) }, 400);
      const before = checks.length;
      const rawBody = '{"document":"synthetic","options":{},"options":{}}';
      const result = await server._registeredTools.x402_access.handler({ ...accessArgs, body: rawBody }, session);
      assert.equal(checks.length, before + 1);
      assert.equal(checks.at(-1).body, rawBody);
      assert.equal(statuses.length, 0);
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error, 'indexter_request_input_invalid');
      assert.equal(result.structuredContent.checkRequestId, checks.at(-1).requestId);
      assert.deepEqual(result.structuredContent.requestInputFailure, { version: 2, code: 'body_duplicate_key' });
      assert.equal(result.structuredContent.retryable, false);
      assert.equal(result.structuredContent.intentId, null);
      assert.equal(result.structuredContent.executionGuidance.readyForFetch, false);
      assert.equal(result.structuredContent.executionGuidance.reprobeAllowed, false);
      assert.equal(Object.hasOwn(result.structuredContent, 'requestInputValidation'), false);
      assertSchema('x402_access', result);
    });
  }

  const savedId = fixture.association.checkRequestId;
  const saved = { ok: true, free: true, checkRequestId: savedId,
    data: { text: 'retained synthetic response' }, requestInputValidation: sample.expectedProof };
  const variants = [
    ['exact saved proof', saved, sample.expectedProof],
    ['saved result without proof', { ok: true, free: true, checkRequestId: savedId }, undefined],
    ['proof for another saved check', { ...saved, requestInputValidation: bindProof('another-saved-check') }, undefined],
    ['proof with modified digest', { ...saved, requestInputValidation: { ...sample.expectedProof, bindingDigest: '0'.repeat(64) } }, undefined],
    ['saved delivery with exact proof', { ...saved, status: 'purchase_already_started',
      intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      delivery: { state: 'response_received', httpStatus: 200 } }, sample.expectedProof],
  ];
  for (const [name, response, expectedProof] of variants) {
    await t.test(`Status: ${name}`, async () => {
      statusReply = () => jsonResponse(response);
      const beforeStatus = statuses.length;
      const beforeChecks = checks.length;
      const result = await server._registeredTools.x402_status.handler({ checkRequestId: savedId }, session);
      assert.equal(statuses.length, beforeStatus + 1);
      assert.equal(checks.length, beforeChecks);
      assert.equal(statuses.at(-1).requestId, savedId);
      assert.equal(Object.hasOwn(statuses.at(-1), 'body'), false);
      assert.equal(Object.hasOwn(statuses.at(-1), 'requestInputVersion'), false);
      assert.equal(result.structuredContent.checkRequestId, savedId);
      assert.deepEqual(result.structuredContent.requestInputValidation, expectedProof);
      assert.equal(Object.hasOwn(result.structuredContent, 'checkedRequest'), false);
      assertSchema('x402_status', result);
    });
  }
  await t.test('saved input refusal takes precedence over delivery metadata and SIWX', async () => {
    statusReply = () => jsonResponse({ ok: false, error: 'indexter_request_input_invalid',
      retryable: false, checkRequestId: savedId, authMode: 'siwx',
      requestInputFailure: { version: 2, code: 'schema_unsupported' },
      intentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      delivery: { state: 'response_received', httpStatus: 200 },
      requestInputValidation: sample.expectedProof }, 409);
    const beforeStatus = statuses.length;
    const beforeChecks = checks.length;
    const result = await server._registeredTools.x402_status.handler({ checkRequestId: savedId }, session);
    assert.equal(statuses.length, beforeStatus + 1);
    assert.equal(checks.length, beforeChecks);
    assert.equal(statuses.at(-1).requestId, savedId);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.checkRequestId, savedId);
    assert.equal(result.structuredContent.error, 'indexter_request_input_invalid');
    assert.deepEqual(result.structuredContent.requestInputFailure, { version: 2, code: 'schema_unsupported' });
    assert.equal(result.structuredContent.retryable, false);
    assert.equal(result.structuredContent.intentId, null);
    assert.equal(result.structuredContent.executionGuidance.readyForFetch, false);
    assert.equal(result.structuredContent.executionGuidance.reprobeAllowed, false);
    assert.equal(Object.hasOwn(result.structuredContent, 'requestInputValidation'), false);
    assertSchema('x402_status', result);
  });
  assert.deepEqual(unexpected, []);
});
