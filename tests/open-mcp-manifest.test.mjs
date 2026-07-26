import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOpenMcpManifest, OPEN_MCP_VERSION } from '../lib/open-mcp-manifest.mjs';
import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
} from '../lib/open-tool-auth.mjs';

test('well-known manifest is generated from the exact ten-tool contract', () => {
  const manifest = buildOpenMcpManifest();
  assert.equal(manifest.name, 'OpenDexter');
  assert.equal(manifest.namespace, 'opendexter');
  assert.equal(manifest.url, OPEN_MCP_VAULT_AUDIENCE);
  assert.equal(manifest.auth.protectedResourceMetadata, OPEN_MCP_PRM_URL);
  assert.equal(manifest.auth.authorizationServer, OPEN_MCP_AUTHORIZATION_SERVER);
  assert.deepEqual(manifest.auth.protectedTools, [
    'x402_pay',
    'x402_fetch',
    'x402_wallet',
    'promote_skill',
    'dexter_passkey',
  ]);
  assert.deepEqual(manifest.auth.conditionallyProtectedTools, [
    { name: 'x402_compose_skill', when: 'publish=true' },
  ]);
  assert.deepEqual(manifest.tools.map((tool) => tool.name), OPEN_TOOL_NAMES);
  assert.equal(manifest.tools.length, 10);
  assert.doesNotMatch(JSON.stringify(manifest), /card_status|best funded chain/i);
});

test('manifest, server identity, and package use one release version', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const serverSource = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(OPEN_MCP_VERSION, packageJson.version);
  assert.match(serverSource, /version: OPEN_MCP_VERSION/);
  assert.match(serverSource, /JSON\.stringify\(buildOpenMcpManifest\(\)\)/);
  assert.doesNotMatch(serverSource, /version: '1\.3\.0'/);
});
