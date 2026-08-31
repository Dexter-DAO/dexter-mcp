import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const typescriptPackage = require.resolve('typescript/package.json');
const compiler = join(dirname(typescriptPackage), 'bin', 'tsc');
const outputDirectory = mkdtempSync(join(tmpdir(), 'dexter-x402-contract-'));

try {
  execFileSync(process.execPath, [
    compiler,
    '--outDir', outputDirectory,
    '--declaration', 'false',
    '--declarationMap', 'false',
  ], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [
    '--test',
    join(outputDirectory, 'check.purchase.test.js'),
    join(outputDirectory, 'search.price-contract.test.js'),
  ], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
