import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as fsPromises from 'node:fs/promises';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_SOURCE_ORIGIN,
  buildOpenRelease,
} from '../scripts/release/build-open-release.mjs';
import {
  FORBIDDEN_RELEASE_TOOL_ENV_KEYS,
  reviewedNpmInvocation,
} from '../lib/open-release-tooling.mjs';
import {
  OPEN_RELEASE_FINALIZATION_SCRIPTS,
  OPEN_RELEASE_INSTALL_ARGS,
} from '../lib/open-release-finalization.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { readSealedOpenRelease } = require('../lib/open-release-provenance.cjs');
const REVIEWED_NPM = reviewedNpmInvocation();

const CONNECTED = [
  'x402_search',
  'dexter_prepare_asset_action',
];
const PRIVATE = ['resolve_wallet', 'auth_info'];
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceContractsFixture() {
  return {
    schemaVersion: 3,
    kind: 'opendexter-source-contracts/v3',
    api: {
      repository: 'https://github.com/Dexter-DAO/dexter-api',
      commit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      consumerFixture: {
        path: 'tests/fixtures/governed-reconcile.json',
        sha256: 'c'.repeat(64),
        canonicalBodyDigest: 'd'.repeat(64),
      },
    },
    mcp: {
      repository: 'https://github.com/Dexter-DAO/dexter-mcp',
      commit: 'e'.repeat(40),
      tree: 'f'.repeat(40),
      toolContractPath: 'lib/open-tool-contracts.mjs',
      authContractPath: 'lib/open-tool-auth.mjs',
    },
  };
}

function descriptorFixture() {
  return {
    schemaVersion: 2,
    kind: 'opendexter-hosted-tool-descriptors/v2',
    sourceContracts: sourceContractsFixture(),
    oauth: {
      mode: 'mixed',
      resource: 'https://open.dexter.cash/mcp',
      protectedResourceMetadata:
        'https://open.dexter.cash/.well-known/oauth-protected-resource/mcp',
      protectedResourcePaths: [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
      ],
      authorizationServer: 'https://mcp.dexter.cash/mcp',
      authorizationServerMetadata:
        'https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp',
      tokenIssuer: 'https://dexter.cash',
      scopesSupported: ['vault'],
      challengeRequiredParameters: [
        'resource_metadata',
        'scope',
        'error',
        'error_description',
      ],
    },
    anonymousToolNames: ['x402_search'],
    oauthPromotedToolNames: ['dexter_prepare_asset_action'],
    connectedToolNames: CONNECTED,
    optionalOAuthToolNames: ['x402_search'],
    tools: CONNECTED.map((name) => ({
      name,
      title: name,
      description: `${name} fixture`,
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: 'noauth' }],
      visibility: ['model'],
      widgetAccessible: false,
    })),
  };
}

function git(source, args, options = {}) {
  return execFileSync('git', args, {
    cwd: source,
    encoding: 'utf8',
    ...options,
  }).trim();
}

function writeFixtureFile(source, relative, contents, mode) {
  const target = join(source, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, mode ? { mode } : undefined);
}

