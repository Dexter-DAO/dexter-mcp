import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOVERNED_BACKEND_AUTH_PURPOSE,
  MAX_GOVERNED_BACKEND_RESPONSE_BYTES,
  MAX_GOVERNED_HISTORY_RESPONSE_BYTES,
  buildGovernedBackendRequestAuth,
  buildGovernedRuntimeBindingPayload,
  callGovernedAssetBackend,
  canonicalHash,
  governedBackendRequest,
  normalizeGovernedBackendOrigin,
  verifyGovernedBackendRequestAuth,
} from '../lib/governed-asset-client.mjs';
import {
  GOVERNED_AGENT_API_PROFILE,
  createGovernedBackendProfile,
} from '../lib/governed-asset-backend-profile.mjs';
import {
  GOVERNED_HISTORY_CURSOR_MAX_LENGTH,
} from '../lib/governed-asset-contract.mjs';
import {
  GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS,
  buildGovernedAssetToolResult,
} from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';

const SECRET = ' test-only-governed-secret-at-least-thirty-two-bytes ';
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const SESSION_ID = 'mcp-session-delegated-product-0001';
const INTENT_ID = '419f981c-9215-4141-84f2-d89ffe9cbece';
const ATTEMPT_ID = '519f981c-9215-4141-84f2-d89ffe9cbece';
const AGENT_ID = '619f981c-9215-4141-84f2-d89ffe9cbece';
const LINK_TOKEN_ID = '719f981c-9215-4141-84f2-d89ffe9cbece';
const GRANT_ID = '819f981c-9215-4141-84f2-d89ffe9cbece';
const RULE_ID = '919f981c-9215-4141-84f2-d89ffe9cbece';
const NOW = 1_785_020_400_000;
const ADDRESS = '11111111111111111111111111111111';
const PREPARE_PATH =
  '/api/passkey-vault/governed-assets/agent/actions/prepare';

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  };
}

function streamingJsonResponse(status, body, chunkBytes = 8 * 1024) {
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  let offset = 0;
  return {
    status,
    headers: { get: () => null },
    body: new ReadableStream({
      pull(controller) {
        if (offset >= encoded.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkBytes, encoded.byteLength);
        controller.enqueue(encoded.slice(offset, end));
        offset = end;
      },
    }),
  };
}

function attribution() {
  return {
    actor: 'agent',
    runtime: {
      source: 'mcp-link-token',
      agentId: AGENT_ID,
      linkTokenId: LINK_TOKEN_ID,
      surfaceBindingDigest: 'a'.repeat(64),
      sessionBindingDigest: 'b'.repeat(64),
    },
    wallet: {
      vaultPda: ADDRESS,
      swigAddress: ADDRESS,
      walletAddress: ADDRESS,
    },
    grant: {
      id: GRANT_ID,
      revision: 1,
      revisionDigest: 'c'.repeat(64),
      ruleId: RULE_ID,
      riskPolicyDigest: 'd'.repeat(64),
      validFrom: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-08-02T00:00:00.000Z',
    },
  };
}

function business(overrides = {}) {
  return {
    action: 'buy',
    assetId: 'dexter',
    amountAtomic: '1000000',
    destinationOwner: null,
    protocolId: 'jupiter-v2',
    lifecycle: 'prepared',
    settlement: 'not-submitted',
    finality: 'not-final',
    executionSucceeded: null,
    programError: false,
    refusalOrEscalationReasons: [],
    ambiguity: { status: 'none', retrySameRequestOnly: false },
    reconciliation: { required: false, availableToOwner: false },
    ...overrides,
  };
}

