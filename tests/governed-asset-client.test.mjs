import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  readGovernedAgentActionsHmacSecret,
} from '../lib/governed-asset-service-config.mjs';
import {
  GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS,
  GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA,
  buildGovernedAssetToolResult,
} from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import {
  dynamicStockV2Fixture,
} from './fixtures/governed-stock-v2.fixtures.mjs';

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
const API_6C243_ADVANCED_FINAL_FIXTURE_BYTES = readFileSync(new URL(
  './fixtures/governed-agent-reconcile-advanced-final-6c243154.json',
  import.meta.url,
));
const API_6C243_ADVANCED_FINAL_FIXTURE = JSON.parse(
  API_6C243_ADVANCED_FINAL_FIXTURE_BYTES.toString('utf8'),
);

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
      productIdentity: {
        assetId: 'dexter',
        assetClass: 'token',
        companyName: null,
        productName: 'Dexter',
        symbol: 'DEXTER',
        issuer: null,
        network: 'solana-mainnet',
        mint: ADDRESS,
        tokenProgram: 'spl-token',
        decimals: 6,
        registryIdentityDigest: '1'.repeat(64),
      },
      feeSummary: {
        summary: 'Trading fees are included in this quote; network fee is calculated at execution.',
        platformFee: null,
        routeFees: [],
        networkFee: {
          status: 'not-yet-calculated',
          amountLamports: null,
        },
      },
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

function stockPrepareFailure({
  input,
  status = 'refused',
  code,
  retryable = false,
}) {
  const uncertain = status === 'uncertain';
  return {
    namespace: 'dexter-governed-agent-action/v1',
    requestId: input.operationId,
    executed: false,
    attribution: null,
    business: {
      action: input.action,
      assetId: null,
      requestedCompanyQuery: input.companyQuery,
      amountAtomic: input.amountAtomic ?? null,
      destinationOwner: null,
      protocolId: 'jupiter-v2',
      lifecycle: uncertain ? 'unknown' : 'not-created',
      settlement: 'not-submitted',
      finality: 'not-final',
      executionSucceeded: null,
      programError: false,
      refusalOrEscalationReasons: [code],
      ambiguity: {
        status: uncertain ? 'unresolved' : 'none',
        retrySameRequestOnly: uncertain,
      },
      reconciliation: { required: false, availableToOwner: false },
    },
    status,
    code,
    explanation: 'Exact catalog stock failure.',
    ...(uncertain
      ? { retryWithSameRequestOnly: true }
      : { retryable }),
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
    canReconcile: true,
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

function reconcileResponse({
  outcome = 'pending',
  phase = 'validator-reconciliation',
  mutated = false,
  stateVersionBefore = 2,
  attemptId = ATTEMPT_ID,
  code = 'agent_reconciliation_still_uncertain',
  statusAfter = statusResponse(),
} = {}) {
  const identity = {
    namespace: 'dexter-governed-agent-reconcile/v1',
    outcome,
    phase,
    intentId: INTENT_ID,
    attemptId,
    mutated,
    stateVersionBefore,
    code,
    explanation: 'Exact same-intent reconciliation result.',
    statusAfter,
  };
  return { ...identity, digest: canonicalHash(identity) };
}

function mutateReconcile(response, mutate) {
  const identity = structuredClone(response);
  delete identity.digest;
  mutate(identity);
  return { ...identity, digest: canonicalHash(identity) };
}

function executeResponse(overrides = {}) {
  const {
    business: businessOverrides = {},
    ...responseOverrides
  } = overrides;
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
      ...businessOverrides,
    }),
    evidenceDigest: 'e'.repeat(64),
    ...responseOverrides,
  };
}

function canonicalExecuteVariants() {
  return [
    [200, executeResponse()],
    [200, executeResponse({
      executed: false,
      code: 'landed_program_error',
      explanation: 'The protected program reported an execution error.',
      business: {
        executionSucceeded: false,
        programError: true,
      },
    })],
    [202, executeResponse({
      status: 'pending',
      transactionSignature: null,
      executed: false,
      code: 'claimed_attempt_resume_adapter_required',
      explanation: 'The claimed attempt requires the reviewed resume adapter.',
      evidenceDigest: null,
      business: {
        lifecycle: 'claimed',
        settlement: 'not-submitted',
        finality: 'unknown',
        executionSucceeded: null,
        reconciliation: { required: true, availableToOwner: false },
      },
    })],
    [202, executeResponse({
      status: 'pending',
      executed: false,
      explanation: 'The signed attempt is durable but not yet submitted.',
      evidenceDigest: null,
      business: {
        lifecycle: 'signed',
        settlement: 'not-submitted',
        finality: 'unknown',
        executionSucceeded: null,
        reconciliation: { required: true, availableToOwner: false },
      },
    })],
    [202, executeResponse({
      status: 'pending',
      executed: false,
      explanation: 'The submitted attempt awaits authoritative landing evidence.',
      evidenceDigest: null,
      business: {
        lifecycle: 'submitted',
        settlement: 'submission-pending',
        finality: 'unknown',
        executionSucceeded: null,
        reconciliation: { required: true, availableToOwner: false },
      },
    })],
    [503, executeResponse({
      status: 'uncertain',
      executed: false,
      code: 'dispatch_outcome_ambiguous',
      explanation: 'Dexter cannot yet prove whether the attempt landed.',
      business: {
        lifecycle: 'ambiguous',
        settlement: 'unknown',
        finality: 'unknown',
        executionSucceeded: null,
        ambiguity: { status: 'unresolved', retrySameRequestOnly: false },
        reconciliation: { required: true, availableToOwner: false },
      },
    })],
    [503, executeResponse({
      status: 'uncertain',
      attemptId: null,
      transactionSignature: null,
      executed: false,
      code: 'durable_status_unavailable_after_executor_contact',
      explanation: 'Dexter could not reread durable status after contact.',
      evidenceDigest: null,
      business: {
        lifecycle: 'ambiguous',
        settlement: 'unknown',
        finality: 'unknown',
        executionSucceeded: null,
        ambiguity: { status: 'unresolved', retrySameRequestOnly: false },
        reconciliation: { required: true, availableToOwner: false },
      },
    })],
    [409, executeResponse({
      status: 'refused',
      attemptId: null,
      transactionSignature: null,
      executed: false,
      code: 'owner_approval_required',
      explanation: 'The owner must approve this exact action.',
      evidenceDigest: null,
      business: {
        lifecycle: 'prepared',
        settlement: 'not-submitted',
        finality: 'not-final',
        executionSucceeded: null,
        refusalOrEscalationReasons: ['owner_approval_required'],
      },
    })],
    [422, executeResponse({
      status: 'refused',
      executed: false,
      code: 'definitively_not_landed',
      explanation: 'Authoritative reconciliation proved non-landing.',
      business: {
        lifecycle: 'refused',
        settlement: 'definitively-not-landed',
        finality: 'not-final',
        executionSucceeded: false,
      },
    })],
    [422, executeResponse({
      status: 'refused',
      transactionSignature: null,
      executed: false,
      code: 'execution_refused',
      explanation: 'The durable attempt refused before signing.',
      evidenceDigest: null,
      business: {
        lifecycle: 'refused',
        settlement: 'not-submitted',
        finality: 'not-final',
        executionSucceeded: false,
        refusalOrEscalationReasons: ['execution_refused'],
      },
    })],
  ];
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

test('governed money secret is dedicated, trimmed, and has no Dextercard fallback', () => {
  assert.equal(readGovernedAgentActionsHmacSecret({
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: '  dedicated-governed-secret  ',
    INTERNAL_DEXTERCARD_HMAC_SECRET: 'legacy-card-secret',
  }), 'dedicated-governed-secret');
  assert.equal(readGovernedAgentActionsHmacSecret({
    INTERNAL_DEXTERCARD_HMAC_SECRET: 'legacy-card-secret',
  }), '');
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

test('share-quantity Buy sends the human target and never caller-derived token atoms', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const { input, prepared: expected } = fixture;
  let calls = 0;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input,
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, `https://api.dexter.test${PREPARE_PATH}`);
      assert.deepEqual(JSON.parse(options.body), {
        action: 'buy',
        companyQuery: 'Tesla',
        shareQuantity: '1.25',
        maximumSpendAtomic: '300000000',
        maxSlippageBps: 50,
        maxPriceImpactBps: 10,
      });
      assert.equal('assetId' in JSON.parse(options.body), false);
      return jsonResponse(200, expected);
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.isError, false);
  assert.deepEqual(result.body, expected);
  assert.equal(result.body.preview.requestAmountKind, 'share-quantity');
  assert.equal(result.body.preview.requestedShareQuantity, '1.25');
  assert.equal(result.body.preview.minimumShareQuantity, '1.25');
  assert.equal(result.body.preview.minimumOutputAtomic, '1250000');
  assert.equal(
    result.body.preview.shareQuantitySemantics,
    'minimum-receive',
  );
  assert.equal(result.body.preview.overfillPossible, true);
});

