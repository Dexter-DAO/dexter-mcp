import { z } from 'zod';
import {
  GOVERNED_ASSET_ID_SCHEMA,
  GOVERNED_ASSET_OPERATIONS,
  GOVERNED_HISTORY_CURSOR_MAX_LENGTH,
  GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA,
  GOVERNED_U64_DECIMAL_SCHEMA,
} from './governed-asset-contract.mjs';

const UUID = z.string().uuid();
const BOUNDED_ID = z.string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const U64 = GOVERNED_U64_DECIMAL_SCHEMA;
const POSITIVE_U64 = GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA;
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
    revision: z.number().int().nonnegative(),
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
  inputMint: MINT,
  outputMint: MINT,
  destinationOwner: ADDRESS.nullable(),
  expectedOutputAtomic: U64.nullable(),
  minimumOutputAtomic: U64.nullable(),
  slippageBps: z.number().int().min(0).max(10_000).nullable(),
  priceImpactBps: z.number().int().min(0).max(10_000).nullable(),
  quoteExpiresAtUnixMs: z.number().int().nonnegative().nullable(),
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
  grantRevision: z.number().int().nonnegative().nullable(),
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
  stateVersion: z.number().int().nonnegative().nullable(),
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
  status: z.enum([
    'already-final',
    'reconciliation-not-required',
    'reconciliation-adapter-required',
    'finality-adapter-required',
  ]),
  intentId: UUID,
  attemptId: UUID.nullable(),
  executed: z.boolean(),
  mutated: z.literal(false),
  code: z.enum([
    'reconciliation_not_required',
    'agent_reconciliation_adapter_required',
    'agent_finality_adapter_required',
  ]).nullable(),
  explanation: z.string().min(1).max(1_024),
  attribution,
  business,
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
  if (operation === 'reconcile') return body.status !== 'already-final';
  return false;
}

function backendResponseMatchesInput(operation, input, body) {
  if (body.namespace === 'dexter-governed-agent-http-refusal/v1') return true;
  if (operation === 'prepare') {
    const expectedDestination = input.action === 'send'
      ? input.destinationOwner
      : null;
    if (
      body.requestId !== input.operationId
      || body.business.action !== input.action
      || body.business.assetId !== input.assetId
      || body.business.amountAtomic !== input.amountAtomic
      || body.business.destinationOwner !== expectedDestination
    ) {
      return false;
    }
    return body.status !== 'prepared' || (
      body.preview.action === input.action
      && body.preview.assetId === input.assetId
      && body.preview.amountAtomic === input.amountAtomic
      && body.preview.destinationOwner === expectedDestination
      && (
        input.maxSlippageBps === undefined
        || body.preview.slippageBps === input.maxSlippageBps
      )
      && (
        input.maxPriceImpactBps === undefined
        || body.preview.priceImpactBps === input.maxPriceImpactBps
      )
    );
  }
  if (operation === 'execute') {
    return body.requestId === input.operationId
      && body.intentId === input.intentId;
  }
  if (operation === 'status' || operation === 'reconcile') {
    return body.intentId === input.intentId;
  }
  if (operation === 'history') {
    return body.items.length <= (input.limit ?? 25);
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
  if (!parsed.success || !backendResponseMatchesInput(operation, input, parsed.data)) {
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

export function buildGovernedAssetToolResult(result, meta = {}) {
  const body = result?.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('invalid_governed_tool_result');
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    ...(result.isError === true ? {} : { structuredContent: body }),
    isError: result.isError === true,
    _meta: { ...meta },
  };
}
