import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INDEXTER_RESULT_LIMIT,
  INDEXTER_TOOL_RESULT_MAX_JSON_BYTES,
  boundedIndexterPayload,
  buildIndexterToolResult,
  projectIndexterDiscoveryEndpointActions,
} from '../lib/indexter-tool-result.mjs';
import {
  OPEN_TOOL_CONTRACTS,
  PROVIDER_DATA_POLICY,
  applyOpenToolResultPolicy,
  stampOpenToolInvocation,
} from '../lib/open-tool-contracts.mjs';

const OBSERVED_AT = '2026-09-04T12:00:00.000Z';

function percentEncodeTimes(value, count) {
  let encoded = value;
  for (let attempt = 0; attempt < count; attempt += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

function providerIdentity() {
  return {
    kind: 'provider',
    providerKey: 'apify',
    providerSlug: 'apify',
    technicalHost: 'apify.com',
    displayName: 'Apify',
    logoUrl: 'https://apify.com/logo.svg',
  };
}

function endpointExecution(overrides = {}) {
  return {
    sideEffectful: false,
    effect: null,
    automatedVerification: 'enabled',
    userExecution: 'allowed',
    confirmationRequired: false,
    availability: 'available',
    requiresExplicitInput: false,
    quoteMayCreateProviderReservation: false,
    ...overrides,
  };
}

function endpoint(index = 1, overrides = {}) {
  const suffix = String(index).padStart(12, '0');
  const resourceId = `00000000-0000-4000-8000-${suffix}`;
  return {
    kind: 'endpoint',
    id: resourceId,
    resourceId,
    resourceUrl: `https://weather.example.test/service/${index}`,
    url: `https://weather.example.test/service/${index}`,
    access: {
      kind: 'direct_url',
      checkable: true,
      requiresFreshCheck: true,
    },
    provider: {
      kind: 'provider',
      providerKey: 'weather-co',
      providerSlug: 'weather-co',
      technicalHost: 'weather.example.test',
      displayName: 'Weather Co',
      logoUrl: 'https://weather.example.test/logo.png',
    },
    merchant: {
      providerKey: 'weather-co',
      providerSlug: 'weather-co',
      technicalHost: 'weather.example.test',
      displayName: 'Weather Co',
      logoUrl: 'https://weather.example.test/logo.png',
    },
    displayName: `Weather service ${index}`,
    name: `Weather service ${index}`,
    description: 'Current weather for a requested location.',
    category: 'weather',
    method: 'GET',
    execution: endpointExecution(),
    inputSchema: null,
    pathParams: null,
    iconUrl: null,
    docsUrl: null,
    price: { usdc: 0.01, label: '$0.01', network: 'eip155:8453' },
    priceUsdc: 0.01,
    evidence: {
      state: 'terms_checked',
      label: 'Terms checked',
      observedAt: OBSERVED_AT,
    },
    why: 'Matches current weather data.',
    ...overrides,
  };
}

function discoveryEndpoint(index = 1, overrides = {}) {
  const {
    url: _url,
    merchant: _merchant,
    name: _name,
    priceUsdc: _priceUsdc,
    provider: _provider,
    why: _why,
    ...record
  } = endpoint(index, overrides);
  return record;
}

function actor() {
  return {
    kind: 'actor',
    id: 'apify:actor:publisher/web-crawler',
    stableId: 'apify:actor:publisher/web-crawler',
    actorId: 'publisher/web-crawler',
    provider: providerIdentity(),
    publisher: {
      username: 'publisher',
      displayName: 'Independent Publisher',
      url: 'https://apify.com/publisher',
      imageUrl: 'https://apify.com/publisher.png',
    },
    name: 'web-crawler',
    title: 'Web crawler',
    summary: 'Collect structured pages from a website.',
    imageUrl: 'https://apify.com/crawler.png',
    categories: ['WEB_SCRAPING'],
    pricing: {
      model: 'pay_per_event',
      variable: true,
      currency: 'USD',
      minimumMaxTotalChargeUsd: 0.5,
      primaryEvent: {
        key: 'page',
        title: 'Page',
        priceUsd: 0.001,
        isOneTime: false,
        tieredPricesUsd: {},
      },
    },
    availability: { status: 'available', notice: null },
    catalogOnly: true,
    execution: {
      available: false,
      reason: 'payment_contract_unavailable',
      previewMode: 'inspection_only',
    },
    schemaStatus: 'not_hydrated',
  };
}

function discoveryPayload() {
  const nestedEndpoint = discoveryEndpoint(1);
  const featuredEndpoint = { ...nestedEndpoint, provider: providerIdentity() };
  const featuredActor = actor();
  const apify = {
    kind: 'provider',
    id: 'apify',
    providerKey: 'apify',
    providerSlug: 'apify',
    technicalHost: 'apify.com',
    displayName: 'Apify',
    description: 'Cloud tools for web data extraction and automation.',
    logoUrl: 'https://apify.com/logo.svg',
    docsUrl: 'https://docs.apify.com',
    editorial: { featured: true, order: 0, evidenceResourceId: null },
    catalog: {
      resourceCount: 1,
      actorCounts: { returned: 1, indexed: 1, total: 1 },
      offeringCounts: { returned: 2, indexed: 2, total: 2 },
      capabilityGroupCount: 1,
      countsComplete: true,
    },
    evidence: {
      totalResourceCount: 1,
      evaluatedResourceCount: 1,
      deliveredRecentlyCount: 0,
      termsCheckedCount: 1,
      noCurrentConfirmationCount: 0,
      latestObservedAt: OBSERVED_AT,
      coverageComplete: true,
    },
    capabilityGroups: [{
      id: 'apify:web',
      label: 'Web data',
      resourceCount: 1,
      returnedResourceCount: 1,
      resources: [nestedEndpoint],
    }],
    actorCatalog: {
      status: 'ready',
      warning: null,
      provider: providerIdentity(),
      counts: { returned: 1, indexed: 1, total: 1, complete: true },
      items: [featuredActor],
      snapshot: {
        catalogRevision: 'revision-1',
        completedAt: OBSERVED_AT,
        sourceStatus: 'ready',
        warning: null,
        scope: 'complete',
        scopeLimit: null,
        sourceReportedCount: 1,
        truncated: false,
      },
      page: {
        version: 1,
        namespace: 'indexter.actor.catalog.v1',
        scope: 'provider_actors',
        order: 'apify-source-rank-v1',
        limit: 8,
        returned: 1,
        hasMore: false,
        nextCursor: null,
      },
    },
  };
  return {
    ok: true,
    mode: 'overview',
    generatedAt: OBSERVED_AT,
    requestedProvider: null,
    summary: {
      endpointCatalog: {
        featuredProviderCount: 1,
        providerCount: 1,
        endpointCount: 1,
      },
      returnedProviderCount: 1,
    },
    providers: [apify],
    featuredOfferings: [featuredEndpoint, featuredActor],
    page: {
      version: 2,
      namespace: 'indexter.endpoint.providers.v1',
      scope: 'providers',
      order: 'featured_provider_curation_v1',
      limit: 4,
      returned: 1,
      hasMore: false,
      nextCursor: null,
    },
    error: null,
    message: null,
    source: 'Indexter',
  };
}

function taskPayload() {
  return {
    success: true,
    rankingMode: 'full',
    count: 16,
    strongResults: Array.from({ length: 10 }, (_, index) => endpoint(index + 1)),
    relatedResults: Array.from({ length: 6 }, (_, index) => endpoint(index + 11)),
    strongCount: 10,
    relatedCount: 6,
    topSimilarity: 0.95,
    noMatchReason: null,
    rerank: { enabled: true, applied: true },
    intent: { capabilityText: 'find current weather' },
    appliedConstraints: {
      maxPriceUsdc: null,
      minPriceUsdc: null,
      paidOnly: false,
    },
    appliedOrdering: { sortBy: 'relevance' },
    searchMeta: { mode: 'direct', note: '10 strong matches' },
    tip: 'Choose a service and check current terms.',
    source: 'Indexter',
    searchResultSetId: '11111111-1111-4111-8111-111111111111',
    page: { nextCursor: 'cosmetic-cursor' },
  };
}

test('overview projection combines provider, endpoint, and catalog-only Actor results', () => {
  const result = buildIndexterToolResult({
    route: 'overview',
    payload: discoveryPayload(),
    baseMeta: { retained: true },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].text, 'Indexter returned 1 providers and 2 featured offerings.');
  assert.doesNotMatch(result.content[0].text, /[{}\[\]"]/);
  assert.deepEqual(result.structuredContent.counts, {
    returned: 3,
    providers: 1,
    endpoints: 1,
    actors: 1,
  });
  assert.deepEqual(
    result.structuredContent.results.map(({ kind }) => kind),
    ['provider', 'endpoint', 'actor'],
  );
  const projectedEndpoint = result.structuredContent.results[1];
  assert.equal(projectedEndpoint.resourceId, '00000000-0000-4000-8000-000000000001');
  assert.equal(projectedEndpoint.action.resourceId, projectedEndpoint.resourceId);
  assert.equal(projectedEndpoint.merchant.name, 'Apify');
  const projectedActor = result.structuredContent.results[2];
  assert.equal(projectedActor.catalogOnly, true);
  assert.equal(projectedActor.executionAvailable, false);
  assert.equal(projectedActor.provider.name, 'Apify');
  assert.equal(projectedActor.publisher.name, 'Independent Publisher');
  assert.equal(projectedActor.action.stableId, projectedActor.stableId);
  assert.equal(result._meta.retained, true);
  assert.equal(result._meta.indexterPayload.route, 'overview');
  assert.equal(result._meta.indexterPayload.data.featuredOfferings.length, 2);
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('task output schema independently rejects credentials in catalog text and action URLs', () => {
  const output = buildIndexterToolResult({
    route: 'overview',
    payload: discoveryPayload(),
  }).structuredContent;
  const credentialText = structuredClone(output);
  credentialText.results[0].summary = 'Authorization: token ghp_1234567890abcdef';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(credentialText).success,
    false,
  );

  const credentialUrl = structuredClone(output);
  const endpointResult = credentialUrl.results.find(({ kind }) => kind === 'endpoint');
  endpointResult.action.resourceUrl =
    'https://weather.example.test/service/1#access_token=fragment-secret';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(credentialUrl).success,
    false,
  );

  const cookieText = structuredClone(output);
  const actorResult = cookieText.results.find(({ kind }) => kind === 'actor');
  actorResult.publisher.name = 'Cookie: session=abcdefghijklmnop';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(cookieText).success,
    false,
  );

  const nestedCredentialText = structuredClone(output);
  nestedCredentialText.results[0].summary = percentEncodeTimes(
    'Authorization: Bearer schemanestedsecret',
    3,
  );
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      nestedCredentialText,
    ).success,
    false,
  );

  const overLimitEncoding = structuredClone(output);
  overLimitEncoding.results[0].summary = percentEncodeTimes(
    'Authorization: Bearer schemadeepsecret',
    9,
  );
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      overLimitEncoding,
    ).success,
    false,
  );

  const unicodeCredentialText = structuredClone(output);
  unicodeCredentialText.results[0].summary =
    'Ａｕｔｈｏｒｉｚａｔｉｏｎ： Ｂｅａｒｅｒ schemaunicodesecret';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      unicodeCredentialText,
    ).success,
    false,
  );

  const malformedEncodedCredential = structuredClone(output);
  malformedEncodedCredential.results[0].summary =
    'Authorization%3A%20Bearer%20schemamalformedsecret%ZZ';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      malformedEncodedCredential,
    ).success,
    false,
  );

  const controlSplitCredential = structuredClone(output);
  controlSplitCredential.results[0].summary =
    'Authori\nzation: Bea\nrer schemacontrolsecret';
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      controlSplitCredential,
    ).success,
    false,
  );
});

