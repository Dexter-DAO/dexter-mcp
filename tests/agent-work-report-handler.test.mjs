import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import {
  AGENT_WORK_REPORT_TOOL_NAME,
  AGENT_WORK_REPORT_INPUT_SCHEMA,
  AGENT_WORK_REPORT_OUTPUT_SCHEMA,
  AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA,
} from '../lib/agent-work-report-contract.mjs';
import { buildAgentWorkReportLocalError, callAgentWorkReportBackend } from '../lib/agent-work-report-client.mjs';
import { buildAgentWorkReportModelResult } from '../lib/agent-work-report-result.mjs';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
import { extractMcpSessionId } from '../lib/mcp-session-id.mjs';
import {
  registerOpenTool,
  buildVaultAuthenticationRequired,
  vaultAuthenticationResult,
  VAULT_WWW_AUTHENTICATE,
} from '../lib/open-tool-auth.mjs';
import {
  installOpenToolContracts,
  finalizeOpenToolContracts,
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';

const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const OTHER_ID = '319f981c-9215-4141-84f2-d89ffe9cbece';
const SESSION_ID = 'work-report-session-fixture';
const SECRET = 'work-report-handler-fixture-secret-32-bytes';
const INPUT = {
  operationId: OPERATION_ID,
  expectedRevision: 0,
  state: 'working',
  summary: 'Reviewing deployment logs',
};
const OBSERVED_AT = '2026-09-18T05:15:00.000Z';
const EXPIRES_AT = '2026-09-18T05:20:00.000Z';
const REQUEST_TIME = Date.parse(OBSERVED_AT);
const CREDENTIAL_SUMMARIES = [
  ['OpenDexter token', 'Checking open_abcdefghijklmnopqrstuvwx'],
  ['connection token', 'Checking dlt_0123456789abcdef0123456789abcdef'],
  ['Bearer token', 'Bearer synthetic-credential-not-real'],
  ['credential query', 'https://example.test/?access_token=synthetic-not-real'],
];
const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const handlerStart = source.indexOf('async function agentWorkReport(');
const handlerEnd = source.indexOf('async function governedAssetAction(', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
const registrationStart = source.indexOf('  registerOpenTool(server, AGENT_WORK_REPORT_TOOL_NAME,');
const registrationEnd = source.indexOf('\n\n', registrationStart);
assert.ok(registrationStart >= 0 && registrationEnd > registrationStart);

function acknowledgment(input = INPUT, changes = {}) {
  return {
    namespace: 'dexter-agent-work-report-ack/v1',
    operationId: input.operationId,
    replayed: false,
    report: {
      reportId: input.operationId,
      revision: input.expectedRevision + 1,
      state: input.state,
      summary: input.summary ?? null,
      source: 'agent_report',
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    },
    ...changes,
  };
}

function apiError(code, changes = {}) {
  const unavailable = code === 'agent_work_store_unavailable';
  return {
    namespace: 'dexter-agent-work-report-error/v1',
    code,
    retryable: unavailable,
    operationId: OPERATION_ID,
    retryWithSameOperationOnly: unavailable,
    currentRevision: null,
    currentReport: null,
    ...changes,
  };
}

async function connect(t, { backendResult, backendError, backendOverride, sessionId = SESSION_ID, mutateResult } = {}) {
  const backendCalls = [];
  let unrelatedCalls = 0;
  const unexpectedCall = () => { unrelatedCalls += 1; throw new Error('unrelated_tool_called'); };
  const handler = runInNewContext(`${source.slice(handlerStart, handlerEnd)}; agentWorkReport`, {
    AGENT_WORK_REPORT_TOOL_NAME,
    API_BASE_FALLBACK: 'https://api.example.invalid',
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: SECRET,
    extractMcpSessionId,
    buildVaultAuthenticationRequired,
    vaultAuthenticationResult,
    buildAgentWorkReportLocalError,
    buildAgentWorkReportModelResult,
    callGovernedAssetBackend: unexpectedCall,
    resolveOpenSession: unexpectedCall,
    callAgentWorkReportBackend: async (args) => {
      backendCalls.push(args);
      if (backendError) throw backendError;
      if (backendOverride) return backendOverride(args);
      return structuredClone(backendResult ?? acknowledgment(args.input));
    },
  });
  const server = new McpServer({ name: 'agent-work-report-server-test', version: '1.0.0' });
  installOpenToolContracts(server);
  let registered;
  runInNewContext(source.slice(registrationStart, registrationEnd), {
    server,
    AGENT_WORK_REPORT_TOOL_NAME,
    AGENT_WORK_REPORT_INPUT_SCHEMA,
    agentWorkReport: mutateResult
      ? async (...args) => mutateResult(await handler(...args))
      : handler,
    registerOpenTool: (...args) => { registered = registerOpenTool(...args); },
  });
  for (const name of OPEN_TOOL_NAMES.filter((name) => name !== AGENT_WORK_REPORT_TOOL_NAME)) {
    registerOpenTool(server, name, { inputSchema: {} }, unexpectedCall);
  }
  finalizeOpenToolContracts(server);
  assert.equal(registered.outputSchema, AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA);
  assert.equal(normalizeObjectSchema(registered.outputSchema), registered.outputSchema);
  assert.equal(OPEN_TOOL_CONTRACTS[AGENT_WORK_REPORT_TOOL_NAME].outputSchema, AGENT_WORK_REPORT_OUTPUT_SCHEMA);
  const client = new Client({ name: 'agent-work-report-client-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  if (sessionId !== null) serverTransport.sessionId = sessionId;
  t.after(async () => {
    await client.close();
    await server.close();
    assert.equal(unrelatedCalls, 0, 'reporting never dispatches another tool or a spending session helper');
  });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = (await client.listTools()).tools.find((tool) => tool.name === AGENT_WORK_REPORT_TOOL_NAME);
  assert.ok(listed);
  const validateOutput = new AjvJsonSchemaValidator().getValidator(listed.outputSchema);
  return {
    listed,
    backendCalls,
    call: (input = INPUT) => client.callTool({ name: AGENT_WORK_REPORT_TOOL_NAME, arguments: input }),
    assertOutput(result, expected, requestOperationId = OPERATION_ID) {
      assert.deepEqual(result.structuredContent, expected);
      assert.equal(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(result.structuredContent).success, true);
      const validation = validateOutput(result.structuredContent);
      assert.equal(validation.valid, true, validation.errorMessage);
      assert.equal(result._meta['dexter/agentWorkReportRequest'].operationId, requestOperationId);
      assert.equal(result._meta['dexter/toolInvocation'].toolName, AGENT_WORK_REPORT_TOOL_NAME);
    },
  };
}

test('actual registration advertises strict report inputs and all three output branches', async (t) => {
  const { listed } = await connect(t);
  assert.equal(listed.inputSchema.type, 'object');
  assert.equal(listed.inputSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(listed.inputSchema.properties).sort(),
    ['operationId', 'expectedRevision', 'state', 'summary', 'ttlSeconds'].sort());
  assert.equal(listed.inputSchema.properties.expectedRevision.default, 0);
  assert.equal(listed.outputSchema.type, 'object');
  assert.equal(listed.outputSchema.anyOf.length, 3);
  assert.deepEqual(listed.outputSchema.anyOf.map((branch) => branch.properties.namespace.const), [
    'dexter-agent-work-report-ack/v1',
    'dexter-agent-work-report-error/v1',
    'opendexter-agent-work-report-local-error/v1',
  ]);
  for (const branch of listed.outputSchema.anyOf) assert.equal(branch.additionalProperties, false);
  assert.deepEqual(listed._meta.securitySchemes, [{ type: 'oauth2', scopes: ['vault'] }]);
  assert.deepEqual(listed._meta.ui.visibility, ['model']);
  assert.equal(listed._meta['openai/widgetAccessible'], false);
  assert.deepEqual(listed.annotations, {
    readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
  });
});

test('SDK applies first-report defaults and handler uses the transport session', async (t) => {
  const sdk = await connect(t);
  const { expectedRevision, ...input } = INPUT;
  const result = await sdk.call(input);
  assert.equal(result.isError, false);
  sdk.assertOutput(result, acknowledgment());
  assert.equal(sdk.backendCalls.length, 1);
  assert.deepEqual(sdk.backendCalls[0].input, INPUT);
  assert.equal(sdk.backendCalls[0].mcpSessionId, SESSION_ID);
  assert.equal(sdk.backendCalls[0].apiBase, 'https://api.example.invalid');
  assert.equal(Object.hasOwn(sdk.backendCalls[0].input, 'ttlSeconds'), false);
  assert.match(result.content[0].text, /Work report saved/);
  assert.match(result.content[0].text, /Agent-reported state: working/);
  assert.match(result.content[0].text, /Financial outcomes remain in their transaction receipts/);
});

test('SDK normalizes idle without inventing a server receipt timestamp or TTL', async (t) => {
  const sdk = await connect(t);
  const input = { operationId: OPERATION_ID, state: 'idle' };
  const result = await sdk.call(input);
  const normalized = { ...input, expectedRevision: 0, summary: null };
  assert.deepEqual(sdk.backendCalls[0].input, normalized);
  sdk.assertOutput(result, acknowledgment(normalized));
});

function assertSignedRequest({ url, options }, expectedInput, requestTime = REQUEST_TIME) {
  const path = '/api/passkey-vault/agents/self/work';
  assert.equal(url, `https://api.example.invalid${path}`);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['mcp-session-id'], SESSION_ID);
  assert.equal(options.headers['idempotency-key'], expectedInput.operationId);
  assert.equal(options.headers['x-internal-timestamp'], String(requestTime));
  assert.equal(options.body, JSON.stringify(expectedInput));
  assert.equal(Object.hasOwn(JSON.parse(options.body), 'ttlSeconds'), false);
  const transcript = [
    'dexter-governed-agent-internal/v1', String(requestTime), SESSION_ID,
    'POST', path, expectedInput.operationId, canonicalHash(expectedInput),
  ].join('\n');
  assert.equal(options.headers['x-internal-signature'],
    createHmac('sha256', SECRET).update(transcript, 'utf8').digest('hex'));
}

test('SDK idle report passes through the handler and signed client to an HTTP acknowledgment', async (t) => {
  const input = { operationId: OPERATION_ID, state: 'idle' };
  const normalized = { operationId: OPERATION_ID, expectedRevision: 0, state: 'idle', summary: null };
  const body = acknowledgment(normalized);
  const requests = [];
  const sdk = await connect(t, {
    backendOverride: (args) => callAgentWorkReportBackend({ ...args, now: REQUEST_TIME,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return Response.json(body, { status: 200 });
      },
    }),
  });
  const result = await sdk.call(input);
  sdk.assertOutput(result, body);
  assert.equal(result.isError, false);
  assert.equal(sdk.backendCalls.length, 1);
  assert.equal(requests.length, 1);
  assertSignedRequest(requests[0], normalized);
});

test('SDK preserves a typed HTTP persistence error through the actual signed client', async (t) => {
  const body = apiError('agent_work_store_unavailable');
  const requests = [];
  const sdk = await connect(t, {
    backendOverride: (args) => callAgentWorkReportBackend({ ...args, now: REQUEST_TIME,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return Response.json(body, { status: 503 });
      },
    }),
  });
  const result = await sdk.call();
  sdk.assertOutput(result, body);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /same operationId and identical content/);
  assert.equal(requests.length, 1);
  assertSignedRequest(requests[0], INPUT);
});