test('prepare output accepts a full non-SPCX catalog-stock runtime envelope', () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const parsed = GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(
    fixture.prepared,
  );
  assert.equal(
    parsed.success,
    true,
    parsed.success ? undefined : JSON.stringify(parsed.error.issues),
  );
  assert.equal(parsed.data.preview.productIdentity.companyName, 'Tesla, Inc.');
  assert.equal(parsed.data.preview.productIdentity.providerName, 'Backed Finance');
  assert.equal(parsed.data.preview.productIdentity.legalIssuerName, 'Backed Assets (JE) Limited');
  assert.equal(parsed.data.preview.productIdentity.issuer, 'Backed Assets (JE) Limited');
  assert.equal(parsed.data.preview.requestedShareQuantity, '1.25');
  assert.equal(parsed.data.preview.minimumShareQuantity, '1.25');
  assert.equal(parsed.data.stockRuntime.namespace, 'dexter-delegated-stock-prepare-runtime-binding/v2');
  assert.equal(parsed.data.preview.stockSelection.normalizedCompanyQuery, 'tesla');
  assert.equal(parsed.data.preview.feeSummary.networkFee.status, 'not-yet-calculated');
});

test('prepare output rejects a provider substituted for the legal issuer', () => {
  const mismatched = dynamicStockV2Fixture('tesla', OPERATION_ID).prepared;
  mismatched.preview.productIdentity.issuer = 'Backed Finance';

  const parsed = GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(mismatched);

  assert.equal(parsed.success, false);
  assert.equal(
    parsed.error.issues.some((issue) => (
      issue.path.join('.') === 'preview.productIdentity.issuer'
      && issue.message.includes('formal legal issuer')
    )),
    true,
  );
});

test('catalog stock Prepare preserves exact discovery and runtime refusal codes', async () => {
  const input = {
    operationId: OPERATION_ID,
    action: 'buy',
    companyQuery: 'Tesla',
    amountAtomic: '1000000',
  };
  const cases = [
    [422, stockPrepareFailure({ input, code: 'stock_company_not_found' })],
    [422, stockPrepareFailure({ input, code: 'stock_company_ambiguous' })],
    [503, stockPrepareFailure({
      input,
      code: 'stock_selection_unavailable',
      retryable: true,
    })],
    [503, stockPrepareFailure({
      input,
      code: 'stock_vault_v2_runtime_unavailable',
      retryable: true,
    })],
    [503, stockPrepareFailure({
      input,
      status: 'uncertain',
      code: 'stock_prepare_recovery_unavailable',
    })],
  ];

  for (const [httpStatus, responseBody] of cases) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, true, responseBody.code);
    assert.deepEqual(result.body, responseBody, responseBody.code);
  }
});

test('direct static stock asset identity reaches the API refusal without local substitution', async () => {
  const input = {
    operationId: OPERATION_ID,
    action: 'buy',
    assetId: 'xstocks-tsla',
    amountAtomic: '1000000',
  };
  const responseBody = {
    namespace: 'dexter-governed-agent-action/v1',
    requestId: OPERATION_ID,
    executed: false,
    attribution: null,
    business: business({
      assetId: 'xstocks-tsla',
      lifecycle: 'refused',
    }),
    status: 'refused',
    code: 'stock_catalog_selection_required',
    explanation: 'Stock trading requires an exact released catalog selection.',
    retryable: false,
  };

  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input,
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        action: 'buy',
        assetId: 'xstocks-tsla',
        amountAtomic: '1000000',
      });
      return jsonResponse(422, responseBody);
    },
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.body, responseBody);
});

test('fractional share-quantity Buy may omit the user ceiling', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const expected = fixture.prepared;
  expected.preview.requestedShareQuantity = '0.25';
  expected.preview.expectedShareQuantity = '0.26';
  expected.preview.minimumShareQuantity = '0.25';
  expected.preview.expectedOutputAtomic = '260000';
  expected.preview.minimumOutputAtomic = '250000';
  expected.preview.shareQuantityConversion.rawMinimumOutputAtomic = '250000';
  expected.preview.requestedMaximumSpendAtomic = null;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      companyQuery: 'Tesla',
      shareQuantity: '0.25',
      maxSlippageBps: 50,
      maxPriceImpactBps: 10,
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, expected),
  });

  assert.equal(result.isError, false);
  assert.equal(result.body.preview.maximumInputAmountAtomic, '250000000');
  assert.equal(result.body.preview.requestedMaximumSpendAtomic, null);
  assert.equal(result.body.preview.minimumShareQuantity, '0.25');
});