function sourceFixture() {
  const source = mkdtempSync(join(tmpdir(), 'dexter-mcp-release-source-'));
  writeFixtureFile(source, 'package.json', `${JSON.stringify({
    name: 'dexter-mcp',
    version: '0.5.0',
    packageManager: 'npm@10.9.3',
    scripts: {
      'studio:setup': 'true',
      'build:runtime-workspaces': 'true',
      'typecheck:open-release': 'true',
      'build:apps-sdk:local': 'true',
      'verify:release:runtime': 'true',
      'verify:release:lock': 'true',
      'verify:release:installed': 'true',
    },
  }, null, 2)}\n`);
  writeFixtureFile(source, 'package-lock.json', `${JSON.stringify({
    name: 'dexter-mcp',
    version: '0.5.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'dexter-mcp', version: '0.5.0' },
    },
  }, null, 2)}\n`);
  writeFixtureFile(source, 'http-server-oauth.mjs', '// private fixture\n');
  writeFixtureFile(
    source,
    'ecosystem.private.production.cjs',
    '// private ecosystem fixture\n',
  );
  writeFixtureFile(source, 'open-mcp-server.mjs', '// open fixture\n');
  writeFixtureFile(
    source,
    'production-bootstrap.mjs',
    '// production bootstrap fixture\n',
  );
  writeFixtureFile(source, 'common.mjs', '// intercepted by fixture runner\n');
  writeFixtureFile(
    source,
    'lib/open-release-provenance.cjs',
    readFileSync(new URL('../lib/open-release-provenance.cjs', import.meta.url)),
  );
  writeFixtureFile(source, 'bin/runtime-helper', '#!/bin/sh\nexit 0\n', 0o755);
  writeFixtureFile(
    source,
    'scripts/materialize-open-tool-descriptors.mjs',
    '// intercepted by fixture runner\n',
  );
  writeFixtureFile(
    source,
    'release/opendexter-source-contracts.json',
    `${JSON.stringify(sourceContractsFixture(), null, 2)}\n`,
  );
  writeFixtureFile(
    source,
    'release/open-tool-descriptors.json',
    `${JSON.stringify(descriptorFixture(), null, 2)}\n`,
  );
  writeFixtureFile(source, '.agents/skills/pay/SKILL.md', '# Pay\n');
  mkdirSync(join(source, 'skills'), { recursive: true });
  symlinkSync('../.agents/skills/pay', join(source, 'skills/pay'));

  execFileSync('git', ['init', '-q'], { cwd: source });
  git(source, ['config', 'user.email', 'release-fixture@dexter.test']);
  git(source, ['config', 'user.name', 'Dexter Release Fixture']);
  git(source, ['remote', 'add', 'origin', CANONICAL_SOURCE_ORIGIN]);
  git(source, ['add', '.']);
  git(source, ['commit', '-qm', 'fixture base']);
  writeFixtureFile(source, 'tracked.txt', 'second commit\n');
  git(source, ['add', 'tracked.txt']);
  git(source, ['commit', '-qm', 'fixture head']);
  return source;
}

function trustedOutputRoot() {
  const outputRoot = mkdtempSync(join(tmpdir(), 'dexter-mcp-release-output-'));
  chmodSync(outputRoot, 0o700);
  return outputRoot;
}

function makeRemovable(path) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) makeRemovable(join(path, name));
}

function removeTree(path) {
  makeRemovable(path);
  rmSync(path, { recursive: true, force: true });
}

