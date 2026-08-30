import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'packages/x402-core');
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(path.join(packageRoot, 'package-lock.json'), 'utf8'));
const rootManifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const rootLock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
const licensePath = path.join(packageRoot, 'LICENSE');
const readmePath = path.join(packageRoot, 'README.md');
const checkerPath = path.join(packageRoot, 'scripts/check-module-formats.mjs');

const EXPECTED_LICENSE_SHA256 = '6a694c6c736e9474ca4b54dac937a509cc744459e7e7a03aa82a567ab097d7c3';
const EXPECTED_LICENSE_GIT_BLOB = '769fcf8daffe0842dbd7e29b3b7ab7aad2060dc7';

test('@dexterai/x402-core ships the package files promised by its manifest', () => {
  assert.ok(manifest.files.includes('LICENSE'), 'package manifest must include LICENSE');
  assert.ok(manifest.files.includes('README.md'), 'package manifest must include README.md');
  assert.equal(existsSync(licensePath), true, 'package-local LICENSE must exist');
  assert.equal(existsSync(readmePath), true, 'package-local README.md must exist');

  const license = readFileSync(licensePath);
  const sha256 = createHash('sha256').update(license).digest('hex');
  const gitBlob = createHash('sha1')
    .update(`blob ${license.length}\0`)
    .update(license)
    .digest('hex');

  assert.equal(sha256, EXPECTED_LICENSE_SHA256);
  assert.equal(gitBlob, EXPECTED_LICENSE_GIT_BLOB);

  const readme = readFileSync(readmePath, 'utf8');
  assert.ok(readme.trim().length > 0, 'package README.md must be nonempty');
  assert.match(readme, /@dexterai\/x402-core/, 'package README.md must identify the package');
});

test('@dexterai/x402-core declares one coherent dual-module release contract', () => {
  assert.equal(manifest.version, '1.5.2');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.main, 'dist/index.cjs');
  assert.equal(manifest.module, 'dist/index.js');
  assert.equal(manifest.types, 'dist/index.d.ts');
  assert.deepEqual(manifest.exports['.'], {
    import: './dist/index.js',
    require: './dist/index.cjs',
    types: './dist/index.d.ts',
  });
  assert.equal(
    manifest.scripts['release:prepare'],
    'npm test && npm run typecheck && npm run build && node ./scripts/check-module-formats.mjs',
  );
  assert.equal(manifest.scripts.prepublishOnly, 'npm run release:prepare');
  assert.equal(manifest.scripts.release, 'npm publish --access public');
  assert.doesNotMatch(manifest.scripts.release, /npm version/);

  const tsupConfig = readFileSync(path.join(packageRoot, 'tsup.config.ts'), 'utf8');
  assert.match(tsupConfig, /format:\s*\['esm',\s*'cjs'\]/);
  assert.match(tsupConfig, /clean:\s*true/);
  assert.match(tsupConfig, /sourcemap:\s*false/);
  assert.equal(existsSync(checkerPath), true, 'module-format checker must exist');

  const checker = readFileSync(checkerPath, 'utf8');
  assert.match(checker, /createRequire/);
  assert.match(checker, /await import\(manifest\.name\)/);
  assert.match(checker, /EXPECTED_RUNTIME_EXPORTS/);
  assert.match(checker, /endsWith\('\.map'\)/);
});

test('@dexterai/x402-core source and workspace identities are exactly 1.5.2', () => {
  assert.equal(packageLock.version, '1.5.2');
  assert.equal(packageLock.packages[''].version, '1.5.2');
  assert.equal(rootManifest.dependencies['@dexterai/x402-core'], '1.5.2');
  assert.equal(rootLock.packages[''].dependencies['@dexterai/x402-core'], '1.5.2');
  assert.equal(rootLock.packages['packages/x402-core'].version, '1.5.2');
  assert.deepEqual(rootLock.packages['node_modules/@dexterai/x402-core'], {
    resolved: 'packages/x402-core',
    link: true,
  });
});