function preparedResponse() {
  return {
    namespace: 'dexter-governed-agent-action/v1',
    requestId: OPERATION_ID,
    executed: false,
    attribution: attribution(),
    business: business(),
    status: 'prepared',
    intentId: INTENT_ID,
    planId: 'e'.repeat(64),
    replayed: false,
    approval: { status: 'not-required', reasons: [] },
    effectiveExpiresAt: '2026-08-01T00:05:00.000Z',
    riskEvidenceDigest: 'f'.repeat(64),
    authoritySnapshotDigest: '0'.repeat(64),
    preview: {
      action: 'buy',
      assetId: 'dexter',
      symbol: 'DEXTER',
      amountAtomic: '1000000',
      inputMint: ADDRESS,
      outputMint: ADDRESS,
      destinationOwner: null,
      expectedOutputAtomic: '2500000',
      minimumOutputAtomic: '2400000',
      slippageBps: 50,
      priceImpactBps: 10,
      quoteExpiresAtUnixMs: NOW + 30_000,
    },
    account: {
      status: 'already-exists',
      tokenAccountAddress: ADDRESS,
    },
    execution: {
      status: 'not-executed',
      signed: false,
      submitted: false,
    },
  };
}

function statusResponse() {
  return {
    namespace: 'dexter-governed-transaction-status/v1',
    intentId: INTENT_ID,
    attemptId: ATTEMPT_ID,
    requestId: OPERATION_ID,
    action: 'buy',
    operationCeremony: {
      kind: 'trade',
      operationMessageBytes: 589,
      operationMessageDomain: 'OTS_GOVERNED_SWAP_V1',
      actionDiscriminator: 0,
      evidenceNamespace: 'dexter-protected-owner-trade-evidence/v2',
    },
    assetId: 'dexter',
    assetMint: ADDRESS,
    tokenProgram: 'spl-token',
    amountAtomic: '1000000',
    destinationOwner: null,
    protocolId: 'jupiter-v2',
    wallet: attribution().wallet,
    actor: 'agent',
    runtime: {
      principalSource: 'mcp-link-token',
      linkTokenId: LINK_TOKEN_ID,
      surfaceBindingDigest: 'a'.repeat(64),
    },
    agentId: AGENT_ID,
    grantId: GRANT_ID,
    grantRevision: 1,
    grantRevisionDigest: 'c'.repeat(64),
    grantRuleId: RULE_ID,
    policyDecision: 'allowed',
    escalationReasons: [],
    authorityExpiresAt: '2026-08-02T00:00:00.000Z',
    ownerDecision: {
      required: false,
      status: 'not-required',
      reason: null,
      decidedAt: null,
    },
    status: 'submitted',
    ledgerState: 'broadcast',
    stateVersion: 2,
    createdAt: '2026-08-01T00:00:00.000Z',
    lastActivityAt: '2026-08-01T00:01:00.000Z',
    transactionSignature: '1'.repeat(64),
    submitted: true,
    landingProof: false,
    definitiveNonlandingProof: false,
    executionSucceeded: null,
    confirmationSlot: null,
    confirmationCommitment: null,
    settlementFinalized: false,
    reconciliationRequired: true,
    canReconcile: false,
    reconciliationKind: null,
    reconciliationEvidenceDigest: null,
    refusalSource: null,
    refusalCode: null,
    receiptPhases: ['dispatch_fenced', 'accepted'],
    replay: {
      statusReadSafe: true,
      reconcileSameAttemptOnly: true,
      executeFromStatusForbidden: true,
    },
  };
}

function executeResponse() {
  return {
    namespace: 'dexter-governed-agent-execute/v1',
    status: 'confirmed',
    requestId: OPERATION_ID,
    intentId: INTENT_ID,
    attemptId: ATTEMPT_ID,
    transactionSignature: '1'.repeat(64),
    executed: true,
    code: null,
    explanation: null,
    attribution: attribution(),
    business: business({
      lifecycle: 'confirmed',
      settlement: 'landed',
      finality: 'finalized',
      executionSucceeded: true,
    }),
    evidenceDigest: 'e'.repeat(64),
  };
}

