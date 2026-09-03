import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  NPM_PACK_LIFECYCLE_HOOKS,
  comparePackedArtifact,
  inspectInstalledRelease,
  inspectIsolatedTooling,
  inspectPackageSourcePreflight,
  inspectPackLifecycleScripts,
  inspectProductionClosure,
  inspectRegistryLock,
  inspectRuntimeNode,
  inspectSourceTrain,
  gitTreeSpec,
  isSupportedNodeRuntime,
  rebuildPackedSourceArtifact,
  releaseClosurePackageNames,
  versionAtLeast,
} from '../scripts/verify-open-release-dependencies.mjs';

const execFileAsync = promisify(execFile);
const hostedRoot = new URL('..', import.meta.url).pathname;
const ideRoot = process.env.OPENDXTER_IDE_SOURCE;
const vaultRoot = process.env.DEXTER_VAULT_SDK_SOURCE;
const runtimeRoot = process.env.OPENDXTER_RUNTIME_ROOT;

async function git(root, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
  });
  return stdout.trim();
}

function advertisedOriginRunner(
  repositoryRoot,
  { advertised = true, unreachable = false, calls = [] } = {},
) {
  return async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (
      command === 'git'
      && args.includes('ls-remote')
    ) {
      if (unreachable) throw new Error('fixture origin unavailable');
      const commit = await git(repositoryRoot, 'rev-parse', 'HEAD');
      return {
        stdout: advertised
          ? `${commit}\trefs/heads/main\n`
          : `${'f'.repeat(40)}\trefs/heads/main\n`,
        stderr: '',
      };
    }
    return execFileAsync(command, args, options);
  };
}

async function useFixtureRemote(fixture, remote) {
  await git(fixture.repositoryRoot, 'remote', 'set-url', 'origin', remote);
  return { ...fixture.repository, remote };
}

async function packedSourceFixture({ lifecycleHook } = {}) {
  const repositoryRoot = await mkdtemp(
    resolve(tmpdir(), 'opendexter-packed-source-'),
  );
  const packagePath = 'packages/vault';
  const packageRoot = resolve(repositoryRoot, packagePath);
  const scripts = {
    build: 'node build.mjs',
  };
  if (lifecycleHook) {
    scripts[lifecycleHook] =
      'node -e "require(\'node:fs\').writeFileSync(\'.prepare-ran\', \'ran\')"';
  }
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    resolve(repositoryRoot, '.gitignore'),
    'packages/vault/dist/\npackages/vault/node_modules/\n',
  );
  await writeFile(
    resolve(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@dexterai/fixture-vault',
      version: '1.0.0',
      type: 'module',
      files: ['dist'],
      scripts,
    }, null, 2),
  );
  await writeFile(
    resolve(packageRoot, 'package-lock.json'),
    JSON.stringify({
      name: '@dexterai/fixture-vault',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: '@dexterai/fixture-vault',
          version: '1.0.0',
        },
      },
    }, null, 2),
  );
  await writeFile(
    resolve(packageRoot, 'build.mjs'),
    "import { mkdir, writeFile } from 'node:fs/promises';\n"
      + "await mkdir(new URL('./dist/', import.meta.url), { recursive: true });\n"
      + "await writeFile(new URL('./dist/index.js', import.meta.url), "
      + "'export const value = 1;\\n');\n",
  );
  await git(repositoryRoot, 'init');
  await git(repositoryRoot, 'config', 'user.email', 'fixture@example.test');
  await git(repositoryRoot, 'config', 'user.name', 'Fixture');
  await git(
    repositoryRoot,
    'remote',
    'add',
    'origin',
    'https://example.test/dexter-vault-sdk.git',
  );
  await git(repositoryRoot, 'add', '.');
  await git(repositoryRoot, 'commit', '-m', 'fixture');
  const provenanceCommit = await git(repositoryRoot, 'rev-parse', 'HEAD');
  const treeHash = await git(
    repositoryRoot,
    'rev-parse',
    `${provenanceCommit}:${packagePath}`,
  );
  return {
    repositoryRoot,
    packageRoot,
    expected: {
      name: '@dexterai/fixture-vault',
      version: '1.0.0',
      source: 'vault-sdk',
      path: packagePath,
      entrypoint: 'dist/index.js',
      treeHash,
      packedArtifact: { buildScript: 'build' },
      install: { source: 'registry', release: 'registry' },
    },
    repository: {
      remote: 'https://example.test/dexter-vault-sdk.git',
      provenanceCommit,
    },
  };
}

