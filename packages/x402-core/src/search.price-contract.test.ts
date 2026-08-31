import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSearchResponse } from './response.js';
import { capabilitySearch } from './search.js';
import type {
  CapabilitySearchOptions,
  CapabilitySearchResult,
} from './types.js';

function capabilityPayload(intent: Record<string, unknown>) {
  const appliedConstraints = {
    maxPriceUsdc: typeof intent.maxPriceUsdc === 'number'
      ? intent.maxPriceUsdc
      : null,
    minPriceUsdc: typeof intent.minPriceUsdc === 'number'
      ? intent.minPriceUsdc
      : null,
  };
  return {
    ok: true,
    query: 'weather data',
    rankingMode: 'full',
    intent: {
      capabilityText: 'weather data',
      ...intent,
    },
    appliedConstraints,
    strongResults: [],
    relatedResults: [],
    strongCount: 0,
    relatedCount: 0,
    topSimilarity: null,
    noMatchReason: 'below_similarity_threshold',
    rerank: { enabled: true, applied: false },
    durationMs: 12,
  };
}

test('capability search sends and preserves confirmed hard price bounds', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const captured: { requestedUrl?: URL } = {};
  globalThis.fetch = async (input) => {
    captured.requestedUrl = new URL(String(input));
    return new Response(JSON.stringify(capabilityPayload({
      maxPriceUsdc: 0.01,
      minPriceUsdc: 0.002,
    })), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await capabilitySearch({
    query: 'weather data',
    maxPriceUsdc: 0.01,
    minPriceUsdc: 0.002,
    endpoint: 'https://api.example.test/search',
  });
  const output = buildSearchResponse(result);

  assert.equal(captured.requestedUrl?.searchParams.get('maxPriceUsdc'), '0.01');
  assert.equal(captured.requestedUrl?.searchParams.get('minPriceUsdc'), '0.002');
  assert.deepEqual(output.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: 0.002,
  });
  assert.equal(output.intent.maxPriceUsdc, 0.01);
  assert.equal(output.intent.minPriceUsdc, 0.002);
});

test('natural-language-only search remains compatible and preserves parsed bounds', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const captured: { requestedUrl?: URL } = {};
  globalThis.fetch = async (input) => {
    captured.requestedUrl = new URL(String(input));
    return new Response(JSON.stringify(capabilityPayload({
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
    })), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await capabilitySearch({
    query: 'weather data for no more than one cent',
    endpoint: 'https://api.example.test/search',
  });
  const output = buildSearchResponse(result);

  assert.equal(captured.requestedUrl?.searchParams.has('maxPriceUsdc'), false);
  assert.equal(captured.requestedUrl?.searchParams.has('minPriceUsdc'), false);
  assert.deepEqual(output.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: null,
  });
});

test('capability search rejects invalid price constraints before fetching', async (t) => {
  const previousFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('fetch must not run');
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const invalidOptions: CapabilitySearchOptions[] = [
    { query: 'weather data', maxPriceUsdc: -1 },
    { query: 'weather data', maxPriceUsdc: Number.NaN },
    { query: 'weather data', minPriceUsdc: Number.POSITIVE_INFINITY },
    {
      query: 'weather data',
      minPriceUsdc: 0.02,
      maxPriceUsdc: 0.01,
    },
    {
      query: 'weather data',
      maxPriceUsdc: '0.01' as unknown as number,
    },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(() => capabilitySearch(options), /PriceUsdc|finite nonnegative/);
  }
  assert.equal(fetchCount, 0);
});

test('explicit price bounds reject missing or looser API confirmation', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const cases = [
    {
      name: 'missing max',
      options: { maxPriceUsdc: 0.01 },
      appliedConstraints: undefined,
      expected: /did not confirm the requested maxPriceUsdc constraint/,
    },
    {
      name: 'looser max',
      options: { maxPriceUsdc: 0.01 },
      appliedConstraints: { maxPriceUsdc: 0.02, minPriceUsdc: null },
      expected: /did not confirm the requested maxPriceUsdc constraint/,
    },
    {
      name: 'missing max field',
      options: { maxPriceUsdc: 0.01 },
      appliedConstraints: { minPriceUsdc: null },
      expected: /did not confirm the requested maxPriceUsdc constraint/,
    },
    {
      name: 'missing min',
      options: { minPriceUsdc: 0.002 },
      appliedConstraints: undefined,
      expected: /did not confirm the requested minPriceUsdc constraint/,
    },
    {
      name: 'looser min',
      options: { minPriceUsdc: 0.002 },
      appliedConstraints: { maxPriceUsdc: null, minPriceUsdc: 0.001 },
      expected: /did not confirm the requested minPriceUsdc constraint/,
    },
    {
      name: 'missing min field',
      options: { minPriceUsdc: 0.002 },
      appliedConstraints: { maxPriceUsdc: null },
      expected: /did not confirm the requested minPriceUsdc constraint/,
    },
  ] as const;

  for (const testCase of cases) {
    globalThis.fetch = async () => {
      const payload = capabilityPayload(testCase.options);
      if (testCase.appliedConstraints === undefined) {
        delete (payload as { appliedConstraints?: unknown }).appliedConstraints;
      } else {
        (payload as { appliedConstraints?: unknown }).appliedConstraints = {
          ...testCase.appliedConstraints,
        };
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await assert.rejects(
      () => capabilitySearch({
        query: 'weather data',
        ...testCase.options,
        endpoint: 'https://api.example.test/search',
      }),
      testCase.expected,
      testCase.name,
    );
  }
});

test('legacy response builders default missing appliedConstraints from intent', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  globalThis.fetch = async () => new Response(JSON.stringify(
    capabilityPayload({ maxPriceUsdc: 0.01, minPriceUsdc: null }),
  ), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const legacyResult: CapabilitySearchResult = await capabilitySearch({
    query: 'weather data',
    endpoint: 'https://api.example.test/search',
  });
  delete legacyResult.appliedConstraints;

  assert.deepEqual(buildSearchResponse(legacyResult).appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: null,
  });
});

test('unknown future ranking modes become explicit degraded output', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  globalThis.fetch = async () => {
    const payload = {
      ...capabilityPayload({}),
      rankingMode: 'future-ranking-v3',
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await capabilitySearch({
    query: 'weather data',
    endpoint: 'https://api.example.test/search',
  });
  const output = buildSearchResponse(result);

  assert.equal(result.rankingMode, 'degraded');
  assert.equal(output.rankingMode, 'degraded');
  assert.equal(output.searchMeta.rankingMode, 'degraded');
  assert.match(output.degradedMessage ?? '', /cannot interpret/);
  assert.equal(output.searchMeta.degradedMessage, output.degradedMessage);

  const directBuilderOutput = buildSearchResponse({
    ...result,
    rankingMode: 'another-future-mode',
    degradedMessage: null,
  } as unknown as CapabilitySearchResult);
  assert.equal(directBuilderOutput.rankingMode, 'degraded');
  assert.match(directBuilderOutput.degradedMessage ?? '', /cannot interpret/);
});
