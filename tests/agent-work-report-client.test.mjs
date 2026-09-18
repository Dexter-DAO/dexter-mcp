import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {
  AGENT_WORK_REPORT_INPUT_SCHEMA,
  AGENT_WORK_REPORT_OUTPUT_SCHEMA,
  AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA,
  AGENT_WORK_REPORT_TOOL_NAME,
} from '../lib/agent-work-report-contract.mjs';
import { buildAgentWorkReportLocalError, callAgentWorkReportBackend } from '../lib/agent-work-report-client.mjs';
import { GOVERNED_AGENT_API_PROFILE } from '../lib/governed-asset-backend-profile.mjs';

const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const OTHER_ID = '319f981c-9215-4141-84f2-d89ffe9cbece';
const SECRET = ' work-report-test-secret-at-least-thirty-two-bytes ';
const SESSION = 'mcp-session-agent-work-0001';
const NOW = Date.parse('2026-09-18T05:15:00.000Z');
const PATH = '/api/passkey-vault/agents/self/work';
const INPUT = { operationId: OPERATION_ID, expectedRevision: 0, state: 'working', summary: 'Reviewing deployment logs' };

function acknowledgment(input = INPUT, overrides = {}) {
  return {
    namespace: 'dexter-agent-work-report-ack/v1', operationId: input.operationId, replayed: false,
    report: {
      reportId: input.operationId, revision: (input.expectedRevision ?? 0) + 1,
      state: input.state, summary: input.summary ?? null, source: 'agent_report',
      observedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + (input.ttlSeconds ?? 300) * 1_000).toISOString(),
    },
    ...overrides,
  };
}

function apiError(code, overrides = {}) {
  const unavailable = code === 'agent_work_store_unavailable';
  return {
    namespace: 'dexter-agent-work-report-error/v1', code, operationId: OPERATION_ID,
    retryable: unavailable, retryWithSameOperationOnly: unavailable,
    currentRevision: null, currentReport: null, ...overrides,
  };
}

function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function call(options = {}) {
  return callAgentWorkReportBackend({ apiBase: 'https://api.dexter.cash/', secret: SECRET,
    input: INPUT, mcpSessionId: SESSION, now: NOW,
    fetchImpl: async () => jsonResponse(200, acknowledgment()), ...options });
}

function assertLocal(result, code) {
  assert.equal(result.namespace, 'opendexter-agent-work-report-local-error/v1');
  assert.equal(result.operationId, OPERATION_ID);
  assert.equal(result.code, code);
  assert.equal(result.retryWithSameOperationOnly, true);
  assert.equal(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(result).success, true);
}

test('work report schemas expose a strict acknowledgment and keep trading routes unchanged', () => {
  assert.equal(AGENT_WORK_REPORT_TOOL_NAME, 'dexter_report_work');
  assert.equal(normalizeObjectSchema(AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA), AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA);
  assert.deepEqual(Object.keys(GOVERNED_AGENT_API_PROFILE.routes), ['prepare', 'execute', 'status', 'reconcile', 'history']);
  assert.equal(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(acknowledgment()).success, true);
  assert.equal(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse({ ...acknowledgment(), balance: '100' }).success, false);
});

test('input defaults revision and idle summary while preserving requested TTL absence', () => {
  const idle = AGENT_WORK_REPORT_INPUT_SCHEMA.parse({ operationId: OPERATION_ID, state: 'idle' });
  assert.deepEqual(idle, { operationId: OPERATION_ID, expectedRevision: 0, state: 'idle', summary: null });
  assert.equal(Object.hasOwn(idle, 'ttlSeconds'), false);
  assert.deepEqual(AGENT_WORK_REPORT_INPUT_SCHEMA.parse({ ...idle, summary: null }), idle);
  assert.equal(AGENT_WORK_REPORT_INPUT_SCHEMA.parse({ ...INPUT, summary: '部署を確認中' }).summary, '部署を確認中');
  assert.equal(AGENT_WORK_REPORT_INPUT_SCHEMA.parse({ ...INPUT, state: 'idle' }).summary, INPUT.summary);
});

