import { z } from 'zod';
import { GOVERNED_RETURNED_ASSET_ID_SCHEMA as ASSET, GOVERNED_TOKEN_MINT_SCHEMA as ADDRESS,
  GOVERNED_TOKEN_PREPARE_INPUT_SCHEMA, GOVERNED_U64_DECIMAL_SCHEMA as U64 } from './governed-asset-contract.mjs';
import { usdValueMatchesAsset } from './governed-usd-value.mjs';

const UUID = z.string().uuid(), HASH = z.string().regex(/^[a-f0-9]{64}$/);
const ID = z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const timestamp = z.string().datetime(), reason = z.string().min(1).max(128);
const signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,96}$/);
const decimal = z.string().max(256).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const object = schema => schema.innerType ? object(schema.innerType()) : schema;
const issue = (ctx, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
export const TOKEN_SETUP_CODES = Object.freeze(['token_session_setup_pending', 'token_trading_setup_pending',
  'token_trading_setup_changed', 'token_trade_quote_pending', 'token_trade_quote_missing']);
export const TOKEN_SETUP_RECOVERY_SCHEMA = z.object({
  namespace: z.literal('dexter-token-prepare-recovery/v1'), status: z.literal('uncertain'), executed: z.literal(false),
  requestId: ID, operationId: ID, intentId: UUID, code: z.enum(TOKEN_SETUP_CODES),
  retryWithSameRequestOnly: z.literal(true), retryAfterMs: z.literal(10000), settlement: z.literal('not-submitted'),
  arguments: GOVERNED_TOKEN_PREPARE_INPUT_SCHEMA,
}).strict().superRefine((v, ctx) => {
  if (v.requestId !== v.operationId || v.arguments.operationId !== v.operationId) issue(ctx, 'token recovery request identity differs');
});

const amount = z.object({ mint: ADDRESS, symbol: z.string().min(1).max(44), amountAtomic: U64,
  decimals: z.number().int().min(0).max(18), amount: decimal }).strict().superRefine((v, ctx) => {
  const digits = v.amountAtomic.padStart(v.decimals + 1, '0');
  const expected = v.decimals === 0 ? digits : `${digits.slice(0, -v.decimals)}.${digits.slice(-v.decimals)}`.replace(/\.?0+$/, '') || '0';
  if (v.amount !== expected) issue(ctx, 'token receipt display amount differs');
});
const receipt = z.object({ namespace: z.literal('dexter-token-trade-receipt-outcome/v1'), status: z.literal('recorded'),
  intentId: UUID, attemptId: UUID, transactionSignature: signature, commitment: z.enum(['confirmed', 'finalized']),
  transactionSlot: U64, observedAt: timestamp, receiptDigest: HASH, debit: amount, credit: amount,
  fees: z.object({ serviceFee: z.object({ mint: z.literal(USDC), amountAtomic: U64 }).strict(),
    networkFee: z.object({ amountLamports: U64 }).strict(), routeFees: z.null() }).strict(),
}).strict();
const summary = z.object({ namespace: z.literal('dexter-token-trade-summary/v1'), action: z.enum(['buy', 'sell']),
  assetId: ASSET, mint: ADDRESS, requestAmountKind: z.enum(['input', 'usd-value']), requestedValueUsd: decimal.nullable(),
  inputMint: ADDRESS, outputMint: ADDRESS, inputAmountAtomic: U64, quotedOutputAtomic: U64, minimumOutputAtomic: U64,
  actualInputAmountAtomic: U64.nullable(), actualOutputAmountAtomic: U64.nullable(),
}).strict();
function outcomeMatches(v) {
  const b = v.business ?? v, s = v.tradeSummary, r = v.receiptOutcome;
  const success = b.executionSucceeded === true;
  if (s && (s.action !== b.action || s.assetId !== b.assetId || s.inputAmountAtomic !== b.amountAtomic ||
      s.inputMint !== (s.action === 'buy' ? USDC : s.mint) || s.outputMint !== (s.action === 'buy' ? s.mint : USDC) ||
      BigInt(s.quotedOutputAtomic) < BigInt(s.minimumOutputAtomic))) return false;
  if (s && (s.requestAmountKind === 'input' ? s.requestedValueUsd !== null : s.action !== 'sell' || s.requestedValueUsd === null)) return false;
  if (!success) return r === null && (!s || s.actualInputAmountAtomic === null && s.actualOutputAmountAtomic === null);
  if (!r || !s || r.intentId !== v.intentId || r.attemptId !== v.attemptId || r.transactionSignature !== v.transactionSignature ||
      r.commitment !== (b.finality ?? v.confirmationCommitment) ||
      r.debit.mint !== s.inputMint || r.credit.mint !== s.outputMint ||
      r.debit.amountAtomic !== s.actualInputAmountAtomic || r.credit.amountAtomic !== s.actualOutputAmountAtomic ||
      (v.confirmationSlot !== undefined && r.transactionSlot !== v.confirmationSlot)) return false;
  const cash = s.action === 'buy' ? r.debit : r.credit;
  return cash.mint === USDC && cash.decimals === 6 && cash.symbol === 'USDC';
}

/** Strict public projection of the API token family. Legacy/stock schemas stay separate. */
export function createTokenResultContracts(base) {
  const { canonicalHash } = base;
  const wallet = z.object({ vaultPda: ADDRESS, swigAddress: ADDRESS, walletAddress: ADDRESS }).strict();
  const authority = z.object({ authorityNamespace: z.literal('token-family-v2'),
    authoritySelectionDigest: HASH, authorityEffectDigest: HASH, policyIdentityDigest: HASH }).strict();
  const attribution = base.attribution.extend({ grant: authority.extend({ id: UUID, revision: z.number().int().positive(),
    revisionDigest: HASH, validFrom: timestamp, expiresAt: timestamp.nullable() }).strict() }).strict();
  const business = base.business.extend({ assetId: ASSET.nullable(), action: z.enum(['buy', 'sell']), protocolId: z.literal('jupiter-v2') }).strict();
  const product = object(object(base.preview).shape.productIdentity).extend({ assetId: ASSET,
    assetClass: z.enum(['token', 'cash']), mint: ADDRESS, symbol: z.string().min(1).max(44),
    companyName: z.null(), issuer: z.null(), providerName: z.null(), legalIssuerName: z.null(),
    decimals: z.number().int().min(0).max(18) }).omit({ amountModel: true, displayMultiplier: true, amountObservedAtUnixMs: true, amountObservedAtSlot: true }).strict();
  const preview = object(base.preview).extend({ assetId: ASSET, symbol: z.string().min(1).max(44), productIdentity: product,
    action: z.enum(['buy', 'sell']), requestAmountKind: z.enum(['input', 'usd-value']), inputMint: ADDRESS, outputMint: ADDRESS,
    expectedOutputAtomic: U64, minimumOutputAtomic: U64, slippageBps: z.number().int().min(0).max(500),
    priceImpactBps: z.number().int().min(0).max(10000), quoteExpiresAtUnixMs: z.number().int().nonnegative(),
    requestedShareQuantity: z.null(), expectedShareQuantity: z.null(), minimumShareQuantity: z.null(),
    shareQuantityUnit: z.null(), shareQuantitySemantics: z.null(), shareQuantityConversion: z.null(),
    requestedMaximumSpendAtomic: z.null(), overfillPossible: z.literal(false), destinationOwner: z.null(),
  }).omit({ stockSelection: true }).strict();
  const prepared = object(base.prepared).omit({ stockRuntime: true }).extend({ attribution, business, preview,
    tokenRuntime: z.object({ namespace: z.literal('dexter-token-vault-v2-prepare-binding/v1'),
      preparedDigest: HASH, quoteExpiresAtSlot: U64 }).strict(),
  }).strict().superRefine((v, ctx) => {
    const p = v.preview, b = v.business, a = p.productIdentity, buy = b.action === 'buy';
    if (p.assetId !== a.assetId || b.assetId !== a.assetId || p.action !== b.action || p.symbol !== a.symbol ||
        p.amountAtomic !== b.amountAtomic || p.maximumInputAmountAtomic !== p.amountAtomic ||
        p.inputMint !== (buy ? USDC : a.mint) || p.outputMint !== (buy ? a.mint : USDC) ||
        b.lifecycle !== 'prepared' || b.settlement !== 'not-submitted' || b.executionSucceeded !== null ||
        b.finality !== 'not-final' || b.programError || b.ambiguity.status !== 'none' || b.ambiguity.retrySameRequestOnly || b.reconciliation.required ||
        b.reconciliation.availableToOwner || b.refusalOrEscalationReasons.length || v.approval.reasons.length || b.destinationOwner !== null ||
        p.feeSummary.serviceFee?.side !== (buy ? 'input' : 'output') || p.feeSummary.serviceFee?.mint !== USDC ||
        p.feeSummary.serviceFee?.tokenProgram !== 'spl-token' || p.feeSummary.routeFees.length !== 0 ||
        v.authoritySnapshotDigest !== canonicalHash({selection: v.attribution.grant.authoritySelectionDigest, effect: v.attribution.grant.authorityEffectDigest}) ||
        v.approval.status !== 'not-required' || v.account?.status !== 'already-exists' ||
        BigInt(p.expectedOutputAtomic) < BigInt(p.minimumOutputAtomic) ||
        Date.parse(v.effectiveExpiresAt) !== p.quoteExpiresAtUnixMs ||
        (p.requestAmountKind === 'usd-value' ? !usdValueMatchesAsset(p.usdValue, p.action, p.amountAtomic, a) : p.usdValue !== undefined)) {
      issue(ctx, 'token preparation identity or terms differ');
    }
  });
  const status = z.object({
    namespace: z.literal('dexter-governed-transaction-status/v1'), intentId: UUID, attemptId: UUID.nullable(), requestId: ID,
    action: z.enum(['buy', 'sell']), assetId: ASSET, assetMint: ADDRESS, tokenProgram: z.enum(['spl-token', 'token-2022']).nullable(),
    amountAtomic: U64.nullable(), destinationOwner: z.null(), protocolId: z.literal('jupiter-v2'),
    operationCeremony: z.object({ kind: z.literal('token-vault-v2-swap'), assetClass: z.literal(2),
      evidenceNamespace: z.literal('dexter-token-quote-evidence/v1') }).strict(), wallet, actor: z.literal('agent'),
    runtime: z.object({ principalSource: z.literal('mcp-link-token'), linkTokenId: UUID, surfaceBindingDigest: HASH }).strict(),
    agentId: UUID, grantId: UUID, grantRevision: z.number().int().positive(), grantRevisionDigest: HASH, grantRuleId: z.null(),
    authorityIdentity: authority.extend({ authoritySelectionDigest: HASH.nullable(), authorityEffectDigest: HASH.nullable(), policyIdentityDigest: HASH.nullable() }).strict(),
    status: z.enum(['setup-pending', 'prepared', 'claimed', 'signed', 'submitted', 'confirmed', 'refused', 'ambiguous']),
    ledgerState: z.enum(['setup-pending', 'prepared', 'unsigned', 'agent-signed', 'facilitator-contact', 'fully-signed',
      'dispatching', 'pending', 'confirmed-success', 'finalized-success', 'failed-final', 'expired-unlanded', 'expired-unsubmitted', 'refused-unsubmitted']),
    createdAt: timestamp, lastActivityAt: timestamp, transactionSignature: signature.nullable(), submitted: z.boolean(),
    landingProof: z.boolean(), definitiveNonlandingProof: z.boolean(), executionSucceeded: z.boolean().nullable(),
    confirmationSlot: U64.nullable(), confirmationCommitment: z.enum(['confirmed', 'finalized']).nullable(), settlementFinalized: z.boolean(),
    reconciliationRequired: z.boolean(), canReconcile: z.boolean(), refusalCode: reason.nullable(),
    replay: z.object({ statusReadSafe: z.literal(true), reconcileSameAttemptOnly: z.literal(true), executeFromStatusForbidden: z.literal(true) }).strict(),
    tradeSummary: summary.nullable(), receiptOutcome: receipt.nullable(), retryAfterMs: z.literal(10000).optional(),
  }).strict().superRefine((v, ctx) => {
    const setup = v.status === 'setup-pending', success = v.executionSucceeded === true;
    const terminal = ['finalized-success', 'failed-final', 'expired-unlanded', 'expired-unsubmitted', 'refused-unsubmitted'].includes(v.ledgerState);
    const landed = v.executionSucceeded !== null;
    const expectedStatus = v.ledgerState === 'setup-pending' ? 'setup-pending' : v.ledgerState === 'prepared' ? 'prepared'
      : ['confirmed-success', 'finalized-success'].includes(v.ledgerState) ? 'confirmed' : terminal ? 'refused'
        : ['dispatching', 'pending'].includes(v.ledgerState) ? 'submitted' : v.ledgerState === 'fully-signed' ? 'signed'
          : v.ledgerState === 'facilitator-contact' ? 'ambiguous' : 'claimed';
    if (!outcomeMatches(v) || v.status !== expectedStatus || v.landingProof !== landed ||
        v.canReconcile !== (v.attemptId !== null && !terminal) || v.reconciliationRequired !== v.canReconcile ||
        (['confirmed-success','finalized-success'].includes(v.ledgerState) !== success) ||
        (v.ledgerState === 'failed-final') !== (v.executionSucceeded === false) ||
        (v.ledgerState === 'prepared' && (v.attemptId !== null || v.submitted || v.transactionSignature !== null)) ||
        (!setup && (!v.tradeSummary || !v.tokenProgram || Object.values(v.authorityIdentity).some(value => value === null))) ||
        (v.tradeSummary && (v.assetMint !== v.tradeSummary.mint || v.assetId !== v.tradeSummary.assetId)) ||
        (setup && (v.ledgerState !== 'setup-pending' || v.attemptId !== null || v.submitted || v.landingProof || v.transactionSignature !== null || v.tradeSummary !== null || v.canReconcile)) ||
        (success && (v.status !== 'confirmed' || !v.landingProof || !v.submitted || !v.transactionSignature || !v.attemptId)) ||
        v.settlementFinalized !== (v.confirmationCommitment === 'finalized' && v.landingProof) ||
        v.definitiveNonlandingProof !== (v.ledgerState === 'expired-unlanded')) issue(ctx, 'token status evidence differs');
  });
  const execute = base.execute.extend({ attribution, business, tradeSummary: summary, receiptOutcome: receipt.nullable() }).strict()
    .superRefine((v, ctx) => {
      if (!outcomeMatches(v) || v.business.destinationOwner !== null ||
          v.business.programError !== (v.business.executionSucceeded === false) ||
          (v.business.executionSucceeded !== null && v.business.settlement !== 'landed') ||
          (v.receiptOutcome && v.evidenceDigest !== v.receiptOutcome.receiptDigest) || v.executed !== (v.business.executionSucceeded === true) ||
          (v.executed && (v.status !== 'confirmed' || v.business.lifecycle !== 'confirmed' || v.business.settlement !== 'landed' || !v.evidenceDigest)) ||
          (!v.executed && v.status === 'confirmed')) issue(ctx, 'token execution evidence differs');
    });
  const reconcile = base.reconcile.extend({ code: reason.nullable(), statusAfter: status }).strict().superRefine((v, ctx) => {
    const { digest, ...material } = v;
    if (digest !== canonicalHash(material) || v.intentId !== v.statusAfter.intentId || v.attemptId !== v.statusAfter.attemptId) issue(ctx, 'token recovery identity differs');
  });
  const pending = base.uncertain.extend({ intentId: UUID, retryAfterMs: z.literal(10000) }).strict();
  return { prepared, execute, status, reconcile, pending, outcomeMatches };
}

export function isTokenResult(body) {
  return body?.tokenRuntime?.namespace === 'dexter-token-vault-v2-prepare-binding/v1' ||
    body?.attribution?.grant?.authorityNamespace === 'token-family-v2' || body?.authorityIdentity?.authorityNamespace === 'token-family-v2' ||
    body?.statusAfter?.authorityIdentity?.authorityNamespace === 'token-family-v2';
}
export function tokenResponseMatchesInput(operation, input, body) {
  if (!body || typeof body !== 'object') return false;
  if (body.namespace === 'dexter-governed-agent-http-refusal/v1') return true;
  if (operation === 'prepare') {
    if (!GOVERNED_TOKEN_PREPARE_INPUT_SCHEMA.safeParse(input).success || body.requestId !== input.operationId ||
        body.business?.action !== input.action || body.business.destinationOwner !== null || body.business.protocolId !== 'jupiter-v2') return false;
    if (body.status !== 'prepared') return body.business.assetId === null && body.business.amountAtomic === (input.amountAtomic ?? null) &&
      body.executed === false && body.business.lifecycle === 'not-created' && body.business.settlement === 'not-submitted' &&
      body.business.executionSucceeded === null && body.business.programError === false && body.business.finality === 'not-final';
    const p = body.preview;
    return p?.productIdentity?.mint === input.tokenMint && p.action === input.action &&
      (input.valueUsd === undefined ? p.requestAmountKind === 'input' && p.amountAtomic === input.amountAtomic
        : p.requestAmountKind === 'usd-value' && p.usdValue?.requestedValueUsd === input.valueUsd) &&
      (input.maxSlippageBps === undefined || p.slippageBps <= input.maxSlippageBps) &&
      (input.maxPriceImpactBps === undefined || p.priceImpactBps <= input.maxPriceImpactBps);
  }
  if (operation === 'execute') return body.requestId === input.operationId && body.intentId === input.intentId;
  return body.intentId === input.intentId;
}
export function tokenSetupRecovery(body, input) {
  if (!tokenResponseMatchesInput('prepare', input, body) || body.status !== 'uncertain' || body.attribution !== null ||
      !TOKEN_SETUP_CODES.includes(body.code) || body.retryWithSameRequestOnly !== true || body.retryAfterMs !== 10000 ||
      body.business.ambiguity?.status !== 'unresolved' || body.business.ambiguity?.retrySameRequestOnly !== true ||
      body.business.reconciliation?.required !== false) return null;
  const result = TOKEN_SETUP_RECOVERY_SCHEMA.safeParse({ namespace: 'dexter-token-prepare-recovery/v1', status: 'uncertain',
    executed: false, requestId: body.requestId, operationId: input.operationId, intentId: body.intentId, code: body.code,
    retryWithSameRequestOnly: true, retryAfterMs: 10000, settlement: 'not-submitted', arguments: input });
  return result.success ? result.data : null;
}

/** Browser and server use the same receipt arithmetic and economic identity. */
export function readTokenOutcome(body) {
  if (!isTokenResult(body) || !summary.safeParse(body?.tradeSummary).success) return null;
  if (body.receiptOutcome !== null && !receipt.safeParse(body.receiptOutcome).success) return null;
  if (!outcomeMatches(body)) return null;
  return { summary: body.tradeSummary, receipt: body.receiptOutcome };
}