test('a lost HTTP response recovers through the same SDK operation and original acknowledgment', async (t) => {
  const requests = [];
  const recovered = acknowledgment(INPUT, { replayed: true });
  const sdk = await connect(t, {
    backendOverride: (args) => callAgentWorkReportBackend({ ...args, now: REQUEST_TIME,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (requests.length === 1) throw new Error('simulated_response_loss_after_acceptance');
        return Response.json(recovered, { status: 200 });
      },
    }),
  });
  const lost = await sdk.call();
  sdk.assertOutput(lost, buildAgentWorkReportLocalError({ input: INPUT, code: 'transport_failed' }));
  assert.equal(lost.isError, true);
  assert.match(lost.content[0].text, /same operationId and identical content/);
  assert.equal(requests.length, 1, 'the client does not retry an uncertain write');
  assertSignedRequest(requests[0], INPUT);
  const result = await sdk.call();
  sdk.assertOutput(result, recovered);
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /Original work report recovered/);
  assert.equal(requests.length, 2);
  assertSignedRequest(requests[1], INPUT);
  assert.equal(requests[1].options.body, requests[0].options.body);
  assert.equal(sdk.backendCalls.length, 2);
});

for (const state of ['waiting', 'blocked', 'completed', 'failed']) {
  test(`SDK retains ${state} as a self-reported state`, async (t) => {
    const sdk = await connect(t);
    const input = { ...INPUT, state };
    const result = await sdk.call(input);
    sdk.assertOutput(result, acknowledgment(input));
    assert.match(result.content[0].text, new RegExp(`Agent-reported state: ${state}`));
    assert.match(result.content[0].text, /Financial outcomes remain in their transaction receipts/);
  });
}