for (const [name, input] of [
  ['leading whitespace', { ...INPUT, summary: ' padded' }],
  ['trailing whitespace', { ...INPUT, summary: 'padded ' }],
  ['empty summary', { ...INPUT, summary: '' }],
  ['oversize summary', { ...INPUT, summary: 'x'.repeat(201) }],
  ['newline', { ...INPUT, summary: 'line\nline' }],
  ['tab', { ...INPUT, summary: 'line\tline' }],
  ['C1 control', { ...INPUT, summary: 'line\u0085line' }],
  ['Unicode separator', { ...INPUT, summary: 'line\u2028line' }],
  ['null working summary', { ...INPUT, summary: null }],
  ['missing working summary', { operationId: OPERATION_ID, state: 'working' }],
  ['blank idle summary', { ...INPUT, state: 'idle', summary: '' }],
  ['negative revision', { ...INPUT, expectedRevision: -1 }],
  ['fractional revision', { ...INPUT, expectedRevision: 0.5 }],
  ['unsafe revision', { ...INPUT, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }],
  ['null TTL', { ...INPUT, ttlSeconds: null }],
  ['short TTL', { ...INPUT, ttlSeconds: 29 }],
  ['long TTL', { ...INPUT, ttlSeconds: 901 }],
  ['fractional TTL', { ...INPUT, ttlSeconds: 30.5 }],
  ['invalid operation ID', { ...INPUT, operationId: 'report-operation-001' }],
  ['unsupported state', { ...INPUT, state: 'executed' }],
  ...['agentId', 'vaultPda', 'userId', 'mcpSessionId', 'grantId', 'balance', 'credential', 'session', 'wallet'].map((key) => [key, { ...INPUT, [key]: OTHER_ID }]),
]) {
  test('rejects ' + name + ' before any request', async () => {
    let calls = 0;
    await assert.rejects(call({ input, fetchImpl: async () => { calls += 1; throw new Error('unexpected fetch'); } }));
    assert.equal(calls, 0);
  });
}

test('fixed URL and signed transcript match the existing API HMAC contract', async () => {
  let calls = 0;
  const result = await call({ fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, `https://api.dexter.cash${PATH}`);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), INPUT);
    assert.equal(Object.hasOwn(JSON.parse(options.body), 'ttlSeconds'), false);
    assert.equal(options.headers['idempotency-key'], OPERATION_ID);
    assert.equal(options.headers['mcp-session-id'], SESSION);
    assert.equal(options.headers['x-internal-timestamp'], String(NOW));
    // Independently reconstruct the transcript used by the API's
    // verifyGovernedRuntimeBinding, including its sorted canonical body.
    const canonicalBody = `{"expectedRevision":0,"operationId":"${OPERATION_ID}","state":"working","summary":"Reviewing deployment logs"}`;
    const digest = createHash('sha256').update(canonicalBody).digest('hex');
    const transcript = ['dexter-governed-agent-internal/v1', String(NOW), SESSION, 'POST', PATH, OPERATION_ID, digest].join('\n');
    const expected = createHmac('sha256', SECRET.trim()).update(transcript, 'utf8').digest('hex');
    assert.equal(options.headers['x-internal-signature'], expected);
    assert.deepEqual(Object.keys(options.headers).sort(), ['content-type', 'idempotency-key', 'mcp-session-id', 'x-internal-signature', 'x-internal-timestamp']);
    return jsonResponse(200, acknowledgment());
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, acknowledgment());
});

test('explicit default TTL has a different durable body and HMAC from absent TTL', async () => {
  const requests = [];
  for (const input of [INPUT, { ...INPUT, ttlSeconds: 300 }]) {
    await call({ input, fetchImpl: async (_url, options) => {
      requests.push(options);
      return jsonResponse(200, acknowledgment(input));
    } });
  }
  assert.notEqual(requests[0].body, requests[1].body);
  assert.notEqual(requests[0].headers['x-internal-signature'], requests[1].headers['x-internal-signature']);
});

test('idle absence and null yield the same normalized signed request', async () => {
  const requests = [];
  for (const input of [{ operationId: OPERATION_ID, state: 'idle' }, { operationId: OPERATION_ID, state: 'idle', summary: null }]) {
    const result = await call({ input, fetchImpl: async (_url, options) => {
      requests.push(options);
      return jsonResponse(200, acknowledgment(input));
    } });
    assert.equal(result.report.summary, null);
  }
  assert.equal(requests[0].body, requests[1].body);
  assert.deepEqual(requests[0].headers, requests[1].headers);
});

