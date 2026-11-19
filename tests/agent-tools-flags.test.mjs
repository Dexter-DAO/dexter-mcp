// The codex_* tools run the Codex CLI on the server. They are registered only
// when DEXTER_MCP_ENABLE_CODEX_TOOLS is exactly "1".
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMcpServer } from '../common.mjs';
import {
  CODEX_TOOLS_ENABLE_ENV,
  SEALED_PRIVATE_TOOLSET_PROFILE,
  codexToolsEnabled,
  registerSelectedToolsets,
} from '../toolsets/index.mjs';

const CODEX_TOOL_NAMES = ['codex_start', 'codex_reply', 'codex_exec'];

function setFlag(t, value) {
  const previous = process.env[CODEX_TOOLS_ENABLE_ENV];
  if (value === undefined) delete process.env[CODEX_TOOLS_ENABLE_ENV];
  else process.env[CODEX_TOOLS_ENABLE_ENV] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[CODEX_TOOLS_ENABLE_ENV];
    else process.env[CODEX_TOOLS_ENABLE_ENV] = previous;
  });
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

test('the flag is on only for the exact value 1', () => {
  assert.equal(CODEX_TOOLS_ENABLE_ENV, 'DEXTER_MCP_ENABLE_CODEX_TOOLS');
  assert.equal(codexToolsEnabled({}), false);
  for (const value of ['', '0', 'true', 'TRUE', 'yes', 'on', '2', '01', 'enabled']) {
    assert.equal(codexToolsEnabled({ [CODEX_TOOLS_ENABLE_ENV]: value }), false, JSON.stringify(value));
  }
  assert.equal(codexToolsEnabled({ [CODEX_TOOLS_ENABLE_ENV]: '1' }), true);
  assert.equal(codexToolsEnabled({ [CODEX_TOOLS_ENABLE_ENV]: ' 1 ' }), true);
});

test('with the flag unset, asking for the codex toolset by name registers nothing', async (t) => {
  setFlag(t, undefined);
  for (const selection of [['codex'], 'codex', 'CODEX']) {
    const server = recordingServer();
    await registerSelectedToolsets(server, selection);
    assert.deepEqual(Object.keys(server._registeredTools), [], JSON.stringify(selection));
    assert.deepEqual(server.__dexterLoadedToolsets, [], JSON.stringify(selection));
  }
});

test('with the flag set to 1, the codex toolset registers its three tools', async (t) => {
  setFlag(t, '1');
  const server = recordingServer();
  await registerSelectedToolsets(server, ['codex']);
  assert.deepEqual(Object.keys(server._registeredTools), CODEX_TOOL_NAMES);
});

test('the sealed production roster has no codex tools unless the flag is set', async (t) => {
  setFlag(t, undefined);
  const withoutFlag = await sealedRoster();
  for (const name of CODEX_TOOL_NAMES) {
    assert.equal(withoutFlag.includes(name), false, name);
  }
  assert.equal(withoutFlag.some((name) => name.startsWith('codex')), false);
  // The tools the guard protects are still there, under the same names.
  for (const name of ['x402_pay', 'x402_fetch', 'x402_check', 'x402_search', 'x402_wallet']) {
    assert.equal(withoutFlag.includes(name), true, name);
  }

  process.env[CODEX_TOOLS_ENABLE_ENV] = '1';
  const withFlag = await sealedRoster();
  assert.deepEqual(
    withFlag.filter((name) => !CODEX_TOOL_NAMES.includes(name)),
    withoutFlag,
    'every other tool keeps its name and its place',
  );
  assert.deepEqual(withFlag.filter((name) => CODEX_TOOL_NAMES.includes(name)), CODEX_TOOL_NAMES);
});
