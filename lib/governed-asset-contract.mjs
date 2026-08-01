import { z } from 'zod';
import { VAULT_OAUTH_SECURITY_SCHEMES } from './open-tool-auth.mjs';

export const GOVERNED_ASSET_CONTRACT_VERSION =
  'opendexter.governed-asset.v1';

export const GOVERNED_ASSET_ACTIONS = Object.freeze([
  'send',
  'buy',
  'sell',
]);

export const GOVERNED_ASSET_OPERATIONS = Object.freeze([
  'prepare',
  'execute',
  'status',
  'reconcile',
  'history',
]);

// Kept as an alias for callers that referred to the earlier dormant draft.
export const GOVERNED_ASSET_PHASES = GOVERNED_ASSET_OPERATIONS;

export const GOVERNED_ASSET_TOOL_NAMES = Object.freeze({
  prepare: 'dexter_prepare_asset_action',
  execute: 'dexter_execute_asset_action',
  status: 'dexter_asset_action_status',
  reconcile: 'dexter_reconcile_asset_action',
  history: 'dexter_wallet_history',
  // Owner approval is deliberately not model-callable. It remains on the
  // separately authenticated owner ceremony surface in dexter-api.
  authorize: 'dexter_authorize_asset_action',
});

export const REGISTERED_GOVERNED_ASSET_TOOL_NAMES = Object.freeze([
  GOVERNED_ASSET_TOOL_NAMES.prepare,
  GOVERNED_ASSET_TOOL_NAMES.execute,
  GOVERNED_ASSET_TOOL_NAMES.status,
  GOVERNED_ASSET_TOOL_NAMES.reconcile,
  GOVERNED_ASSET_TOOL_NAMES.history,
]);

export const DEFERRED_GOVERNED_ASSET_TOOL_NAMES = Object.freeze([
  GOVERNED_ASSET_TOOL_NAMES.authorize,
]);

export const GOVERNED_OPERATION_SEMANTICS = Object.freeze({
  operationIdRole: 'idempotency_key_only',
  prepareReplay: 'same_operation_and_exact_request_only',
  executeReplay: 'same_operation_and_intent_only',
  authoritySource: 'server_bound_reusable_agent_mandate',
  coveredExecution: 'autonomous_within_exact_mandate_scope',
  outsideScope: 'enrollment_extension_or_owner_escalation_required',
  assetAuthority: 'server_registry_exact_identity_only',
  ownerApproval: 'out_of_band_mandate_ceremony_only',
  backendAcceptanceRequired: true,
  automaticRetry: false,
  ambiguousExecution: 'status_then_reconcile_same_intent_only',
});

const U64_MAX = 18_446_744_073_709_551_615n;
const OPERATION_ID = z.string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .describe(
    'Stable idempotency identity for this exact request. Reuse it only for an exact replay of the same operation and arguments.',
  );
const INTENT_ID = z.string().uuid().describe(
  'Exact governed intentId returned by dexter_prepare_asset_action.',
);
const U64 = z.string()
  .regex(/^[1-9][0-9]*$/)
  .refine((value) => BigInt(value) <= U64_MAX, 'amount exceeds u64');
export const GOVERNED_ASSET_ID_SCHEMA = z.string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/)
  .describe(
    'Canonical assetId returned by dexter_portfolio for a server-approved asset. This is not a symbol or mint; Dexter resolves it to one exact network, mint, token program, decimals, and capability record.',
  );
export const GOVERNED_HISTORY_CURSOR_MAX_LENGTH = 1_024;
const TRADE_MEMO = z.string().max(566).nullable().optional().describe(
  'Optional trade memo. Send does not support a memo and exposes no memo field.',
);
const BPS = z.number().int().min(0).max(10_000).optional();
const SOLANA_ADDRESS = z.string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/)
  .describe('Canonical Solana base58 destination owner address.');

const prepareSendInput = z.object({
  operationId: OPERATION_ID,
  action: z.literal('send'),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: U64.describe(
    'Exact selected-asset amount in atomic units. Use the server-certified decimals returned for this asset; never infer decimals from its symbol.',
  ),
  destinationOwner: SOLANA_ADDRESS,
}).strict();

