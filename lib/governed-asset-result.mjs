import { z } from 'zod';
import {
  GOVERNED_ASSET_ID_SCHEMA,
  GOVERNED_ASSET_OPERATIONS,
  GOVERNED_HISTORY_CURSOR_MAX_LENGTH,
  GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA,
  GOVERNED_SHARE_QUANTITY_SCHEMA,
  GOVERNED_U64_DECIMAL_SCHEMA,
} from './governed-asset-contract.mjs';
import { canonicalHash } from './governed-canonical-identity.mjs';

const UUID = z.string().uuid();
const BOUNDED_ID = z.string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const U64 = GOVERNED_U64_DECIMAL_SCHEMA;
const POSITIVE_U64 = GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA;
const SHARE_QUANTITY = GOVERNED_SHARE_QUANTITY_SCHEMA;
const ADDRESS = z.string().min(32).max(64);
const TIMESTAMP = z.string().datetime();
const REASON = z.string().min(1).max(128);
const ASSET = GOVERNED_ASSET_ID_SCHEMA;
const ACTION = z.enum(['send', 'buy', 'sell']);
const MINT = z.union([z.literal('native:SOL'), ADDRESS]);
const TOKEN_PROGRAM = z.enum(['native', 'spl-token', 'token-2022']);
const PROTOCOL_ID = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);

const productIdentity = z.object({
  assetId: ASSET,
  assetClass: z.enum(['cash', 'yield', 'token', 'stock', 'fund', 'nft', 'rwa']),
  companyName: z.string().min(1).max(128).nullable(),
  productName: z.string().min(1).max(128),
  symbol: z.string().min(1).max(32),
  providerName: z.string().min(1).max(128).nullable().optional(),
  legalIssuerName: z.string().min(1).max(128).nullable().optional(),
  issuer: z.string().min(1).max(128).nullable(),
  network: z.literal('solana-mainnet'),
  mint: ADDRESS,
  tokenProgram: z.enum(['spl-token', 'token-2022']),
  decimals: z.number().int().min(0).max(18),
  registryIdentityDigest: HASH,
}).strict().superRefine((value, context) => {
  if (
    typeof value.legalIssuerName === 'string'
    && value.issuer !== value.legalIssuerName
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['issuer'],
      message: 'issuer must equal the formal legal issuer compatibility alias',
    });
  }
});

const preparedFeeLine = z.object({
  amountAtomic: U64,
  mint: ADDRESS,
}).strict();

const feeSummary = z.object({
  summary: z.literal(
    'Trading fees are included in this quote; network fee is calculated at execution.',
  ),
  platformFee: preparedFeeLine.nullable(),
  routeFees: z.array(preparedFeeLine).max(32),
  networkFee: z.object({
    status: z.literal('not-yet-calculated'),
    amountLamports: z.null(),
  }).strict(),
}).strict();

const wallet = z.object({
  vaultPda: ADDRESS,
  swigAddress: ADDRESS,
  walletAddress: ADDRESS,
}).strict();

const attribution = z.object({
  actor: z.literal('agent'),
  runtime: z.object({
    source: z.literal('mcp-link-token'),
    agentId: UUID,
    linkTokenId: UUID,
    surfaceBindingDigest: HASH,
    sessionBindingDigest: HASH,
  }).strict(),
  wallet,
  grant: z.object({
    id: UUID,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    revisionDigest: HASH,
    ruleId: UUID,
    riskPolicyDigest: HASH.nullable(),
    validFrom: TIMESTAMP,
    expiresAt: TIMESTAMP.nullable(),
  }).strict(),
}).strict();

const business = z.object({
  action: ACTION,
  assetId: ASSET,
  amountAtomic: POSITIVE_U64,
  destinationOwner: ADDRESS.nullable(),
  protocolId: PROTOCOL_ID,
  lifecycle: z.enum([
    'not-created',
    'unknown',
    'prepared',
    'claimed',
    'signed',
    'submitted',
    'confirmed',
    'refused',
    'ambiguous',
    'reconciliation-required',
  ]),
  settlement: z.enum([
    'not-submitted',
    'submission-pending',
    'landed',
    'definitively-not-landed',
    'unknown',
  ]),
  finality: z.enum(['not-final', 'confirmed', 'finalized', 'unknown']),
  executionSucceeded: z.boolean().nullable(),
  programError: z.boolean(),
  refusalOrEscalationReasons: z.array(REASON).max(32),
  ambiguity: z.object({
    status: z.enum(['none', 'unresolved']),
    retrySameRequestOnly: z.boolean(),
  }).strict(),
  reconciliation: z.object({
    required: z.boolean(),
    availableToOwner: z.boolean(),
  }).strict(),
}).strict();