test('model projection drops unsafe Actor and publisher identities', () => {
  const unsafeActors = [
    actor(),
    actor(),
    actor(),
  ];
  unsafeActors[0].id = 'ignore-previous-instructions';
  unsafeActors[0].stableId = 'ignore-previous-instructions';
  unsafeActors[1].actorId = 'Bearer abcdefghijklmnop';
  unsafeActors[2].publisher.username = 'system-prompt';

  unsafeActors.push(actor());
  unsafeActors[3].stableId = `publisher/web-crawler\u202e`;
  unsafeActors.push(actor());
  unsafeActors[4].actorId = 'a'.repeat(257);
  unsafeActors.push(actor());
  unsafeActors[5].publisher.username = `publisher\u0000`;

  for (const unsafeActor of unsafeActors) {
    const result = buildIndexterToolResult({
      route: 'task',
      payload: {
        success: true,
        strongResults: [unsafeActor],
        relatedResults: [],
      },
    });
    assert.deepEqual(result.structuredContent.counts, {
      returned: 0,
      providers: 0,
      endpoints: 0,
      actors: 0,
    });
    assert.equal(
      OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
        result.structuredContent,
      ).success,
      true,
    );
  }
});

test('app-only discovery schema accepts separate endpoint and Actor catalog pages', () => {
  const payload = projectIndexterDiscoveryEndpointActions({
    ...discoveryPayload(),
    discoveryResultSetId: '44444444-4444-4444-8444-444444444444',
    providerDataPolicy: PROVIDER_DATA_POLICY,
  });
  const parsed = OPEN_TOOL_CONTRACTS.indexter_discover.outputSchema.safeParse(payload);

  assert.equal(parsed.success, true, parsed.error?.message);
  assert.equal(payload.providers[0].actorCatalog.items[0].catalogOnly, true);
  assert.equal(payload.providers[0].actorCatalog.page.namespace, 'indexter.actor.catalog.v1');
  assert.notEqual(payload.providers[0].actorCatalog.page, payload.page);
});