test('canonical service proof matches the frozen governed-agent payload', () => {
  const body = {
    action: 'buy',
    assetId: 'dexter',
    amountAtomic: '1000000',
  };
  const headers = buildGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'POST',
    originalUrl: PREPARE_PATH,
    body,
    mcpSessionId: SESSION_ID,
    idempotencyKey: OPERATION_ID,
    now: NOW,
  });
  assert.equal(GOVERNED_BACKEND_AUTH_PURPOSE, 'dexter-governed-agent-internal/v1');
  assert.deepEqual(Object.keys(headers).sort(), [
    'idempotency-key',
    'mcp-session-id',
    'x-internal-signature',
    'x-internal-timestamp',
  ]);
  assert.equal(headers['idempotency-key'], OPERATION_ID);
  assert.equal(headers['mcp-session-id'], SESSION_ID);
  assert.doesNotMatch(JSON.stringify(headers), /test-only-governed-secret/);
  assert.equal(verifyGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'POST',
    originalUrl: PREPARE_PATH,
    body,
    headers,
    now: NOW,
  }), true);

  const expectedPayload = [
    'dexter-governed-agent-internal/v1',
    String(NOW),
    SESSION_ID,
    'POST',
    PREPARE_PATH,
    OPERATION_ID,
    canonicalHash(body),
  ].join('\n');
  assert.equal(buildGovernedRuntimeBindingPayload({
    timestamp: String(NOW),
    mcpSessionId: SESSION_ID,
    method: 'post',
    originalUrl: PREPARE_PATH,
    idempotencyKey: OPERATION_ID,
    body,
  }), expectedPayload);
});

test('service proof binds exact method, URL including query, idempotency, session, and canonical body', () => {
  const originalUrl =
    '/api/passkey-vault/governed-assets/agent/transactions/history?limit=25&cursor=a%2Bb';
  const headers = buildGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'GET',
    originalUrl,
    body: null,
    mcpSessionId: SESSION_ID,
    now: NOW,
  });
  assert.equal(headers['idempotency-key'], undefined);

  for (const mutation of [
    { method: 'POST' },
    { originalUrl: originalUrl.replace('25', '26') },
    { body: {} },
    { headers: { ...headers, 'mcp-session-id': 'different-session' } },
    { headers: { ...headers, 'idempotency-key': OPERATION_ID } },
  ]) {
    assert.equal(verifyGovernedBackendRequestAuth({
      secret: SECRET,
      method: 'GET',
      originalUrl,
      body: null,
      headers,
      now: NOW,
      ...mutation,
    }), false);
  }
  assert.throws(() => buildGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'POST',
    originalUrl: '/api/passkey-vault/admin/unrelated',
    body: {},
    mcpSessionId: SESSION_ID,
    now: NOW,
  }), /invalid_governed_backend_original_url/);
});

test('backend route and auth profile is injected as one indivisible adapter', () => {
  const profile = createGovernedBackendProfile({
    id: 'test-mandate-api-v2',
    authPurpose: 'test-governed-mandate-internal/v2',
    routes: {
      prepare: '/api/test/mandates/actions/prepare',
      execute: '/api/test/mandates/transactions/{intentId}/execute',
      status: '/api/test/mandates/transactions/{intentId}/status',
      reconcile: '/api/test/mandates/transactions/{intentId}/reconcile',
      history: '/api/test/mandates/transactions/history',
    },
  });
  const request = governedBackendRequest('execute', {
    operationId: OPERATION_ID,
    intentId: INTENT_ID,
  }, { profile });
  assert.equal(
    request.originalUrl,
    `/api/test/mandates/transactions/${INTENT_ID}/execute`,
  );
  const headers = buildGovernedBackendRequestAuth({
    secret: SECRET,
    method: request.method,
    originalUrl: request.originalUrl,
    body: request.body,
    mcpSessionId: SESSION_ID,
    idempotencyKey: request.idempotencyKey,
    now: NOW,
    profile,
  });
  assert.equal(verifyGovernedBackendRequestAuth({
    secret: SECRET,
    method: request.method,
    originalUrl: request.originalUrl,
    body: request.body,
    headers,
    now: NOW,
    profile,
  }), true);
  assert.equal(verifyGovernedBackendRequestAuth({
    secret: SECRET,
    method: request.method,
    originalUrl: request.originalUrl,
    body: request.body,
    headers,
    now: NOW,
    profile: GOVERNED_AGENT_API_PROFILE,
  }), false);
});

