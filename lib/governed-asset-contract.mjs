import { z } from 'zod';
import { VAULT_OAUTH_SECURITY_SCHEMES } from './open-tool-auth.mjs';

export const GOVERNED_ASSET_CONTRACT_VERSION =
  'opendexter.governed-asset.v1';

export const GOVERNED_ASSET_ACTIONS = Object.freeze([
  'send',
  'buy',
  'sell',
]);

export const GOVERNED_ASSET_PHASES = Object.freeze([
  'prepare',
  'authorize',
  'execute',
]);

export const GOVERNED_ASSET_RESULT_STATUSES = Object.freeze([
  'prepared',
  'refused',
  'uncertain',
  'approval_required',
  'signed',
  'submitted',
  'confirmed',
  'unknown',
]);

export const GOVERNED_ASSET_TOOL_NAMES = Object.freeze({
  prepare: 'dexter_prepare_asset_action',
  authorize: 'dexter_authorize_asset_action',
  execute: 'dexter_execute_asset_action',
});

// These adapters are deliberately dormant until the corresponding backend
// routes, authority integration, and protected Vault executor are accepted.
export const REGISTERED_GOVERNED_ASSET_TOOL_NAMES = Object.freeze([]);
export const DEFERRED_GOVERNED_ASSET_TOOL_NAMES = Object.freeze(
  Object.values(GOVERNED_ASSET_TOOL_NAMES),
);

export const GOVERNED_OPERATION_SEMANTICS = Object.freeze({
  operationIdRole: 'request_idempotency_identity_only',
  sameOperationId: 'replay_exact_phase_and_request_only',
  differentOperationId: 'distinct_requested_operation_not_authority',
  authoritySource: 'independently_proven_owner_or_delegated_grant',
  backendAcceptanceRequired: true,
  automaticRetry: false,
  ambiguousExecution: 'reconcile_only',
});

const UUID = z.string().uuid();
const U64 = z.string()
  .regex(/^[1-9][0-9]*$/)
  .refine(
    (value) => BigInt(value) <= 18_446_744_073_709_551_615n,
    'amount exceeds u64',
  );
const ASSET_ID = z.enum(['dexter', 'backpack-spcx']);
const MEMO = z.string().max(566).nullable().optional();
const BPS = z.number().int().min(0).max(10_000).optional();
const BOUNDED_ID = z.string().min(8).max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const SOLANA_ADDRESS = z.string().min(32).max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const prepareSendInput = z.object({
  operationId: UUID,
  action: z.literal('send'),
  assetId: ASSET_ID,
  amountAtomic: U64,
  destinationOwner: SOLANA_ADDRESS,
  memo: MEMO,
}).strict();

const prepareSwapInput = z.object({
  operationId: UUID,
  action: z.enum(['buy', 'sell']),
  assetId: ASSET_ID,
  amountAtomic: U64,
  memo: MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS,
}).strict();

export const GOVERNED_PREPARE_INPUT_SCHEMA = z.discriminatedUnion('action', [
  prepareSendInput,
  prepareSwapInput,
]);

export const GOVERNED_AUTHORIZE_INPUT_SCHEMA = z.object({
  operationId: UUID,
  action: z.enum(GOVERNED_ASSET_ACTIONS),
  intentId: UUID,
  planId: BOUNDED_ID,
  preparedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const GOVERNED_EXECUTE_INPUT_SCHEMA = z.object({
  operationId: UUID,
  action: z.enum(GOVERNED_ASSET_ACTIONS),
  intentId: UUID,
  planId: BOUNDED_ID,
  preparedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
  authorizationId: UUID,
}).strict();

export const GOVERNED_ASSET_INPUT_SCHEMAS = Object.freeze({
  prepare: GOVERNED_PREPARE_INPUT_SCHEMA,
  authorize: GOVERNED_AUTHORIZE_INPUT_SCHEMA,
  execute: GOVERNED_EXECUTE_INPUT_SCHEMA,
});

const FORBIDDEN_AUTHORITY_ARGUMENTS = new Set([
  'session',
  'sessionid',
  'mcpsessionid',
  'handle',
  'userhandle',
  'wallet',
  'walletaddress',
  'vault',
  'vaultpda',
  'actor',
  'actorid',
  'agent',
  'agentid',
  'grant',
  'grantid',
  'role',
  'authority',
  'authoritydigest',
  'authoritydecisiondigest',
  'decisiondigest',
]);

function normalizedFieldName(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function assertNoGovernedAuthorityOverrides(value, path = 'arguments') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoGovernedAuthorityOverrides(item, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_ARGUMENTS.has(normalizedFieldName(key))) {
      throw new Error(`governed_authority_override_forbidden:${path}.${key}`);
    }
    assertNoGovernedAuthorityOverrides(nested, `${path}.${key}`);
  }
  return value;
}

function cloneVaultSchemes() {
  return VAULT_OAUTH_SECURITY_SCHEMES.map((scheme) => ({
    type: scheme.type,
    scopes: [...scheme.scopes],
  }));
}

function descriptor({ phase, title, description, annotations }) {
  const securitySchemes = cloneVaultSchemes();
  return Object.freeze({
    phase,
    title,
    description,
    inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[phase],
    annotations: Object.freeze(annotations),
    securitySchemes: Object.freeze(securitySchemes),
    _meta: Object.freeze({
      securitySchemes: Object.freeze(cloneVaultSchemes()),
      ui: Object.freeze({ visibility: Object.freeze(['model']) }),
    }),
    requiresPerRequestVaultBearer: true,
    registered: false,
  });
}

export const GOVERNED_ASSET_TOOL_CONTRACTS = Object.freeze({
  [GOVERNED_ASSET_TOOL_NAMES.prepare]: descriptor({
    phase: 'prepare',
    title: 'Prepare a Governed Asset Action',
    description:
      'Prepare, persist, and simulate an exact send, buy, or sell request without signing or dispatching it. operationId is only a request and idempotency identity: the same UUID may replay only the exact same phase and request. A different UUID identifies a distinct requested operation but authorizes nothing; independently proven owner or delegated-grant authority and backend acceptance are still required.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.authorize]: descriptor({
    phase: 'authorize',
    title: 'Authorize a Governed Asset Action',
    description:
      'Bind owner or delegated-agent authority to one exact prepared plan. This contract is dormant until the secure approval and revocable grant boundary is accepted.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.execute]: descriptor({
    phase: 'execute',
    title: 'Execute a Governed Asset Action',
    description:
      'Execute one already-authorized prepared plan through the protected Vault executor. Ambiguous outcomes are reconciliation-only and are never retried automatically.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  }),
});
