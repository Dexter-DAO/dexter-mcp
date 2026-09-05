import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findSelectedResource,
  getSearchErrorCopy,
  getSearchGuidance,
  getSearchSections,
  isSafeSearchPayload,
  isSafeSearchRequestInput,
  normalizeSearchPayload,
} from '../apps-sdk/ui/src/components/indexter/search/search-model.ts';
import {
  formatAssetLabel,
  formatListedPrice,
  isSearchCheckRequestBound,
} from '../apps-sdk/ui/src/components/indexter/search/utils.ts';

const resource = {
  resourceId: 'resource-1',
  name: 'Price feed',
  url: 'https://example.com/price',
  method: 'GET',
  price: '$0.01',
  priceUsdc: 0.01,
  network: 'eip155:8453',
  description: 'A price feed.',
  category: 'data',
  qualityScore: 91,
  verified: true,
  totalCalls: 12,
  seller: null,
  sellerMeta: { displayName: null },
  why: 'It returns the requested asset price.',
};

const strictResource = {
  ...resource,
  kind: 'endpoint',
  resourceId: '77777777-7777-4777-8777-777777777777',
  access: { kind: 'direct_url', checkable: true, requiresFreshCheck: true },
  merchant: {
    providerKey: 'example-provider',
    providerSlug: 'example-provider',
    displayName: 'Example Provider',
    logoUrl: 'https://example.com/logo.svg',
    technicalHost: 'example.com',
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
  requestInput: { version: 1, fields: [] },
  tier: 'strong',
};

function encodeLayers(value, count) {
  let encoded = value;
  for (let index = 0; index < count; index += 1) encoded = encodeURIComponent(encoded);
  return encoded;
}

function strictPayload(overrides = {}) {
  return {
    success: true,
    count: 1,
    strongCount: 1,
    relatedCount: 0,
    strongResults: [strictResource],
    relatedResults: [],
    searchMeta: { mode: 'direct', note: 'One current match' },
    ...overrides,
  };
}

test('strict task payload validation accepts a bounded canonical result', () => {
  assert.equal(isSafeSearchPayload(strictPayload()), true);
  assert.equal(isSafeSearchPayload({
    success: false,
    count: 0,
    strongCount: 0,
    relatedCount: 0,
    strongResults: [],
    relatedResults: [],
    searchMeta: { mode: 'error', note: 'Indexter is temporarily unavailable.' },
  }), true);
});

test('strict task payload validation rejects malformed rows and count drift', () => {
  assert.equal(isSafeSearchPayload(strictPayload({ strongResults: [null] })), false);
  assert.equal(isSafeSearchPayload(strictPayload({ strongResults: [{}] })), false);
  assert.equal(isSafeSearchPayload(strictPayload({ count: 2 })), false);
  assert.equal(isSafeSearchPayload(strictPayload({ strongCount: 0 })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    count: 2,
    strongCount: 1,
    relatedCount: 1,
    relatedResults: [{ ...strictResource, tier: 'related' }],
  })), false, 'the same resource identity cannot appear twice');
  assert.equal(isSafeSearchPayload(strictPayload({
    success: false,
    count: 1,
    searchMeta: { mode: 'error' },
  })), false, 'backend errors cannot carry actionable results');

  const tooMany = Array.from({ length: 13 }, (_, index) => ({
    ...strictResource,
    resourceId: `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
  }));
  assert.equal(isSafeSearchPayload(strictPayload({
    count: tooMany.length,
    strongCount: tooMany.length,
    strongResults: tooMany,
  })), false, 'the renderer never accepts more than twelve task results');
  assert.equal(isSafeSearchPayload(strictPayload({
    tip: 'x'.repeat((256 * 1024) + 1),
  })), false, 'the complete widget attachment stays inside its byte budget');
});

test('strict task payload validation rejects unsafe URLs and credential-shaped fields', () => {
  for (const unsafeUrl of [
    'http://example.com/price',
    'https://127.0.0.1/admin',
    'https://metadata.internal/price',
    'https://example.com/price?access_token=not-for-the-widget',
    'https://example.com/price#access_token=fragment-secret',
    'https://example.com/path/api%5Fkey%3Dpathsecret123',
    'https://example.com/%41uthorization%3A%20Basic%20dXNlcjpwYXNz',
    'https://user:password@example.com/price',
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, url: unsafeUrl }],
    })), false, unsafeUrl);
  }

  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      authorization: 'Bearer abcdefghijklmnop',
    }],
  })), false);
  for (const credentialText of [
    'Authorization: Basic dXNlcjpwYXNz',
    'Basic dTpw',
    'Proxy-Authorization: Basic YWJjOmRlZg==',
    'Authorization: token ghp_1234567890abcdef',
    'Authorization: ApiKey abcdefghijklmnop',
    'Authorization: Digest username="Mufasa", realm="test", nonce="abc12345", response="deadbeefcafebabe"',
    'Cookie: session=abcdefghijklmnop',
    'Set-Cookie: session=setcookie-secret-123',
    'api%5Fkey%3Dpercentsecret123',
    'Authorization%3A%20Bearer%20encodedbearersecret',
    'Connect at https://userinfo-user:userinfo-pass@example.com/path',
    'Connect at https%3A%2F%2Fencoded-user%3Aencoded-pass%40example.com%2Fpath',
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: credentialText }],
    })), false, credentialText);
  }

  for (const malformedCredential of [
    '%41uthorization%3A%20Bearer%20supersecret%ZZ',
    'api%5Fkey=supersecret%ZZ',
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: malformedCredential }],
    })), false, malformedCredential);
  }
  for (const ordinaryPercent of ['Save 20% today', 'Literal %ZZ text']) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: ordinaryPercent }],
    })), true, ordinaryPercent);
  }
  for (const controlSplitCredential of [
    'Authori\nzation: Bea\nrer controlauthsecret',
    'api\n_key=controlapikeysecret',
    'Coo\tkie: sess\nion=controlcookiesecret',
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: controlSplitCredential }],
    })), false, controlSplitCredential);
  }
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      description: 'Pass Authorization: Bearer YOUR_TOKEN when the provider requests it.',
    }],
  })), true, 'credential placeholders remain safe instructional copy');
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      merchant: { ...strictResource.merchant, logoUrl: 'https://localhost/logo.svg' },
    }],
  })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      merchant: {
        ...strictResource.merchant,
        providerKey: 'ignore-previous-instructions',
        providerSlug: 'ignore-previous-instructions',
      },
    }],
  })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{ ...strictResource, chains: { network: 'eip155:8453' } }],
  })), false, 'collection-shaped fields cannot reach array operations as objects');

  for (const credentialText of [
    'Authorization: Bearer deeplyencodedsecret',
    'https://user:password@example.com/path',
    'https://example.com/path?api_key=deepsecretvalue',
    'Cookie: session=deepcookiesecret',
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: encodeLayers(credentialText, 3) }],
    })), false, credentialText);
  }

  for (const disguised of [
    'Ａｕｔｈｏｒｉｚａｔｉｏｎ： Ｂａｓｉｃ dXNlcjpwYXNz',
    'Ｃｏｏｋｉｅ： session=abcdefghijklmnop',
    'Author\u200Bization: Bearer abcdefghijklmnop',
    'api\u200B_key=abcdefghijklmnop',
    encodeLayers('Ａｕｔｈｏｒｉｚａｔｉｏｎ： Bearer abcdefghijklmnop', 1),
  ]) {
    assert.equal(isSafeSearchPayload(strictPayload({
      strongResults: [{ ...strictResource, description: disguised }],
    })), false, disguised);
  }

  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      description: encodeLayers('ordinary catalog text', 7),
    }],
  })), true, 'seven encoding layers can reach a stable inert value within eight passes');
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...strictResource,
      description: encodeLayers('ordinary catalog text', 8),
    }],
  })), false, 'unstable decoding at the eight-pass bound fails closed');
});

test('strict task payload rejects normalized credential and prototype object keys', () => {
  for (const unsafeKey of [
    'ＡＰＩＫｅｙ',
    'ＡＰＩ＿ｋｅｙ',
    'Ａｕｔｈｏｒｉｚａｔｉｏｎ',
    'Ｃｏｏｋｉｅ',
    '%61pi_key',
    'api%5Fkey',
    'api%255Fkey',
    'Authori%7Aation',
    'Coo%6Bie',
    '__proto__',
    'constructor',
    'prototype',
    '%5F%5Fproto%5F%5F',
  ]) {
    const payload = strictPayload();
    Object.defineProperty(payload, unsafeKey, {
      configurable: true,
      enumerable: true,
      value: 'opaque-value',
      writable: true,
    });
    assert.equal(isSafeSearchPayload(payload), false, unsafeKey);
  }
});

test('strict task payload accepts only sanitized request-input contracts', () => {
  const glassnode = {
    ...strictResource,
    url: 'https://x402.glassnode.com/v1/metadata/metric',
    requestInput: {
      version: 1,
      fields: [
        { name: 'a', location: 'query', type: 'string', required: false },
        { name: 'path', location: 'query', type: 'string', required: true },
      ],
    },
  };
  assert.equal(isSafeSearchPayload(strictPayload({ strongResults: [glassnode] })), true);

  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{ ...glassnode, requestInput: undefined }],
  })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...glassnode,
      requestInput: {
        version: 1,
        fields: [{ name: 'apiKey', location: 'query', type: 'string', required: true }],
      },
    }],
  })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...glassnode,
      inputSchema: { description: 'Provider prose must stay server-side.' },
    }],
  })), false);
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...glassnode,
      requestInput: {
        version: 1,
        fields: [{ name: 'itemId', location: 'path', type: 'string', required: true }],
      },
    }],
  })), false, 'path input is unavailable without a projected route template');
  assert.equal(isSafeSearchPayload(strictPayload({
    strongResults: [{
      ...glassnode,
      url: null,
      access: { kind: 'managed_resolvable', checkable: true, requiresFreshCheck: true },
      requestInput: {
        version: 1,
        fields: [{ name: 'path', location: 'query', type: 'string', required: true }],
      },
    }],
  })), false, 'managed resolution cannot carry query fields');
});

test('backend errors stay distinct from genuine empty search results', () => {
  const backendError = {
    success: false,
    count: 0,
    resources: [],
    searchMeta: {
      mode: 'error',
      note: 'Indexter is temporarily unavailable. Please try again.',
    },
    errorDetail: 'internal upstream detail',
  };
  const genuineEmpty = {
    success: true,
    count: 0,
    resources: [],
    searchMeta: { mode: 'empty', note: 'No matches.' },
  };

  assert.deepEqual(getSearchErrorCopy(backendError), {
    title: 'Indexter is unavailable',
    description: 'Indexter is temporarily unavailable. Please try again.',
  });
  assert.equal(getSearchErrorCopy(genuineEmpty), null);
});

test('the public recovery tip wins over internal backend error detail', () => {
  assert.deepEqual(getSearchErrorCopy({
    success: false,
    count: 0,
    resources: [],
    searchMeta: { mode: 'error' },
    errorDetail: 'upstream_auth_secret_or_internal_diagnostic',
    tip: 'Indexter is temporarily unavailable. Please retry.',
  }), {
    title: 'Indexter is unavailable',
    description: 'Indexter is temporarily unavailable. Please retry.',
  });
});

test('reader guidance is reserved for decisions that need extra care', () => {
  assert.equal(
    getSearchGuidance({
      count: 2,
      rankingMode: 'degraded',
      degradedMessage: 'Search results may be less precise than usual right now.',
      searchMeta: { mode: 'direct' },
    }),
    'Search results may be less precise than usual right now.',
  );
  assert.equal(
    getSearchGuidance({
      count: 2,
      searchMeta: { mode: 'direct' },
      tip: 'Choose a service, then run x402_check.',
    }),
    null,
  );
  assert.equal(
    getSearchGuidance({
      count: 2,
      searchMeta: { mode: 'related_only' },
    }),
    'These are the closest related services. Review the fit before continuing.',
  );
  assert.equal(
    getSearchGuidance({
      count: 2,
      searchMeta: { mode: 'direct' },
      triangulate: { alternateResourceIds: ['profile-backed-service'] },
    }),
    'The leading match has limited structured evidence. Compare a profile-backed alternative before choosing.',
  );
});

test('tiered resources stay ordered without creating an implicit selection', () => {
  const related = { ...resource, resourceId: 'resource-2', url: 'https://example.com/related' };
  const sections = getSearchSections({
    count: 2,
    strongResults: [resource],
    relatedResults: [related],
  });

  assert.equal(sections.hasTieredShape, true);
  assert.deepEqual(sections.resources.map((item) => item.resourceId), ['resource-1', 'resource-2']);
  assert.deepEqual(sections.resources.map((item) => item.tier), ['strong', 'related']);
  assert.equal(findSelectedResource(sections.resources, undefined), null);
  assert.equal(findSelectedResource(sections.resources, 2)?.resourceId, related.resourceId);
  assert.equal(findSelectedResource(sections.resources, 3), null);
});

test('selected ordinals distinguish resources that publish the same URL', () => {
  const shared = [
    { ...resource, resourceId: 'shared-get', method: 'GET' },
    { ...resource, resourceId: 'shared-post', method: 'POST' },
  ];
  assert.equal(findSelectedResource(shared, 1)?.resourceId, 'shared-get');
  assert.equal(findSelectedResource(shared, 2)?.resourceId, 'shared-post');
});

test('payload normalization preserves legacy resources and nested seller metadata', () => {
  const normalized = normalizeSearchPayload({
    count: 1,
    resources: [{
      ...resource,
      seller: {
        displayName: 'Example Provider',
        payTo: 'pay-to-address',
      },
    }],
  });

  assert.equal(normalized?.resources?.[0]?.seller, 'Example Provider');
  assert.equal(normalized?.resources?.[0]?.sellerMeta.payTo, 'pay-to-address');
});

test('listed prices prefer canonical labels and safely format USDC values', () => {
  assert.equal(formatListedPrice('$0.003', 10), '$0.003');
  assert.equal(formatListedPrice(null, 0.003), '$0.003');
  assert.equal(formatListedPrice(null, 0), 'Free');
  assert.equal(formatListedPrice(null, null), 'Price on check');
});

test('same-network routes stay distinguishable by asset', () => {
  const routeSummaries = [
    { network: 'Base', asset: 'USDC', price: '$0.01' },
    { network: 'Base', asset: 'PYUSD', price: '$0.01' },
  ].map((route) => (
    `${route.network} · ${formatAssetLabel(route.asset)} · ${route.price}`
  ));

  assert.deepEqual(routeSummaries, [
    'Base · USDC · $0.01',
    'Base · PYUSD · $0.01',
  ]);
  assert.equal(new Set(routeSummaries).size, 2);
});

test('search checks bind exact GET URLs while non-GET requests still need a body', () => {
  assert.equal(isSearchCheckRequestBound('GET'), true);
  assert.equal(isSearchCheckRequestBound('get'), true);
  assert.equal(isSearchCheckRequestBound('HEAD'), false);
  assert.equal(isSearchCheckRequestBound('POST'), false);
});


test('accepts literal prompt request fields without accepting instruction or credential keys', () => {
  for (const required of [true, false]) {
    const requestInput = {
      version: 1,
      fields: [{ name: 'prompt', location: 'body', type: 'string', required }],
    };
    assert.equal(isSafeSearchRequestInput(requestInput), true);
    const payload = strictPayload({ strongResults: [{ ...strictResource, method: 'POST', requestInput }] });
    assert.equal(isSafeSearchPayload(payload), true);
    assert.deepEqual(normalizeSearchPayload(payload).strongResults[0].requestInput, requestInput);
  }
  for (const name of ['apiKey', 'system_prompt', 'ignoreInstructions', 'prompt_override']) {
    assert.equal(isSafeSearchRequestInput({
      version: 1,
      fields: [{ name, location: 'body', type: 'string', required: true }],
    }), false, name);
  }
});

test('unsupported input remains discoverable only with an exact unavailable action', () => {
  const unavailable = {
    ...strictResource,
    requestInput: null,
    action: {
      kind: 'endpoint_unavailable', label: 'Unavailable', state: 'unavailable',
      reason: 'input_contract_unavailable', resourceId: strictResource.resourceId,
      resourceUrl: strictResource.url,
    },
  };
  const payload = strictPayload({ strongResults: [unavailable] });
  assert.equal(isSafeSearchPayload(payload), true);
  assert.equal(normalizeSearchPayload(payload).strongResults[0].description, strictResource.description);
  assert.equal(normalizeSearchPayload(payload).strongResults[0].requestInput, null);
  for (const patch of [
    { action: { ...unavailable.action, kind: 'check_endpoint', state: 'ready_for_check' } },
    { action: { ...unavailable.action, resourceId: '88888888-8888-4888-8888-888888888888' } },
    { action: { ...unavailable.action, resourceUrl: 'https://other.example.com/' } },
    { requestInput: { version: 1, fields: [] } },
    { url: 'https://example.com/?apiKey=secret' },
  ]) assert.equal(isSafeSearchPayload(strictPayload({ strongResults: [{ ...unavailable, ...patch }] })), false);
});
