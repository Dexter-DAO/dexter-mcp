import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  inspectInstalledRelease,
  inspectPackedSourceArtifact,
  inspectProductionClosure,
  inspectRegistryLock,
  inspectRuntimeNode,
  inspectSourceTrain,
  gitTreeSpec,
  isSupportedNodeRuntime,
  readPackedSourceArtifact,
  releaseClosurePackageNames,
  versionAtLeast,
} from '../scripts/verify-open-release-dependencies.mjs';

const hostedRoot = new URL('..', import.meta.url).pathname;
const ideRoot = process.env.OPENDXTER_IDE_SOURCE;
const vaultRoot = process.env.DEXTER_VAULT_SDK_SOURCE;
const runtimeRoot = process.env.OPENDXTER_RUNTIME_ROOT;

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
      version: '1.5.0',
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
      '@dexterai/x402-core@1.5.0',
      '@dexterai/mcp-instructions@2.4.0',
      '@dexterai/x402-mcp-tools@0.8.0',
      '@dexterai/vault@0.43.0',
    ],
  );
  assert.deepEqual(
    manifest.runtimePackages.map(({ name, version }) =>
      `${name}@${version}`),
    [
      '@modelcontextprotocol/sdk@1.29.0',
      '@modelcontextprotocol/ext-apps@1.6.0',
      'zod@3.25.76',
    ],
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.node, '^20.19.0 || >=22.12.0');
  assert.deepEqual(
    manifest.sourcePackages.map(({ install }) => install),
    [
      { source: 'workspace', release: 'workspace' },
      { source: 'linked-source', release: 'registry' },
      { source: 'linked-source', release: 'registry' },
      { source: 'registry', release: 'registry' },
    ],
  );
  assert.equal(
    manifest.repositories['opendexter-ide'].provenanceCommit,
    '49805e9cd7894e982d8e6227af1e98e0ccd1d05e',
  );
  assert.deepEqual(manifest.repositories['vault-sdk'], {
    remote: 'https://github.com/Dexter-DAO/dexter-vault-sdk.git',
    provenanceCommit: 'dac9a9384f181341370c8fa776b1832279911a30',
  });
  assert.deepEqual(
    manifest.sourcePackages.find(({ name }) => name === '@dexterai/vault'),
    {
      name: '@dexterai/vault',
      version: '0.43.0',
      rootSpecifier: '0.43.0',
      source: 'vault-sdk',
      path: '.',
      entrypoint: 'dist/index.js',
      treeHash: 'cafe641da3821f765708e55b59374be5cfac05f8',
      packedArtifact: {
        integrity: 'sha512-WJVc4hjVMY+xGUhs1Yct2Hin8LiPccX/Og6jP6+NDuWqopj8bEAU/7iVgAljqFDXkM3BTNFXuXalaSmCZvBeYA==',
        shasum: 'b2d6ffa85da429d006fcfd86ce910db219f88690',
        size: 584781,
        unpackedSize: 2860999,
        entryCount: 91,
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
      version: '1.5.0',
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

test('source pack verification fails closed on any artifact mismatch', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-pack-source-'));
  try {
    await writeFile(
      resolve(fixture, 'package.json'),
      JSON.stringify({
        name: '@dexterai/fixture',
        version: '1.0.0',
        files: ['index.js'],
      }),
    );
    await writeFile(resolve(fixture, 'index.js'), 'export const value = 1;\n');
    const packedArtifact = await readPackedSourceArtifact(fixture);
    const expected = {
      name: '@dexterai/fixture',
      version: '1.0.0',
      packedArtifact,
    };
    assert.deepEqual(
      await inspectPackedSourceArtifact(fixture, expected),
      [],
    );

    await writeFile(resolve(fixture, 'index.js'), 'export const value = 2;\n');
    const result = await inspectPackedSourceArtifact(fixture, expected);
    assert.match(result.join('\n'), /source pack integrity is .* expected/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
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

test('release scripts require lock, clean install, build, and installed closure', async () => {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(pkg.dependencies['@anthropic-ai/claude-agent-sdk'], undefined);
  assert.equal(pkg.dependencies.zod, '3.25.76');
  assert.match(
    pkg.scripts['deploy:mcp'],
    /^npm run verify:release:runtime && npm run verify:release:lock && npm ci && npm run build:runtime-workspaces && npm run verify:release:installed /,
  );
  assert.doesNotMatch(pkg.scripts['deploy:mcp'], /echo .*restarted/);
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