const preview = z.object({
  action: ACTION,
  assetId: ASSET,
  symbol: z.string().min(1).max(32),
  amountAtomic: POSITIVE_U64,
  requestAmountKind: z.enum(['input', 'share-quantity']).optional(),
  requestedShareQuantity: SHARE_QUANTITY.nullable().optional(),
  expectedShareQuantity: SHARE_QUANTITY.nullable().optional(),
  minimumShareQuantity: SHARE_QUANTITY.nullable().optional(),
  maximumInputAmountAtomic: POSITIVE_U64.nullable().optional(),
  requestedMaximumSpendAtomic: POSITIVE_U64.nullable().optional(),
  shareQuantityUnit: z.literal('underlying-share-equivalent')
    .nullable().optional(),
  shareQuantitySemantics: z.literal('minimum-receive')
    .nullable().optional(),
  overfillPossible: z.boolean().optional(),
  productIdentity,
  feeSummary,
  shareQuantityConversion: z.object({
    assetVersionId: BOUNDED_ID,
    rawMinimumOutputAtomic: POSITIVE_U64,
    rawOutputDecimals: z.number().int().min(0).max(255),
    displayMultiplier: SHARE_QUANTITY,
    multiplierSource: z.enum(['token-2022-scaled-ui', 'identity']),
    multiplierObservedAtSlot: U64,
    multiplierEffectiveAtUnixMs: z.number().int().nonnegative()
      .max(Number.MAX_SAFE_INTEGER).nullable(),
  }).strict().nullable().optional(),
  inputMint: MINT,
  outputMint: MINT,
  destinationOwner: ADDRESS.nullable(),
  expectedOutputAtomic: U64.nullable(),
  minimumOutputAtomic: U64.nullable(),
  slippageBps: z.number().int().min(0).max(10_000).nullable(),
  priceImpactBps: z.number().int().min(0).max(10_000).nullable(),
  quoteExpiresAtUnixMs: z.number().int().nonnegative()
    .max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();

const preparedAccount = z.union([
  z.object({
    status: z.enum(['required', 'already-funded', 'reclaimable']),
    rentLedgerState: z.enum(['reserved', 'funded', 'reclaimable']),
    tokenAccountAddress: ADDRESS,
    ownerAddress: ADDRESS,
    mint: ADDRESS,
    tokenProgram: z.enum(['spl-token', 'token-2022']),
    payerAddress: ADDRESS,
    exactRentLamports: U64,
    fundingPolicy: z.enum([
      'vault-reclaimable',
      'user-funded-nonreclaimable',
      'sponsored-nonreclaimable',
    ]),
    rentLedgerId: UUID,
    rentLedgerReplayed: z.boolean(),
    fundedLamports: U64.nullable(),
  }).strict(),
  z.object({
    status: z.literal('already-exists'),
    tokenAccountAddress: ADDRESS,
  }).strict(),
]);

const preparedResponse = z.object({
  namespace: z.literal('dexter-governed-agent-action/v1'),
  requestId: BOUNDED_ID,
  executed: z.literal(false),
  attribution,
  business,
  status: z.literal('prepared'),
  intentId: UUID,
  planId: BOUNDED_ID,
  replayed: z.boolean(),
  approval: z.union([
    z.object({
      status: z.literal('not-required'),
      reasons: z.tuple([]),
    }).strict(),
    z.object({
      status: z.literal('owner-approval-required'),
      reasons: z.array(REASON).max(32),
    }).strict(),
  ]),
  effectiveExpiresAt: TIMESTAMP,
  riskEvidenceDigest: HASH,
  authoritySnapshotDigest: HASH,
  preview,
  account: preparedAccount.nullable(),
  execution: z.object({
    status: z.literal('not-executed'),
    signed: z.literal(false),
    submitted: z.literal(false),
  }).strict(),
}).strict();

const prepareRefusedResponse = z.object({
  namespace: z.literal('dexter-governed-agent-action/v1'),
  requestId: BOUNDED_ID,
  executed: z.literal(false),
  attribution: attribution.nullable(),
  business,
  status: z.literal('refused'),
  code: REASON,
  explanation: z.string().min(1).max(1_024),
  retryable: z.boolean(),
}).strict();

const prepareUncertainResponse = z.object({
  namespace: z.literal('dexter-governed-agent-action/v1'),
  requestId: BOUNDED_ID,
  executed: z.literal(false),
  attribution: attribution.nullable(),
  business,
  status: z.literal('uncertain'),
  code: REASON,
  explanation: z.string().min(1).max(1_024),
  retryWithSameRequestOnly: z.literal(true),
}).strict();

const executeResponse = z.object({
  namespace: z.literal('dexter-governed-agent-execute/v1'),
  status: z.enum(['pending', 'confirmed', 'uncertain', 'refused']),
  requestId: BOUNDED_ID,
  intentId: UUID,
  attemptId: UUID.nullable(),
  transactionSignature: z.string().min(64).max(128).nullable(),
  executed: z.boolean(),
  code: REASON.nullable(),
  explanation: z.string().min(1).max(1_024).nullable(),
  attribution,
  business,
  evidenceDigest: HASH.nullable(),
}).strict();

export const GOVERNED_TRANSACTION_STATUS_SCHEMA = z.object({
  namespace: z.literal('dexter-governed-transaction-status/v1'),
  intentId: UUID,
  attemptId: UUID.nullable(),
  requestId: BOUNDED_ID,
  action: ACTION,
  operationCeremony: z.object({
    kind: z.enum(['trade', 'send']),
    operationMessageBytes: z.union([z.literal(506), z.literal(589)]),
    operationMessageDomain: z.enum([
      'OTS_GOVERNED_SWAP_V1',
      'OTS_GOVERNED_SEND_V1',
    ]),
    actionDiscriminator: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    evidenceNamespace: z.enum([
      'dexter-protected-owner-trade-evidence/v2',
      'dexter-protected-owner-send-evidence/v1',
    ]),
  }).strict(),
  assetId: ASSET,
  assetMint: MINT,
  tokenProgram: TOKEN_PROGRAM,
  amountAtomic: POSITIVE_U64,
  destinationOwner: ADDRESS.nullable(),
  protocolId: PROTOCOL_ID,
  wallet,
  actor: z.enum(['owner', 'agent']),
  runtime: z.object({
    principalSource: z.enum(['authenticated-owner', 'mcp-link-token']),
    linkTokenId: UUID.nullable(),
    surfaceBindingDigest: HASH.nullable(),
  }).strict(),
  agentId: UUID.nullable(),
  grantId: UUID.nullable(),
  grantRevision: z.number().int().nonnegative()
    .max(Number.MAX_SAFE_INTEGER).nullable(),
  grantRevisionDigest: HASH.nullable(),
  grantRuleId: UUID.nullable(),
  policyDecision: z.enum(['allowed', 'approval_required']),
  escalationReasons: z.array(REASON).max(32),
  authorityExpiresAt: TIMESTAMP.nullable(),
  ownerDecision: z.object({
    required: z.boolean(),
    status: z.enum(['not-required', 'pending', 'approved', 'refused']),
    reason: REASON.nullable(),
    decidedAt: TIMESTAMP.nullable(),
  }).strict(),
  status: z.enum([
    'prepared',
    'claimed',
    'signed',
    'submitted',
    'confirmed',
    'refused',
    'ambiguous',
    'reconciliation-required',
  ]),
  ledgerState: z.enum([
    'prepared',
    'owner-refused',
    'claimed',
    'signed',
    'broadcast',
    'ambiguous',
    'confirmed',
    'provably_not_landed',
    'refused',
  ]),
  stateVersion: z.number().int().nonnegative()
    .max(Number.MAX_SAFE_INTEGER).nullable(),
  createdAt: TIMESTAMP,
  lastActivityAt: TIMESTAMP,
  transactionSignature: z.string().min(64).max(128).nullable(),
  submitted: z.boolean().nullable(),
  landingProof: z.boolean(),
  definitiveNonlandingProof: z.boolean(),
  executionSucceeded: z.boolean().nullable(),
  confirmationSlot: U64.nullable(),
  confirmationCommitment: z.enum(['confirmed', 'finalized']).nullable(),
  settlementFinalized: z.boolean(),
  reconciliationRequired: z.boolean(),
  canReconcile: z.boolean(),
  reconciliationKind: REASON.nullable(),
  reconciliationEvidenceDigest: HASH.nullable(),
  refusalSource: z.enum(['owner', 'executor']).nullable(),
  refusalCode: REASON.nullable(),
  receiptPhases: z.array(z.enum([
    'dispatch_fenced',
    'accepted',
    'uncertain',
    'refused_before_contact',
    'reconciled_confirmed',
    'reconciled_finalized',
    'reconciled_not_landed',
  ])).max(32),
  replay: z.object({
    statusReadSafe: z.literal(true),
    reconcileSameAttemptOnly: z.literal(true),
    executeFromStatusForbidden: z.literal(true),
  }).strict(),
}).strict();

const historyResponse = z.object({
  namespace: z.literal('dexter-governed-transaction-history/v1'),
  items: z.array(GOVERNED_TRANSACTION_STATUS_SCHEMA).max(100),
  nextCursor: z.string().min(1).max(GOVERNED_HISTORY_CURSOR_MAX_LENGTH)
    .nullable(),
}).strict();

const reconcileResponse = z.object({
  namespace: z.literal('dexter-governed-agent-reconcile/v1'),
  outcome: z.enum([
    'already-final',
    'advanced',
    'pending',
    'not-required',
    'unavailable',
  ]),
  phase: z.enum([
    'none',
    'facilitator-reconciliation',
    'validator-dispatch',
    'validator-reconciliation',
    'final',
  ]),
  intentId: UUID,
  attemptId: UUID.nullable(),
  mutated: z.boolean(),
  stateVersionBefore: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  code: z.enum([
    'agent_reconciliation_still_uncertain',
    'reconciliation_not_required',
    'agent_reconciliation_adapter_required',
    'agent_finality_adapter_required',
  ]).nullable(),
  explanation: z.string().min(1).max(1_024),
  statusAfter: GOVERNED_TRANSACTION_STATUS_SCHEMA,
  digest: HASH,
}).strict();

const httpRefusalResponse = z.object({
  namespace: z.literal('dexter-governed-agent-http-refusal/v1'),
  status: z.literal('refused'),
  code: REASON,
  explanation: z.string().min(1).max(1_024),
  executed: z.literal(false),
  signed: z.literal(false),
  submitted: z.literal(false),
  settlementFinalized: z.literal(false),
}).strict();

export const GOVERNED_LOCAL_FAILURE_SCHEMA = z.object({
  namespace: z.literal('opendexter-governed-backend-failure/v1'),
  operation: z.enum(GOVERNED_ASSET_OPERATIONS),
  status: z.enum(['unavailable', 'unknown']),
  operationId: BOUNDED_ID.nullable(),
  intentId: UUID.nullable(),
  code: z.enum([
    'governed_backend_transport_failed',
    'governed_backend_response_invalid',
    'governed_backend_configuration_unavailable',
  ]),
  explanation: z.string().min(1).max(512),
  retry: z.enum([
    'same_operation_only',
    'reconcile_same_intent_only',
    'read_again',
    'manual_same_intent_only',
    'none',
  ]),
}).strict();

export const GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS = Object.freeze({
  prepare: preparedResponse,
  execute: executeResponse,
  status: GOVERNED_TRANSACTION_STATUS_SCHEMA,
  reconcile: reconcileResponse,
  history: historyResponse,
});

const GOVERNED_BACKEND_RESPONSE_SCHEMAS = Object.freeze({
  prepare: z.union([
    preparedResponse,
    prepareRefusedResponse,
    prepareUncertainResponse,
    httpRefusalResponse,
  ]),
  execute: z.union([executeResponse, httpRefusalResponse]),
  status: z.union([GOVERNED_TRANSACTION_STATUS_SCHEMA, httpRefusalResponse]),
  reconcile: z.union([reconcileResponse, httpRefusalResponse]),
  history: z.union([historyResponse, httpRefusalResponse]),
});

function operationIds(operation, input) {
  return {
    operationId:
      operation === 'prepare' || operation === 'execute'
        ? input?.operationId ?? null
        : null,
    intentId:
      ['execute', 'status', 'reconcile'].includes(operation)
        ? input?.intentId ?? null
        : null,
  };
}

export function buildGovernedAssetFailure({
  operation,
  input,
  code,
}) {
  if (!GOVERNED_ASSET_OPERATIONS.includes(operation)) {
    throw new TypeError('invalid_governed_operation');
  }
  const ids = operationIds(operation, input);
  const executionUnknown = operation === 'execute';
  const reconciliationUnknown = operation === 'reconcile';
  const explanations = {
    governed_backend_transport_failed:
      executionUnknown
        ? 'The execute request may have reached Dexter, but no result was received. Do not execute again; inspect and reconcile the same intent.'
        : reconciliationUnknown
          ? 'No reconciliation result was received. Do not retry automatically; inspect the same intent before any manual retry.'
          : 'Dexter did not return a result for this request.',
    governed_backend_response_invalid:
      executionUnknown
        ? 'Dexter returned an invalid execute response. Do not execute again; inspect and reconcile the same intent.'
        : reconciliationUnknown
          ? 'Dexter returned an invalid reconciliation response. Do not retry automatically; inspect the same intent.'
          : 'Dexter returned a response that did not match the governed contract.',
    governed_backend_configuration_unavailable:
      'The OpenDexter governed-action service is not correctly configured, so no request was sent.',
  };
  const retry = code === 'governed_backend_configuration_unavailable'
    ? 'none'
    : operation === 'prepare'
      ? 'same_operation_only'
      : operation === 'execute'
        ? 'reconcile_same_intent_only'
        : operation === 'reconcile'
          ? 'manual_same_intent_only'
          : 'read_again';
  return {
    body: {
      namespace: 'opendexter-governed-backend-failure/v1',
      operation,
      status: executionUnknown || reconciliationUnknown
        ? 'unknown'
        : 'unavailable',
      ...ids,
      code,
      explanation: explanations[code]
        ?? 'The OpenDexter governed-action request failed closed.',
      retry,
    },
    httpStatus: 0,
    isError: true,
  };
}

function backendResultIsError(operation, httpStatus, body) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) {
    return true;
  }
  if (body.namespace === 'dexter-governed-agent-http-refusal/v1') return true;
  if (operation === 'prepare') return body.status !== 'prepared';
  if (operation === 'execute') {
    return body.status === 'refused'
      || body.status === 'uncertain'
      || (body.status === 'confirmed' && body.executed !== true);
  }
  if (operation === 'reconcile') {
    return body.outcome === 'not-required' || body.outcome === 'unavailable';
  }
  return false;
}

