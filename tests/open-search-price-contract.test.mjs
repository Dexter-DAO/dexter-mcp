import assert from 'node:assert/strict';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import { createOpenMcpServer } from '../open-mcp-server.mjs';

function capabilityPayload(overrides = {}) {
  return {
    ok: true,
    query: 'weather data',
    rankingMode: 'full',
    intent: {
      capabilityText: 'weather data',
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
    },
    appliedConstraints: {
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
      paidOnly: false,
    },
    appliedOrdering: {
      sortBy: 'relevance',
    },
    strongResults: [],
    relatedResults: [],
    strongCount: 0,
    relatedCount: 0,
    topSimilarity: null,
    noMatchReason: 'below_similarity_threshold',
    rerank: { enabled: true, applied: false },
    durationMs: 8,
    ...overrides,
  };
}

function rawResource({ resourceId, tier, network, similarity, priceUsdc = 0.005 }) {
  return {
    kind: 'endpoint',
    resourceId,
    resourceUrl: `https://${resourceId}.example.test/data`,
    access: {
      kind: 'direct_url',
      checkable: true,
      requiresFreshCheck: true,
    },
    displayName: resourceId,
    method: 'GET',
    pricing: {
      usdc: priceUsdc,
      network,
      networkLabel: network,
      asset: 'USDC',
      mode: 'fixed',
      quoteRequired: false,
      chains: [{
        network,
        networkLabel: network,
        asset: 'USDC',
        scheme: 'exact',
        priceAtomic: String(Math.round(priceUsdc * 1_000_000)),
        priceUsdc,
        priceLabel: `$${priceUsdc}`,
      }],
    },
    execution: {
      sideEffectful: false,
      effect: null,
      automatedVerification: 'enabled',
      userExecution: 'allowed',
      confirmationRequired: false,
      availability: 'available',
      requiresExplicitInput: false,
      quoteMayCreateProviderReservation: false,
    },
    verification: {
      status: 'pass',
      paid: true,
      qualityScore: 90,
      lastVerifiedAt: '2026-08-31T00:00:00.000Z',
    },
    usage: {
      totalSettlements: 1,
      totalVolumeUsdc: 0.005,
      lastSettlementAt: '2026-08-31T00:00:00.000Z',
    },
    description: 'Fixture data service.',
    category: 'data',
    tier,
    similarity,
    why: 'Fixture relevance.',
    serviceProfile: null,
  };
}

async function connectedOpenClient(t, name) {
  const server = createOpenMcpServer({
    includeResources: false,
    listedToolNames: () => OPEN_TOOL_NAMES,
  });
  const client = new Client({ name, version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

test('hosted indexter_search sends and returns typed price, paid, and ordering controls', async (t) => {
  const previousFetch = globalThis.fetch;
  const captured = { requestedUrl: null };
  globalThis.fetch = async (input) => {
    captured.requestedUrl = new URL(String(input));
    return new Response(JSON.stringify(capabilityPayload({
      appliedConstraints: {
        maxPriceUsdc: 0.01,
        minPriceUsdc: null,
        paidOnly: true,
      },
      appliedOrdering: { sortBy: 'price_asc' },
    })), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'price-contract-test');

  const result = await client.callTool({
    name: 'indexter_search',
    arguments: {
      query: 'Find weather data',
      maxPriceUsdc: 0.01,
      paidOnly: true,
      sortBy: 'price_asc',
    },
  });

  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.route, 'task');
  assert.equal(captured.requestedUrl?.searchParams.get('maxPriceUsdc'), '0.01');
  assert.equal(captured.requestedUrl?.searchParams.get('paidOnly'), 'true');
  assert.equal(captured.requestedUrl?.searchParams.get('sortBy'), 'price_asc');
  assert.deepEqual(result._meta.indexterPayload.data.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: null,
    paidOnly: true,
  });
  assert.deepEqual(result._meta.indexterPayload.data.appliedOrdering, {
    sortBy: 'price_asc',
  });
  assert.equal(
    result.structuredContent.providerDataPolicy.trust,
    'untrusted_external_data',
  );

  const secondResult = await client.callTool({
    name: 'indexter_search',
    arguments: { query: 'Find weather data' },
  });
  assert.equal(secondResult.structuredContent.route, 'task');
  assert.equal(
    Object.hasOwn(result._meta.indexterPayload.data, 'searchResultSetId'),
    false,
  );
});

test('search preserves managed endpoint selection and current evidence without a route', async (t) => {
  const previousFetch = globalThis.fetch;
  const managedResource = rawResource({
    resourceId: '33333333-3333-4333-8333-333333333333',
    tier: 'strong',
    network: 'eip155:8453',
    similarity: 0.96,
  });
  managedResource.kind = 'endpoint';
  managedResource.resourceUrl = null;
  managedResource.host = null;
  managedResource.access = {
    kind: 'managed_resolvable',
    checkable: true,
    requiresFreshCheck: true,
  };
  managedResource.verification = {
    ...managedResource.verification,
    trustBasis: 'recent_paid_delivery',
    trustLabel: 'Delivered recently',
    evidenceState: 'delivered_recently',
    evidenceLabel: 'Delivered recently',
    evidenceAt: '2026-09-04T02:30:00.000Z',
  };
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    strongResults: [managedResource],
    strongCount: 1,
    topSimilarity: 0.96,
    noMatchReason: null,
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'managed-search-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: { query: 'Find fixture data' },
  });
  const selected = result._meta.indexterPayload.data.strongResults[0];
  const modelSelected = result.structuredContent.results[0];

  assert.notEqual(result.isError, true);
  assert.equal(selected.kind, 'endpoint');
  assert.equal(selected.resourceUrl, null);
  assert.equal(selected.url, null);
  assert.deepEqual(selected.access, {
    kind: 'managed_resolvable',
    checkable: true,
    requiresFreshCheck: true,
  });
  assert.deepEqual(selected.evidence, {
    state: 'delivered_recently',
    label: 'Delivered recently',
    observedAt: '2026-09-04T02:30:00.000Z',
  });
  assert.equal(modelSelected.resourceId, selected.resourceId);
  assert.equal(modelSelected.action.resourceUrl, null);
  assert.doesNotMatch(JSON.stringify(selected), /indexter-managed\.invalid/);
});

