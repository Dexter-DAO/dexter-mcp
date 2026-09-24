import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyIndexterBodySchema, projectIndexterRequestInputV2 } from '../lib/indexter-request-input-v2.mjs';
import { parseIndexterRequestInputValidation } from '../lib/indexter-request-validation.mjs';
import { buildIndexterToolResult, projectIndexterDiscoveryEndpointActions } from '../lib/indexter-tool-result.mjs';
import { applyOpenToolResultPolicy, OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { isSafeSearchPayload } from '../apps-sdk/ui/src/components/indexter/search/search-model.ts';
import { indexterEndpointReference } from '../apps-sdk/ui/src/components/indexter/search/indexter-continuation.ts';
import { buildDetailsFollowUpPrompt } from '../apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts';

const bytes = readFileSync(new URL('./fixtures/indexter-request-input-v2.json', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f41e1e39743fef1e1c8571d2d38936181073345e1d398052949a48d67a994853');
const fixture = JSON.parse(bytes);
const resourceId = '00000000-0000-4000-8000-000000000042';
function endpoint(schema = fixture.schema) {
  const merchant = { providerKey: 'document-provider', providerSlug: 'document-provider', displayName: 'Document provider',
    logoUrl: null, technicalHost: 'document.example' };
  return { kind: 'endpoint', id: resourceId, resourceId, resourceUrl: null, url: null,
    name: 'Document reader', displayName: 'Document reader', method: 'POST',
    access: { kind: 'managed_resolvable', checkable: true, requiresFreshCheck: true },
    merchant, provider: { kind: 'provider', ...merchant }, description: 'Read a document.', category: 'data',
    execution: { sideEffectful: false, effect: null, automatedVerification: 'enabled', userExecution: 'allowed',
      confirmationRequired: false, availability: 'available', requiresExplicitInput: true, quoteMayCreateProviderReservation: false },
    inputSchema: schema, pathParams: null, iconUrl: null, docsUrl: null,
    price: { usdc: 0.01, label: '$0.01', network: 'eip155:8453' }, priceUsdc: 0.01,
    evidence: { state: 'terms_checked', label: 'Terms checked', observedAt: '2026-09-24T09:00:00.000Z' },
    qualityScore: 80, totalCalls: 0, verified: false, why: 'Reads document text.' };
}

test('MCP projection matches the API literal contract and accepts its bound proof bytes', () => {
  assert.equal(classifyIndexterBodySchema(fixture.schema), 'nested');
  assert.deepEqual(projectIndexterRequestInputV2(fixture.schema), fixture.expectedContract);
  for (const sample of fixture.valid) {
    assert.equal(createHash('sha256').update(fixture.contractPreimage).digest('hex'), sample.expectedProof.contractDigest);
    assert.equal(createHash('sha256').update(sample.bindingPreimage).digest('hex'), sample.expectedProof.bindingDigest);
    assert.deepEqual(parseIndexterRequestInputValidation(sample.expectedProof, {
      ...fixture.association, rawBody: sample.rawBody, rawBodyProvided: true,
    }), sample.expectedProof);
  }
});

test('current schema classification refuses nested downgrade and unsupported constraints', () => {
  assert.equal(classifyIndexterBodySchema(null), 'legacy');
  assert.equal(classifyIndexterBodySchema({ type: 'object', additionalProperties: false, properties: { city: { type: 'string' } } }), 'legacy');
  assert.equal(classifyIndexterBodySchema({ type: 'object', properties: { city: { type: 'string' } } }), 'unavailable');
  assert.equal(classifyIndexterBodySchema({ type: 'object', additionalProperties: false, properties: { options: { properties: {} } } }), 'nested');
  for (const prefixItems of [[], null, undefined, [{ type: 'object', properties: {} }]]) {
    const tuple = { type: 'object', additionalProperties: false, properties: { values: { type: 'array', items: { type: 'string' }, prefixItems } } };
    assert.equal(classifyIndexterBodySchema(tuple), 'unavailable');
    assert.equal(projectIndexterRequestInputV2(tuple), null);
  }
  for (const mutate of [
    (s) => { s.properties.options.additionalProperties = true; },
    (s) => { s.required = null; },
    (s) => { s.properties.options.required = null; },
    (s) => { s.properties.tags.minItems = null; },
    (s) => { s.properties.tags.maxItems = null; },
    (s) => { s.properties.options.properties.pages.minimum = 1; },
    (s) => { s.properties.options.properties.other = { $ref: '#/types/other' }; },
    (s) => { s.properties.options.properties.deep = { type: 'object', additionalProperties: false, properties: {} }; },
    (s) => { s.properties.options.properties.secret = { type: 'string' }; },
  ]) {
    const schema = structuredClone(fixture.schema); mutate(schema);
    assert.equal(projectIndexterRequestInputV2(schema), null);
  }
});

test('full task producer, governed result, UI parser and followup retain the nested contract', () => {
  const row = { ...endpoint(), price: '$0.01' };
  const payload = { success: true, count: 1, strongCount: 1, relatedCount: 0,
    strongResults: [row], relatedResults: [], searchMeta: { mode: 'direct', note: 'One document service' },
    searchResultSetId: '11111111-1111-4111-8111-111111111111' };
  const result = applyOpenToolResultPolicy('indexter_search', buildIndexterToolResult({ route: 'task', payload }));
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
  assert.equal(result.structuredContent.results.length, 1);
  assert.deepEqual(result.structuredContent.results[0].requestInput, fixture.expectedContract);
  assert.equal(result.structuredContent.results[0].action.kind, 'review_endpoint');
  const view = result._meta.indexterPayload.data;
  assert.equal(isSafeSearchPayload(view), true);
  const selected = view.strongResults[0];
  assert.deepEqual(selected.requestInput, fixture.expectedContract);
  const reference = indexterEndpointReference(selected);
  assert.ok(reference);
  const prompt = buildDetailsFollowUpPrompt(selected, reference);
  assert.match(prompt, /requestInputVersion:2/);
  assert.match(prompt, /explicitly supplied/);
  const projectedInput = prompt.match(/BEGIN_BOUNDED_REQUEST_INPUT\n(.*?)\nEND_BOUNDED_REQUEST_INPUT/s);
  assert.ok(projectedInput);
  assert.deepEqual(JSON.parse(projectedInput[1]), fixture.expectedContract);
});

test('discovery projection preserves v2 and refuses GET or unsupported nested shapes', () => {
  const project = (row) => projectIndexterDiscoveryEndpointActions({ featuredOfferings: [row] }).featuredOfferings[0];
  assert.deepEqual(project(endpoint()).requestInput, fixture.expectedContract);
  assert.equal(project({ ...endpoint(), method: 'GET' }).requestInput, null);
  const bad = endpoint(); bad.inputSchema = { ...fixture.schema, additionalProperties: true };
  assert.equal(project(bad).action.reason, 'input_contract_unavailable');
});

test('v2 declared selector policy preserves complete names and enums without a resource allowlist', () => {
  for (const name of ['render_system', 'codec7_system']) {
    const schema = structuredClone(fixture.schema);
    schema.properties.options.properties[name] = { type: 'string', enum: ['compact', 'detailed'] };
    const projected = projectIndexterRequestInputV2(schema);
    assert.ok(projected);
    const options = projected.fields.find(field => field.name === 'options');
    assert.deepEqual(options.fields.find(field => field.name === name), {
      name, location: 'body', type: 'string', required: false, enum: ['compact', 'detailed'],
    });
    schema.properties.options.required = [name];
    assert.equal(projectIndexterRequestInputV2(schema).fields.find(field => field.name === 'options')
      .fields.find(field => field.name === name).required, true);
    const output = projectIndexterDiscoveryEndpointActions({ featuredOfferings: [endpoint(schema)] }).featuredOfferings[0];
    assert.equal(output.action.kind, 'review_endpoint');
    assert.deepEqual(output.requestInput, projectIndexterRequestInputV2(schema));
  }
});

test('v2 selector exception rejects instruction names, free text, unsafe enums and legacy downgrade', () => {
  for (const name of ['system', 'system_prompt', 'system_instructions', 'developer_system', 'ignore_system',
    'override_system', 'prompt_system', 'apiKey_system', 'password_system', 'constructor_system',
    'prototype_system', 'system_system', 'safe_extra_system', 'safe_SYSTEM', 'assistant', '__proto__']) {
    const schema = structuredClone(fixture.schema);
    Object.defineProperty(schema.properties.options.properties, name, {
      value: { type: 'string', enum: ['compact', 'detailed'] }, enumerable: true, configurable: true,
    });
    assert.equal(projectIndexterRequestInputV2(schema), null);
  }
  for (const shape of [
    { type: 'string' }, { type: 'string', enum: null }, { type: 'string', enum: [] },
    { type: 'string', enum: ['compact', 'compact'] }, { type: 'string', enum: ['compact', 1] },
    { type: 'string', enum: ['system'] }, { type: 'string', enum: ['ignore_instructions'] },
    { type: 'string', enum: ['constructor'] }, { type: 'string', enum: ['apiKey'] },
    { type: 'string', enum: ['Bearer unsafe-secret'] }, { type: 'string', enum: ['é'] },
    { type: 'string', enum: ['a'.repeat(129)] }, { type: 'string', enum: ['compact'], unknown: true },
    { type: 'integer', enum: ['compact'] }, { type: 'array', items: { type: 'string' } },
    { type: 'object', properties: {}, additionalProperties: false },
  ]) {
    const schema = structuredClone(fixture.schema);
    schema.properties.options.properties.render_system = shape;
    assert.equal(projectIndexterRequestInputV2(schema), null);
    assert.equal(projectIndexterDiscoveryEndpointActions({ featuredOfferings: [endpoint(schema)] })
      .featuredOfferings[0].action.reason, 'input_contract_unavailable');
  }
  const flat = endpoint({ type: 'object', additionalProperties: false,
    properties: { render_system: { type: 'string', enum: ['compact', 'detailed'] } } });
  assert.equal(classifyIndexterBodySchema(flat.inputSchema), 'legacy');
  assert.equal(projectIndexterDiscoveryEndpointActions({ featuredOfferings: [flat] }).featuredOfferings[0].requestInput, null);
});
