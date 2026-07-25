/**
 * Pure, optional presentation mapper for a future role-aware obligation
 * payload. Today's WalletHome intentionally does not call this: the current
 * aggregate Credit sheet has no authenticated viewer-role contract and cannot
 * safely invent claim ownership, due dates, collector state, or finality.
 */

export type ObligationViewerRole = 'buyer' | 'holder' | 'borrower' | 'creditor';
export type AdvanceState = 'crystallized' | 'transferred' | 'settled' | 'recovered';
export type ClaimLifecycle = 'active' | 'aggregated' | 'settled';
export type CollectionStatus =
  | 'current'
  | 'past_due'
  | 'in_cure'
  | 'defaulted'
  | 'recovery'
  | 'closed';
export type AccountingStatus = 'on_book' | 'charged_off' | 'settled';

export type ObligationPresentationInput = {
  viewerRole: ObligationViewerRole;
  instrument:
    | { kind: 'raw_voucher' }
    | { kind: 'advance'; state: AdvanceState }
    | { kind: 'line' };
  claimLifecycle?: ClaimLifecycle;
  collectionStatus?: CollectionStatus;
  accountingStatus?: AccountingStatus;
};

export type ObligationPresentationItem = {
  axis: 'instrument' | 'claim' | 'collection' | 'accounting';
  label: string;
  body: string;
};

export type ObligationPresentation = {
  status: 'available' | 'unavailable';
  items: ObligationPresentationItem[];
  cashReserved: boolean | null;
  cashMoved: boolean | null;
  terminal: boolean | null;
  saleable: boolean | null;
  includeInTotals: boolean | null;
};

