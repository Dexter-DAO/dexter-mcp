import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { buildIndexterInputContractResult, projectIndexterDiscoveryEndpointActions } from '../lib/indexter-tool-result.mjs';
const compiled = await build({ entryPoints: [new URL('../apps-sdk/ui/src/components/indexter/discovery/discovery-model.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { isIndexterInputContractPayload, isIndexterDiscoveryPayload, buildInputContractFollowUp, splitPublishedContract } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/indexter-featured/input-contracts.json', import.meta.url)));
const completeResult = (payload) => buildIndexterInputContractResult({
  resourceId: fixtures.detailResponse.resourceId, method: fixtures.detailResponse.method, payload: structuredClone(payload),
}).structuredContent;

test('widget accepts the exact complete producer result, including unsupported schemas', () => {
  for (const payload of [fixtures.detailResponse, fixtures.oversizedDetailResponse]) {
    const result = completeResult(payload);
    assert.equal(isIndexterInputContractPayload(result), true);
    assert.equal(result.contract.action.kind, 'endpoint_unavailable');
    assert.deepEqual(result.publishedContract.inputSchema, payload.inputSchema);
  }
});

test('widget accepts supported fields and explicit catalog errors', () => {
  const payload = structuredClone(fixtures.detailResponse);
  payload.inputSchema = { type: 'object', properties: { ticker: { type: 'string' } }, required: ['ticker'] };
  const result = completeResult(payload);
  assert.equal(isIndexterInputContractPayload(result), true);
  assert.equal(result.contract.requestInput.fields[0].name, 'ticker');
  const failed = buildIndexterInputContractResult({ resourceId: payload.resourceId, method: payload.method, error: 'input_contract_not_found' }).structuredContent;
  assert.equal(isIndexterInputContractPayload(failed), true);
});

test('widget rejects mismatched identities, incomplete details, and unsafe catalog fields', () => {
  for (const change of [
    p => { p.contractRequest.method = 'POST'; },
    p => { p.contractRequest.resourceId = '77777777-7777-4777-8777-777777777777'; },
    p => { p.contract.inputContract.complete = false; },
    p => { delete p.publishedContract.pathParams; },
    p => { p.publishedContract.inputSchema = { password: 'super-secret-credential-value' }; },
  ]) {
    const result = completeResult(fixtures.detailResponse); change(result);
    assert.equal(isIndexterInputContractPayload(result), false);
  }
});

test('app discovery preserves a deferred endpoint and emits only a catalog-read follow-up', () => {
  const payload = projectIndexterDiscoveryEndpointActions(fixtures.deferredResponse);
  assert.equal(isIndexterDiscoveryPayload(payload), true);
  const resource = payload.providers.flatMap(p => p.capabilityGroups.flatMap(g => g.resources))
    .find(row => row.inputContract?.status === 'details_required');
  assert.ok(resource);
  assert.equal(resource.access.checkable, false);
  assert.equal(resource.action.kind, 'endpoint_unavailable');
  const prompt = buildInputContractFollowUp(resource);
  assert.ok(prompt.includes(JSON.stringify({ contractResourceId: resource.resourceId, contractMethod: resource.method })));
  assert.match(prompt, /catalog details only/);
  assert.match(prompt, /do not call x402_check or contact the seller/);
  const mismatched = structuredClone(resource);
  mismatched.inputContract.detail.method = 'POST';
  assert.equal(buildInputContractFollowUp(mismatched), null);
});


test('local schema pages retain every character and bound lines and width without splitting Unicode pairs', () => {
  const text = JSON.stringify({ properties: { samples: { type: 'array', description: '𠮷 schema '.repeat(180) } }, required: ['samples'] }, null, 2);
  for (const [characters, lines] of [[160, 6], [600, 14]]) {
    const pages = splitPublishedContract(text, characters, lines);
    assert.equal(pages.join(''), text);
    assert.ok(pages.length > 1);
    for (const page of pages) {
      assert.ok([...page].length <= characters);
      assert.ok(page.split('\n').length <= lines);
      assert.equal(page.isWellFormed(), true);
    }
  }
});
