import { describe, expect, it } from 'vitest';
import {
  indexterCheckContinuationPrompt,
  indexterNonPaymentContinuationPrompt,
  indexterPurchaseContinuationData,
  indexterPurchaseContinuationPrompt,
  indexterQuoteContinuationPrompt,
  indexterResultReference,
} from './indexter-continuation';

const INTENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESULT_SET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_RESULT_SET_ID = '22222222-2222-4222-8222-222222222222';

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

  it('opens a model-mediated check without exposing a direct widget tool call', () => {
    const data = indexterResultReference(RESULT_SET_ID, 1, 2)!;
    const prompt = indexterCheckContinuationPrompt(data);

    expect(prompt).toContain(JSON.stringify(data));
    expect(prompt).toContain('Call x402_check once');
    expect(prompt).toContain('do not make a payment');
    expect(prompt).not.toContain('service.example');
  });

  it('distinguishes the same ordinal from two different server result sets', () => {
    const first = indexterResultReference(RESULT_SET_ID, 1, 2)!;
    const second = indexterResultReference(OTHER_RESULT_SET_ID, 1, 2)!;

    expect(indexterCheckContinuationPrompt(first)).not.toBe(
      indexterCheckContinuationPrompt(second),
    );
    expect(indexterCheckContinuationPrompt(first)).toContain(RESULT_SET_ID);
    expect(indexterCheckContinuationPrompt(second)).toContain(OTHER_RESULT_SET_ID);
  });
});
