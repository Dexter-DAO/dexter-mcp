import { describe, expect, it } from 'vitest';
import {
  indexterNonPaymentContinuationPrompt,
  indexterPurchaseContinuationData,
  indexterPurchaseContinuationPrompt,
  indexterQuoteContinuationPrompt,
  indexterResultReference,
} from './indexter-continuation';

const INTENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Indexter result continuations', () => {
  it('binds a paid intent and ceiling to one current result ordinal', () => {
    const data = indexterPurchaseContinuationData(
      2,
      3,
      INTENT_ID,
      '8000',
    );
    expect(data).toEqual({
      kind: 'indexter_result_continuation_v1',
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
    expect(indexterResultReference(0, 3)).toBeNull();
    expect(indexterResultReference(1.5, 3)).toBeNull();
    expect(indexterResultReference(4, 3)).toBeNull();
    expect(indexterResultReference(1, 0)).toBeNull();
    expect(indexterPurchaseContinuationData(4, 3, INTENT_ID, '8000'))
      .toBeNull();
  });

  it('binds every non-payment path to the same opaque ordinal object', () => {
    const data = indexterResultReference(2, 3)!;
    for (const classification of ['free', 'siwx', 'apiKey'] as const) {
      const prompt = indexterQuoteContinuationPrompt(classification, data);
      expect(prompt).toContain(JSON.stringify(data));
      expect(prompt).toContain('only current Indexter result');
    }
    const fallback = indexterNonPaymentContinuationPrompt(
      data,
      'context_recheck',
    );
    expect(fallback).toContain(JSON.stringify(data));
    expect(fallback).toContain('could not bind the latest checked terms');
    expect(fallback).not.toContain(INTENT_ID);
  });
});
