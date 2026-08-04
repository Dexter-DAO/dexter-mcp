#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
);

const EXPECTED_RUNTIME_EXPORTS = [
  'UnsafeExternalUrlError',
  'assertPublicExternalUrl',
  'buildSearchErrorResponse',
  'buildSearchResponse',
  'capabilitySearch',
  'checkEndpointPricing',
  'createPinnedLookup',
  'exactAtomicString',
  'extractBazaarSchema',
  'fetchPublicExternalUrl',
  'formatPrice',
  'formatResource',
  'formatVolume',
  'isPublicIpAddress',
  'parseExternalHttpUrl',
  'parsePaymentRequiredHeader',
  'resolveInputSchema',
  'resolveOutputSchema',
  'roundSimilarity',
  'sellerAcceptSha256',
].sort();

function fail(message) {
  throw new Error(`[check-module-formats] ${message}`);
}

function packagePath(declaredPath, label) {
  if (typeof declaredPath !== 'string' || declaredPath.length === 0) {
    fail(`${label} must declare a nonempty package path`);
  }
  const absolute = resolve(packageRoot, declaredPath);
  if (absolute !== packageRoot && !absolute.startsWith(`${packageRoot}/`)) {
    fail(`${label} points outside the package: ${declaredPath}`);
  }
  return absolute;
}

async function requireFile(declaredPath, label) {
  const absolute = packagePath(declaredPath, label);
  try {
    if (!(await stat(absolute)).isFile()) {
      fail(`${label} is not a file: ${declaredPath}`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      fail(`${label} does not exist: ${declaredPath}`);
    }
    throw error;
  }
  return absolute;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const rootExport = manifest.exports?.['.'];
if (!rootExport || typeof rootExport !== 'object' || Array.isArray(rootExport)) {
  fail('exports["."] must declare import, require, and types entrypoints');
}
if (manifest.type !== 'module') fail('package type must be "module"');

const mainFile = await requireFile(manifest.main, 'main');
const moduleFile = await requireFile(manifest.module, 'module');
const typesFile = await requireFile(manifest.types, 'types');
const importFile = await requireFile(rootExport.import, 'exports["."].import');
const requireFilePath = await requireFile(rootExport.require, 'exports["."].require');
const exportTypesFile = await requireFile(rootExport.types, 'exports["."].types');

if (mainFile !== requireFilePath) {
  fail('main and exports["."].require must resolve to one CommonJS file');
}
if (moduleFile !== importFile) {
  fail('module and exports["."].import must resolve to one ESM file');
}
if (typesFile !== exportTypesFile) {
  fail('types and exports["."].types must resolve to one declaration file');
}
if (!requireFilePath.endsWith('.cjs')) {
  fail('exports["."].require must resolve to a .cjs file');
}

const distFiles = await walk(resolve(packageRoot, 'dist'));
const sourcemaps = distFiles.filter((file) => file.endsWith('.map'));
if (sourcemaps.length > 0) {
  fail(`dist must not contain sourcemaps: ${sourcemaps.join(', ')}`);
}

const esm = await import(manifest.name);
const cjs = createRequire(import.meta.url)(manifest.name);
for (const [label, runtime] of [['import', esm], ['require', cjs]]) {
  const keys = Object.keys(runtime).sort();
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_RUNTIME_EXPORTS)) {
    fail(`${label} runtime exports differ from the exact public contract: ${keys.join(', ')}`);
  }
  for (const name of EXPECTED_RUNTIME_EXPORTS) {
    if (typeof runtime[name] !== 'function') {
      fail(`${label} runtime export ${name} must be a function or class`);
    }
  }
  const error = new runtime.UnsafeExternalUrlError('offline module-format check');
  if (!(error instanceof Error) || error.code !== 'unsafe_external_url') {
    fail(`${label} UnsafeExternalUrlError does not preserve its public runtime type`);
  }
}

const priceInput = 0.0042;
const esmPrice = esm.formatPrice(priceInput);
const cjsPrice = cjs.formatPrice(priceInput);
if (esmPrice !== '$0.0042' || cjsPrice !== esmPrice) {
  fail('import and require must produce the same canonical pure output');
}

console.log(
  `[check-module-formats] import and require expose ${EXPECTED_RUNTIME_EXPORTS.length} matching runtime exports`,
);
