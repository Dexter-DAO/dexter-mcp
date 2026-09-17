import { z } from 'zod';
import {
  GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA,
  GOVERNED_U64_DECIMAL_SCHEMA,
  GOVERNED_VALUE_USD_SCHEMA,
} from './governed-asset-contract.mjs';

const TIME = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SLOT = TIME.refine((value) => value > 0);
const EFFECTIVE_SECONDS = z.number().int()
  .min(-Math.floor(Number.MAX_SAFE_INTEGER / 1000))
  .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000));
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const MINT = z.string().min(32).max(64);
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function decimalParts(value) {
  if (typeof value !== 'string' || value.length > 128
    || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 64) return null;
  const units = BigInt(whole + fraction);
  return units > 0n ? { units, scale: fraction.length } : null;
}

function decimalFromUnits(units, scale) {
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}

const POSITIVE_DECIMAL = z.string().max(128)
  .refine((value) => decimalParts(value) !== null);
const CANONICAL_DECIMAL = POSITIVE_DECIMAL.refine((value) => {
  const parts = decimalParts(value);
  return parts !== null && decimalFromUnits(parts.units, parts.scale) === value;
});
const CANONICAL_VALUE_USD = z.string().max(39).refine((value) => {
  const parsed = GOVERNED_VALUE_USD_SCHEMA.safeParse(value);
  return parsed.success && parsed.data === value;
});

const settlementUsdPrice = z.object({
  mint: z.literal(SOLANA_USDC_MINT),
  usdPrice: POSITIVE_DECIMAL,
  source: z.string().refine((value) => value.trim().length > 0),
  retrievedAtUnixMs: TIME,
  marketBlockId: TIME.nullable(),
}).strict();

const price = z.object({
  mint: MINT,
  usdPrice: POSITIVE_DECIMAL,
  quantityUnit: z.enum(['raw-decimals', 'scaled-ui']),
  source: z.string().refine((value) => value.trim().length > 0),
  retrievedAtUnixMs: TIME,
  marketBlockId: TIME.nullable(),
  expiresAtUnixMs: TIME,
  settlementUsdPrice,
}).strict();

const balance = z.object({
  amountAtomic: GOVERNED_U64_DECIMAL_SCHEMA,
  observedSlot: SLOT,
  observedAtUnixMs: TIME,
}).strict();

const multiplier = z.object({
  source: z.enum(['identity', 'token-2022-scaled-ui-current', 'token-2022-scaled-ui-scheduled']),
  value: CANONICAL_DECIMAL,
  currentValue: CANONICAL_DECIMAL,
  scheduledValue: CANONICAL_DECIMAL.nullable(),
  scheduledEffectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  effectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  nextValue: CANONICAL_DECIMAL.nullable(),
  nextEffectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  observedSlot: SLOT,
  observedAtUnixMs: TIME,
  mintStateDigest: HASH,
}).strict();

function exactMultiplier(binding) {
  const m = binding.multiplier;
  if (m.observedSlot !== binding.mintObservedSlot
    || m.observedAtUnixMs !== binding.mintObservedAtUnixMs
    || m.mintStateDigest !== binding.mintStateDigest) return false;
  if (m.source === 'identity') {
    return binding.amountModel === 'raw-decimals'
      && m.value === '1' && m.currentValue === '1'
      && m.scheduledValue === null && m.scheduledEffectiveTimestampUnixSeconds === null
      && m.effectiveTimestampUnixSeconds === null && m.nextValue === null
      && m.nextEffectiveTimestampUnixSeconds === null;
  }
  if (binding.tokenProgram !== 'token-2022' || binding.amountModel !== 'scaled-ui-amount'
    || m.scheduledValue === null || m.scheduledEffectiveTimestampUnixSeconds === null) return false;
  const effective = m.scheduledEffectiveTimestampUnixSeconds;
  const mintTime = Math.floor(binding.mintObservedAtUnixMs / 1000);
  const priceTime = Math.floor(binding.price.retrievedAtUnixMs / 1000);
  const preparedTime = Math.floor(binding.preparedAtUnixMs / 1000);
  if (m.currentValue !== m.scheduledValue
    && effective > Math.min(mintTime, priceTime) && effective <= preparedTime) return false;
  const active = effective <= mintTime;
  return m.source === (active ? 'token-2022-scaled-ui-scheduled' : 'token-2022-scaled-ui-current')
    && m.value === (active ? m.scheduledValue : m.currentValue)
    && m.effectiveTimestampUnixSeconds === (active ? effective : null)
    && m.nextValue === (active ? null : m.scheduledValue)
    && m.nextEffectiveTimestampUnixSeconds === (active ? null : effective);
}

