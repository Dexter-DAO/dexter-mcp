import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = fileURLToPath(new URL('..', import.meta.url));
async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('private server supports authenticated SDK initialization and session reconnection', { timeout: 25_000 }, async t => {
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const child = spawn(process.execPath, ['http-server-oauth.mjs'], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      TOKEN_AI_MCP_PORT: String(port),
      TOKEN_AI_MCP_TOKEN: 'private-compat-test-only',
      TOKEN_AI_MCP_OAUTH: 'false',
      TOKEN_AI_MCP_TOOLSETS: 'general',
      DEXTER_API_BASE_URL: base,
      API_BASE_URL: base,
      TOKEN_AI_MCP_PUBLIC_URL: base,
      MCP_SESSION_METRICS_INTERVAL_MS: '0',
      MCP_SESSION_REAPER_INTERVAL_MS: '0',
      MCP_CONNECTION_TRACE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });
  const deadline = Date.now() + 10_000;
  let ready = false;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, output);
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.ok(ready, output);
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'private-compat', version: '1' },
  } };
  const rejected = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify(init) });
  assert.equal(rejected.status, 401);
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: 'Bearer private-compat-test-only' } },
  });
  const client = new Client({ name: 'private-compat', version: '1' });
  t.after(() => client.close());
  await client.connect(transport);
  const sessionId = transport.sessionId;
  assert.ok(sessionId);
  const first = await client.listTools();
  assert.ok(first.tools.some(tool => tool.name === 'search'));
  await client.close();
  const resumed = await fetch(`${base}/mcp`, { method: 'POST', headers: {
    ...headers, authorization: 'Bearer private-compat-test-only',
    'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25',
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 22, method: 'tools/list', params: {} }) });
  assert.equal(resumed.status, 200);
  const responseText = await resumed.text();
  const response = responseText.startsWith('event:') || responseText.startsWith('data:')
    ? JSON.parse(responseText.split('\n').find(line => line.startsWith('data:')).slice(5))
    : JSON.parse(responseText);
  assert.equal(response.id, 22);
  assert.deepEqual(response.result.tools.map(tool => tool.name), first.tools.map(tool => tool.name));
  const unknown = await fetch(`${base}/mcp`, { method: 'POST', headers: {
    ...headers, authorization: 'Bearer private-compat-test-only', 'mcp-session-id': 'unknown-compat-session',
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 23, method: 'tools/list', params: {} }) });
  assert.equal(unknown.status, 400);
});
