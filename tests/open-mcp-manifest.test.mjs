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

test('well-known manifest is generated from the exact eleven-tool contract', () => {
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
    'dexter_portfolio',
    'promote_skill',
    'dexter_passkey',
  ]);
  assert.deepEqual(manifest.auth.conditionallyProtectedTools, [
    { name: 'x402_compose_skill', when: 'publish=true' },
  ]);
  assert.deepEqual(manifest.tools.map((tool) => tool.name), OPEN_TOOL_NAMES);
  assert.equal(manifest.tools.length, 11);
  assert.doesNotMatch(JSON.stringify(manifest), /card_status|best funded chain/i);
});

test('manifest, server identity, and package use one release version', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const packageLock = JSON.parse(
    await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const serverSource = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(OPEN_MCP_VERSION, '0.3.0');
  assert.equal(OPEN_MCP_VERSION, packageJson.version);
  assert.equal(OPEN_MCP_VERSION, packageLock.version);
  assert.equal(OPEN_MCP_VERSION, packageLock.packages[''].version);
  assert.equal(
    packageJson.dependencies['@dexterai/mcp-instructions'],
    '^2.3.0',
  );
  assert.equal(
    packageLock.packages[''].dependencies['@dexterai/mcp-instructions'],
    '^2.3.0',
  );
  assert.equal(
    packageJson.dependencies['@dexterai/x402-mcp-tools'],
    '^0.7.1',
  );
  assert.equal(
    packageLock.packages[''].dependencies['@dexterai/x402-mcp-tools'],
    '^0.7.1',
  );
  const lockedTools =
    packageLock.packages['node_modules/@dexterai/x402-mcp-tools'];
  assert.equal(lockedTools.version, '0.7.1');
  assert.equal(Object.hasOwn(lockedTools, 'resolved'), false);
  assert.equal(Object.hasOwn(lockedTools, 'integrity'), false);
  assert.equal(
    Object.hasOwn(
      lockedTools.dependencies,
      '@dexterai/mcp-instructions',
    ),
    false,
  );
  const lockedInstructions =
    packageLock.packages['node_modules/@dexterai/mcp-instructions'];
  assert.equal(
    lockedInstructions.version,
    '2.3.0',
  );
  assert.equal(Object.hasOwn(lockedInstructions, 'resolved'), false);
  assert.equal(Object.hasOwn(lockedInstructions, 'integrity'), false);
  assert.doesNotMatch(
    JSON.stringify(lockedInstructions),
    /mcp-instructions-2\.2\.0|QGILUyt2SoHk0AQdtdEdLa4rUgHtgjWm/,
  );
  assert.match(serverSource, /version: OPEN_MCP_VERSION/);
  assert.match(serverSource, /JSON\.stringify\(buildOpenMcpManifest\(\)\)/);
  assert.match(
    serverSource,
    /import \{ createRemoteCardOperations \} from '@dexterai\/x402-mcp-tools'/,
  );
  assert.doesNotMatch(
    serverSource,
    /\bcomposeCardTools\b|\bregisterCard(?:Status|Issue|Freeze|LinkWallet)Tool\b/,
  );
  assert.doesNotMatch(serverSource, /version: '1\.3\.0'/);
});

test('hosted source documentation names the eleven-tool mixed-auth contract', async () => {
  const [readme, releaseGate] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../docs/releases/OPENDXTER-RELEASE-GATE-2026-07-26.md',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  for (const source of [readme, releaseGate]) {
    for (const name of OPEN_TOOL_NAMES) {
      assert.ok(source.includes(`\`${name}\``), name);
    }
    assert.match(source, /eleven/i);
    assert.match(source, /scope=vault/);
    assert.match(source, /session-bound/i);
    assert.doesNotMatch(source, /public, no-auth|ephemeral session/i);
  }
});
