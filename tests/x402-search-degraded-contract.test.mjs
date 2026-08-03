import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchResponse,
  capabilitySearch,
} from '../packages/x402-core/dist/index.js';

test('capability search preserves degraded ranking truth through MCP output', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    query: 'running shoes',
    rankingMode: 'degraded',
    degradedMessage: 'Search results may be less precise than usual right now.',
    intent: { capabilityText: 'running shoes' },
    strongResults: [],
    relatedResults: [],
    strongCount: 0,
    relatedCount: 0,
    topSimilarity: null,
    noMatchReason: 'below_similarity_threshold',
    rerank: { enabled: false, applied: false, reason: 'provider_unavailable' },
    durationMs: 12,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const search = await capabilitySearch({
    query: 'running shoes',
    endpoint: 'https://api.example.test/search',
  });
  const output = buildSearchResponse(search);

  assert.equal(search.rankingMode, 'degraded');
  assert.equal(output.rankingMode, 'degraded');
  assert.equal(output.degradedMessage, 'Search results may be less precise than usual right now.');
  assert.equal(output.searchMeta.rankingMode, 'degraded');
  assert.equal(
    output.searchMeta.degradedMessage,
    'Search results may be less precise than usual right now.',
  );
});