test('replay preserves the original ID and timestamps through result policy', async (t) => {
  const body = acknowledgment(INPUT, { replayed: true });
  const sdk = await connect(t, { backendResult: body });
  const result = await sdk.call();
  sdk.assertOutput(result, body);
  assert.equal(result.structuredContent.report.reportId, OPERATION_ID);
  assert.equal(result.structuredContent.report.observedAt, OBSERVED_AT);
  assert.equal(result.structuredContent.report.expiresAt, EXPIRES_AT);
  assert.match(result.content[0].text, /Original work report recovered/);
  assert.match(result.content[0].text, /newer report may already be current/);
  assert.equal(sdk.backendCalls.length, 1);
});

test('missing transport session returns the existing protocol authentication challenge', async (t) => {
  const sdk = await connect(t, { sessionId: null });
  const result = await sdk.call();
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.deepEqual(result._meta['mcp/www_authenticate'], [VAULT_WWW_AUTHENTICATE]);
  assert.match(result.content[0].text, /authentication_required/);
  assert.match(result.content[0].text, /no_mcp_session/);
  assert.equal(sdk.backendCalls.length, 0);
});

for (const [field, value] of Object.entries({
  agentId: OTHER_ID, agent_id: OTHER_ID, vaultPda: 'caller-selected-vault',
  vault_pda: 'caller-selected-vault', userId: OTHER_ID, user_id: OTHER_ID,
  credential: 'caller-credential', sessionId: 'caller-session', mcpSessionId: 'caller-session',
  observedAt: OBSERVED_AT, expiresAt: EXPIRES_AT, source: 'governed_dispatch',
})) {
  test(`SDK rejects caller-selected ${field} before the handler reaches the backend`, async (t) => {
    const sdk = await connect(t);
    const result = await sdk.call({ ...INPUT, [field]: value });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.equal(sdk.backendCalls.length, 0);
  });
}