test('share-quantity normalization rejects substituted human terms or conversion proof', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const { input } = fixture;
  const hostile = [
    (body) => { body.preview.requestAmountKind = 'input'; },
    (body) => { body.preview.requestedShareQuantity = '1'; },
    (body) => { body.preview.minimumShareQuantity = '1.24'; },
    (body) => { body.preview.expectedShareQuantity = '1.24'; },
    (body) => { body.preview.maximumInputAmountAtomic = '250000001'; },
    (body) => { body.preview.requestedMaximumSpendAtomic = '600000000'; },
    (body) => { body.preview.shareQuantityUnit = null; },
    (body) => { body.preview.shareQuantitySemantics = null; },
    (body) => { body.preview.overfillPossible = false; },
    (body) => { body.preview.minimumOutputAtomic = '1249999'; },
    (body) => {
      body.preview.shareQuantityConversion.rawMinimumOutputAtomic = '1249999';
    },
    (body) => { body.preview.shareQuantityConversion.displayMultiplier = '0'; },
    (body) => { body.preview.shareQuantityConversion.displayMultiplier = '0.5'; },
    (body) => { delete body.preview.shareQuantityConversion; },
    (body) => { body.business.amountAtomic = '300000001'; },
    (body) => { body.preview.amountAtomic = '250000001'; },
    (body) => { delete body.preview.requestedShareQuantity; },
  ];

  for (const mutate of hostile) {
    const response = structuredClone(fixture.prepared);
    mutate(response);
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, response),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
  }
});

test('legacy USDC-budget Buy response remains valid without quantity metadata', async () => {
  const expected = preparedResponse();
  for (const field of [
    'requestAmountKind',
    'requestedShareQuantity',
    'expectedShareQuantity',
    'minimumShareQuantity',
    'maximumInputAmountAtomic',
    'requestedMaximumSpendAtomic',
    'shareQuantityUnit',
    'shareQuantitySemantics',
    'overfillPossible',
    'shareQuantityConversion',
  ]) {
    assert.equal(field in expected.preview, false, field);
  }
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
    fetchImpl: async () => jsonResponse(200, expected),
  });
  assert.equal(result.isError, false);
  assert.deepEqual(result.body, expected);
});

test('dynamic non-SPCX Buy and Sell preserve full stock envelopes at every public placement', async () => {
  for (const name of ['tesla', 'nvidia']) {
    const fixture = dynamicStockV2Fixture(name, OPERATION_ID);
    assert.equal(
      GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(
        fixture.execute.tradeSummary,
      ).success,
      true,
      name,
    );
    assert.equal(fixture.prepared.preview.stockSelection.assetId, fixture.status.assetId);
    assert.equal(fixture.status.stockSelection.assetId, fixture.status.assetId);
    assert.equal(fixture.status.stockV2Identity.intentId, fixture.status.intentId);
    assert.equal(fixture.execute.tradeSummary.assetId, fixture.status.assetId);
    assert.equal(fixture.history.items[0].tradeSummary.assetId, fixture.status.assetId);
    assert.equal(
      fixture.reconcile.statusAfter.stockV2Identity.intentId,
      fixture.status.intentId,
    );

    const cases = [
      ['prepare', fixture.input, 200, fixture.prepared],
      ['execute', { operationId: OPERATION_ID, intentId: INTENT_ID }, 200, fixture.execute],
      ['status', { intentId: INTENT_ID }, 200, fixture.status],
      ['reconcile', { intentId: INTENT_ID }, 202, fixture.reconcile],
      ['history', { limit: 25 }, 200, fixture.history],
    ];
    for (const [operation, input, httpStatus, responseBody] of cases) {
      const result = await callGovernedAssetBackend({
        apiBase: 'https://api.dexter.test',
        secret: SECRET,
        operation,
        input,
        mcpSessionId: SESSION_ID,
        now: NOW,
        fetchImpl: async () => jsonResponse(httpStatus, responseBody),
      });
      assert.equal(result.isError, false, `${name}:${operation}`);
      assert.deepEqual(result.body, responseBody, `${name}:${operation}`);
    }
  }
});

test('DEXTER non-stock controls remain valid across every public placement', async () => {
  const prepared = preparedResponse();
  prepared.preview.feeSummary.platformFee = {
    amountAtomic: '7',
    mint: ADDRESS,
  };
  prepared.preview.feeSummary.routeFees = [
    { amountAtomic: '2', mint: ADDRESS },
    { amountAtomic: '3', mint: ADDRESS },
  ];
  const execute = executeResponse();
  const status = statusResponse();
  status.transactionSignature = 'legacy-durable-signature';
  const history = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [status],
    nextCursor: null,
  };
  const reconcile = reconcileResponse({ statusAfter: status });
  const cases = [
    ['prepare', {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000000',
    }, 200, prepared],
    ['execute', { operationId: OPERATION_ID, intentId: INTENT_ID }, 200, execute],
    ['status', { intentId: INTENT_ID }, 200, status],
    ['history', { limit: 25 }, 200, history],
    ['reconcile', { intentId: INTENT_ID }, 202, reconcile],
  ];

  for (const [operation, input, httpStatus, responseBody] of cases) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation,
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, false, operation);
    assert.deepEqual(result.body, responseBody, operation);
  }
  assert.equal('stockRuntime' in prepared, false);
  assert.equal('stockSelection' in prepared.preview, false);
  assert.equal('tradeSummary' in execute, false);
  assert.equal('stockSelection' in status, false);
  assert.equal('stockV2Identity' in status, false);
});

test('stock Prepare requires the exact stock fee summary without narrowing non-stock', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const hostile = [
    (body) => {
      body.preview.feeSummary.platformFee = {
        amountAtomic: '1',
        mint: body.preview.productIdentity.mint,
      };
    },
    (body) => { body.preview.feeSummary.routeFees.reverse(); },
    (body) => {
      body.preview.feeSummary.routeFees[1] = {
        ...body.preview.feeSummary.routeFees[0],
      };
    },
  ];

  for (const mutate of hostile) {
    const response = structuredClone(fixture.prepared);
    mutate(response);
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'prepare',
      input: fixture.input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, response),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
  }
});

