import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { OPEN_TOOL_CONTRACTS, OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { projectIndexterInputContractEndpoint } from '../lib/indexter-tool-result.mjs';
import { indexterTabAdvertisementLabel, projectIndexterPaymentSchemes } from '../lib/indexter-payment-schemes.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/indexter-featured/${name}`, import.meta.url)));
const observed = fixture('massive-deferred-native.json');
const retainedOverview = fixture('overview-20261029.json');
const id = observed.overviewEndpoint.resourceId;
const deferred = retainedOverview.featuredOfferings.find(row => row.resourceId === id);
const detail = fixture('massive-contract-20261029.json');
const retainedEndpoint = deferred;
const overviewFixture = () => structuredClone(retainedOverview);

function taskPayload(row) {
  return { ok: true, query: 'crypto market data', rankingMode: 'full',
    intent: { capabilityText: 'crypto market data' },
    appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: null, paidOnly: false },
    appliedOrdering: { sortBy: 'relevance' }, strongResults: [row], relatedResults: [],
    strongCount: 1, relatedCount: 0, topSimilarity: 0.8, noMatchReason: null,
    rerank: { enabled: false, applied: false } };
}

// The producer captures are service returns. These are the unchanged HTTP
// envelopes in API x402gleCapability.ts and indexterDiscovery.ts; no catalog
// fields or execution decisions are reconstructed here.
const capabilityHttpPayload = response => ({ ok: true, ...response });
const contractHttpPayload = (endpoint, generatedAt) => ({
  ok: true, generatedAt, ...endpoint,
  inputContract: {
    status: endpoint.inputContract.status === 'inline' ? 'available' : 'not_published',
    complete: true,
  },
});

const compiled = await build({ stdin: { contents: `
  export { isIndexterDiscoveryPayload, isIndexterInputContractPayload, buildInputContractFollowUp } from './apps-sdk/ui/src/components/indexter/discovery/discovery-model.ts';
  export { isSafeSearchPayload, normalizeSearchPayload } from './apps-sdk/ui/src/components/indexter/search/search-model.ts';
`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const ui = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

async function connected(t, respond) {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.ok(['/api/x402gle/indexter/discovery', '/api/x402gle/indexter/input-contract', '/api/x402gle/capability'].includes(url.pathname));
    requests.push(url); return Response.json(respond(url));
  };
  const server = createOpenMcpServer({ includeResources: false, listedToolNames: () => OPEN_TOOL_NAMES });
  const client = new Client({ name: 'discovery-consistency', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); globalThis.fetch = previous; });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, requests };
}

test('retained Massive native outputs demonstrate a recoverable contract, not a missing seller', () => {
  for (const record of observed.provenance.producerSources) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`./fixtures/indexter-featured/${record.file}`, import.meta.url))).digest('hex'), record.sha256);
  }
  assert.equal(observed.overviewEndpoint.action.reason, 'input_contract_unavailable');
  assert.equal(observed.overviewEndpoint.inputContract.status, 'details_required');
  assert.equal(observed.detail.contract.action.kind, 'review_endpoint');
  assert.equal(observed.detail.contract.inputContract.complete, true);
  assert.equal(Object.keys(observed.detail.publishedContract.inputSchema.properties).length, 26);
});

