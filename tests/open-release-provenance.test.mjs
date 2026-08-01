import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  chmodSync,
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

const require = createRequire(import.meta.url);
const {
  readSealedOpenRelease,
} = require('../lib/open-release-provenance.cjs');

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sealedFixture({
  extraFiles = {},
  symlinks = {},
  unmanifestedFiles = {},
} = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'opendexter-release-fixture-'));
  const releaseDir = join(parent, COMMIT);
  mkdirSync(join(releaseDir, 'release'), { recursive: true });
  const files = new Map([
    ['production-bootstrap.mjs', Buffer.from('// bootstrap fixture\n')],
    ['http-server-oauth.mjs', Buffer.from('// private fixture\n')],
    ['open-mcp-server.mjs', Buffer.from('// open fixture\n')],
    ['package.json', Buffer.from(JSON.stringify({
      name: 'dexter-mcp',
      version: '0.5.0',
    }))],
    ['package-lock.json', Buffer.from('{}\n')],
  ]);
  const openRoster = ['x402_search', 'dexter_prepare_asset_action'];
  const descriptor = Buffer.from(`${JSON.stringify({
    connectedToolNames: openRoster,
    tools: openRoster.map((name) => ({ name })),
  })}\n`);
  files.set('release/open-tool-descriptors.json', descriptor);
  for (const [relative, contents] of Object.entries(extraFiles)) {
    files.set(relative, Buffer.from(contents));
  }
  const sealedProvenance = {
    schema: 'dexter-mcp-immutable-release/v3',
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
      'dexter-mcp': 'production-bootstrap.mjs',
      'dexter-open-mcp': 'production-bootstrap.mjs',
    },
    rosters: {
      'dexter-mcp': ['private_fixture'],
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
