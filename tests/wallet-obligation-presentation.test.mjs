import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapObligationPresentation,
} from '../apps-sdk/ui/src/components/wallet/obligationPresentation.ts';

function labels(result) {
  return result.items.map(({ label }) => label);
}

test('keeps raw voucher revocability, reservation, and payment finality distinct', () => {
  const result = mapObligationPresentation({
    viewerRole: 'buyer',
    instrument: { kind: 'raw_voucher' },
  });

  assert.equal(result.status, 'available');
  assert.equal(result.cashReserved, false);
  assert.equal(result.cashMoved, false);
  assert.equal(result.terminal, false);
  assert.deepEqual(labels(result), ['Can still be revoked']);
  assert.match(result.items[0].body, /live session/i);
});

test('maps every Advance state without treating reservation or transfer as payment', () => {
  const cases = [
    {
      state: 'crystallized',
      label: 'Cash reserved',
      cashReserved: true,
      cashMoved: false,
      terminal: false,
    },
    {
      state: 'transferred',
      label: 'Claim transferred',
      cashReserved: true,
      cashMoved: false,
      terminal: false,
    },
    {
      state: 'settled',
      label: 'Paid',
      cashReserved: false,
      cashMoved: true,
      terminal: true,
    },
    {
      state: 'recovered',
      label: 'Closed without payment',
      cashReserved: false,
      cashMoved: false,
      terminal: true,
    },
  ];

  for (const expected of cases) {
    const result = mapObligationPresentation({
      viewerRole: 'holder',
      instrument: { kind: 'advance', state: expected.state },
    });
    assert.equal(result.status, 'available');
    assert.equal(result.items[0].label, expected.label);
    assert.equal(result.cashReserved, expected.cashReserved);
    assert.equal(result.cashMoved, expected.cashMoved);
    assert.equal(result.terminal, expected.terminal);
  }
});

test('keeps Line borrower debt distinct from the creditor-owned claim', () => {
  const borrower = mapObligationPresentation({
    viewerRole: 'borrower',
    instrument: { kind: 'line' },
  });
  const creditor = mapObligationPresentation({
    viewerRole: 'creditor',
    instrument: { kind: 'line' },
  });

  assert.equal(borrower.items[0].label, 'Amount owed');
  assert.match(borrower.items[0].body, /borrower’s repayment obligation/i);
  assert.equal(creditor.items[0].label, 'Claim on repayment');
  assert.match(creditor.items[0].body, /not spendable cash or available credit/i);
  assert.equal(borrower.cashReserved, null);
  assert.equal(borrower.cashMoved, null);
  assert.equal(borrower.terminal, null);
});

test('preserves all collection states as independent copy', () => {
  const expected = {
    current: 'Current',
    past_due: 'Past due',
    in_cure: 'In cure',
    defaulted: 'Defaulted',
    recovery: 'In recovery',
    closed: 'Closed',
  };

  for (const [collectionStatus, label] of Object.entries(expected)) {
    const result = mapObligationPresentation({
      viewerRole: 'borrower',
      instrument: { kind: 'line' },
      collectionStatus,
    });
    assert.deepEqual(labels(result), ['Amount owed', label]);
  }
});

test('renders charged off and recovery together without ending collections', () => {
  const result = mapObligationPresentation({
    viewerRole: 'creditor',
    instrument: { kind: 'line' },
    collectionStatus: 'recovery',
    accountingStatus: 'charged_off',
  });

  assert.deepEqual(labels(result), ['Claim on repayment', 'In recovery', 'Charged off']);
  assert.match(result.items[2].body, /does not settle/i);
  assert.match(result.items[2].body, /collection ended/i);
});

test('covers every claim and accounting state without inventing cash movement', () => {
  for (const claimLifecycle of ['active', 'aggregated', 'settled']) {
    const result = mapObligationPresentation({
      viewerRole: 'holder',
      instrument: { kind: 'advance', state: 'crystallized' },
      claimLifecycle,
    });
    assert.equal(result.status, 'available');
    if (claimLifecycle === 'aggregated') {
      assert.equal(result.saleable, false);
      assert.equal(result.includeInTotals, false);
      assert.match(result.items[1].body, /do not sell or total it again/i);
    } else {
      assert.equal(result.saleable, null);
      assert.equal(result.includeInTotals, null);
    }
    assert.equal(result.cashMoved, false);
  }

  for (const accountingStatus of ['on_book', 'charged_off', 'settled']) {
    const result = mapObligationPresentation({
      viewerRole: 'holder',
      instrument: { kind: 'advance', state: 'transferred' },
      accountingStatus,
    });
    assert.equal(result.status, 'available');
    assert.equal(result.cashMoved, false);
  }
});

test('fails closed without an explicit viewer role or for unknown states', () => {
  for (const input of [
    { instrument: { kind: 'line' } },
    { viewerRole: 'borrower', instrument: { kind: 'advance', state: 'mystery' } },
    {
      viewerRole: 'creditor',
      instrument: { kind: 'line' },
      collectionStatus: 'delinquent',
    },
    { viewerRole: 'borrower', instrument: { kind: 'advance', state: 'settled' } },
  ]) {
    const result = mapObligationPresentation(input);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(labels(result), ['Status unavailable']);
    assert.equal(result.cashMoved, null);
  }
});

test('copy invents no 7, 30, or 90 day action, execution CTA, or retry', () => {
  const states = [
    { viewerRole: 'buyer', instrument: { kind: 'raw_voucher' } },
    ...['crystallized', 'transferred', 'settled', 'recovered'].map((state) => ({
      viewerRole: 'holder',
      instrument: { kind: 'advance', state },
    })),
    ...['current', 'past_due', 'in_cure', 'defaulted', 'recovery', 'closed'].map(
      (collectionStatus) => ({
        viewerRole: 'borrower',
        instrument: { kind: 'line' },
        collectionStatus,
      }),
    ),
  ];
  const copy = states
    .flatMap((state) => mapObligationPresentation(state).items)
    .map(({ label, body }) => `${label} ${body}`)
    .join(' ');

  assert.doesNotMatch(copy, /\b(?:7|30|90)[ -]?day\b/i);
  assert.doesNotMatch(copy, /\b(?:retry|pay now|collect now|automatic action)\b/i);
});
