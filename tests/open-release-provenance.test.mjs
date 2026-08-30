import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readOpenReleaseIdentity } from '../lib/open-release-identity.mjs';

const require = createRequire(import.meta.url);
const {
  readSealedLegacyOpenRelease,
  readSealedOpenRelease,
} = require('../lib/open-release-provenance.cjs');
const fs = require('node:fs');

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function releaseIdentityEnvironment(service) {
  return {
    DEXTER_MCP_RELEASE_COMMIT: COMMIT,
    DEXTER_MCP_RELEASE_TREE: TREE,
    DEXTER_MCP_RELEASE_MANIFEST_SHA256: 'c'.repeat(64),
    DEXTER_MCP_DESCRIPTOR_SHA256: 'd'.repeat(64),
    DEXTER_MCP_RELEASE_PACKAGE_VERSION: '0.5.0',
    DEXTER_MCP_RELEASE_SERVICE: service,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sealedFixture({
  extraFiles = {},
  symlinks = {},
  unmanifestedFiles = {},
  openRoster = ['x402_search', 'dexter_prepare_asset_action'],
  privateRoster,
} = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'opendexter-release-fixture-'));
  const releaseDir = join(parent, COMMIT);
  mkdirSync(join(releaseDir, 'release'), { recursive: true });
  const files = new Map([
    ['production-bootstrap.mjs', Buffer.from('// bootstrap fixture\n')],
    ['open-mcp-server.mjs', Buffer.from('// open fixture\n')],
    ['package.json', Buffer.from(JSON.stringify({
      name: 'dexter-mcp',
      version: '0.5.0',
    }))],
    ['package-lock.json', Buffer.from('{}\n')],
  ]);
  if (privateRoster) {
    files.set('http-server-oauth.mjs', Buffer.from('// private fixture\n'));
    files.set(
      'ecosystem.private.production.cjs',
      Buffer.from('// private ecosystem fixture\n'),
    );
  }
  const descriptor = Buffer.from(`${JSON.stringify({
    connectedToolNames: openRoster,
    tools: openRoster.map((name) => ({ name })),
  })}\n`);
  files.set('release/open-tool-descriptors.json', descriptor);
  for (const [relative, contents] of Object.entries(extraFiles)) {
    files.set(relative, Buffer.from(contents));
  }
  const sealedProvenance = {
    schema: privateRoster
      ? 'dexter-mcp-immutable-release/v4'
      : 'dexter-mcp-immutable-release/v3',
    sourceCommit: COMMIT,
    sourceTree: TREE,
    sourceArchiveSha256: 'c'.repeat(64),
    packageLockSha256: sha256(files.get('package-lock.json')),
    descriptorSha256: sha256(descriptor),
    packageVersion: '0.5.0',
    nodeVersion: process.version,
    npmVersion: '10.9.3',
    sourceCommittedAt: '2026-08-01T00:00:00.000Z',
    entrypoints: {
      ...(privateRoster ? { 'dexter-mcp': 'production-bootstrap.mjs' } : {}),
      'dexter-open-mcp': 'production-bootstrap.mjs',
    },
    rosters: {
      ...(privateRoster ? { 'dexter-mcp': privateRoster } : {}),
      'dexter-open-mcp': openRoster,
    },
  };
  files.set(
    '.release-provenance.json',
    Buffer.from(`${JSON.stringify(sealedProvenance, null, 2)}\n`),
  );
  for (const [relative, bytes] of files) {
    mkdirSync(join(releaseDir, relative, '..'), { recursive: true });
    writeFileSync(join(releaseDir, relative), bytes);
    chmodSync(join(releaseDir, relative), 0o400);
  }
  for (const [relative, contents] of Object.entries(unmanifestedFiles)) {
    mkdirSync(join(releaseDir, relative, '..'), { recursive: true });
    writeFileSync(join(releaseDir, relative), contents, { mode: 0o400 });
  }
  for (const [relative, target] of Object.entries(symlinks)) {
    mkdirSync(join(releaseDir, relative, '..'), { recursive: true });
    symlinkSync(target, join(releaseDir, relative));
  }
  const manifest = Buffer.from(
    [
      ...[...files.entries()].map(([relative, bytes]) => ({
        kind: 'F',
        identity: sha256(bytes),
        relative,
      })),
      ...Object.entries(symlinks).map(([relative, target]) => ({
        kind: 'L',
        identity: target,
        relative,
      })),
    ]
      .sort((left, right) => left.relative.localeCompare(right.relative))
      .map(({ kind, identity, relative }) => (
        `${kind}\t${identity}\t${relative}\n`
      ))
      .join(''),
  );
  const manifestPath = `${releaseDir}.FILE-MANIFEST.tsv`;
  writeFileSync(manifestPath, manifest, { mode: 0o400 });
  const provenance = {
    ...sealedProvenance,
    artifactManifestSha256: sha256(manifest),
  };
  function sealDirectories(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) sealDirectories(join(directory, item.name));
    }
    chmodSync(directory, 0o500);
  }
  sealDirectories(releaseDir);
  return { parent, releaseDir, manifestPath, provenance };
}

