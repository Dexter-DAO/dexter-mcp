import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRYPOINT = fileURLToPath(new URL('../open-mcp-server.mjs', import.meta.url));
const LINK_TOKEN = `dlt_${'a'.repeat(48)}`;

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

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function startOpenMcp(traceValue) {
  const dependencyServer = createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (
      request.method === 'POST'
      && url.pathname === '/api/passkey-vault/pair/link-token/bind'
    ) {
      for await (const _chunk of request) {
        // Consume the authenticated bind request before acknowledging it.
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, user_handle: 'trace-runtime-user' }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false }));
  });
  const dependencyAddress = await listen(dependencyServer);
  const dependencyPort = typeof dependencyAddress === 'object' && dependencyAddress
    ? dependencyAddress.port
    : null;
  assert.ok(dependencyPort);

  const port = await reservePort();
  const output = { text: '' };
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    OPEN_MCP_PORT: String(port),
    OPEN_MCP_LOG_REDACTION_KEY: 'trace-test-redaction-key',
    DEXTER_API_URL: `http://127.0.0.1:${dependencyPort}`,
    INTERNAL_DEXTERCARD_HMAC_SECRET: 'i'.repeat(32),
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'g'.repeat(32),
    SENTRY_DSN: '',
    SENTRY_OPEN_MCP_DSN: '',
  };
  if (traceValue === undefined) delete env.OPEN_MCP_CONNECTION_TRACE;
  else env.OPEN_MCP_CONNECTION_TRACE = traceValue;
  const child = spawn(process.execPath, [ENTRYPOINT], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output.text += chunk; });
  child.stderr.on('data', (chunk) => { output.text += chunk; });

  const deadline = Date.now() + 8_000;
  while (!output.text.includes(`listening on :${port}`)) {
    if (child.exitCode !== null) {
      throw new Error(`OpenDexter exited before startup: ${output.text}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`OpenDexter did not start: ${output.text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { child, dependencyServer, output, port };
}

async function initialize(port, secretPrefix) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json; charset=utf-8',
      Cookie: `session=${secretPrefix}-cookie`,
      'Mcp-Method': 'initialize',
      'Mcp-Name': `${secretPrefix}-name`,
      Origin: `https://${secretPrefix}.example`,
      'User-Agent': `${secretPrefix}-user-agent`,
      'x-dexter-link-token': LINK_TOKEN,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${secretPrefix}-request-id`,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: { secret: `${secretPrefix}-capability` },
        clientInfo: {
          name: `${secretPrefix}-client-name`,
          version: `${secretPrefix}-client-version`,
        },
        prompt: `${secretPrefix}-prompt`,
        arguments: { value: `${secretPrefix}-argument` },
      },
    }),
  });
}

test('explicitly enabled HTTP trace records one redacted authenticated initialize', async () => {
  const secretPrefix = 'trace-http-secret';
  const fixture = await startOpenMcp('1');
  try {
    const response = await initialize(fixture.port, secretPrefix);
    assert.equal(response.status, 200);
    await response.text();

    const traceLines = fixture.output.text
      .split('\n')
      .filter((line) => line.includes('[open-mcp] connection trace'));
    const freshLines = traceLines.filter((line) => line.includes('"event":"fresh_request"'));
    const initializedLines = traceLines.filter(
      (line) => line.includes('"event":"session_initialized"'),
    );
    assert.equal(freshLines.length, 1, fixture.output.text);
    assert.equal(initializedLines.length, 1, fixture.output.text);
    assert.match(freshLines[0], /"rpcMethod":"initialize"/);
    assert.match(freshLines[0], /"authorization":"absent"/);
    assert.match(freshLines[0], /"mcpMethod":"initialize"/);
    assert.match(freshLines[0], /"mcpName":"present"/);
    assert.match(freshLines[0], /"cookie":"present"/);
    assert.match(freshLines[0], /"origin":"present"/);
    assert.match(initializedLines[0], /"sessionRef":"[0-9a-f]{12}"/);
    assert.equal(fixture.output.text.includes(secretPrefix), false, fixture.output.text);
    assert.equal(fixture.output.text.includes(LINK_TOKEN), false, fixture.output.text);
  } finally {
    await stopChild(fixture.child);
    await closeServer(fixture.dependencyServer);
  }
});

test('HTTP trace emits no diagnostic when the setting is absent', async () => {
  const fixture = await startOpenMcp(undefined);
  try {
    const response = await initialize(fixture.port, 'default-off-trace-secret');
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(
      fixture.output.text.includes('[open-mcp] connection trace'),
      false,
      fixture.output.text,
    );
  } finally {
    await stopChild(fixture.child);
    await closeServer(fixture.dependencyServer);
  }
});
