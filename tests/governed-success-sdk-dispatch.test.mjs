import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import {
  installOpenToolContracts,
  finalizeOpenToolContracts,
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  GOVERNED_ASSET_INPUT_SCHEMAS,
  GOVERNED_ASSET_TOOL_NAMES,
} from '../lib/governed-asset-contract.mjs';
import {
  buildGovernedAssetToolResult,
  GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS,
  GOVERNED_PRESENTED_OUTPUT_SCHEMAS,
  GOVERNED_PRESENTED_SUCCESS_SCHEMAS,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { presentGovernedAgentResult } from '../lib/governed-agent-presentation.mjs';

function assertPresentedDetail(result, expected) {
  const { presentation, ...detail } = result.structuredContent;
  assert.deepEqual(detail, expected);
  assert.deepEqual(presentation, JSON.parse(result.content[0].text));
  assert.deepEqual(presentation, JSON.parse(JSON.stringify(presentGovernedAgentResult(expected))));
}

function assertPresentedError(result, expected) {
  const presentation = JSON.parse(result.content[0].text);
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { presentation });
  assert.deepEqual(presentation, JSON.parse(JSON.stringify(presentGovernedAgentResult(expected))));
  assert.deepEqual(result._meta['dexter/governedWidgetResult'], expected);
}

const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const category = {
  authorityNamespace: 'stock-category-v2',
  categoryRuleId: '319f981c-9215-4141-84f2-d89ffe9cbece',
  categoryRuleDigest: 'a'.repeat(64),
  grantBindingId: '419f981c-9215-4141-84f2-d89ffe9cbece',
  apiRuntimeAdmissionDigest: 'b'.repeat(64),
  attestorVerifierTrustSetDigest: 'c'.repeat(64),
  graphConfigAccount: '11111111111111111111111111111111',
  graphConfigAccountDataSha256: 'd'.repeat(64),
};

function fixtureFor(kind, authority) {
  const fixture = dynamicStockV2Fixture(kind === 'sell' ? 'nvidia' : 'tesla', OPERATION_ID);
  if (kind === 'amount') {
    delete fixture.input.shareQuantity;
    delete fixture.input.maximumSpendAtomic;
    fixture.input.amountAtomic = fixture.prepared.business.amountAtomic;
    const preview = fixture.prepared.preview;
    preview.requestAmountKind = 'input';
    for (const key of [
      'requestedShareQuantity', 'expectedShareQuantity', 'minimumShareQuantity',
      'requestedMaximumSpendAtomic', 'shareQuantityUnit',
      'shareQuantitySemantics', 'shareQuantityConversion',
    ]) preview[key] = null;
    preview.overfillPossible = false;
  }
  if (authority === 'category') {
    for (const body of [fixture.prepared, fixture.execute]) {
      const { ruleId, riskPolicyDigest, ...grant } = body.attribution.grant;
      body.attribution.grant = { ...grant, ...category, expiresAt: null };
    }
    for (const body of [fixture.status, fixture.reconcile.statusAfter, ...fixture.history.items]) {
      body.grantRuleId = null;
      body.authorityIdentity = { ...category };
    }
    const { digest, ...identity } = fixture.reconcile;
    fixture.reconcile.digest = canonicalHash(identity);
  }
  return fixture;
}

