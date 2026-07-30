export type IntentOutcome =
  | 'complete'
  | 'preparing'
  | 'ambiguous'
  | 'failed'
  | 'unknown';

export type IntentLifecycleRow = Readonly<{
  label: 'Delivery' | 'Payment' | 'Reconciliation' | 'Reservation';
  value: string;
}>;

export type IntentLifecycleModel = Readonly<{
  intentId: string | null;
  outcome: IntentOutcome;
  eyebrow: string;
  title: string;
  summary: string;
  rows: readonly IntentLifecycleRow[];
  needsStatusCheck: boolean;
  statusPrompt: string | null;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function nestedState(value: unknown): string | null {
  if (!isRecord(value)) return cleanString(value);
  return cleanString(value.state) ?? cleanString(value.status);
}

function humanize(value: string | null, fallback = 'Not reported'): string {
  if (!value) return fallback;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deliveryLabel(value: unknown): string {
  const state = nestedState(value);
  if (!isRecord(value)) return humanize(state);
  const httpStatus = typeof value.httpStatus === 'number'
    && Number.isInteger(value.httpStatus)
    ? value.httpStatus
    : null;
  return httpStatus === null
    ? humanize(state)
    : `${humanize(state)} · HTTP ${httpStatus}`;
}

function paymentLabel(value: unknown): string {
  if (!isRecord(value)) return humanize(nestedState(value));
  const state = nestedState(value);
  if (state) return humanize(state);
  if (value.confirmed === true || value.settled === true) return 'Confirmed';
  if (value.confirmed === false || value.settled === false) return 'Not confirmed';
  return 'Not reported';
}

function reconciliationLabel(value: unknown): string {
  if (!isRecord(value)) return humanize(nestedState(value));
  const state = nestedState(value);
  if (state) return humanize(state);
  if (value.required === true) {
    return value.performed === true ? 'Required · performed' : 'Required · pending';
  }
  if (value.required === false) return 'Not required';
  if (value.performed === true) return 'Performed';
  return 'Not reported';
}

function token(value: string | null): string {
  return value?.toLowerCase().replace(/\s+/g, '_') ?? '';
}

function classifyOutcome(payload: UnknownRecord): IntentOutcome {
  const status = token(cleanString(payload.status));
  const delivery = token(nestedState(payload.delivery));
  const payment = token(nestedState(payload.payment));
  const reconciliation = isRecord(payload.reconciliation)
    ? payload.reconciliation
    : {};
  const reconciliationState = token(nestedState(payload.reconciliation));
  const combined = [status, delivery, payment, reconciliationState].join(' ');

  if (
    /ambiguous|uncertain|unknown|dispatch_possible|reconciliation_required/.test(combined)
    || (reconciliation.required === true && reconciliation.performed !== true)
  ) {
    return 'ambiguous';
  }
  if (/prepar|pending|signed|building|executing|dispatching/.test(combined)) {
    return 'preparing';
  }
  if (/failed|refused|expired|rejected|cancelled|canceled/.test(combined)) {
    return 'failed';
  }
  if (
    /resolved|complete|completed|success|succeeded|delivered/.test(combined)
    || (isRecord(payload.payment) && payload.payment.confirmed === true)
  ) {
    return 'complete';
  }
  if (
    payload.ok === false
    || payload.error === true
    || cleanString(payload.error) !== null
  ) {
    return 'failed';
  }
  return 'unknown';
}

export function buildSameIntentStatusPrompt(intentId: string): string {
  return `Call x402_status with only intentId ${intentId}. `
    + 'Inspect that same intent; do not call x402_fetch again and do not create a replacement intent.';
}

export function normalizeIntentLifecycle(value: unknown): IntentLifecycleModel {
  const payload = isRecord(value) ? value : {};
  const intentId = cleanString(payload.intentId);
  const outcome = classifyOutcome(payload);
  const needsStatusCheck = Boolean(
    intentId && (outcome === 'preparing' || outcome === 'ambiguous'),
  );
  const copy = {
    complete: {
      eyebrow: 'Intent · Complete',
      title: 'Purchase complete',
      summary: 'Delivery and payment reached a terminal reported outcome.',
    },
    preparing: {
      eyebrow: 'Intent · Preparing',
      title: 'Purchase is still preparing',
      summary: 'Do not submit the purchase again. Check the same intent for progress.',
    },
    ambiguous: {
      eyebrow: 'Intent · Reconcile',
      title: 'Outcome needs reconciliation',
      summary: 'Dispatch or payment may have occurred. Do not retry the purchase.',
    },
    failed: {
      eyebrow: 'Intent · Stopped',
      title: 'Purchase not completed',
      summary: 'The intent stopped without a reported successful outcome.',
    },
    unknown: {
      eyebrow: 'Intent · Status',
      title: 'Purchase status',
      summary: 'Review the route-neutral lifecycle state reported for this intent.',
    },
  }[outcome];

  return {
    intentId,
    outcome,
    ...copy,
    rows: [
      { label: 'Delivery', value: deliveryLabel(payload.delivery) },
      { label: 'Payment', value: paymentLabel(payload.payment) },
      {
        label: 'Reconciliation',
        value: reconciliationLabel(payload.reconciliation),
      },
      {
        label: 'Reservation',
        value: humanize(
          cleanString(payload.reservationState)
          ?? nestedState(payload.reservation),
        ),
      },
    ],
    needsStatusCheck,
    statusPrompt: needsStatusCheck && intentId
      ? buildSameIntentStatusPrompt(intentId)
      : null,
  };
}