test('lost acknowledgment preserves one operation and returns the original expiry on an identical retry', async () => {
  const requests = [];
  let saved;
  const fetchImpl = async (_url, options) => {
    requests.push(options);
    if (!saved) {
      saved = acknowledgment();
      throw new Error('acknowledgment lost after commit');
    }
    return jsonResponse(200, { ...saved, replayed: true });
  };
  const first = await call({ fetchImpl });
  assertLocal(first, 'transport_failed');
  assert.equal(requests.length, 1);
  const replay = await call({ fetchImpl, now: NOW + 600_000 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].headers['idempotency-key'], requests[1].headers['idempotency-key']);
  assert.deepEqual(replay, { ...saved, replayed: true });
  assert.ok(Date.parse(replay.report.expiresAt) < NOW + 600_000);
});

test('timeout returns same-operation recovery after exactly one request', async () => {
  let calls = 0;
  let signal;
  const result = await call({ timeoutMs: 5, fetchImpl: async (_url, options) => {
    calls += 1;
    signal = options.signal;
    return new Promise(() => {});
  } });
  assertLocal(result, 'transport_failed');
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

for (const [code, status] of [
  ['agent_work_invalid_request', 400],
  ['agent_work_runtime_auth_invalid', 401],
  ['agent_work_identity_invalid', 403],
  ['agent_work_idempotency_conflict', 409],
  ['agent_work_store_unavailable', 503],
]) {
  test('accepts exact API error ' + code + ' without retrying', async () => {
    const body = apiError(code);
    let calls = 0;
    const result = await call({ fetchImpl: async () => { calls += 1; return jsonResponse(status, body); } });
    assert.equal(calls, 1);
    assert.deepEqual(result, body);
    assert.equal(result.retryable, status === 503);
  });
}

test('API null operation ID remains null as server evidence', async () => {
  const body = apiError('agent_work_runtime_auth_invalid', { operationId: null });
  assert.deepEqual(await call({ fetchImpl: async () => jsonResponse(401, body) }), body);
});

test('stale revision returns the current report without overwriting or retrying', async () => {
  const current = acknowledgment({ ...INPUT, operationId: OTHER_ID, expectedRevision: 4, state: 'blocked', summary: 'Waiting for source access' }).report;
  const body = apiError('agent_work_revision_conflict', { currentRevision: 5, currentReport: current });
  let calls = 0;
  const result = await call({ input: { ...INPUT, expectedRevision: 3 }, fetchImpl: async () => { calls += 1; return jsonResponse(409, body); } });
  assert.deepEqual(result, body);
  assert.equal(calls, 1);
});

test('positive expected revision may conflict with no prior report', async () => {
  const body = apiError('agent_work_revision_conflict', { currentRevision: 0 });
  assert.deepEqual(await call({ input: { ...INPUT, expectedRevision: 5 }, fetchImpl: async () => jsonResponse(409, body) }), body);
});

for (const [name, mutate, status = 200] of [
  ['operation ID mismatch', (body) => { body.operationId = OTHER_ID; }],
  ['report ID mismatch', (body) => { body.report.reportId = OTHER_ID; }],
  ['different summary', (body) => { body.report.summary = 'Different report'; }],
  ['different state', (body) => { body.report.state = 'completed'; }],
  ['different revision', (body) => { body.report.revision = 3; }],
  ['zero revision', (body) => { body.report.revision = 0; }],
  ['invalid timestamp', (body) => { body.report.observedAt = 'yesterday'; }],
  ['expiry before receipt', (body) => { body.report.expiresAt = new Date(NOW - 1_000).toISOString(); }],
  ['expiry too long', (body) => { body.report.expiresAt = new Date(NOW + 901_000).toISOString(); }],
  ['fractional TTL', (body) => { body.report.expiresAt = new Date(NOW + 300_001).toISOString(); }],
  ['future receipt', (body) => { body.report.observedAt = new Date(NOW + 301_000).toISOString(); body.report.expiresAt = new Date(NOW + 601_000).toISOString(); }],
  ['fake fill', (body) => { body.report.actual = { received: '1' }; }],
  ['fake balance', (body) => { body.balance = '100'; }],
  ['fake grant', (body) => { body.grant = { enabled: true }; }],
  ['unknown source', (body) => { body.report.source = 'verified_execution'; }],
  ['unknown namespace', (body) => { body.namespace = 'other/v1'; }],
  ['acknowledgment on HTTP201', () => {}, 201],
  ['acknowledgment on HTTP503', () => {}, 503],
]) {
  test('rejects malformed response: ' + name, async () => {
    const body = acknowledgment();
    mutate(body);
    assertLocal(await call({ fetchImpl: async () => jsonResponse(status, body) }), 'response_invalid');
  });
}

test('explicit TTL must match the accepted report duration', async () => {
  assertLocal(await call({ input: { ...INPUT, ttlSeconds: 60 } }), 'response_invalid');
  assertLocal(await call({ input: { ...INPUT, ttlSeconds: 60 },
    fetchImpl: async () => jsonResponse(200, acknowledgment(INPUT, { replayed: true })) }), 'response_invalid');
});

test('omitted TTL requires 300 seconds for a fresh acknowledgment but preserves an earlier default on replay', async () => {
  const body = acknowledgment({ ...INPUT, ttlSeconds: 60 });
  assertLocal(await call({ fetchImpl: async () => jsonResponse(200, body) }), 'response_invalid');
  body.replayed = true;
  assert.deepEqual(await call({ now: NOW + 600_000, fetchImpl: async () => jsonResponse(200, body) }), body);
});

for (const [name, body, status] of [
  ['wrong HTTP code', apiError('agent_work_store_unavailable'), 409],
  ['wrong operation ID', apiError('agent_work_store_unavailable', { operationId: OTHER_ID }), 503],
  ['retryable invalid request', apiError('agent_work_invalid_request', { retryable: true }), 400],
  ['store failure without same-operation restriction', apiError('agent_work_store_unavailable', { retryWithSameOperationOnly: false }), 503],
  ['null conflict revision', apiError('agent_work_revision_conflict'), 409],
  ['zero conflict with report', apiError('agent_work_revision_conflict', { currentRevision: 0, currentReport: acknowledgment().report }), 409],
  ['positive conflict without report', apiError('agent_work_revision_conflict', { currentRevision: 5 }), 409],
  ['mismatched conflict revision', apiError('agent_work_revision_conflict', { currentRevision: 5, currentReport: acknowledgment().report }), 409],
  ['conflict at expected revision', apiError('agent_work_revision_conflict', { currentRevision: 0 }), 409],
  ['report on other error', apiError('agent_work_identity_invalid', { currentRevision: 1, currentReport: acknowledgment().report }), 403],
  ['remote local-error impersonation', buildAgentWorkReportLocalError({ input: INPUT, code: 'transport_failed' }), 503],
]) {
  test('rejects inconsistent error: ' + name, async () => {
    assertLocal(await call({ fetchImpl: async () => jsonResponse(status, body) }), 'response_invalid');
  });
}

test('429 remains a local error and bounds Retry-After parsing', async () => {
  for (const [header, delay] of [['7', 7_000], [new Date(NOW + 9_000).toUTCString(), 9_000], ['99999999', null], ['1.2', null], ['-1', null], ['tomorrow', null]]) {
    const result = await call({ fetchImpl: async () => new Response('ingress throttled', { status: 429, headers: { 'retry-after': header } }) });
    assertLocal(result, 'rate_limited');
    assert.equal(result.retryAfterMs, delay);
  }
});

test('redirects, malformed JSON and bounded response failures retain the operation', async () => {
  for (const fetchImpl of [
    async () => null,
    async () => undefined,
    async () => 'unknown response',
    async () => ({ status: '200' }),
    async () => new Response('', { status: 302, headers: { location: 'https://other.example/' } }),
    async () => ({ redirected: true, status: 200 }),
    async () => ({ url: 'https://other.example/', status: 200 }),
    async () => new Response('{', { status: 200 }),
    async () => new Response('x'.repeat(16 * 1_024 + 1), { status: 200 }),
    async () => new Response('{}', { status: 200, headers: { 'content-length': '100000' } }),
  ]) {
    assertLocal(await call({ fetchImpl }), 'response_invalid');
  }
});

test('configuration failures happen before fetch and can be returned distinctly by the handler', async () => {
  for (const options of [
    { apiBase: 'https://api.dexter.cash/api' }, { apiBase: 'https://user:password@api.dexter.cash' },
    { apiBase: 'http://external.example' }, { secret: 'short' }, { mcpSessionId: 'bad session' },
    { now: 1 }, { timeoutMs: 0 }, { timeoutMs: 30_001 },
  ]) {
    let calls = 0;
    await assert.rejects(call({ ...options, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } }));
    assert.equal(calls, 0);
  }
  const error = buildAgentWorkReportLocalError({ input: INPUT, code: 'configuration_unavailable' });
  assertLocal(error, 'configuration_unavailable');
  assert.equal(error.retryable, false);
  assert.equal(error.retryAfterMs, null);
});
