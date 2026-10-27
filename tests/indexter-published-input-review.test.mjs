import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { openX402CheckSchema } from '../lib/native-mcp-contract.mjs';
import { buildIndexterInputContractResult, projectIndexterInputContractEndpoint } from '../lib/indexter-tool-result.mjs';

const fixtureUrl = new URL('./fixtures/indexter-featured/nansen-input-contract.json', import.meta.url);
const nansen = JSON.parse(readFileSync(fixtureUrl));
const taskTemplate = JSON.parse(readFileSync(new URL('./fixtures/indexter-current-availability/purch-task-pass.json', import.meta.url)));
const compiled = await build({ stdin: { contents: `
  export { isIndexterInputContractPayload, buildInputContractFollowUp } from './apps-sdk/ui/src/components/indexter/discovery/discovery-model.ts';
  export { isSafeSearchPayload, normalizeSearchPayload } from './apps-sdk/ui/src/components/indexter/search/search-model.ts';
  export { getSearchResourceAction, buildDetailsFollowUpPrompt } from './apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts';
`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const ui = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

function taskFixture() {
  // Compose the captured Nansen contract through the existing task producer shape.
  // Ranking/usage values are fixture controls, not a new Nansen catalog observation.
  const payload = structuredClone(taskTemplate);
  payload.ok = true;
  payload.query = 'Nansen prediction market categories';
  payload.intent.capabilityText = payload.query;
  const row = payload.strongResults[0];
  Object.assign(row, {
    resourceId: nansen.resourceId, resourceUrl: nansen.resourceUrl, method: nansen.method,
    access: nansen.access, execution: nansen.execution, inputSchema: nansen.inputSchema,
    pathParams: nansen.pathParams, schemaSource: nansen.schemaSource,
    displayName: nansen.displayName, description: nansen.description, host: 'api.nansen.ai',
    merchant: { providerKey: 'api.nansen.ai', displayName: 'Nansen', logoUrl: null },
    verification: { status: 'unverified', paid: false, paidQualityTestPassed: false,
      trustBasis: 'none', trustLabel: nansen.evidence.label,
      evidenceState: nansen.evidence.state, evidenceLabel: nansen.evidence.label,
      evidenceAt: null, qualityScore: null, lastVerifiedAt: null, responseStatus: null },
  });
  delete row.editorial;
  return payload;
}

async function connected(t, respond) {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.ok(['/api/x402gle/capability', '/api/x402gle/indexter/input-contract'].includes(url.pathname));
    requests.push(url); return Response.json(respond(url));
  };
  const server = createOpenMcpServer({ includeResources: false, listedToolNames: () => OPEN_TOOL_NAMES });
  const client = new Client({ name: 'published-nansen-contract', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); globalThis.fetch = previous; });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, requests };
}

test('captured Nansen catalog contract retains its observed bytes and optional nested definition', () => {
  assert.equal(createHash('sha256').update(readFileSync(fixtureUrl)).digest('hex'), 'c04733c6ed6e7f894cfed3151549846e38de82b395147fe55bbb8407e44eec77');
  assert.deepEqual(nansen.inputSchema, { type: 'object', properties: { pagination: { type: 'object' } } });
});

test('task search offers catalog details instead of declaring the Nansen seller unavailable', async t => {
  const { client, requests } = await connected(t, () => taskFixture());
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'Nansen prediction market categories', rerank: false } });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const row = result.structuredContent.results.find(value => value.resourceId === nansen.resourceId);
  assert.ok(row, JSON.stringify(result.structuredContent));
  assert.equal(row.requestInput, null);
  assert.equal(row.action.kind, 'review_endpoint');
  assert.equal(row.action.safety.publishedInputPresent, true);
  assert.equal(row.action.safety.checkMayAffectProvider, true);
  assert.deepEqual(row.inputContract, { status: 'details_required', complete: false,
    reason: 'input_format_unsupported', detail: { resourceId: nansen.resourceId, method: 'POST' } });
  assert.match(result.content[0].text, /contractResourceId/);
  assert.doesNotMatch(result.content[0].text, /kind: endpoint_unavailable/);
  const app = result._meta.indexterPayload.data;
  assert.equal(ui.isSafeSearchPayload(app), true);
  const normalized = ui.normalizeSearchPayload(app).strongResults[0];
  assert.equal(normalized.access.checkable, true);
  assert.deepEqual(ui.getSearchResourceAction(normalized), { kind: 'provide_details', label: 'View inputs',
    helperText: 'Read the complete published schema to construct this request in chat.', disabled: false });
  const prompt = ui.buildDetailsFollowUpPrompt(normalized, { kind: 'indexter_result_continuation_v2',
    searchResultSetId: '11111111-1111-4111-8111-111111111111', searchResultOrdinal: 1 });
  assert.match(prompt, /contractResourceId/);
  assert.match(prompt, /opens published input details only/);
  assert.doesNotMatch(prompt, /Ask me to refresh|contract is unavailable/);
  assert.equal(requests.length, 1);
  if (process.env.INDEXTER_PUBLISHED_INPUT_ARTIFACT_DIR) writeFileSync(`${process.env.INDEXTER_PUBLISHED_INPUT_ARTIFACT_DIR}/nansen-task-result.json`, JSON.stringify(result, null, 2));
});