test('SDK enforces state and summary refinements before backend dispatch', async (t) => {
  const sdk = await connect(t);
  for (const input of [
    { ...INPUT, summary: null }, { ...INPUT, summary: ' padded' },
    { ...INPUT, summary: 'two\nlines' }, { ...INPUT, summary: 'a'.repeat(201) },
    { ...INPUT, expectedRevision: -1 }, { ...INPUT, state: 'confirmed' },
    { ...INPUT, ttlSeconds: 901 },
  ]) {
    const result = await sdk.call(input);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
  }
  assert.equal(sdk.backendCalls.length, 0);
});

for (const code of [
  'agent_work_invalid_request', 'agent_work_runtime_auth_invalid',
  'agent_work_identity_invalid', 'agent_work_idempotency_conflict', 'agent_work_store_unavailable',
]) {
  test(`SDK retains the ordinary structured ${code} error`, async (t) => {
    const body = apiError(code);
    const sdk = await connect(t, { backendResult: body });
    const result = await sdk.call();
    assert.equal(result.isError, true);
    sdk.assertOutput(result, body);
    assert.equal(sdk.backendCalls.length, 1);
    if (code === 'agent_work_store_unavailable') {
      assert.match(result.content[0].text, /same operationId and identical content/);
    }
  });
}

