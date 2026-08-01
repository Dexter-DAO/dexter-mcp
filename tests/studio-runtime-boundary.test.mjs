import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadStudioQuery } from '../scripts/studio-runtime/load-query.mjs';

test('Studio query runtime is lazy and validates its export', async () => {
  const query = await loadStudioQuery(new URL(
    'data:text/javascript,export const query = () => "ready"',
  ));
  assert.equal(query(), 'ready');

  await assert.rejects(
    loadStudioQuery(new URL('data:text/javascript,export const nope = true')),
    (error) => (
      error?.code === 'studio_runtime_unavailable'
      && /pinned isolated dependencies/.test(error.message)
      && error.cause instanceof TypeError
    ),
  );
});

test('hosted Studio agent runner does not eagerly import the Claude SDK bridge', async () => {
  const source = await readFile(
    new URL('../toolsets/studio/lib/agentRunner.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /import\s+\{\s*query\s*\}.*studio-runtime\/query\.mjs/);
  assert.match(source, /await loadStudioQuery\(\)/);
});
