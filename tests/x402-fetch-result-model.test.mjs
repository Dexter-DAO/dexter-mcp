import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSameIntentStatusPrompt,
  normalizeIntentLifecycle,
} from '../apps-sdk/ui/src/components/x402/fetch-result-model.ts';

test('preparing outcomes preserve the intent and direct status instead of fetch retry', () => {
  const state = normalizeIntentLifecycle({
    ok: true,
    intentId: 'intent-opaque-1',
    status: 'preparing',
    delivery: { state: 'not_dispatched', httpStatus: null },
    payment: { state: 'not_built', confirmed: false },
    reconciliation: { required: false, performed: false },
    reservationState: 'unreserved',
  });

  assert.equal(state.outcome, 'preparing');
  assert.equal(state.needsStatusCheck, true);
  assert.equal(
    state.statusPrompt,
    'Call x402_status with only intentId intent-opaque-1. Inspect that same '
      + 'intent; do not call x402_fetch again and do not create a replacement intent.',
  );
  assert.deepEqual(state.rows, [
    { label: 'Delivery', value: 'Not Dispatched' },
    { label: 'Payment', value: 'Not Built' },
    { label: 'Reconciliation', value: 'Not required' },
    { label: 'Reservation', value: 'Unreserved' },
  ]);
});

test('ambiguous dispatched outcomes require same-intent reconciliation', () => {
  const state = normalizeIntentLifecycle({
    ok: true,
    intentId: 'intent-opaque-2',
    status: 'dispatch_possible',
    delivery: { state: 'dispatch_possible' },
    payment: { state: 'unknown' },
    reconciliation: { required: true, performed: false },
    reservationState: 'reserved',
  });

  assert.equal(state.outcome, 'ambiguous');
  assert.equal(state.title, 'Outcome needs reconciliation');
  assert.equal(state.needsStatusCheck, true);
  assert.match(state.statusPrompt, /x402_status/);
  assert.doesNotMatch(state.statusPrompt, /url|method|body|new intent/i);
  assert.equal(state.rows[2].value, 'Required · pending');
});

test('terminal outcomes do not ask for another status call', () => {
  const state = normalizeIntentLifecycle({
    ok: true,
    intentId: 'intent-opaque-3',
    status: 'resolved',
    delivery: { state: 'delivered', httpStatus: 200 },
    payment: { state: 'confirmed', confirmed: true },
    reconciliation: { required: false, performed: false },
    reservationState: 'released',
    purchaseReceipt: {
      mode: 'legacy_mode_that_must_not_drive_presentation',
    },
  });

  assert.equal(state.outcome, 'complete');
  assert.equal(state.needsStatusCheck, false);
  assert.equal(state.statusPrompt, null);
  assert.equal(state.rows[0].value, 'Delivered · HTTP 200');
  assert.equal(state.rows[1].value, 'Confirmed');
});

test('route-neutral lifecycle failure states do not masquerade as success', () => {
  const state = normalizeIntentLifecycle({
    ok: true,
    intentId: 'intent-opaque-4',
    status: 'build_failed',
    delivery: { state: 'not_dispatched' },
    payment: { state: 'not_built' },
    reconciliation: { required: false, performed: false },
    reservationState: 'released',
  });

  assert.equal(state.outcome, 'failed');
  assert.equal(state.needsStatusCheck, false);
  assert.equal(state.title, 'Purchase not completed');
});

test('status guidance accepts only the opaque intent', () => {
  const prompt = buildSameIntentStatusPrompt('intent-one');
  assert.match(prompt, /x402_status with only intentId intent-one/);
  assert.doesNotMatch(prompt, /url|method|body|maxAmountAtomic/);
});
