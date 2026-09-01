import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
} from 'jose';
import {
  OPEN_OAUTH_PROMOTED_TOOL_NAMES,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  OPEN_MCP_PRM,
  OPEN_MCP_VAULT_AUDIENCE,
  VAULT_WWW_AUTHENTICATE,
} from '../lib/open-tool-auth.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRYPOINT = fileURLToPath(new URL('../open-mcp-server.mjs', import.meta.url));
const INITIALIZE_MESSAGE = Object.freeze({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'opendexter-runtime-test', version: '1.0.0' },
  },
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function reservePort() {
  const probe = createNetServer();
  const address = await listen(probe);
  const port = typeof address === 'object' && address ? address.port : null;
  await closeServer(probe);
  assert.ok(port);
  return port;
}

async function waitForStartup(child, port, output) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (output.text.includes(`listening on :${port}`)) return;
    if (child.exitCode !== null) {
      throw new Error(`OpenDexter exited before startup: ${output.text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`OpenDexter did not start: ${output.text}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function closeClient(client) {
  if (!client) return;
  await client.close().catch(() => undefined);
}

async function readJsonBody(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || '{}');
}

async function startRuntimeFixture({
  publicJwk,
  handleDependency,
  isJwksAvailable = () => true,
  runtimeEnv = {},
}) {
  const dependencyServer = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/jwks') {
        if (!isJwksAvailable()) {
          response.writeHead(503, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          });
          response.end(JSON.stringify({ error: 'jwks_unavailable' }));
          return;
        }
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      if (await handleDependency(request, response, url)) return;
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false }));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  const dependencyAddress = await listen(dependencyServer);
  const dependencyPort = typeof dependencyAddress === 'object' && dependencyAddress
    ? dependencyAddress.port
    : null;
  assert.ok(dependencyPort);
  const dependencyOrigin = `http://127.0.0.1:${dependencyPort}`;

  const port = await reservePort();
  const output = { text: '' };
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPEN_MCP_PORT: String(port),
      OPEN_MCP_TEST_VAULT_JWKS_URL: `${dependencyOrigin}/jwks`,
      DEXTER_API_URL: dependencyOrigin,
      X402_API_URL: dependencyOrigin,
      INTERNAL_DEXTERCARD_HMAC_SECRET: 'i'.repeat(32),
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'g'.repeat(32),
      OPEN_MCP_CONNECTION_TRACE: '',
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
      ...runtimeEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output.text += chunk; });
  child.stderr.on('data', (chunk) => { output.text += chunk; });
  await waitForStartup(child, port, output);
  return {
    child,
    dependencyOrigin,
    dependencyServer,
    mcpUrl: new URL(`http://127.0.0.1:${port}/mcp`),
    origin: `http://127.0.0.1:${port}`,
    output,
  };
}

async function signVaultToken(privateKey, kid, {
  subject,
  surface,
  scope = 'vault',
  audience = OPEN_MCP_VAULT_AUDIENCE,
  jwtId = undefined,
}) {
  const now = Math.floor(Date.now() / 1_000);
  let signer = new SignJWT({ scope, dexter_surface: surface })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer('https://dexter.cash')
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + 300);
  if (jwtId) signer = signer.setJti(jwtId);
  return signer.sign(privateKey);
}