test('canonical hashing sorts object keys and rejects non-integer identity values', () => {
  assert.equal(
    canonicalHash({ b: 2, a: { d: true, c: 'x' } }),
    canonicalHash({ a: { c: 'x', d: true }, b: 2 }),
  );
  assert.throws(() => canonicalHash({ amount: 1.5 }), /non_integer/);
  assert.throws(() => canonicalHash({ missing: undefined }), /undefined/);
});

test('five public operations map to the exact existing API routes and bodies', () => {
  const prepare = governedBackendRequest('prepare', {
    operationId: OPERATION_ID,
    action: 'buy',
    assetId: 'approved-token-42',
    amountAtomic: '1000000',
  });
  assert.equal(prepare.originalUrl, PREPARE_PATH);
  assert.equal(prepare.idempotencyKey, OPERATION_ID);
  assert.deepEqual(prepare.body, {
    action: 'buy',
    assetId: 'approved-token-42',
    amountAtomic: '1000000',
  });
  assert.equal('operationId' in prepare.body, false);

  const execute = governedBackendRequest('execute', {
    operationId: OPERATION_ID,
    intentId: INTENT_ID,
  });
  assert.equal(
    execute.originalUrl,
    `/api/passkey-vault/governed-assets/agent/transactions/${INTENT_ID}/execute`,
  );
  assert.equal(execute.bodyText, '{}');
  assert.deepEqual(execute.body, {});

  const status = governedBackendRequest('status', { intentId: INTENT_ID });
  assert.equal(status.method, 'GET');
  assert.equal(
    status.originalUrl,
    `/api/passkey-vault/governed-assets/agent/transactions/${INTENT_ID}/status`,
  );
  assert.equal(status.body, null);

  const reconcile = governedBackendRequest('reconcile', { intentId: INTENT_ID });
  assert.equal(
    reconcile.originalUrl,
    `/api/passkey-vault/governed-assets/agent/transactions/${INTENT_ID}/reconcile`,
  );
  assert.equal(reconcile.idempotencyKey, '');
  assert.equal(reconcile.bodyText, '{}');

  const history = governedBackendRequest('history', {
    limit: 25,
    cursor: 'a+b/c=',
  });
  assert.equal(history.method, 'GET');
  assert.equal(
    history.originalUrl,
    '/api/passkey-vault/governed-assets/agent/transactions/history?limit=25&cursor=a%2Bb%2Fc%3D',
  );
  assert.equal(history.body, null);
});

test('prepare client sends one exact request and preserves the canonical API body', async () => {
  const expected = preparedResponse();
  const calls = [];
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
      maxSlippageBps: 50,
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(url, `https://api.dexter.test${PREPARE_PATH}`);
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), {
        action: 'buy',
        assetId: 'dexter',
        amountAtomic: '1000000',
        maxSlippageBps: 50,
      });
      assert.equal(verifyGovernedBackendRequestAuth({
        secret: SECRET,
        method: options.method,
        originalUrl: PREPARE_PATH,
        body: JSON.parse(options.body),
        headers: options.headers,
        now: NOW,
      }), true);
      return jsonResponse(200, expected);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.isError, false);
  assert.deepEqual(result.body, expected);
  assert.equal('correlationId' in result.body, false);
  assert.deepEqual(buildGovernedAssetToolResult(result).structuredContent, expected);
});

