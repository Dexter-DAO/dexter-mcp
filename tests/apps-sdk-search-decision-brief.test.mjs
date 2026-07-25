import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSearchDecision,
  summarizeSearchResource,
} from '../apps-sdk/ui/src/components/x402/search/SearchDecisionBrief.model.ts';

function resource(overrides) {
  return {
    resourceId: overrides.resourceId,
    name: overrides.name ?? overrides.resourceId,
    url: overrides.url,
    method: 'GET',
    price: '$0.01',
    network: 'solana',
    description: '',
    category: 'data',
    qualityScore: 80,
    verified: true,
    totalCalls: 0,
    seller: null,
    sellerMeta: { displayName: null },
    ...overrides,
  };
}

test('keeps the top recommendation fixed while honoring a user selection', () => {
  const first = resource({
    resourceId: 'first',
    url: 'https://one.example/data',
  });
  const second = resource({
    resourceId: 'second',
    url: 'https://two.example/data',
  });

  const decision = buildSearchDecision([first, second], second.url);

  assert.equal(decision.recommended, first);
  assert.equal(decision.recommendationKind, 'strong');
  assert.equal(decision.selected, second);
  assert.equal(decision.actionTarget, second);
  assert.equal(decision.isRecommendationSelected, false);
  assert.deepEqual(decision.alternatives, [first]);
  assert.equal(decision.hiddenAlternativeCount, 0);
});

test('promotes an offscreen selection into the hero without duplicating it', () => {
  const resources = Array.from({ length: 6 }, (_, index) =>
    resource({
      resourceId: `route-${index}`,
      url: `https://api.example/route/${index}`,
      priceAsset: index % 2 === 0 ? 'USDC' : 'USDT',
    }),
  );

  const decision = buildSearchDecision(resources, resources[5].url, 3);

  assert.deepEqual(
    decision.alternatives.map(({ resourceId }) => resourceId),
    ['route-0', 'route-1', 'route-2'],
  );
  assert.equal(decision.selected, resources[5]);
  assert.equal(decision.actionTarget, resources[5]);
  assert.equal(
    decision.alternatives.some(({ resourceId }) => resourceId === 'route-5'),
    false,
  );
  assert.equal(decision.hiddenAlternativeCount, 2);
});

test('uses the recommendation as the action target without implying selection', () => {
  const first = resource({
    resourceId: 'first',
    url: 'https://one.example/data',
  });

  const decision = buildSearchDecision([first], 'https://gone.example/data');

  assert.equal(decision.selected, null);
  assert.equal(decision.actionTarget, first);
  assert.equal(decision.isRecommendationSelected, false);
});

test('labels a related-only leader as a closest match, not a recommendation', () => {
  const related = resource({
    resourceId: 'related',
    url: 'https://related.example/data',
    tier: 'related',
  });

  const decision = buildSearchDecision([related]);

  assert.equal(decision.recommended, related);
  assert.equal(decision.recommendationKind, 'related');
  assert.equal(decision.actionTarget, related);
});

test('summarizes why, quality, and the first listed route price', () => {
  const summary = summarizeSearchResource(
    resource({
      resourceId: 'priced',
      url: 'https://priced.example/data',
      why: '  Best semantic match with reliable responses.  ',
      qualityScore: 92.6,
      chains: [
        {
          network: 'solana',
          asset: 'USDC',
          priceLabel: '0.02 USDC',
          priceUsdc: 0.02,
        },
        {
          network: 'solana',
          asset: 'USDT',
          priceLabel: '0.03 USDT',
          priceUsdc: 0.03,
        },
      ],
    }),
  );

  assert.deepEqual(summary, {
    why: 'Best semantic match with reliable responses.',
    qualityScore: 93,
    priceLabel: '0.02 USDC',
    priceUsdc: 0.02,
    priceFallback: 'Price on check',
  });
});
