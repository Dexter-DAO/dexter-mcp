import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { McpUiHostStylesSchema } from '@modelcontextprotocol/ext-apps';

import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import {
  ACTIVE_RENDERER_RESOURCES,
  COMPATIBILITY_RENDERER_RESOURCES,
  MCP_APPS_HOST_TOKENS,
  TOOL_RENDERER_BEHAVIORS,
} from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, ROOT), 'utf8');
}

async function sha256(relativePath) {
  const bytes = await readFile(new URL(relativePath, ROOT));
  return createHash('sha256').update(bytes).digest('hex');
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function directRegistration(sourceText, toolName) {
  const marker = `registerOpenTool(server, '${toolName}'`;
  const start = sourceText.indexOf(marker);
  assert.notEqual(start, -1, `${toolName} is missing its executable registration`);
  const nextRegistration = sourceText.indexOf('registerOpenTool(server,', start + marker.length);
  const governedLoop = sourceText.indexOf("for (const operation of ['prepare'", start + marker.length);
  const candidates = [nextRegistration, governedLoop].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : sourceText.length;
  return sourceText.slice(start, end);
}

function selectedResourceBlock(sourceText) {
  const marker = 'registerAppsSdkResources(server, {';
  const start = sourceText.lastIndexOf(marker);
  assert.notEqual(start, -1, 'OpenDexter has no selected resource registration');
  const end = sourceText.indexOf('});', start);
  assert.notEqual(end, -1, 'OpenDexter selected resource registration is incomplete');
  return sourceText.slice(start, end + 3);
}

test('every current OpenDexter tool has one explicit renderer behavior', () => {
  const mappedTools = Object.keys(TOOL_RENDERER_BEHAVIORS);
  assert.deepEqual(
    mappedTools,
    [...OPEN_TOOL_NAMES],
    'The renderer inventory must move in lockstep with the executable OpenDexter roster',
  );

  for (const toolName of OPEN_TOOL_NAMES) {
    const behavior = TOOL_RENDERER_BEHAVIORS[toolName];
    assert.ok(behavior, `${toolName} has no renderer behavior`);
    assert.equal(
      typeof behavior.resourceUri,
      'string',
      `${toolName} has no concrete renderer resource URI`,
    );
    assert.match(behavior.resourceUri, /^ui:\/\/dexter\//);
    assert.ok(behavior.family, `${toolName} has no renderer family`);
  }

  assert.equal(OPEN_TOOL_NAMES.length, 12);
  const indexterBehavior = TOOL_RENDERER_BEHAVIORS.x402_search;
  const indexterResource = ACTIVE_RENDERER_RESOURCES.find(
    ({ family }) => family === 'indexter-search',
  );
  assert.equal(indexterBehavior.resourceToken, 'INDEXTER_WIDGET_URIS.search');
  assert.equal(indexterBehavior.metadataName, 'SEARCH_META');
  assert.equal(indexterBehavior.resourceUri, indexterResource?.resourceUri);
  assert.equal(indexterResource?.file, 'indexter-search.html');
  assert.match(
    indexterBehavior.resourceUri,
    /^ui:\/\/dexter\/indexter-search(?:-[a-f0-9]{8})?$/,
    'Current discovery must stay on the Indexter renderer contract',
  );
  assert.equal(
    ACTIVE_RENDERER_RESOURCES.some(({ file }) => file === 'x402-marketplace-search.html'),
    false,
    'The retired x402 search entrypoint must not re-enter the current inventory',
  );
  assert.deepEqual(
    unique(OPEN_TOOL_NAMES.map((name) => TOOL_RENDERER_BEHAVIORS[name].family)),
    [
      'indexter-search',
      'access-terms',
      'purchase-result',
      'purchase-status',
      'dexter-wallet',
      'portfolio',
      'governed-action',
      'governed-history',
    ],
  );
});

test('the executable server attaches the inventoried renderer metadata', async () => {
  const server = await source('open-mcp-server.mjs');
  const governedStart = server.indexOf('const GOVERNED_ASSET_META');
  const governedEnd = server.indexOf('// Card and compatibility tools', governedStart);
  assert.ok(governedStart >= 0 && governedEnd > governedStart);
  const governedMetadata = server.slice(governedStart, governedEnd);

  for (const [toolName, behavior] of Object.entries(TOOL_RENDERER_BEHAVIORS)) {
    if (behavior.metadataName.startsWith('GOVERNED_ASSET_META.')) {
      const operation = behavior.metadataName.split('.')[1];
      assert.match(
        governedMetadata,
        new RegExp(
          `${escapeRegExp(operation)}:\\s*readOnlyResultWidgetMeta\\(\\s*${escapeRegExp(behavior.resourceToken)}`,
        ),
        `${toolName} metadata is not attached to ${behavior.resourceToken}`,
      );
      continue;
    }

    const registration = directRegistration(server, toolName);
    assert.match(
      registration,
      new RegExp(`_meta:\\s*${escapeRegExp(behavior.metadataName)}\\b`),
      `${toolName} does not use ${behavior.metadataName}`,
    );
    assert.match(
      server,
      new RegExp(
        `const\\s+${escapeRegExp(behavior.metadataName)}\\s*=[\\s\\S]{0,700}?${escapeRegExp(behavior.resourceToken)}`,
      ),
      `${behavior.metadataName} does not resolve to ${behavior.resourceToken}`,
    );
  }

  const loopStart = server.indexOf("for (const operation of ['prepare'");
  const loopEnd = server.indexOf('// Card and compatibility tools', loopStart);
  const governedRegistration = server.slice(loopStart, loopEnd);
  assert.match(
    governedRegistration,
    /\['prepare', 'execute', 'status', 'reconcile', 'history'\]/,
  );
  assert.match(governedRegistration, /_meta:\s*GOVERNED_ASSET_META\[operation\]/);
});

test('the hosted resource allowlist contains only current renderers and retained passkey resources', async () => {
  const [server, registration, vite] = await Promise.all([
    source('open-mcp-server.mjs'),
    source('apps-sdk/register.mjs'),
    source('apps-sdk/vite.config.ts'),
  ]);
  const resources = [
    ...ACTIVE_RENDERER_RESOURCES,
    ...COMPATIBILITY_RENDERER_RESOURCES,
  ];
  const expectedTokens = unique(resources.map(({ resourceToken }) => resourceToken)).sort();
  const allowlist = selectedResourceBlock(server);
  const actualTokens = unique(
    [...allowlist.matchAll(
      /\b(?:INDEXTER|X402|PORTFOLIO|GOVERNED_ASSET|DIAGNOSTIC|PASSKEY)_WIDGET_URIS\.[A-Za-z]+/g,
    )].map(([token]) => token),
  ).sort();

  assert.deepEqual(
    actualTokens,
    expectedTokens,
    'Historical renderer entrypoints must stay outside the hosted OpenDexter allowlist',
  );
  assert.doesNotMatch(
    allowlist,
    /\bX402_WIDGET_URIS\.search\b/,
    'The hosted server must not publish the retired x402 search resource',
  );

  for (const resource of resources) {
    assert.equal(
      typeof resource.resourceUri,
      'string',
      `${resource.family} has no concrete resource URI`,
    );
    assert.match(
      registration,
      new RegExp(
        `templateUri:\\s*${escapeRegExp(resource.resourceToken)}[\\s\\S]{0,220}?file:\\s*'${escapeRegExp(resource.file)}'`,
      ),
      `${resource.family} is missing from Apps SDK resource registration`,
    );
    assert.match(
      vite,
      new RegExp(`['\"]${escapeRegExp(resource.file)}['\"]`),
      `${resource.file} is missing from the Vite entry list`,
    );
    await access(new URL(`apps-sdk/ui/${resource.file}`, ROOT));
    await access(new URL(`public/apps-sdk/${resource.file}`, ROOT));
  }

  assert.deepEqual(
    COMPATIBILITY_RENDERER_RESOURCES.map(({ family }) => family).sort(),
    ['passkey-onboard', 'passkey-probe'],
  );
});

test('current product lockups are the exact canonical masters', async () => {
  assert.deepEqual(
    await Promise.all([
      sha256('apps-sdk/ui/src/assets/indexter-wordmark.svg'),
      sha256('apps-sdk/ui/src/assets/dexter-wallet-lockup-light.svg'),
      sha256('apps-sdk/ui/src/assets/dexter-wallet-lockup-dark.svg'),
    ]),
    [
      '2c91fc2f4ac45d9e8f4212f5637271de159c138107b80ae6af53cbf208107b43',
      '97d0acfc43fb073ca6e3be587df43db0f8b3ae1551387f30ce5c84319e093173',
      'a4b8d0d3e321c29e51883cefaab21437ceff69752802fbab3fd771940b1858af',
    ],
    'Renderer brands must use the canonical Indexter and Dexter Wallet files without redraws',
  );

  const [indexterLockup, walletLockup] = await Promise.all([
    source('apps-sdk/ui/src/components/brand/IndexterLockup.tsx'),
    source('apps-sdk/ui/src/components/wallet/Lockup.tsx'),
  ]);
  assert.match(indexterLockup, /indexter-wordmark\.svg\?url/);
  assert.doesNotMatch(indexterLockup, /reversed|<svg/i);
  assert.match(walletLockup, /dexter-wallet-lockup-light\.svg\?url/);
  assert.match(walletLockup, /dexter-wallet-lockup-dark\.svg\?url/);
  assert.doesNotMatch(walletLockup, /<svg/i);
});

test('gallery host palettes use only exact MCP Apps style variable names', () => {
  for (const [theme, variables] of Object.entries(MCP_APPS_HOST_TOKENS)) {
    assert.doesNotThrow(
      () => McpUiHostStylesSchema.parse({ variables }),
      `${theme} gallery variables must use the MCP Apps token vocabulary`,
    );
    assert.ok(Object.keys(variables).length >= 60);
  }
});