function fixtureRunner(source, calls = [], descriptor = descriptorFixture()) {
  return async (command, args, options = {}) => {
    const npmCall = command === REVIEWED_NPM.command
      && args[0] === REVIEWED_NPM.npmCli;
    const effectiveArgs = npmCall ? args.slice(1) : args;
    const privateProfile = options.env?.TOKEN_AI_MCP_PROFILE;
    const privateToolsets = options.env?.TOKEN_AI_MCP_TOOLSETS;
    const hostileSelection = Boolean(
      String(privateProfile ?? '')
      || String(privateToolsets ?? ''),
    );
    calls.push({
      command,
      args: [...args],
      cwd: options.cwd,
      privateProfile,
      privateToolsets,
      env: { ...options.env },
      npmCall,
    });
    if (command === 'git' && args.includes('ls-remote')) {
      const head = git(source, ['rev-parse', 'HEAD^{commit}']);
      return { stdout: `${head}\trefs/heads/main\n`, stderr: '' };
    }
    if (npmCall) {
      if (effectiveArgs[0] === '--version') {
        return { stdout: '10.9.3\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    }
    if (command === REVIEWED_NPM.nodeExecutable) {
      if (args[0]?.endsWith('materialize-open-tool-descriptors.mjs')) {
        const materialized = hostileSelection
          ? {
              ...descriptor,
              anonymousToolNames: ['hostile_tool'],
              oauthPromotedToolNames: [],
              connectedToolNames: ['hostile_tool'],
              optionalOAuthToolNames: ['hostile_tool'],
              tools: [{ ...descriptor.tools[0], name: 'hostile_tool' }],
            }
          : descriptor;
        return { stdout: JSON.stringify(materialized), stderr: '' };
      }
      if (
        args[0] === '--input-type=module'
        && args[1] === '--eval'
        && args[2]?.includes('DEXTER_MCP_PRIVATE_ROSTER=')
      ) {
        return {
          stdout: `\nDEXTER_MCP_PRIVATE_ROSTER=${JSON.stringify(PRIVATE)}\n`,
          stderr: '',
        };
      }
    }
    return execFileAsync(command, args, options);
  };
}

function finalizedWidgetDescriptorRunner({
  source,
  calls = [],
  finalizedDescriptor,
  prebuildDescriptor,
}) {
  const ordinaryRunner = fixtureRunner(source, calls, finalizedDescriptor);
  let appsSdkFinalized = false;
  return async (command, args, options = {}) => {
    const result = await ordinaryRunner(command, args, options);
    const npmCall = command === REVIEWED_NPM.command
      && args[0] === REVIEWED_NPM.npmCli;
    if (
      npmCall
      && args.slice(1).join(' ') === 'run build:apps-sdk:local'
    ) {
      appsSdkFinalized = true;
    }
    if (
      command === REVIEWED_NPM.nodeExecutable
      && args[0]?.endsWith('materialize-open-tool-descriptors.mjs')
    ) {
      return {
        stdout: JSON.stringify(
          appsSdkFinalized ? finalizedDescriptor : prebuildDescriptor,
        ),
        stderr: '',
      };
    }
    return result;
  };
}

async function expectMaterializedDescriptorFailure(mutateDescriptor) {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  try {
    const descriptor = descriptorFixture();
    mutateDescriptor(descriptor);
    await assert.rejects(
      buildOpenRelease({
        sourceRoot: source,
        outputRoot,
        runCommand: fixtureRunner(source, [], descriptor),
      }),
      /archived OpenDexter materializer returned a mismatched roster/,
    );
    assert.equal(
      readdirSync(outputRoot).some((name) => /^[0-9a-f]{40}$/.test(name)),
      false,
    );
  } finally {
    removeTree(source);
    removeTree(outputRoot);
  }
}

async function expectPreflightFailure({ mutate, pattern }) {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  try {
    await mutate(source, outputRoot);
    await assert.rejects(
      buildOpenRelease({
        sourceRoot: source,
        outputRoot,
        runCommand: fixtureRunner(source),
      }),
      pattern,
    );
    assert.equal(
      readdirSync(outputRoot).some((name) => /^[0-9a-f]{40}$/.test(name)),
      false,
    );
  } finally {
    removeTree(source);
    removeTree(outputRoot);
  }
}

test('release builder constructs the same sealed candidate from the same Git HEAD', async (t) => {
  const source = sourceFixture();
  const firstRoot = trustedOutputRoot();
  const secondRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(firstRoot);
    removeTree(secondRoot);
  });

  const calls = [];
  const savedProfile = process.env.TOKEN_AI_MCP_PROFILE;
  const savedToolsets = process.env.TOKEN_AI_MCP_TOOLSETS;
  const savedNpmRegistry = process.env.npm_config_registry;
  const savedUpperNpmRegistry = process.env.NPM_CONFIG_REGISTRY;
  t.after(() => {
    if (savedProfile === undefined) delete process.env.TOKEN_AI_MCP_PROFILE;
    else process.env.TOKEN_AI_MCP_PROFILE = savedProfile;
    if (savedToolsets === undefined) delete process.env.TOKEN_AI_MCP_TOOLSETS;
    else process.env.TOKEN_AI_MCP_TOOLSETS = savedToolsets;
    if (savedNpmRegistry === undefined) delete process.env.npm_config_registry;
    else process.env.npm_config_registry = savedNpmRegistry;
    if (savedUpperNpmRegistry === undefined) {
      delete process.env.NPM_CONFIG_REGISTRY;
    } else {
      process.env.NPM_CONFIG_REGISTRY = savedUpperNpmRegistry;
    }
  });
  const renamed = [];
  const fsOps = {
    ...fsPromises,
    rename: async (from, to) => {
      renamed.push({ from, to });
      assert.equal(lstatSync(dirname(from)).mode & 0o777, 0o700);
      assert.equal(lstatSync(dirname(to)).mode & 0o777, 0o700);
      return fsPromises.rename(from, to);
    },
  };
  process.env.TOKEN_AI_MCP_PROFILE = 'hostile-ambient-profile';
  process.env.TOKEN_AI_MCP_TOOLSETS = 'hostile-ambient-toolset';
  process.env.npm_config_registry = 'https://hostile-registry.invalid/';
  process.env.NPM_CONFIG_REGISTRY = 'https://other-hostile-registry.invalid/';
  const first = await buildOpenRelease({
    sourceRoot: source,
    outputRoot: firstRoot,
    runCommand: fixtureRunner(source, calls),
    fsOps,
  });
  process.env.TOKEN_AI_MCP_PROFILE = 'different-hostile-profile';
  process.env.TOKEN_AI_MCP_TOOLSETS = 'different-hostile-toolset';
  process.env.npm_config_registry = 'https://second-hostile-registry.invalid/';
  process.env.NPM_CONFIG_REGISTRY = 'https://third-hostile-registry.invalid/';
  const second = await buildOpenRelease({
    sourceRoot: source,
    outputRoot: secondRoot,
    runCommand: fixtureRunner(source),
  });

  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].to, first.releaseDirectory);
  assert.equal(first.provenance.sourceCommit, git(source, ['rev-parse', 'HEAD']));
  assert.equal(first.provenance.sourceTree, git(source, ['rev-parse', 'HEAD^{tree}']));
  assert.equal(
    first.provenance.sourceCommittedAt,
    new Date(git(source, ['show', '-s', '--format=%cI', 'HEAD'])).toISOString(),
  );
  assert.deepEqual(first.provenance.rosters, {
    'dexter-mcp': PRIVATE,
    'dexter-open-mcp': CONNECTED,
  });
  assert.deepEqual(first.provenance.entrypoints, {
    'dexter-mcp': 'production-bootstrap.mjs',
    'dexter-open-mcp': 'production-bootstrap.mjs',
  });
  assert.equal(
    first.provenance.sourceArchiveSha256,
    second.provenance.sourceArchiveSha256,
  );
  assert.equal(
    first.provenance.artifactManifestSha256,
    second.provenance.artifactManifestSha256,
  );
  assert.equal(
    first.provenance.artifactManifestSha256,
    sha256(readFileSync(first.manifestPath)),
  );
  assert.equal(
    readFileSync(join(first.releaseDirectory, '.release-provenance.json'), 'utf8'),
    readFileSync(join(second.releaseDirectory, '.release-provenance.json'), 'utf8'),
  );
  const sealedProvenanceBytes = readFileSync(
    join(first.releaseDirectory, '.release-provenance.json'),
  );
  const sealedProvenance = JSON.parse(sealedProvenanceBytes.toString('utf8'));
  assert.equal(sealedProvenance.schema, 'dexter-mcp-immutable-release/v4');
  assert.equal(Object.hasOwn(sealedProvenance, 'artifactManifestSha256'), false);
  assert.equal(Object.hasOwn(sealedProvenance, 'builtAt'), false);
  assert.equal(
    readFileSync(first.manifestPath, 'utf8'),
    readFileSync(second.manifestPath, 'utf8'),
  );
  assert.match(
    readFileSync(first.manifestPath, 'utf8'),
    /^L\t\.\.\/\.agents\/skills\/pay\tskills\/pay$/m,
  );
  assert.match(
    readFileSync(first.manifestPath, 'utf8'),
    /release\/open-tool-descriptors\.json$/m,
  );
  assert.match(
    readFileSync(first.manifestPath, 'utf8'),
    new RegExp(
      `^F\\t${sha256(sealedProvenanceBytes)}\\t\\.release-provenance\\.json$`,
      'm',
    ),
  );
  assert.equal(lstatSync(first.releaseDirectory).mode & 0o777, 0o500);
  assert.equal(lstatSync(first.manifestPath).mode & 0o777, 0o400);
  assert.equal(
    lstatSync(join(first.releaseDirectory, 'package.json')).mode & 0o777,
    0o400,
  );
  assert.equal(
    lstatSync(join(first.releaseDirectory, 'bin/runtime-helper')).mode & 0o777,
    0o500,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(
      join(first.releaseDirectory, 'release/open-tool-descriptors.json'),
      'utf8',
    )),
    descriptorFixture(),
  );
  assert.doesNotThrow(() => readSealedOpenRelease(first.releaseDirectory));
  assert.deepEqual(
    JSON.parse(readFileSync(
      join(source, 'release/open-tool-descriptors.json'),
      'utf8',
    )),
    descriptorFixture(),
  );
  assert.equal(git(source, ['status', '--porcelain']), '');

  const npmCalls = calls
    .filter(({ npmCall }) => npmCall)
    .map(({ args }) => args.slice(1).join(' '));
  assert.deepEqual(npmCalls, [
    '--version',
    OPEN_RELEASE_INSTALL_ARGS.join(' '),
    ...OPEN_RELEASE_FINALIZATION_SCRIPTS.map((script) => `run ${script}`),
  ]);
  for (const call of calls.filter(({ command }) => (
    command === REVIEWED_NPM.nodeExecutable
  ))) {
    assert.equal(call.privateProfile, '');
    assert.equal(call.privateToolsets, '');
  }
  const privateRosterCalls = calls.filter(({ args }) => (
    args[0] === '--input-type=module'
    && args[1] === '--eval'
    && args[2]?.includes('DEXTER_MCP_PRIVATE_ROSTER=')
  ));
  assert.equal(privateRosterCalls.length, 1);
  assert.match(
    privateRosterCalls[0].args[2],
    /SEALED_PRIVATE_TOOLSET_PROFILE/,
  );
  assert.doesNotMatch(
    privateRosterCalls[0].args[2],
    /process\.env\.TOKEN_AI_MCP_(?:PROFILE|TOOLSETS)/,
  );
  for (const call of calls) {
    assert.equal(call.env.NODE_OPTIONS, undefined);
    assert.equal(call.env.NODE_PATH, undefined);
    assert.equal(call.env.LD_PRELOAD, undefined);
    assert.equal(call.env.LD_LIBRARY_PATH, undefined);
    assert.equal(call.env.LD_AUDIT, undefined);
    assert.equal(call.env.TAR_OPTIONS, undefined);
    assert.equal(call.env.npm_config_registry, undefined);
    assert.equal(call.env.NPM_CONFIG_REGISTRY, undefined);
    assert.equal(call.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(call.env.GIT_CONFIG_GLOBAL, '/dev/null');
  }
  for (const call of calls.filter(({ npmCall }) => npmCall)) {
    assert.equal(call.command, REVIEWED_NPM.nodeExecutable);
    assert.equal(call.args[0], REVIEWED_NPM.npmCli);
    assert.equal(call.env.npm_config_userconfig, '/dev/null');
    assert.equal(
      call.env.npm_config_globalconfig,
      '/dev/null.opendexter-release-global-npmrc',
    );
    assert.match(call.env.npm_config_cache, /\.dexter-mcp-build-[^/]+\/npm-cache$/);
  }
});