test('stock trade summaries require exact public identity, fee, order, and canonical-share semantics', () => {
  const canonical = dynamicStockV2Fixture('tesla', OPERATION_ID)
    .execute.tradeSummary;
  assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(canonical).success, true);

  const hostile = [
    (summary) => { delete summary.productIdentity.providerName; },
    (summary) => { delete summary.productIdentity.legalIssuerName; },
    (summary) => {
      summary.productIdentity.issuer = summary.productIdentity.providerName;
    },
    (summary) => {
      summary.feeSummary.platformFee = {
        amountAtomic: '1',
        mint: summary.productIdentity.mint,
      };
    },
    (summary) => { summary.feeSummary.routeFees.reverse(); },
    (summary) => {
      summary.feeSummary.routeFees[1] = {
        ...summary.feeSummary.routeFees[0],
      };
    },
    (summary) => { summary.requestedShareQuantity = '1.250'; },
    (summary) => { summary.minimumShareQuantity = '1.250'; },
    (summary) => {
      summary.expectedShareQuantity = `1.${'1'.repeat(19)}`;
    },
  ];
  for (const mutate of hostile) {
    const summary = structuredClone(canonical);
    mutate(summary);
    assert.equal(GOVERNED_STOCK_TRADE_SUMMARY_SCHEMA.safeParse(summary).success, false);
  }
});

test('confirmed stock execution is successful without waiting for finalized', async () => {
  const responseBody = dynamicStockV2Fixture('tesla', OPERATION_ID).execute;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'execute',
    input: { operationId: OPERATION_ID, intentId: INTENT_ID },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, responseBody),
  });

  assert.equal(result.isError, false);
  assert.equal(result.body.status, 'confirmed');
  assert.equal(result.body.business.finality, 'confirmed');
  assert.equal(result.body.business.executionSucceeded, true);
  assert.equal(result.body.tradeSummary.requestedShareQuantity, '1.25');
});

test('confirmed stock success requires a canonical 64-byte Solana signature', async () => {
  for (const operation of ['execute', 'status']) {
    const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
    const body = structuredClone(fixture[operation]);
    body.transactionSignature = '2'.repeat(64);
    const input = operation === 'execute'
      ? { operationId: OPERATION_ID, intentId: INTENT_ID }
      : { intentId: INTENT_ID };
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation,
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, body),
    });
    assert.equal(result.isError, true, operation);
    assert.equal(result.body.code, 'governed_backend_response_invalid', operation);
  }
});

test('execute accepts current Vault V2 stock boundary and recovery codes', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  for (const code of [
    'stock_public_identity_required',
    'stock_vault_v2_runtime_unavailable',
    'stock_vault_v2_runtime_identity_invalid',
    'stock_vault_v2_runtime_identity_mismatch',
  ]) {
    const responseBody = structuredClone(fixture.execute);
    responseBody.status = 'refused';
    responseBody.attemptId = null;
    responseBody.transactionSignature = null;
    responseBody.executed = false;
    responseBody.code = code;
    responseBody.explanation = 'The exact stock execution boundary is unavailable.';
    responseBody.evidenceDigest = null;
    Object.assign(responseBody.business, {
      lifecycle: 'prepared',
      settlement: 'not-submitted',
      finality: 'not-final',
      executionSucceeded: null,
      refusalOrEscalationReasons: [code],
      reconciliation: { required: false, availableToOwner: false },
    });
    const httpStatus = code === 'stock_public_identity_required' ? 422 : 503;
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'execute',
      input: { operationId: OPERATION_ID, intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, true, code);
    assert.deepEqual(result.body, responseBody, code);
  }

  const recoveryUnavailable = structuredClone(fixture.execute);
  recoveryUnavailable.status = 'pending';
  recoveryUnavailable.transactionSignature = null;
  recoveryUnavailable.executed = false;
  recoveryUnavailable.code = 'stock_vault_v2_recovery_unavailable';
  recoveryUnavailable.explanation = 'The exact stock recovery boundary is unavailable.';
  recoveryUnavailable.evidenceDigest = null;
  Object.assign(recoveryUnavailable.business, {
    lifecycle: 'claimed',
    settlement: 'not-submitted',
    finality: 'unknown',
    executionSucceeded: null,
    refusalOrEscalationReasons: [],
    reconciliation: { required: true, availableToOwner: false },
  });
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'execute',
    input: { operationId: OPERATION_ID, intentId: INTENT_ID },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(503, recoveryUnavailable),
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.body, recoveryUnavailable);
});

test('trade summary fails closed on business, mint, token-program, or hidden stock evidence substitution', async () => {
  const hostileExecute = [
    (body) => { body.tradeSummary.amountAtomic = '1349344731'; },
    (body) => {
      body.tradeSummary.assetId = 'backpack-spcx-v2';
      body.tradeSummary.productIdentity.assetId = 'backpack-spcx-v2';
    },
    (body) => {
      Object.assign(body.tradeSummary, {
        action: 'sell',
        requestAmountKind: 'input',
        requestedShareQuantity: null,
        expectedShareQuantity: null,
        minimumShareQuantity: null,
        shareQuantityUnit: null,
        shareQuantitySemantics: null,
        requestedMaximumSpendAtomic: null,
        overfillPossible: false,
      });
    },
    (body) => { body.stockSelection = { mint: ADDRESS }; },
    (body) => { body.quoteAttestation = { digest: 'a'.repeat(64) }; },
  ];
  for (const mutate of hostileExecute) {
    const body = dynamicStockV2Fixture('tesla', OPERATION_ID).execute;
    mutate(body);
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'execute',
      input: { operationId: OPERATION_ID, intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, body),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
  }

  const hostileStatus = [
    (body) => { body.tradeSummary.productIdentity.mint = ADDRESS; },
    (body) => { body.tradeSummary.productIdentity.tokenProgram = 'spl-token'; },
    (body) => { body.stockSelection.assetId = 'xstocks-other'; },
    (body) => { body.stockV2Identity.intentId = '11111111-1111-4111-8111-111111111111'; },
    (body) => { body.tradeSummary.unexpected = true; },
  ];
  for (const mutate of hostileStatus) {
    const body = dynamicStockV2Fixture('tesla', OPERATION_ID).status;
    mutate(body);
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'status',
      input: { intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, body),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
  }
});

test('legacy execute and status envelopes remain valid without tradeSummary', () => {
  const execute = executeResponse();
  const status = statusResponse();
  assert.equal('tradeSummary' in execute, false);
  assert.equal('tradeSummary' in status, false);
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(execute).success,
    true,
  );
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(status).success,
    true,
  );
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