function exactExecuteBusinessIdentity(state) {
  if (state.action === 'send') {
    return state.destinationOwner !== null
      && state.protocolId === 'spl-transfer';
  }
  return state.destinationOwner === null
    && state.protocolId === 'jupiter-v2';
}

function exactExecuteResponse(httpStatus, body) {
  const state = body.business;
  const attemptPresent = body.attemptId !== null;
  const signaturePresent = body.transactionSignature !== null;
  const expectedAmbiguity = [
    'ambiguous',
    'reconciliation-required',
  ].includes(state.lifecycle)
    ? 'unresolved'
    : 'none';
  if (
    !exactExecuteBusinessIdentity(state)
    || body.attribution.grant.revision < 1
    || (signaturePresent && !attemptPresent)
    || state.ambiguity.status !== expectedAmbiguity
    || state.ambiguity.retrySameRequestOnly
    || state.reconciliation.availableToOwner
    || state.programError !== (
      state.settlement === 'landed'
      && state.executionSucceeded === false
    )
  ) {
    return false;
  }

  if (body.status === 'confirmed') {
    const reconciliationRequired = (
      state.action === 'buy' || state.action === 'sell'
    ) && state.finality === 'confirmed';
    return httpStatus === 200
      && attemptPresent
      && signaturePresent
      && body.evidenceDigest !== null
      && state.lifecycle === 'confirmed'
      && state.settlement === 'landed'
      && ['confirmed', 'finalized'].includes(state.finality)
      && state.executionSucceeded === body.executed
      && state.reconciliation.required === reconciliationRequired
      && (
        body.executed
          ? body.code === null
            && body.explanation === null
            && !state.programError
          : body.code === 'landed_program_error'
            && body.explanation !== null
            && state.programError
      );
  }

  if (body.status === 'pending') {
    const trade = state.action === 'buy' || state.action === 'sell';
    const claimed = state.lifecycle === 'claimed';
    const signed = state.lifecycle === 'signed';
    const submitted = state.lifecycle === 'submitted';
    return httpStatus === 202
      && attemptPresent
      && !body.executed
      && body.explanation !== null
      && state.executionSucceeded === null
      && !state.programError
      && state.ambiguity.status === 'none'
      && state.reconciliation.required === trade
      && state.finality === (trade ? 'unknown' : 'not-final')
      && (
        claimed
          ? !signaturePresent
            && body.code === 'claimed_attempt_resume_adapter_required'
            && state.settlement === 'not-submitted'
          : (signed || submitted)
            && signaturePresent
            && body.code === null
            && state.settlement === (
              signed ? 'not-submitted' : 'submission-pending'
            )
      );
  }

  if (body.status === 'uncertain') {
    const dispatchAmbiguous = body.code === 'dispatch_outcome_ambiguous';
    const postContactCodes = new Set([
      'protected_executor_result_invalid',
      'protected_executor_result_not_durable',
      'protected_executor_result_identity_mismatch',
      'durable_status_unavailable_after_executor_contact',
      'durable_status_invalid_after_executor_contact',
    ]);
    if (
      httpStatus !== 503
      || body.executed
      || body.code === null
      || body.explanation === null
      || state.executionSucceeded !== null
      || state.programError
      || state.ambiguity.status !== 'unresolved'
      || state.finality !== 'unknown'
    ) {
      return false;
    }
    if (dispatchAmbiguous) {
      const trade = state.action === 'buy' || state.action === 'sell';
      return attemptPresent
        && signaturePresent
        && ['ambiguous', 'reconciliation-required'].includes(state.lifecycle)
        && [
          'not-submitted',
          'submission-pending',
          'unknown',
        ].includes(state.settlement)
        && state.reconciliation.required === trade;
    }
    return postContactCodes.has(body.code)
      && !attemptPresent
      && !signaturePresent
      && body.evidenceDigest === null
      && state.lifecycle === 'ambiguous'
      && state.settlement === 'unknown'
      && state.reconciliation.required;
  }

  if (body.status === 'refused') {
    const expectedHttpStatus = body.code === 'owner_approval_required'
      || body.code === 'idempotency_conflict'
      ? 409
      : body.code === 'invalid_request'
        || body.code === 'invalid_delegated_execute_request'
        ? 400
        : 422;
    if (
      httpStatus !== expectedHttpStatus
      || body.executed
      || body.code === null
      || body.explanation === null
      || !['prepared', 'refused'].includes(state.lifecycle)
      || state.finality !== 'not-final'
      || state.ambiguity.status !== 'none'
      || state.reconciliation.required
      || state.programError
    ) {
      return false;
    }
    if (!attemptPresent) {
      return !signaturePresent
        && state.settlement === 'not-submitted'
        && [null, false].includes(state.executionSucceeded)
        && state.refusalOrEscalationReasons.length === 1
        && state.refusalOrEscalationReasons[0] === body.code;
    }
    if (state.lifecycle !== 'refused' || state.executionSucceeded !== false) {
      return false;
    }
    if (signaturePresent) {
      return state.settlement === 'definitively-not-landed'
        && body.code === 'definitively_not_landed'
        && body.evidenceDigest !== null;
    }
    return state.settlement === 'not-submitted'
      && body.evidenceDigest === null
      && state.refusalOrEscalationReasons.length === 1
      && state.refusalOrEscalationReasons[0] === body.code;
  }

  return false;
}