test('release builder rejects loader and archive injection before child contact', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  const saved = new Map(
    FORBIDDEN_RELEASE_TOOL_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    removeTree(source);
    removeTree(outputRoot);
  });

  for (const key of FORBIDDEN_RELEASE_TOOL_ENV_KEYS) {
    for (const candidate of FORBIDDEN_RELEASE_TOOL_ENV_KEYS) {
      if (saved.get(candidate) === undefined) delete process.env[candidate];
      else process.env[candidate] = saved.get(candidate);
    }
    process.env[key] = 'hostile-release-injection';
    const calls = [];
    await assert.rejects(
      buildOpenRelease({
        sourceRoot: source,
        outputRoot,
        runCommand: fixtureRunner(source, calls),
      }),
      new RegExp(`opendexter_release_tool_env_forbidden:${key}`),
    );
    assert.equal(calls.length, 0);
  }
});

test('release builder rejects legacy private-selection API and CLI overrides', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(outputRoot);
  });
  for (const override of [
    { privateProfile: 'opendexter' },
    { privateToolsets: 'x402-client' },
  ]) {
    await assert.rejects(
      buildOpenRelease({ sourceRoot: source, outputRoot, ...override }),
      /private profile and toolsets are source-owned/,
    );
  }

  for (const option of ['--private-profile', '--private-toolsets']) {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL(
        '../scripts/release/build-open-release.mjs',
        import.meta.url,
      )),
      '--output-root',
      outputRoot,
      option,
      'hostile',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`unknown release builder option: ${option}`));
  }
});

