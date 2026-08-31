import assert from 'node:assert/strict';
import test from 'node:test';

import { registerX402ClientToolset } from '../toolsets/x402-client/index.mjs';

function capabilityPayload() {
  return {
    ok: true,
    query: 'weather data',
    rankingMode: 'full',
    intent: {
      capabilityText: 'weather data',
      maxPriceUsdc: 0.01,
      minPriceUsdc: 0.002,
    },
    appliedConstraints: {
      maxPriceUsdc: 0.01,
      minPriceUsdc: 0.002,
      paidOnly: true,
    },
    appliedOrdering: {
      sortBy: 'price_asc',
    },
    strongResults: [],
    relatedResults: [],
    strongCount: 0,
    relatedCount: 0,
    topSimilarity: null,
    noMatchReason: 'below_similarity_threshold',
    rerank: { enabled: true, applied: false },
    durationMs: 8,
  };
}

test('authenticated x402-client search exposes and forwards typed controls', async (t) => {
  const registered = new Map();
  registerX402ClientToolset({
    registerTool(name, definition, handler) {
      registered.set(name, { definition, handler });
    },
  });

  const search = registered.get('x402_search');
  assert.ok(search);
  for (const field of ['maxPriceUsdc', 'minPriceUsdc']) {
    assert.equal(search.definition.inputSchema[field].safeParse(0.01).success, true);
    assert.equal(search.definition.inputSchema[field].safeParse(-1).success, false);
  }
  assert.match(search.definition.description, /appliedConstraints/);
  assert.match(search.definition.description, /appliedOrdering/);
  assert.equal(search.definition.inputSchema.paidOnly.safeParse(true).success, true);
  assert.equal(search.definition.inputSchema.paidOnly.safeParse('true').success, false);
  for (const value of ['relevance', 'price_asc', 'price_desc']) {
    assert.equal(search.definition.inputSchema.sortBy.safeParse(value).success, true);
  }
  assert.equal(search.definition.inputSchema.sortBy.safeParse('cheapest').success, false);

  const previousFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify(capabilityPayload()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await search.handler({
    query: 'weather data',
    maxPriceUsdc: 0.01,
    minPriceUsdc: 0.002,
    paidOnly: true,
    sortBy: 'price_asc',
  });

  assert.notEqual(result.isError, true);
  assert.equal(requestedUrl.searchParams.get('maxPriceUsdc'), '0.01');
  assert.equal(requestedUrl.searchParams.get('minPriceUsdc'), '0.002');
  assert.equal(requestedUrl.searchParams.get('paidOnly'), 'true');
  assert.equal(requestedUrl.searchParams.get('sortBy'), 'price_asc');
  assert.deepEqual(result.structuredContent.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: 0.002,
    paidOnly: true,
  });
  assert.deepEqual(result.structuredContent.appliedOrdering, {
    sortBy: 'price_asc',
  });
});

test('authenticated x402-client search fails closed on weaker confirmations', async (t) => {
  const registered = new Map();
  registerX402ClientToolset({
    registerTool(name, definition, handler) {
      registered.set(name, { definition, handler });
    },
  });

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const payload = capabilityPayload();
    payload.appliedConstraints.paidOnly = false;
    payload.appliedOrdering.sortBy = 'relevance';
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await registered.get('x402_search').handler({
    query: 'weather data',
    paidOnly: true,
    sortBy: 'price_asc',
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.success, false);
  assert.equal(result.structuredContent.searchMeta.mode, 'error');
});