function exactGovernedActionIdentity(status) {
  const expected = status.action === 'send'
    ? {
      kind: 'send',
      operationMessageBytes: 506,
      operationMessageDomain: 'OTS_GOVERNED_SEND_V1',
      actionDiscriminator: 2,
      evidenceNamespace: 'dexter-protected-owner-send-evidence/v1',
      destination: 'present',
      protocolId: 'spl-transfer',
    }
    : {
      kind: 'trade',
      operationMessageBytes: 589,
      operationMessageDomain: 'OTS_GOVERNED_SWAP_V1',
      actionDiscriminator: status.action === 'buy' ? 0 : 1,
      evidenceNamespace: 'dexter-protected-owner-trade-evidence/v2',
      destination: 'absent',
      protocolId: 'jupiter-v2',
    };
  return Object.entries(expected).every(([key, value]) => {
    if (key === 'destination') {
      return value === 'present'
        ? status.destinationOwner !== null
        : status.destinationOwner === null;
    }
    if (key === 'protocolId') return status.protocolId === value;
    return status.operationCeremony[key] === value;
  });
}

function exactGovernedAgentAuthority(status) {
  if (
    status.actor !== 'agent'
    || status.runtime.principalSource !== 'mcp-link-token'
    || status.runtime.linkTokenId === null
    || status.runtime.surfaceBindingDigest === null
    || status.agentId === null
    || status.grantId === null
    || status.grantRevision === null
    || status.grantRevision < 1
    || status.grantRevisionDigest === null
    || status.grantRuleId === null
    || status.authorityExpiresAt === null
  ) {
    return false;
  }
  if (
    new Set(status.escalationReasons).size !== status.escalationReasons.length
    || JSON.stringify(status.escalationReasons)
      !== JSON.stringify([...status.escalationReasons].sort())
  ) {
    return false;
  }
  if (status.policyDecision === 'allowed') {
    return status.escalationReasons.length === 0
      && status.ownerDecision.required === false
      && status.ownerDecision.status === 'not-required'
      && status.ownerDecision.reason === null
      && status.ownerDecision.decidedAt === null;
  }
  if (!status.ownerDecision.required || status.escalationReasons.length === 0) {
    return false;
  }
  if (status.ownerDecision.status === 'pending') {
    return status.attemptId === null
      && status.status === 'prepared'
      && status.ledgerState === 'prepared'
      && status.ownerDecision.reason === null
      && status.ownerDecision.decidedAt === null;
  }
  if (status.ownerDecision.status === 'approved') {
    return status.ownerDecision.reason === null
      && status.ownerDecision.decidedAt !== null;
  }
  return status.ownerDecision.status === 'refused'
    && status.attemptId === null
    && status.status === 'refused'
    && status.ledgerState === 'owner-refused'
    && status.ownerDecision.reason !== null
    && status.ownerDecision.decidedAt !== null;
}

