import { z } from 'zod';
import {
  GOVERNED_ASSET_ID_SCHEMA,
  GOVERNED_HISTORY_CURSOR_MAX_LENGTH,
  GOVERNED_U64_DECIMAL_SCHEMA,
} from './governed-asset-contract.mjs';

const intentId = z.string().uuid();
const operationId = z.string().min(8).max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const timestamp = z.string().datetime();
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const address = z.string().min(32).max(64);
const mint = z.union([z.literal('native:SOL'), address]);
const symbol = z.string().min(1).max(32);
const reason = z.string().min(1).max(1_024);
const decimal = z.string().max(1_024)
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const shareQuantity = z.string().max(39)
  .regex(/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{0,17}[1-9])?$/)
  .refine((value) => value !== '0');
const retry = z.enum([
  'same_operation_only',
  'reconcile_same_intent_only',
  'read_again',
  'manual_same_intent_only',
  'none',
]);

const originalIntent = z.object({ intentId }).strict();
const nextAction = z.union([
  z.object({
    tool: z.literal('dexter_execute_asset_action'),
    arguments: z.object({ operationId, intentId }).strict(),
    condition: reason,
    reason,
  }).strict(),
  z.object({
    tool: z.literal('dexter_asset_action_status'),
    arguments: originalIntent,
    reason,
  }).strict(),
  z.object({
    tool: z.literal('dexter_reconcile_asset_action'),
    arguments: originalIntent,
    condition: reason,
    reason,
  }).strict(),
  z.object({
    tool: z.literal('dexter_wallet_portfolio'),
    arguments: z.object({}).strict(),
    reason,
  }).strict(),
  z.object({
    action: z.literal('review_wallet_permission'),
    url: z.string().url(),
    expiresAt: timestamp.optional(),
    directApprovalLinkAvailable: z.boolean(),
    reason,
  }).strict(),
  z.object({
    action: z.literal('open_approval'),
    url: z.string().url(),
    expiresAt: timestamp,
    reason,
  }).strict(),
  z.object({
    action: z.enum([
      'inspect_original_connection',
      'report_not_executed',
      'follow_prepare_decision',
      'use_returned_recovery',
    ]),
    reason,
  }).strict(),
  z.object({
    action: z.literal('retry_same_preparation'),
    operationId,
    reason,
  }).strict(),
  z.object({
    action: retry,
    operationId: operationId.nullable(),
    reason,
  }).strict(),
  // Output compatibility with the already-approved maintenance presentation.
  z.object({
    action: z.literal('resume_original_prepare_after_maintenance'),
    operationId: operationId.nullable(),
    reason,
  }).strict(),
]);

const rawQuoteAmount = z.object({
  amountAtomic: GOVERNED_U64_DECIMAL_SCHEMA,
  mint,
  displayAmount: z.null(),
  displayStatus: z.literal(
    'This quote provides raw units; a displayed share quantity is available only where explicitly returned below.',
  ),
}).strict();

const quoteAmount = z.union([
  z.object({
    amount: decimal,
    symbol: z.literal('USDC'),
    amountAtomic: GOVERNED_U64_DECIMAL_SCHEMA,
    mint,
    decimals: z.literal(6),
  }).strict(),
  z.object({
    amount: decimal.max(256),
    symbol,
    amountAtomic: GOVERNED_U64_DECIMAL_SCHEMA,
    mint,
    decimals: z.number().int().min(0).max(18),
    amountModel: z.enum(['raw-decimals', 'scaled-ui-amount']),
    multiplierObservation: z.object({
      value: decimal.max(128),
      observedAtUnixMs: time,
      observedSlot: time.refine((value) => value > 0),
    }).strict(),
  }).strict(),
  rawQuoteAmount,
  rawQuoteAmount.extend({
    symbol,
    decimals: z.number().int().min(0).max(18),
    tokenProgram: z.enum(['spl-token', 'token-2022']),
  }).strict(),
]);

const actualAmount = z.union([
  z.object({ symbol, amount: decimal }).strict(),
  z.object({
    symbol,
    amount: z.null(),
    baseTokenAmount: decimal,
    displayStatus: z.literal(
      'Historical display scaling is unavailable; this base-token quantity is not a verified share equivalent.',
    ),
  }).strict(),
]);