test('network filtering preserves API order and confirmed search metadata', async (t) => {
  const previousFetch = globalThis.fetch;
  const solanaHigh = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000001',
    tier: 'strong',
    network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    similarity: 0.93,
    priceUsdc: 0.009,
  });
  const baseMiddle = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000002',
    tier: 'strong',
    network: 'eip155:8453',
    similarity: 0.96,
    priceUsdc: 0.006,
  });
  const solanaLow = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000003',
    tier: 'strong',
    network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    similarity: 0.91,
    priceUsdc: 0.003,
  });
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    appliedConstraints: {
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
      paidOnly: true,
    },
    appliedOrdering: { sortBy: 'price_desc' },
    strongResults: [solanaHigh, baseMiddle, solanaLow],
    strongCount: 3,
    topSimilarity: 0.93,
    noMatchReason: null,
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'network-order-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: {
      query: 'Find fixture data',
      network: 'solana',
      maxPriceUsdc: 0.01,
      paidOnly: true,
      sortBy: 'price_desc',
    },
  });
  const output = result._meta.indexterPayload.data;

  assert.notEqual(result.isError, true);
  assert.deepEqual(
    output.strongResults.map(({ resourceId }) => resourceId),
    [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
    ],
  );
  assert.deepEqual(
    output.strongResults.map(({ priceUsdc }) => priceUsdc),
    [0.009, 0.003],
  );
  assert.deepEqual(output.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: null,
    paidOnly: true,
  });
  assert.deepEqual(output.appliedOrdering, { sortBy: 'price_desc' });
  assert.equal(output.count, 2);
  assert.equal(output.strongCount, 2);
});