function expectedSubmitted(status, receipts) {
  if (status.ledgerState === 'broadcast' || status.ledgerState === 'confirmed') {
    return true;
  }
  if (status.ledgerState === 'ambiguous') {
    if (receipts.has('accepted')) return true;
    if (receipts.has('refused_before_contact')) return false;
    return null;
  }
  if (status.ledgerState === 'provably_not_landed') {
    if (receipts.has('accepted')) return true;
    return receipts.has('refused_before_contact') ? false : null;
  }
  return false;
}

function exactAssetProgramIdentity(status) {
  return status.tokenProgram === 'native'
    ? status.assetMint === 'native:SOL'
    : status.assetMint !== 'native:SOL';
}

function exactReceiptState(status, receipts) {
  const has = (phase) => receipts.has(phase);
  const postContactLedger = [
    'broadcast',
    'ambiguous',
    'confirmed',
    'provably_not_landed',
  ].includes(status.ledgerState);
  if (
    (
      has('dispatch_fenced')
      && ['prepared', 'owner-refused'].includes(status.ledgerState)
    )
    || (postContactLedger && !has('dispatch_fenced'))
    || (has('accepted') && has('refused_before_contact'))
    || (has('accepted') && has('uncertain'))
    || ([
      'accepted',
      'uncertain',
      'refused_before_contact',
      'reconciled_confirmed',
      'reconciled_finalized',
      'reconciled_not_landed',
    ].some(has) && !has('dispatch_fenced'))
    || (has('accepted') && ![
      'broadcast',
      'ambiguous',
      'confirmed',
      'provably_not_landed',
    ].includes(status.ledgerState))
    || (has('uncertain') && ![
      'ambiguous',
      'confirmed',
      'provably_not_landed',
    ].includes(status.ledgerState))
    || (
      has('refused_before_contact')
      && status.ledgerState !== 'provably_not_landed'
    )
    || (
      has('reconciled_confirmed')
      && status.ledgerState !== 'confirmed'
    )
    || (
      has('reconciled_finalized')
      && (
        status.ledgerState !== 'confirmed'
        || status.confirmationCommitment !== 'finalized'
        || !has('reconciled_confirmed')
      )
    )
    || (
      has('reconciled_not_landed')
      && status.ledgerState !== 'provably_not_landed'
    )
    || (
      has('reconciled_confirmed')
      && has('reconciled_not_landed')
    )
    || (
      has('reconciled_finalized')
      && has('reconciled_not_landed')
    )
    || (
      status.ledgerState === 'broadcast'
      && !has('accepted')
    )
    || (
      status.ledgerState === 'ambiguous'
      && (
        (status.status === 'submitted' && !has('accepted'))
        || (status.status === 'ambiguous' && !has('uncertain'))
        || (
          status.status === 'reconciliation-required'
          && (has('accepted') || has('uncertain'))
        )
      )
    )
    || (
      status.ledgerState === 'confirmed'
      && !has('reconciled_confirmed')
    )
    || (
      status.ledgerState === 'provably_not_landed'
      && !has('refused_before_contact')
      && !has('reconciled_not_landed')
    )
    || (
      has('refused_before_contact')
      && (
        has('accepted')
        || has('uncertain')
        || has('reconciled_confirmed')
        || has('reconciled_finalized')
        || has('reconciled_not_landed')
      )
    )
  ) {
    return false;
  }
  if (
    status.receiptPhases.length > 0
    && status.receiptPhases[0] !== 'dispatch_fenced'
  ) {
    return false;
  }
  return true;
}

