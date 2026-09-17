import { z } from 'zod';

const atomic = z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n);
const decimal = z.string().max(1_024).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime();
const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function decimalFromRaw(raw, decimals) {
  const digits = raw.padStart(decimals + 1, '0');
  if (decimals === 0) return digits;
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, '') || '0';
}

function multiply(left, right) {
  const [li, lf = ''] = left.split('.');
  const [ri, rf = ''] = right.split('.');
  return decimalFromRaw((BigInt(li + lf) * BigInt(ri + rf)).toString(), lf.length + rf.length);
}

const amount = z.object({
  mint: z.string().min(32).max(44),
  symbol: z.string().min(1).max(32),
  tokenProgram: z.enum(['spl-token', 'token-2022']),
  amountRaw: atomic,
  decimals: z.number().int().min(0).max(255),
  baseAmount: decimal,
  displayAmount: decimal.nullable(),
  amountModel: z.enum(['raw-decimals', 'scaled-ui-amount', 'unknown']),
  displayMultiplier: decimal.nullable(),
  scalingEvidence: z.object({
    observedAt: timestamp,
    slot: atomic,
    evidenceDigest: digest,
  }).strict().nullable(),
  balanceBeforeRaw: atomic,
  balanceAfterRaw: atomic,
}).strict().superRefine((value, context) => {
  let valid = value.baseAmount === decimalFromRaw(value.amountRaw, value.decimals);
  if (value.amountModel === 'unknown') {
    valid &&= value.tokenProgram === 'token-2022' && value.displayAmount === null
      && value.displayMultiplier === null && value.scalingEvidence === null;
  } else if (value.amountModel === 'raw-decimals') {
    valid &&= value.displayAmount === value.baseAmount && value.displayMultiplier === null
      && (value.tokenProgram === 'spl-token' ? value.scalingEvidence === null : value.scalingEvidence !== null);
  } else {
    valid &&= value.tokenProgram === 'token-2022' && value.scalingEvidence !== null
      && value.displayMultiplier !== null && value.displayMultiplier !== '0'
      && value.displayAmount === multiply(value.baseAmount, value.displayMultiplier ?? '0');
  }
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'receipt amount conversion is inconsistent' });
});

const recorded = z.object({
  namespace: z.literal('dexter-governed-receipt-outcome/v1'),
  status: z.literal('recorded'),
  receiptDigest: digest,
  intentId: z.string().uuid(),
  attemptId: z.string().uuid(),
  transactionSignature: z.string().min(64).max(88),
  action: z.enum(['buy', 'sell']),
  receiptCommitment: z.enum(['confirmed', 'finalized']),
  transactionCommitment: z.enum(['confirmed', 'finalized']),
  transactionSlot: atomic,
  postStateSlot: atomic,
  observedAt: timestamp,
  debit: amount,
  credit: amount,
  fees: z.object({ status: z.literal('unavailable'), networkFee: z.null(), routeFees: z.null() }).strict(),
}).strict().superRefine((value, context) => {
  const cash = value.action === 'buy' ? value.debit : value.credit;
  const valid = cash.mint === usdcMint && cash.decimals === 6 && cash.symbol === 'USDC'
    && cash.tokenProgram === 'spl-token' && cash.amountModel === 'raw-decimals'
    && BigInt(value.debit.balanceBeforeRaw) - BigInt(value.debit.balanceAfterRaw) === BigInt(value.debit.amountRaw)
    && BigInt(value.credit.balanceAfterRaw) - BigInt(value.credit.balanceBeforeRaw) === BigInt(value.credit.amountRaw)
    && BigInt(value.postStateSlot) >= BigInt(value.transactionSlot)
    && (value.receiptCommitment !== 'finalized' || value.transactionCommitment === 'finalized')
    && [value.debit, value.credit].every((item) => item.scalingEvidence === null || item.scalingEvidence.slot === value.transactionSlot);
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'receipt economic evidence is inconsistent' });
});

export const GOVERNED_RECEIPT_OUTCOME_SCHEMA = z.union([
  recorded,
  z.object({
    namespace: z.literal('dexter-governed-receipt-outcome/v1'),
    status: z.literal('unavailable'),
    reason: z.enum(['receipt_not_recorded', 'receipt_identity_mismatch', 'receipt_read_unavailable']),
  }).strict(),
]);

export function receiptOutcomeMatchesAction(body) {
  const receipt = body.receiptOutcome;
  if (!receipt || receipt.status !== 'recorded') return true;
  const state = body.business ?? body;
  const product = body.tradeSummary?.productIdentity;
  const stock = receipt.action === 'buy' ? receipt.credit : receipt.debit;
  return product !== undefined && receipt.intentId === body.intentId && receipt.attemptId === body.attemptId
    && receipt.transactionSignature === body.transactionSignature && receipt.action === state.action
    && receipt.debit.amountRaw === state.amountAtomic && state.executionSucceeded === true
    && receipt.transactionCommitment === (state.finality ?? body.confirmationCommitment)
    && (body.confirmationSlot === undefined || receipt.transactionSlot === body.confirmationSlot)
    && stock.mint === product.mint && stock.tokenProgram === product.tokenProgram
    && stock.decimals === product.decimals && stock.symbol === product.symbol;
}
