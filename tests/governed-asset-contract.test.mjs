import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFERRED_GOVERNED_ASSET_TOOL_NAMES,
  GOVERNED_ASSET_ID_SCHEMA,
  GOVERNED_ASSET_INPUT_SCHEMAS,
  GOVERNED_ASSET_TOOL_CONTRACTS,
  GOVERNED_ASSET_TOOL_NAMES,
  GOVERNED_HISTORY_CURSOR_MAX_LENGTH,
  GOVERNED_OPERATION_SEMANTICS,
  REGISTERED_GOVERNED_ASSET_TOOL_NAMES,
  assertNoGovernedAuthorityOverrides,
} from '../lib/governed-asset-contract.mjs';
import {
  OPEN_ANONYMOUS_TOOL_NAMES,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';

const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const INTENT_ID = '119f981c-9215-4141-84f2-d89ffe9cbece';
const ADDRESS = 'Vote111111111111111111111111111111111111111';

const PUBLIC_TOOLS = [
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

test('exactly five governed tools are public and owner authorize stays inaccessible', () => {
  assert.deepEqual(REGISTERED_GOVERNED_ASSET_TOOL_NAMES, PUBLIC_TOOLS);
  assert.deepEqual(
    DEFERRED_GOVERNED_ASSET_TOOL_NAMES,
    ['dexter_authorize_asset_action'],
  );
  assert.deepEqual(Object.keys(GOVERNED_ASSET_TOOL_CONTRACTS), PUBLIC_TOOLS);
  for (const name of PUBLIC_TOOLS) {
    assert.equal(OPEN_TOOL_NAMES.includes(name), true, name);
    assert.equal(OPEN_ANONYMOUS_TOOL_NAMES.includes(name), true, name);
    assert.equal(GOVERNED_ASSET_TOOL_CONTRACTS[name].registered, true, name);
  }
  assert.equal(OPEN_TOOL_NAMES.includes(GOVERNED_ASSET_TOOL_NAMES.authorize), false);
  assert.equal(GOVERNED_ASSET_TOOL_CONTRACTS[GOVERNED_ASSET_TOOL_NAMES.authorize], undefined);
});

test('every public governed descriptor carries strict mirrored OAuth', () => {
  for (const contract of Object.values(GOVERNED_ASSET_TOOL_CONTRACTS)) {
    assert.deepEqual(contract.securitySchemes, [
      { type: 'oauth2', scopes: ['vault'] },
    ]);
    assert.deepEqual(contract._meta.securitySchemes, contract.securitySchemes);
    assert.notEqual(contract._meta.securitySchemes, contract.securitySchemes);
    assert.equal(contract.requiresPerRequestVaultBearer, true);
  }
});

test('prepare accepts any canonical registry assetId and keeps denomination explicit', () => {
  const send = GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'send',
    assetId: 'dexter',
    amountAtomic: '1000000',
    destinationOwner: ADDRESS,
  });
  const buy = GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'buy',
    assetId: 'approved-token-42',
    amountAtomic: '1000000',
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
  });
  const sell = GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'sell',
    assetId: 'dexter',
    amountAtomic: '1000000',
  });
  assert.equal(send.success, true);
  assert.equal(buy.success, true);
  assert.equal(sell.success, true);
  assert.equal(GOVERNED_ASSET_ID_SCHEMA.safeParse('syrup-usdc').success, true);
  assert.equal(GOVERNED_ASSET_ID_SCHEMA.safeParse('equities:acme.v2').success, true);
  for (const invalid of [
    'DEXTER',
    'display symbol',
    'EfPoo4wWgxKVToit7yX5VtXXBrhao4G8L7vrbKy6pump',
    `a${'b'.repeat(128)}`,
  ]) {
    assert.equal(GOVERNED_ASSET_ID_SCHEMA.safeParse(invalid).success, false, invalid);
  }
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    ...send.data,
    memo: null,
  }).success, false);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    operationId: OPERATION_ID,
    action: 'buy',
    assetId: 'approved-token-42',
    amountAtomic: '9'.repeat(4 * 1024 * 1024),
  }).success, false);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    ...buy.data,
    amountAtomic: '18446744073709551615',
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.prepare.safeParse({
    ...buy.data,
    amountAtomic: '18446744073709551616',
  }).success, false);

  const options = GOVERNED_ASSET_INPUT_SCHEMAS.prepare._def.options;
  const buySchema = options.find((schema) =>
    schema.shape.action.safeParse('buy').success);
  const sellSchema = options.find((schema) =>
    schema.shape.action.safeParse('sell').success);
  assert.match(buySchema.shape.amountAtomic.description, /USDC budget/i);
  assert.match(buySchema.shape.amountAtomic.description, /6 decimals/i);
  assert.match(sellSchema.shape.amountAtomic.description, /selected-asset amount/i);
  assert.match(sellSchema.shape.amountAtomic.description, /server-certified decimals/i);
});

