import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  inspectInstalledRelease,
  inspectRegistryLock,
  inspectRuntimeNode,
  inspectSourceTrain,
  isSupportedNodeRuntime,
  versionAtLeast,
} from '../scripts/verify-open-release-dependencies.mjs';

const hostedRoot = new URL('..', import.meta.url).pathname;
const ideRoot = process.env.OPENDXTER_IDE_SOURCE;
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
      integrity: 'sha512-fixture',
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
      '@dexterai/mcp-instructions@2.3.0',
      '@dexterai/x402-mcp-tools@0.7.1',
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
    ],
  );
  assert.equal(
    manifest.repositories['opendexter-ide'].provenanceCommit,
    '01d9fd9cf8f02a2a442590f79ef272cf48e459b3',
  );
  assert.equal(manifest.registryLock.requiredBeforeDeploy, true);
});

test('registry deployment gate fails closed without a real npm lock', async () => {
  const result = await inspectRegistryLock(hostedRoot);
  assert.equal(result.ready, false);
  assert.match(result.issues.join('\n'), /package-lock\.json is absent/);
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
    }),
    /runtimeRoot is required/,
  );
  assert.equal(typeof inspectInstalledRelease, 'function');
});

test(
  'exact local source train and installed runtime can be validated',
  { skip: !ideRoot || !runtimeRoot },
  async () => {
    const result = await inspectSourceTrain({
      hostedRoot,
      ideRoot,
      runtimeRoot,
    });
    assert.deepEqual(result, { ready: true, issues: [] });
  },
);
