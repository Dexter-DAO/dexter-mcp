import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSearchDecision,
  buildDetailsFollowUpPrompt,
  summarizeSearchResource,
} from '../apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts';

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
    requestInput: { version: 1, fields: [] },
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

  const decision = buildSearchDecision([first, second], 2);

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

  const decision = buildSearchDecision(resources, 6, 3);

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

  const decision = buildSearchDecision([first], 2);

  assert.equal(decision.selected, null);
  assert.equal(decision.actionTarget, first);
  assert.equal(decision.isRecommendationSelected, false);
});

test('same-URL results remain distinct selections by ordinal', () => {
  const first = resource({
    resourceId: 'shared-url-get',
    name: 'Shared GET capability',
    url: 'https://shared.example/data',
    method: 'GET',
  });
  const second = resource({
    resourceId: 'shared-url-post',
    name: 'Shared POST capability',
    url: 'https://shared.example/data',
    method: 'POST',
  });

  const decision = buildSearchDecision([first, second], 2);

  assert.equal(decision.selected, second);
  assert.equal(decision.actionTarget, second);
  assert.deepEqual(decision.alternatives, [first]);
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
    paymentNetwork: 'solana',
    paymentAssetLabel: 'USDC +1 route',
    paymentRouteCount: 2,
    requiredInputsLabel: 'None',
    arrayInputsLabel: null,
    networkLabel: 'solana',
    evidenceBadgeLabel: 'Quality test',
    evidenceLabel: 'Quality test passed',
    evidenceBasis: undefined,
    safetyWarning: null,
    action: {
      kind: 'unsupported',
      label: 'Unsupported',
      helperText: 'Current execution details are unavailable. Refresh search before proceeding.',
      disabled: true,
    },
  });
});


test('request-details listing stays disabled with specific copy for retained and current labels', () => {
  for (const label of ['Unavailable', 'Request details unavailable']) {
    const row = resource({ resourceId: 'd8e019c0-545d-4395-8638-63a1d4fa065f',
      name: 'Document parsing', url: null, method: 'POST', requestInput: null,
      access: { kind: 'managed_resolvable', checkable: true, requiresFreshCheck: true },
      execution: { availability: 'available', userExecution: 'allowed' },
      action: { kind: 'endpoint_unavailable', label, state: 'unavailable',
        reason: 'input_contract_unavailable', resourceId: 'd8e019c0-545d-4395-8638-63a1d4fa065f', resourceUrl: null } });
    assert.deepEqual(summarizeSearchResource(row).action, {
      kind: 'unsupported', label: 'Request details unavailable',
      helperText: 'This listing has no usable request details for a terms check.', disabled: true,
    });
    const followUp = buildDetailsFollowUpPrompt(row, { kind: 'indexter_endpoint_reference_v1',
      resourceId: row.resourceId, method: 'POST', resourceUrl: null,
      merchant: { providerKey: null, name: 'Document provider' }, offering: row.name });
    assert.match(followUp, /Do not call x402_check/);
    for (const execution of [undefined, { availability: 'unsupported', userExecution: 'unsupported' }]) {
      const action = summarizeSearchResource({ ...row, execution }).action;
      assert.equal(action.disabled, true);
      assert.equal(action.label, 'Unsupported');
    }
  }
});