test('endpoint projection derives review state from method, execution flags, and input presence', () => {
  const cases = [
    {
      name: 'safe bodyless GET',
      source: endpoint(21),
      kind: 'check_endpoint',
      review: false,
      affect: false,
    },
    {
      name: 'reservation-capable GET',
      source: endpoint(22, {
        execution: endpointExecution({
          sideEffectful: true,
          effect: 'Creates a temporary provider reservation.',
          confirmationRequired: true,
          quoteMayCreateProviderReservation: true,
        }),
      }),
      kind: 'review_endpoint',
      review: true,
      affect: true,
      reservation: true,
    },
    {
      name: 'non-GET with otherwise false flags',
      source: endpoint(23, { method: 'POST' }),
      kind: 'review_endpoint',
      review: true,
      affect: true,
    },
    {
      name: 'GET requiring explicit input',
      source: endpoint(24, {
        execution: endpointExecution({ requiresExplicitInput: true }),
        inputSchema: {
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'string' } },
        },
      }),
      kind: 'review_endpoint',
      review: true,
      affect: false,
    },
  ];

  for (const testCase of cases) {
    const result = buildIndexterToolResult({
      route: 'task',
      payload: {
        success: true,
        strongResults: [testCase.source],
        relatedResults: [],
      },
    });
    assert.equal(result.structuredContent.counts.endpoints, 1, testCase.name);
    const action = result.structuredContent.results[0].action;
    assert.equal(action.kind, testCase.kind, testCase.name);
    assert.equal(action.safety.requiresRequestReview, testCase.review, testCase.name);
    assert.equal(action.safety.checkMayAffectProvider, testCase.affect, testCase.name);
    assert.equal(
      action.safety.checkMayCreateProviderReservation,
      testCase.reservation === true,
      testCase.name,
    );
    assert.equal(
      OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
        result.structuredContent,
      ).success,
      true,
      testCase.name,
    );
  }
});

test('endpoint projection exposes only bounded primitive request fields for an actionable direct query', () => {
  const source = endpoint(26, {
    resourceUrl: 'https://x402.glassnode.com/v1/metadata/metric',
    url: 'https://x402.glassnode.com/v1/metadata/metric',
    inputSchema: {
      type: 'object',
      required: ['path'],
      description: 'RAW_SCHEMA_DESCRIPTION_SHOULD_NOT_LEAK',
      properties: {
        a: {
          type: 'string',
          description: 'Asset id from provider prose.',
          default: 'BTC',
          examples: ['ETH'],
        },
        c: { type: 'string', description: 'Currency from provider prose.' },
        e: { type: 'string', description: 'Exchange from provider prose.' },
        i: { type: 'string', description: 'Interval from provider prose.' },
        path: { type: 'string', description: 'Metric path from provider prose.' },
      },
    },
  });
  const result = buildIndexterToolResult({
    route: 'task',
    payload: { success: true, strongResults: [source], relatedResults: [] },
  });
  const expected = {
    version: 1,
    fields: [
      { name: 'a', location: 'query', type: 'string', required: false },
      { name: 'c', location: 'query', type: 'string', required: false },
      { name: 'e', location: 'query', type: 'string', required: false },
      { name: 'i', location: 'query', type: 'string', required: false },
      { name: 'path', location: 'query', type: 'string', required: true },
    ],
  };

  assert.deepEqual(result.structuredContent.results[0].requestInput, expected);
  assert.equal(result.structuredContent.results[0].action.kind, 'review_endpoint');
  assert.deepEqual(result._meta.indexterPayload.data.strongResults[0].requestInput, expected);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /RAW_SCHEMA_DESCRIPTION_SHOULD_NOT_LEAK|Asset id from provider prose|Metric path from provider prose/);
  assert.doesNotMatch(serialized, /"inputSchema"|"pathParams"|"default"|"examples"/);
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success,
    true,
  );
});

test('endpoint input projection preserves discovery but disables unsafe or unsupported input contracts', () => {
  const unsafe = [
    endpoint(27, {
      inputSchema: {
        type: 'object',
        required: ['apiKey'],
        properties: { apiKey: { type: 'string' } },
      },
    }),
    endpoint(28, {
      method: 'POST',
      inputSchema: {
        type: 'object',
        required: ['delivery'],
        properties: { delivery: { type: 'object' } },
      },
    }),
    endpoint(29, {
      pathParams: [{ name: 'itemId', required: true, type: 'string' }],
    }),
    endpoint(30, {
      access: { kind: 'managed_resolvable', checkable: true, requiresFreshCheck: true },
      resourceUrl: null,
      url: null,
      inputSchema: {
        type: 'object',
        required: ['path'],
        properties: { path: { type: 'string' } },
      },
    }),
  ];

  for (const source of unsafe) {
    const result = buildIndexterToolResult({
      route: 'task',
      payload: { success: true, strongResults: [source], relatedResults: [] },
    });
    assert.equal(result.structuredContent.counts.endpoints, 1);
    assert.equal(result.structuredContent.results[0].requestInput, null);
    assert.equal(result.structuredContent.results[0].action.kind, 'endpoint_unavailable');
    assert.equal(result.structuredContent.results[0].action.reason, 'input_contract_unavailable');
    assert.equal(result._meta.indexterPayload.data.strongResults[0].requestInput, null);
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
  }
});

test('endpoint projection omits incomplete, malformed, and unavailable execution records', () => {
  const complete = endpointExecution();
  const unsafe = [
    endpoint(31, { execution: undefined }),
    ...Object.keys(complete).map((field, index) => {
      const missing = { ...complete };
      delete missing[field];
      return endpoint(32 + index, { execution: missing });
    }),
    endpoint(41, { execution: endpointExecution({ sideEffectful: 'false' }) }),
    endpoint(42, { execution: endpointExecution({ availability: 'catalog_only' }) }),
    endpoint(43, { execution: endpointExecution({ availability: 'unsupported' }) }),
    endpoint(44, { execution: endpointExecution({ userExecution: 'unsupported' }) }),
  ];

  for (const source of unsafe) {
    const result = buildIndexterToolResult({
      route: 'task',
      payload: { success: true, strongResults: [source], relatedResults: [] },
    });
    assert.deepEqual(result.structuredContent.results, []);
    assert.deepEqual(result.structuredContent.counts, {
      returned: 0,
      providers: 0,
      endpoints: 0,
      actors: 0,
    });
  }
});

test('discovery keeps malformed safety visible but unavailable while model projection omits it', () => {
  const payload = discoveryPayload();
  const endpointWithoutSafety = payload.providers[0].capabilityGroups[0].resources[0];
  delete endpointWithoutSafety.execution;
  payload.featuredOfferings = [];

  const projected = projectIndexterDiscoveryEndpointActions(payload);
  const appEndpoint = projected.providers[0].capabilityGroups[0].resources[0];
  assert.deepEqual(appEndpoint.action, {
    kind: 'endpoint_unavailable',
    label: 'Unavailable',
    state: 'unavailable',
    reason: 'safety_unavailable',
    resourceId: appEndpoint.resourceId,
    resourceUrl: appEndpoint.resourceUrl,
  });
  assert.equal(Object.hasOwn(appEndpoint, 'execution'), false);

  const result = buildIndexterToolResult({ route: 'overview', payload: projected });
  assert.equal(result.structuredContent.counts.endpoints, 0);
  assert.equal(result.structuredContent.results.some(({ kind }) => kind === 'endpoint'), false);
});