test('execute, status, and history reject amounts and slots above u64', () => {
  const maximum = '18446744073709551615';
  const overflow = '18446744073709551616';

  const execute = executeResponse();
  execute.business.amountAtomic = maximum;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(execute).success,
    true,
  );
  execute.business.amountAtomic = overflow;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(execute).success,
    false,
  );

  const status = statusResponse();
  status.amountAtomic = maximum;
  status.confirmationSlot = maximum;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(status).success,
    true,
  );
  status.confirmationSlot = overflow;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(status).success,
    false,
  );

  const historyStatus = statusResponse();
  historyStatus.amountAtomic = overflow;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.history.safeParse({
      namespace: 'dexter-governed-transaction-history/v1',
      items: [historyStatus],
      nextCursor: null,
    }).success,
    false,
  );

  const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
  const unsafeInteger = maximumSafeInteger + 1;
  const safePrepared = preparedResponse();
  safePrepared.attribution.grant.revision = maximumSafeInteger;
  safePrepared.preview.quoteExpiresAtUnixMs = maximumSafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(safePrepared).success,
    true,
  );
  safePrepared.attribution.grant.revision = unsafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(safePrepared).success,
    false,
  );
  safePrepared.attribution.grant.revision = maximumSafeInteger;
  safePrepared.preview.quoteExpiresAtUnixMs = unsafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.prepare.safeParse(safePrepared).success,
    false,
  );

  const safeStatus = statusResponse();
  safeStatus.grantRevision = maximumSafeInteger;
  safeStatus.stateVersion = maximumSafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(safeStatus).success,
    true,
  );
  safeStatus.grantRevision = unsafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(safeStatus).success,
    false,
  );
  safeStatus.grantRevision = maximumSafeInteger;
  safeStatus.stateVersion = unsafeInteger;
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.status.safeParse(safeStatus).success,
    false,
  );
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
      fetchImpl: async () => jsonResponse(422, refusal),
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

test('reconcile accepts every exact runtime outcome envelope', async () => {
  const finalStatus = {
    ...statusResponse(),
    status: 'confirmed',
    ledgerState: 'confirmed',
    landingProof: true,
    confirmationSlot: '123',
    confirmationCommitment: 'finalized',
    executionSucceeded: true,
    settlementFinalized: true,
    reconciliationRequired: false,
    canReconcile: false,
    reconciliationKind: 'landed_success',
    reconciliationEvidenceDigest: 'e'.repeat(64),
    receiptPhases: [
      'dispatch_fenced',
      'accepted',
      'reconciled_confirmed',
      'reconciled_finalized',
    ],
  };
  const cases = [
    [200, reconcileResponse({
      outcome: 'already-final',
      phase: 'final',
      code: null,
      statusAfter: finalStatus,
    }), false],
    [200, reconcileResponse({
      outcome: 'advanced',
      mutated: true,
      code: null,
      statusAfter: { ...finalStatus, stateVersion: 3 },
    }), false],
    [202, reconcileResponse(), false],
    [409, reconcileResponse({
      outcome: 'not-required',
      phase: 'none',
      attemptId: null,
      stateVersionBefore: null,
      code: 'reconciliation_not_required',
      statusAfter: {
        ...statusResponse(),
        attemptId: null,
        status: 'prepared',
        ledgerState: 'prepared',
        stateVersion: null,
        transactionSignature: null,
        submitted: false,
        reconciliationRequired: false,
        canReconcile: false,
        receiptPhases: [],
      },
    }), true],
    [409, reconcileResponse({
      outcome: 'unavailable',
      code: 'agent_reconciliation_adapter_required',
    }), true],
    [200, reconcileResponse({
      outcome: 'already-final',
      phase: 'final',
      code: null,
      statusAfter: {
        ...statusResponse(),
        status: 'refused',
        ledgerState: 'provably_not_landed',
        submitted: false,
        definitiveNonlandingProof: true,
        executionSucceeded: false,
        reconciliationRequired: false,
        canReconcile: false,
        reconciliationKind: 'validator_refused_before_contact',
        reconciliationEvidenceDigest: 'f'.repeat(64),
        receiptPhases: ['dispatch_fenced', 'refused_before_contact'],
      },
    }), false],
  ];

  for (const [httpStatus, responseBody, isError] of cases) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'reconcile',
      input: { intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, isError, responseBody.outcome);
    assert.deepEqual(result.body, responseBody, responseBody.outcome);
  }
});

test('reconcile preserves current stock public-identity and V2 recovery refusals', async () => {
  const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const fullIdentity = mutateReconcile(fixture.reconcile, (identity) => {
    identity.outcome = 'unavailable';
    identity.code = 'stock_vault_v2_recovery_unavailable';
    identity.explanation = 'The exact release-bound stock recovery adapter is unavailable.';
  });
  const incompleteIdentity = mutateReconcile(fixture.reconcile, (identity) => {
    identity.outcome = 'unavailable';
    identity.code = 'stock_public_identity_required';
    identity.explanation = 'The durable stock public identity is incomplete.';
    delete identity.statusAfter.stockV2Identity;
  });

  for (const responseBody of [fullIdentity, incompleteIdentity]) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'reconcile',
      input: { intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(409, responseBody),
    });
    assert.equal(result.isError, true, responseBody.code);
    assert.deepEqual(result.body, responseBody, responseBody.code);
  }
});

test('reconcile accepts the exact API 6c243 advanced-final public envelope', async () => {
  assert.equal(
    createHash('sha256')
      .update(API_6C243_ADVANCED_FINAL_FIXTURE_BYTES)
      .digest('hex'),
    'ce947da8dbc22b602d5254949787b777b66095bb2530a707fb1db6d73b1b41d4',
  );
  assert.equal(
    API_6C243_ADVANCED_FINAL_FIXTURE.sourceCommit,
    '6c243154e9e06f4e40830300c4027721645a33cc',
  );
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.reconcile.safeParse(
      API_6C243_ADVANCED_FINAL_FIXTURE.body,
    ).success,
    true,
  );

  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'reconcile',
    input: API_6C243_ADVANCED_FINAL_FIXTURE.input,
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(
      API_6C243_ADVANCED_FINAL_FIXTURE.httpStatus,
      API_6C243_ADVANCED_FINAL_FIXTURE.body,
    ),
  });

  assert.equal(result.isError, false);
  assert.deepEqual(result.body, API_6C243_ADVANCED_FINAL_FIXTURE.body);
});

