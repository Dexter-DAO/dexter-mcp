import { z } from 'zod';

const id = z.string().min(1).max(128);
const timing = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const PURCHASE_CONTINUATION_SCHEMA = z.object({
  action: z.enum(['deliver_result_and_observe', 'deliver_result', 'complete_authorization',
    'report_provider_error', 'inspect_same_intent', 'review_expired_check', 'unavailable']),
  tool: z.enum(['x402_status', 'x402_fetch']).optional(),
  arguments: z.object({ intentId: id.optional(), checkRequestId: id.optional() }).strict().optional(),
  retryAfterMs: timing.optional(),
  url: z.string().url().optional(),
  resume: z.object({ intentId: id, maxAmountAtomic: z.string().optional() }).strict().optional(),
  message: z.string(),
}).strict();

export const PURCHASE_OUTCOME_SCHEMA = z.object({
  resultAvailable: z.boolean(),
  delivery: z.enum(['received', 'failed', 'not_started', 'unknown']),
  payment: z.enum(['confirmed', 'failed', 'not_started', 'pending', 'unknown']),
  commitment: z.enum(['confirmed', 'finalized']).nullable(),
  resultPath: z.literal('delivery.result').optional(),
  purchaseReference: id.optional(),
  amount: z.object({
    amountAtomic: z.string().regex(/^(?:0|[1-9][0-9]{0,77})$/),
    asset: z.string(), network: z.string(), decimals: z.literal(6), symbol: z.literal('USDC'),
    displayAmount: z.string(), basis: z.enum(['confirmed_payment', 'requested_payment']),
  }).strict().optional(),
}).strict();

export const CHECK_RECOVERY_SCHEMA = z.object({
  checkRequestId: id,
  tool: z.literal('x402_status'),
  arguments: z.object({ checkRequestId: id }).strict(),
  retryAfterMs: timing.optional(),
  message: z.string(),
}).strict();

export const PURCHASE_RESULT_FIELDS = {
  outcome: PURCHASE_OUTCOME_SCHEMA.optional(),
  continuation: PURCHASE_CONTINUATION_SCHEMA.optional(),
  retryAfterMs: timing.optional(),
  replacementAllowed: z.boolean().optional(),
  checkRequestId: id.optional(),
};

export const CHECK_RECOVERY_FIELDS = {
  ...PURCHASE_RESULT_FIELDS,
  recovery: CHECK_RECOVERY_SCHEMA.optional(),
};