function exactGovernedAgentStatusCrossFields(status) {
  if (
    !exactGovernedActionIdentity(status)
    || !exactAssetProgramIdentity(status)
    || !exactGovernedAgentAuthority(status)
  ) {
    return false;
  }
  const attemptPresent = status.attemptId !== null;
  if (
    attemptPresent !== (status.stateVersion !== null)
    || (attemptPresent && status.stateVersion < 1)
    || Date.parse(status.lastActivityAt) < Date.parse(status.createdAt)
  ) {
    return false;
  }

  const allowedLedgerStates = {
    prepared: ['prepared'],
    claimed: ['claimed'],
    signed: ['signed'],
    submitted: ['broadcast', 'ambiguous'],
    confirmed: ['confirmed'],
    refused: ['owner-refused', 'provably_not_landed', 'refused'],
    ambiguous: ['ambiguous'],
    'reconciliation-required': ['ambiguous'],
  };
  if (!allowedLedgerStates[status.status]?.includes(status.ledgerState)) {
    return false;
  }
  const noAttempt = status.ledgerState === 'prepared'
    || status.ledgerState === 'owner-refused';
  if (attemptPresent === noAttempt) return false;

  const receipts = new Set(status.receiptPhases);
  if (
    receipts.size !== status.receiptPhases.length
    || !exactReceiptState(status, receipts)
    || status.submitted !== expectedSubmitted(status, receipts)
  ) {
    return false;
  }

  const signedIdentityRequired = [
    'signed',
    'broadcast',
    'ambiguous',
    'confirmed',
    'provably_not_landed',
  ].includes(status.ledgerState);
  if (
    signedIdentityRequired !== (status.transactionSignature !== null)
    || status.landingProof !== (status.ledgerState === 'confirmed')
    || status.definitiveNonlandingProof
      !== (status.ledgerState === 'provably_not_landed')
    || (
      status.landingProof
      && status.definitiveNonlandingProof
    )
  ) {
    return false;
  }

  const landed = status.ledgerState === 'confirmed';
  const nonlanded = status.ledgerState === 'provably_not_landed';
  const ownerRefused = status.ledgerState === 'owner-refused';
  const executorRefused = status.ledgerState === 'refused';
  if (
    status.ownerDecision.status === 'pending'
    && (attemptPresent || status.ledgerState !== 'prepared')
  ) {
    return false;
  }
  if (
    attemptPresent
    && status.policyDecision === 'approval_required'
    && status.ownerDecision.status !== 'approved'
  ) {
    return false;
  }
  if (landed) {
    if (
      status.confirmationSlot === null
      || status.confirmationCommitment === null
      || !['landed_success', 'landed_program_error'].includes(
        status.reconciliationKind,
      )
      || status.reconciliationEvidenceDigest === null
      || status.executionSucceeded
        !== (status.reconciliationKind === 'landed_success')
      || status.settlementFinalized !== (
        status.executionSucceeded === true
        && status.confirmationCommitment === 'finalized'
      )
      || status.refusalSource !== null
      || status.refusalCode !== null
    ) {
      return false;
    }
  } else if (nonlanded) {
    if (
      status.confirmationSlot !== null
      || status.confirmationCommitment !== null
      || status.executionSucceeded !== false
      || status.settlementFinalized
      || status.reconciliationKind === null
      || status.reconciliationEvidenceDigest === null
      || status.refusalSource !== null
      || status.refusalCode !== null
    ) {
      return false;
    }
  } else if (ownerRefused || executorRefused) {
    if (
      status.confirmationSlot !== null
      || status.confirmationCommitment !== null
      || status.executionSucceeded !== false
      || status.settlementFinalized
      || status.reconciliationKind !== null
      || status.reconciliationEvidenceDigest !== null
      || status.refusalSource !== (ownerRefused ? 'owner' : 'executor')
      || status.refusalCode === null
      || receipts.has('refused_before_contact')
      || (
        ownerRefused
        && (
          status.ownerDecision.status !== 'refused'
          || status.ownerDecision.reason !== status.refusalCode
        )
      )
    ) {
      return false;
    }
  } else if (
    status.confirmationSlot !== null
    || status.confirmationCommitment !== null
    || status.executionSucceeded !== null
    || status.settlementFinalized
    || status.refusalSource !== null
    || status.refusalCode !== null
    || status.reconciliationKind !== null
    || status.reconciliationEvidenceDigest !== null
  ) {
    return false;
  }

  const recoverableAgentTrade = (
    status.action === 'buy' || status.action === 'sell'
  ) && (
    ['claimed', 'signed', 'broadcast', 'ambiguous'].includes(status.ledgerState)
    || (
      status.ledgerState === 'confirmed'
      && status.confirmationCommitment === 'confirmed'
    )
  );
  if (
    status.reconciliationRequired !== recoverableAgentTrade
    || status.canReconcile !== recoverableAgentTrade
  ) {
    return false;
  }
  return true;
}

function terminalReconciliationClass(status) {
  if (!exactGovernedAgentStatusCrossFields(status)) return null;
  if (
    status.ledgerState === 'confirmed'
    && status.confirmationCommitment === 'finalized'
  ) {
    return 'finalized-landing';
  }
  if (status.ledgerState === 'provably_not_landed') {
    return 'definitive-nonlanding';
  }
  if (status.ledgerState === 'owner-refused') return 'owner-refusal';
  if (status.ledgerState === 'refused') return 'executor-refusal';
  return null;
}

