export type PurchaseReceiptMode =
  | 'direct_exact'
  | 'native_tab'
  | 'gateway_cash'
  | 'gateway_credit';

export type PurchaseReceiptPresentation = Readonly<{
  mode: PurchaseReceiptMode;
  modeLabel: string;
  title: string;
  tone: 'success' | 'warning' | 'neutral';
  sellerSettled: boolean;
  rows: readonly Readonly<{ label: string; value: string }>[];
  retryNote: string | null;
  references: Readonly<{
    preparedId: string;
    routeId: string;
    correlationId: string | null;
  }>;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mode(value: unknown): PurchaseReceiptMode | null {
  switch (value) {
    case 'direct_exact':
    case 'native_tab':
    case 'gateway_cash':
    case 'gateway_credit':
      return value;
    default:
      return null;
  }
}

function humanize(value: string | null): string {
  return value
    ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) =>
        letter.toUpperCase())
    : 'Unknown';
}

function retryNote(value: unknown): string | null {
  switch (value) {
    case 'reconcile_only':
      return 'Do not retry automatically. Reconcile this prepared purchase.';
    case 'new_prepare_required':
      return 'Nothing consequential was sent. Check current terms and prepare a new purchase.';
    case 'same_prepared_only':
      return 'Only the same prepared identity may continue.';
    case 'integration_required':
      return 'This purchase mode is not connected yet. No payment was sent.';
    case 'none':
      return 'No further payment action is needed.';
    default:
      return null;
  }
}

function settlementRows(
  receipt: UnknownRecord,
): {
  rows: Array<{ label: string; value: string }>;
  settled: boolean;
  state: string | null;
} {
  const settlement = isRecord(receipt.sellerSettlement)
    ? receipt.sellerSettlement
    : null;
  const state = text(settlement?.state);
  const amount = text(settlement?.amountAtomic);
  const asset = text(settlement?.asset);
  const network = text(settlement?.network);
  const transaction = text(settlement?.transaction);
  const rows = [
    { label: 'Seller settlement', value: humanize(state) },
  ];
  if (amount && asset) {
    rows.push({
      label: 'Seller amount',
      value: `${amount} atomic ${asset}${network ? ` on ${network}` : ''}`,
    });
  }
  if (transaction) {
    rows.push({ label: 'Transaction', value: transaction });
  }
  return { rows, settled: state === 'settled', state };
}

function modeLabel(selectedMode: PurchaseReceiptMode): string {
  switch (selectedMode) {
    case 'direct_exact':
      return 'Direct exact';
    case 'native_tab':
      return 'Native seller tab';
    case 'gateway_cash':
      return 'Gateway cash';
    case 'gateway_credit':
      return 'Gateway credit';
  }
}

/**
 * Convert the discriminated purchase receipt into copy that never collapses
 * buyer funding, seller settlement, tab accrual, and credit obligation into
 * one ambiguous "paid" state.
 */
export function normalizePurchaseReceipt(
  value: unknown,
): PurchaseReceiptPresentation | null {
  if (!isRecord(value) || value.contractVersion !== 'opendexter.purchase.v1') {
    return null;
  }
  const selectedMode = mode(value.mode);
  const preparedId = text(value.preparedId);
  const routeId = text(value.routeId);
  if (!selectedMode || !preparedId || !routeId || !text(value.sellerOfferId)) {
    return null;
  }
  const base = {
    mode: selectedMode,
    modeLabel: modeLabel(selectedMode),
    retryNote: retryNote(value.retry),
    references: {
      preparedId,
      routeId,
      correlationId: text(value.correlationId),
    },
  };

  if (selectedMode === 'native_tab') {
    if (!isRecord(value.voucher) || !text(value.sellerCashSettlement)) {
      return null;
    }
    const voucher = value.voucher;
    const voucherState = text(voucher.state);
    const cashState = text(value.sellerCashSettlement);
    const accepted = voucherState === 'accepted';
    const unconfirmed =
      voucherState === 'unconfirmed' || cashState === 'unconfirmed';
    const rows = [
      { label: 'Tab voucher', value: humanize(voucherState) },
      { label: 'Seller cash settlement', value: humanize(cashState) },
    ];
    const increment = text(voucher.incrementAtomic);
    const cumulative = text(voucher.cumulativeAtomic);
    if (increment) rows.push({ label: 'Tab increment', value: `${increment} atomic` });
    if (cumulative) rows.push({ label: 'Tab total', value: `${cumulative} atomic` });
    return {
      ...base,
      title: accepted
        ? 'Seller tab accepted'
        : unconfirmed
          ? 'Seller tab outcome unconfirmed'
          : voucherState === 'refused'
            ? 'Seller tab refused'
            : 'Seller tab not issued',
      tone: accepted ? 'success' : unconfirmed ? 'warning' : 'neutral',
      sellerSettled: cashState === 'settled',
      rows,
    };
  }

  if (!isRecord(value.sellerSettlement)) return null;
  const settlement = settlementRows(value);
  if (selectedMode === 'gateway_cash') {
    if (!isRecord(value.buyerCash)) return null;
    const buyerCash = value.buyerCash;
    const buyerState = text(buyerCash.state);
    const uncertain =
      buyerState === 'charge_unconfirmed'
      || settlement.state === 'unconfirmed';
    return {
      ...base,
      title: settlement.settled
        ? 'Seller paid through Gateway cash'
        : uncertain
          ? 'Gateway cash outcome unconfirmed'
          : 'Gateway cash not completed',
      tone: settlement.settled ? 'success' : uncertain ? 'warning' : 'neutral',
      sellerSettled: settlement.settled,
      rows: [
        { label: 'Buyer cash', value: humanize(buyerState) },
        ...settlement.rows,
      ],
    };
  }

  if (selectedMode === 'gateway_credit') {
    if (!isRecord(value.exposure) || !isRecord(value.buyerObligation)) {
      return null;
    }
    const exposure = value.exposure;
    const obligation = value.buyerObligation;
    const exposureState = text(exposure.state);
    const obligationState = text(obligation.state);
    const claimId = text(obligation.claimId);
    const uncertain =
      exposureState === 'unconfirmed'
      || obligationState === 'unconfirmed'
      || settlement.state === 'unconfirmed';
    const rows = [
      { label: 'Credit exposure', value: humanize(exposureState) },
      { label: 'Buyer obligation', value: humanize(obligationState) },
      ...settlement.rows,
    ];
    if (claimId) rows.splice(2, 0, { label: 'Claim', value: claimId });
    return {
      ...base,
      title: settlement.settled && obligationState === 'finalized'
        ? 'Seller paid; credit obligation finalized'
        : uncertain
          ? 'Gateway credit outcome unconfirmed'
          : 'Gateway credit not completed',
      tone:
        settlement.settled && obligationState === 'finalized'
          ? 'success'
          : uncertain
            ? 'warning'
            : 'neutral',
      sellerSettled: settlement.settled,
      rows,
    };
  }

  return {
    ...base,
    title: settlement.settled
      ? 'Seller paid directly'
      : settlement.state === 'unconfirmed'
        ? 'Direct settlement unconfirmed'
        : 'Direct payment not sent',
    tone:
      settlement.settled
        ? 'success'
        : settlement.state === 'unconfirmed'
          ? 'warning'
          : 'neutral',
    sellerSettled: settlement.settled,
    rows: settlement.rows,
  };
}