async function rootWorkspacePackedSourceFixture() {
  const repositoryRoot = await mkdtemp(
    resolve(tmpdir(), 'opendexter-root-workspace-source-'),
  );
  const prerequisiteRoot = resolve(repositoryRoot, 'packages/prerequisite');
  const packagePath = 'packages/target';
  const packageRoot = resolve(repositoryRoot, packagePath);
  await mkdir(prerequisiteRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(resolve(repositoryRoot, '.gitignore'), 'packages/*/dist/\n');
  await writeFile(resolve(repositoryRoot, 'package.json'), JSON.stringify({
    private: true,
    packageManager: 'npm@10.9.3',
    workspaces: ['packages/*'],
  }, null, 2));
  await writeFile(resolve(prerequisiteRoot, 'package.json'), JSON.stringify({
    name: '@dexterai/prerequisite',
    version: '1.0.0',
    type: 'module',
    files: ['dist'],
    scripts: { build: 'node build.mjs' },
  }, null, 2));
  await writeFile(resolve(prerequisiteRoot, 'build.mjs'), [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir(new URL('./dist/', import.meta.url), { recursive: true });",
    "await writeFile(new URL('./dist/index.js', import.meta.url), 'export const prerequisite = true;\\n');",
    '',
  ].join('\n'));
  await writeFile(resolve(packageRoot, 'package.json'), JSON.stringify({
    name: '@dexterai/root-workspace-target',
    version: '1.0.0',
    type: 'module',
    files: ['dist'],
    dependencies: { '@dexterai/prerequisite': '1.0.0' },
    scripts: { build: 'node build.mjs' },
  }, null, 2));
  await writeFile(resolve(packageRoot, 'build.mjs'), [
    "import { access, mkdir, writeFile } from 'node:fs/promises';",
    "await access(new URL('../prerequisite/dist/index.js', import.meta.url));",
    "await mkdir(new URL('./dist/', import.meta.url), { recursive: true });",
    "await writeFile(new URL('./dist/index.js', import.meta.url), 'export const target = true;\\n');",
    '',
  ].join('\n'));
  const packageLock = `${JSON.stringify({
    name: 'root-workspace-fixture',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'root-workspace-fixture',
        workspaces: ['packages/*'],
      },
      'node_modules/@dexterai/prerequisite': {
        resolved: 'packages/prerequisite',
        link: true,
      },
      'node_modules/@dexterai/root-workspace-target': {
        resolved: 'packages/target',
        link: true,
      },
      'packages/prerequisite': {
        name: '@dexterai/prerequisite',
        version: '1.0.0',
      },
      'packages/target': {
        name: '@dexterai/root-workspace-target',
        version: '1.0.0',
        dependencies: { '@dexterai/prerequisite': '1.0.0' },
      },
    },
  }, null, 2)}\n`;
  await writeFile(resolve(repositoryRoot, 'package-lock.json'), packageLock);
  await git(repositoryRoot, 'init');
  await git(repositoryRoot, 'config', 'user.email', 'fixture@example.test');
  await git(repositoryRoot, 'config', 'user.name', 'Fixture');
  await git(repositoryRoot, 'remote', 'add', 'origin', 'https://example.test/root.git');
  await git(repositoryRoot, 'add', '.');
  await git(repositoryRoot, 'commit', '-m', 'fixture');
  const provenanceCommit = await git(repositoryRoot, 'rev-parse', 'HEAD');
  const treeHash = await git(
    repositoryRoot,
    'rev-parse',
    `${provenanceCommit}:${packagePath}`,
  );
  return {
    repositoryRoot,
    packageRoot,
    expected: {
      name: '@dexterai/root-workspace-target',
      version: '1.0.0',
      source: 'fixture',
      path: packagePath,
      entrypoint: 'dist/index.js',
      treeHash,
      packedArtifact: {
        buildMode: 'root-workspace',
        buildScript: 'build',
      },
    },
    repository: {
      remote: 'https://example.test/root.git',
      provenanceCommit,
      rootWorkspaceBuild: {
        packageLockSha256: createHash('sha256')
          .update(packageLock)
          .digest('hex'),
        buildOrder: [
          { workspace: '@dexterai/prerequisite', script: 'build' },
          { workspace: '@dexterai/root-workspace-target', script: 'build' },
        ],
      },
    },
  };
}

async function registryLockFixture(mutator = () => {}) {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-lock-'));
  const manifest = JSON.parse(
    await readFile(
      new URL('../release/opendexter-dependency-train.json', import.meta.url),
      'utf8',
    ),
  );
  const dependencies = Object.fromEntries([
    ...manifest.sourcePackages,
    ...manifest.runtimePackages,
  ].map(({ name, rootSpecifier }) => [name, rootSpecifier]));
  const packages = {
    '': { dependencies },
    'node_modules/@dexterai/x402-core': {
      resolved: 'packages/x402-core',
      link: true,
    },
    'packages/x402-core': {
      name: '@dexterai/x402-core',
      version: '1.5.2',
    },
  };
  for (const expected of [
    ...manifest.sourcePackages.filter(
      ({ install }) => install.release === 'registry',
    ),
    ...manifest.runtimePackages,
  ]) {
    packages[`node_modules/${expected.name}`] = {
      version: expected.version,
      resolved: `https://registry.example/${expected.name}.tgz`,
      integrity: expected.packedArtifact?.integrity ?? 'sha512-fixture',
    };
  }
  const lock = { lockfileVersion: 3, packages };
  mutator(lock);
  await mkdir(resolve(fixture, 'release'), { recursive: true });
  await writeFile(
    resolve(fixture, 'release/opendexter-dependency-train.json'),
    JSON.stringify(manifest),
  );
  await writeFile(resolve(fixture, 'package-lock.json'), JSON.stringify(lock));
  return fixture;
}

test('release dependency versions compare deterministically', () => {
  assert.equal(versionAtLeast('1.24.0', '1.24.0'), true);
  assert.equal(versionAtLeast('1.29.0', '1.24.0'), true);
  assert.equal(versionAtLeast('1.23.9', '1.24.0'), false);
  assert.throws(() => versionAtLeast('latest', '1.24.0'));
});

test('Git tree provenance supports repository-root and nested packages', () => {
  assert.equal(gitTreeSpec('abc123', '.'), 'abc123^{tree}');
  assert.equal(
    gitTreeSpec('abc123', 'packages/vault'),
    'abc123:packages/vault',
  );
});

test('release runtime enforces the pinned Vite Node floor', async () => {
  assert.equal(isSupportedNodeRuntime('20.18.1'), false);
  assert.equal(isSupportedNodeRuntime('20.19.0'), true);
  assert.equal(isSupportedNodeRuntime('21.7.3'), false);
  assert.equal(isSupportedNodeRuntime('22.11.0'), false);
  assert.equal(isSupportedNodeRuntime('22.12.0'), true);
  assert.equal(isSupportedNodeRuntime('23.0.0'), true);
  assert.deepEqual(await inspectRuntimeNode(hostedRoot, '22.19.0'), {
    ready: true,
    issues: [],
  });
  const rejected = await inspectRuntimeNode(hostedRoot, '20.18.1');
  assert.equal(rejected.ready, false);
  assert.match(rejected.issues.join('\n'), /Node 20\.18\.1 is unsupported/);
});

test('hosted source declares one exact internal dependency train', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../release/opendexter-dependency-train.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(
    manifest.sourcePackages.map(({ name, version }) => `${name}@${version}`),
    [
      '@dexterai/x402-core@1.5.2',
      '@dexterai/mcp-instructions@2.4.2-rc.1',
      '@dexterai/x402-mcp-tools@0.9.0-rc.2',
      '@dexterai/vault@0.43.3-rc.1',
    ],
  );
  assert.deepEqual(
    manifest.runtimePackages.map(({ name, version }) =>
      `${name}@${version}`),
    [
      '@dexterai/x402@6.0.0-rc.4',
      '@modelcontextprotocol/sdk@1.29.0',
      '@modelcontextprotocol/ext-apps@1.6.0',
      'zod@3.25.76',
    ],
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.packageManager, 'npm@10.9.3');
  assert.equal(manifest.node, '^20.19.0 || >=22.12.0');
  assert.deepEqual(manifest.repositories.hosted, {
    remote: 'https://github.com/Dexter-DAO/dexter-mcp.git',
    provenanceCommit: '7cbcaf3bab45de67000f18391af2cb57c5628ba4',
  });
  assert.deepEqual(
    manifest.sourcePackages.map(({ install }) => install),
    [
      { source: 'workspace', release: 'workspace' },
      { source: 'linked-source', release: 'registry' },
      { source: 'linked-source', release: 'registry' },
      { source: 'registry', release: 'registry' },
    ],
  );
  assert.deepEqual(manifest.repositories['opendexter-ide'], {
    remote: 'https://github.com/Dexter-DAO/opendexter-ide.git',
    provenanceCommit: '1fe25b170ef17ed15f62ee73cd5128978d8868f9',
    rootWorkspaceBuild: {
      packageLockSha256:
        '8bd1f28803e84d2d8e9d0e53c82c2835d337e62a4fada13c49f8a05b63a59a60',
      buildOrder: [
        { workspace: '@dexterai/mcp-instructions', script: 'build' },
        { workspace: '@dexterai/dextercard', script: 'build' },
        { workspace: '@dexterai/x402-mcp-tools', script: 'build' },
      ],
    },
  });
  for (const [name, tgzSha256] of [
    [
      '@dexterai/mcp-instructions',
      'cca551e7302b874479499b57bb2544a4f822e7d5e6a80e1c9d5130c6f45fa2d9',
    ],
    [
      '@dexterai/x402-mcp-tools',
      '13bfb95fc1eae30588879a0ac173d1e473ac9117d44464116245b8882709d5e9',
    ],
  ]) {
    const artifact = manifest.sourcePackages.find(
      (entry) => entry.name === name,
    ).packedArtifact;
    assert.equal(artifact.buildMode, 'root-workspace');
    assert.equal(artifact.buildScript, 'build');
    assert.equal(artifact.tgzSha256, tgzSha256);
  }
  assert.deepEqual(manifest.repositories['vault-sdk'], {
    remote: 'https://github.com/Dexter-DAO/dexter-vault-sdk.git',
    provenanceCommit: 'cbf56cfb84ec78fe4086cdd665a777f78077efd0',
  });
  assert.deepEqual(
    manifest.sourcePackages.find(({ name }) => name === '@dexterai/vault'),
    {
      name: '@dexterai/vault',
      version: '0.43.3-rc.1',
      rootSpecifier: '0.43.3-rc.1',
      source: 'vault-sdk',
      path: '.',
      entrypoint: 'dist/index.js',
      treeHash: '806e479d12f648e1b69281bec8ed3c01c163a026',
      packedArtifact: {
        buildScript: 'build',
        packLifecycleScripts: {
          prepack: 'npm run build && npm run typecheck',
        },
        integrity: 'sha512-KBxgQf3pEuz+7fsmyjIlm7xYxa/h1d+2ULoG/EpzTHolxcEuLyPLv4Kz8nbzOTJK8ca7SggHeWIiio/ek3IOiQ==',
        shasum: '8822a0b9840cf4e29a33daf311824919272c3bdf',
        size: 624351,
        unpackedSize: 3068434,
        entryCount: 91,
        tgzSha256: '1eca5e65d5a2efc2a3fa2bad63b57d1080fa8fd2e33d14a370d7291e749d59d4',
      },
      install: { source: 'registry', release: 'registry' },
    },
  );
  assert.equal(manifest.registryLock.requiredBeforeDeploy, true);
  assert.deepEqual(
    releaseClosurePackageNames(manifest),
    [
      ...manifest.sourcePackages,
      ...manifest.runtimePackages,
    ].map(({ name }) => name),
  );
  assert.equal(releaseClosurePackageNames(manifest).includes('vite'), false);
  assert.deepEqual(manifest.isolatedTooling, [
    {
      name: 'Dexter Studio Claude runtime',
      path: 'scripts/studio-runtime',
      entrypoint: 'query.mjs',
      excludedFromHostedRootGraph: true,
      requiredInRelease: true,
      packages: [
        '@anthropic-ai/claude-agent-sdk@0.2.6',
        'zod@4.3.6',
      ],
    },
  ]);
});