function exactReconcileResponse(httpStatus, body) {
  if (body.namespace === 'dexter-governed-agent-http-refusal/v1') {
    return httpStatus >= 400 && httpStatus <= 599;
  }
  const expectedHttpStatus = body.outcome === 'pending'
    ? 202
    : body.outcome === 'already-final' || body.outcome === 'advanced'
      ? 200
      : 409;
  if (
    httpStatus !== expectedHttpStatus
    || body.statusAfter.intentId !== body.intentId
    || body.statusAfter.attemptId !== body.attemptId
    || !exactGovernedAgentStatusCrossFields(body.statusAfter)
  ) {
    return false;
  }

  const afterVersion = body.statusAfter.stateVersion;
  const beforeVersion = body.stateVersionBefore;
  let versionAdvanced = false;
  if (beforeVersion === null || afterVersion === null) {
    if (beforeVersion !== afterVersion) return false;
  } else {
    if (afterVersion < beforeVersion) return false;
    versionAdvanced = afterVersion > beforeVersion;
  }
  if (body.mutated !== versionAdvanced) return false;

  const terminalClass = terminalReconciliationClass(body.statusAfter);
  const final = terminalClass !== null;
  if (
    body.outcome === 'already-final'
    && (
      body.phase !== 'final'
      || body.mutated
      || body.code !== null
      || !final
    )
  ) {
    return false;
  }
  if (
    body.outcome === 'advanced'
    && (
      !body.mutated
      || body.code !== null
      || !final
      || body.attemptId === null
      || !['buy', 'sell'].includes(body.statusAfter.action)
      || body.phase === 'none'
      || terminalClass === 'owner-refusal'
    )
  ) {
    return false;
  }
  if (
    body.outcome === 'pending'
    && (
      body.code !== 'agent_reconciliation_still_uncertain'
      || !['buy', 'sell'].includes(body.statusAfter.action)
      || body.attemptId === null
      || body.phase === 'none'
      || body.phase === 'final'
      || final
      || !body.statusAfter.reconciliationRequired
      || !body.statusAfter.canReconcile
    )
  ) {
    return false;
  }
  if (
    body.outcome === 'not-required'
    && (
      body.phase !== 'none'
      || body.mutated
      || body.code !== 'reconciliation_not_required'
      || body.statusAfter.reconciliationRequired
      || body.statusAfter.canReconcile
      || body.attemptId !== null
      || body.statusAfter.status !== 'prepared'
      || body.statusAfter.ledgerState !== 'prepared'
      || final
    )
  ) {
    return false;
  }
  if (
    body.outcome === 'unavailable'
    && (
      body.mutated
      || body.attemptId === null
      || ![
        'agent_reconciliation_adapter_required',
        'agent_finality_adapter_required',
      ].includes(body.code)
      || body.phase === 'none'
      || body.phase === 'final'
      || final
      || (
        body.code === 'agent_finality_adapter_required'
        && (
          body.phase !== 'validator-reconciliation'
          || body.statusAfter.ledgerState !== 'confirmed'
          || !body.statusAfter.landingProof
          || body.statusAfter.confirmationCommitment !== 'confirmed'
        )
      )
      || (
        body.code === 'agent_reconciliation_adapter_required'
        && !(
          (
            body.statusAfter.status === 'claimed'
            && body.phase === 'facilitator-reconciliation'
          )
          || (
            body.statusAfter.status === 'signed'
            && body.phase === 'validator-dispatch'
          )
          || (
            [
              'submitted',
              'ambiguous',
              'reconciliation-required',
            ].includes(body.statusAfter.status)
            && body.phase === 'validator-reconciliation'
          )
        )
      )
    )
  ) {
    return false;
  }

  try {
    const { digest, ...identity } = body;
    return canonicalHash(identity) === digest;
  } catch {
    return false;
  }
}

function decimalQuantityAtLeast(candidate, target) {
  const parts = (value) => {
    const [integer, fraction = ''] = value.split('.');
    return {
      integer: integer.replace(/^0+(?=[0-9])/, ''),
      fraction: fraction.replace(/0+$/, ''),
    };
  };
  const left = parts(candidate);
  const right = parts(target);
  if (left.integer.length !== right.integer.length) {
    return left.integer.length > right.integer.length;
  }
  if (left.integer !== right.integer) {
    return left.integer > right.integer;
  }
  const scale = Math.max(left.fraction.length, right.fraction.length);
  return left.fraction.padEnd(scale, '0')
    >= right.fraction.padEnd(scale, '0');
}

function decimalIntegerAndScale(value) {
  const [integer, fraction = ''] = value.split('.');
  return {
    integer: BigInt(`${integer}${fraction}`),
    scale: fraction.length,
  };
}

function scaledAtomicRepresentsAtLeast({
  rawAmountAtomic,
  rawDecimals,
  displayMultiplier,
  shareQuantity,
}) {
  const multiplier = decimalIntegerAndScale(displayMultiplier);
  const shares = decimalIntegerAndScale(shareQuantity);
  const left = BigInt(rawAmountAtomic)
    * multiplier.integer
    * (10n ** BigInt(shares.scale));
  const right = shares.integer
    * (10n ** BigInt(rawDecimals + multiplier.scale));
  return left >= right;
}

