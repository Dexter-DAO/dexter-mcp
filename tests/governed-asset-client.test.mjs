import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOVERNED_BACKEND_AUTH_PURPOSE,
  buildGovernedBackendRequestAuth,
  callGovernedAssetBackend,
  verifyGovernedBackendRequestAuth,
} from '../lib/governed-asset-client.mjs';

const SECRET = 'test-only-governed-secret-at-least-thirty-two-bytes';
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';
const NEW_OPERATION_ID = '119f981c-9215-4141-84f2-d89ffe9cbece';
const CORRELATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const SESSION_ID = '319f981c-9215-4141-84f2-d89ffe9cbece';
const INTENT_ID = '419f981c-9215-4141-84f2-d89ffe9cbece';
const NOW = 1_785_020_400_000;
const PATH = '/internal/mcp/governed-assets/prepare/buy';
const BODY = '{"amountAtomic":"1000"}';

function jsonResponse(status, body) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

test('purpose-separated request auth binds method, path, body, operation, and correlation', () => {
  const headers = buildGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'POST',
    path: PATH,
    bodyText: BODY,
    operationId: OPERATION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
  });
  assert.equal(headers['x-dexter-purpose'], GOVERNED_BACKEND_AUTH_PURPOSE);
  assert.equal(headers['idempotency-key'], OPERATION_ID);
  assert.doesNotMatch(JSON.stringify(headers), new RegExp(SECRET));
  assert.equal(verifyGovernedBackendRequestAuth({
    secret: SECRET,
    method: 'POST',
    path: PATH,
    bodyText: BODY,
    headers,
    now: NOW,
  }), true);

  for (const mutation of [
    { method: 'DELETE' },
    { path: '/internal/mcp/governed-assets/prepare/sell' },
    { bodyText: '{"amountAtomic":"1001"}' },
    {
      headers: {
        ...headers,
        'x-dexter-operation-id': NEW_OPERATION_ID,
        'idempotency-key': NEW_OPERATION_ID,
      },
    },
    {
      headers: {
        ...headers,
        'x-dexter-correlation-id': SESSION_ID,
      },
    },
  ]) {
    assert.equal(verifyGovernedBackendRequestAuth({
      secret: SECRET,
      method: 'POST',
      path: PATH,
      bodyText: BODY,
      headers,
      now: NOW,
      ...mutation,
    }), false);
  }
});

test('client derives trusted session context, signs exact bytes, and calls once', async () => {
  const calls = [];
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000',
      maxSlippageBps: 50,
    },
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(verifyGovernedBackendRequestAuth({
        secret: SECRET,
        method: options.method,
        path: PATH,
        bodyText: options.body,
        headers: options.headers,
        now: NOW,
      }), true);
      const body = JSON.parse(options.body);
      assert.equal(body.mcpSessionId, SESSION_ID);
      assert.equal(body.operationId, OPERATION_ID);
      assert.equal(body.correlationId, CORRELATION_ID);
      assert.deepEqual(body.request, {
        amountAtomic: '1000',
        assetId: 'dexter',
        maxSlippageBps: 50,
      });
      return jsonResponse(200, {
        status: 'prepared',
        requestId: OPERATION_ID,
        correlationId: CORRELATION_ID,
        replayed: false,
        intentId: INTENT_ID,
        planId: 'plan_0123456789abcdef',
        preparedPlanHash: 'a'.repeat(64),
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'prepared');
  assert.equal(result.operationId, OPERATION_ID);
  assert.equal(result.intentId, INTENT_ID);
  assert.equal(result.retry, 'same_operation_only');
  assert.deepEqual(result.execution, {
    signed: false,
    submitted: false,
    confirmed: false,
    transactionSignature: null,
    confirmationStatus: null,
    slot: null,
  });
});

test('same operation can replay, and a new UUID remains a distinct new order', async () => {
  const bodies = [];
  const fetchImpl = async (_url, options) => {
    bodies.push(options.body);
    return jsonResponse(200, {
      status: 'prepared',
      requestId: JSON.parse(options.body).operationId,
      correlationId: CORRELATION_ID,
      replayed: bodies.length === 2,
      intentId: INTENT_ID,
      planId: 'plan_0123456789abcdef',
      preparedPlanHash: 'b'.repeat(64),
    });
  };
  const common = {
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'prepare',
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl,
  };
  const order = {
    action: 'sell',
    assetId: 'backpack-spcx',
    amountAtomic: '1000',
  };

  await callGovernedAssetBackend({
    ...common,
    input: { operationId: OPERATION_ID, ...order },
  });
  await callGovernedAssetBackend({
    ...common,
    input: { operationId: OPERATION_ID, ...order },
  });
  await callGovernedAssetBackend({
    ...common,
    input: { operationId: NEW_OPERATION_ID, ...order },
  });

  assert.equal(bodies[0], bodies[1]);
  assert.notEqual(bodies[1], bodies[2]);
  assert.equal(JSON.parse(bodies[2]).operationId, NEW_OPERATION_ID);
});