test('advanced-final reconciliation remains terminal, advancing, and identity exact', async () => {
  const valid = API_6C243_ADVANCED_FINAL_FIXTURE.body;
  const pendingFinal = mutateReconcile(valid, (body) => {
    body.outcome = 'pending';
    body.mutated = false;
    body.stateVersionBefore = 2;
    body.code = 'agent_reconciliation_still_uncertain';
    body.statusAfter = { ...statusResponse(), stateVersion: 2 };
  });
  const nonterminalAdvanced = mutateReconcile(valid, (body) => {
    body.statusAfter = { ...statusResponse(), stateVersion: 3 };
  });
  const unchangedAdvanced = mutateReconcile(valid, (body) => {
    body.mutated = false;
    body.statusAfter.stateVersion = body.stateVersionBefore;
  });
  const regressedAdvanced = mutateReconcile(valid, (body) => {
    body.statusAfter.stateVersion = body.stateVersionBefore - 1;
  });
  const attemptMismatch = mutateReconcile(valid, (body) => {
    body.statusAfter.attemptId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
  });
  const intentMismatch = mutateReconcile(valid, (body) => {
    body.statusAfter.intentId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
  });
  const requestedIntentSubstitution = mutateReconcile(valid, (body) => {
    body.intentId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
    body.statusAfter.intentId = body.intentId;
  });
  const actionCeremonyMismatch = mutateReconcile(valid, (body) => {
    body.statusAfter.action = 'sell';
  });
  const ownerRefusalTerminal = mutateReconcile(valid, (body) => {
    body.outcome = 'already-final';
    body.attemptId = null;
    body.mutated = false;
    body.stateVersionBefore = null;
    body.statusAfter = {
      ...body.statusAfter,
      attemptId: null,
      stateVersion: null,
      policyDecision: 'approval_required',
      escalationReasons: ['owner_refused'],
      ownerDecision: {
        required: true,
        status: 'refused',
        reason: 'owner_refused',
        decidedAt: '2026-08-01T00:00:30.000Z',
      },
      status: 'refused',
      ledgerState: 'owner-refused',
      transactionSignature: null,
      submitted: false,
      definitiveNonlandingProof: false,
      reconciliationKind: null,
      reconciliationEvidenceDigest: null,
      refusalSource: 'owner',
      refusalCode: 'owner_refused',
      receiptPhases: [],
    };
  });
  const ownerRefusalSubstitution = mutateReconcile(
    ownerRefusalTerminal,
    (body) => {
      body.outcome = 'advanced';
    },
  );
  const nonNullCode = mutateReconcile(valid, (body) => {
    body.code = 'agent_reconciliation_still_uncertain';
  });
  const wrongDigest = { ...valid, digest: '0'.repeat(64) };

  const ownerRefusalControl = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'reconcile',
    input: API_6C243_ADVANCED_FINAL_FIXTURE.input,
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, ownerRefusalTerminal),
  });
  assert.equal(
    ownerRefusalControl.isError,
    false,
    'the owner-refusal control is an otherwise valid terminal envelope',
  );

  const hostile = [
    [202, valid],
    [202, pendingFinal],
    [200, nonterminalAdvanced],
    [200, unchangedAdvanced],
    [200, regressedAdvanced],
    [200, attemptMismatch],
    [200, intentMismatch],
    [200, requestedIntentSubstitution],
    [200, actionCeremonyMismatch],
    [200, ownerRefusalSubstitution],
    [200, nonNullCode],
    [200, wrongDigest],
  ];

  for (const [httpStatus, responseBody] of hostile) {
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.reconcile.safeParse(responseBody)
        .success,
      true,
      'hostile envelope remains structurally valid before cross-field checks',
    );
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'reconcile',
      input: API_6C243_ADVANCED_FINAL_FIXTURE.input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
    assert.equal('statusAfter' in result.body, false);
  }
});

test('recovered confirmation does not require a lost initial validator outcome receipt', async () => {
  const recoveredFinalStatus = {
    ...statusResponse(),
    status: 'confirmed',
    ledgerState: 'confirmed',
    landingProof: true,
    confirmationSlot: '123',
    confirmationCommitment: 'finalized',
    executionSucceeded: true,
    settlementFinalized: true,
    reconciliationRequired: false,
    canReconcile: false,
    reconciliationKind: 'landed_success',
    reconciliationEvidenceDigest: 'e'.repeat(64),
    receiptPhases: [
      'dispatch_fenced',
      'reconciled_confirmed',
      'reconciled_finalized',
    ],
  };
  const cases = [
    ['status', { intentId: INTENT_ID }, recoveredFinalStatus],
    ['history', { limit: 25 }, {
      namespace: 'dexter-governed-transaction-history/v1',
      items: [recoveredFinalStatus],
      nextCursor: null,
    }],
    ['reconcile', { intentId: INTENT_ID }, reconcileResponse({
      outcome: 'already-final',
      phase: 'final',
      code: null,
      statusAfter: recoveredFinalStatus,
    })],
  ];
  for (const [operation, input, responseBody] of cases) {
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation,
      input,
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(200, responseBody),
    });
    assert.equal(result.isError, false, operation);
    assert.deepEqual(result.body, responseBody, operation);
  }
});