async function dispatch(t, operation, input, body, { bypassBackendValidation = false, httpStatus } = {}) {
  const name = GOVERNED_ASSET_TOOL_NAMES[operation];
  const server = new McpServer({ name: 'governed-success-regression', version: '1.0.0' });
  installOpenToolContracts(server);
  let calls = 0;
  const registered = server.registerTool(name, { inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation] }, async (args) => {
    calls += 1;
    const result = bypassBackendValidation
      ? { body, isError: false }
      : normalizeGovernedAssetResult({
          operation,
          input: args,
          httpStatus: httpStatus ?? (operation === 'reconcile' && body.outcome === 'pending' ? 202 : 200),
          body,
        });
    return buildGovernedAssetToolResult(result);
  });
  for (const other of OPEN_TOOL_NAMES.filter((tool) => tool !== name)) {
    server.registerTool(other, { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: '{}' }] }));
  }
  finalizeOpenToolContracts(server);
  assert.equal(registered.outputSchema, OPEN_TOOL_CONTRACTS[name].registrationOutputSchema);
  assert.equal(normalizeObjectSchema(registered.outputSchema), registered.outputSchema);
  assert.equal(registered.governedOutputSchema, GOVERNED_PRESENTED_OUTPUT_SCHEMAS[operation]);
  const client = new Client({ name: 'governed-success-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = (await client.listTools()).tools.find((tool) => tool.name === name);
  assert.equal(listed.outputSchema.type, 'object');
  assert.equal(listed.outputSchema.anyOf.length, 2);
  const [successSchema, errorSchema] = listed.outputSchema.anyOf;
  assert.ok(successSchema.required.includes('presentation'));
  assert.deepEqual(errorSchema.required, ['presentation']);
  assert.deepEqual(Object.keys(errorSchema.properties), ['presentation']);
  assert.equal(errorSchema.additionalProperties, false);
  const result = await client.callTool({ name, arguments: input });
  if (result.structuredContent !== undefined) {
    const validate = new AjvJsonSchemaValidator().getValidator(listed.outputSchema);
    const validation = validate(result.structuredContent);
    assert.equal(validation.valid, true, validation.errorMessage);
  }
  return { result, calls, listed, registered };
}

for (const authority of ['legacy', 'category']) {
  for (const kind of ['amount', 'quantity', 'sell']) {
    test('real SDK returns successful ' + kind + ' Prepare with ' + authority + ' authority', async (t) => {
      const fixture = fixtureFor(kind, authority);
      const { result, calls } = await dispatch(t, 'prepare', fixture.input, fixture.prepared);
      assert.equal(calls, 1);
      assert.equal(result.isError, false, JSON.stringify(result.content));
      assertPresentedDetail(result, fixture.prepared);
      assert.equal(result._meta['dexter/toolInvocation'].toolName, GOVERNED_ASSET_TOOL_NAMES.prepare);
    });
  }
  for (const operation of ['execute', 'status', 'reconcile', 'history']) {
    test('real SDK retains successful ' + operation + ' with ' + authority + ' authority', async (t) => {
      const fixture = fixtureFor('quantity', authority);
      const input = operation === 'execute'
        ? { operationId: OPERATION_ID, intentId: fixture.prepared.intentId }
        : operation === 'history' ? { limit: 25 } : { intentId: fixture.prepared.intentId };
      const { result, calls } = await dispatch(t, operation, input, fixture[operation]);
      assert.equal(calls, 1);
      assert.equal(result.isError, false, JSON.stringify(result.content));
      assertPresentedDetail(result, fixture[operation]);
    });
  }
}

test('Prepare registers a plain strict object while retaining full runtime refinements', () => {
  const contract = OPEN_TOOL_CONTRACTS.dexter_prepare_asset_action;
  assert.equal(contract.outputSchema, GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare);
  assert.equal(normalizeObjectSchema(contract.registrationOutputSchema), contract.registrationOutputSchema);
  const fixture = fixtureFor('amount', 'category');
  const presented = buildGovernedAssetToolResult({ body: fixture.prepared, isError: false }).structuredContent;
  delete presented.stockRuntime;
  assert.equal(contract.registrationOutputSchema.safeParse(presented).success, true);
  assert.equal(contract.outputSchema.safeParse(presented).success, false);
  assert.equal(GOVERNED_PRESENTED_SUCCESS_SCHEMAS.prepare.safeParse(presented).success, false);
  const { presentation, ...detail } = presented;
  assert.equal(GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(detail).success, false);
});

for (const [name, mutate] of [
  ['missing stock runtime', body => { delete body.stockRuntime; }],
  ['different stock asset', body => { body.business.assetId = 'another-stock'; }],
  ['wrong token direction', body => { body.preview.outputMint = body.preview.inputMint; }],
  ['extra top-level field', body => { body.unapprovedField = true; }],
]) {
  test('real SDK refuses ' + name + ' even when a handler skips backend normalization', async (t) => {
    const fixture = fixtureFor('amount', 'category');
    mutate(fixture.prepared);
    const { result, calls } = await dispatch(t, 'prepare', fixture.input, fixture.prepared, { bypassBackendValidation: true });
    assert.equal(calls, 1);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.doesNotMatch(JSON.stringify(result.content), /_zod/);
  });
}

test('real SDK rejects invalid Prepare input before calling the backend', async (t) => {
  const fixture = fixtureFor('amount', 'category');
  const { result, calls } = await dispatch(t, 'prepare', { ...fixture.input, shareQuantity: '1' }, fixture.prepared);
  assert.equal(calls, 0);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.doesNotMatch(JSON.stringify(result.content), /_zod/);
});

for (const operation of ['status', 'reconcile', 'history']) {
  test('real SDK returns a declared ordinary failure for ' + operation, async (t) => {
    const fixture = fixtureFor('quantity', 'category');
    const intentId = operation === 'history' ? null : fixture.prepared.intentId;
    const input = intentId === null ? { limit: 25 } : { intentId };
    const { result, calls } = await dispatch(t, operation, input, { unexpected: true }, { httpStatus: 502 });
    assert.equal(calls, 1);
    const expected = {
      namespace: 'opendexter-governed-backend-failure/v1',
      operation,
      status: operation === 'reconcile' ? 'unknown' : 'unavailable',
      operationId: null,
      intentId,
      code: 'governed_backend_response_invalid',
      explanation: operation === 'reconcile'
        ? 'Dexter returned an invalid reconciliation response. Do not retry automatically; inspect the same intent.'
        : 'Dexter returned a response that did not match the governed contract.',
      retry: operation === 'reconcile' ? 'manual_same_intent_only' : 'read_again',
    };
    assertPresentedError(result, expected);
    const presentation = result.structuredContent.presentation;
    assert.equal(presentation.intentId, intentId);
    assert.equal(presentation.operationId, null);
    if (intentId === null) {
      assert.equal(presentation.nextActions[0].action, 'read_again');
      assert.equal(presentation.nextActions[0].operationId, null);
    } else {
      assert.equal(presentation.nextActions[0].tool, 'dexter_asset_action_status');
      assert.deepEqual(presentation.nextActions[0].arguments, { intentId });
    }
  });
}

test('real SDK preserves a valid History page returned with HTTP500 as a declared error', async (t) => {
  const fixture = fixtureFor('quantity', 'category');
  const original = structuredClone(fixture.history);
  assert.equal(original.nextCursor, null);
  const { result, calls } = await dispatch(t, 'history', { limit: 25 }, fixture.history, { httpStatus: 500 });
  assert.equal(calls, 1);
  assertPresentedError(result, original);
  assert.deepEqual(result.structuredContent.presentation.items,
    original.items.map((item) => JSON.parse(JSON.stringify(presentGovernedAgentResult(item)))));
  assert.equal(result.structuredContent.presentation.nextCursor, null);
  assert.equal(result.structuredContent.presentation.items.length, original.items.length);
});

const BACKPACK_POLICY_DIGEST = 'cfc50c0ac6c17db0dd8b8d471055a0d9dc8691c23d01b4e380aed1beb7be4a47';
const APPROVAL_REQUEST_ID = `vspr_${'a'.repeat(36)}`;
const APPROVAL_URL = `https://dexter.cash/tabs/setup?request_id=${APPROVAL_REQUEST_ID}`;

function eligibilityRefusal(approvalUrl) {
  const fixture = fixtureFor('amount', 'category');
  fixture.input.companyQuery = 'SpaceX';
  const code = 'stock_principal_eligibility_required';
  return {
    input: fixture.input,
    body: {
      namespace: 'dexter-governed-agent-action/v1', status: 'refused', executed: false,
      requestId: OPERATION_ID, attribution: null,
      business: { ...fixture.prepared.business, assetId: null, requestedCompanyQuery: 'SpaceX',
        lifecycle: 'not-created', settlement: 'not-submitted', finality: 'not-final', executionSucceeded: null,
        refusalOrEscalationReasons: [code] },
      code, explanation: 'Eligibility acknowledgment required.', retryable: false,
      permissionRequest: { namespace: 'dexter-stock-permission-request/v1', family: 'stocks',
        requestId: APPROVAL_REQUEST_ID, approvalUrl, expiresAt: '2026-09-15T04:30:00.000Z' },
    },
  };
}

for (const [name, url] of [
  ['original default policy', APPROVAL_URL],
  ['exact Backpack policy', `${APPROVAL_URL}&policy_digest=${BACKPACK_POLICY_DIGEST}`],
]) {
  test('real SDK preserves an eligibility refusal with ' + name, async (t) => {
    const { input, body } = eligibilityRefusal(url);
    const { result, calls } = await dispatch(t, 'prepare', input, body, { httpStatus: 422 });
    assert.equal(calls, 1);
    assert.equal(result.isError, true);
    assertPresentedError(result, body);
    const publicBody = JSON.parse(result.content[0].text);
    assert.equal(publicBody.code, body.code);
    assert.equal(publicBody.operationId, OPERATION_ID);
    assert.equal(publicBody.status, 'refused');
    assert.deepEqual(result._meta['dexter/governedWidgetResult'], body);
    assert.equal(publicBody.nextActions[0].url, url);
    assert.equal(publicBody.nextActions[0].expiresAt, body.permissionRequest.expiresAt);
    assert.equal(publicBody.nextActions.some(step => step.tool === 'dexter_execute_asset_action'), false);
    assert.match(result.content[0].text, /https:\/\/dexter.cash\/tabs\/setup/);
    assert.equal(Object.hasOwn(publicBody, 'eligibilityPolicyDigest'), false);
  });
}

for (const [name, url] of [
  ['zero policy', `${APPROVAL_URL}&policy_digest=${'0'.repeat(64)}`],
  ['short policy', `${APPROVAL_URL}&policy_digest=abc`],
  ['uppercase policy', `${APPROVAL_URL}&policy_digest=${BACKPACK_POLICY_DIGEST.toUpperCase()}`],
  ['empty policy', `${APPROVAL_URL}&policy_digest=`],
  ['duplicate policy', `${APPROVAL_URL}&policy_digest=${BACKPACK_POLICY_DIGEST}&policy_digest=${BACKPACK_POLICY_DIGEST}`],
  ['duplicate request', `${APPROVAL_URL}&request_id=${APPROVAL_REQUEST_ID}`],
  ['unknown query key', `${APPROVAL_URL}&policy_digest=${BACKPACK_POLICY_DIGEST}&extra=1`],
  ['encoded policy key', `${APPROVAL_URL}&%70olicy_digest=${BACKPACK_POLICY_DIGEST}`],
  ['different request', APPROVAL_URL.replace(APPROVAL_REQUEST_ID, `vspr_${'b'.repeat(36)}`)],
  ['different origin', APPROVAL_URL.replace('dexter.cash', 'evil.example')],
  ['different path', APPROVAL_URL.replace('/tabs/setup', '/tabs/other')],
  ['URL credentials', APPROVAL_URL.replace('https://', 'https://user@')],
  ['fragment', `${APPROVAL_URL}#policy`],
]) {
  test('real SDK refuses an approval link with ' + name, async (t) => {
    const { input, body } = eligibilityRefusal(url);
    const { result, calls } = await dispatch(t, 'prepare', input, body, { httpStatus: 422 });
    assert.equal(calls, 1);
    assert.equal(result.isError, true);
    assertPresentedError(result, result._meta['dexter/governedWidgetResult']);
    const publicBody = JSON.parse(result.content[0].text);
    assert.equal(publicBody.code, 'governed_backend_response_invalid');
    assert.equal(Object.hasOwn(publicBody, 'permissionRequest'), false);
  });
}
