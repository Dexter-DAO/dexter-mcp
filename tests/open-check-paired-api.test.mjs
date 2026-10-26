import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import net from 'node:net';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createOpenMcpServer } from '../open-mcp-server.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

// Opt-in cross-repository proof. The API's PG17 suite prepares this disposable
// database first. Run under the API checkout's tsx loader to import its TS.
const apiRoot = process.env.DEXTER_PAIRED_API_ROOT;
const fixtureUrl = 'postgresql://postgres:native_exact_disposable_only@127.0.0.1:55499/native_exact_durable_check_refusal';

test('registered MCP tools retain actual API and PostgreSQL refusal outcomes across recovery', {
  skip: !apiRoot,
}, async (t) => {
  assert.equal(isAbsolute(apiRoot), true, 'DEXTER_PAIRED_API_ROOT must be absolute');
  const forbidden = [];
  const deny = (operation) => {
    forbidden.push(operation);
    throw new Error(`Forbidden in paired local proof: ${operation}`);
  };
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = args[0] && typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };
    if (String(options.port) !== '55499' || options.host !== '127.0.0.1') return deny('non-fixture network connection');
    return originalConnect.apply(this, args);
  };
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
  process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = 'paired-local-proof-service-secret-at-least-32-bytes';
  globalThis.fetch = async () => deny('unexpected fetch during API import');
  let client;
  let server;
  t.after(async () => {
    if (server) await server.close();
    if (client) await client.end();
    globalThis.fetch = previousFetch;
    net.Socket.prototype.connect = originalConnect;
    if (previousSecret === undefined) delete process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET;
    else process.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET = previousSecret;
  });
  const apiRequire = createRequire(join(apiRoot, 'package.json'));
  const { Client } = apiRequire('pg');
  client = new Client({ connectionString: fixtureUrl, application_name: 'dex319-paired-local-proof' });
  await client.connect();
  const identity = (await client.query(`SELECT current_database() AS db, current_user AS username,
    current_setting('server_version_num')::int AS version`)).rows[0];
  assert.equal(identity.db, 'native_exact_durable_check_refusal');
  assert.equal(identity.username, 'postgres');
  assert.ok(identity.version >= 170000 && identity.version < 180000);
  const loadApi = (name) => import(pathToFileURL(join(apiRoot, 'src/services/x402', name)).href);
  const { createOpaquePurchaseRouteCoordinator } = await loadApi('opaquePurchaseCoordinator.ts');
  const { createOpaquePurchaseCheckStore } = await loadApi('opaquePurchaseCheckPersistence.ts');
  const { buildNativeExactJsonWireBody } = await loadApi('nativeExactWire.ts');
  const query = async (sql, ...values) => (await client.query(sql, values)).rows;
  const db = {
    $queryRawUnsafe: query,
    async $transaction(operation) {
      await client.query('BEGIN');
      try {
        const result = await operation({ $queryRawUnsafe: query,
          $executeRawUnsafe: async (sql, ...values) => (await client.query(sql, values)).rowCount ?? 0 });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
  const sessionId = `paired-${randomUUID()}`;
  const digest = createHash('sha256').update(sessionId).digest('hex');
  const principal = {
    version: 'governed-principal/v1', source: 'mcp-link-token', actor: 'agent', viewerRole: 'agent',
    sessionId, vaultPda: 'fixture-vault', swigAddress: 'fixture-swig', walletAddress: 'fixture-wallet',
    linkTokenId: randomUUID(), agentId: randomUUID(), grantId: randomUUID(),
    surfaceBindingDigest: digest, sessionBindingDigest: digest,
    grantRevision: 1, grantRevisionDigest: digest,
    grantValidFrom: new Date(Date.now() - 60_000).toISOString(), grantExpiresAt: null,
  };
  let authority = { status: 'unavailable', reason: 'swig_role_rpc_context_unavailable', retryable: true };
  let authorityReads = 0;
  let sellerMode = 'free';
  let sellerCalls = 0;
  const blockedAdapter = new Proxy({}, { get: (_target, name) => () => deny(`economic adapter ${String(name)}`) });
  const coordinator = createOpaquePurchaseRouteCoordinator({
    db, checkStore: createOpaquePurchaseCheckStore(db),
    controls: () => ({ routesEnabled: true, acceptNewPurchases: true,
      nativeTabEnabled: false, nativeTabExecutionEnabled: false, nativeExactEnabled: false,
      nativeExactExecutionEnabled: false, nativeExactReconciliationEnabled: false }),
    resolvePrincipal: async () => ({ ok: true, value: principal }),
    ensureAgentSessionAuthority: async () => { authorityReads++; return authority; },
    pinnedFetch: async (url) => {
      assert.equal(new URL(url).hostname, 'paired-seller.invalid');
      sellerCalls++;
      if (sellerMode === 'lost') throw new Error('Injected lost local seller reply');
      return new Response(JSON.stringify({ forecast: 'Local fixture: clear skies' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
    deliveryStore: blockedAdapter, directExact: blockedAdapter, nativeTab: blockedAdapter,
    gatewayCash: blockedAdapter, gatewayCredit: blockedAdapter,
    readOwnedCashAvailableAtomic: async () => deny('cash or RPC read'),
    resolveAuthorityEpoch: async () => deny('authority epoch or RPC read'),
    registerOwnerApprovalRequest: async () => deny('owner approval write'),
  });
  const checks = new Map();
  let statusReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/api/passkey-anon/mcp-binding/')) {
      return Response.json({ ok: true, user_handle: 'paired-local-user' });
    }
    if (url.pathname === '/api/x402/resource') return Response.json({ ok: true, found: false });
    const request = JSON.parse(init.body);
    let result;
    if (url.pathname === '/v2/pay/anon/x402/check') {
      const input = { mcpSessionId: request.mcp_session_id, requestId: request.requestId,
        resourceUrl: request.url, method: request.method, correlationId: randomUUID(),
        wireBody: buildNativeExactJsonWireBody({ method: request.method,
          ...(request.body ? { body: JSON.parse(request.body) } : {}) }) };
      checks.set(request.requestId, input);
      result = await coordinator.check(input);
    } else if (url.pathname === '/v2/pay/anon/x402/check/status') {
      statusReads++;
      result = await coordinator.checkStatus({ mcpSessionId: request.mcp_session_id, requestId: request.requestId });
    } else return deny(`unexpected API route ${url.pathname}`);
    return Response.json(result.body, { status: result.status });
  };
  server = createOpenMcpServer({ includeResources: false });
  const invoke = async (tool, args) => {
    const envelope = await server._registeredTools[tool].handler(args, { sessionId });
    const parsed = OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(envelope.structuredContent);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    return envelope.structuredContent;
  };
  const observations = [];
  for (const tool of ['x402_check', 'x402_access']) {
    authority = { status: 'unavailable', reason: 'swig_role_rpc_context_unavailable', retryable: true };
    const failed = await invoke(tool, { url: 'https://paired-seller.invalid/weather?location=Brooklyn' });
    assert.equal(failed.status, 'check_refused');
    assert.equal(failed.executionGuidance.supportedPath, 'upstream_unavailable');
    assert.equal(failed.retryable, true);
    assert.equal(failed.executionGuidance.reprobeAllowed, true);
    const row = (await query('SELECT state, dispatch_started_at, response_body FROM public.gateway_purchase_check_claims WHERE session_binding_digest = $1 AND request_id = $2', digest, failed.checkRequestId))[0];
    assert.equal(row.state, 'refused');
    assert.equal(row.dispatch_started_at, null);
    assert.equal(row.response_body.providerDispatched, false);
    const before = { authorityReads, sellerCalls, checks: checks.size };
    authority = { status: 'active' };
    assert.equal(Object.hasOwn(failed, 'recovery'), false);
    assert.equal(failed.executionGuidance.nextAction, 'new_check');
    assert.equal(failed.executionGuidance.tool, 'x402_check');
    const recovered = await invoke('x402_status', { checkRequestId: failed.checkRequestId });
    const repeated = await coordinator.check(checks.get(failed.checkRequestId));
    assert.equal(recovered.status, 'check_refused');
    assert.equal(recovered.message, failed.message);
    assert.equal(Object.hasOwn(recovered, 'recovery'), false);
    assert.deepEqual(repeated.body, row.response_body);
    assert.deepEqual({ authorityReads, sellerCalls, checks: checks.size }, before);
    const fresh = await invoke(failed.executionGuidance.tool, { url: 'https://paired-seller.invalid/weather?location=Brooklyn' });
    assert.equal(fresh.free, true);
    assert.equal(fresh.data.forecast, 'Local fixture: clear skies');
    assert.notEqual(fresh.checkRequestId, failed.checkRequestId);
    assert.equal(sellerCalls, before.sellerCalls + 1);
    observations.push({ tool, outage: failed.message, statusAfterRecovery: recovered.status,
      freshResult: fresh.data, savedDispatchStartedAt: row.dispatch_started_at,
      initialRefusal: failed, recoveredRefusal: recovered, freshCheck: fresh });
  }
  authority = { status: 'unavailable', reason: 'agent_session_role_snapshot_evidence_mismatch', retryable: false };
  const denied = await invoke('x402_check', { url: 'https://paired-seller.invalid/denied' });
  assert.equal(denied.retryable, false);
  assert.equal(denied.executionGuidance.reprobeAllowed, false);
  assert.equal(denied.executionGuidance.supportedPath, 'local_authority_unavailable');
  assert.doesNotMatch(denied.message, /blockchain data/);
  const deniedStatus = await invoke('x402_status', { checkRequestId: denied.checkRequestId });
  assert.equal(deniedStatus.retryable, false);
  assert.equal(Object.hasOwn(deniedStatus, 'recovery'), false);
  authority = { status: 'active' };
  sellerMode = 'lost';
  const uncertain = await invoke('x402_access', { url: 'https://paired-seller.invalid/uncertain' });
  assert.equal(uncertain.executionGuidance.supportedPath, 'check_pending');
  assert.equal(uncertain.executionGuidance.reprobeAllowed, false);
  const beforeUncertainReplay = sellerCalls;
  const uncertainStatus = await invoke('x402_status', { checkRequestId: uncertain.checkRequestId });
  await coordinator.check(checks.get(uncertain.checkRequestId));
  assert.equal(uncertainStatus.executionGuidance.reprobeAllowed, false);
  assert.equal(uncertainStatus.executionGuidance.nextAction, 'stop');
  assert.equal(Object.hasOwn(uncertainStatus.executionGuidance, 'tool'), false);
  assert.equal(Object.hasOwn(uncertainStatus, 'recovery'), false);
  assert.equal(sellerCalls, beforeUncertainReplay);
  const missing = await invoke('x402_status', { checkRequestId: randomUUID() });
  assert.equal(missing.executionGuidance.supportedPath, 'check_not_found');
  assert.equal(missing.executionGuidance.reprobeAllowed, false);
  assert.equal(Object.hasOwn(missing, 'recovery'), false);
  assert.deepEqual(forbidden, []);
  t.diagnostic(JSON.stringify({ observations, permanentDenial: deniedStatus.executionGuidance,
    uncertain: uncertainStatus.executionGuidance, missing: missing.executionGuidance,
    fullResults: { permanentDenial: deniedStatus, uncertain: uncertainStatus, missing },
    authorityReads, localSellerCalls: sellerCalls, statusReads, forbiddenCalls: forbidden.length }));
});
