import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOpenMcpManifest, OPEN_MCP_VERSION } from '../lib/open-mcp-manifest.mjs';
import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
} from '../lib/open-tool-auth.mjs';

test('well-known manifest is generated from the exact six-tool contract', () => {
  const manifest = buildOpenMcpManifest();
  assert.equal(manifest.name, 'OpenDexter');
  assert.equal(manifest.namespace, 'opendexter');
  assert.equal(manifest.url, OPEN_MCP_VAULT_AUDIENCE);
  assert.equal(manifest.auth.protectedResourceMetadata, OPEN_MCP_PRM_URL);
  assert.equal(manifest.auth.authorizationServer, OPEN_MCP_AUTHORIZATION_SERVER);
  assert.deepEqual(manifest.auth.protectedTools, [
    'x402_fetch',
    'x402_wallet',
    'dexter_portfolio',
  ]);
  assert.deepEqual(manifest.auth.conditionallyProtectedTools, []);
  assert.deepEqual(manifest.tools.map((tool) => tool.name), OPEN_TOOL_NAMES);
  assert.equal(manifest.tools.length, 6);
  assert.doesNotMatch(JSON.stringify(manifest), /card_status|best funded chain/i);
});

test('manifest, server identity, and package use one release version', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const dependencyTrain = JSON.parse(
    await readFile(
      new URL('../release/opendexter-dependency-train.json', import.meta.url),
      'utf8',
    ),
  );
  const serverSource = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(OPEN_MCP_VERSION, '0.3.0');
  assert.equal(OPEN_MCP_VERSION, packageJson.version);
  assert.equal(OPEN_MCP_VERSION, dependencyTrain.hostedPackage.version);
  assert.equal(packageJson.packageManager, 'npm@10.9.3');
  assert.equal(packageJson.engines.node, '^20.19.0 || >=22.12.0');
  assert.equal(
    packageJson.dependencies['@dexterai/mcp-instructions'],
    '2.4.0',
  );
  assert.equal(
    packageJson.dependencies['@dexterai/x402-mcp-tools'],
    '0.8.0',
  );
  assert.equal(
    packageJson.dependencies['@modelcontextprotocol/sdk'],
    '1.29.0',
  );
  assert.equal(packageJson.dependencies.zod, '3.25.76');
  assert.equal(
    packageJson.scripts['build:apps-sdk:local'],
    'vite build --config apps-sdk/vite.config.ts',
  );
  assert.match(
    packageJson.scripts['deploy:mcp'],
    /^npm run verify:release:runtime && npm run verify:release:lock/,
  );
  await assert.rejects(access(new URL('../pnpm-lock.yaml', import.meta.url)));
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

test('hosted source documentation states one exact six-tool product contract', async () => {
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

  for (const name of OPEN_TOOL_NAMES) {
    assert.ok(releaseGate.includes(`\`${name}\``), name);
  }
  assert.match(releaseGate, /six-tool/i);

  for (const name of [
    'x402_search',
    'x402_fetch',
    'x402_check',
    'x402_access',
    'x402_wallet',
    'dexter_portfolio',
  ]) {
    assert.ok(readme.includes(`\`${name}\``), name);
  }
  assert.match(readme, /Every MCP client receives the same six-tool product roster/i);
  assert.doesNotMatch(
    readme,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );

  for (const source of [readme, releaseGate]) {
    assert.match(source, /scope=vault/);
    assert.match(source, /session-bound/i);
    assert.doesNotMatch(source, /public, no-auth|ephemeral session/i);
  }
});
