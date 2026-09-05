import { describe, expect, it } from 'vitest';
import {
  indexterCheckContinuationPrompt,
  indexterEndpointReference,
  indexterNonPaymentContinuationPrompt,
  indexterPurchaseContinuationData,
  indexterPurchaseContinuationPrompt,
  indexterQuoteContinuationPrompt,
  indexterResultReference,
} from './indexter-continuation';

const INTENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESULT_SET_ID = '11111111-1111-4111-8111-111111111111';
const RESOURCE_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_RESOURCE_ID = '88888888-8888-4888-8888-888888888888';

describe('Indexter result continuations', () => {
  it('binds a paid intent and ceiling to one current result ordinal', () => {
    const data = indexterPurchaseContinuationData(
      RESULT_SET_ID,
      2,
      3,
      INTENT_ID,
      '8000',
    );
    expect(data).toEqual({
      kind: 'indexter_result_continuation_v2',
      searchResultSetId: RESULT_SET_ID,
      searchResultOrdinal: 2,
      intentId: INTENT_ID,
      maxAmountAtomic: '8000',
    });
    const prompt = indexterPurchaseContinuationPrompt(data!);
    expect(prompt).toContain(JSON.stringify(data));
    expect(prompt).toContain('bound to that result');
    expect(prompt).toContain('call x402_fetch once initially');
    expect(prompt).not.toContain('provider.example');
  });

  it('rejects ordinals outside the current result set', () => {
    expect(indexterResultReference(RESULT_SET_ID, 0, 3)).toBeNull();
    expect(indexterResultReference(RESULT_SET_ID, 1.5, 3)).toBeNull();
    expect(indexterResultReference(RESULT_SET_ID, 4, 3)).toBeNull();
    expect(indexterResultReference(RESULT_SET_ID, 1, 0)).toBeNull();
    expect(indexterResultReference('widget-issued', 1, 3)).toBeNull();
    expect(indexterResultReference(undefined, 1, 3)).toBeNull();
    expect(indexterPurchaseContinuationData(
      RESULT_SET_ID,
      4,
      3,
      INTENT_ID,
      '8000',
    ))
      .toBeNull();
  });

  it('binds every non-payment path to the same opaque result-set reference', () => {
    const data = indexterResultReference(RESULT_SET_ID, 2, 3)!;
    for (const classification of ['free', 'siwx', 'apiKey'] as const) {
      const prompt = indexterQuoteContinuationPrompt(classification, data);
      expect(prompt).toContain(JSON.stringify(data));
      expect(prompt).toContain('only Indexter result');
    }
    const fallback = indexterNonPaymentContinuationPrompt(
      data,
      'context_recheck',
    );
    expect(fallback).toContain(JSON.stringify(data));
    expect(fallback).toContain('could not bind the latest checked terms');
    expect(fallback).not.toContain(INTENT_ID);
  });

  it('opens Search -> Check with the exact endpoint and merchant identity', () => {
    const data = indexterEndpointReference({
      resourceId: RESOURCE_ID,
      method: 'GET',
      url: 'https://atlas.example/v1/markets',
      name: 'Market snapshot',
      merchant: { providerKey: 'atlas-labs', displayName: 'Atlas Labs' },
    })!;
    const prompt = indexterCheckContinuationPrompt(data);

    expect(prompt).toContain(JSON.stringify({
      kind: 'indexter_endpoint_reference_v1',
      resourceId: RESOURCE_ID,
      method: 'GET',
      resourceUrl: 'https://atlas.example/v1/markets',
      merchant: { providerKey: 'atlas-labs' },
    }));
    expect(data).toEqual({
      kind: 'indexter_endpoint_reference_v1',
      resourceId: RESOURCE_ID,
      method: 'GET',
      resourceUrl: 'https://atlas.example/v1/markets',
      merchant: { providerKey: 'atlas-labs', name: 'Atlas Labs' },
      offering: 'Market snapshot',
    });
    expect(prompt).toContain('Call x402_check once');
    expect(prompt).toContain('do not make a payment');
    expect(prompt).not.toContain('searchResultSetId');
    expect(prompt).not.toContain('Atlas Labs');
    expect(prompt).not.toContain('Market snapshot');
    expect(prompt).toContain('https://atlas.example/v1/markets');
  });

  it('distinguishes two endpoint references and rejects missing identity', () => {
    const first = indexterEndpointReference({
      resourceId: RESOURCE_ID,
      method: 'GET',
      url: null,
      name: 'Market snapshot',
      sellerMeta: { displayName: 'Atlas Labs' },
    })!;
    const second = indexterEndpointReference({
      resourceId: OTHER_RESOURCE_ID,
      method: 'POST',
      url: 'https://beacon.example/v1/spot',
      name: 'Spot quote',
      merchant: { providerKey: 'beacon', displayName: 'Beacon' },
    })!;

    expect(indexterCheckContinuationPrompt(first)).not.toBe(
      indexterCheckContinuationPrompt(second),
    );
    expect(indexterCheckContinuationPrompt(first)).toContain(RESOURCE_ID);
    expect(indexterCheckContinuationPrompt(second)).toContain(OTHER_RESOURCE_ID);
    expect(indexterEndpointReference({
      resourceId: undefined,
      method: 'GET',
      url: null,
      name: 'Missing identity',
      sellerMeta: { displayName: 'Atlas Labs' },
    })).toBeNull();
  });
});