test('network failure is never retried and execution becomes reconciliation-only unknown', async () => {
  let calls = 0;
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'execute',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      intentId: INTENT_ID,
      planId: 'plan_0123456789abcdef',
      preparedPlanHash: 'a'.repeat(64),
      authorizationId: '519f981c-9215-4141-84f2-d89ffe9cbece',
    },
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('secret upstream detail');
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'unknown');
  assert.equal(result.retry, 'reconcile_only');
  assert.doesNotMatch(JSON.stringify(result), /secret upstream detail/);
});

test('merchant 2xx or paid=true never substitutes for definitive chain confirmation', async () => {
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'execute',
    input: {
      operationId: OPERATION_ID,
      action: 'sell',
      intentId: INTENT_ID,
      planId: 'plan_0123456789abcdef',
      preparedPlanHash: 'a'.repeat(64),
      authorizationId: '519f981c-9215-4141-84f2-d89ffe9cbece',
    },
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, {
      status: 'confirmed',
      merchant_status: 200,
      paid: true,
    }),
  });

  assert.equal(result.status, 'unknown');
  assert.equal(result.execution.confirmed, false);
  assert.equal(result.retry, 'reconcile_only');
});

test('confirmed is emitted only with explicit chain confirmation evidence', async () => {
  const signature = '1'.repeat(64);
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'execute',
    input: {
      operationId: OPERATION_ID,
      action: 'send',
      intentId: INTENT_ID,
      planId: 'plan_0123456789abcdef',
      preparedPlanHash: 'a'.repeat(64),
      authorizationId: '519f981c-9215-4141-84f2-d89ffe9cbece',
    },
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, {
      status: 'confirmed',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      confirmation: {
        status: 'finalized',
        transactionSignature: signature,
        slot: 435_090_000,
      },
    }),
  });

  assert.equal(result.status, 'confirmed');
  assert.equal(result.execution.confirmed, true);
  assert.equal(result.execution.transactionSignature, signature);
  assert.equal(result.execution.confirmationStatus, 'finalized');
  assert.equal(result.retry, 'none');
});

test('successful prepare without exact operation and correlation echoes stays uncertain', async () => {
  const result = await callGovernedAssetBackend({
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'prepare',
    input: {
      operationId: OPERATION_ID,
      action: 'buy',
      assetId: 'dexter',
      amountAtomic: '1000',
    },
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
    fetchImpl: async () => jsonResponse(200, {
      status: 'prepared',
      requestId: OPERATION_ID,
      correlationId: NEW_OPERATION_ID,
      intentId: INTENT_ID,
      planId: 'plan_0123456789abcdef',
      preparedPlanHash: 'a'.repeat(64),
    }),
  });

  assert.equal(result.status, 'uncertain');
  assert.equal(result.retry, 'same_operation_only');
});

test('execute refusal is trusted only when the backend proves no signing or submission', async () => {
  const baseInput = {
    operationId: OPERATION_ID,
    action: 'buy',
    intentId: INTENT_ID,
    planId: 'plan_0123456789abcdef',
    preparedPlanHash: 'a'.repeat(64),
    authorizationId: '519f981c-9215-4141-84f2-d89ffe9cbece',
  };
  const common = {
    apiBase: 'https://api.dexter.test',
    secret: SECRET,
    phase: 'execute',
    input: baseInput,
    mcpSessionId: SESSION_ID,
    correlationId: CORRELATION_ID,
    now: NOW,
  };
  const refused = await callGovernedAssetBackend({
    ...common,
    fetchImpl: async () => jsonResponse(422, {
      status: 'refused',
      executed: false,
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      code: 'policy_refused',
      execution: { signed: false, submitted: false },
    }),
  });
  const ambiguous = await callGovernedAssetBackend({
    ...common,
    fetchImpl: async () => jsonResponse(422, {
      status: 'refused',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      code: 'policy_refused',
    }),
  });
  const mismatched = await callGovernedAssetBackend({
    ...common,
    fetchImpl: async () => jsonResponse(422, {
      status: 'refused',
      executed: false,
      operationId: NEW_OPERATION_ID,
      correlationId: CORRELATION_ID,
      code: 'policy_refused',
      execution: { signed: false, submitted: false, confirmed: false },
    }),
  });

  assert.equal(refused.status, 'refused');
  assert.equal(refused.retry, 'none');
  assert.equal(ambiguous.status, 'unknown');
  assert.equal(ambiguous.retry, 'reconcile_only');
  assert.equal(mismatched.status, 'unknown');
  assert.equal(mismatched.retry, 'reconcile_only');
});

test('caller authority fields are rejected before any backend request', async () => {
  let calls = 0;
  await assert.rejects(
    callGovernedAssetBackend({
      apiBase: 'https://api.dexter.test',
      secret: SECRET,
      phase: 'prepare',
      input: {
        operationId: OPERATION_ID,
        action: 'buy',
        assetId: 'dexter',
        amountAtomic: '1000',
        actor: 'owner',
      },
      mcpSessionId: SESSION_ID,
      correlationId: CORRELATION_ID,
      now: NOW,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(200, {});
      },
    }),
    /governed_authority_override_forbidden/,
  );
  assert.equal(calls, 0);
});