test('complete Nansen detail supports exact JSON request construction through the existing Check schema', async t => {
  const { client, requests } = await connected(t, () => nansen);
  const result = await client.callTool({ name: 'indexter_search', arguments: { contractResourceId: nansen.resourceId, contractMethod: 'POST' } });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const data = result.structuredContent;
  assert.equal(ui.isIndexterInputContractPayload(data), true);
  assert.deepEqual(data.publishedContract, { inputSchema: nansen.inputSchema, pathParams: null });
  assert.equal(data.contract.requestInput, null);
  assert.equal(data.contract.action.kind, 'review_endpoint');
  assert.equal(data.contract.access.checkable, true);
  assert.equal(data.contract.inputContract.reason, 'input_format_unsupported');
  assert.equal(data.contract.action.review.authorizationBasis, 'current_task_and_active_permissions');
  assert.match(result.content[0].text, /Once its inputs and effects are covered by the current task and permissions, call x402_check/);
  assert.match(result.content[0].text, /"pagination":\{"type":"object"\}/);
  for (const body of ['{}', '{"pagination":{"page":1}}']) {
    const parsed = openX402CheckSchema.parse({ url: nansen.resourceUrl, method: 'POST', body });
    assert.equal(parsed.body, body);
    assert.equal(parsed.url, nansen.resourceUrl);
  }
  assert.equal(openX402CheckSchema.safeParse({ url: nansen.resourceUrl, method: 'POST', body: {} }).success, false);
  assert.equal(requests.length, 1); // No seller Check or payment is executed by this proof.
  if (process.env.INDEXTER_PUBLISHED_INPUT_ARTIFACT_DIR) writeFileSync(`${process.env.INDEXTER_PUBLISHED_INPUT_ARTIFACT_DIR}/nansen-detail-result.json`, JSON.stringify(result, null, 2));
});

test('discovery keeps seller checkability and exact read-only continuation for unsupported forms', () => {
  const source = { ...nansen, inputContract: { status: 'inline', complete: true } };
  const row = projectIndexterInputContractEndpoint(source);
  assert.equal(row.access.checkable, true);
  assert.equal(row.action.kind, 'review_endpoint');
  assert.equal(row.requestInput, null);
  const prompt = ui.buildInputContractFollowUp(row);
  assert.match(prompt, /contractResourceId/);
  assert.match(prompt, /catalog details only/);
});

test('nested definitions survive while verified seller failures and unsupported transport limits remain separate', () => {
  const source = structuredClone(nansen);
  source.inputSchema.properties.filters = { type: 'array', items: { type: 'object', properties: { chain: { type: 'string' } }, required: ['chain'] } };
  const result = buildIndexterInputContractResult({ resourceId: source.resourceId, method: source.method, payload: source }).structuredContent;
  assert.equal(result.ok, true);
  assert.deepEqual(result.publishedContract.inputSchema, source.inputSchema);
  assert.equal(result.contract.requestInput, null);
  for (const reason of ['not_found', 'auth_gated', 'merchant_down']) {
    const failed = structuredClone(source);
    failed.access.checkable = false;
    failed.execution.availability = 'catalog_only'; failed.execution.unavailableReason = reason;
    const failure = buildIndexterInputContractResult({ resourceId: failed.resourceId, method: failed.method, payload: failed }).structuredContent;
    assert.equal(failure.ok, true);
    assert.equal(failure.contract.action.kind, 'endpoint_unavailable');
    assert.equal(failure.contract.action.reason, reason);
    assert.deepEqual(failure.publishedContract.inputSchema, source.inputSchema);
  }
  const path = { ...source, pathParams: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] };
  assert.equal(projectIndexterInputContractEndpoint(path).action.kind, 'endpoint_unavailable');
});