test('generic approved asset identity passes without a named-token output enum', async () => {
  const expected = preparedResponse();
  expected.business.assetId = 'approved-token-42';
  expected.preview.assetId = 'approved-token-42';
  expected.preview.symbol = 'TOK42';
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'approved-token-42',
      amountAtomic: '1000000',
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, expected),
  });
  assert.equal(result.isError, false);
  assert.equal(result.body.business.assetId, 'approved-token-42');
  assert.equal(result.body.preview.symbol, 'TOK42');
});

test('governed result policy preserves valid opaque identities that resemble bearer tokens', () => {
  const opaqueIdentity = 'open_abcdefghijklmnop';
  const opaquePlan = `dlt_${'a'.repeat(20)}`;
  const prepare = preparedResponse();
  prepare.requestId = opaqueIdentity;
  prepare.planId = opaquePlan;
  prepare.business.assetId = opaqueIdentity;
  prepare.business.protocolId = opaqueIdentity;
  prepare.preview.assetId = opaqueIdentity;
  prepare.preview.symbol = opaqueIdentity;

  const execute = executeResponse();
  execute.requestId = opaqueIdentity;
  execute.business.assetId = opaqueIdentity;
  execute.business.protocolId = opaqueIdentity;

  const status = statusResponse();
  status.requestId = opaqueIdentity;
  status.assetId = opaqueIdentity;
  status.protocolId = opaqueIdentity;

  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [status],
    nextCursor: opaquePlan,
  };
  const cases = [
    ['prepare', 'dexter_prepare_asset_action', prepare],
    ['execute', 'dexter_execute_asset_action', execute],
    ['status', 'dexter_asset_action_status', status],
    ['history', 'dexter_wallet_history', history],
  ];

  for (const [operation, toolName, body] of cases) {
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS[operation].safeParse(body).success,
      true,
      `${operation} fixture`,
    );
    const result = applyOpenToolResultPolicy(toolName, {
      content: [{ type: 'text', text: JSON.stringify(body) }],
      structuredContent: body,
      isError: false,
    });
    assert.deepEqual(result.structuredContent, body, operation);
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS[operation]
        .safeParse(result.structuredContent).success,
      true,
      `${operation} projected output`,
    );
    assert.match(result.content[0].text, /open_abcdefghijklmnop/);
  }
  assert.equal(prepare.planId, opaquePlan);
  assert.equal(history.nextCursor, opaquePlan);
});

test('prepare preserves exact reusable-mandate coverage and escalation states', async () => {
  const covered = preparedResponse();
  const coveredResult = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, covered),
  });
  assert.equal(coveredResult.isError, false);
  assert.equal(coveredResult.body.approval.status, 'not-required');

  const escalation = preparedResponse();
  escalation.approval = {
    status: 'owner-approval-required',
    reasons: ['amount_limit_exceeded'],
  };
  const escalationResult = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, escalation),
  });
  assert.equal(escalationResult.isError, false);
  assert.equal(escalationResult.body.approval.status, 'owner-approval-required');

  for (const code of [
    'mandate_enrollment_required',
    'mandate_extension_required',
    'delegated_authority_unavailable',
  ]) {
    const refusal = {
      namespace: 'dexter-governed-agent-action/v1',
      requestId: OPERATION_ID,
      executed: false,
      attribution: null,
      business: business({ lifecycle: 'refused' }),
      status: 'refused',
      code,
      explanation: `Fail closed: ${code}`,
      retryable: false,
    };
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input: {
        operationId: OPERATION_ID,
        action: 'buy',
        assetId: 'dexter',
        amountAtomic: '1000000',
      },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(409, refusal),
    });
    assert.equal(result.isError, true, code);
    assert.equal(result.body.code, code);
    assert.equal(result.body.executed, false);
  }
});

test('status and history use GET without bodies or idempotency headers', async () => {
  const status = statusResponse();
  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [status],
    nextCursor: 'opaque-next-cursor',
  };
  for (const [operation, input, responseBody] of [
    ['status', { intentId: INTENT_ID }, status],
    ['history', { limit: 1 }, history],
  ]) {
    let calls = 0;
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation,
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async (_url, options) => {
        calls += 1;
        assert.equal(options.method, 'GET');
        assert.equal('body' in options, false);
        assert.equal(options.headers['idempotency-key'], undefined);
        return jsonResponse(200, responseBody);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.isError, false);
    assert.deepEqual(result.body, responseBody);
  }
});