test('discovery carries a sanitized direct-query contract and disables unrepresentable input', () => {
  const payload = discoveryPayload();
  const source = payload.providers[0].capabilityGroups[0].resources[0];
  const publicUrl = 'https://x402.glassnode.com/v1/metadata/metric';
  const inputSchema = {
    type: 'object',
    required: ['path'],
    description: 'DISCOVERY_RAW_SCHEMA_PROSE',
    properties: {
      a: { type: 'string', description: 'Optional asset prose.', default: 'BTC' },
      path: { type: 'string', description: 'Required metric prose.' },
    },
  };
  for (const copy of [source, payload.featuredOfferings[0]]) {
    copy.resourceUrl = publicUrl;
    copy.inputSchema = inputSchema;
  }
  const projected = projectIndexterDiscoveryEndpointActions(payload);
  const appEndpoint = projected.providers[0].capabilityGroups[0].resources[0];

  assert.deepEqual(appEndpoint.requestInput, {
    version: 1,
    fields: [
      { name: 'a', location: 'query', type: 'string', required: false },
      { name: 'path', location: 'query', type: 'string', required: true },
    ],
  });
  assert.equal(appEndpoint.action.kind, 'review_endpoint');
  assert.equal(Object.hasOwn(appEndpoint, 'inputSchema'), false);
  assert.equal(Object.hasOwn(appEndpoint, 'pathParams'), false);
  const result = buildIndexterToolResult({ route: 'overview', payload: projected });
  assert.deepEqual(result.structuredContent.results.find(({ kind }) => kind === 'endpoint').requestInput, appEndpoint.requestInput);
  assert.doesNotMatch(JSON.stringify(result), /DISCOVERY_RAW_SCHEMA_PROSE|Optional asset prose|Required metric prose/);

  const unsafePayload = discoveryPayload();
  const unsafeSource = unsafePayload.providers[0].capabilityGroups[0].resources[0];
  const unsafeInputSchema = {
    type: 'object',
    required: ['apiKey'],
    properties: { apiKey: { type: 'string' } },
  };
  for (const copy of [unsafeSource, unsafePayload.featuredOfferings[0]]) {
    copy.inputSchema = unsafeInputSchema;
  }
  const unsafeProjected = projectIndexterDiscoveryEndpointActions(unsafePayload);
  const unsafeEndpoint = unsafeProjected.providers[0].capabilityGroups[0].resources[0];
  assert.equal(unsafeEndpoint.requestInput, null);
  assert.equal(unsafeEndpoint.action.kind, 'endpoint_unavailable');
  assert.equal(unsafeEndpoint.action.reason, 'input_contract_unavailable');
  const unsafeResult = buildIndexterToolResult({ route: 'overview', payload: unsafeProjected });
  assert.equal(unsafeResult.structuredContent.results.find(({ kind }) => kind === 'endpoint').action.kind, 'endpoint_unavailable');

  for (const marker of [
    { inputSchema: { published: true } },
    { pathParams: { published: true } },
  ]) {
    const markerPayload = discoveryPayload();
    for (const copy of [
      markerPayload.providers[0].capabilityGroups[0].resources[0],
      markerPayload.featuredOfferings[0],
    ]) Object.assign(copy, marker);
    const markerProjected = projectIndexterDiscoveryEndpointActions(markerPayload);
    const markerEndpoint = markerProjected.providers[0].capabilityGroups[0].resources[0];
    assert.equal(markerEndpoint.requestInput, null);
    assert.equal(markerEndpoint.action.kind, 'endpoint_unavailable');
    assert.equal(markerEndpoint.action.reason, 'input_contract_unavailable');
    const markerResult = buildIndexterToolResult({ route: 'overview', payload: markerProjected });
    assert.equal(markerResult.structuredContent.results.find(({ kind }) => kind === 'endpoint').action.kind, 'endpoint_unavailable');
  }
});

test('discovery canonicalizes a no-path endpoint URL for both resource and action identity', () => {
  const payload = discoveryPayload();
  const source = payload.providers[0].capabilityGroups[0].resources[0];
  source.resourceUrl = 'https://merchant.example.test';

  const projected = projectIndexterDiscoveryEndpointActions(payload);
  const endpointResult = projected.providers[0].capabilityGroups[0].resources[0];

  assert.equal(endpointResult.resourceUrl, 'https://merchant.example.test/');
  assert.equal(endpointResult.action.resourceUrl, endpointResult.resourceUrl);
});

test('provider projection includes actual endpoint and Actor offerings', () => {
  const payload = {
    ...discoveryPayload(),
    mode: 'provider',
    requestedProvider: 'Apify',
    featuredOfferings: [],
    page: {
      ...discoveryPayload().page,
      namespace: 'indexter.endpoint.provider-capabilities.v1',
      scope: 'provider_capabilities',
      order: 'curated_capability_breadth_v1',
      returned: 1,
    },
  };
  const result = buildIndexterToolResult({
    route: 'provider',
    provider: 'Apify',
    payload,
  });

  assert.equal(result.structuredContent.route, 'provider');
  assert.equal(result.structuredContent.requestedProvider, 'Apify');
  assert.deepEqual(
    result.structuredContent.results.map(({ kind }) => kind),
    ['provider', 'endpoint', 'actor'],
  );
  assert.equal(result.content[0].text, 'Indexter returned 2 offerings for this provider.');
  const projectedActor = result.structuredContent.results.find(({ kind }) => kind === 'actor');
  const widgetActor = result._meta.indexterPayload.data.providers[0].actorCatalog.items[0];
  assert.equal(projectedActor.price.label, '$0.001 per event');
  assert.equal(projectedActor.price.amount, widgetActor.pricing.primaryEvent.priceUsd);
  assert.equal(projectedActor.price.label.includes('per event'), !widgetActor.pricing.primaryEvent.isOneTime);
});

test('task projection retains legacy seller identity and exact endpoint action identity', () => {
  const legacyEndpoint = endpoint(3, {
    seller: 'Atlas Labs',
    sellerMeta: {
      displayName: 'Atlas Market Data',
      logoUrl: 'https://atlas.example.test/logo.png',
    },
  });
  delete legacyEndpoint.merchant;
  delete legacyEndpoint.provider;
  const payload = {
    ...taskPayload(),
    strongResults: [legacyEndpoint],
    relatedResults: [],
    strongCount: 1,
    relatedCount: 0,
    count: 1,
  };
  const result = buildIndexterToolResult({ route: 'task', payload });
  const projected = result.structuredContent.results[0];

  assert.equal(projected.merchant.providerKey, 'weather.example.test');
  assert.equal(projected.merchant.name, 'Atlas Market Data');
  assert.equal(projected.merchant.logoUrl, 'https://atlas.example.test/logo.png');
  assert.equal(projected.resourceId, legacyEndpoint.resourceId);
  assert.equal(projected.method, legacyEndpoint.method);
  assert.equal(projected.action.resourceUrl, legacyEndpoint.resourceUrl);
});

test('task projection preserves a canonical UUIDv7 resource for both model and widget', () => {
  const resourceId = '018f6f42-1234-7abc-8def-123456789abc';
  const payload = {
    ...taskPayload(),
    strongResults: [endpoint(7, { id: resourceId, resourceId })],
    relatedResults: [],
    strongCount: 1,
    relatedCount: 0,
    count: 1,
  };

  const result = buildIndexterToolResult({ route: 'task', payload });

  assert.equal(result.structuredContent.counts.returned, 1);
  assert.equal(result.structuredContent.results[0].resourceId, resourceId);
  assert.equal(result._meta.indexterPayload.data.count, 1);
  assert.equal(result._meta.indexterPayload.data.strongResults[0].resourceId, resourceId);
});

test('task projection requires explicit fresh-check access evidence', () => {
  for (const unsafe of [
    endpoint(8, { access: undefined }),
    endpoint(9, { access: { kind: 'unexpected', checkable: true, requiresFreshCheck: true } }),
    endpoint(10, { access: { kind: 'direct_url', checkable: false, requiresFreshCheck: true } }),
    endpoint(11, { access: { kind: 'direct_url', checkable: true, requiresFreshCheck: false } }),
  ]) {
    const payload = {
      ...taskPayload(),
      strongResults: [unsafe],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      count: 1,
    };

    const result = buildIndexterToolResult({ route: 'task', payload });
    assert.equal(result.structuredContent.counts.returned, 0);
    assert.deepEqual(result.structuredContent.results, []);
  }
});

