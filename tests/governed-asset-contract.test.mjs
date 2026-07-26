import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFERRED_GOVERNED_ASSET_TOOL_NAMES,
  GOVERNED_ASSET_INPUT_SCHEMAS,
  GOVERNED_ASSET_TOOL_CONTRACTS,
  GOVERNED_ASSET_TOOL_NAMES,
  GOVERNED_OPERATION_SEMANTICS,
  REGISTERED_GOVERNED_ASSET_TOOL_NAMES,
  assertNoGovernedAuthorityOverrides,
} from '../lib/governed-asset-contract.mjs';
import {
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  VAULT_WWW_AUTHENTICATE,
  buildVaultAuthenticationRequired,
  vaultAuthenticationResult,
} from '../lib/open-tool-auth.mjs';

const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const INTENT_ID = '119f981c-9215-4141-84f2-d89ffe9cbece';
const AUTHORIZATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';

test('governed mutation contracts stay implemented but unregistered', () => {
  assert.deepEqual(REGISTERED_GOVERNED_ASSET_TOOL_NAMES, []);
  assert.deepEqual(
    DEFERRED_GOVERNED_ASSET_TOOL_NAMES,
    [
      'dexter_prepare_asset_action',
      'dexter_authorize_asset_action',
      'dexter_execute_asset_action',
    ],
  );
  for (const name of DEFERRED_GOVERNED_ASSET_TOOL_NAMES) {
    assert.equal(OPEN_TOOL_NAMES.includes(name), false);
    assert.equal(GOVERNED_ASSET_TOOL_CONTRACTS[name].registered, false);
  }
  assert.equal(OPEN_TOOL_NAMES.includes('dexter_portfolio'), true);
});

test('every governed descriptor carries strict canonical and mirrored OAuth', () => {
  for (const contract of Object.values(GOVERNED_ASSET_TOOL_CONTRACTS)) {
    assert.deepEqual(contract.securitySchemes, [
      { type: 'oauth2', scopes: ['vault'] },
    ]);
    assert.deepEqual(contract._meta.securitySchemes, contract.securitySchemes);
    assert.notEqual(contract._meta.securitySchemes, contract.securitySchemes);
    assert.equal(contract.requiresPerRequestVaultBearer, true);
  }
});

test('truthful runtime challenge is available for every deferred governed tool', () => {
  for (const tool of DEFERRED_GOVERNED_ASSET_TOOL_NAMES) {
    const data = buildVaultAuthenticationRequired({ tool });
    const result = vaultAuthenticationResult(data);
    assert.equal(result.isError, true);
    assert.deepEqual(
      result._meta['mcp/www_authenticate'],
      [VAULT_WWW_AUTHENTICATE],
    );
  }
});

test('prepare inputs require a UUID operation and exact action-specific terms', () => {
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'send',
    assetId: 'dexter',
    amountAtomic: '1000',
    destinationOwner: 'Vote111111111111111111111111111111111111111',
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'buy',
    assetId: 'backpack-spcx',
    amountAtomic: '1000',
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: 'same-order-today',
    action: 'buy',
    assetId: 'dexter',
    amountAtomic: '1000',
  }).success, false);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'send',
    assetId: 'dexter',
    amountAtomic: '1000',
    destinationOwner: 'Vote111111111111111111111111111111111111111',
    walletAddress: 'attacker-selected-wallet',
  }).success, false);
});

test('authorize and execute accept only exact plan references, never identity', () => {
  const authorize = {
    operationId: OPERATION_ID,
    action: 'sell',
    intentId: INTENT_ID,
    planId: 'plan_0123456789abcdef',
    preparedPlanHash: 'a'.repeat(64),
  };
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.authorize.safeParse(authorize).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.execute.safeParse({
    ...authorize,
    authorizationId: AUTHORIZATION_ID,
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.authorize.safeParse({
    ...authorize,
    agentId: 'attacker',
  }).success, false);
});

test('authority override guard rejects nested aliases before transport', () => {
  for (const field of [
    'sessionId',
    'handle',
    'wallet',
    'vaultPda',
    'actor',
    'agent_id',
    'grant',
    'role',
    'authorityDigest',
  ]) {
    assert.throws(
      () => assertNoGovernedAuthorityOverrides({
        operationId: OPERATION_ID,
        nested: { [field]: 'attacker-value' },
      }),
      /governed_authority_override_forbidden/,
      field,
    );
  }
});

test('operation identity is idempotency only and never substitutes for authority', () => {
  assert.deepEqual(GOVERNED_OPERATION_SEMANTICS, {
    operationIdRole: 'request_idempotency_identity_only',
    sameOperationId: 'replay_exact_phase_and_request_only',
    differentOperationId: 'distinct_requested_operation_not_authority',
    authoritySource: 'independently_proven_owner_or_delegated_grant',
    backendAcceptanceRequired: true,
    automaticRetry: false,
    ambiguousExecution: 'reconcile_only',
  });
  const description =
    GOVERNED_ASSET_TOOL_CONTRACTS.dexter_prepare_asset_action.description;
  assert.match(description, /request and idempotency identity/);
  assert.match(description, /exact same phase and request/);
  assert.match(description, /authorizes nothing/);
  assert.match(
    description,
    /independently proven owner or delegated-grant authority and backend acceptance/,
  );
  assert.doesNotMatch(description, /owner-authorized|new order/i);
});