function exactUsdValue(binding) {
  const p = binding.price;
  if (!Number.isInteger(binding.assetDecimals) || binding.assetDecimals < 0 || binding.assetDecimals > 18
    || !/^(?:0|[1-9][0-9]{0,19})$/.test(binding.balance.amountAtomic)) return false;
  if (p.mint !== binding.mint || p.retrievedAtUnixMs > binding.preparedAtUnixMs
    || p.expiresAtUnixMs <= p.retrievedAtUnixMs || p.expiresAtUnixMs <= binding.preparedAtUnixMs
    || p.settlementUsdPrice.source !== p.source
    || p.settlementUsdPrice.retrievedAtUnixMs !== p.retrievedAtUnixMs
    || binding.mintObservedAtUnixMs > binding.preparedAtUnixMs
    || binding.balance.observedAtUnixMs > binding.preparedAtUnixMs
    || !exactMultiplier(binding)) return false;
  const target = decimalParts(binding.requestedValueUsd);
  const priceParts = decimalParts(p.usdPrice);
  const displayMultiplier = decimalParts(binding.multiplier.value);
  if (!target || !priceParts || !displayMultiplier) return false;
  const sizingMultiplier = p.quantityUnit === 'scaled-ui'
    ? displayMultiplier : { units: 1n, scale: 0 };
  const numerator = target.units * 10n ** BigInt(binding.assetDecimals + priceParts.scale + sizingMultiplier.scale);
  const denominator = priceParts.units * sizingMultiplier.units * 10n ** BigInt(target.scale);
  const raw = numerator / denominator;
  return raw.toString() === binding.amountAtomic
    && raw <= BigInt(binding.balance.amountAtomic)
    && decimalFromUnits(raw, binding.assetDecimals) === binding.rawDecimalAmount
    && decimalFromUnits(raw * sizingMultiplier.units * priceParts.units,
      binding.assetDecimals + sizingMultiplier.scale + priceParts.scale) === binding.selectedReferenceValueUsd
    && decimalFromUnits(raw * displayMultiplier.units, binding.assetDecimals + displayMultiplier.scale)
      === binding.displayAmount;
}

export const GOVERNED_USD_VALUE_BINDING_SCHEMA = z.object({
  namespace: z.literal('dexter-governed-usd-value/v1'),
  semantics: z.literal('approximate-input-market-value'),
  requestedValueUsd: CANONICAL_VALUE_USD,
  selectedReferenceValueUsd: z.string().max(256),
  rounding: z.literal('floor'),
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA,
  rawDecimalAmount: z.string().max(256),
  displayAmount: z.string().max(256),
  amountModel: z.enum(['raw-decimals', 'scaled-ui-amount']),
  mint: MINT,
  tokenProgram: z.enum(['spl-token', 'token-2022']),
  assetDecimals: z.number().int().min(0).max(18),
  mintStateDigest: HASH,
  mintObservedSlot: SLOT,
  mintObservedAtUnixMs: TIME,
  preparedAtUnixMs: TIME,
  price,
  balance,
  multiplier,
}).strict().superRefine((value, context) => {
  let exact = false;
  try { exact = exactUsdValue(value); } catch { /* Invalid wire values fail validation. */ }
  if (!exact) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'USD value evidence does not reproduce the token input' });
  }
});

export function usdValueMatchesAsset(value, action, amountAtomic, product) {
  return action === 'sell' && value !== undefined
    && value.amountAtomic === amountAtomic
    && value.mint === product.mint
    && value.tokenProgram === product.tokenProgram
    && value.assetDecimals === product.decimals;
}