test('registry deployment gate fails closed without a real npm lock', async () => {
  const fixture = await registryLockFixture();
  try {
    await rm(resolve(fixture, 'package-lock.json'));
    const result = await inspectRegistryLock(fixture);
    assert.equal(result.ready, false);
    assert.match(result.issues.join('\n'), /package-lock\.json is absent/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('registry lock accepts the hosted workspace and exact registry packages', async () => {
  const fixture = await registryLockFixture();
  try {
    assert.deepEqual(await inspectRegistryLock(fixture), {
      ready: true,
      issues: [],
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('registry lock rejects a registry copy of the hosted workspace', async () => {
  const fixture = await registryLockFixture((lock) => {
    lock.packages['node_modules/@dexterai/x402-core'] = {
      version: '1.5.2',
      resolved: 'https://registry.example/x402-core.tgz',
      integrity: 'sha512-fixture',
    };
  });
  try {
    const result = await inspectRegistryLock(fixture);
    assert.equal(result.ready, false);
    assert.match(result.issues.join('\n'), /workspace lock must link exactly/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('registry lock rejects registry packages without integrity', async () => {
  const fixture = await registryLockFixture((lock) => {
    delete lock.packages[
      'node_modules/@dexterai/mcp-instructions'
    ].integrity;
  });
  try {
    const result = await inspectRegistryLock(fixture);
    assert.equal(result.ready, false);
    assert.match(result.issues.join('\n'), /sha512 integrity is missing/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('registry lock rejects a Vault artifact outside the reviewed source pack', async () => {
  const fixture = await registryLockFixture((lock) => {
    lock.packages['node_modules/@dexterai/vault'].integrity =
      'sha512-unreviewed-artifact';
  });
  try {
    const result = await inspectRegistryLock(fixture);
    assert.equal(result.ready, false);
    assert.match(
      result.issues.join('\n'),
      /registry integrity does not match the reviewed source pack/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('every npm pack lifecycle hook is rejected before npm can run', async () => {
  assert.deepEqual(NPM_PACK_LIFECYCLE_HOOKS, [
    'prepack',
    'prepare',
    'postpack',
  ]);
  for (const hook of NPM_PACK_LIFECYCLE_HOOKS) {
    assert.match(
      inspectPackLifecycleScripts({
        name: '@dexterai/fixture',
        scripts: { [hook]: 'hostile-command' },
      }).join('\n'),
      new RegExp(`forbidden npm pack lifecycle hooks: ${hook}`),
    );
  }
});

test('an exact reviewed lifecycle hook is admitted only with scripts disabled', () => {
  const pkg = {
    name: '@dexterai/fixture',
    scripts: { prepack: 'npm run build && npm run typecheck' },
  };
  const reviewed = { prepack: 'npm run build && npm run typecheck' };
  assert.deepEqual(
    inspectPackLifecycleScripts(pkg, pkg.name, reviewed),
    [],
  );
  assert.match(
    inspectPackLifecycleScripts(
      { ...pkg, scripts: { prepack: 'hostile-command' } },
      pkg.name,
      reviewed,
    ).join('\n'),
    /lifecycle hooks differ from the reviewed contract/,
  );
  assert.match(
    inspectPackLifecycleScripts(
      { ...pkg, scripts: undefined },
      pkg.name,
      reviewed,
    ).join('\n'),
    /lifecycle hooks differ from the reviewed contract/,
  );
});

test('hostile prepare is rejected without executing its marker', async () => {
  const fixture = await packedSourceFixture({ lifecycleHook: 'prepare' });
  try {
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      {
        requireBuild: true,
        runCommand: advertisedOriginRunner(fixture.repositoryRoot),
      },
    );
    assert.match(
      issues.join('\n'),
      /forbidden npm pack lifecycle hooks: prepare/,
    );
    await assert.rejects(access(resolve(fixture.packageRoot, '.prepare-ran')));
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('dirty external source fails before rebuild or peer npm inspection', async () => {
  const fixture = await packedSourceFixture();
  const hosted = await mkdtemp(resolve(tmpdir(), 'opendexter-source-hosted-'));
  const runtime = await mkdtemp(resolve(tmpdir(), 'opendexter-source-runtime-'));
  let rebuildCalled = false;
  let peerCalled = false;
  try {
    const manifest = {
      schemaVersion: 2,
      packageManager: 'npm@10.9.3',
      node: '^20.19.0 || >=22.12.0',
      hostedPackage: { name: 'fixture-hosted', version: '1.0.0' },
      repositories: { 'vault-sdk': fixture.repository },
      sourcePackages: [{
        ...fixture.expected,
        rootSpecifier: '1.0.0',
      }],
      runtimePackages: [],
      isolatedTooling: [],
    };
    await mkdir(resolve(hosted, 'release'), { recursive: true });
    await writeFile(
      resolve(hosted, 'release/opendexter-dependency-train.json'),
      JSON.stringify(manifest),
    );
    await writeFile(
      resolve(hosted, 'package.json'),
      JSON.stringify({
        name: 'fixture-hosted',
        version: '1.0.0',
        packageManager: 'npm@10.9.3',
        engines: { node: '^20.19.0 || >=22.12.0' },
        dependencies: { '@dexterai/fixture-vault': '1.0.0' },
      }),
    );
    const installedRoot = resolve(
      runtime,
      'node_modules/@dexterai/fixture-vault',
    );
    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      resolve(installedRoot, 'package.json'),
      JSON.stringify({ name: '@dexterai/fixture-vault', version: '1.0.0' }),
    );
    await writeFile(resolve(fixture.packageRoot, 'dirty.txt'), 'dirty\n');

    const result = await inspectSourceTrain({
      hostedRoot: hosted,
      ideRoot: hosted,
      vaultRoot: fixture.repositoryRoot,
      runtimeRoot: runtime,
      requireBuild: false,
      rebuildPackedArtifact: async () => {
        rebuildCalled = true;
        return [];
      },
      inspectPeerGraph: async () => {
        peerCalled = true;
        return [];
      },
      runCommand: advertisedOriginRunner(fixture.repositoryRoot),
    });
    assert.equal(result.ready, false);
    assert.match(result.issues.join('\n'), /source repository has uncommitted/);
    assert.equal(rebuildCalled, false);
    assert.equal(peerCalled, false);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
    await rm(hosted, { recursive: true, force: true });
    await rm(runtime, { recursive: true, force: true });
  }
});

test('external source requires exact remote and HEAD even when its package tree matches', async () => {
  const fixture = await packedSourceFixture();
  try {
    await writeFile(resolve(fixture.repositoryRoot, 'README.md'), 'later\n');
    await git(fixture.repositoryRoot, 'add', 'README.md');
    await git(fixture.repositoryRoot, 'commit', '-m', 'later outside package');
    await git(
      fixture.repositoryRoot,
      'remote',
      'set-url',
      'origin',
      'https://example.test/unreviewed.git',
    );
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      { requireBuild: true },
    );
    assert.match(issues.join('\n'), /source remote is .*unreviewed\.git/);
    assert.match(issues.join('\n'), /source HEAD is .* expected/);
    assert.doesNotMatch(issues.join('\n'), /current source tree is/);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('source preflight requires a reachable origin advertising the exact provenance commit', async () => {
  const fixture = await packedSourceFixture();
  try {
    const unadvertised = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      {
        requireBuild: true,
        runCommand: advertisedOriginRunner(fixture.repositoryRoot, {
          advertised: false,
        }),
      },
    );
    assert.match(
      unadvertised.join('\n'),
      /canonical origin does not advertise provenance commit/,
    );

    const unreachable = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      {
        requireBuild: true,
        runCommand: advertisedOriginRunner(fixture.repositoryRoot, {
          unreachable: true,
        }),
      },
    );
    assert.match(
      unreachable.join('\n'),
      /cannot verify Git provenance: fixture origin unavailable/,
    );
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('source preflight stays anonymous for public remotes even when an ambient token exists', async () => {
  const fixture = await packedSourceFixture();
  const token = 'ambient-token-must-not-reach-anonymous-git';
  const calls = [];
  const ambientHome = await mkdtemp(resolve(tmpdir(), 'ambient-home-'));
  let anonymousHome;
  let anonymousAskpass;
  let anonymousAskpassMode;
  let anonymousAskpassBytes;
  try {
    const runner = advertisedOriginRunner(fixture.repositoryRoot, { calls });
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      {
        requireBuild: true,
        environment: { HOME: ambientHome, GH_TOKEN: token },
        runCommand: async (command, args, options = {}) => {
          if (command === 'git' && args.includes('ls-remote')) {
            anonymousHome = options.env.HOME;
            anonymousAskpass = options.env.GIT_ASKPASS;
            anonymousAskpassBytes = await readFile(anonymousAskpass, 'utf8');
            anonymousAskpassMode = (await lstat(anonymousAskpass)).mode & 0o777;
          }
          return runner(command, args, options);
        },
      },
    );
    assert.deepEqual(issues, []);
    const remoteCalls = calls.filter(
      ({ command, args }) => command === 'git' && args.includes('ls-remote'),
    );
    assert.equal(remoteCalls.length, 1);
    assert.equal(Object.hasOwn(remoteCalls[0].options.env, 'GH_TOKEN'), false);
    assert.equal(
      Object.hasOwn(
        remoteCalls[0].options.env,
        'GITHUB_PERSONAL_ACCESS_TOKEN',
      ),
      false,
    );
    assert.equal(
      Object.hasOwn(
        remoteCalls[0].options.env,
        'OPENDEXTER_PRIVATE_GIT_TOKEN',
      ),
      false,
    );
    assert.equal(JSON.stringify(remoteCalls[0].args).includes(token), false);
    assert.equal(remoteCalls[0].args.includes('credential.helper='), true);
    assert.equal(remoteCalls[0].args.includes('http.followRedirects=false'), true);
    assert.equal(anonymousHome, remoteCalls[0].options.env.HOME);
    assert.equal(anonymousAskpass, remoteCalls[0].options.env.GIT_ASKPASS);
    assert.notEqual(anonymousHome, ambientHome);
    assert.equal(remoteCalls[0].options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(remoteCalls[0].options.env.GIT_ASKPASS_REQUIRE, 'force');
    assert.equal(anonymousAskpassBytes, '#!/bin/sh\nexit 1\n');
    assert.equal(anonymousAskpassMode, 0o700);
    await assert.rejects(access(anonymousHome));
    await assert.rejects(access(anonymousAskpass));
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
    await rm(ambientHome, { recursive: true, force: true });
  }
});

test('source preflight retries one canonical private GitHub remote through isolated askpass', async () => {
  const fixture = await packedSourceFixture();
  const remote = 'https://github.com/Dexter-DAO/private-source-fixture.git';
  const token = 'private-token-that-must-never-enter-diagnostics';
  const tokenSha256 = createHash('sha256').update(token).digest('hex');
  let remoteLookups = 0;
  let askpassPath;
  let anonymousHome;
  let anonymousAskpass;
  try {
    const repository = await useFixtureRemote(fixture, remote);
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      repository,
      {
        requireBuild: true,
        environment: {
          HOME: '/tmp',
          GITHUB_PERSONAL_ACCESS_TOKEN: token,
          GH_TOKEN: 'lower-priority-token',
        },
        runCommand: async (command, args, options = {}) => {
          if (command === 'git' && args.includes('ls-remote')) {
            remoteLookups += 1;
            assert.equal(JSON.stringify(args).includes(token), false);
            assert.equal(args.includes('http.followRedirects=false'), true);
            assert.equal(args.includes('credential.helper='), true);
            if (remoteLookups === 1) {
              assert.equal(Object.hasOwn(options.env, 'GH_TOKEN'), false);
              assert.equal(
                Object.hasOwn(options.env, 'GITHUB_PERSONAL_ACCESS_TOKEN'),
                false,
              );
              anonymousHome = options.env.HOME;
              anonymousAskpass = options.env.GIT_ASKPASS;
              assert.notEqual(anonymousHome, '/tmp');
              assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
              assert.equal(options.env.GIT_ASKPASS_REQUIRE, 'force');
              assert.equal(
                await readFile(anonymousAskpass, 'utf8'),
                '#!/bin/sh\nexit 1\n',
              );
              assert.equal(
                (await lstat(anonymousAskpass)).mode & 0o777,
                0o700,
              );
              throw new Error('anonymous source is private');
            }
            assert.equal(remoteLookups, 2);
            assert.equal(args.includes('--git-dir=/dev/null'), true);
            assert.equal(args.includes('credential.helper='), true);
            assert.equal(args.includes('--refs'), true);
            assert.deepEqual(args.slice(-3), [
              remote,
              'refs/heads/*',
              'refs/tags/*',
            ]);
            assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null');
            assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
            assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
            assert.equal(options.env.GIT_ASKPASS_REQUIRE, 'force');
            assert.equal(Object.hasOwn(options.env, 'GH_TOKEN'), false);
            assert.equal(
              Object.hasOwn(options.env, 'GITHUB_PERSONAL_ACCESS_TOKEN'),
              false,
            );
            assert.equal(
              createHash('sha256')
                .update(options.env.OPENDEXTER_PRIVATE_GIT_TOKEN)
                .digest('hex'),
              tokenSha256,
            );
            askpassPath = options.env.GIT_ASKPASS;
            const helper = await readFile(askpassPath, 'utf8');
            assert.equal(helper.includes(token), false);
            assert.equal(helper.includes('extraHeader'), false);
            return {
              stdout: `${repository.provenanceCommit}\trefs/heads/main\n`,
              stderr: '',
            };
          }
          return execFileAsync(command, args, options);
        },
      },
    );
    assert.deepEqual(issues, []);
    assert.equal(remoteLookups, 2);
    assert.equal(typeof askpassPath, 'string');
    await assert.rejects(access(askpassPath));
    await assert.rejects(access(anonymousAskpass));
    await assert.rejects(access(anonymousHome));
    assert.equal(issues.join('\n').includes(token), false);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('authenticated source lookup refuses redirects without a third credential contact', async () => {
  const fixture = await packedSourceFixture();
  const remote = 'https://github.com/Dexter-DAO/private-source-fixture.git';
  const token = 'private-token-that-must-not-follow-a-redirect';
  let remoteLookups = 0;
  try {
    const repository = await useFixtureRemote(fixture, remote);
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      repository,
      {
        requireBuild: true,
        environment: { HOME: '/tmp', GH_TOKEN: token },
        runCommand: async (command, args, options = {}) => {
          if (command === 'git' && args.includes('ls-remote')) {
            remoteLookups += 1;
            assert.equal(args.includes('http.followRedirects=false'), true);
            if (remoteLookups === 1) {
              throw new Error('anonymous source is private');
            }
            assert.equal(remoteLookups, 2);
            assert.equal(
              createHash('sha256')
                .update(options.env.OPENDEXTER_PRIVATE_GIT_TOKEN)
                .digest('hex'),
              createHash('sha256').update(token).digest('hex'),
            );
            throw new Error(`redirect target echoed ${token}`);
          }
          return execFileAsync(command, args, options);
        },
      },
    );
    assert.equal(remoteLookups, 2);
    assert.match(
      issues.join('\n'),
      /cannot verify Git provenance: authenticated GitHub source lookup failed/,
    );
    assert.doesNotMatch(issues.join('\n'), /private-token/);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('source preflight never retries authentication for noncanonical remotes', async () => {
  const remotes = [
    'git@github.com:Dexter-DAO/private-source-fixture.git',
    'https://example.test/private-source-fixture.git',
    'https://user@github.com/Dexter-DAO/private-source-fixture.git',
    'https://github.com.evil.example/Dexter-DAO/private-source-fixture.git',
    'https://github.com/Dexter-DAO/private-source-fixture',
    'https://github.com/Dexter-DAO/private-source-fixture.git?redirect=1',
  ];
  for (const remote of remotes) {
    const fixture = await packedSourceFixture();
    let remoteLookups = 0;
    try {
      const repository = await useFixtureRemote(fixture, remote);
      const issues = await inspectPackageSourcePreflight(
        fixture.repositoryRoot,
        fixture.expected,
        repository,
        {
          requireBuild: true,
          environment: { HOME: '/tmp', GH_TOKEN: 'unused-private-token' },
          runCommand: async (command, args, options = {}) => {
            if (command === 'git' && args.includes('ls-remote')) {
              remoteLookups += 1;
              throw new Error('anonymous source is unavailable');
            }
            return execFileAsync(command, args, options);
          },
        },
      );
      assert.equal(remoteLookups, 1);
      assert.match(
        issues.join('\n'),
        /cannot verify Git provenance: anonymous source is unavailable/,
      );
      assert.doesNotMatch(issues.join('\n'), /unused-private-token/);
    } finally {
      await rm(fixture.repositoryRoot, { recursive: true, force: true });
    }
  }
});

test('source preflight rejects a malformed private token before authenticated contact', async () => {
  const fixture = await packedSourceFixture();
  const remote = 'https://github.com/Dexter-DAO/private-source-fixture.git';
  let remoteLookups = 0;
  try {
    const repository = await useFixtureRemote(fixture, remote);
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      repository,
      {
        requireBuild: true,
        environment: { HOME: '/tmp', GH_TOKEN: 'hostile\nsecond-line' },
        runCommand: async (command, args, options = {}) => {
          if (command === 'git' && args.includes('ls-remote')) {
            remoteLookups += 1;
            throw new Error('anonymous source is private');
          }
          return execFileAsync(command, args, options);
        },
      },
    );
    assert.equal(remoteLookups, 1);
    assert.match(issues.join('\n'), /private source token is invalid/);
    assert.doesNotMatch(issues.join('\n'), /hostile|second-line/);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('authenticated source lookup retains the exact advertised-commit predicate', async () => {
  const fixture = await packedSourceFixture();
  const remote = 'https://github.com/Dexter-DAO/private-source-fixture.git';
  let remoteLookups = 0;
  try {
    const repository = await useFixtureRemote(fixture, remote);
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      repository,
      {
        requireBuild: true,
        environment: { HOME: '/tmp', GH_TOKEN: 'private-token' },
        runCommand: async (command, args, options = {}) => {
          if (command === 'git' && args.includes('ls-remote')) {
            remoteLookups += 1;
            if (remoteLookups === 1) {
              throw new Error('anonymous source is private');
            }
            return {
              stdout: `${'f'.repeat(40)}\trefs/heads/main\n`,
              stderr: '',
            };
          }
          return execFileAsync(command, args, options);
        },
      },
    );
    assert.equal(remoteLookups, 2);
    assert.match(
      issues.join('\n'),
      /canonical origin does not advertise provenance commit/,
    );
    assert.doesNotMatch(issues.join('\n'), /private-token/);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('source preflight refuses hostile loader state before invoking any tool', async () => {
  const fixture = await packedSourceFixture();
  let invoked = false;
  try {
    const issues = await inspectPackageSourcePreflight(
      fixture.repositoryRoot,
      fixture.expected,
      fixture.repository,
      {
        requireBuild: true,
        environment: {
          HOME: '/tmp',
          NODE_OPTIONS: '--require=/tmp/opendexter-hostile-marker',
        },
        runCommand: async () => {
          invoked = true;
          throw new Error('must not run');
        },
      },
    );
    assert.match(
      issues.join('\n'),
      /unsafe release tool environment: .*NODE_OPTIONS/,
    );
    assert.equal(invoked, false);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('source artifact is rebuilt from pinned archive, not ignored checkout output', async () => {
  const fixture = await packedSourceFixture();
  try {
    const ignoredOutput = resolve(fixture.packageRoot, 'dist/index.js');
    await mkdir(resolve(fixture.packageRoot, 'dist'), { recursive: true });
    await writeFile(ignoredOutput, 'malicious ignored output\n');
    assert.deepEqual(
      await inspectPackageSourcePreflight(
        fixture.repositoryRoot,
        fixture.expected,
        fixture.repository,
        {
          requireBuild: true,
          runCommand: advertisedOriginRunner(fixture.repositoryRoot),
        },
      ),
      [],
    );

    const first = await rebuildPackedSourceArtifact({
      sourceRoot: fixture.repositoryRoot,
      expected: fixture.expected,
      repository: fixture.repository,
      packageManager: 'npm@10.9.3',
    });
    await writeFile(ignoredOutput, 'different malicious ignored output\n');
    const second = await rebuildPackedSourceArtifact({
      sourceRoot: fixture.repositoryRoot,
      expected: fixture.expected,
      repository: fixture.repository,
      packageManager: 'npm@10.9.3',
    });
    assert.deepEqual(second, first);
    assert.equal(
      await readFile(ignoredOutput, 'utf8'),
      'different malicious ignored output\n',
    );

    const expected = {
      ...fixture.expected,
      packedArtifact: {
        ...fixture.expected.packedArtifact,
        ...first,
        integrity: 'sha512-intentionally-wrong',
      },
    };
    assert.match(
      comparePackedArtifact(first, expected).join('\n'),
      /source pack integrity is .* expected/,
    );
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('root workspace artifacts rebuild from the exact lock in frozen topological order', async () => {
  const fixture = await rootWorkspacePackedSourceFixture();
  const calls = [];
  try {
    const actual = await rebuildPackedSourceArtifact({
      sourceRoot: fixture.repositoryRoot,
      expected: fixture.expected,
      repository: fixture.repository,
      packageManager: 'npm@10.9.3',
      runCommand: async (command, args, options = {}) => {
        calls.push({ command, args: [...args], options });
        return execFileAsync(command, args, options);
      },
    });
    assert.equal(actual.name, '@dexterai/root-workspace-target');
    assert.equal(actual.version, '1.0.0');
    assert.match(actual.integrity, /^sha512-/);
    assert.match(actual.shasum, /^[0-9a-f]{40}$/);
    assert.match(actual.tgzSha256, /^[0-9a-f]{64}$/);

    const npmCalls = calls
      .filter(({ args }) => args[0]?.endsWith('/npm-cli.js'))
      .map(({ args, options }) => ({ args: args.slice(1), cwd: options.cwd }));
    assert.deepEqual(
      npmCalls.slice(0, 4).map(({ args }) => args),
      [
        ['--version'],
        ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
        [
          'run', 'build', '--workspace', '@dexterai/prerequisite',
        ],
        [
          'run', 'build', '--workspace', '@dexterai/root-workspace-target',
        ],
      ],
    );
    assert.equal(npmCalls[1].cwd.endsWith('/source'), true);
    assert.equal(npmCalls[2].cwd, npmCalls[1].cwd);
    assert.equal(npmCalls[3].cwd, npmCalls[1].cwd);
    assert.deepEqual(npmCalls[4].args.slice(0, 3), [
      'pack', '--ignore-scripts', '--json',
    ]);
    assert.equal(
      npmCalls[4].cwd.endsWith('/source/packages/target'),
      true,
    );
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('root workspace rebuild refuses a changed root lock before npm contact', async () => {
  const fixture = await rootWorkspacePackedSourceFixture();
  let npmContacted = false;
  try {
    const repository = structuredClone(fixture.repository);
    repository.rootWorkspaceBuild.packageLockSha256 = 'f'.repeat(64);
    await assert.rejects(
      rebuildPackedSourceArtifact({
        sourceRoot: fixture.repositoryRoot,
        expected: fixture.expected,
        repository,
        packageManager: 'npm@10.9.3',
        runCommand: async (command, args, options = {}) => {
          if (args[0]?.endsWith('/npm-cli.js')) npmContacted = true;
          return execFileAsync(command, args, options);
        },
      }),
      /archived root package-lock digest mismatch/,
    );
    assert.equal(npmContacted, false);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('root workspace rebuild fails closed when the frozen build order is reversed', async () => {
  const fixture = await rootWorkspacePackedSourceFixture();
  const buildCalls = [];
  try {
    const repository = structuredClone(fixture.repository);
    repository.rootWorkspaceBuild.buildOrder.reverse();
    await assert.rejects(
      rebuildPackedSourceArtifact({
        sourceRoot: fixture.repositoryRoot,
        expected: fixture.expected,
        repository,
        packageManager: 'npm@10.9.3',
        runCommand: async (command, args, options = {}) => {
          if (args[0]?.endsWith('/npm-cli.js') && args[1] === 'run') {
            buildCalls.push(args.slice(1));
          }
          return execFileAsync(command, args, options);
        },
      }),
      /isolated source rebuild failed/,
    );
    assert.deepEqual(buildCalls, [[
      'run', 'build', '--workspace', '@dexterai/root-workspace-target',
    ]]);
  } finally {
    await rm(fixture.repositoryRoot, { recursive: true, force: true });
  }
});

test('installed closure ignores missing dev tooling but rejects any broken production dependency', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-installed-'));
  try {
    await mkdir(resolve(fixture, 'node_modules/release-package'), {
      recursive: true,
    });
    await writeFile(
      resolve(fixture, 'package.json'),
      JSON.stringify({
        name: 'installed-closure-fixture',
        version: '1.0.0',
        dependencies: { 'release-package': '1.0.0' },
        devDependencies: { 'missing-dev-tool': '1.0.0' },
      }),
    );
    await writeFile(
      resolve(fixture, 'node_modules/release-package/package.json'),
      JSON.stringify({ name: 'release-package', version: '1.0.0' }),
    );

    assert.deepEqual(
      await inspectProductionClosure(fixture),
      [],
    );

    await rm(resolve(fixture, 'node_modules/release-package'), {
      recursive: true,
      force: true,
    });
    assert.notDeepEqual(
      await inspectProductionClosure(fixture),
      [],
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('release activation uses only the sealed candidate verifier and transactional switch', async () => {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(pkg.dependencies['@anthropic-ai/claude-agent-sdk'], undefined);
  assert.equal(pkg.dependencies.zod, '3.25.76');
  assert.equal(
    pkg.scripts['studio:setup'],
    'npm ci --prefix scripts/studio-runtime --omit=dev --ignore-scripts',
  );
  assert.equal(
    pkg.scripts['build:mcp-release'],
    'node scripts/release/build-open-release.mjs',
  );
  assert.equal(
    pkg.scripts['deploy:mcp'],
    'npm run verify:release:runtime && npm run verify:release:installed '
      + '&& node scripts/release/activate-open-release.mjs',
  );
  assert.equal(
    pkg.scripts['deploy:mcp:private'],
    'npm run verify:release:runtime && npm run verify:release:installed '
      + '&& node scripts/release/activate-private-release.mjs',
  );
  const deploySteps = pkg.scripts['deploy:mcp'].split(' && ');
  assert.equal(
    deploySteps.at(-1),
    'node scripts/release/activate-open-release.mjs',
  );
  assert.doesNotMatch(
    pkg.scripts['deploy:mcp'],
    /pm2|startOrReload|--update-env|\b(?:restart|reload)\b/,
  );
  assert.doesNotMatch(pkg.scripts['deploy:mcp'], /echo .*restarted/);
  assert.doesNotMatch(
    pkg.scripts['deploy:mcp:private'],
    /pm2|startOrReload|--update-env|\b(?:restart|reload)\b/,
  );
  await assert.rejects(
    inspectSourceTrain({
      hostedRoot,
      ideRoot: ideRoot || hostedRoot,
      vaultRoot: vaultRoot || hostedRoot,
    }),
    /runtimeRoot is required/,
  );
  assert.equal(typeof inspectInstalledRelease, 'function');
});

test('installed release gate requires the isolated Studio runtime graph', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-studio-runtime-'));
  try {
    await mkdir(resolve(fixture, 'scripts/studio-runtime'), { recursive: true });
    await writeFile(
      resolve(fixture, 'package.json'),
      JSON.stringify({ name: 'hosted-fixture', dependencies: {} }),
    );
    await writeFile(
      resolve(fixture, 'scripts/studio-runtime/package.json'),
      JSON.stringify({
        name: 'studio-fixture',
        dependencies: {
          '@anthropic-ai/claude-agent-sdk': '0.2.6',
          zod: '4.3.6',
        },
      }),
    );
    await writeFile(
      resolve(fixture, 'scripts/studio-runtime/query.mjs'),
      'export const query = () => {};\n',
    );
    const manifest = {
      isolatedTooling: [{
        name: 'Dexter Studio Claude runtime',
        path: 'scripts/studio-runtime',
        entrypoint: 'query.mjs',
        excludedFromHostedRootGraph: true,
        requiredInRelease: true,
        packages: [
          '@anthropic-ai/claude-agent-sdk@0.2.6',
          'zod@4.3.6',
        ],
      }],
    };

    assert.deepEqual(await inspectIsolatedTooling(fixture, manifest), []);
    const issues = await inspectIsolatedTooling(fixture, manifest, {
      requireInstalled: true,
    });
    assert.match(issues.join('\n'), /installed graph|npm ls rejected/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test(
  'exact local source train and installed runtime can be validated',
  { skip: !ideRoot || !vaultRoot || !runtimeRoot },
  async () => {
    const result = await inspectSourceTrain({
      hostedRoot,
      ideRoot,
      vaultRoot,
      runtimeRoot,
    });
    assert.deepEqual(result, { ready: true, issues: [] });
  },
);