test('execute accepts only operationId and intentId', () => {
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.execute.safeParse({
    operationId: OPERATION_ID,
    intentId: INTENT_ID,
  }).success, true);
  for (const field of [
    'action',
    'attemptId',
    'planId',
    'preparedPlanHash',
    'authorizationId',
  ]) {
    assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.execute.safeParse({
      operationId: OPERATION_ID,
      intentId: INTENT_ID,
      [field]: field === 'action' ? 'buy' : 'caller-selected',
    }).success, false, field);
  }
});

test('status, reconcile, and history expose only exact intent or pagination identities', () => {
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.status.safeParse({
    intentId: INTENT_ID,
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.reconcile.safeParse({
    intentId: INTENT_ID,
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.history.safeParse({
    limit: 100,
    cursor: 'opaque-cursor',
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.history.safeParse({
    limit: 101,
  }).success, false);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.history.safeParse({
    cursor: 'a'.repeat(GOVERNED_HISTORY_CURSOR_MAX_LENGTH),
  }).success, true);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.history.safeParse({
    cursor: 'a'.repeat(GOVERNED_HISTORY_CURSOR_MAX_LENGTH + 1),
  }).success, false);
  assert.equal(GOVERNED_ASSET_INPUT_SCHEMAS.status.safeParse({
    intentId: INTENT_ID,
    operationId: OPERATION_ID,
  }).success, false);
});

test('authority override guard rejects nested identity aliases before transport', () => {
  for (const field of [
    'sessionId',
    'handle',
    'wallet',
    'vaultPda',
    'actor',
    'agent_id',
    'grant',
    'linkTokenId',
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

test('operation identity never substitutes for authority or owner approval', () => {
  assert.deepEqual(GOVERNED_OPERATION_SEMANTICS, {
    operationIdRole: 'idempotency_key_only',
    prepareReplay: 'same_operation_and_exact_request_only',
    executeReplay: 'same_operation_and_intent_only',
    authoritySource: 'server_bound_reusable_agent_mandate',
    coveredExecution: 'autonomous_within_exact_mandate_scope',
    outsideScope: 'enrollment_extension_or_owner_escalation_required',
    assetAuthority: 'server_registry_exact_identity_only',
    ownerApproval: 'out_of_band_mandate_ceremony_only',
    runtimeAvailability: 'prepare_response_is_authoritative',
    unavailableAction: 'stop_without_execute_or_reconcile',
    backendAcceptanceRequired: true,
    automaticRetry: false,
    ambiguousExecution: 'status_then_reconcile_same_intent_only',
  });
  const prepare = GOVERNED_ASSET_TOOL_CONTRACTS.dexter_prepare_asset_action.description;
  const execute = GOVERNED_ASSET_TOOL_CONTRACTS.dexter_execute_asset_action.description;
  const reconcile = GOVERNED_ASSET_TOOL_CONTRACTS.dexter_reconcile_asset_action.description;
  assert.match(prepare, /Idempotency-Key/);
  assert.match(prepare, /canonical assetId returned by dexter_portfolio/);
  assert.match(prepare, /approved holding or approvedActionTarget/);
  assert.match(prepare, /reusable bounded mandate/);
  assert.match(prepare, /outside model-callable tools/);
  assert.match(prepare, /only this Prepare response is authoritative/);
  assert.match(prepare, /protected_agent_send_sdk_required/);
  assert.match(prepare, /before capacity reservation or intent creation/);
  assert.match(execute, /grants no authority/);
  assert.match(execute, /covered by the bound reusable mandate may execute autonomously/);
  assert.match(execute, /Never call Execute after protected_agent_send_sdk_required/);
  assert.match(execute, /Never retry automatically/);
  assert.match(reconcile, /contact the facilitator or validator/);
  assert.match(reconcile, /dispatch the already-signed transaction/);
  assert.match(reconcile, /same attempt/);
  assert.match(reconcile, /Never retry reconciliation automatically/);
});