test('registered overview and detail handlers preserve the exact catalog continuation through model, text, and widget', async t => {
  const { client, requests } = await connected(t, url => url.pathname.endsWith('/input-contract') ? detail : overviewFixture());
  const overview = await client.callTool({ name: 'indexter_search', arguments: { query: 'featured providers' } });
  assert.equal(overview.isError, undefined, JSON.stringify(overview.structuredContent));
  const row = overview.structuredContent.results.find(value => value.resourceId === id);
  assert.deepEqual(row.action, { kind: 'read_input_contract', label: 'View inputs', state: 'details_required', resourceId: id, resourceUrl: detail.resourceUrl });
  assert.equal(row.requestInput, null);
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(overview.structuredContent).success, true);
  assert.match(overview.content[0].text, /kind: read_input_contract/);
  const app = overview._meta.indexterPayload.data;
  assert.equal(ui.isIndexterDiscoveryPayload(app), true);
  const appRow = app.featuredOfferings.find(value => value.resourceId === id);
  assert.equal(appRow.access.checkable, false);
  assert.equal(appRow.action.kind, 'read_input_contract');
  const prompt = ui.buildInputContractFollowUp(appRow);
  assert.ok(prompt.includes(JSON.stringify({ contractResourceId: id, contractMethod: 'GET' })));
  assert.match(prompt, /catalog details only/);
  const loaded = await client.callTool({ name: 'indexter_search', arguments: { contractResourceId: id, contractMethod: 'GET' } });
  assert.equal(loaded.isError, undefined);
  assert.equal(loaded.structuredContent.contract.action.kind, 'review_endpoint');
  assert.equal(ui.isIndexterInputContractPayload(loaded.structuredContent), true);
  assert.deepEqual(loaded.structuredContent.publishedContract, observed.detail.publishedContract);
  assert.match(loaded.content[0].text, /"filing_date.gte"/);
  assert.deepEqual(requests.map(url => url.pathname), ['/api/x402gle/indexter/discovery', '/api/x402gle/indexter/input-contract']);
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) {
    for (const [name, result] of Object.entries({ overview, detail: loaded })) {
      writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/${name}-registered.json`, JSON.stringify(result, null, 2));
    }
  }
});

test('app-visible discover uses the same catalog-only action', async t => {
  const { client } = await connected(t, overviewFixture);
  const result = await client.callTool({ name: 'indexter_discover', arguments: { limit: 4 } });
  assert.equal(result.isError, false);
  assert.equal(ui.isIndexterDiscoveryPayload(result.structuredContent), true);
  const row = result.structuredContent.featuredOfferings.find(value => value.resourceId === id);
  assert.equal(row.action.kind, 'read_input_contract');
  assert.equal(row.access.checkable, false);
});

test('model search output rejects an absent or mismatched catalog continuation', async t => {
  const { client } = await connected(t, overviewFixture);
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'featured providers' } });
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
  for (const change of [
    row => { delete row.inputContract.detail; },
    row => { row.inputContract.detail.resourceId = '77777777-7777-4777-8777-777777777777'; },
    row => { row.inputContract.detail.method = 'POST'; },
  ]) {
    const invalid = structuredClone(result.structuredContent);
    change(invalid.results.find(row => row.resourceId === id));
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(invalid).success, false);
  }
});

test('contract continuation requires matching identity and cannot grant Check or suppress a current failure', async t => {
  const { client } = await connected(t, overviewFixture);
  const result = await client.callTool({ name: 'indexter_discover', arguments: { limit: 4 } });
  const validPayload = result.structuredContent;
  const valid = validPayload.featuredOfferings.find(value => value.resourceId === id);
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_discover.outputSchema.safeParse(validPayload).success, true);
  for (const change of [
    value => { value.inputContract.detail.resourceId = '77777777-7777-4777-8777-777777777777'; },
    value => { value.inputContract.detail.method = 'POST'; },
    value => { delete value.inputContract.detail; },
    value => { value.inputContract.reason = 'unsafe_contract'; },
    value => { value.requestInput = { version: 1, fields: [] }; },
    value => { value.access.checkable = true; },
  ]) {
    const row = structuredClone(valid); change(row);
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_discover.outputSchema.safeParse({
      ...validPayload, featuredOfferings: [{ ...row, provider: retainedEndpoint.provider }],
    }).success, false);
    assert.equal(ui.buildInputContractFollowUp(row), null);
  }
  for (const reason of ['not_found', 'auth_gated', 'merchant_down']) {
    const row = projectIndexterInputContractEndpoint({ ...deferred,
      execution: { ...deferred.execution, availability: 'catalog_only', unavailableReason: reason } });
    assert.equal(row.action.kind, 'endpoint_unavailable');
    assert.equal(row.action.reason, reason);
  }
  const missingSafety = { ...deferred }; delete missingSafety.execution;
  assert.equal(projectIndexterInputContractEndpoint(missingSafety).action.reason, 'safety_unavailable');
});

test('registered task results preserve a supplied canonical merchant across structured, text and widget output', async t => {
  const row = fixture('task-endpoint.json');
  const identity = retainedOverview.providers.find(provider => provider.providerKey === 'arkm.com');
  Object.assign(row, {
    resourceId: observed.taskIdentities[0].resourceId,
    resourceUrl: 'https://api.arkm.com/x402/token/market/by-id',
    displayName: observed.taskIdentities[0].name,
    merchant: { providerKey: identity.providerKey, providerSlug: identity.providerSlug,
      displayName: identity.displayName, logoUrl: identity.logoUrl, technicalHost: identity.technicalHost },
  });
  const payload = taskPayload(row);
  const { client } = await connected(t, () => payload);
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'crypto market data', rerank: false } });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.deepEqual(result.structuredContent.results[0].merchant, { kind: 'provider', providerKey: 'arkm.com', name: 'Arkham API', logoUrl: identity.logoUrl });
  assert.match(result.content[0].text, /Provider: Arkham API\./);
  assert.doesNotMatch(result.content[0].text, /Provider: api\.arkm\.com\./);
  assert.equal(ui.isSafeSearchPayload(result._meta.indexterPayload.data), true);
  assert.equal(ui.normalizeSearchPayload(result._meta.indexterPayload.data).strongResults[0].merchant.displayName, 'Arkham API');
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/brand-registered.json`, JSON.stringify(result, null, 2));
});

