import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {
  installOpenToolContracts,
  OPEN_TOOL_CONTRACTS,
} from '../lib/open-tool-contracts.mjs';
import {
  GOVERNED_ASSET_INPUT_SCHEMAS,
  GOVERNED_ASSET_TOOL_NAMES,
} from '../lib/governed-asset-contract.mjs';
import {
  buildGovernedAssetToolResult,
  GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

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

async function dispatch(t, operation, input, body, { bypassBackendValidation = false } = {}) {
  const name = GOVERNED_ASSET_TOOL_NAMES[operation];
  const server = new McpServer({ name: 'governed-success-regression', version: '1.0.0' });
  installOpenToolContracts(server);
  let calls = 0;
  server.registerTool(name, { inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation] }, async (args) => {
    calls += 1;
    const result = bypassBackendValidation
      ? { body, isError: false }
      : normalizeGovernedAssetResult({
          operation,
          input: args,
          httpStatus: operation === 'reconcile' && body.outcome === 'pending' ? 202 : 200,
          body,
        });
    return buildGovernedAssetToolResult(result);
  });
  const client = new Client({ name: 'governed-success-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: input });
  return { result, calls };
}

for (const authority of ['legacy', 'category']) {
  for (const kind of ['amount', 'quantity', 'sell']) {
    test('real SDK returns successful ' + kind + ' Prepare with ' + authority + ' authority', async (t) => {
      const fixture = fixtureFor(kind, authority);
      const { result, calls } = await dispatch(t, 'prepare', fixture.input, fixture.prepared);
      assert.equal(calls, 1);
      assert.equal(result.isError, false, JSON.stringify(result.content));
      assert.deepEqual(result.structuredContent, fixture.prepared);
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
      assert.deepEqual(result.structuredContent, fixture[operation]);
    });
  }
}

test('Prepare registers a plain strict object while retaining full runtime refinements', () => {
  const contract = OPEN_TOOL_CONTRACTS.dexter_prepare_asset_action;
  assert.equal(contract.outputSchema, GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare);
  assert.equal(normalizeObjectSchema(contract.registrationOutputSchema), contract.registrationOutputSchema);
  const fixture = fixtureFor('amount', 'category');
  delete fixture.prepared.stockRuntime;
  assert.equal(contract.registrationOutputSchema.safeParse(fixture.prepared).success, true);
  assert.equal(contract.outputSchema.safeParse(fixture.prepared).success, false);
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
  assert.doesNotMatch(JSON.stringify(result.content), /_zod/);
});