const prepareBuyInput = z.object({
  operationId: OPERATION_ID,
  action: z.literal('buy'),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: U64.describe(
    'Exact USDC budget to spend, in atomic units. The canonical settlement asset uses 6 decimals, so 1000000 means 1 USDC; assetId identifies the asset being bought.',
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS,
}).strict();

const prepareSellInput = z.object({
  operationId: OPERATION_ID,
  action: z.literal('sell'),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: U64.describe(
    'Exact selected-asset amount to sell, in atomic units. Use the server-certified decimals returned for this asset; never infer decimals from its symbol.',
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS,
}).strict();

export const GOVERNED_PREPARE_INPUT_SCHEMA = z.discriminatedUnion('action', [
  prepareSendInput,
  prepareBuyInput,
  prepareSellInput,
]);

export const GOVERNED_EXECUTE_INPUT_SCHEMA = z.object({
  operationId: OPERATION_ID,
  intentId: INTENT_ID,
}).strict();

export const GOVERNED_STATUS_INPUT_SCHEMA = z.object({
  intentId: INTENT_ID,
}).strict();

export const GOVERNED_RECONCILE_INPUT_SCHEMA = z.object({
  intentId: INTENT_ID,
}).strict();

export const GOVERNED_HISTORY_INPUT_SCHEMA = z.object({
  limit: z.number().int().min(1).max(100).optional().describe(
    'Maximum number of governed transactions to return. The server default is 25.',
  ),
  cursor: z.string().min(1).max(GOVERNED_HISTORY_CURSOR_MAX_LENGTH)
    .optional().describe(
    'Opaque nextCursor from a prior dexter_wallet_history response.',
  ),
}).strict();

export const GOVERNED_ASSET_INPUT_SCHEMAS = Object.freeze({
  prepare: GOVERNED_PREPARE_INPUT_SCHEMA,
  execute: GOVERNED_EXECUTE_INPUT_SCHEMA,
  status: GOVERNED_STATUS_INPUT_SCHEMA,
  reconcile: GOVERNED_RECONCILE_INPUT_SCHEMA,
  history: GOVERNED_HISTORY_INPUT_SCHEMA,
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
  'grantrevision',
  'linktoken',
  'linktokenid',
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

function descriptor({ operation, title, description, annotations }) {
  const securitySchemes = cloneVaultSchemes();
  return Object.freeze({
    operation,
    title,
    description,
    inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation],
    annotations: Object.freeze(annotations),
    securitySchemes: Object.freeze(securitySchemes),
    _meta: Object.freeze({
      securitySchemes: Object.freeze(cloneVaultSchemes()),
      ui: Object.freeze({ visibility: Object.freeze(['model']) }),
    }),
    requiresPerRequestVaultBearer: true,
    registered: true,
  });
}

export const GOVERNED_ASSET_TOOL_CONTRACTS = Object.freeze({
  [GOVERNED_ASSET_TOOL_NAMES.prepare]: descriptor({
    operation: 'prepare',
    title: 'Prepare a Governed Send, Buy, or Sell',
    description:
      'Persist and evaluate one exact Send, Buy, or Sell without signing or submitting it. Pass only a canonical assetId returned by dexter_portfolio; Dexter resolves and binds its exact network, mint, token program, decimals, and supported actions. Buy amountAtomic is the USDC budget to spend; Sell and Send amountAtomic are selected-asset input. operationId is only the Idempotency-Key. The server resolves the wallet and reusable bounded mandate; enrollment, extension, or owner escalation happens outside model-callable tools only when the request is not already covered.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.execute]: descriptor({
    operation: 'execute',
    title: 'Execute a Prepared Governed Asset Action',
    description:
      'Ask the protected mandate executor to execute one exact intentId. A request covered by the bound reusable mandate may execute autonomously; an uncovered request fails closed for enrollment, extension, or owner escalation. operationId is only the Idempotency-Key and grants no authority. The tool accepts no plan, attempt, authorization, wallet, agent, grant, mint, or token-program fields. Never retry automatically after a timeout or uncertain result; inspect status and reconcile the same intent.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.status]: descriptor({
    operation: 'status',
    title: 'Check a Governed Asset Action',
    description:
      'Read the durable status, authority, receipts, submission, landing, finality, and retry-safety evidence for one exact intentId. This never dispatches or retries a transaction.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.reconcile]: descriptor({
    operation: 'reconcile',
    title: 'Reconcile a Governed Asset Action',
    description:
      'Request status-gated reconciliation for one exact intentId. It never creates a replacement intent, expands mandate scope, or automatically retries execution.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
  [GOVERNED_ASSET_TOOL_NAMES.history]: descriptor({
    operation: 'history',
    title: 'Read Governed Wallet History',
    description:
      'Read canonical governed Send, Buy, and Sell history for the wallet and reusable bounded mandate resolved from the current authenticated MCP session. Pagination uses only the server-issued opaque cursor.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
});
