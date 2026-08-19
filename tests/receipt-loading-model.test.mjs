import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSING_TOOL_RESULT_TIMEOUT_SECONDS,
  receiptLoadingState,
} from '../apps-sdk/ui/src/components/receipt/receipt-loading-model.ts';

const FALSE_FINALITY_COPY =
  /submitting payment|awaiting settlement|payment cleared|settlement landed|seller is taking longer/i;

test('missing output remains non-economic before the bounded timeout', () => {
  for (const elapsed of [0, 3, 9, 17.999]) {
    const state = receiptLoadingState(elapsed);
    assert.equal(state.terminal, false, String(elapsed));
    assert.match(state.supporting, /tool call has not returned/i);
    assert.doesNotMatch(`${state.heading} ${state.supporting}`, FALSE_FINALITY_COPY);
  }
});

test('18 seconds and every later no-output state is an accurate terminal error', () => {
  assert.equal(MISSING_TOOL_RESULT_TIMEOUT_SECONDS, 18);
  for (const elapsed of [18, 19, 120, 86_400]) {
    const state = receiptLoadingState(elapsed);
    assert.equal(state.terminal, true, String(elapsed));
    assert.match(state.heading, /No tool result returned/);
    assert.match(state.supporting, /backend evidence/);
    assert.match(state.supporting, /not confirmed/);
    assert.doesNotMatch(`${state.heading} ${state.supporting}`, FALSE_FINALITY_COPY);
  }
});