test('reconcile refuses substituted identity, version, mutation, finality, digest, or HTTP state', async () => {
  const pending = reconcileResponse();
  const finalStatus = {
    ...statusResponse(),
    status: 'confirmed',
    ledgerState: 'confirmed',
    landingProof: true,
    confirmationSlot: '123',
    confirmationCommitment: 'finalized',
    executionSucceeded: true,
    settlementFinalized: true,
    reconciliationRequired: false,
    canReconcile: false,
    reconciliationKind: 'landed_success',
    reconciliationEvidenceDigest: 'e'.repeat(64),
    receiptPhases: [
      'dispatch_fenced',
      'accepted',
      'reconciled_confirmed',
      'reconciled_finalized',
    ],
  };
  const hostile = [
    [202, mutateReconcile(pending, (body) => {
      body.intentId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
      body.statusAfter.intentId = body.intentId;
    })],
    [202, mutateReconcile(pending, (body) => {
      body.statusAfter.attemptId = 'a19f981c-9215-4141-84f2-d89ffe9cbece';
    })],
    [202, mutateReconcile(pending, (body) => {
      body.statusAfter.stateVersion = 1;
    })],
    [202, mutateReconcile(pending, (body) => {
      body.mutated = true;
    })],
    [200, reconcileResponse({
      outcome: 'advanced',
      mutated: true,
      code: null,
      statusAfter: { ...statusResponse(), stateVersion: 3 },
    })],
    [202, reconcileResponse({
      statusAfter: finalStatus,
    })],
    [202, { ...pending, digest: '0'.repeat(64) }],
    [200, pending],
  ];

  const validFinal = reconcileResponse({
    outcome: 'already-final',
    phase: 'final',
    code: null,
    statusAfter: finalStatus,
  });
  const contradictoryFinalStatus = [
    (status) => { status.landingProof = false; },
    (status) => { status.definitiveNonlandingProof = true; },
    (status) => { status.executionSucceeded = null; },
    (status) => { status.settlementFinalized = false; },
    (status) => { status.reconciliationKind = 'landed_program_error'; },
    (status) => { status.reconciliationEvidenceDigest = null; },
    (status) => { status.transactionSignature = null; },
    (status) => { status.confirmationSlot = null; },
    (status) => { status.submitted = false; },
    (status) => { status.ledgerState = 'broadcast'; },
    (status) => { status.reconciliationRequired = true; },
    (status) => { status.canReconcile = true; },
    (status) => {
      status.refusalSource = 'executor';
      status.refusalCode = 'invented_refusal';
    },
    (status, body) => {
      status.attemptId = null;
      status.stateVersion = null;
      body.attemptId = null;
      body.stateVersionBefore = null;
    },
    (status) => {
      status.actor = 'owner';
      status.runtime = {
        principalSource: 'authenticated-owner',
        linkTokenId: null,
        surfaceBindingDigest: null,
      };
      status.agentId = null;
      status.grantId = null;
      status.grantRevision = null;
      status.grantRevisionDigest = null;
      status.grantRuleId = null;
    },
    (status) => {
      status.operationCeremony = {
        kind: 'send',
        operationMessageBytes: 506,
        operationMessageDomain: 'OTS_GOVERNED_SEND_V1',
        actionDiscriminator: 2,
        evidenceNamespace: 'dexter-protected-owner-send-evidence/v1',
      };
      status.destinationOwner = ADDRESS;
      status.protocolId = 'spl-transfer';
    },
    (status) => {
      status.ownerDecision = {
        required: true,
        status: 'pending',
        reason: null,
        decidedAt: null,
      };
      status.policyDecision = 'approval_required';
      status.escalationReasons = ['owner_approval_required'];
    },
    (status) => {
      status.escalationReasons = ['invented_escalation'];
    },
    (status) => {
      status.policyDecision = 'approval_required';
      status.escalationReasons = ['z_reason', 'a_reason'];
      status.ownerDecision = {
        required: true,
        status: 'approved',
        reason: null,
        decidedAt: '2026-08-01T00:00:30.000Z',
      };
    },
    (status) => {
      status.policyDecision = 'approval_required';
      status.escalationReasons = ['same_reason', 'same_reason'];
      status.ownerDecision = {
        required: true,
        status: 'approved',
        reason: null,
        decidedAt: '2026-08-01T00:00:30.000Z',
      };
    },
    (status) => {
      status.policyDecision = 'approval_required';
      status.escalationReasons = ['owner_refused'];
      status.ownerDecision = {
        required: true,
        status: 'refused',
        reason: 'owner_refused',
        decidedAt: '2026-08-01T00:00:30.000Z',
      };
    },
    (status) => {
      status.assetMint = 'native:SOL';
    },
    (status) => {
      status.receiptPhases = [
        'dispatch_fenced',
        'refused_before_contact',
      ];
    },
    (status) => {
      status.lastActivityAt = '2025-07-31T23:59:59.000Z';
    },
    (status) => {
      status.receiptPhases = ['accepted', 'accepted'];
    },
    (status) => {
      status.receiptPhases = [
        'accepted',
        'reconciled_confirmed',
        'reconciled_finalized',
      ];
    },
    (status) => {
      status.receiptPhases = [
        'dispatch_fenced',
        'accepted',
        'uncertain',
        'reconciled_confirmed',
        'reconciled_finalized',
      ];
    },
    (status) => {
      status.receiptPhases = [
        'dispatch_fenced',
        'accepted',
        'reconciled_finalized',
      ];
    },
    (status) => {
      status.receiptPhases = [
        'accepted',
        'dispatch_fenced',
        'reconciled_confirmed',
        'reconciled_finalized',
      ];
    },
    (status) => {
      status.receiptPhases = [
        'reconciled_confirmed',
        'reconciled_not_landed',
      ];
    },
  ];
  for (const mutateStatus of contradictoryFinalStatus) {
    hostile.push([200, mutateReconcile(validFinal, (body) => {
      mutateStatus(body.statusAfter, body);
    })]);
  }
  hostile.push(
    [202, mutateReconcile(pending, (body) => {
      body.statusAfter.reconciliationKind = 'landed_success';
      body.statusAfter.reconciliationEvidenceDigest = 'e'.repeat(64);
    })],
    [202, mutateReconcile(pending, (body) => {
      body.phase = 'none';
      body.attemptId = null;
      body.stateVersionBefore = null;
      body.statusAfter = {
        ...body.statusAfter,
        attemptId: null,
        status: 'prepared',
        ledgerState: 'prepared',
        stateVersion: null,
        transactionSignature: null,
        submitted: false,
        reconciliationRequired: false,
        canReconcile: false,
        receiptPhases: [],
      };
    })],
    [409, mutateReconcile(pending, (body) => {
      body.outcome = 'unavailable';
      body.phase = 'none';
      body.attemptId = null;
      body.stateVersionBefore = null;
      body.code = 'agent_reconciliation_adapter_required';
      body.statusAfter = {
        ...body.statusAfter,
        attemptId: null,
        status: 'prepared',
        ledgerState: 'prepared',
        stateVersion: null,
        transactionSignature: null,
        submitted: false,
        reconciliationRequired: false,
        canReconcile: false,
        receiptPhases: [],
      };
    })],
    [409, mutateReconcile(pending, (body) => {
      body.outcome = 'unavailable';
      body.code = 'agent_finality_adapter_required';
    })],
    [409, mutateReconcile(pending, (body) => {
      body.outcome = 'unavailable';
      body.phase = 'validator-reconciliation';
      body.code = 'agent_reconciliation_adapter_required';
      body.statusAfter = {
        ...body.statusAfter,
        status: 'claimed',
        ledgerState: 'claimed',
        transactionSignature: null,
        submitted: false,
        receiptPhases: [],
      };
    })],
    [409, mutateReconcile(pending, (body) => {
      body.outcome = 'unavailable';
      body.phase = 'validator-reconciliation';
      body.code = 'agent_reconciliation_adapter_required';
      body.statusAfter = {
        ...body.statusAfter,
        status: 'signed',
        ledgerState: 'signed',
        submitted: false,
        receiptPhases: [],
      };
    })],
    [409, mutateReconcile(pending, (body) => {
      body.outcome = 'not-required';
      body.phase = 'none';
      body.code = 'reconciliation_not_required';
      body.statusAfter = {
        ...finalStatus,
        action: 'send',
        operationCeremony: {
          kind: 'send',
          operationMessageBytes: 506,
          operationMessageDomain: 'OTS_GOVERNED_SEND_V1',
          actionDiscriminator: 2,
          evidenceNamespace: 'dexter-protected-owner-send-evidence/v1',
        },
        destinationOwner: ADDRESS,
        protocolId: 'spl-transfer',
        confirmationCommitment: 'confirmed',
        settlementFinalized: false,
      };
    })],
  );

  for (const [httpStatus, responseBody] of hostile) {
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.reconcile.safeParse(responseBody)
        .success,
      true,
      'hostile envelope remains structurally valid before cross-field checks',
    );
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'reconcile',
      input: { intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
    assert.equal('statusAfter' in result.body, false);
  }
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

test('execute accepts only the canonical durable API outcome variants', async () => {
  for (const [httpStatus, responseBody] of canonicalExecuteVariants()) {
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(responseBody).success,
      true,
      `${responseBody.status}:${responseBody.code ?? 'no-code'} fixture`,
    );
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'execute',
      input: { operationId: OPERATION_ID, intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.deepEqual(result.body, responseBody);
    assert.notEqual(result.body.code, 'governed_backend_response_invalid');
  }
});

test('landed program errors remain structured so the receipt can render failure', () => {
  const failed = executeResponse({
    executed: false,
    code: 'landed_program_error',
    explanation: 'The protected program reported an execution error.',
    business: {
      executionSucceeded: false,
      programError: true,
    },
  });
  const result = buildGovernedAssetToolResult({
    body: failed,
    httpStatus: 200,
    isError: true,
  });
  const projected = applyOpenToolResultPolicy(
    'dexter_execute_asset_action',
    result,
  );

  assert.equal(projected.isError, true);
  assert.deepEqual(projected.structuredContent, failed);
  assert.equal(projected.structuredContent.business.executionSucceeded, false);
  assert.equal(projected.structuredContent.business.programError, true);
});

test('schema-valid execute refusals remain text-only', () => {
  const refused = canonicalExecuteVariants()
    .find(([, body]) => body.status === 'refused')[1];
  assert.equal(
    GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(refused).success,
    true,
  );

  const result = buildGovernedAssetToolResult({
    body: refused,
    httpStatus: 409,
    isError: true,
  });
  const projected = applyOpenToolResultPolicy(
    'dexter_execute_asset_action',
    result,
  );

  assert.equal(projected.isError, true);
  assert.equal(projected.structuredContent, undefined);
  assert.equal(JSON.parse(projected.content[0].text).status, 'refused');
});

test('execute rejects structurally valid contradictory durable outcomes', async () => {
  const variants = canonicalExecuteVariants();
  const mutate = (index, change) => {
    const [httpStatus, responseBody] = variants[index];
    const hostile = structuredClone(responseBody);
    change(hostile);
    return [httpStatus, hostile];
  };
  const hostile = [
    mutate(0, (body) => { body.attemptId = null; }),
    mutate(0, (body) => { body.transactionSignature = null; }),
    mutate(0, (body) => { body.evidenceDigest = null; }),
    mutate(0, (body) => { body.executed = false; }),
    mutate(0, (body) => { body.business.lifecycle = 'prepared'; }),
    mutate(0, (body) => { body.business.action = 'send'; }),
    mutate(0, (body) => { body.business.ambiguity.retrySameRequestOnly = true; }),
    mutate(0, (body) => { body.attribution.grant.revision = 0; }),
    [202, structuredClone(variants[0][1])],
    mutate(2, (body) => { body.transactionSignature = '2'.repeat(88); }),
    mutate(3, (body) => { body.transactionSignature = null; }),
    mutate(4, (body) => { body.business.settlement = 'not-submitted'; }),
    mutate(5, (body) => { body.attemptId = null; }),
    mutate(6, (body) => { body.attemptId = ATTEMPT_ID; }),
    mutate(7, (body) => {
      body.business.refusalOrEscalationReasons = ['different_reason'];
    }),
    mutate(8, (body) => { body.evidenceDigest = null; }),
    mutate(9, (body) => { body.transactionSignature = '3'.repeat(88); }),
  ];

  for (const [httpStatus, responseBody] of hostile) {
    assert.equal(
      GOVERNED_ASSET_TOOL_OUTPUT_SCHEMAS.execute.safeParse(responseBody).success,
      true,
      'hostile execute body remains structurally valid',
    );
    const result = await callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      operation: 'execute',
      input: { operationId: OPERATION_ID, intentId: INTENT_ID },
      mcpSessionId: SESSION_ID,
      now: NOW,
      fetchImpl: async () => jsonResponse(httpStatus, responseBody),
    });
    assert.equal(result.isError, true);
    assert.equal(result.body.code, 'governed_backend_response_invalid');
    assert.equal('executed' in result.body, false);
    assert.equal('transactionSignature' in result.body, false);
    assert.equal('evidenceDigest' in result.body, false);
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

test('current Send refusal stops at Prepare with no executable continuation', async () => {
  const code = 'protected_agent_send_sdk_required';
  const refusal = {
    namespace: 'dexter-governed-agent-action/v1',
    requestId: OPERATION_ID,
    executed: false,
    attribution: attribution(),
    business: business({
      action: 'send',
      amountAtomic: '1',
      destinationOwner: ADDRESS,
      protocolId: 'spl-transfer',
      lifecycle: 'refused',
      refusalOrEscalationReasons: [code],
    }),
    status: 'refused',
    code,
    explanation:
      'Protected delegated Send is unavailable until its dedicated authority, executor, and same-intent recovery are composed.',
    retryable: false,
  };
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    operation: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'send',
      assetId: 'dexter',
      amountAtomic: '1',
      destinationOwner: ADDRESS,
    },
    mcpSessionId: SESSION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(422, refusal),
  });

  assert.equal(result.httpStatus, 422);
  assert.equal(result.isError, true);
  assert.equal(result.body.code, code);
  assert.equal(result.body.executed, false);
  assert.equal(result.body.retryable, false);
  assert.equal(result.body.business.reconciliation.required, false);
  for (const continuation of [
    'intentId',
    'attemptId',
    'planId',
    'approval',
    'execution',
    'retry',
  ]) {
    assert.equal(continuation in result.body, false, continuation);
  }
  const toolResult = buildGovernedAssetToolResult(result);
  assert.equal(toolResult.isError, true);
  assert.equal(toolResult.structuredContent, undefined);
  assert.equal(JSON.parse(toolResult.content[0].text).code, code);
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
  for (const secret of [
    'too-short',
    readGovernedAgentActionsHmacSecret({
      INTERNAL_DEXTERCARD_HMAC_SECRET:
        'legacy-only-secret-that-must-not-authorize-governed-money',
    }),
  ]) {
    let called = false;
    await assert.rejects(
      callGovernedAssetBackend({
        apiBase: 'https://api.dexter.test',
        secret,
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
  }
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