test('advertised schemes survive task search without changing request or payment eligibility', async t => {
  const row = fixture('task-endpoint.json');
  row.merchant.displayName = 'Catalog test provider';
  const { client } = await connected(t, () => taskPayload(row));
  let action;
  for (const schemes of [['exact', 'tab', 'future_scheme'], ['exact'], [], ['TAB'], ['exact', 'exact']]) {
    row.pricing.chains = schemes.map(scheme => ({ ...row.pricing.chains[0], scheme }));
    const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'crypto market data', rerank: false } });
    assert.equal(result.isError, undefined);
    const model = result.structuredContent.results[0];
    const expected = projectIndexterPaymentSchemes(schemes);
    assert.deepEqual(model.paymentSchemes, expected);
    assert.equal(result.content[0].text.includes('Tabs advertised.'), schemes.includes('tab'));
    if (action) assert.deepEqual(model.action, action);
    action = model.action;
    const app = result._meta.indexterPayload.data;
    assert.equal(ui.isSafeSearchPayload(app), true);
    assert.deepEqual(app.strongResults[0].paymentSchemes, expected);
    assert.equal(indexterTabAdvertisementLabel(app.strongResults[0].paymentSchemes), schemes.includes('tab') ? 'Tabs advertised' : null);
    if (schemes.includes('tab') && process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) {
      writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/tabs-task-synthetic-registered.json`, JSON.stringify(result, null, 2));
    }
  }
});

test('overview and contract details retain advertised schemes without enabling a deferred endpoint', async t => {
  // Synthetic scheme controls on the captured catalog response; no claim that
  // this Massive endpoint currently advertises Tabs.
  const payload = overviewFixture();
  const offering = payload.featuredOfferings.find(row => row.resourceId === id);
  offering.paymentSchemes = ['exact', 'tab'];
  const complete = { ...detail, paymentSchemes: ['exact', 'tab'] };
  const { client } = await connected(t, url => url.pathname.endsWith('/input-contract') ? complete : payload);
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'featured providers' } });
  const row = result.structuredContent.results.find(value => value.resourceId === id);
  assert.deepEqual(row.paymentSchemes, ['exact', 'tab']);
  assert.equal(row.action.kind, 'read_input_contract');
  assert.match(result.content[0].text, /Tabs advertised\./);
  const app = result._meta.indexterPayload.data;
  assert.equal(ui.isIndexterDiscoveryPayload(app), true);
  assert.equal(app.featuredOfferings.find(value => value.resourceId === id).access.checkable, false);
  const loaded = await client.callTool({ name: 'indexter_search', arguments: { contractResourceId: id, contractMethod: 'GET' } });
  assert.equal(ui.isIndexterInputContractPayload(loaded.structuredContent), true);
  assert.deepEqual(loaded.structuredContent.contract.paymentSchemes, ['exact', 'tab']);
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) {
    writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/tabs-overview-synthetic-registered.json`, JSON.stringify(result, null, 2));
    writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/tabs-detail-synthetic-registered.json`, JSON.stringify(loaded, null, 2));
  }
});

test('saved catalog identities through the API producer retain four canonical brands in registered task output', async t => {
  const captured = fixture('task-four-brands-20261029.json');
  assert.match(captured.composition, /Production capabilitySearch/);
  const { client } = await connected(t, () => capabilityHttpPayload(captured.response));
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: captured.response.query, rerank: false } });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
  const expected = ['Arkham API', 'Allium', 'Alchemy', 'CoinMarketCap'];
  assert.deepEqual(result.structuredContent.results.map(row => row.merchant.name), expected);
  assert.deepEqual(result.structuredContent.results.map(row => row.resourceId), captured.response.strongResults.map(row => row.resourceId));
  assert.equal(ui.isSafeSearchPayload(result._meta.indexterPayload.data), true);
  assert.deepEqual(ui.normalizeSearchPayload(result._meta.indexterPayload.data).strongResults.map(row => row.merchant.displayName), expected);
  for (const name of expected) assert.ok(result.content[0].text.includes(`Provider: ${name}.`));
  assert.doesNotMatch(result.content[0].text, /Tabs advertised/);
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/four-brands-producer-registered.json`, JSON.stringify(result, null, 2));
});