test('real SDK search keeps its strict output shape after credential scrubbing', async (t) => {
  const previousFetch = globalThis.fetch;
  const credentialShapedQuery = 'Find open_abcdefghijklmnop';
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    query: credentialShapedQuery,
    intent: {
      capabilityText: credentialShapedQuery,
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
    },
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'search-scrub-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: {
      query: credentialShapedQuery,
      maxPriceUsdc: 0.01,
    },
  });

  assert.notEqual(result.isError, true);
  assert.doesNotMatch(JSON.stringify(result), /open_abcdefghijklmnop/);
  assert.deepEqual(result._meta.indexterPayload.data.appliedConstraints, {
    maxPriceUsdc: 0.01,
    minPriceUsdc: null,
    paidOnly: false,
  });
  assert.deepEqual(result._meta.indexterPayload.data.appliedOrdering, {
    sortBy: 'relevance',
  });
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('network filtering rebuilds every visible search fact', async (t) => {
  const previousFetch = globalThis.fetch;
  const baseStrong = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000004',
    tier: 'strong',
    network: 'eip155:8453',
    similarity: 0.97,
  });
  const solanaRelated = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000005',
    tier: 'related',
    network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    similarity: 0.61,
  });
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    appliedConstraints: {
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
      paidOnly: true,
    },
    appliedOrdering: { sortBy: 'price_desc' },
    strongResults: [baseStrong],
    relatedResults: [solanaRelated],
    strongCount: 1,
    relatedCount: 1,
    topSimilarity: 0.97,
    noMatchReason: null,
    confidence: {
      profileCoverage: 0,
      topMatchProfileBacked: false,
      triangulatableAlternates: ['00000000-0000-4000-8000-000000000004'],
    },
    triangulate: {
      reason: 'Pre-filter reason.',
      alternateResourceIds: ['00000000-0000-4000-8000-000000000004'],
    },
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'network-filter-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: {
      query: 'Find fixture data',
      network: 'solana',
      paidOnly: true,
      sortBy: 'price_desc',
    },
  });
  const output = result._meta.indexterPayload.data;

  assert.notEqual(result.isError, true);
  assert.deepEqual(output.strongResults, []);
  assert.deepEqual(
    output.relatedResults.map(({ resourceId }) => resourceId),
    ['00000000-0000-4000-8000-000000000005'],
  );
  assert.equal(output.count, 1);
  assert.equal(output.strongCount, 0);
  assert.equal(output.relatedCount, 1);
  assert.equal(output.topSimilarity, 0.61);
  assert.equal(output.noMatchReason, 'below_strong_threshold');
  assert.equal(output.searchMeta.mode, 'related_only');
  assert.match(output.searchMeta.note, /closest related services/);
  assert.match(output.searchMeta.note, /1 other-network result hidden/);
  assert.match(output.tip, /No exact match/);
  assert.equal(output.confidence, undefined);
  assert.equal(output.triangulate, undefined);
  assert.equal(output.appliedConstraints.paidOnly, true);
  assert.deepEqual(output.appliedOrdering, { sortBy: 'price_desc' });
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('network filtering reports an empty payable set without a false similarity reason', async (t) => {
  const previousFetch = globalThis.fetch;
  const baseStrong = rawResource({
    resourceId: '00000000-0000-4000-8000-000000000006',
    tier: 'strong',
    network: 'eip155:8453',
    similarity: 0.94,
  });
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    strongResults: [baseStrong],
    relatedResults: [],
    strongCount: 1,
    relatedCount: 0,
    topSimilarity: 0.94,
    noMatchReason: null,
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'network-empty-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: {
      query: 'Find fixture data',
      network: 'solana',
    },
  });
  const output = result._meta.indexterPayload.data;

  assert.notEqual(result.isError, true);
  assert.equal(output.count, 0);
  assert.equal(output.strongCount, 0);
  assert.equal(output.relatedCount, 0);
  assert.equal(output.topSimilarity, null);
  assert.equal(output.noMatchReason, null);
  assert.equal(output.searchMeta.mode, 'empty');
  assert.equal(
    output.searchMeta.note,
    '1 match found, but none accept payment on solana',
  );
  assert.match(output.tip, /Retry without the network filter/);
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('unknown API ranking modes stay schema-safe through the real SDK', async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    rankingMode: 'future-ranking-v3',
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'ranking-mode-contract-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: { query: 'Find weather data' },
  });

  assert.notEqual(result.isError, true);
  assert.equal(result._meta.indexterPayload.data.rankingMode, 'degraded');
  assert.equal(result._meta.indexterPayload.data.searchMeta.rankingMode, 'degraded');
  assert.match(result._meta.indexterPayload.data.degradedMessage, /cannot interpret/);
  assert.equal(
    result.structuredContent.warnings.some(({ code }) => code === 'degraded_ranking'),
    true,
  );
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('hosted indexter_search fails closed when paidOnly is not confirmed', async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    appliedConstraints: {
      maxPriceUsdc: 0.01,
      minPriceUsdc: null,
    },
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'paid-only-fail-closed-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: { query: 'Find weather data', paidOnly: true },
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(result._meta.indexterPayload.data.success, false);
  assert.equal(result._meta.indexterPayload.data.searchMeta.mode, 'error');
});

test('hosted indexter_search fails closed when typed sortBy is not echoed', async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(capabilityPayload({
    appliedOrdering: { sortBy: 'relevance' },
  })), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const client = await connectedOpenClient(t, 'sort-fail-closed-test');
  const result = await client.callTool({
    name: 'indexter_search',
    arguments: { query: 'Find weather data', sortBy: 'price_asc' },
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(result._meta.indexterPayload.data.success, false);
  assert.equal(result._meta.indexterPayload.data.searchMeta.mode, 'error');
});