test('task projection accepts public IP endpoints and rejects private IP endpoints', () => {
  const publicUrl = 'https://8.8.8.8/data';
  const privateUrl = 'https://127.0.0.1/data';
  const payload = {
    ...taskPayload(),
    strongResults: [
      endpoint(12, { url: publicUrl, resourceUrl: publicUrl }),
      endpoint(13, { url: privateUrl, resourceUrl: privateUrl }),
    ],
    relatedResults: [],
    strongCount: 2,
    relatedCount: 0,
    count: 2,
  };

  const result = buildIndexterToolResult({ route: 'task', payload });

  assert.equal(result.structuredContent.counts.returned, 1);
  assert.equal(result.structuredContent.results[0].action.resourceUrl, publicUrl);
});

test('partial provider totals are identified as incomplete catalog counts', () => {
  const payload = discoveryPayload();
  payload.providers[0].catalog.countsComplete = false;
  const result = buildIndexterToolResult({ route: 'overview', payload });

  assert.equal(
    result.structuredContent.warnings.some(({ code }) => (
      code === 'incomplete_catalog_counts'
    )),
    true,
  );
});

test('task payload is frozen to twelve results without cosmetic pagination', () => {
  const result = buildIndexterToolResult({ route: 'task', payload: taskPayload() });
  const render = result._meta.indexterPayload.data;

  assert.equal(result.structuredContent.results.length, INDEXTER_RESULT_LIMIT);
  assert.equal(result.structuredContent.counts.endpoints, INDEXTER_RESULT_LIMIT);
  assert.equal(render.strongResults.length, 10);
  assert.equal(render.relatedResults.length, 2);
  assert.equal(render.count, INDEXTER_RESULT_LIMIT);
  assert.equal(render.strongCount, 10);
  assert.equal(render.relatedCount, 2);
  for (const key of [
    'cursor',
    'hasMore',
    'nextCursor',
    'nextOffset',
    'offset',
    'page',
    'pagination',
    'searchResultSetId',
  ]) {
    assert.equal(Object.hasOwn(render, key), false, key);
  }
  assert.equal(result.content[0].text, 'Indexter returned 12 matches for this request.');
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('widget payload drops credential-shaped fields and never exposes session context', () => {
  const payload = {
    ...discoveryPayload(),
    authorization: 'Bearer private-value',
    sessionToken: 'private-session-token',
    authToken: 'plain-secret-auth-token',
    credential: 'plain-secret-credential',
    linkToken: 'plain-secret-link-token',
    mcpSessionId: 'plain-secret-mcp-session',
    mnemonic: 'plain-secret-mnemonic',
    nested: {
      safe: 'retained',
      apiKey: 'private-api-key',
      cookie: 'private-cookie',
      API_KEY: 'upper-case-private-api-key',
      oneTimeCode: 'plain-secret-one-time-code',
      otp: 'plain-secret-otp',
      passphrase: 'plain-secret-passphrase',
      sessionKey: 'plain-secret-session-key',
      opaque: 'Bearer abcdefghijklmnop',
    },
  };
  const result = buildIndexterToolResult({
    route: 'overview',
    payload,
    baseMeta: { safe: 'retained' },
  });
  const serialized = JSON.stringify(result._meta.indexterPayload);

  assert.match(serialized, /retained/);
  assert.doesNotMatch(
    serialized,
    /private-value|private-session|private-api|private-cookie|plain-secret|abcdefghijklmnop/,
  );
  assert.equal(
    result.structuredContent.warnings.some(({ code }) => (
      code === 'render_payload_redacted'
    )),
    true,
  );
  assert.equal(Object.hasOwn(result._meta, 'sessionId'), false);
});

test('bounded payload drops encoded credential keys and cannot mutate object prototypes', () => {
  const credentialFields = {
    'ＡＰＩＫｅｙ': 'fullwidthkeysecret',
    'ＡＰＩ＿ｋｅｙ': 'fullwidthunderscoresecret',
    'Ａｕｔｈｏｒｉｚａｔｉｏｎ': 'fullwidthauthorizationsecret',
    'Ｃｏｏｋｉｅ': 'fullwidthcookiesecret',
    '%61pi_key': 'encodedprefixsecret',
    'api%5Fkey': 'encodedundersecret',
    'api%255Fkey': 'doubleencodedundersecret',
    'Authori%7Aation': 'encodedauthorizationsecret',
    'Coo%6Bie': 'encodedcookiesecret',
  };
  const prototypeFields = JSON.parse(
    '{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"},'
      + '"prototype":{"polluted":"yes"},"%5F%5Fproto%5F%5F":{"polluted":"yes"}}',
  );
  const source = {
    safe: { label: 'retained' },
    ...credentialFields,
    ...prototypeFields,
  };

  assert.equal({}.polluted, undefined);
  const bounded = boundedIndexterPayload('overview', source);
  const serializedBounded = JSON.stringify(bounded.data);

  assert.equal(bounded.redacted, true);
  assert.deepEqual(bounded.data.safe, { label: 'retained' });
  assert.equal(Object.getPrototypeOf(bounded.data), Object.prototype);
  assert.equal(Object.getPrototypeOf(bounded.data).polluted, undefined);
  assert.equal(Object.hasOwn(bounded.data, '__proto__'), false);
  assert.equal(Object.hasOwn(bounded.data, 'constructor'), false);
  assert.equal(Object.hasOwn(bounded.data, 'prototype'), false);
  assert.equal({}.polluted, undefined);
  assert.doesNotMatch(serializedBounded, /secret|polluted|%5F|ＡＰＩ|Ａｕ|Ｃｏ/u);

  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy(
      'indexter_search',
      buildIndexterToolResult({
        route: 'overview',
        payload: { ...discoveryPayload(), unsafeFields: source },
      }),
    ),
    { requestId: 'unsafe-object-key-regression' },
  );
  const serializedResult = JSON.stringify(result);
  assert.doesNotMatch(serializedResult, /secret|polluted|%5F|ＡＰＩ|Ａｕ|Ｃｏ/u);
  assert.equal({}.polluted, undefined);
  assert.ok(
    Buffer.byteLength(serializedResult, 'utf8') <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES,
  );
});

test('task result withholds credentialed endpoints and scrubs the complete wire result', () => {
  const fragment = endpoint(20, {
    resourceUrl: 'https://merchant.example.test/x#access_token=fragsecret123',
    description: 'Authorization: Basic dXNlcjpzdXBlcnNlY3JldA==; X-API-Key: assignedsecret123',
  });
  const encodedFragment = endpoint(21, {
    resourceUrl: 'https://merchant.example.test/x#access%255Ftoken=encodedsecret123',
  });
  const safe = endpoint(22, {
    nested: {
      'Authorization: objectsecret123': 'must be removed with its unsafe key',
      label: 'retained',
    },
  });
  const credentialCopy = [
    'Authorization: Basic dXNlcjpwYXNz',
    'Basic dTpw',
    'Proxy-Authorization: Basic YWJjOmRlZg==',
    'Authorization: token ghp_1234567890abcdef',
    'Authorization: ApiKey abcdefghijklmnop',
    'Authorization: Digest username="Mufasa", realm="test", nonce="abc12345", response="deadbeefcafebabe"',
    'Cookie: session=abcdefghijklmnop',
    'Set-Cookie: session=setcookie-secret-123',
  ].map((description, index) => endpoint(23 + index, { description }));
  const payload = {
    ...taskPayload(),
    strongResults: [fragment, encodedFragment, safe, ...credentialCopy],
    relatedResults: [],
    strongCount: 3 + credentialCopy.length,
    relatedCount: 0,
    count: 3 + credentialCopy.length,
  };

  const built = buildIndexterToolResult({ route: 'task', payload });
  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy('indexter_search', built),
    { requestId: 'credential-regression' },
  );
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(
    serialized,
    /fragsecret123|encodedsecret123|dXNlcjpzdXBlcnNlY3JldA==|assignedsecret123|objectsecret123|dXNlcjpwYXNz|dTpw|YWJjOmRlZg==|ghp_1234567890abcdef|abcdefghijklmnop|Mufasa|abc12345|deadbeefcafebabe|setcookie-secret-123/,
  );
  assert.deepEqual(
    result.structuredContent.results.map(({ resourceId }) => resourceId),
    [safe, ...credentialCopy].map(({ resourceId }) => resourceId),
  );
  assert.deepEqual(
    result._meta.indexterPayload.data.strongResults.map(({ resourceId }) => resourceId),
    [safe, ...credentialCopy].map(({ resourceId }) => resourceId),
  );
  assert.equal(result._meta.indexterPayload.data.strongCount, 1 + credentialCopy.length);
  assert.equal(result._meta.indexterPayload.data.count, 1 + credentialCopy.length);
  assert.equal(result._meta.indexterPayload.data.strongResults[0].nested.label, 'retained');
  assert.equal(
    result.structuredContent.warnings.some(({ code }) => code === 'render_payload_redacted'),
    true,
  );
});

