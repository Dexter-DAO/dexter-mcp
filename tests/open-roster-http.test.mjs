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
  OPEN_ANONYMOUS_TOOL_NAMES,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  AUTH_FIRST_VAULT_WWW_AUTHENTICATE,
  OPEN_MCP_AUTH_FIRST_PRM,
  OPEN_MCP_AUTH_FIRST_PRM_URL,
  OPEN_MCP_AUTH_FIRST_RESOURCE,
  OPEN_MCP_VAULT_AUDIENCE,
  VAULT_WWW_AUTHENTICATE,
  buildVaultWwwAuthenticate,
} from '../lib/open-tool-auth.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRYPOINT = fileURLToPath(new URL('../open-mcp-server.mjs', import.meta.url));

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

async function closeClient(client) {
  if (!client) return;
  await client.close().catch(() => undefined);
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

test('mixed HTTP discovery stays public while the exact vault resource authenticates before initialization', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, {
    alg: 'ES256',
    kid: 'opendexter-roster-test',
    use: 'sig',
  });
  const now = Math.floor(Date.now() / 1_000);
  const authFirstToken = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'a'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_AUTH_FIRST_RESOURCE)
    .setSubject('opendexter-roster-test-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const authFirstOtherIdentityToken = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'd'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_AUTH_FIRST_RESOURCE)
    .setSubject('opendexter-other-roster-test-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const canonicalToken = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'b'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_VAULT_AUDIENCE)
    .setSubject('opendexter-wrong-resource-test-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const seedFailureToken = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'c'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_AUTH_FIRST_RESOURCE)
    .setSubject('opendexter-seed-failure-test-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  let seedCalls = 0;
  let failedSeedCalls = 0;
  let seedCompleted = false;
  const dependencyServer = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/jwks') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/oauth-seed'
      ) {
        let rawBody = '';
        for await (const chunk of request) {
          rawBody += chunk;
        }
        const body = JSON.parse(rawBody);
        if (body.access_token === seedFailureToken) {
          failedSeedCalls += 1;
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false }));
          return;
        }
        seedCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
        seedCompleted = true;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
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

  const openMcpPort = await reservePort();
  const output = { text: '' };
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPEN_MCP_PORT: String(openMcpPort),
      OPEN_MCP_TEST_VAULT_JWKS_URL: `${dependencyOrigin}/jwks`,
      DEXTER_API_URL: dependencyOrigin,
      INTERNAL_DEXTERCARD_HMAC_SECRET: 'i'.repeat(32),
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'g'.repeat(32),
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output.text += chunk; });
  child.stderr.on('data', (chunk) => { output.text += chunk; });

  let anonymousClient = null;
  let anonymousTransport = null;
  let authenticatedClient = null;
  let authenticatedTransport = null;
  try {
    await waitForStartup(child, openMcpPort, output);
    const mcpUrl = new URL(`http://127.0.0.1:${openMcpPort}/mcp`);
    const vaultUrl = new URL(`http://127.0.0.1:${openMcpPort}/mcp/vault`);
    const trailingSlashVaultUrl = new URL(`http://127.0.0.1:${openMcpPort}/mcp/vault/`);

    const vaultMetadata = await fetch(
      `http://127.0.0.1:${openMcpPort}/.well-known/oauth-protected-resource/mcp/vault`,
    );
    assert.equal(vaultMetadata.status, 200);
    assert.deepEqual(await vaultMetadata.json(), OPEN_MCP_AUTH_FIRST_PRM);

    const initializeBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'auth-first-roster-probe', version: '1.0.0' },
      },
    });
    const unauthenticatedInitialize = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: initializeBody,
    });
    assert.equal(unauthenticatedInitialize.status, 401);
    assert.equal(
      unauthenticatedInitialize.headers.get('www-authenticate'),
      AUTH_FIRST_VAULT_WWW_AUTHENTICATE,
    );
    assert.match(
      unauthenticatedInitialize.headers.get('access-control-expose-headers') || '',
      /WWW-Authenticate/i,
    );

    const trailingSlashInitialize = await fetch(trailingSlashVaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: initializeBody,
    });
    assert.equal(trailingSlashInitialize.status, 401);
    assert.equal(
      trailingSlashInitialize.headers.get('www-authenticate'),
      AUTH_FIRST_VAULT_WWW_AUTHENTICATE,
    );

    const wrongAudienceInitialize = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${canonicalToken}`,
        'Content-Type': 'application/json',
      },
      body: initializeBody,
    });
    assert.equal(wrongAudienceInitialize.status, 401);
    assert.equal(
      wrongAudienceInitialize.headers.get('www-authenticate'),
      buildVaultWwwAuthenticate({
        error: 'invalid_token',
        errorDescription: 'Connect OpenDexter with a valid vault authorization to continue',
        resourceMetadataUrl: OPEN_MCP_AUTH_FIRST_PRM_URL,
      }),
    );

    const invalidAcceptInitialize = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${authFirstToken}`,
        'Content-Type': 'application/json',
      },
      body: initializeBody,
    });
    assert.equal(invalidAcceptInitialize.status, 406);
    assert.equal(invalidAcceptInitialize.headers.get('mcp-session-id'), null);
    assert.equal(seedCalls, 0);
    assert.equal(failedSeedCalls, 0);

    const invalidContentTypeInitialize = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authFirstToken}`,
        'Content-Type': 'text/plain',
      },
      body: initializeBody,
    });
    assert.equal(invalidContentTypeInitialize.status, 415);
    assert.equal(invalidContentTypeInitialize.headers.get('mcp-session-id'), null);
    assert.equal(seedCalls, 0);
    assert.equal(failedSeedCalls, 0);

    const malformedInitialize = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authFirstToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {},
      }),
    });
    assert.equal(malformedInitialize.status, 400);
    assert.equal(malformedInitialize.headers.get('mcp-session-id'), null);
    assert.equal(seedCalls, 0);
    assert.equal(failedSeedCalls, 0);

    const unavailableSeed = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${seedFailureToken}`,
        'Content-Type': 'application/json',
      },
      body: initializeBody,
    });
    assert.equal(unavailableSeed.status, 503);
    assert.equal(unavailableSeed.headers.get('mcp-session-id'), null);
    assert.equal(unavailableSeed.headers.get('retry-after'), '1');
    assert.equal(seedCalls, 0);
    assert.equal(failedSeedCalls, 1);

    anonymousClient = new Client({
      name: 'anonymous-roster-test',
      version: '1.0.0',
    });
    anonymousTransport = new StreamableHTTPClientTransport(mcpUrl);
    await anonymousClient.connect(anonymousTransport);
    assert.ok(anonymousTransport.sessionId);
    assert.deepEqual(
      (await anonymousClient.listTools()).tools.map(({ name }) => name),
      OPEN_ANONYMOUS_TOOL_NAMES,
    );

    authenticatedClient = new Client({
      name: 'authenticated-roster-test',
      version: '1.0.0',
    });
    authenticatedTransport = new StreamableHTTPClientTransport(vaultUrl, {
      requestInit: {
        headers: { Authorization: `Bearer ${authFirstToken}` },
      },
    });
    await authenticatedClient.connect(authenticatedTransport);
    assert.ok(authenticatedTransport.sessionId);

    const authenticatedTools = await authenticatedClient.listTools();
    assert.equal(seedCompleted, true, 'tools/list returned before vault binding completed');
    assert.equal(seedCalls, 1);
    assert.deepEqual(
      authenticatedTools.tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );

    const otherIdentityOnSession = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authFirstOtherIdentityToken}`,
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
        'mcp-session-id': authenticatedTransport.sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 90, method: 'tools/list', params: {} }),
    });
    assert.equal(otherIdentityOnSession.status, 401);
    assert.match(
      otherIdentityOnSession.headers.get('www-authenticate') || '',
      /error="invalid_token"/,
    );
    assert.deepEqual(
      (await authenticatedClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
    assert.equal(seedCalls, 1, 'foreign identity forced a vault reseed');

    const crossRouteRequest = async ({
      url,
      sessionId,
      method,
      authorization = null,
    }) => fetch(url, {
      method,
      headers: {
        Accept: 'application/json, text/event-stream',
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        'MCP-Protocol-Version': '2025-06-18',
        'mcp-session-id': sessionId,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST'
        ? {
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 91,
              method: 'tools/list',
              params: {},
            }),
          }
        : {}),
    });

    const unauthenticatedCanonicalSessionProbe = await crossRouteRequest({
      url: vaultUrl,
      sessionId: anonymousTransport.sessionId,
      method: 'POST',
    });
    assert.equal(unauthenticatedCanonicalSessionProbe.status, 401);
    assert.equal(
      unauthenticatedCanonicalSessionProbe.headers.get('www-authenticate'),
      AUTH_FIRST_VAULT_WWW_AUTHENTICATE,
    );

    for (const method of ['POST', 'GET', 'DELETE']) {
      const canonicalSessionOnVault = await crossRouteRequest({
        url: vaultUrl,
        sessionId: anonymousTransport.sessionId,
        method,
        authorization: authFirstToken,
      });
      assert.equal(canonicalSessionOnVault.status, 404, method);

      const vaultSessionOnCanonical = await crossRouteRequest({
        url: mcpUrl,
        sessionId: authenticatedTransport.sessionId,
        method,
      });
      assert.equal(vaultSessionOnCanonical.status, 404, method);
    }
    assert.equal(seedCalls, 1, 'cross-resource requests mutated the vault binding');
    assert.deepEqual(
      (await anonymousClient.listTools()).tools.map(({ name }) => name),
      OPEN_ANONYMOUS_TOOL_NAMES,
    );
    assert.deepEqual(
      (await authenticatedClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );

    for (const method of ['POST', 'GET', 'DELETE']) {
      const missingSessionBearer = await crossRouteRequest({
        url: vaultUrl,
        sessionId: authenticatedTransport.sessionId,
        method,
      });
      assert.equal(missingSessionBearer.status, 401, method);
      assert.equal(
        missingSessionBearer.headers.get('www-authenticate'),
        AUTH_FIRST_VAULT_WWW_AUTHENTICATE,
      );
    }
    assert.deepEqual(
      (await authenticatedClient.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );

    const authorizedDelete = await crossRouteRequest({
      url: vaultUrl,
      sessionId: authenticatedTransport.sessionId,
      method: 'DELETE',
      authorization: authFirstToken,
    });
    assert.equal(authorizedDelete.status, 200);
  } finally {
    await closeClient(anonymousClient);
    await closeClient(authenticatedClient);
    await stopChild(child);
    await closeServer(dependencyServer);
  }
});

test('one HTTP session moves from guest setup challenge to an authorized wallet and twelve tools', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, {
    alg: 'ES256',
    kid: 'opendexter-setup-cycle-test',
    use: 'sig',
  });
  const now = Math.floor(Date.now() / 1_000);
  const token = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'b'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_VAULT_AUDIENCE)
    .setSubject('opendexter-setup-cycle-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const insufficientScopeToken = await new SignJWT({
    scope: 'openid',
    dexter_surface: 'b'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_VAULT_AUDIENCE)
    .setSubject('opendexter-setup-cycle-user')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  let seedCalls = 0;
  let seedCompleted = false;
  const dependencyServer = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/jwks') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/passkey-vault/pair/oauth-seed'
      ) {
        seedCalls += 1;
        for await (const _chunk of request) {
          // Consume the body before acknowledging the durable binding.
        }
        seedCompleted = true;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/passkey-vault/state'
      ) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          status: 'ready',
          vault: {
            vaultPda: 'test-vault-state-address',
            swigAddress: 'test-swig-state-address',
            receiveAddress: 'test-solana-receive-address',
            isActivated: false,
          },
          onchain: { usdcAtomic: '0' },
        }));
        return;
      }
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

  const openMcpPort = await reservePort();
  const output = { text: '' };
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPEN_MCP_PORT: String(openMcpPort),
      OPEN_MCP_TEST_VAULT_JWKS_URL: `${dependencyOrigin}/jwks`,
      DEXTER_API_URL: dependencyOrigin,
      X402_API_URL: dependencyOrigin,
      INTERNAL_DEXTERCARD_HMAC_SECRET: 'i'.repeat(32),
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'g'.repeat(32),
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output.text += chunk; });
  child.stderr.on('data', (chunk) => { output.text += chunk; });

  let client = null;
  try {
    await waitForStartup(child, openMcpPort, output);
    const mcpUrl = new URL(`http://127.0.0.1:${openMcpPort}/mcp`);
    const preflight = await fetch(mcpUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://grok.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, mcp-session-id, Content-Type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    assert.match(
      preflight.headers.get('access-control-allow-headers') || '',
      /Authorization/i,
    );
    for (const header of ['MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name']) {
      assert.match(
        preflight.headers.get('access-control-allow-headers') || '',
        new RegExp(header, 'i'),
      );
    }
    assert.match(
      preflight.headers.get('access-control-expose-headers') || '',
      /WWW-Authenticate/i,
    );

    let activeBearer = '';
    const exchanges = [];
    const recordingFetch = async (input, init = {}) => {
      const headers = new Headers(init.headers);
      if (activeBearer) headers.set('Authorization', `Bearer ${activeBearer}`);
      else headers.delete('Authorization');
      const response = await fetch(input, { ...init, headers });
      let requestMessage = null;
      if (typeof init.body === 'string') {
        try { requestMessage = JSON.parse(init.body); } catch { /* keep null */ }
      }
      let responseBody = null;
      if (response.status === 401 || response.status === 403) {
        responseBody = await response.clone().json();
      }
      exchanges.push({
        requestMessage,
        status: response.status,
        responseBody,
        wwwAuthenticate: response.headers.get('www-authenticate'),
        exposeHeaders: response.headers.get('access-control-expose-headers'),
      });
      return response;
    };
    const latestToolExchange = (name) => exchanges.findLast(
      ({ requestMessage }) => requestMessage?.method === 'tools/call'
        && requestMessage?.params?.name === name,
    );

    const transport = new StreamableHTTPClientTransport(mcpUrl, {
      fetch: recordingFetch,
    });
    client = new Client({
      name: 'opendexter-setup-cycle-test',
      version: '1.0.0',
    });
    await client.connect(transport);
    assert.ok(transport.sessionId);
    assert.deepEqual(
      (await client.listTools()).tools.map(({ name }) => name),
      OPEN_ANONYMOUS_TOOL_NAMES,
    );

    for (const [name, args] of [
      ['x402_search', { query: 'weather data' }],
      ['x402_check', { url: `${dependencyOrigin}/resource`, method: 'GET' }],
      ['x402_access', { url: `${dependencyOrigin}/resource`, method: 'GET' }],
    ]) {
      await client.callTool({ name, arguments: args });
      assert.equal(latestToolExchange(name)?.status, 200, name);
      assert.equal(latestToolExchange(name)?.wwwAuthenticate, null, name);
    }

    for (const name of ['x402_wallet', 'dexter_portfolio']) {
      await assert.rejects(
        () => client.callTool({ name, arguments: {} }),
        (error) => error?.code === 401,
      );
      const challenge = latestToolExchange(name);
      assert.equal(challenge.status, 401, name);
      assert.equal(challenge.wwwAuthenticate, VAULT_WWW_AUTHENTICATE, name);
      assert.match(challenge.exposeHeaders || '', /WWW-Authenticate/i, name);
      assert.deepEqual(challenge.responseBody, {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'authentication required' },
        id: challenge.requestMessage.id,
      }, name);
    }

    activeBearer = 'not-a-valid-vault-token';
    await assert.rejects(
      () => client.callTool({ name: 'x402_wallet', arguments: {} }),
      (error) => error?.code === 401,
    );
    assert.equal(
      latestToolExchange('x402_wallet').wwwAuthenticate,
      buildVaultWwwAuthenticate({
        error: 'invalid_token',
        errorDescription: 'Connect OpenDexter with a valid vault authorization to continue',
      }),
    );

    activeBearer = insufficientScopeToken;
    await assert.rejects(
      () => client.callTool({ name: 'x402_wallet', arguments: {} }),
      (error) => error?.code === 403,
    );
    assert.equal(latestToolExchange('x402_wallet').status, 403);
    assert.equal(
      latestToolExchange('x402_wallet').wwwAuthenticate,
      buildVaultWwwAuthenticate({
        error: 'insufficient_scope',
        errorDescription: 'Authorize OpenDexter with the vault scope to continue',
      }),
    );

    activeBearer = token;
    const wallet = await client.callTool({
      name: 'x402_wallet',
      arguments: {},
    });
    assert.equal(latestToolExchange('x402_wallet').status, 200);
    assert.equal(wallet.structuredContent.vault_status, 'initialized_not_active');
    assert.equal(wallet.structuredContent.user_bound, true);
    assert.equal(seedCompleted, true);
    assert.equal(seedCalls, 1);
    assert.deepEqual(
      (await client.listTools()).tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
  } finally {
    await closeClient(client);
    await stopChild(child);
    await closeServer(dependencyServer);
  }
});