function backendResponseMatchesInput(operation, input, body) {
  if (body.namespace === 'dexter-governed-agent-http-refusal/v1') return true;
  if (operation === 'prepare') {
    const expectedDestination = input.action === 'send'
      ? input.destinationOwner
      : null;
    const quantityTarget = input.action === 'buy'
      && input.shareQuantity !== undefined;
    if (
      body.requestId !== input.operationId
      || body.business.action !== input.action
      || body.business.assetId !== input.assetId
      || body.business.destinationOwner !== expectedDestination
      || (!quantityTarget && body.business.amountAtomic !== input.amountAtomic)
    ) {
      return false;
    }
    if (body.status !== 'prepared') return true;
    if (
      body.preview.action !== input.action
      || body.preview.assetId !== input.assetId
      || body.preview.destinationOwner !== expectedDestination
      || (
        input.maxSlippageBps !== undefined
        && body.preview.slippageBps !== input.maxSlippageBps
      )
      || (
        input.maxPriceImpactBps !== undefined
        && body.preview.priceImpactBps !== input.maxPriceImpactBps
      )
    ) {
      return false;
    }
    if (!quantityTarget) {
      return body.preview.amountAtomic === input.amountAtomic
        && (body.preview.requestAmountKind === undefined
          || body.preview.requestAmountKind === 'input')
        && (body.preview.requestedShareQuantity === undefined
          || body.preview.requestedShareQuantity === null)
        && (body.preview.minimumShareQuantity === undefined
          || body.preview.minimumShareQuantity === null)
        && (body.preview.expectedShareQuantity === undefined
          || body.preview.expectedShareQuantity === null)
        && (body.preview.maximumInputAmountAtomic === undefined
          || body.preview.maximumInputAmountAtomic === null)
        && (body.preview.requestedMaximumSpendAtomic === undefined
          || body.preview.requestedMaximumSpendAtomic === null)
        && (body.preview.shareQuantityUnit === undefined
          || body.preview.shareQuantityUnit === null)
        && (body.preview.shareQuantitySemantics === undefined
          || body.preview.shareQuantitySemantics === null)
        && body.preview.overfillPossible === undefined
        && (body.preview.shareQuantityConversion === undefined
          || body.preview.shareQuantityConversion === null);
    }
    const conversion = body.preview.shareQuantityConversion;
    return body.preview.amountAtomic === body.business.amountAtomic
      && body.preview.requestAmountKind === 'share-quantity'
      && body.preview.requestedShareQuantity === input.shareQuantity
      && body.preview.maximumInputAmountAtomic === body.business.amountAtomic
      && body.preview.requestedMaximumSpendAtomic
        === (input.maximumSpendAtomic ?? null)
      && body.preview.shareQuantityUnit === 'underlying-share-equivalent'
      && body.preview.shareQuantitySemantics === 'minimum-receive'
      && body.preview.overfillPossible === true
      && body.preview.minimumShareQuantity !== null
      && body.preview.minimumShareQuantity !== undefined
      && decimalQuantityAtLeast(
        body.preview.minimumShareQuantity,
        input.shareQuantity,
      )
      && body.preview.expectedShareQuantity !== null
      && body.preview.expectedShareQuantity !== undefined
      && decimalQuantityAtLeast(
        body.preview.expectedShareQuantity,
        body.preview.minimumShareQuantity,
      )
      && body.preview.minimumOutputAtomic !== null
      && body.preview.expectedOutputAtomic !== null
      && BigInt(body.preview.expectedOutputAtomic)
        >= BigInt(body.preview.minimumOutputAtomic)
      && conversion !== null
      && conversion !== undefined
      && conversion.rawMinimumOutputAtomic
        === body.preview.minimumOutputAtomic
      && scaledAtomicRepresentsAtLeast({
        rawAmountAtomic: conversion.rawMinimumOutputAtomic,
        rawDecimals: conversion.rawOutputDecimals,
        displayMultiplier: conversion.displayMultiplier,
        shareQuantity: body.preview.minimumShareQuantity,
      })
      && scaledAtomicRepresentsAtLeast({
        rawAmountAtomic: body.preview.expectedOutputAtomic,
        rawDecimals: conversion.rawOutputDecimals,
        displayMultiplier: conversion.displayMultiplier,
        shareQuantity: body.preview.expectedShareQuantity,
      })
      && (
        input.maximumSpendAtomic === undefined
        || BigInt(body.business.amountAtomic)
          <= BigInt(input.maximumSpendAtomic)
      );
  }
  if (operation === 'execute') {
    return body.requestId === input.operationId
      && body.intentId === input.intentId;
  }
  if (operation === 'status' || operation === 'reconcile') {
    return body.intentId === input.intentId
      && (
        operation === 'reconcile'
        || exactGovernedAgentStatusCrossFields(body)
      );
  }
  if (operation === 'history') {
    return body.items.length <= (input.limit ?? 25)
      && body.items.every(exactGovernedAgentStatusCrossFields);
  }
  return false;
}

export function normalizeGovernedAssetResult({
  operation,
  input,
  httpStatus,
  body,
}) {
  const schema = GOVERNED_BACKEND_RESPONSE_SCHEMAS[operation];
  if (!schema) throw new TypeError('invalid_governed_operation');
  const parsed = schema.safeParse(body);
  if (
    !parsed.success
    || !backendResponseMatchesInput(operation, input, parsed.data)
    || (
      operation === 'execute'
      && parsed.data.namespace !== 'dexter-governed-agent-http-refusal/v1'
      && !exactExecuteResponse(httpStatus, parsed.data)
    )
    || (
      operation === 'reconcile'
      && !exactReconcileResponse(httpStatus, parsed.data)
    )
  ) {
    return buildGovernedAssetFailure({
      operation,
      input,
      code: 'governed_backend_response_invalid',
    });
  }
  return {
    body: parsed.data,
    httpStatus,
    isError: backendResultIsError(operation, httpStatus, parsed.data),
  };
}

export function isGovernedLandedProgramError(body) {
  const parsed = executeResponse.safeParse(body);
  if (!parsed.success) return false;
  const value = parsed.data;
  return value.namespace === 'dexter-governed-agent-execute/v1'
    && value.status === 'confirmed'
    && value.attemptId !== null
    && value.transactionSignature !== null
    && value.executed === false
    && value.code === 'landed_program_error'
    && value.explanation !== null
    && value.evidenceDigest !== null
    && value.business.lifecycle === 'confirmed'
    && value.business.settlement === 'landed'
    && ['confirmed', 'finalized'].includes(value.business.finality)
    && value.business.executionSucceeded === false
    && value.business.programError === true;
}

export function buildGovernedAssetToolResult(result, meta = {}) {
  const body = result?.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('invalid_governed_tool_result');
  }
  const landedProgramError = result.isError === true
    && isGovernedLandedProgramError(body);
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(result.isError === true && !landedProgramError
      ? {}
      : { structuredContent: body }),
    isError: result.isError === true,
    _meta: { ...meta },
  };
}