test('complete task result scrubs raw and encoded HTTP userinfo from prose fields', () => {
  const unsafeCopy = [
    endpoint(72, {
      description: 'Connect at https://userinfo-user:userinfo-pass@example.com/path',
    }),
    endpoint(73, {
      description: 'Connect at https%3A%2F%2Fencoded-user%3Aencoded-pass%40example.com%2Fpath',
    }),
  ];
  const payload = {
    ...taskPayload(),
    strongResults: unsafeCopy,
    relatedResults: [],
    strongCount: unsafeCopy.length,
    relatedCount: 0,
    count: unsafeCopy.length,
  };

  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy(
      'indexter_search',
      buildIndexterToolResult({ route: 'task', payload }),
    ),
    { requestId: 'userinfo-credential-regression' },
  );
  const serialized = JSON.stringify(result);

  assert.doesNotMatch(
    serialized,
    /userinfo-user|userinfo-pass|encoded-user|encoded-pass|https%3A%2F%2F/i,
  );
  assert.equal(result.structuredContent.results.length, unsafeCopy.length);
  assert.equal(
    result.structuredContent.results.every(
      ({ summary }) => summary === 'Credential-like text was removed.',
    ),
    true,
  );
  assert.equal(
    result._meta.indexterPayload.data.strongResults.every(
      ({ description }) => description === 'Credential-like text was removed.',
    ),
    true,
  );
});

test('complete stamped task result rejects nested and over-limit credential encodings', () => {
  const encodedDescriptions = [
    percentEncodeTimes('Authorization: Bearer nestedbearersecret', 3),
    percentEncodeTimes(
      'See https://merchant.example.test/path?api_key=nestedquerysecret',
      3,
    ),
    percentEncodeTimes(
      'Connect at https://nested-user:nested-pass@example.com/path',
      3,
    ),
    percentEncodeTimes('Cookie: session=nestedcookiesecret', 3),
    percentEncodeTimes('Authorization: Bearer deepbearersecret', 9),
    percentEncodeTimes('Ordinary text before a hidden credential boundary.', 9),
    'Ａｕｔｈｏｒｉｚａｔｉｏｎ： Ｂｅａｒｅｒ nestedunicodeauthsecret',
    'Authori\u200Bzation: Bea\u200Brer nestedinvisibleauthsecret',
    'api\u200B_key=nestedinvisibleapikeysecret',
    'Cookie： session=nestedunicodecookiesecret',
    percentEncodeTimes('Coo\u200Bkie: session=nestedencodedcookiesecret', 3),
    '%3Fapi%5Fkey=nestedmalformedquerysecret%ZZ',
    'https%3A%2F%2Fexample.com%2F%3Fapi%5Fkey%3Dnestedmalformedurlsecret%ZZ',
    'Authorization%3A%20Bearer%20nestedmalformedauthsecret%ZZ',
    'Cookie%3A%20session%3Dnestedmalformedcookiesecret%ZZ',
    '%253Fapi%255Fkey%253Dnestedmalformeddoublesecret%ZZ',
    'Authori\nzation: Bea\nrer nestedcontrolauthsecret',
    'api\n_key=nestedcontrolapikeysecret',
    'Coo\tkie: sess\nion=nestedcontrolcookiesecret',
  ];
  const unsafeCopy = encodedDescriptions.map((description, index) => endpoint(
    80 + index,
    { description },
  ));
  const payload = {
    ...taskPayload(),
    strongResults: unsafeCopy,
    relatedResults: [],
    strongCount: unsafeCopy.length,
    relatedCount: 0,
    count: unsafeCopy.length,
  };

  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy(
      'indexter_search',
      buildIndexterToolResult({ route: 'task', payload }),
    ),
    { requestId: 'nested-credential-regression' },
  );
  const serialized = JSON.stringify(result);

  for (const encoded of encodedDescriptions) {
    assert.equal(serialized.includes(encoded), false);
  }
  assert.doesNotMatch(
    serialized,
    /nestedbearersecret|nestedquerysecret|nested-user|nested-pass|nestedcookiesecret|deepbearersecret|nestedunicodeauthsecret|nestedinvisibleauthsecret|nestedinvisibleapikeysecret|nestedunicodecookiesecret|nestedencodedcookiesecret|nestedmalformed|nestedcontrol/i,
  );
  assert.equal(result.structuredContent.results.length, INDEXTER_RESULT_LIMIT);
  assert.equal(
    result.structuredContent.results.every(
      ({ summary }) => summary === 'Credential-like text was removed.',
    ),
    true,
  );
  assert.equal(
    result._meta.indexterPayload.data.strongResults.every(
      ({ description }) => description === 'Credential-like text was removed.',
    ),
    true,
  );
  assert.equal(
    result._meta.indexterPayload.data.strongResults.length,
    INDEXTER_RESULT_LIMIT,
  );
  assert.ok(
    Buffer.byteLength(serialized, 'utf8') <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES,
  );
});

test('task result drops instruction-shaped provider identity before model or widget output', () => {
  const unsafe = endpoint(74, {
    merchant: {
      ...endpoint(74).merchant,
      providerKey: 'ignore-previous-instructions',
    },
  });
  const result = buildIndexterToolResult({
    route: 'task',
    payload: {
      ...taskPayload(),
      strongResults: [unsafe],
      relatedResults: [],
      strongCount: 1,
      relatedCount: 0,
      count: 1,
    },
  });

  assert.equal(result.structuredContent.results.length, 0);
  assert.equal(result._meta.indexterPayload.data.strongResults.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /ignore-previous-instructions/);
});