const actual = z.union([
  z.object({
    debit: actualAmount,
    credit: actualAmount,
    observedAt: timestamp,
    receiptDigest: z.string().regex(/^[a-f0-9]{64}$/),
    fees: z.literal('Verified fee amounts are unavailable.'),
  }).strict(),
  z.object({
    available: z.literal(false),
    message: z.literal('Actual fill amounts are unavailable. The saved quote remains an estimate.'),
  }).strict(),
]).describe('Recorded receipt amounts or the reason actual fill amounts are unavailable.');

export function createGovernedPresentationSchemas({ feeSummary }) {
  const preview = z.object({
    basis: z.literal('estimated_quote'),
    action: z.enum(['send', 'buy', 'sell']),
    assetId: GOVERNED_ASSET_ID_SCHEMA,
    product: z.object({
      name: z.string().min(1).max(128),
      companyName: z.string().min(1).max(128).nullable(),
      symbol,
    }).strict(),
    requestedValue: z.object({
      amount: shareQuantity,
      currency: z.literal('USD'),
      basis: z.literal('market_value_at_preparation'),
      priceRetrievedAtUnixMs: time,
    }).strict().optional(),
    selectedReferenceValue: z.object({
      amount: decimal.max(256),
      currency: z.literal('USD'),
      basis: z.literal('floor_rounded_reference_value'),
    }).strict().optional(),
    input: quoteAmount.nullable(),
    expectedOutput: quoteAmount.nullable(),
    minimumOutput: quoteAmount.nullable(),
    maximumInput: quoteAmount.nullable(),
    requestedMaximumSpend: quoteAmount.nullable(),
    requestAmountKind: z.enum(['input', 'share-quantity', 'usd-value']).optional(),
    requestedShareQuantity: shareQuantity.nullable().optional(),
    expectedShareQuantity: shareQuantity.nullable().optional(),
    minimumShareQuantity: shareQuantity.nullable().optional(),
    shareQuantityUnit: z.literal('underlying-share-equivalent').nullable().optional(),
    shareQuantitySemantics: z.literal('minimum-receive').nullable().optional(),
    overfillPossible: z.boolean().optional(),
    slippageBps: z.number().int().min(0).max(10_000).nullable(),
    priceImpactBps: z.number().int().min(0).max(10_000).nullable(),
    destinationOwner: address.nullable(),
    quoteExpiresAtUnixMs: time.nullable(),
    quotedFees: feeSummary,
  }).strict().describe('Estimated preparation terms. Actual receipt amounts appear in actual.');

  const action = z.object({
    status: z.enum([
      'not-created', 'unknown', 'prepared', 'claimed', 'signed', 'submitted',
      'confirmed', 'refused', 'ambiguous', 'reconciliation-required',
      'pending', 'uncertain', 'unavailable', 'paused',
    ]),
    summary: z.string().min(1).max(2_048)
      .describe('Existing human account of the saved action and its verified result.'),
    intentId: intentId.nullable().optional(),
    operationId: operationId.nullable().optional(),
    transactionSignature: z.string().min(1).max(256).optional(),
    code: z.string().min(1).max(128).optional(),
    retryable: z.boolean().optional(),
    retryWithSameRequestOnly: z.literal(true).optional(),
    retryAfterMs: z.number().int().min(Number.MIN_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER).optional(),
    retry: retry.optional(),
    approval: z.union([
      z.object({
        status: z.literal('not-required'),
        reasons: z.tuple([]),
      }).strict(),
      z.object({
        status: z.literal('owner-approval-required'),
        reasons: z.array(z.string().min(1).max(128)).max(32),
      }).strict(),
    ]).optional(),
    effectiveExpiresAt: timestamp.optional(),
    preview: preview.optional(),
    actual: actual.optional(),
    nextActions: z.array(nextAction).min(1).max(2)
      .describe('Continuation instructions that preserve the original request and recovery limits.'),
    recoveryOutcome: z.enum([
      'already-final', 'advanced', 'pending', 'not-required', 'unavailable',
    ]).optional(),
    recoveryMessage: reason.optional(),
    // These fields are emitted by the approved maintenance response only.
    operation: z.enum(['prepare', 'execute', 'reconcile']).optional(),
    executionOutcome: z.literal('not_reported').optional(),
  }).strict();

  const history = z.object({
    items: z.array(action).max(100),
    nextCursor: z.string().min(1).max(GOVERNED_HISTORY_CURSOR_MAX_LENGTH).nullable(),
  }).strict();

  return Object.freeze({ action, history, error: action });
}
