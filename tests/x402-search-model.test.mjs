import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findSelectedResource,
  getSearchErrorCopy,
  getSearchSections,
  normalizeSearchPayload,
} from '../apps-sdk/ui/src/components/x402/search/search-model.ts';
import {
  formatAssetLabel,
  formatListedPrice,
} from '../apps-sdk/ui/src/components/x402/search/utils.ts';

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

test('backend errors stay distinct from genuine empty search results', () => {
  const backendError = {
    success: false,
    count: 0,
    resources: [],
    searchMeta: {
      mode: 'error',
      note: 'Marketplace search is temporarily unavailable. Please try again.',
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
    title: 'Marketplace search unavailable',
    description: 'Marketplace search is temporarily unavailable. Please try again.',
  });
  assert.equal(getSearchErrorCopy(genuineEmpty), null);
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
  assert.equal(findSelectedResource(sections.resources, undefined), null);
  assert.equal(findSelectedResource(sections.resources, related.url), related);
  assert.equal(findSelectedResource(sections.resources, 'https://stale.example'), null);
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