for (const currentRevision of [0, 2]) {
  test(`revision conflict with current revision ${currentRevision} preserves a deliberate update choice`, async (t) => {
    const currentReport = currentRevision === 0 ? null
      : { ...acknowledgment().report, reportId: OTHER_ID, revision: currentRevision };
    const body = apiError('agent_work_revision_conflict', { currentRevision, currentReport });
    const sdk = await connect(t, { backendResult: body });
    const result = await sdk.call({ ...INPUT, expectedRevision: 1 });
    sdk.assertOutput(result, body);
    assert.equal(result.isError, true);
    assert.equal(sdk.backendCalls.length, 1);
    assert.match(result.content[0].text, /currentReport and currentRevision/);
    assert.match(result.content[0].text, /deliberately with a new operationId and that revision/);
  });
}

for (const summary of ['Reviewing ops@example.test inbox', 'Reviewing /home/branchmanager/worktree logs']) {
  test(`revision conflict preserves report text: ${summary}`, async (t) => {
    const currentReport = { ...acknowledgment().report, reportId: OTHER_ID, revision: 2, summary };
    const body = apiError('agent_work_revision_conflict', { currentRevision: 2, currentReport });
    const sdk = await connect(t, { backendResult: body });
    const result = await sdk.call();
    sdk.assertOutput(result, body);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /currentReport and currentRevision/);
    assert.equal(sdk.backendCalls.length, 1);
  });
}

for (const [label, summary] of CREDENTIAL_SUMMARIES) {
  test(`${label} in a conflicting report retains the original request recovery ID`, async (t) => {
    const currentReport = { ...acknowledgment().report, reportId: OTHER_ID, revision: 2, summary };
    const body = apiError('agent_work_revision_conflict', { currentRevision: 2, currentReport });
    const sdk = await connect(t, { backendResult: body });
    const result = await sdk.call();
    sdk.assertOutput(result, buildAgentWorkReportLocalError({ input: INPUT, code: 'response_invalid' }));
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /same operationId and identical content/);
    assert.doesNotMatch(JSON.stringify(result), /open_abcdefghijklmnopqrstuvwx|dlt_0123456789abcdef|synthetic-(?:credential-)?not-real/);
    assert.equal(sdk.backendCalls.length, 1);
  });
}

test('an API error with a null operation ID retains the original request handle privately', async (t) => {
  const body = apiError('agent_work_runtime_auth_invalid', { operationId: null });
  const sdk = await connect(t, { backendResult: body });
  sdk.assertOutput(await sdk.call(), body);
  assert.equal(sdk.backendCalls.length, 1);
});

for (const code of ['transport_failed', 'response_invalid', 'rate_limited', 'configuration_unavailable']) {
  test(`SDK retains same-operation recovery for ${code}`, async (t) => {
    const body = buildAgentWorkReportLocalError({ input: INPUT, code,
      retryAfterMs: code === 'rate_limited' ? 2_000 : null });
    const sdk = await connect(t, { backendResult: body });
    const result = await sdk.call();
    sdk.assertOutput(result, body);
    assert.equal(result.isError, true);
    assert.equal(sdk.backendCalls.length, 1);
    if (code !== 'configuration_unavailable') {
      assert.match(result.content[0].text, /same operationId and identical content/);
    }
  });
}