test('actual task producer preserves its synthetic advertised schemes through the registered formatter', async t => {
  const captured = fixture('task-scheme-control-20261029.json');
  assert.match(captured.composition, /synthetic/);
  const { client } = await connected(t, () => capabilityHttpPayload(captured.response));
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: captured.response.query, rerank: false } });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  assert.deepEqual(result.structuredContent.results[0].paymentSchemes, ['exact', 'tab', 'future_scheme']);
  assert.match(result.content[0].text, /Tabs advertised\. Current terms and permissions determine payment eligibility\./);
  assert.equal(ui.isSafeSearchPayload(result._meta.indexterPayload.data), true);
  assert.deepEqual(result._meta.indexterPayload.data.strongResults[0].paymentSchemes, ['exact', 'tab', 'future_scheme']);
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/task-scheme-producer-registered.json`, JSON.stringify(result, null, 2));
});

test('actual overview and detail producers preserve synthetic advertised schemes and the exact read path', async t => {
  const captured = fixture('overview-detail-scheme-control-20261029.json');
  assert.match(captured.composition, /synthetic/);
  const { client, requests } = await connected(t, url => url.pathname.endsWith('/input-contract')
    ? contractHttpPayload(captured.detail, captured.overview.generatedAt) : captured.overview);
  const result = await client.callTool({ name: 'indexter_search', arguments: { query: 'featured providers' } });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  assert.equal(ui.isIndexterDiscoveryPayload(result._meta.indexterPayload.data), true);
  for (const original of captured.overview.featuredOfferings.filter(row => row.kind === 'endpoint')) {
    const row = result.structuredContent.results.find(value => value.resourceId === original.resourceId);
    assert.deepEqual(row.paymentSchemes, original.paymentSchemes);
  }
  const loaded = await client.callTool({ name: 'indexter_search', arguments: { contractResourceId: captured.detail.resourceId, contractMethod: captured.detail.method } });
  assert.equal(loaded.isError, undefined, JSON.stringify(loaded.structuredContent));
  assert.equal(ui.isIndexterInputContractPayload(loaded.structuredContent), true);
  assert.deepEqual(loaded.structuredContent.contract.paymentSchemes, captured.detail.paymentSchemes);
  assert.deepEqual(requests.map(url => url.pathname), ['/api/x402gle/indexter/discovery', '/api/x402gle/indexter/input-contract']);
  if (process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR) {
    writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/overview-scheme-producer-registered.json`, JSON.stringify(result, null, 2));
    writeFileSync(`${process.env.INDEXTER_CONSISTENCY_ARTIFACT_DIR}/detail-scheme-producer-registered.json`, JSON.stringify(loaded, null, 2));
  }
});