test('a streamed 100-record history page fits the history-only body bound', async () => {
  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: Array.from({ length: 100 }, () => statusResponse()),
    nextCursor: null,
  };
  const encodedBytes = Buffer.byteLength(JSON.stringify(history), 'utf8');
  assert.ok(encodedBytes > MAX_GOVERNED_BACKEND_RESPONSE_BYTES);
  assert.ok(encodedBytes < MAX_GOVERNED_HISTORY_RESPONSE_BYTES);

  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'history',
    input: { limit: 100 },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => streamingJsonResponse(200, history),
  });
  assert.equal(result.isError, false);
  assert.equal(result.body.items.length, 100);

  const oversized = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'history',
    input: { limit: 100 },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, history, {
      'content-length': String(MAX_GOVERNED_HISTORY_RESPONSE_BYTES + 1),
    }),
  });
  assert.equal(oversized.isError, true);
  assert.equal(oversized.body.code, 'governed_backend_response_invalid');
});

test('history refuses a backend page larger than the exact requested limit', async () => {
  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [statusResponse(), statusResponse()],
    nextCursor: null,
  };
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'history',
    input: { limit: 1 },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, history),
  });
  assert.equal(result.isError, true);
  assert.equal(result.body.code, 'governed_backend_response_invalid');
});

test('history output cursor is exactly reusable by the next public input', () => {
  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [],
    nextCursor: 'a'.repeat(GOVERNED_HISTORY_CURSOR_MAX_LENGTH),
  };
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.history.safeParse(history).success,
    true,
  );
  assert.doesNotThrow(() => governedBackendRequest('history', {
    cursor: history.nextCursor,
  }));
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.history.safeParse({
      ...history,
      nextCursor: `${history.nextCursor}a`,
    }).success,
    false,
  );
});

test('reconcile preserves the canonical 409 body and marks it as an error result', async () => {
  const responseBody = {
    namespace: 'dexter-governed-agent-reconcile/v1',
    status: 'reconciliation-adapter-required',
    intentId: INTENT_ID,
    attemptId: ATTEMPT_ID,
    executed: false,
    mutated: false,
    code: 'agent_reconciliation_adapter_required',
    explanation: 'A reviewed adapter is required.',
    attribution: attribution(),
    business: business({
      lifecycle: 'ambiguous',
      settlement: 'unknown',
      finality: 'unknown',
      ambiguity: { status: 'unresolved', retrySameRequestOnly: false },
      reconciliation: { required: true, availableToOwner: false },
    }),
  };
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'reconcile',
    input: { intentId: INTENT_ID },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(409, responseBody),
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.body, responseBody);
});

test('an execute transport failure is one call and reconciliation-only', async () => {
  let calls = 0;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'execute',
    input: { operationId: OPERATION_ID, intentId: INTENT_ID },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('socket_closed_after_dispatch');
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.body, {
    namespace: 'opendexter-governed-backend-failure/v1',
    operation: 'execute',
    status: 'unknown',
    operationId: OPERATION_ID,
    intentId: INTENT_ID,
    code: 'governed_backend_transport_failed',
    explanation:
      'The execute request may have reached Dexter, but no result was received. Do not execute again; inspect and reconcile the same intent.',
    retry: 'reconcile_same_intent_only',
  });
  assert.equal(result.isError, true);
  const toolResult = buildGovernedAssetToolResult(result);
  assert.equal(toolResult.structuredContent, undefined);
  assert.equal(
    JSON.parse(toolResult.content[0].text).operationId,
    OPERATION_ID,
  );
});

