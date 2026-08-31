import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOpenMcpManifest, OPEN_MCP_VERSION } from '../lib/open-mcp-manifest.mjs';
import {
  OPEN_ANONYMOUS_TOOL_NAMES,
  OPEN_OAUTH_PROMOTED_TOOL_NAMES,
  OPEN_TOOL_NAMES,
} from '../lib/open-tool-contracts.mjs';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
  OPEN_MCP_PRM,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
  buildOpenMcpAuthorizationServerMetadata,
} from '../lib/open-tool-auth.mjs';

test('well-known manifest advertises the cumulative five-to-twelve OAuth contract', () => {
  const manifest = buildOpenMcpManifest();
  assert.equal(manifest.name, 'OpenDexter');
  assert.equal(manifest.namespace, 'opendexter');
  assert.equal(manifest.url, OPEN_MCP_VAULT_AUDIENCE);
  assert.equal(manifest.auth.protectedResourceMetadata, OPEN_MCP_PRM_URL);
  assert.equal(manifest.auth.authorizationServer, OPEN_MCP_AUTHORIZATION_SERVER);
  assert.deepEqual(OPEN_MCP_PRM.scopes_supported, ['vault']);
  assert.deepEqual(
    buildOpenMcpAuthorizationServerMetadata(
      new URL(OPEN_MCP_AUTHORIZATION_SERVER_METADATA).pathname,
    ).scopes_supported,
    ['vault'],
  );
  assert.deepEqual(manifest.auth.protectedTools, [
    'x402_fetch',
    'x402_status',
    'x402_wallet',
    'dexter_portfolio',
    'dexter_prepare_asset_action',
    'dexter_execute_asset_action',
    'dexter_asset_action_status',
    'dexter_reconcile_asset_action',
    'dexter_wallet_history',
  ]);
  assert.deepEqual(manifest.auth.conditionallyProtectedTools, [
    'x402_check',
    'x402_access',
  ]);
  assert.deepEqual(manifest.rosters.anonymous, OPEN_ANONYMOUS_TOOL_NAMES);
  assert.deepEqual(manifest.rosters.oauthPromotes, OPEN_OAUTH_PROMOTED_TOOL_NAMES);
  assert.deepEqual(manifest.rosters.connected, OPEN_TOOL_NAMES);
  assert.equal(manifest.rosters.anonymous.length, 5);
  assert.equal(manifest.rosters.oauthPromotes.length, 7);
  assert.deepEqual(manifest.tools.map((tool) => tool.name), OPEN_TOOL_NAMES);
  assert.equal(manifest.tools.length, 12);
  assert.match(manifest.description, /autonomous governed Buy and Sell/);
  assert.match(manifest.description, /preserved Send input fails closed at Prepare/);
  assert.match(manifest.description, /exact Prepare response is authoritative/);
  assert.equal(
    manifest.tools.some((tool) => tool.name === 'dexter_authorize_asset_action'),
    false,
  );
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
  assert.equal(OPEN_MCP_VERSION, '0.5.0');
  assert.equal(OPEN_MCP_VERSION, packageJson.version);
  assert.equal(OPEN_MCP_VERSION, dependencyTrain.hostedPackage.version);
  assert.equal(packageJson.packageManager, 'npm@10.9.3');
  assert.equal(packageJson.engines.node, '^20.19.0 || >=22.12.0');
  assert.equal(
    packageJson.dependencies['@dexterai/mcp-instructions'],
    '2.4.2-rc.1',
  );
  assert.equal(
    packageJson.dependencies['@dexterai/x402-mcp-tools'],
    '0.9.0-rc.2',
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
    /^npm run verify:release:runtime && npm run verify:release:installed /,
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

test('hosted source documentation states the current opaque-intent product contract', async () => {
  const [readme, currentContract] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../docs/contracts/OPENDXTER-OPAQUE-INTENT-V1.md',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

  for (const name of OPEN_TOOL_NAMES) {
    assert.ok(currentContract.includes(`\`${name}\``), name);
  }
  assert.match(currentContract, /twelve(?:-tool| tools)/i);

  for (const name of [
    'x402_search',
    'x402_fetch',
    'x402_status',
    'x402_check',
    'x402_access',
    'x402_wallet',
    'dexter_portfolio',
    'dexter_prepare_asset_action',
    'dexter_execute_asset_action',
    'dexter_asset_action_status',
    'dexter_reconcile_asset_action',
    'dexter_wallet_history',
  ]) {
    assert.ok(readme.includes(`\`${name}\``), name);
  }
  assert.match(readme, /complete connected roster/i);
  assert.match(readme, /replaces only\s+`dexter-open-mcp`/i);
  assert.match(readme, /legacy `dexter-mcp` PID, path,\s+configuration, and restart counters remain unchanged/i);
  assert.doesNotMatch(readme, /deletes both named PM2\s+processes/i);
  assert.doesNotMatch(
    readme,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );

  for (const source of [readme, currentContract]) {
    assert.match(source, /scope=vault/);
    assert.match(source, /intentId/);
    assert.doesNotMatch(source, /caller-carried PreparedPurchase/i);
    assert.match(source, /protected_agent_send_sdk_required/);
    assert.match(source, /before capacity reservation\s+or intent\s+creation/);
    assert.match(source, /must not call\s+Execute or Reconcile|do not call\s+Execute or Reconcile/i);
  }
});