test('handler configuration exception retains the request without exposing the exception', async (t) => {
  const sdk = await connect(t, { backendError: new Error('private@example.com /home/private/key') });
  const result = await sdk.call();
  sdk.assertOutput(result, buildAgentWorkReportLocalError({ input: INPUT, code: 'configuration_unavailable' }));
  assert.equal(result.isError, true);
  assert.doesNotMatch(JSON.stringify(result), /private@example|\/home\/private/);
  assert.equal(sdk.backendCalls.length, 1);
});

for (const [label, summary] of CREDENTIAL_SUMMARIES) {
  test(`${label} in a saved summary becomes a same-ID verification error`, async (t) => {
    const input = { ...INPUT, summary };
    const sdk = await connect(t, { backendResult: acknowledgment(input) });
    const result = await sdk.call(input);
    sdk.assertOutput(result, buildAgentWorkReportLocalError({ input, code: 'response_invalid' }));
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /same operationId and identical content/);
    assert.doesNotMatch(JSON.stringify(result), /open_abcdefghijklmnopqrstuvwx|dlt_0123456789abcdef|synthetic-(?:credential-)?not-real|Work report saved/);
    assert.equal(sdk.backendCalls.length, 1);
  });
}

for (const [name, mutateResult] of [
  ['success labeled as error', (result) => ({ ...result, isError: true })],
  ['error labeled as success', (result) => ({ ...result, isError: false,
    structuredContent: apiError('agent_work_store_unavailable') })],
  ['extra output field', (result) => ({ ...result,
    structuredContent: { ...result.structuredContent, agentId: OTHER_ID } })],
  ['mismatched report ID', (result) => ({ ...result, structuredContent: {
    ...result.structuredContent, report: { ...result.structuredContent.report, reportId: OTHER_ID },
  } })],
]) {
  test(`SDK refuses ${name} after handler result policy validation`, async (t) => {
    const sdk = await connect(t, { mutateResult });
    const result = await sdk.call();
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.equal(sdk.backendCalls.length, 1);
    assert.doesNotMatch(result.content[0].text, /Work report saved/);
  });
}

// Exact Wallet producer export. Request shapes come from operation() at line 21
// and the HTTP case construction at lines 205-212 in
// dexter-api/src/agentRuntime/__tests__/agentWorkReport.pg.test.ts.
// Producer source SHA256: 46ce0845d3ed62ad7b712521ad551055d98b03ef1b382022a693a74be8b9fbbc.
const producerBytes = readFileSync(new URL('./fixtures/agent-work-report-producer.json', import.meta.url));
const producer = JSON.parse(producerBytes);
const producerHttp = producer.fixtures.http;
const producerRequestOverrides = {
  newer: { expectedRevision: 1, state: 'completed', summary: 'Deployment review complete' },
  changed: { summary: 'Changed report' },
  noHead: { expectedRevision: 4 },
  unavailable: { expectedRevision: 2 },
  recovered: { expectedRevision: 2 },
  invalidRequest: { expectedRevision: 3, summary: ' padded ' },
};
function producerInput(name) {
  return { ...INPUT, operationId: producerHttp[name].body.operationId, ...producerRequestOverrides[name] };
}

