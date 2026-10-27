import { z } from 'zod';
import { readablePurchaseAmount } from './open-purchase-result.mjs';

const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BASE = 'eip155:8453';
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export const CHECK_QUOTE_SCHEMA = z.object({
  kind: z.literal('eligible_offers'),
  selection: z.enum(['automatic', 'credit_requested']),
  state: z.enum(['unselected', 'selected']),
  selectedOfferIndex: z.number().int().min(0).max(3).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.state === 'selected') !== (value.selectedOfferIndex !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Saved selection must identify its quoted offer' });
  }
});

const offeredPayment = z.object({
  scheme: z.enum(['exact', 'tab']),
  network: z.enum([SOLANA, BASE]),
  asset: z.string().min(1).max(64),
  payTo: z.string().min(1).max(64),
  amountAtomic: z.string().regex(/^[1-9][0-9]{0,77}$/),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value),
  smartWalletSupport: z.union([z.boolean(), z.literal('unknown')]).optional(),
}).strict().superRefine((value, ctx) => {
  const solana = value.network === SOLANA && value.asset === SOLANA_USDC
    && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.payTo);
  const base = value.network === BASE && value.asset.toLowerCase() === BASE_USDC
    && /^0x[0-9a-fA-F]{40}$/.test(value.payTo) && value.scheme === 'exact';
  if ((!solana && !base)
    || ((solana && value.scheme === 'exact') !== Object.hasOwn(value, 'smartWalletSupport'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Quoted payment terms are inconsistent' });
  }
});

const producerQuote = z.object({
  quote: CHECK_QUOTE_SCHEMA,
  paymentOptions: z.array(offeredPayment).min(1).max(4),
  amountAtomic: z.string(), network: z.string(), asset: z.string(), payTo: z.string(),
  expiresAtUnixMs: z.number().int().positive().max(8_640_000_000_000_000),
}).passthrough().superRefine((value, ctx) => {
  const options = value.paymentOptions;
  const matching = offer => ['amountAtomic', 'network', 'asset', 'payTo'].every(key => offer[key] === value[key]);
  const bound = value.quote.state === 'selected'
    ? options[value.quote.selectedOfferIndex] && matching(options[value.quote.selectedOfferIndex])
    : options.some(matching);
  if (!bound || options.some(offer => offer.amountAtomic !== value.amountAtomic
    || Date.parse(offer.expiresAt) > value.expiresAtUnixMs)
    || new Set(options.map(offer => JSON.stringify(offer))).size !== options.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Quoted offers must bind the saved payment terms' });
  }
});

/** A present but invalid new contract cannot fall back to the legacy quote. */
export function readHostedQuotedOffers(value) {
  if (!value || !Object.hasOwn(value, 'quote')) return null;
  const parsed = producerQuote.safeParse(value);
  if (!parsed.success) return { valid: false };
  const { quote, paymentOptions } = parsed.data;
  return { valid: true, quote, paymentOptions: paymentOptions.map(offer => {
    const amount = readablePurchaseAmount(offer);
    return { ...offer, decimals: 6, priceFormatted: `${amount.displayAmount} USDC`,
      // This number is for the widget only. Request ceilings retain amountAtomic.
      price: Number(amount.displayAmount) };
  }) };
}

export function quotedOfferGuidance(quote, options) {
  if (quote.state === 'selected') {
    const network = options[quote.selectedOfferIndex].network === BASE ? 'Base' : 'Solana';
    return `Payment network: ${network}. Use this same intent for payment status.`;
  }
  return quote.selection === 'credit_requested'
    ? 'These are the quoted offers for the requested credit purchase. Payment readiness is checked when the purchase starts.'
    : 'These are quoted offers. Dexter chooses the payment route when the purchase starts. Seller smart-wallet support may be unknown.';
}
