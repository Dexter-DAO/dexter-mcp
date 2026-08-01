import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  materializeOpenToolDescriptors,
  serializeOpenToolDescriptors,
  verifyOpenToolDescriptor,
  writeOpenToolDescriptor,
} from '../scripts/materialize-open-tool-descriptors.mjs';

const ANONYMOUS = [
  'x402_search',
  'x402_check',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
];

const PROMOTED = [
  'x402_fetch',
  'x402_status',
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

const CONNECTED = [
  'x402_search',
  'x402_check',
  'x402_fetch',
  'x402_status',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

test('importing the fixed materializer interface starts no server or reaper', () => {
  const scriptUrl = new URL(
    '../scripts/materialize-open-tool-descriptors.mjs',
    import.meta.url,
  );
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `await import(${JSON.stringify(scriptUrl.href)}); process.stdout.write('import-safe');`,
  ], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(output, 'import-safe');
});

test('source materializer emits one deterministic full hosted descriptor', async () => {
  const first = await materializeOpenToolDescriptors();
  const second = await materializeOpenToolDescriptors();
  assert.equal(
    serializeOpenToolDescriptors(first),
    serializeOpenToolDescriptors(second),
  );

  const descriptor = first;
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.kind, 'opendexter-hosted-tool-descriptors/v1');
  assert.deepEqual(descriptor.anonymousToolNames, ANONYMOUS);
  assert.deepEqual(descriptor.oauthPromotedToolNames, PROMOTED);
  assert.deepEqual(descriptor.connectedToolNames, CONNECTED);
  assert.deepEqual(descriptor.optionalOAuthToolNames, ['x402_check']);
  assert.deepEqual(descriptor.tools.map((tool) => tool.name), CONNECTED);

  for (const tool of descriptor.tools) {
    assert.equal(typeof tool.title, 'string', `${tool.name} title`);
    assert.ok(tool.title.length > 0, `${tool.name} title`);
    assert.equal(typeof tool.description, 'string', `${tool.name} description`);
    assert.ok(tool.description.length > 0, `${tool.name} description`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} input schema`);
    assert.equal(tool.outputSchema.type, 'object', `${tool.name} output schema`);
    assert.ok(tool.securitySchemes.length > 0, `${tool.name} security`);
    assert.ok(tool.visibility.length > 0, `${tool.name} visibility`);
    assert.equal(typeof tool.widgetAccessible, 'boolean', `${tool.name} widget`);
    for (const hint of [
      'readOnlyHint',
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
    ]) {
      assert.equal(typeof tool.annotations[hint], 'boolean', `${tool.name} ${hint}`);
    }
  }
});

test('descriptor check is byte-exact and refuses schema or OAuth drift', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'opendexter-descriptor-'));
  const descriptorPath = join(directory, 'open-tool-descriptors.json');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const descriptor = await materializeOpenToolDescriptors();
  const expected = serializeOpenToolDescriptors(descriptor);
  await writeOpenToolDescriptor({ descriptorPath, descriptor });
  assert.equal(readFileSync(descriptorPath, 'utf8'), expected);
  assert.equal(
    await verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    descriptorPath,
  );

  const schemaDrift = JSON.parse(expected);
  schemaDrift.tools[0].inputSchema = { type: 'string' };
  writeFileSync(descriptorPath, `${JSON.stringify(schemaDrift, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );

  const oauthDrift = JSON.parse(expected);
  oauthDrift.optionalOAuthToolNames = [];
  writeFileSync(descriptorPath, `${JSON.stringify(oauthDrift, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );
});

test('descriptor fields equal an actual finalized SDK tools/list projection', async (t) => {
  const [
    { Client },
    { InMemoryTransport },
    { createOpenMcpServer },
    { OPEN_TOOL_NAMES },
    { installCanonicalSecuritySchemeProjection },
  ] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/inMemory.js'),
    import('../open-mcp-server.mjs'),
    import('../lib/open-tool-contracts.mjs'),
    import('../lib/open-tool-auth.mjs'),
  ]);
  const server = createOpenMcpServer({
    includeResources: false,
    listedToolNames: () => OPEN_TOOL_NAMES,
  });
  const client = new Client({ name: 'descriptor-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const wireMessages = [];
  const rawSend = serverTransport.send.bind(serverTransport);
  serverTransport.send = (message, options) => {
    wireMessages.push(message);
    return rawSend(message, options);
  };
  installCanonicalSecuritySchemeProjection(serverTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const descriptor = await materializeOpenToolDescriptors();
  await client.listTools();
  const wireTools = wireMessages.find(
    (message) => Array.isArray(message?.result?.tools),
  )?.result?.tools;
  assert.ok(wireTools);
  const listed = wireTools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
    securitySchemes: tool.securitySchemes,
    visibility: tool._meta?.ui?.visibility,
    widgetAccessible: tool._meta?.['openai/widgetAccessible'],
  }));
  assert.deepEqual(descriptor.tools, listed);
});

test('descriptor materialization refuses unfinalized, missing, or disabled tools', async () => {
  const [
    { McpServer },
    {
      OPEN_TOOL_NAMES,
      buildHostedOpenToolDescriptor,
      finalizeOpenToolContracts,
      installOpenToolContracts,
    },
  ] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('../lib/open-tool-contracts.mjs'),
  ]);
  const server = new McpServer({ name: 'descriptor-failure-test', version: '1' });
  installOpenToolContracts(server);
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /must be installed and finalized/,
  );
  for (const name of OPEN_TOOL_NAMES) {
    server.registerTool(name, { inputSchema: {} }, async () => ({ content: [] }));
  }
  finalizeOpenToolContracts(server);

  const first = OPEN_TOOL_NAMES[0];
  const registered = server.__openToolContractRegistry.get(first);
  server.__openToolContractRegistry.delete(first);
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /is not enabled in the executable registry/,
  );
  server.__openToolContractRegistry.set(first, registered);
  registered.enabled = false;
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /is not enabled in the executable registry/,
  );
});

test('direct server execution still binds and serves health', async (t) => {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => (
    error ? reject(error) : resolve()
  )));
  assert.ok(port);

  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../open-mcp-server.mjs', import.meta.url)),
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      OPEN_MCP_PORT: String(port),
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`OpenDexter server did not start: ${output}`)),
      8_000,
    );
    const poll = () => {
      if (output.includes(`listening on :${port}`)) {
        clearTimeout(timeout);
        resolve();
      } else if (child.exitCode !== null) {
        clearTimeout(timeout);
        reject(new Error(`OpenDexter server exited early: ${output}`));
      } else {
        setTimeout(poll, 20);
      }
    };
    poll();
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, 'OpenDexter');
  assert.deepEqual(body.tools, CONNECTED);
});
