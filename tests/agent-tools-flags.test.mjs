// The codex_* tools run the Codex CLI on the server and the studio_* tools
// start a coding agent there with every permission granted. Each group is
// registered only when its own variable is exactly "1".
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMcpServer } from '../common.mjs';
import { readExpectedOpenReleaseRoster } from '../lib/open-release-identity.mjs';
import {
  CODEX_TOOLS_ENABLE_ENV,
  SEALED_PRIVATE_TOOLSET_PROFILE,
  STUDIO_TOOLS_ENABLE_ENV,
  codexToolsEnabled,
  registerSelectedToolsets,
  studioToolsEnabled,
} from '../toolsets/index.mjs';

const CODEX_TOOL_NAMES = ['codex_start', 'codex_reply', 'codex_exec'];
const STUDIO_TOOL_NAMES = [
  'studio_create',
  'studio_status',
  'studio_cancel',
  'studio_inspect',
  'studio_list',
  'studio_breaking_news',
  'studio_news_status',
];
const GROUPS = [
  { key: 'codex', env: CODEX_TOOLS_ENABLE_ENV, enabled: codexToolsEnabled, tools: CODEX_TOOL_NAMES },
  { key: 'studio', env: STUDIO_TOOLS_ENABLE_ENV, enabled: studioToolsEnabled, tools: STUDIO_TOOL_NAMES },
];

function setFlags(t, values) {
  const previous = Object.fromEntries(GROUPS.map(({ env }) => [env, process.env[env]]));
  const apply = (next) => {
    for (const { env } of GROUPS) {
      if (next[env] === undefined) delete process.env[env];
      else process.env[env] = next[env];
    }
  };
  apply(values);
  t.after(() => apply(previous));
  return apply;
}

function recordingServer() {
  const server = {
    _registeredTools: {},
    registerTool(name, definition, handler) {
      server._registeredTools[name] = { definition, handler };
    },
  };
  return server;
}

async function sealedRoster() {
  const server = await buildMcpServer({ profile: SEALED_PRIVATE_TOOLSET_PROFILE });
  const names = Object.keys(server._registeredTools ?? {});
  try { await server.close(); } catch {}
  return names;
}

test('each flag is on only for the exact value 1', () => {
  assert.equal(CODEX_TOOLS_ENABLE_ENV, 'DEXTER_MCP_ENABLE_CODEX_TOOLS');
  assert.equal(STUDIO_TOOLS_ENABLE_ENV, 'DEXTER_MCP_ENABLE_STUDIO_TOOLS');
  for (const { env, enabled } of GROUPS) {
    assert.equal(enabled({}), false, env);
    for (const value of ['', '0', 'true', 'TRUE', 'yes', 'on', '2', '01', 'enabled']) {
      assert.equal(enabled({ [env]: value }), false, `${env}=${JSON.stringify(value)}`);
    }
    assert.equal(enabled({ [env]: '1' }), true, env);
    assert.equal(enabled({ [env]: ' 1 ' }), true, env);
  }
  // One flag never switches the other group on.
  assert.equal(codexToolsEnabled({ [STUDIO_TOOLS_ENABLE_ENV]: '1' }), false);
  assert.equal(studioToolsEnabled({ [CODEX_TOOLS_ENABLE_ENV]: '1' }), false);
});

test('with the flags unset, asking for either toolset by name registers nothing', async (t) => {
  setFlags(t, {});
  for (const { key } of GROUPS) {
    for (const selection of [[key], key, key.toUpperCase()]) {
      const server = recordingServer();
      await registerSelectedToolsets(server, selection);
      assert.deepEqual(Object.keys(server._registeredTools), [], JSON.stringify(selection));
      assert.deepEqual(server.__dexterLoadedToolsets, [], JSON.stringify(selection));
    }
  }
});

test('with its flag set to 1, a toolset registers exactly its own tools', async (t) => {
  const apply = setFlags(t, {});
  for (const { key, env, tools } of GROUPS) {
    apply({ [env]: '1' });
    const server = recordingServer();
    await registerSelectedToolsets(server, ['codex', 'studio']);
    assert.deepEqual(Object.keys(server._registeredTools), tools, key);
    assert.deepEqual(server.__dexterLoadedToolsets, [key], key);
  }
});

test('the sealed production roster has no codex or studio tools unless a flag is set', async (t) => {
  const apply = setFlags(t, {});
  const sealed = await sealedRoster();
  for (const name of [...CODEX_TOOL_NAMES, ...STUDIO_TOOL_NAMES]) {
    assert.equal(sealed.includes(name), false, name);
  }
  assert.equal(sealed.some((name) => /^(codex|studio)_/.test(name)), false);
  // The tools the outbound guard protects are still there, under the same names.
  for (const name of ['x402_pay', 'x402_fetch', 'x402_check', 'x402_search', 'x402_wallet']) {
    assert.equal(sealed.includes(name), true, name);
  }

  // The release build records this roster (it runs the same registration with
  // no flags), and the server refuses to start unless the roster it registers
  // is the same JSON. Without a flag the proof passes.
  const expected = readExpectedOpenReleaseRoster({
    DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(sealed),
  });
  const passesRosterProof = (actual) => JSON.stringify(expected) === JSON.stringify(actual);
  assert.equal(passesRosterProof(await sealedRoster()), true);

  // With either flag set the registered roster differs, so the proof fails
  // and the server stops instead of exposing the tools.
  for (const { env, tools } of GROUPS) {
    apply({ [env]: '1' });
    const withFlag = await sealedRoster();
    assert.equal(passesRosterProof(withFlag), false, env);
    assert.deepEqual(withFlag.filter((name) => tools.includes(name)), tools, env);
    assert.deepEqual(
      withFlag.filter((name) => !tools.includes(name)),
      sealed,
      `${env}: every other tool keeps its name and its place`,
    );
  }
});