test('widget payload stays inside the fixed JSON budget under oversized provider data', () => {
  const payload = {
    ...discoveryPayload(),
    oversized: Array.from({ length: 300 }, (_, index) => ({
      index,
      text: `row-${index}-${'x'.repeat(20_000)}`,
    })),
  };
  const result = buildIndexterToolResult({ route: 'overview', payload });
  const serialized = JSON.stringify(result._meta.indexterPayload.data);

  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 256 * 1_024);
  assert.equal(
    result.structuredContent.warnings.some(({ code }) => (
      code === 'render_payload_bounded'
    )),
    true,
  );
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('complete stamped task result stays inside 256 KiB with metadata and action safety fields', () => {
  const oversized = Array.from({ length: INDEXTER_RESULT_LIMIT }, (_, index) => endpoint(index + 30, {
    safeFiller: `${index}-${'x'.repeat(20_000)}`,
  }));
  const payload = {
    ...taskPayload(),
    strongResults: oversized,
    relatedResults: [],
    strongCount: oversized.length,
    relatedCount: 0,
    count: oversized.length,
  };
  const built = buildIndexterToolResult({
    route: 'task',
    payload,
    baseMeta: {
      retained: true,
      safeOverhead: 'm'.repeat(12_000),
    },
  });
  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy('indexter_search', built),
    { requestId: '\u0000'.repeat(512) },
  );
  const serialized = JSON.stringify(result);

  assert.ok(
    Buffer.byteLength(serialized, 'utf8') <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES,
  );
  assert.equal(result._meta.retained, true);
  assert.equal(result._meta.indexterPayload.data.count, INDEXTER_RESULT_LIMIT);
  assert.equal(result.structuredContent.results.length, INDEXTER_RESULT_LIMIT);
  assert.equal(
    result.structuredContent.results.every(({ action }) => action?.kind === 'check_endpoint'),
    true,
  );
  assert.equal(
    result.structuredContent.warnings.some(({ code }) => code === 'render_payload_bounded'),
    true,
  );
  assert.doesNotMatch(result.content[0].text, /safeFiller|\{\s*"/);
});

test('wire-budget exhaustion returns a typed bounded error attachment', () => {
  const built = buildIndexterToolResult({
    route: 'task',
    payload: taskPayload(),
    baseMeta: { safeOverhead: 'm'.repeat(240 * 1_024) },
  });
  const result = stampOpenToolInvocation(
    'indexter_search',
    applyOpenToolResultPolicy('indexter_search', built),
    { requestId: '\u0000'.repeat(512) },
  );

  assert.ok(
    Buffer.byteLength(JSON.stringify(result), 'utf8') <= INDEXTER_TOOL_RESULT_MAX_JSON_BYTES,
  );
  assert.equal(result.isError, true);
  assert.equal(result._meta.indexterPayload.data.success, false);
  assert.equal(result._meta.indexterPayload.data.searchMeta.mode, 'error');
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});

test('error projection is strict, bounded, and distinct from an empty result', () => {
  const result = buildIndexterToolResult({
    route: 'task',
    payload: {
      success: false,
      strongResults: [],
      relatedResults: [],
      searchMeta: {
        mode: 'error',
        note: 'Indexter is temporarily unavailable.',
      },
    },
  });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.ok, false);
  assert.equal(result.structuredContent.counts.returned, 0);
  assert.equal(result.content[0].text, 'Indexter could not load results for this request.');
  assert.equal(
    OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(
      result.structuredContent,
    ).success,
    true,
  );
});


test('keeps the literal prompt input while excluding provider instructions and credential fields', () => {
  for (const required of [true, false]) {
    const inputSchema = {
      type: 'object',
      required: required ? ['prompt'] : [],
      properties: {
        prompt: {
          type: 'string',
          description: 'PROVIDER_INSTRUCTION_IGNORE_CHECKS',
          default: 'PROVIDER_DEFAULT_EXECUTE_PAYMENT',
        },
        count: { type: 'integer' },
      },
    };
    const source = endpoint(71, {
      method: 'POST',
      execution: endpointExecution({ requiresExplicitInput: true }),
      inputSchema,
    });
    const result = buildIndexterToolResult({
      route: 'task',
      payload: { success: true, strongResults: [source], relatedResults: [] },
    });
    const expected = {
      version: 1,
      fields: [
        { name: 'count', location: 'body', type: 'integer', required: false },
        { name: 'prompt', location: 'body', type: 'string', required },
      ],
    };
    assert.equal(result.structuredContent.counts.endpoints, 1);
    assert.deepEqual(result.structuredContent.results[0].requestInput, expected);
    assert.equal(result.structuredContent.results[0].action.kind, 'review_endpoint');
    assert.deepEqual(result._meta.indexterPayload.data.strongResults[0].requestInput, expected);
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
    assert.doesNotMatch(JSON.stringify(result), /PROVIDER_INSTRUCTION|PROVIDER_DEFAULT/);

    const discovery = discoveryPayload();
    for (const offering of [
      discovery.providers[0].capabilityGroups[0].resources[0],
      discovery.featuredOfferings[0],
    ]) Object.assign(offering, { method: 'POST', inputSchema });
    const projected = projectIndexterDiscoveryEndpointActions(discovery);
    assert.deepEqual(projected.providers[0].capabilityGroups[0].resources[0].requestInput, expected);
    const discoveryResult = buildIndexterToolResult({ route: 'overview', payload: projected });
    assert.deepEqual(discoveryResult.structuredContent.results.find(({ kind }) => kind === 'endpoint').requestInput, expected);
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(discoveryResult.structuredContent).success, true);
    assert.doesNotMatch(JSON.stringify(discoveryResult), /PROVIDER_INSTRUCTION|PROVIDER_DEFAULT/);
  }

  for (const name of ['apiKey', 'system_prompt', 'ignoreInstructions', 'prompt_override']) {
    const result = buildIndexterToolResult({
      route: 'task',
      payload: {
        success: true,
        strongResults: [endpoint(72, {
          method: 'POST',
          inputSchema: { type: 'object', required: [name], properties: { [name]: { type: 'string' } } },
        })],
        relatedResults: [],
      },
    });
    assert.equal(result.structuredContent.counts.endpoints, 1, name);
    assert.equal(result.structuredContent.results[0].requestInput, null);
    assert.equal(result.structuredContent.results[0].action.kind, 'endpoint_unavailable');
    assert.equal(JSON.stringify(result).includes(name), false);
  }
});


test('retains primitive body input and still sanitizes object HTTP envelopes', () => {
  const bodyField = { type: 'string', description: 'BODY_PROVIDER_PROSE' };
  const schemas = [
    { type: 'object', required: ['body'], properties: { body: bodyField } },
    ...['type', 'method', 'bodyType'].map((marker) => ({
      type: 'object', required: ['body', marker], properties: {
        [marker]: { type: 'string' },
        body: { type: 'object', required: ['body'], properties: { body: bodyField } },
      },
    })),
  ];
  for (const inputSchema of schemas) {
    const source = endpoint(73, { method: 'POST', inputSchema });
    const result = buildIndexterToolResult({
      route: 'task',
      payload: { success: true, strongResults: [source], relatedResults: [] },
    });
    assert.equal(result.structuredContent.counts.endpoints, 1);
    assert.deepEqual(result.structuredContent.results[0].requestInput, {
      version: 1,
      fields: [{ name: 'body', location: 'body', type: 'string', required: true }],
    });
    assert.equal(result.structuredContent.results[0].action.kind, 'review_endpoint');
    assert.doesNotMatch(JSON.stringify(result), /BODY_PROVIDER_PROSE/);
  }
  const unsafeWrapper = endpoint(74, {
    method: 'POST',
    inputSchema: { type: 'object', required: ['body', 'method'], properties: {
      method: { type: 'string' },
      body: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string' } } },
    } },
  });
  const rejected = buildIndexterToolResult({
    route: 'task',
    payload: { success: true, strongResults: [unsafeWrapper], relatedResults: [] },
  });
  assert.equal(rejected.structuredContent.counts.endpoints, 1);
  assert.equal(rejected.structuredContent.results[0].requestInput, null);
  assert.equal(rejected.structuredContent.results[0].action.kind, 'endpoint_unavailable');
  assert.doesNotMatch(JSON.stringify(rejected), /apiKey/);
});

