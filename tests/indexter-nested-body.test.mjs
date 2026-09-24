import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseIndexterRequestInputV2 } from '../lib/indexter-request-input-v2.mjs';
import { openX402CheckSchema } from '../lib/native-mcp-contract.mjs';
import { buildOpenX402IntentRequest } from '../lib/open-x402-intent-api.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { createOpenMcpServer } from '../open-mcp-server.mjs';

const resourceId = '00000000-0000-4000-8000-000000000042';
const scalar = (name, required = true) => ({ name, location: 'body', type: 'string', required });
const contract = () => ({ version: 2, additionalProperties: false, fields: [
  scalar('document'),
  { name: 'options', location: 'body', type: 'object', required: true, additionalProperties: false,
    fields: [{ ...scalar('mode', false), enum: ['basic', 'precise'] }] },
] });
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('nested contract retains required object and enums and rejects partial or unsafe shapes', () => {
  assert.deepEqual(parseIndexterRequestInputV2(contract()), contract());
  for (const mutate of [
    (c) => { c.additionalProperties = true; },
    (c) => { delete c.fields[1].additionalProperties; },
    (c) => { c.fields[1].fields[0].type = 'array'; },
    (c) => { c.fields[1].fields[0].enum = ['basic', 'basic']; },
    (c) => { c.fields[1].fields[0].enum = ['Bearer customer-private-secret']; },
    (c) => { c.fields[1].fields[0].name = 'api_key'; },
    (c) => { c.fields[1].fields.push(structuredClone(c.fields[1])); },
    (c) => { c.fields[1].fields[0].pattern = '.*'; },
    (c) => { c.fields[1].fields[0].enum = ['é'.repeat(65)]; },
  ]) {
    const bad = contract(); mutate(bad); assert.equal(parseIndexterRequestInputV2(bad), null);
  }
  const atLimit = contract();
  atLimit.fields[1].fields = Array.from({ length: 22 }, (_, i) => scalar(`item${i}`, false));
  assert.ok(parseIndexterRequestInputV2(atLimit));
  atLimit.fields[1].fields.push(scalar('overflow', false));
  assert.equal(parseIndexterRequestInputV2(atLimit), null);
});

test('managed marker stays numeric and non-GET while raw JSON and legacy arguments remain unchanged', () => {
  const raw = '{\n "document": "example", "options": {}\n}\n';
  const args = { resourceId, method: 'POST', body: raw, requestInputVersion: 2 };
  assert.deepEqual(openX402CheckSchema.parse(args), args);
  const common = { sessionId: 'nested-fixture-session', requestId: 'nested-fixture-check' };
  assert.equal(buildOpenX402IntentRequest('check', { ...common, ...args }).body, raw);
  assert.equal(buildOpenX402IntentRequest('check', { ...common, ...args }).requestInputVersion, 2);
  for (const patch of [{ method: 'GET' }, { requestInputVersion: '2' }, { requestInputVersion: 0 },
    { requestInputVersion: null }, { resourceId: undefined, url: 'https://seller.example/item' }]) {
    assert.equal(openX402CheckSchema.safeParse({ ...args, ...patch }).success, false);
    assert.throws(() => buildOpenX402IntentRequest('check', { ...common, ...args, ...patch }));
  }
  const { requestInputVersion, ...legacy } = args;
  assert.equal(Object.hasOwn(buildOpenX402IntentRequest('check', { ...common, ...legacy }), 'requestInputVersion'), false);
  assert.equal(buildOpenX402IntentRequest('check', { ...common, ...legacy, requestInputVersion: 1 }).requestInputVersion, 1);
});

test('actual hosted Check retains exact bytes, API proof and bounded refusal without replay', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'a'.repeat(32);
  const calls = [];
  let refused = false;
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, init) => {
    const path = new URL(input).pathname;
    if (path.startsWith('/api/passkey-anon/mcp-binding/')) return response({ ok: true, user_handle: 'nested-fixture-user' });
    assert.ok(path.endsWith('/check'), `unexpected fixture request ${path}`);
    const request = JSON.parse(init.body); calls.push(request);
    if (refused) return response({ ok: false, error: 'indexter_request_input_invalid', retryable: false,
      checkRequestId: request.requestId, requestInputFailure: { version: 2, code: 'body_duplicate_key' } }, 400);
    const proof = { version: 1, requestInputVersion: 2, policy: 'current_catalog', status: 'validated',
      resourceId, method: 'POST', checkRequestId: request.requestId, schemaSource: 'openapi',
      contractDigest: sha('synthetic supported contract'), payloadDigest: sha(request.body) };
    proof.bindingDigest = sha(JSON.stringify(['dexter.indexter.request-input-validation/v1', 2, resourceId,
      proof.method, proof.checkRequestId, proof.schemaSource, proof.contractDigest, proof.payloadDigest]));
    return response({ ok: true, free: true, data: { text: 'synthetic document' }, requestInputValidation: proof });
  };
  const server = createOpenMcpServer({ includeResources: false });
  t.after(async () => {
    await server.close(); globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  const args = { resourceId, method: 'POST', body: '{\n "document":"example", "options":{}\n}', requestInputVersion: 2 };
  const success = await server._registeredTools.x402_check.handler(args, { sessionId: 'nested-fixture-session' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body, args.body);
  assert.equal(calls[0].requestInputVersion, 2);
  assert.equal(success.structuredContent.requestInputValidation.payloadDigest, sha(args.body));
  assert.equal(success.structuredContent.requestInputValidation.checkRequestId, calls[0].requestId);
  assert.equal(OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(success.structuredContent).success, true);
  refused = true;
  const rawDuplicate = '{"document":"example","options":{},"options":{}}';
  const failure = await server._registeredTools.x402_check.handler({ ...args, body: rawDuplicate }, { sessionId: 'nested-fixture-session' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, rawDuplicate);
  assert.equal(failure.structuredContent.error, 'indexter_request_input_invalid');
  assert.deepEqual(failure.structuredContent.requestInputFailure, { version: 2, code: 'body_duplicate_key' });
  assert.equal(failure.structuredContent.intentId, null);
  assert.equal(failure.structuredContent.executionGuidance.readyForFetch, false);
  assert.equal(failure.structuredContent.executionGuidance.reprobeAllowed, false);
  assert.equal(failure.structuredContent.requestInputValidation, undefined);
});
