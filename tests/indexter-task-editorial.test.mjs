import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { buildIndexterToolResult } from '../lib/indexter-tool-result.mjs';

async function bundledExports(source) {
  const output = await build({
    stdin: { contents: source, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}

const { formatResource, isSafeSearchPayload, normalizeSearchPayload, merchantCaption, compactEvidenceLabel } = await bundledExports(`
  export { formatResource } from './packages/x402-core/src/format.ts';
  export { isSafeSearchPayload, normalizeSearchPayload } from './apps-sdk/ui/src/components/indexter/search/search-model.ts';
  export { merchantCaption, compactEvidenceLabel } from './apps-sdk/ui/src/components/indexter/search/utils.ts';
`);
const endpoint = JSON.parse(readFileSync(new URL('./fixtures/indexter-featured/task-endpoint.json', import.meta.url)));

test('shared formatter accepts only explicit provider curation and strips offering-selection claims', () => {
  const source = { ...endpoint, editorial: { providerFeatured: true, providerOrder: 2, offeringPlacement: 'featured' } };
  assert.deepEqual(formatResource(source).editorial, { providerFeatured: true, providerOrder: 2 });
  for (const bad of [-1, 1.2, '2', Number.POSITIVE_INFINITY]) {
    assert.deepEqual(formatResource({ ...source, editorial: { providerFeatured: true, providerOrder: bad } }).editorial,
      { providerFeatured: true, providerOrder: null });
  }
  assert.deepEqual(formatResource({ ...source, editorial: { providerFeatured: false, providerOrder: 2 } }).editorial,
    { providerFeatured: false, providerOrder: null });
  for (const editorial of [undefined, null, { providerFeatured: 'true' }]) {
    assert.equal(formatResource({ ...source, editorial, curated_direct: true, band: 'exact' }).editorial, undefined);
  }
});

test('task widget retains the explicit provider label without changing verification evidence', () => {
  const row = formatResource({ ...endpoint, editorial: { providerFeatured: true, providerOrder: 2 } });
  const result = buildIndexterToolResult({ route: 'task', payload: {
    success: true, query: 'weather forecast', strongResults: [row], relatedResults: [],
    count: 1, strongCount: 1, relatedCount: 0, searchMeta: { mode: 'direct' },
  } });
  const payload = result._meta.indexterPayload.data;
  assert.equal(isSafeSearchPayload(payload), true);
  const normalized = normalizeSearchPayload(payload).strongResults[0];
  assert.match(merchantCaption(normalized), /Featured provider/);
  assert.equal(compactEvidenceLabel(normalized), compactEvidenceLabel({ ...normalized, editorial: undefined }));
  assert.doesNotMatch(merchantCaption({ ...normalized, editorial: { providerFeatured: false, providerOrder: null } }) ?? '', /Featured provider/);
  for (const editorial of [{ providerFeatured: 'true', providerOrder: 2 },
    { providerFeatured: false, providerOrder: 2 }, { providerFeatured: true, providerOrder: null, offeringPlacement: 'featured' }]) {
    const invalid = structuredClone(payload);
    invalid.strongResults[0].editorial = editorial;
    assert.equal(isSafeSearchPayload(invalid), false);
  }
});