test('release builder rejects dirty checkout bytes', async () => {
  await expectPreflightFailure({
    mutate: async (source) => writeFixtureFile(source, 'untracked.txt', 'dirty\n'),
    pattern: /source checkout is not clean/,
  });
});

test('release builder rejects hidden assume-unchanged and skip-worktree state', async () => {
  await expectPreflightFailure({
    mutate: async (source) => {
      git(source, ['update-index', '--assume-unchanged', 'package.json']);
    },
    pattern: /assume-unchanged or skip-worktree/,
  });
  await expectPreflightFailure({
    mutate: async (source) => {
      git(source, ['update-index', '--skip-worktree', 'package-lock.json']);
    },
    pattern: /assume-unchanged or skip-worktree/,
  });
});

test('release builder rejects Git replace refs', async () => {
  await expectPreflightFailure({
    mutate: async (source) => {
      git(source, ['replace', 'HEAD', 'HEAD^']);
    },
    pattern: /forbidden Git replace refs/,
  });
});

test('release builder rejects a noncanonical origin', async () => {
  await expectPreflightFailure({
    mutate: async (source) => {
      git(source, ['remote', 'set-url', 'origin', 'https://example.test/fork.git']);
    },
    pattern: /origin is not canonical/,
  });
});

test('release builder rejects a canonical origin that does not advertise HEAD', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(outputRoot);
  });
  const ordinaryRunner = fixtureRunner(source);
  const runCommand = async (command, args, options) => {
    if (command === 'git' && args.includes('ls-remote')) {
      return {
        stdout: `${git(source, ['rev-parse', 'HEAD^'])}\trefs/heads/main\n`,
        stderr: '',
      };
    }
    return ordinaryRunner(command, args, options);
  };
  await assert.rejects(
    buildOpenRelease({
      sourceRoot: source,
      outputRoot,
      runCommand,
    }),
    /canonical origin does not advertise the exact release commit/,
  );
});