const UNAVAILABLE: ObligationPresentation = {
  status: 'unavailable',
  items: [
    {
      axis: 'instrument',
      label: 'Status unavailable',
      body: 'This obligation does not include enough role-aware finality data to present safely.',
    },
  ],
  cashReserved: null,
  cashMoved: null,
  terminal: null,
  saleable: null,
  includeInTotals: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isViewerRole(value: unknown): value is ObligationViewerRole {
  return value === 'buyer' || value === 'holder' || value === 'borrower' || value === 'creditor';
}

function instrumentItem(
  instrument: ObligationPresentationInput['instrument'],
  viewerRole: ObligationViewerRole,
): {
  item: ObligationPresentationItem;
  cashReserved: boolean | null;
  cashMoved: boolean | null;
  terminal: boolean | null;
} | null {
  if (instrument.kind === 'raw_voucher') {
    if (viewerRole !== 'buyer' && viewerRole !== 'holder') return null;
    return {
      item: {
        axis: 'instrument',
        label: 'Can still be revoked',
        body:
          'This voucher depends on its live session. Buyer cash is not reserved, and no payment has completed.',
      },
      cashReserved: false,
      cashMoved: false,
      terminal: false,
    };
  }

  if (instrument.kind === 'advance') {
    if (viewerRole !== 'buyer' && viewerRole !== 'holder') return null;
    switch (instrument.state) {
      case 'crystallized':
        return {
          item: {
            axis: 'instrument',
            label: 'Cash reserved',
            body: 'Buyer cash is reserved for this claim. No payment has moved yet.',
          },
          cashReserved: true,
          cashMoved: false,
          terminal: false,
        };
      case 'transferred':
        return {
          item: {
            axis: 'instrument',
            label: 'Claim transferred',
            body: 'Buyer cash remains reserved. The holder changed, but payment has not completed.',
          },
          cashReserved: true,
          cashMoved: false,
          terminal: false,
        };
      case 'settled':
        return {
          item: {
            axis: 'instrument',
            label: 'Paid',
            body: 'USDC moved to the current holder. The claim is complete.',
          },
          cashReserved: false,
          cashMoved: true,
          terminal: true,
        };
      case 'recovered':
        return {
          item: {
            axis: 'instrument',
            label: 'Closed without payment',
            body:
              'The reserved amount was released through holder recovery. No payment moved, and the claim is complete.',
          },
          cashReserved: false,
          cashMoved: false,
          terminal: true,
        };
      default:
        return null;
    }
  }

  if (instrument.kind === 'line') {
    if (viewerRole === 'borrower') {
      return {
        item: {
          axis: 'instrument',
          label: 'Amount owed',
          body:
            'This is the borrower’s repayment obligation. It is separate from the creditor-owned claim.',
        },
        cashReserved: null,
        cashMoved: null,
        terminal: null,
      };
    }
    if (viewerRole === 'creditor') {
      return {
        item: {
          axis: 'instrument',
          label: 'Claim on repayment',
          body:
            'This is a creditor-owned right to repayment. It is not spendable cash or available credit.',
        },
        cashReserved: null,
        cashMoved: null,
        terminal: null,
      };
    }
    return null;
  }

  return null;
}

function claimItem(status: ClaimLifecycle): ObligationPresentationItem | null {
  switch (status) {
    case 'active':
      return {
        axis: 'claim',
        label: 'Active claim',
        body: 'The claim remains active. Payment and collection state are reported separately.',
      };
    case 'aggregated':
      return {
        axis: 'claim',
        label: 'Included in an aggregate',
        body:
          'This child claim was consumed into its parent. Keep it as evidence, but do not sell or total it again.',
      };
    case 'settled':
      return {
        axis: 'claim',
        label: 'Claim lifecycle settled',
        body: 'The claim lifecycle is complete. Cash movement requires separate finality evidence.',
      };
    default:
      return null;
  }
}

function collectionItem(status: CollectionStatus): ObligationPresentationItem | null {
  switch (status) {
    case 'current':
      return {
        axis: 'collection',
        label: 'Current',
        body: 'No past-due state is reported.',
      };
    case 'past_due':
      return {
        axis: 'collection',
        label: 'Past due',
        body: 'The obligation is reported past due. Default and recovery are separate states.',
      };
    case 'in_cure':
      return {
        axis: 'collection',
        label: 'In cure',
        body:
          'The obligation is in its reported cure state. Default and recovery remain separate.',
      };
    case 'defaulted':
      return {
        axis: 'collection',
        label: 'Defaulted',
        body: 'Default has been recorded. Recovery and closure remain separate states.',
      };
    case 'recovery':
      return {
        axis: 'collection',
        label: 'In recovery',
        body:
          'Recovery activity has been recorded. Amount recovered and closure remain separate facts.',
      };
    case 'closed':
      return {
        axis: 'collection',
        label: 'Closed',
        body:
          'The collection state is closed. Payment versus noncash recovery requires separate finality evidence.',
      };
    default:
      return null;
  }
}

function accountingItem(status: AccountingStatus): ObligationPresentationItem | null {
  switch (status) {
    case 'on_book':
      return {
        axis: 'accounting',
        label: 'On book',
        body: 'The claim remains on the accounting ledger. Collection and payment are separate facts.',
      };
    case 'charged_off':
      return {
        axis: 'accounting',
        label: 'Charged off',
        body:
          'This is an accounting treatment. It does not settle the claim or show that collection ended.',
      };
    case 'settled':
      return {
        axis: 'accounting',
        label: 'Accounted as settled',
        body: 'The accounting record is settled. Cash movement requires separate finality evidence.',
      };
    default:
      return null;
  }
}

export function mapObligationPresentation(value: unknown): ObligationPresentation {
  if (!isRecord(value) || !isViewerRole(value.viewerRole) || !isRecord(value.instrument)) {
    return UNAVAILABLE;
  }

  let instrument: ObligationPresentationInput['instrument'] | null = null;
  if (value.instrument.kind === 'raw_voucher') {
    instrument = { kind: 'raw_voucher' };
  } else if (
    value.instrument.kind === 'advance' &&
    (value.instrument.state === 'crystallized' ||
      value.instrument.state === 'transferred' ||
      value.instrument.state === 'settled' ||
      value.instrument.state === 'recovered')
  ) {
    instrument = { kind: 'advance', state: value.instrument.state };
  } else if (value.instrument.kind === 'line') {
    instrument = { kind: 'line' };
  }
  if (!instrument) return UNAVAILABLE;

  const base = instrumentItem(instrument, value.viewerRole);
  if (!base) return UNAVAILABLE;

  const items = [base.item];
  let saleable: boolean | null = null;
  let includeInTotals: boolean | null = null;

  if (value.claimLifecycle !== undefined) {
    if (
      value.claimLifecycle !== 'active' &&
      value.claimLifecycle !== 'aggregated' &&
      value.claimLifecycle !== 'settled'
    ) {
      return UNAVAILABLE;
    }
    const item = claimItem(value.claimLifecycle);
    if (!item) return UNAVAILABLE;
    items.push(item);
    if (value.claimLifecycle === 'aggregated') {
      saleable = false;
      includeInTotals = false;
    }
  }

  if (value.collectionStatus !== undefined) {
    if (
      value.collectionStatus !== 'current' &&
      value.collectionStatus !== 'past_due' &&
      value.collectionStatus !== 'in_cure' &&
      value.collectionStatus !== 'defaulted' &&
      value.collectionStatus !== 'recovery' &&
      value.collectionStatus !== 'closed'
    ) {
      return UNAVAILABLE;
    }
    const item = collectionItem(value.collectionStatus);
    if (!item) return UNAVAILABLE;
    items.push(item);
  }

  if (value.accountingStatus !== undefined) {
    if (
      value.accountingStatus !== 'on_book' &&
      value.accountingStatus !== 'charged_off' &&
      value.accountingStatus !== 'settled'
    ) {
      return UNAVAILABLE;
    }
    const item = accountingItem(value.accountingStatus);
    if (!item) return UNAVAILABLE;
    items.push(item);
  }

  return {
    status: 'available',
    items,
    cashReserved: base.cashReserved,
    cashMoved: base.cashMoved,
    terminal: base.terminal,
    saleable,
    includeInTotals,
  };
}
