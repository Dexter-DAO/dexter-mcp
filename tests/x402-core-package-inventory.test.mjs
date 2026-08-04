import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repoRoot, 'packages/x402-core');
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const licensePath = path.join(packageRoot, 'LICENSE');
const readmePath = path.join(packageRoot, 'README.md');

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