test('Wallet producer fixture preserves the original export and failure attribution', () => {
  assert.equal(createHash('sha256').update(producerBytes).digest('hex'),
    '1aeaf7c223c334b831b1a1386c81bb454aea9e1dc5cc104265245e6d34f92aa0');
  assert.deepEqual(Object.keys(producerHttp), [
    'accepted', 'replay', 'newer', 'replayAfterNewer', 'conflict', 'changed',
    'revoked', 'noHead', 'invalidRuntime', 'unavailable', 'recovered', 'invalidRequest',
  ]);
  assert.match(producer.qualification, /Actual Express\/HMAC\/PostgreSQL producer with disposable seeded identities/);
  assert.match(producer.fixtures.failureAttribution.unavailable, /AFTER PostgreSQL COMMIT/);
  assert.match(producer.fixtures.failureAttribution.revoked, /absent disposable session/);
  assert.deepEqual(producerHttp.replayAfterNewer.body,
    { ...producerHttp.accepted.body, replayed: true });
  assert.equal(producerHttp.recovered.body.operationId, producerHttp.unavailable.body.operationId);
});

for (const [name, fixture] of Object.entries(producerHttp).filter(([name]) => name !== 'invalidRequest')) {
  test(`Wallet HTTP producer ${name} passes through the actual client, handler and SDK`, async (t) => {
    const input = producerInput(name);
    const now = name === 'replayAfterNewer'
      ? Date.parse(fixture.body.report.expiresAt) + 24 * 60 * 60 * 1_000
      : REQUEST_TIME;
    const requests = [];
    const sdk = await connect(t, {
      backendOverride: (args) => callAgentWorkReportBackend({ ...args, now,
        fetchImpl: async (url, options) => {
          requests.push({ url, options });
          return Response.json(fixture.body, { status: fixture.status });
        },
      }),
    });
    const result = await sdk.call(input);
    sdk.assertOutput(result, fixture.body, input.operationId);
    assert.equal(result.isError, fixture.status !== 200);
    assert.equal(requests.length, 1);
    assert.equal(sdk.backendCalls.length, 1);
    assertSignedRequest(requests[0], input, now);
    if (name === 'replayAfterNewer') {
      assert.ok(now > Date.parse(result.structuredContent.report.expiresAt));
      assert.deepEqual(result.structuredContent.report, producerHttp.accepted.body.report);
      assert.match(result.content[0].text, /newer report may already be current/);
    }
    if (name === 'unavailable') {
      assert.equal(result.structuredContent.retryWithSameOperationOnly, true);
      assert.match(result.content[0].text, /same operationId and identical content/);
    }
  });
}

test('the exact producer invalidRequest input is refused by the SDK before HTTP', async (t) => {
  const sdk = await connect(t, { backendOverride: () => assert.fail('invalid input reached the client') });
  const result = await sdk.call(producerInput('invalidRequest'));
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(sdk.backendCalls.length, 0);
});

test('producer invalidRequest body is compatible as a response to a well-formed request only', async (t) => {
  // This projects the recorded 400 envelope. It does not claim that the strict
  // MCP input would send the producer's rejected padded summary.
  const fixture = producerHttp.invalidRequest;
  const input = { ...producerInput('invalidRequest'), summary: INPUT.summary };
  const requests = [];
  const sdk = await connect(t, {
    backendOverride: (args) => callAgentWorkReportBackend({ ...args, now: REQUEST_TIME,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return Response.json(fixture.body, { status: fixture.status });
      },
    }),
  });
  const result = await sdk.call(input);
  sdk.assertOutput(result, fixture.body, input.operationId);
  assert.equal(result.isError, true);
  assert.equal(requests.length, 1);
  assertSignedRequest(requests[0], input);
});

test('advertised and runtime UUID rules reject uppercase spelling before dispatch', async (t) => {
  const sdk = await connect(t);
  const input = { ...producerInput('accepted'), operationId: producerHttp.accepted.body.operationId.toUpperCase() };
  const validateInput = new AjvJsonSchemaValidator().getValidator(sdk.listed.inputSchema);
  assert.equal(validateInput(producerInput('accepted')).valid, true);
  assert.equal(validateInput(input).valid, false);
  const result = await sdk.call(input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(sdk.backendCalls.length, 0);
});