test('release builder rejects a revision other than checked-out HEAD', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(outputRoot);
  });
  await assert.rejects(
    buildOpenRelease({
      sourceRoot: source,
      outputRoot,
      revision: 'HEAD^',
      runCommand: fixtureRunner(source),
    }),
    /revision must resolve to the exact checked-out HEAD/,
  );
});

test('release builder refuses an existing commit destination before npm', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(outputRoot);
  });
  const destination = join(outputRoot, git(source, ['rev-parse', 'HEAD']));
  mkdirSync(destination, { mode: 0o700 });
  const calls = [];
  await assert.rejects(
    buildOpenRelease({
      sourceRoot: source,
      outputRoot,
      runCommand: fixtureRunner(source, calls),
    }),
    /release destination already exists/,
  );
  assert.equal(calls.some(({ npmCall }) => npmCall), false);
});

test('release builder requires one committed descriptor', async () => {
  await expectPreflightFailure({
    mutate: async (source) => {
      rmSync(join(source, 'release/open-tool-descriptors.json'));
      git(source, ['add', '--all']);
      git(source, ['commit', '-qm', 'remove descriptor']);
    },
    pattern: /committed OpenDexter descriptor is missing/,
  });
});

test('release builder rejects a legacy source-contract kind', async () => {
  await expectMaterializedDescriptorFailure((descriptor) => {
    descriptor.sourceContracts.kind = 'opendexter-source-contracts/v1';
  });
});

