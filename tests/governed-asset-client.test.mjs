import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  GOVERNED_BACKEND_AUTH_PURPOSE,
  buildGovernedBackendRequestAuth,
  callGovernedAssetBackend,
  normalizeGovernedBackendOrigin,
  verifyGovernedBackendRequestAuth,
} from '../lib/governed-asset-client.mjs';
import {
  buildGovernedAssetToolResult,
} from '../lib/governed-asset-result.mjs';

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

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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

test('same operation can replay, while a new UUID is only a distinct request identity', async () => {
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

test('backend origin is an exact bounded origin with insecure transport limited to loopback', () => {
  assert.equal(
    normalizeGovernedBackendOrigin('https://api.dexter.test/'),
    'https://api.dexter.test',
  );
  assert.equal(
    normalizeGovernedBackendOrigin('http://127.0.0.1:3030'),
    'http://127.0.0.1:3030',
  );
  assert.equal(
    normalizeGovernedBackendOrigin('http://localhost:3030/'),
    'http://localhost:3030',
  );

  for (const hostile of [
    'https://user:password@api.dexter.test',
    'https://api.dexter.test?target=https://attacker.test',
    'https://api.dexter.test#fragment',
    'https://api.dexter.test/internal',
    'https://api.dexter.test/%2e%2e/',
    'http://api.dexter.test',
    ' https://api.dexter.test',
    `https://api.dexter.test/${'a'.repeat(513)}`,
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

test('purpose-signed request refuses redirects and cannot leak HMAC headers', async () => {
  let calls = 0;
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
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.redirect, 'error');
      assert.match(options.headers['x-dexter-signature'], /^[a-f0-9]{64}$/);
      throw new Error('redirect mode prevented forwarding');
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.retry, 'same_operation_only');
});

test('built-in fetch never forwards signed headers to a hostile redirect target', async (t) => {
  let redirectedRequests = 0;
  let redirectedSignature = null;
  const redirectTarget = createServer((req, res) => {
    redirectedRequests += 1;
    redirectedSignature = req.headers['x-dexter-signature'] ?? null;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  const targetAddress = await listenLocal(redirectTarget);
  t.after(() => closeServer(redirectTarget));

  let originRequests = 0;
  const signedOrigin = createServer((req, res) => {
    originRequests += 1;
    assert.match(
      String(req.headers['x-dexter-signature'] || ''),
      /^[a-f0-9]{64}$/,
    );
    res.writeHead(307, {
      location: `http://127.0.0.1:${targetAddress.port}/steal`,
    });
    res.end();
  });
  const originAddress = await listenLocal(signedOrigin);
  t.after(() => closeServer(signedOrigin));

  const result = await callGovernedAssetBackend({
    apiBase: `http://127.0.0.1:${originAddress.port}`,
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
  });

  assert.equal(result.status, 'uncertain');
  assert.equal(result.retry, 'same_operation_only');
  assert.equal(originRequests, 1);
  assert.equal(redirectedRequests, 0);
  assert.equal(redirectedSignature, null);
});

test('hostile backend origins fail before constructing or sending a request', async () => {
  let calls = 0;
  for (const apiBase of [
    'https://attacker@api.dexter.test',
    'https://api.dexter.test/governed',
    'https://api.dexter.test?redirect=https://attacker.test',
  ]) {
    await assert.rejects(
      callGovernedAssetBackend({
        apiBase,
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
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(200, {});
        },
      }),
      /invalid_governed_backend_origin/,
    );
  }
  assert.equal(calls, 0);
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
  assert.equal(result.execution.confirmed, null);
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
      execution: { signed: false, submitted: false, confirmed: false },
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

test('execute approval-required needs exact proof that execution never started', async () => {
  const common = {
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
  };
  const baseResponse = {
    status: 'approval_required',
    operationId: OPERATION_ID,
    correlationId: CORRELATION_ID,
    code: 'approval_required',
  };
  const proven = await callGovernedAssetBackend({
    ...common,
    fetchImpl: async () => jsonResponse(409, {
      ...baseResponse,
      executed: false,
      execution: { signed: false, submitted: false, confirmed: false },
    }),
  });

  assert.equal(proven.status, 'approval_required');
  assert.equal(proven.retry, 'same_operation_only');
  assert.deepEqual(
    {
      signed: proven.execution.signed,
      submitted: proven.execution.submitted,
      confirmed: proven.execution.confirmed,
    },
    { signed: false, submitted: false, confirmed: false },
  );

  const forgedEvidence = [
    {},
    {
      executed: false,
    },
    {
      executed: false,
      execution: { signed: false, submitted: false },
    },
    {
      executed: false,
      execution: { signed: true, submitted: false, confirmed: false },
    },
    {
      executed: false,
      execution: { signed: false, submitted: true, confirmed: false },
    },
    {
      executed: false,
      execution: { signed: false, submitted: false, confirmed: true },
    },
    {
      executed: 'false',
      execution: { signed: false, submitted: false, confirmed: false },
    },
    {
      executed: false,
      execution: { signed: false, submitted: false, confirmed: 'false' },
    },
  ];

  for (const evidence of forgedEvidence) {
    const result = await callGovernedAssetBackend({
      ...common,
      fetchImpl: async () => jsonResponse(409, {
        ...baseResponse,
        ...evidence,
      }),
    });
    const toolResult = buildGovernedAssetToolResult(result);

    assert.equal(result.status, 'unknown', JSON.stringify(evidence));
    assert.equal(result.retry, 'reconcile_only', JSON.stringify(evidence));
    assert.notEqual(result.retry, 'same_operation_only', JSON.stringify(evidence));
    assert.deepEqual(
      {
        signed: result.execution.signed,
        submitted: result.execution.submitted,
        confirmed: result.execution.confirmed,
      },
      { signed: null, submitted: null, confirmed: null },
      JSON.stringify(evidence),
    );
    assert.equal(toolResult.isError, true, JSON.stringify(evidence));
    assert.match(result.explanation, /outcome is unknown/i);
  }
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

for (const httpStatus of [401, 500]) {
  test(`${httpStatus} cannot forge a prepared success`, async () => {
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
      fetchImpl: async () => jsonResponse(httpStatus, {
        status: 'prepared',
        operationId: OPERATION_ID,
        correlationId: CORRELATION_ID,
        intentId: INTENT_ID,
        planId: 'plan_0123456789abcdef',
        preparedPlanHash: 'a'.repeat(64),
      }),
    });

    assert.equal(result.status, 'uncertain');
    assert.equal(result.execution.signed, false);
  });
}

for (const httpStatus of [401, 500]) {
  for (const forgedStatus of ['signed', 'submitted', 'confirmed']) {
    test(`${httpStatus} cannot forge execute ${forgedStatus} success`, async () => {
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
        fetchImpl: async () => jsonResponse(httpStatus, {
          status: forgedStatus,
          operationId: OPERATION_ID,
          correlationId: CORRELATION_ID,
          signedWireHash: 'b'.repeat(64),
          transactionSignature: '1'.repeat(64),
          confirmation: {
            status: 'finalized',
            transactionSignature: '1'.repeat(64),
            slot: 435_090_000,
          },
        }),
      });

      assert.equal(result.status, 'unknown');
      assert.equal(result.execution.signed, null);
      assert.equal(result.execution.submitted, null);
      assert.equal(result.execution.confirmed, null);
      assert.equal(result.retry, 'reconcile_only');
    });
  }
}

test('backend prose and unknown codes can never relay credentials or internals', async () => {
  const secretText =
    'Authorization: Bearer private-token x-dexter-signature=private-signature '
    + 'https://api.dexter.test/internal?access_token=private /home/private/path';
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
    fetchImpl: async () => jsonResponse(422, {
      status: 'refused',
      operationId: OPERATION_ID,
      correlationId: CORRELATION_ID,
      code: 'https://api.dexter.test/internal?access_token=private',
      explanation: secretText,
      message: secretText,
      error: secretText,
    }),
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'governed_backend_response_unrecognized');
  assert.equal(
    result.explanation,
    'The backend returned an unrecognized bounded result.',
  );
  const visible = JSON.stringify(result);
  assert.doesNotMatch(
    visible,
    /private-token|private-signature|access_token|\/home\/private|api\.dexter\.test/,
  );
});