test('nested input listing retains useful identity and cannot become an executable model continuation', () => {
  const source = endpoint(75, {
    method: 'POST',
    description: 'Send a message with structured delivery options.',
    inputSchema: { type: 'object', required: ['delivery'], properties: {
      delivery: { type: 'object', properties: { destination: { type: 'string' } } },
    } },
  });
  const result = buildIndexterToolResult({ route: 'task', payload: {
    success: true, strongResults: [source], relatedResults: [],
  } });
  const listing = result.structuredContent.results[0];
  assert.equal(listing.resourceId, source.resourceId);
  assert.equal(listing.summary, source.description);
  assert.equal(listing.requestInput, null);
  assert.equal(listing.action.kind, 'endpoint_unavailable');
  assert.equal(listing.action.reason, 'input_contract_unavailable');
  assert.doesNotMatch(JSON.stringify(result), /"inputSchema"|"destination"|"check_endpoint"|"review_endpoint"/);
  const schema = OPEN_TOOL_CONTRACTS.indexter_search.outputSchema;
  assert.equal(schema.safeParse(result.structuredContent).success, true);
  const inventedInput = structuredClone(result.structuredContent);
  inventedInput.results[0].requestInput = { version: 1, fields: [] };
  assert.equal(schema.safeParse(inventedInput).success, false);
  const forgedReady = structuredClone(result.structuredContent);
  forgedReady.results[0].action = { ...listing.action, kind: 'check_endpoint', state: 'ready_for_check' };
  assert.equal(schema.safeParse(forgedReady).success, false);
});


test('an ordinary nested body object is unavailable rather than flattened into executable fields', () => {
  for (const marker of [null, 'method']) {
    const inputSchema = {
      type: 'object', required: ['body'], properties: {
        ...(marker ? { [marker]: { type: 'string' } } : {}),
        body: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
      },
    };
    const result = buildIndexterToolResult({ route: 'task', payload: {
      success: true, strongResults: [endpoint(76, { method: 'POST', inputSchema })], relatedResults: [],
    } });
    assert.equal(result.structuredContent.counts.endpoints, 1);
    const listing = result.structuredContent.results[0];
    assert.equal(listing.requestInput, null);
    assert.equal(listing.action.kind, 'endpoint_unavailable');
    assert.equal(listing.action.reason, 'input_contract_unavailable');
    assert.equal(result._meta.indexterPayload.data.strongResults[0].requestInput, null);
    assert.doesNotMatch(JSON.stringify(result), /"name":"text"|"review_endpoint"|"check_endpoint"/);
    assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
  }
});

test('projects Xona image inputs with bounded optional primitive arrays through task and overview', () => {
  for (const type of ['string', 'number', 'integer', 'boolean']) {
    for (const required of [false, true]) {
      const inputSchema = { type: 'object', required: required ? ['prompt', 'referenceImage'] : ['prompt'],
        properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string' },
          referenceImage: { type: 'array', items: { type, description: 'UNTRUSTED_ITEM_PROSE' }, minItems: 1, maxItems: 5 } }, additionalProperties: false };
      const source = endpoint(81, { method: 'POST', inputSchema });
      const result = buildIndexterToolResult({ route: 'task', payload: { success: true, strongResults: [source], relatedResults: [] } });
      const projected = result.structuredContent.results[0];
      assert.equal(projected.action.kind, 'review_endpoint');
      const expected = { name: 'referenceImage', location: 'body', type: 'array', required, items: { type }, minItems: 1, maxItems: 5 };
      assert.deepEqual(projected.requestInput.fields.find(f => f.name === 'referenceImage'), expected);
      assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(result.structuredContent).success, true);
      assert.deepEqual(result._meta.indexterPayload.data.strongResults[0].requestInput, projected.requestInput);
      assert.doesNotMatch(JSON.stringify(result), /UNTRUSTED_ITEM_PROSE/);
      const discovery = discoveryPayload();
      for (const offering of [discovery.providers[0].capabilityGroups[0].resources[0], discovery.featuredOfferings[0]])
        Object.assign(offering, { method: 'POST', inputSchema });
      const overview = buildIndexterToolResult({ route: 'overview', payload: projectIndexterDiscoveryEndpointActions(discovery) });
      const found = overview.structuredContent.results.find(r => r.requestInput?.fields.some(f => f.name === 'referenceImage'));
      assert.deepEqual(found.requestInput.fields.find(f => f.name === 'referenceImage'), expected);
      assert.equal(OPEN_TOOL_CONTRACTS.indexter_search.outputSchema.safeParse(overview.structuredContent).success, true);
    }
  }
});

test('array projection rejects unsupported shapes and credentials without silently dropping optional fields', () => {
  for (const array of [
    { type: 'array' }, { type: 'array', items: { type: 'object' } },
    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
    { type: 'array', items: { type: ['string', 'number'] } },
    { type: 'array', items: { type: 'string' }, minItems: 33 },
    { type: 'array', items: { type: 'string' }, maxItems: -1 },
    { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 1 },
    { type: 'array', items: { type: 'string' }, maxItems: 1.5 },
    { type: 'array', items: { type: 'string' }, maxItems: null },
    ...['$ref', '$dynamicRef', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'enum', 'const', 'uniqueItems', 'pattern', 'minimum', 'maxLength'].flatMap(key => [
      { type: 'array', items: { type: 'string' }, [key]: [] },
      { type: 'array', items: { type: 'string', [key]: [] } },
    ]),
  ]) {
    const result = buildIndexterToolResult({ route: 'task', payload: { success: true, strongResults: [endpoint(82, {
      method: 'POST', inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' }, referenceImage: array } },
    })], relatedResults: [] } });
    assert.equal(result.structuredContent.results[0].requestInput, null);
    assert.equal(result.structuredContent.results[0].action.reason, 'input_contract_unavailable');
  }
  for (const name of ['apiKey', 'system_prompt']) {
    const result = projectIndexterDiscoveryEndpointActions({ featuredOfferings: [endpoint(83, { method: 'POST', inputSchema: {
      type: 'object', properties: { [name]: { type: 'array', items: { type: 'string' } } },
    } })] });
    assert.equal(result.featuredOfferings[0].requestInput, null);
  }
  const bounded = projectIndexterDiscoveryEndpointActions({ featuredOfferings: [endpoint(84, { method: 'POST', inputSchema: {
    type: 'object', properties: { references: { type: 'array', items: { type: 'string' } } },
  } })] }).featuredOfferings[0];
  assert.deepEqual(bounded.requestInput.fields[0], { name: 'references', location: 'body', type: 'array', required: false, items: { type: 'string' }, minItems: 0, maxItems: 32 });
});