test('invalid or oversized backend bodies fail closed without inventing evidence', async () => {
  for (const response of [
    jsonResponse(200, { status: 'confirmed', executed: true }),
    jsonResponse(200, preparedResponse(), {
      'content-length': String(128 * 1024 + 1),
    }),
  ]) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input: {
        operationId: OPERATION_ID,
        action: 'buy',
        assetId: 'dexter',
        amountAtomic: '1000000',
      },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => response,
    });
    assert.equal(result.body.namespace, 'opendexter-governed-backend-failure/v1');
    assert.equal(result.body.code, 'governed_backend_response_invalid');
    assert.equal('executed' in result.body, false);
    assert.equal('transactionSignature' in result.body, false);
  }
});

test('backend responses cannot substitute a different request, asset, or intent', async () => {
  const wrongAsset = preparedResponse();
  wrongAsset.business.assetId = 'approved-token-42';
  wrongAsset.preview.assetId = 'approved-token-42';
  const wrongIntent = statusResponse();
  wrongIntent.intentId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
  const wrongSlippage = preparedResponse();
  wrongSlippage.preview.slippageBps = 51;
  const wrongPriceImpact = preparedResponse();
  wrongPriceImpact.preview.priceImpactBps = 11;

  for (const [operation, input, responseBody] of [
    ['prepare', {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
    }, wrongAsset],
    ['prepare', {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
      maxSlippageBps: 50,
    }, wrongSlippage],
    ['prepare', {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
      maxPriceImpactBps: 10,
    }, wrongPriceImpact],
    ['status', { intentId: INTENT_ID }, wrongIntent],
  ]) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation,
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, responseBody),
    });
    assert.equal(result.isError, true, operation);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
    assert.equal('executed' in result.body, false);
  }
});

test('send has no memo and execute cannot carry plan, attempt, or authorization identity', () => {
  assert.throws(() => governedBackendRequest('prepare', {
    operationId: OPERATION_ID,
    action: 'send',
    assetId: 'dexter',
    amountAtomic: '1',
    destinationOwner: ADDRESS,
    memo: null,
  }), /invalid_governed_tool_input/);
  for (const field of ['action', 'planId', 'attemptId', 'authorizationId']) {
    assert.throws(() => governedBackendRequest('execute', {
      operationId: OPERATION_ID,
      intentId: INTENT_ID,
      [field]: 'caller-selected',
    }), /invalid_governed_tool_input/);
  }
});

test('authority selectors are rejected before transport', async () => {
  let called = false;
  await assert.rejects(
    callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input: {
        operationId: OPERATION_ID,
        action: 'buy',
        assetId: 'dexter',
        amountAtomic: '1000000',
        nested: { grantId: GRANT_ID },
      },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, preparedResponse());
      },
    }),
    /governed_authority_override_forbidden/,
  );
  assert.equal(called, false);
});

test('weak service configuration fails before transport', async () => {
  let called = false;
  await assert.rejects(
    callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: 'too-short',
      operation: 'status',
      input: { intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, statusResponse());
      },
    }),
    /governed_backend_secret_unavailable/,
  );
  assert.equal(called, false);
});

test('backend origin is an exact bounded origin with HTTP limited to loopback', () => {
  assert.equal(
    normalizeGovernedBackendOrigin('https://api.dexter.test/'),
    'https://api.dexter.test',
  );
  assert.equal(
    normalizeGovernedBackendOrigin('http://127.0.0.1:3030'),
    'http://127.0.0.1:3030',
  );
  for (const hostile of [
    'https://user:password@api.dexter.test',
    'https://api.dexter.test?target=https://attacker.test',
    'https://api.dexter.test#fragment',
    'https://api.dexter.test/internal',
    'http://api.dexter.test',
    ' https://api.dexter.test',
    'file:///tmp/socket',
    'not-an-origin',
  ]) {
    assert.throws(
      () => normalizeGovernedBackendOrigin(hostile),
      /invalid_governed_backend_origin/,
      hostile,
    );
  }
});