test('release builder rejects a non-v3 source-contract schema', async () => {
  await expectMaterializedDescriptorFailure((descriptor) => {
    descriptor.sourceContracts.schemaVersion = 2;
  });
});

test('release builder rejects committed descriptor drift', async () => {
  await expectPreflightFailure({
    mutate: async (source) => {
      const descriptor = descriptorFixture();
      descriptor.tools[0].description = 'stale committed description';
      writeFixtureFile(
        source,
        'release/open-tool-descriptors.json',
        `${JSON.stringify(descriptor, null, 2)}\n`,
      );
      git(source, ['add', 'release/open-tool-descriptors.json']);
      git(source, ['commit', '-qm', 'drift descriptor']);
    },
    pattern: /committed OpenDexter descriptor differs from the archived/,
  });
});

test('release builder compares committed tools only after shared widget finalization', async (t) => {
  const source = sourceFixture();
  const acceptedRoot = trustedOutputRoot();
  const rejectedRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(acceptedRoot);
    removeTree(rejectedRoot);
  });

  const finalizedDescriptor = descriptorFixture();
  finalizedDescriptor.tools[0]._meta = {
    'ui/resourceUri': 'ui://dexter/x402-marketplace-search-finalized',
  };
  const prebuildDescriptor = structuredClone(finalizedDescriptor);
  prebuildDescriptor.tools[0]._meta['ui/resourceUri'] =
    'ui://dexter/x402-marketplace-search-prebuild';
  writeFixtureFile(
    source,
    'release/open-tool-descriptors.json',
    `${JSON.stringify(finalizedDescriptor, null, 2)}\n`,
  );
  git(source, ['add', 'release/open-tool-descriptors.json']);
  git(source, ['commit', '-qm', 'regenerate finalized descriptor']);

  const acceptedCalls = [];
  await buildOpenRelease({
    sourceRoot: source,
    outputRoot: acceptedRoot,
    runCommand: finalizedWidgetDescriptorRunner({
      source,
      calls: acceptedCalls,
      finalizedDescriptor,
      prebuildDescriptor,
    }),
  });
  const materializerCall = acceptedCalls.findIndex(({ command, args }) => (
    command === REVIEWED_NPM.nodeExecutable
    && args[0]?.endsWith('materialize-open-tool-descriptors.mjs')
  ));
  const widgetBuildCall = acceptedCalls.findIndex(({ npmCall, args }) => (
    npmCall && args.slice(1).join(' ') === 'run build:apps-sdk:local'
  ));
  assert.ok(widgetBuildCall >= 0);
  assert.ok(materializerCall > widgetBuildCall);

  writeFixtureFile(
    source,
    'release/open-tool-descriptors.json',
    `${JSON.stringify(prebuildDescriptor, null, 2)}\n`,
  );
  git(source, ['add', 'release/open-tool-descriptors.json']);
  git(source, ['commit', '-qm', 'introduce prebuild descriptor drift']);
  await assert.rejects(
    buildOpenRelease({
      sourceRoot: source,
      outputRoot: rejectedRoot,
      runCommand: finalizedWidgetDescriptorRunner({
        source,
        finalizedDescriptor,
        prebuildDescriptor,
      }),
    }),
    /committed OpenDexter descriptor differs from the archived finalized tools/,
  );
});

test('release builder rejects descriptor mutation during the build', async (t) => {
  const source = sourceFixture();
  const outputRoot = trustedOutputRoot();
  t.after(() => {
    removeTree(source);
    removeTree(outputRoot);
  });
  const ordinaryRunner = fixtureRunner(source);
  const runCommand = async (command, args, options) => {
    const result = await ordinaryRunner(command, args, options);
    if (
      command === REVIEWED_NPM.command
      && args[0] === REVIEWED_NPM.npmCli
      && args.slice(1).join(' ') === 'run build:runtime-workspaces'
    ) {
      writeFileSync(
        join(options.cwd, 'release/open-tool-descriptors.json'),
        '{"mutated":true}\n',
      );
    }
    return result;
  };
  await assert.rejects(
    buildOpenRelease({ sourceRoot: source, outputRoot, runCommand }),
    /release build changed the committed OpenDexter descriptor/,
  );
});
