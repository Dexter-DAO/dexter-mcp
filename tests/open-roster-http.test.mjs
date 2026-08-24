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
import { OPEN_MCP_VAULT_AUDIENCE } from '../lib/open-tool-auth.mjs';

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

test('HTTP discovery lists five anonymously and twelve immediately after Bearer initialization', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, {
    alg: 'ES256',
    kid: 'opendexter-roster-test',
    use: 'sig',
  });
  const now = Math.floor(Date.now() / 1_000);
  const token = await new SignJWT({
    scope: 'vault',
    dexter_surface: 'a'.repeat(64),
  })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid })
    .setIssuer('https://dexter.cash')
    .setAudience(OPEN_MCP_VAULT_AUDIENCE)
    .setSubject('opendexter-roster-test-user')
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
          // Consume the body before delaying the response.
        }
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
  let authenticatedClient = null;
  try {
    await waitForStartup(child, openMcpPort, output);
    const mcpUrl = new URL(`http://127.0.0.1:${openMcpPort}/mcp`);

    anonymousClient = new Client({
      name: 'anonymous-roster-test',
      version: '1.0.0',
    });
    await anonymousClient.connect(new StreamableHTTPClientTransport(mcpUrl));
    assert.deepEqual(
      (await anonymousClient.listTools()).tools.map(({ name }) => name),
      OPEN_ANONYMOUS_TOOL_NAMES,
    );
    await closeClient(anonymousClient);
    anonymousClient = null;

    authenticatedClient = new Client({
      name: 'authenticated-roster-test',
      version: '1.0.0',
    });
    await authenticatedClient.connect(new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }));

    const authenticatedTools = await authenticatedClient.listTools();
    assert.equal(seedCompleted, true, 'tools/list returned before vault binding completed');
    assert.equal(seedCalls, 1);
    assert.deepEqual(
      authenticatedTools.tools.map(({ name }) => name),
      OPEN_TOOL_NAMES,
    );
  } finally {
    await closeClient(anonymousClient);
    await closeClient(authenticatedClient);
    await stopChild(child);
    await closeServer(dependencyServer);
  }
});