function removeFixture(fixture) {
  function unsealDirectories(directory) {
    chmodSync(directory, 0o700);
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, item.name);
      if (item.isDirectory() && !lstatSync(absolute).isSymbolicLink()) {
        unsealDirectories(absolute);
      }
    }
  }
  unsealDirectories(fixture.releaseDir);
  rmSync(fixture.parent, { recursive: true, force: true });
}

function legacyFixture({ privateAlias = false } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'opendexter-legacy-release-'));
  const sourceCommit = '8'.repeat(40);
  const directoryName = privateAlias
    ? `${sourceCommit}-runtime1`
    : sourceCommit;
  const releaseDir = join(parent, directoryName);
  const mirrorDir = join(parent, 'private-runtime-mirror');
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(mirrorDir, { recursive: true });
  const packageLock = Buffer.from('{"lockfileVersion":3}\n');
  const entrypoint = Buffer.from('// exact legacy open entrypoint\n');
  const provenance = {
    schema: 'dexter-mcp-immutable-release/v1',
    sourceCommit,
    sourceArchiveSha256: '6'.repeat(64),
    packageLockSha256: sha256(packageLock),
    vaultVersion: '0.43.2',
    nodeVersion: '22.19.0',
    npmVersion: '10.9.3',
    builtAt: '2026-07-31T14:06:26.549Z',
    entrypoints: ['http-server-oauth.mjs', 'open-mcp-server.mjs'],
    environmentContract:
      'DEXTER_MCP_ENV_FILE owned mode-0600 regular file',
  };
  const files = new Map([
    ['.release-provenance.json', Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`)],
    ['package-lock.json', packageLock],
    ['package.json', Buffer.from(`${JSON.stringify({
      name: 'dexter-mcp',
      version: '0.4.0',
      packageManager: 'npm@10.9.3',
      engines: { node: '^20.19.0 || >=22.12.0' },
    })}\n`)],
    ['http-server-oauth.mjs', Buffer.from('// exact legacy private entrypoint\n')],
    ['open-mcp-server.mjs', entrypoint],
  ]);
  for (const [relative, bytes] of files) {
    writeFileSync(join(releaseDir, relative), bytes, { mode: 0o400 });
    chmodSync(join(releaseDir, relative), 0o400);
  }
  const mirroredEntrypoint = join(mirrorDir, 'open-mcp-server.mjs');
  linkSync(join(releaseDir, 'open-mcp-server.mjs'), mirroredEntrypoint);
  const manifest = Buffer.from([...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, bytes]) => `F\t${sha256(bytes)}\t${relative}\n`)
    .join(''));
  const manifestPath = `${releaseDir}.FILE-MANIFEST.tsv`;
  const sidecarPath = `${manifestPath}.sha256`;
  writeFileSync(manifestPath, manifest, { mode: 0o600 });
  writeFileSync(
    sidecarPath,
    `${sha256(manifest)}  ${manifestPath}\n`,
    { mode: 0o600 },
  );
  chmodSync(releaseDir, 0o500);
  const contract = {
    schema: provenance.schema,
    sourceCommit,
    sourceTree: '7'.repeat(40),
    sourceArchiveSha256: provenance.sourceArchiveSha256,
    packageLockSha256: provenance.packageLockSha256,
    artifactManifestSha256: sha256(manifest),
    artifactManifestSize: manifest.length,
    packageName: 'dexter-mcp',
    packageVersion: '0.4.0',
    packageManager: 'npm@10.9.3',
    node: '^20.19.0 || >=22.12.0',
    ...(privateAlias ? { directoryName } : {}),
    entrypoint: privateAlias
      ? 'http-server-oauth.mjs'
      : 'open-mcp-server.mjs',
    entrypointSha256: sha256(files.get(privateAlias
      ? 'http-server-oauth.mjs'
      : 'open-mcp-server.mjs')),
    canonicalRemote: 'https://example.test/dexter-mcp.git',
    canonicalRef: 'refs/heads/release',
    healthKeys: [],
    roster: ['x402_search'],
    provenance,
  };
  return {
    parent,
    releaseDir,
    manifestPath,
    sidecarPath,
    mirroredEntrypoint,
    contract,
  };
}

function removeLegacyFixture(fixture) {
  chmodSync(fixture.releaseDir, 0o700);
  chmodSync(join(fixture.releaseDir, 'open-mcp-server.mjs'), 0o600);
  chmodSync(fixture.parent, 0o700);
  rmSync(fixture.parent, { recursive: true, force: true });
}

test('sealed release binds complete files, descriptor, roster, and source identity', (t) => {
  const fixture = sealedFixture();
  t.after(() => removeFixture(fixture));
  const release = readSealedOpenRelease(fixture.releaseDir);
  assert.equal(release.releaseDir, fixture.releaseDir);
  assert.equal(release.provenance.sourceCommit, COMMIT);
  assert.deepEqual(
    release.provenance.rosters['dexter-open-mcp'],
    fixture.provenance.rosters['dexter-open-mcp'],
  );
  assert.equal(
    readFileSync(release.descriptorPath, 'utf8').includes('x402_search'),
    true,
  );
});

test('v4 sealed release binds the private OAuth server and public OpenDexter together', (t) => {
  const privateRoster = ['resolve_wallet', 'auth_info'];
  const fixture = sealedFixture({ privateRoster });
  t.after(() => removeFixture(fixture));
  const release = readSealedOpenRelease(fixture.releaseDir);
  assert.equal(release.provenance.schema, 'dexter-mcp-immutable-release/v4');
  assert.deepEqual(release.provenance.rosters['dexter-mcp'], privateRoster);
  assert.equal(
    release.provenance.entrypoints['dexter-mcp'],
    'production-bootstrap.mjs',
  );
});

test('release identity parser accepts both attested v4 service names', () => {
  for (const service of ['dexter-mcp', 'dexter-open-mcp']) {
    assert.equal(
      readOpenReleaseIdentity(releaseIdentityEnvironment(service)).service,
      service,
    );
  }
  assert.throws(
    () => readOpenReleaseIdentity(releaseIdentityEnvironment('other-service')),
    /invalid_opendexter_release_identity/,
  );
});

test('sealed release uses the final SEP-986 tool-name alphabet and 128-byte edge', (t) => {
  const openRoster = [
    'A',
    'tools_code-interpreter_jobs',
    'tools.deep-research-jobs',
    'x'.repeat(128),
  ];
  const fixture = sealedFixture({ openRoster });
  t.after(() => removeFixture(fixture));
  assert.deepEqual(
    readSealedOpenRelease(fixture.releaseDir)
      .provenance.rosters['dexter-open-mcp'],
    openRoster,
  );
});

test('sealed release rejects slash, space, empty, and overlong tool names', (t) => {
  for (const invalidName of [
    'tools/code-interpreter',
    'tools code-interpreter',
    '',
    'x'.repeat(129),
  ]) {
    const fixture = sealedFixture({ openRoster: ['valid', invalidName] });
    t.after(() => removeFixture(fixture));
    assert.throws(
      () => readSealedOpenRelease(fixture.releaseDir),
      /invalid dexter-open-mcp release roster/,
    );
  }
});

test('legacy v1 reader binds manifest, metadata, hard links, and performs no writes', (t) => {
  const fixture = legacyFixture();
  t.after(() => removeLegacyFixture(fixture));
  const entrypoint = join(fixture.releaseDir, 'open-mcp-server.mjs');
  const before = {
    release: lstatSync(fixture.releaseDir),
    entrypoint: lstatSync(entrypoint),
    mirror: lstatSync(fixture.mirroredEntrypoint),
    manifest: lstatSync(fixture.manifestPath),
    sidecar: lstatSync(fixture.sidecarPath),
  };
  const originals = Object.fromEntries([
    'chmodSync',
    'renameSync',
    'rmSync',
    'unlinkSync',
    'writeFileSync',
  ].map((name) => [name, fs[name]]));
  let writes = 0;
  for (const name of Object.keys(originals)) {
    fs[name] = () => {
      writes += 1;
      throw new Error(`unexpected legacy verifier mutation: ${name}`);
    };
  }
  let release;
  try {
    release = readSealedLegacyOpenRelease(
      fixture.releaseDir,
      fixture.contract,
    );
  } finally {
    for (const [name, implementation] of Object.entries(originals)) {
      fs[name] = implementation;
    }
  }
  assert.equal(writes, 0);
  assert.equal(release.kind, 'legacy-open-v1');
  assert.equal(release.rollbackIdentity.fileCount, 5);
  assert.match(release.rollbackIdentity.filesystemMetadataSha256, /^[a-f0-9]{64}$/);
  assert.equal(release.sourceIdentity.tree, fixture.contract.sourceTree);
  const after = {
    release: lstatSync(fixture.releaseDir),
    entrypoint: lstatSync(entrypoint),
    mirror: lstatSync(fixture.mirroredEntrypoint),
    manifest: lstatSync(fixture.manifestPath),
    sidecar: lstatSync(fixture.sidecarPath),
  };
  for (const key of Object.keys(before)) {
    assert.equal(after[key].ino, before[key].ino);
    assert.equal(after[key].mode, before[key].mode);
    assert.equal(after[key].nlink, before[key].nlink);
    assert.equal(after[key].mtimeMs, before[key].mtimeMs);
    assert.equal(after[key].ctimeMs, before[key].ctimeMs);
  }
  assert.equal(before.entrypoint.ino, before.mirror.ino);
  assert.equal(before.entrypoint.nlink, 2);
});

test('legacy v1 reader accepts the exact private runtime alias contract', (t) => {
  const fixture = legacyFixture({ privateAlias: true });
  t.after(() => removeLegacyFixture(fixture));
  const release = readSealedLegacyOpenRelease(
    fixture.releaseDir,
    fixture.contract,
  );
  assert.equal(
    release.entrypoint,
    join(fixture.releaseDir, 'http-server-oauth.mjs'),
  );
});

test('legacy v1 reader refuses changed bytes, extras, and sidecar drift', (t) => {
  const byteFixture = legacyFixture();
  const extraFixture = legacyFixture();
  const sidecarFixture = legacyFixture();
  for (const fixture of [byteFixture, extraFixture, sidecarFixture]) {
    t.after(() => removeLegacyFixture(fixture));
  }

  const entrypoint = join(byteFixture.releaseDir, 'open-mcp-server.mjs');
  chmodSync(entrypoint, 0o600);
  writeFileSync(entrypoint, '// tampered legacy bytes\n');
  chmodSync(entrypoint, 0o400);
  assert.throws(
    () => readSealedLegacyOpenRelease(byteFixture.releaseDir, byteFixture.contract),
    /legacy release file identity mismatch/,
  );

  chmodSync(extraFixture.releaseDir, 0o700);
  writeFileSync(join(extraFixture.releaseDir, 'extra.txt'), 'extra\n', {
    mode: 0o400,
  });
  chmodSync(extraFixture.releaseDir, 0o500);
  assert.throws(
    () => readSealedLegacyOpenRelease(extraFixture.releaseDir, extraFixture.contract),
    /legacy release file manifest is incomplete/,
  );

  writeFileSync(sidecarFixture.sidecarPath, 'f'.repeat(64), { mode: 0o600 });
  assert.throws(
    () => readSealedLegacyOpenRelease(
      sidecarFixture.releaseDir,
      sidecarFixture.contract,
    ),
    /legacy OpenDexter manifest identity mismatch/,
  );
});

test('legacy v1 reader closes manifest and sidecar TOCTOU after traversal', (t) => {
  const fixture = legacyFixture();
  t.after(() => removeLegacyFixture(fixture));
  const trigger = join(fixture.releaseDir, 'package.json');
  const originalRead = fs.readFileSync;
  let changed = false;
  fs.readFileSync = function hostileRead(path, ...args) {
    const result = originalRead.call(this, path, ...args);
    if (!changed && path === trigger) {
      changed = true;
      fs.appendFileSync(fixture.manifestPath, '\n');
    }
    return result;
  };
  try {
    assert.throws(
      () => readSealedLegacyOpenRelease(
        fixture.releaseDir,
        fixture.contract,
      ),
      /legacy OpenDexter controls changed during verification/,
    );
  } finally {
    fs.readFileSync = originalRead;
  }
  assert.equal(changed, true);
});

test('sealed release rejects changed or unlisted candidate bytes', (t) => {
  const fixture = sealedFixture();
  t.after(() => removeFixture(fixture));
  chmodSync(fixture.releaseDir, 0o700);
  const entrypoint = join(fixture.releaseDir, 'open-mcp-server.mjs');
  chmodSync(entrypoint, 0o600);
  writeFileSync(entrypoint, '// tampered\n');
  chmodSync(entrypoint, 0o400);
  chmodSync(fixture.releaseDir, 0o500);
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /release file digest mismatch/,
  );

  chmodSync(fixture.releaseDir, 0o700);
  chmodSync(entrypoint, 0o600);
  writeFileSync(entrypoint, '// open fixture\n');
  chmodSync(entrypoint, 0o400);
  writeFileSync(join(fixture.releaseDir, 'unlisted.mjs'), '// extra\n', {
    mode: 0o400,
  });
  chmodSync(fixture.releaseDir, 0o500);
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /manifest is incomplete/,
  );
});

test('sealed release rejects provenance bytes changed after manifesting', (t) => {
  const fixture = sealedFixture();
  t.after(() => removeFixture(fixture));
  const provenancePath = join(fixture.releaseDir, '.release-provenance.json');
  chmodSync(provenancePath, 0o600);
  const tampered = JSON.parse(readFileSync(provenancePath, 'utf8'));
  tampered.sourceTree = 'd'.repeat(40);
  writeFileSync(provenancePath, `${JSON.stringify(tampered, null, 2)}\n`);
  chmodSync(provenancePath, 0o400);
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /release file digest mismatch: \.release-provenance\.json/,
  );
});

test('sealed release accepts a manifested internal workspace directory symlink', (t) => {
  const fixture = sealedFixture({
    extraFiles: {
      '.agents/skills/pay/SKILL.md': '# Pay\n',
    },
    symlinks: {
      'skills/pay': '../.agents/skills/pay',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.doesNotThrow(() => readSealedOpenRelease(fixture.releaseDir));
});

test('sealed release accepts a fully manifested nested internal symlink', (t) => {
  const fixture = sealedFixture({
    extraFiles: {
      '.agents/skills/pay/SKILL.md': '# Pay\n',
    },
    symlinks: {
      'aliases/pay': '../.agents/skills/pay',
      'skills/pay': '../aliases/pay',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.doesNotThrow(() => readSealedOpenRelease(fixture.releaseDir));
});

test('sealed release rejects an absolute symlink target', (t) => {
  const fixture = sealedFixture({
    symlinks: {
      'skills/pay': '/tmp',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /symlink target must be relative: skills\/pay/,
  );
});

test('sealed release rejects a lexical symlink escape', (t) => {
  const fixture = sealedFixture({
    symlinks: {
      'skills/pay': '../../outside',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /symlink target escapes candidate: skills\/pay/,
  );
});

test('sealed release rejects a dangling internal symlink', (t) => {
  const fixture = sealedFixture({
    symlinks: {
      'skills/pay': '../.agents/skills/missing',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /symlink target is missing: skills\/pay/,
  );
});

test('sealed release requires internal symlink target content in the manifest', (t) => {
  const fixture = sealedFixture({
    unmanifestedFiles: {
      'unmanifested.mjs': '// not listed\n',
    },
    symlinks: {
      'entrypoint-link.mjs': 'unmanifested.mjs',
    },
  });
  t.after(() => removeFixture(fixture));
  assert.throws(
    () => readSealedOpenRelease(fixture.releaseDir),
    /symlink target is not covered by manifest: entrypoint-link\.mjs/,
  );
});