function initializeRequest(url, { bearer = null, headers = {}, body = INITIALIZE_MESSAGE } = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function sessionRequest(url, {
  sessionId,
  bearer = null,
  method = 'POST',
  headers = {},
  body = { jsonrpc: '2.0', id: 40, method: 'tools/list', params: {} },
}) {
  return fetch(url, {
    method,
    headers: {
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      'mcp-session-id': sessionId,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

function toolCallBody(name, id, args = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

test('canonical /mcp keeps search public and promotes the same session for protected tools', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { alg: 'ES256', kid: 'mixed-auth-runtime', use: 'sig' });

  const token = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'mixed-runtime-user',
    surface: '7'.repeat(64),
    jwtId: 'mixed-access-token',
  });
  const refreshedToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'mixed-runtime-user',
    surface: '7'.repeat(64),
    jwtId: 'mixed-refreshed-token',
  });
  const foreignToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'foreign-mixed-runtime-user',
    surface: '8'.repeat(64),
  });
  const failedPromotionToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'failed-promotion-user',
    surface: '9'.repeat(64),
  });

  const seedBodies = [];
  let jwksAvailable = true;
  let seedUnavailable = false;
  const fixture = await startRuntimeFixture({
    publicJwk,
    isJwksAvailable: () => jwksAvailable,
    runtimeEnv: { OPEN_MCP_TEST_VAULT_JWKS_CACHE_MS: '0' },
    handleDependency: async (request, response, url) => {
      if (request.method === 'GET' && url.pathname === '/api/x402gle/capability') {
        const query = url.searchParams.get('q') || '';
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          ok: true,
          strongResults: [],
          relatedResults: [],
          strongCount: 0,
          relatedCount: 0,
          topSimilarity: null,
          noMatchReason: 'below_similarity_threshold',
          rerank: { enabled: true, applied: false },
          intent: { capabilityText: query },
          appliedConstraints: {
            maxPriceUsdc: null,
            minPriceUsdc: null,
            paidOnly: false,
          },
          appliedOrdering: { sortBy: 'relevance' },
        }));
        return true;
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/oauth-seed'
      ) {
        const body = await readJsonBody(request);
        seedBodies.push(body);
        if (body.access_token === failedPromotionToken || seedUnavailable) {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'service_disabled' }));
          return true;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, user_handle: 'mixed-runtime-user' }));
        return true;
      }
      return false;
    },
  });

  let client = null;
  let activeBearer = '';
  try {
    const transport = new StreamableHTTPClientTransport(fixture.mcpUrl, {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        if (activeBearer) headers.set('Authorization', `Bearer ${activeBearer}`);
        return fetch(input, { ...init, headers });
      },
    });
    client = new Client({ name: 'mixed-auth-runtime-client', version: '1.0.0' });
    await client.connect(transport);
    assert.ok(transport.sessionId);
    assert.equal(seedBodies.length, 0, 'anonymous initialize attempted to bind a wallet');

    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name), OPEN_TOOL_NAMES);
    assert.deepEqual(
      tools.find(({ name }) => name === 'x402_search')?._meta?.securitySchemes,
      [{ type: 'noauth' }],
    );
    for (const name of OPEN_OAUTH_PROMOTED_TOOL_NAMES) {
      assert.deepEqual(
        tools.find((tool) => tool.name === name)?._meta?.securitySchemes,
        [{ type: 'oauth2', scopes: ['vault'] }],
        name,
      );
    }

    const anonymousSearch = await client.callTool({
      name: 'x402_search',
      arguments: { query: 'weather data' },
    });
    assert.notEqual(anonymousSearch.isError, true);
    assert.equal(seedBodies.length, 0, 'public search attempted to bind a wallet');

    jwksAvailable = false;
    const initializeDuringJwksOutage = await initializeRequest(fixture.mcpUrl, {
      bearer: token,
    });
    assert.equal(initializeDuringJwksOutage.status, 200);
    const outageSessionId = initializeDuringJwksOutage.headers.get('mcp-session-id');
    assert.ok(outageSessionId);
    assert.equal((await sessionRequest(fixture.mcpUrl, {
      sessionId: outageSessionId,
      bearer: token,
      method: 'DELETE',
    })).status, 200);
    const listDuringJwksOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: token,
    });
    assert.equal(listDuringJwksOutage.status, 200);
    const publicDuringJwksOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: token,
      body: toolCallBody('x402_search', 97, { query: 'weather data' }),
    });
    assert.equal(publicDuringJwksOutage.status, 200);
    const protectedDuringJwksOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: token,
      body: toolCallBody('x402_wallet', 98),
    });
    assert.equal(protectedDuringJwksOutage.status, 503);
    assert.equal(seedBodies.length, 0);
    jwksAvailable = true;

    const publicWithInvalidBearer = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: 'invalid-token',
      body: toolCallBody('x402_search', 99, { query: 'weather data' }),
    });
    assert.equal(publicWithInvalidBearer.status, 200);
    const protectedWithInvalidBearer = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: 'invalid-token',
      body: toolCallBody('x402_wallet', 100),
    });
    assert.equal(protectedWithInvalidBearer.status, 401);
    assert.match(
      protectedWithInvalidBearer.headers.get('www-authenticate') || '',
      /error="invalid_token"/,
    );

    let requestId = 100;
    for (const name of OPEN_OAUTH_PROMOTED_TOOL_NAMES) {
      const challenged = await sessionRequest(fixture.mcpUrl, {
        sessionId: transport.sessionId,
        body: toolCallBody(name, requestId += 1),
      });
      assert.equal(challenged.status, 401, name);
      assert.equal(challenged.headers.get('www-authenticate'), VAULT_WWW_AUTHENTICATE, name);
    }
    const batchChallenge = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      body: [
        toolCallBody('x402_search', requestId += 1, { query: 'weather data' }),
        toolCallBody('x402_wallet', requestId += 1),
      ],
    });
    assert.equal(batchChallenge.status, 401);
    assert.equal((await batchChallenge.json()).id, requestId);
    assert.equal(seedBodies.length, 0, 'challenge-only calls attempted to bind a wallet');

    const failedPromotion = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: failedPromotionToken,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(failedPromotion.status, 503);
    assert.equal(seedBodies.length, 1);

    const promoted = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: token,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(promoted.status, 200);
    assert.equal(seedBodies.length, 2);
    assert.equal(seedBodies[1].mcp_session_id, transport.sessionId);

    const publicAfterPromotion = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      body: toolCallBody('x402_search', requestId += 1, { query: 'weather data' }),
    });
    assert.equal(publicAfterPromotion.status, 200);
    const publicWithForeignBearer = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: foreignToken,
      body: toolCallBody('x402_search', requestId += 1, { query: 'weather data' }),
    });
    assert.equal(publicWithForeignBearer.status, 200);
    assert.equal(seedBodies.length, 2, 'public search re-bound the promoted session');

    seedUnavailable = true;
    const listDuringSeedOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
    });
    assert.equal(listDuringSeedOutage.status, 200);
    const publicDuringSeedOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_search', requestId += 1, { query: 'weather data' }),
    });
    assert.equal(publicDuringSeedOutage.status, 200);
    assert.equal(seedBodies.length, 2, 'public search touched the OAuth seed API');
    const protectedDuringSeedOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(protectedDuringSeedOutage.status, 503);
    assert.equal(seedBodies.length, 3);
    seedUnavailable = false;

    const protectedWithoutBearer = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(protectedWithoutBearer.status, 401);
    assert.equal(
      protectedWithoutBearer.headers.get('www-authenticate'),
      VAULT_WWW_AUTHENTICATE,
    );

    const foreign = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: foreignToken,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(foreign.status, 401);
    assert.match(foreign.headers.get('www-authenticate') || '', /error="invalid_token"/);

    const refreshed = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', requestId += 1),
    });
    assert.equal(refreshed.status, 200);
    assert.equal(seedBodies.length, 4);

    activeBearer = refreshedToken;
  } finally {
    await closeClient(client);
    await stopChild(fixture.child);
    await closeServer(fixture.dependencyServer);
  }
});

test('canonical /mcp authenticates and seeds protected sessions, then pins one OAuth identity', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { alg: 'ES256', kid: 'auth-first-runtime', use: 'sig' });

  const token = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'runtime-user',
    surface: 'a'.repeat(64),
    jwtId: 'first-access-token',
  });
  const refreshedToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'runtime-user',
    surface: 'a'.repeat(64),
    jwtId: 'refreshed-access-token',
  });
  const foreignToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'foreign-runtime-user',
    surface: 'b'.repeat(64),
  });
  const wrongAudienceToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'runtime-user',
    surface: 'a'.repeat(64),
    audience: 'https://open.dexter.cash/mcp/vault',
  });
  const insufficientScopeToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'runtime-user',
    surface: 'a'.repeat(64),
    scope: 'openid',
  });
  const seedFailureToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'seed-failure-user',
    surface: 'c'.repeat(64),
  });
  const seedRevokedToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'seed-revoked-user',
    surface: 'e'.repeat(64),
  });
  const seedMalformedToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'seed-malformed-user',
    surface: 'f'.repeat(64),
  });
  const seedIdentityMismatchToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'seed-identity-user',
    surface: '1'.repeat(64),
  });

  const seedBodies = [];
  let linkBindCalls = 0;
  let successfulSeedFinished = false;
  let jwksAvailable = true;
  let establishedSeedMode = 'normal';
  let oauthBindingProvenance = null;
  const fixture = await startRuntimeFixture({
    publicJwk,
    isJwksAvailable: () => jwksAvailable,
    runtimeEnv: { OPEN_MCP_TEST_VAULT_JWKS_CACHE_MS: '0' },
    handleDependency: async (request, response, url) => {
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/oauth-seed'
      ) {
        const body = await readJsonBody(request);
        seedBodies.push(body);
        if (body.access_token === seedRevokedToken || establishedSeedMode === 'revoked') {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'surface_not_live' }));
          return true;
        }
        if (body.access_token === seedFailureToken) {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'service_disabled' }));
          return true;
        }
        if (body.access_token === seedMalformedToken || establishedSeedMode === 'malformed') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
          return true;
        }
        if (
          body.access_token === seedIdentityMismatchToken
          || establishedSeedMode === 'identity_mismatch'
        ) {
          oauthBindingProvenance = {
            sessionId: body.mcp_session_id,
            userHandle: 'foreign-runtime-user',
            tokenScoped: false,
          };
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, user_handle: 'foreign-runtime-user' }));
          return true;
        }
        if (establishedSeedMode === 'transient') {
          response.writeHead(401, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'bad_signature' }));
          return true;
        }
        if (establishedSeedMode === 'network') {
          request.socket.destroy();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        successfulSeedFinished = true;
        oauthBindingProvenance = {
          sessionId: body.mcp_session_id,
          userHandle: 'runtime-user',
          tokenScoped: true,
        };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, user_handle: 'runtime-user' }));
        return true;
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/link-token/bind'
      ) {
        linkBindCalls += 1;
        await readJsonBody(request);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, user_handle: 'link-runtime-user' }));
        return true;
      }
      return false;
    },
  });

  let client = null;
  try {
    const health = await fetch(`${fixture.origin}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.auth, 'mixed');
    assert.equal(healthBody.toolAuth, 'per-tool');
    assert.deepEqual(healthBody.publicTools, ['x402_search']);

    const preflight = await fetch(fixture.mcpUrl, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/i);
    assert.match(preflight.headers.get('access-control-expose-headers') || '', /WWW-Authenticate/i);

    const manifest = await fetch(`${fixture.origin}/.well-known/mcp.json`);
    assert.equal(manifest.status, 200);
    const prm = await fetch(`${fixture.origin}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(prm.status, 200);
    assert.deepEqual(await prm.json(), OPEN_MCP_PRM);

    for (const path of ['/', '/mcp']) {
      const landing = await fetch(`${fixture.origin}${path}`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      });
      assert.equal(landing.status, 301, path);
      assert.equal(landing.headers.get('location'), 'https://dexter.cash/opendexter');
    }
    assert.equal((await initializeRequest(`${fixture.origin}/`, { bearer: token })).status, 404);
    assert.equal(
      (await initializeRequest(`${fixture.origin}/mcp/vault`, { bearer: token })).status,
      404,
    );

    const missing = await initializeRequest(fixture.mcpUrl);
    assert.equal(missing.status, 200);
    assert.equal(missing.headers.get('www-authenticate'), null);
    assert.ok(missing.headers.get('mcp-session-id'));
    assert.equal(seedBodies.length, 0);

    const invalid = await initializeRequest(fixture.mcpUrl, { bearer: 'invalid-token' });
    assert.equal(invalid.status, 200);
    assert.equal(invalid.headers.get('www-authenticate'), null);
    assert.equal((await initializeRequest(fixture.mcpUrl, {
      bearer: wrongAudienceToken,
    })).status, 200);
    assert.equal((await initializeRequest(fixture.mcpUrl, {
      bearer: insufficientScopeToken,
    })).status, 200);
    assert.equal(seedBodies.length, 0);

    const badAccept = await initializeRequest(fixture.mcpUrl, {
      bearer: token,
      headers: { Accept: 'application/json' },
    });
    assert.equal(badAccept.status, 406);
    assert.equal(badAccept.headers.get('mcp-session-id'), null);
    const badContentType = await initializeRequest(fixture.mcpUrl, {
      bearer: token,
      headers: { 'Content-Type': 'text/plain' },
    });
    assert.equal(badContentType.status, 415);
    const malformed = await initializeRequest(fixture.mcpUrl, {
      bearer: token,
      body: { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} },
    });
    assert.equal(malformed.status, 400);
    assert.equal(seedBodies.length, 0);

    const promotionSessionId = missing.headers.get('mcp-session-id');
    assert.ok(promotionSessionId);
    let promotionRequestId = 200;
    const seedRevoked = await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      bearer: seedRevokedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(seedRevoked.status, 401);
    assert.match(seedRevoked.headers.get('www-authenticate') || '', /error="invalid_token"/);
    assert.equal(seedBodies.length, 1);

    const seedFailure = await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      bearer: seedFailureToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(seedFailure.status, 503);
    assert.equal(seedFailure.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, 2);

    const malformedSeed = await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      bearer: seedMalformedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(malformedSeed.status, 503);
    assert.equal(malformedSeed.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, 3);

    const mismatchedSeed = await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      bearer: seedIdentityMismatchToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(mismatchedSeed.status, 401);
    assert.match(mismatchedSeed.headers.get('www-authenticate') || '', /error="invalid_token"/);
    assert.equal(seedBodies.length, 4);
    const anonymousGet = await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      method: 'GET',
    });
    assert.equal(anonymousGet.status, 200);
    await anonymousGet.body?.cancel();
    assert.equal((await sessionRequest(fixture.mcpUrl, {
      sessionId: promotionSessionId,
      method: 'DELETE',
    })).status, 200, 'failed promotion left the anonymous session pinned');

    let activeBearer = token;
    const transport = new StreamableHTTPClientTransport(fixture.mcpUrl, {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${activeBearer}`);
        return fetch(input, { ...init, headers });
      },
    });
    client = new Client({ name: 'auth-first-runtime-client', version: '1.0.0' });
    await client.connect(transport);
    assert.equal(successfulSeedFinished, false, 'public initialize touched oauth-seed');
    assert.ok(transport.sessionId);
    let seedCountBeforeRequest = seedBodies.length;
    assert.deepEqual(
      (await client.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
    assert.equal(seedBodies.length, seedCountBeforeRequest, 'tools/list touched oauth-seed');

    const initialProtected = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: token,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(initialProtected.status, 200);
    assert.equal(successfulSeedFinished, true, 'protected request returned before oauth-seed completed');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);
    assert.deepEqual(oauthBindingProvenance, {
      sessionId: transport.sessionId,
      userHandle: 'runtime-user',
      tokenScoped: true,
    });

    activeBearer = refreshedToken;
    seedCountBeforeRequest = seedBodies.length;
    assert.deepEqual(
      (await client.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
    assert.equal(seedBodies.length, seedCountBeforeRequest, 'tools/list re-seeded OAuth');
    const refreshedProtected = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(refreshedProtected.status, 200);
    assert.equal(
      seedBodies.length,
      seedCountBeforeRequest + 1,
      'same-identity refresh did not revalidate provenance',
    );

    jwksAvailable = false;
    seedCountBeforeRequest = seedBodies.length;
    const verifierOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(verifierOutage.status, 503);
    assert.equal(verifierOutage.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, seedCountBeforeRequest);
    jwksAvailable = true;
    seedCountBeforeRequest = seedBodies.length;
    const afterVerifierOutage = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(afterVerifierOutage.status, 200, 'JWKS outage damaged the original session');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    oauthBindingProvenance = {
      sessionId: transport.sessionId,
      userHandle: 'overwritten-wallet-user',
      tokenScoped: false,
    };
    seedCountBeforeRequest = seedBodies.length;
    const repairedProvenance = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(repairedProvenance.status, 200, 'null-provenance overwrite was not repaired');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);
    assert.equal(oauthBindingProvenance.userHandle, 'runtime-user');
    assert.equal(oauthBindingProvenance.tokenScoped, true);

    establishedSeedMode = 'transient';
    seedCountBeforeRequest = seedBodies.length;
    const transientReseedFailure = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(transientReseedFailure.status, 503);
    assert.equal(transientReseedFailure.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    establishedSeedMode = 'network';
    seedCountBeforeRequest = seedBodies.length;
    const networkSeedFailure = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(networkSeedFailure.status, 503);
    assert.equal(networkSeedFailure.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    establishedSeedMode = 'malformed';
    seedCountBeforeRequest = seedBodies.length;
    const malformedEstablished = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(malformedEstablished.status, 503);
    assert.equal(malformedEstablished.headers.get('retry-after'), '1');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    establishedSeedMode = 'identity_mismatch';
    seedCountBeforeRequest = seedBodies.length;
    const returnedIdentityMismatch = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(returnedIdentityMismatch.status, 401);
    assert.match(
      returnedIdentityMismatch.headers.get('www-authenticate') || '',
      /error="invalid_token"/,
    );
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    oauthBindingProvenance = null;
    establishedSeedMode = 'revoked';
    for (const method of ['GET', 'POST', 'DELETE']) {
      seedCountBeforeRequest = seedBodies.length;
      const revokedEstablished = await sessionRequest(fixture.mcpUrl, {
        sessionId: transport.sessionId,
        bearer: refreshedToken,
        method,
        ...(method === 'POST'
          ? { body: toolCallBody('x402_wallet', promotionRequestId += 1) }
          : {}),
      });
      assert.equal(revokedEstablished.status, 401, method);
      assert.match(
        revokedEstablished.headers.get('www-authenticate') || '',
        /error="invalid_token"/,
      );
      assert.equal(seedBodies.length, seedCountBeforeRequest + 1, method);
    }

    establishedSeedMode = 'normal';
    seedCountBeforeRequest = seedBodies.length;
    const afterReseedFailures = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(afterReseedFailures.status, 200, 'reseed failures damaged the original session');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);
    assert.equal(oauthBindingProvenance.tokenScoped, true);

    seedCountBeforeRequest = seedBodies.length;
    const identitySwitch = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: foreignToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(identitySwitch.status, 401);
    assert.match(identitySwitch.headers.get('www-authenticate') || '', /error="invalid_token"/);
    assert.equal(seedBodies.length, seedCountBeforeRequest);
    seedCountBeforeRequest = seedBodies.length;
    const afterIdentitySwitch = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      body: toolCallBody('x402_wallet', promotionRequestId += 1),
    });
    assert.equal(afterIdentitySwitch.status, 200, 'foreign identity damaged the original session');
    assert.equal(seedBodies.length, seedCountBeforeRequest + 1);

    const linkOnOAuthSession = await sessionRequest(
      `${fixture.origin}/mcp/dlt_${'4'.repeat(48)}`,
      { sessionId: transport.sessionId },
    );
    assert.equal(linkOnOAuthSession.status, 401);
    assert.equal(linkBindCalls, 0, 'link mode-switch attempt created a durable binding');

    const publicListWithoutBearer = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
    });
    assert.equal(publicListWithoutBearer.status, 200);
    for (const method of ['GET', 'DELETE']) {
      const noBearer = await sessionRequest(fixture.mcpUrl, {
        sessionId: transport.sessionId,
        method,
      });
      assert.equal(noBearer.status, 401, method);
      const invalidBearer = await sessionRequest(fixture.mcpUrl, {
        sessionId: transport.sessionId,
        bearer: 'invalid-token',
        method,
      });
      assert.equal(invalidBearer.status, 401, `invalid ${method}`);
      assert.match(
        invalidBearer.headers.get('www-authenticate') || '',
        /error="invalid_token"/,
      );
      const foreignBearer = await sessionRequest(fixture.mcpUrl, {
        sessionId: transport.sessionId,
        bearer: foreignToken,
        method,
      });
      assert.equal(foreignBearer.status, 401, `foreign ${method}`);
    }
    assert.deepEqual(
      (await client.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
      'unauthorized DELETE damaged the session',
    );

    const unknownSession = '00000000-0000-4000-8000-000000000000';
    assert.equal((await sessionRequest(fixture.mcpUrl, {
      sessionId: unknownSession,
    })).status, 404);
    assert.equal((await sessionRequest(fixture.mcpUrl, {
      sessionId: unknownSession,
      bearer: refreshedToken,
    })).status, 404);

    const deleted = await sessionRequest(fixture.mcpUrl, {
      sessionId: transport.sessionId,
      bearer: refreshedToken,
      method: 'DELETE',
    });
    assert.equal(deleted.status, 200);
  } finally {
    await closeClient(client);
    await stopChild(fixture.child);
    await closeServer(fixture.dependencyServer);
  }
});

test('issued dlt connectors stay fail-closed and cannot change a session authorization', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { alg: 'ES256', kid: 'link-runtime', use: 'sig' });
  const oauthToken = await signVaultToken(privateKey, publicJwk.kid, {
    subject: 'oauth-runtime-user',
    surface: 'd'.repeat(64),
  });
  const validLink = `dlt_${'1'.repeat(48)}`;
  const otherValidLink = `dlt_${'2'.repeat(48)}`;
  const revokedLink = `dlt_${'3'.repeat(48)}`;
  const fabricatedLink = `dlt_${'5'.repeat(48)}`;
  const wrongRailLink = `dlt_${'6'.repeat(48)}`;
  const invalidFieldsLink = `dlt_${'7'.repeat(48)}`;
  const liveLinks = new Set([validLink, otherValidLink]);
  const revokedLinks = new Set([revokedLink]);
  const linkBodies = [];
  const linkBySession = new Map();
  let firstLinkBindFinished = false;
  let linkBindMode = 'normal';

  const fixture = await startRuntimeFixture({
    publicJwk,
    handleDependency: async (request, response, url) => {
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/link-token/bind'
      ) {
        const body = await readJsonBody(request);
        linkBodies.push(body);
        if (revokedLinks.has(body.link_token)) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'token_revoked' }));
          return true;
        }
        if (body.link_token === fabricatedLink) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'token_not_found' }));
          return true;
        }
        if (body.link_token === wrongRailLink) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'wrong_rail' }));
          return true;
        }
        if (body.link_token === invalidFieldsLink) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'invalid_fields' }));
          return true;
        }
        if (linkBindMode === 'bad_signature') {
          response.writeHead(401, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'bad_signature' }));
          return true;
        }
        if (linkBindMode === 'service_failure') {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'service_unavailable' }));
          return true;
        }
        if (linkBindMode === 'network') {
          request.socket.destroy();
          return true;
        }
        if (linkBindMode === 'malformed') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
          return true;
        }
        if (!liveLinks.has(body.link_token)) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'token_not_found' }));
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        const userHandle = linkBindMode === 'identity_mismatch'
          ? 'foreign-link-user'
          : body.link_token === otherValidLink
            ? 'other-link-user'
            : 'link-runtime-user';
        linkBySession.set(body.mcp_session_id, {
          linkToken: body.link_token,
          userHandle,
          tokenScoped: linkBindMode !== 'identity_mismatch',
        });
        firstLinkBindFinished = true;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, user_handle: userHandle }));
        return true;
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/oauth-seed'
      ) {
        await readJsonBody(request);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, user_handle: 'oauth-runtime-user' }));
        return true;
      }
      return false;
    },
  });

  let pathClient = null;
  let headerClient = null;
  try {
    const bindCallsBeforeSessionless = linkBodies.length;
    for (const linkToken of [validLink, revokedLink, fabricatedLink]) {
      for (const method of ['GET', 'DELETE']) {
        const sessionless = await fetch(`${fixture.origin}/mcp/${linkToken}`, {
          method,
          headers: { Accept: 'application/json, text/event-stream' },
        });
        assert.equal(sessionless.status, 400, `${method} ${linkToken}`);
        assert.equal(
          (await sessionless.json()).error,
          'A sessionless link authorization can only initialize with POST.',
        );
      }
    }
    assert.equal(
      linkBodies.length,
      bindCallsBeforeSessionless,
      'sessionless link requests created a durable binding',
    );

    const revokedInitialize = await initializeRequest(
      `${fixture.origin}/mcp/${revokedLink}`,
    );
    assert.equal(revokedInitialize.status, 401);
    assert.equal(revokedInitialize.headers.get('mcp-session-id'), null);

    for (const rejectedLink of [fabricatedLink, wrongRailLink, invalidFieldsLink]) {
      const rejectedInitialize = await initializeRequest(
        `${fixture.origin}/mcp/${rejectedLink}`,
      );
      assert.equal(rejectedInitialize.status, 401, rejectedLink);
      assert.equal(rejectedInitialize.headers.get('mcp-session-id'), null);
    }

    for (const mode of ['bad_signature', 'service_failure', 'network', 'malformed']) {
      linkBindMode = mode;
      const unavailableInitialize = await initializeRequest(
        `${fixture.origin}/mcp/${validLink}`,
      );
      assert.equal(unavailableInitialize.status, 503, mode);
      assert.equal(unavailableInitialize.headers.get('retry-after'), '1', mode);
      assert.equal(unavailableInitialize.headers.get('mcp-session-id'), null, mode);
    }
    linkBindMode = 'normal';

    const bindCallsBeforeMalformed = linkBodies.length;
    const malformedLinkInitialize = await initializeRequest(
      `${fixture.origin}/mcp/${validLink}`,
      {
        body: { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} },
      },
    );
    assert.equal(malformedLinkInitialize.status, 400);
    assert.equal(
      linkBodies.length,
      bindCallsBeforeMalformed,
      'malformed link initialize created a durable binding',
    );

    const pathTransport = new StreamableHTTPClientTransport(
      new URL(`${fixture.origin}/mcp/${validLink}`),
    );
    pathClient = new Client({ name: 'link-path-runtime-client', version: '1.0.0' });
    await pathClient.connect(pathTransport);
    assert.equal(firstLinkBindFinished, true, 'link bind finished after initialize');
    assert.ok(pathTransport.sessionId);
    let bindCallsBeforeRequest = linkBodies.length;
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
    assert.ok(
      linkBodies.length >= bindCallsBeforeRequest + 1,
      'established link session did not revalidate provenance',
    );
    assert.deepEqual(linkBySession.get(pathTransport.sessionId), {
      linkToken: validLink,
      userHandle: 'link-runtime-user',
      tokenScoped: true,
    });

    linkBySession.set(pathTransport.sessionId, {
      linkToken: null,
      userHandle: 'foreign-link-user',
      tokenScoped: false,
    });
    bindCallsBeforeRequest = linkBodies.length;
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
      'null-provenance link overwrite was not repaired',
    );
    assert.equal(linkBodies.length, bindCallsBeforeRequest + 1);
    assert.deepEqual(linkBySession.get(pathTransport.sessionId), {
      linkToken: validLink,
      userHandle: 'link-runtime-user',
      tokenScoped: true,
    });

    bindCallsBeforeRequest = linkBodies.length;
    const foreignLink = await sessionRequest(
      `${fixture.origin}/mcp/${otherValidLink}`,
      { sessionId: pathTransport.sessionId },
    );
    assert.equal(foreignLink.status, 401);
    assert.equal(linkBodies.length, bindCallsBeforeRequest);
    bindCallsBeforeRequest = linkBodies.length;
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
      'foreign link token damaged the original session',
    );
    assert.equal(linkBodies.length, bindCallsBeforeRequest + 1);

    linkBindMode = 'identity_mismatch';
    bindCallsBeforeRequest = linkBodies.length;
    const returnedLinkIdentityMismatch = await sessionRequest(
      `${fixture.origin}/mcp/${validLink}`,
      { sessionId: pathTransport.sessionId },
    );
    assert.equal(returnedLinkIdentityMismatch.status, 401);
    assert.equal(linkBodies.length, bindCallsBeforeRequest + 1);
    linkBindMode = 'normal';
    bindCallsBeforeRequest = linkBodies.length;
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
      'returned link identity mismatch damaged the original session',
    );
    assert.equal(linkBodies.length, bindCallsBeforeRequest + 1);

    for (const mode of ['bad_signature', 'service_failure', 'network', 'malformed']) {
      linkBindMode = mode;
      bindCallsBeforeRequest = linkBodies.length;
      const unavailableExisting = await sessionRequest(
        `${fixture.origin}/mcp/${validLink}`,
        { sessionId: pathTransport.sessionId },
      );
      assert.equal(unavailableExisting.status, 503, mode);
      assert.equal(unavailableExisting.headers.get('retry-after'), '1', mode);
      assert.equal(linkBodies.length, bindCallsBeforeRequest + 1, mode);
    }
    linkBindMode = 'normal';

    liveLinks.delete(validLink);
    revokedLinks.add(validLink);
    for (const method of ['GET', 'POST', 'DELETE']) {
      bindCallsBeforeRequest = linkBodies.length;
      const revokedExisting = await sessionRequest(
        `${fixture.origin}/mcp/${validLink}`,
        { sessionId: pathTransport.sessionId, method },
      );
      assert.equal(revokedExisting.status, 401, method);
      assert.equal(linkBodies.length, bindCallsBeforeRequest + 1, method);
    }
    revokedLinks.delete(validLink);
    liveLinks.add(validLink);
    bindCallsBeforeRequest = linkBodies.length;
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
      'revoked request destroyed the session',
    );
    assert.equal(linkBodies.length, bindCallsBeforeRequest + 1);

    const oauthModeSwitch = await sessionRequest(fixture.mcpUrl, {
      sessionId: pathTransport.sessionId,
      bearer: oauthToken,
    });
    assert.equal(oauthModeSwitch.status, 401);
    assert.deepEqual(
      (await pathClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );

    const unknownSession = '00000000-0000-4000-8000-000000000001';
    const invalidUnknown = await sessionRequest(
      `${fixture.origin}/mcp/${revokedLink}`,
      { sessionId: unknownSession },
    );
    assert.equal(invalidUnknown.status, 401);
    const validUnknown = await sessionRequest(
      `${fixture.origin}/mcp/${validLink}`,
      { sessionId: unknownSession },
    );
    assert.equal(validUnknown.status, 404);
    assert.ok(
      linkBodies.some(({ link_token: tokenValue, mcp_session_id: sessionId }) => (
        tokenValue === validLink && sessionId === unknownSession
      )),
      'valid link token was not authenticated before the authorized 404',
    );

    const headerTransport = new StreamableHTTPClientTransport(fixture.mcpUrl, {
      requestInit: { headers: { 'x-dexter-link-token': validLink } },
    });
    headerClient = new Client({ name: 'link-header-runtime-client', version: '1.0.0' });
    await headerClient.connect(headerTransport);
    assert.deepEqual(
      (await headerClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
  } finally {
    await closeClient(pathClient);
    await closeClient(headerClient);
    await stopChild(fixture.child);
    await closeServer(fixture.dependencyServer);
  }
});
