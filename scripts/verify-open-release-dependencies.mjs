#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'release/opendexter-dependency-train.json');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function numericVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  return match.slice(1).map(Number);
}

export function versionAtLeast(actual, minimum) {
  const left = numericVersion(actual);
  const right = numericVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

export function isSupportedNodeRuntime(version) {
  const [major] = numericVersion(version);
  return (
    (major === 20 && versionAtLeast(version, '20.19.0'))
    || (major >= 22 && versionAtLeast(version, '22.12.0'))
  );
}

export async function inspectRuntimeNode(
  hostedRoot,
  runtimeVersion = process.versions.node,
) {
  const manifest = await readJson(
    resolve(hostedRoot, 'release/opendexter-dependency-train.json'),
  );
  const hostedPackage = await readJson(resolve(hostedRoot, 'package.json'));
  const issues = [];
  if (hostedPackage.engines?.node !== manifest.node) {
    issues.push(
      `Node contract differs: package ${hostedPackage.engines?.node}, `
        + `train ${manifest.node}`,
    );
  }
  if (!isSupportedNodeRuntime(runtimeVersion)) {
    issues.push(
      `Node ${runtimeVersion} is unsupported; use ${manifest.node}`,
    );
  }
  return { ready: issues.length === 0, issues };
}

async function git(rootPath, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', rootPath, ...args], {
    encoding: 'utf8',
  });
  return stdout.trim();
}

async function inspectPackageSource(base, expected, repository, { requireBuild }) {
  const packageRoot = resolve(base, expected.path);
  const pkg = await readJson(resolve(packageRoot, 'package.json'));
  const issues = [];

  if (pkg.name !== expected.name) {
    issues.push(`${expected.path}: expected ${expected.name}, found ${pkg.name}`);
  }
  if (pkg.version !== expected.version) {
    issues.push(
      `${expected.name}: expected ${expected.version}, found ${pkg.version}`,
    );
  }
  if (requireBuild && !(await exists(resolve(packageRoot, expected.entrypoint)))) {
    issues.push(`${expected.name}: missing built ${expected.entrypoint}`);
  }

  try {
    const remote = await git(base, 'remote', 'get-url', 'origin');
    if (remote !== repository.remote) {
      issues.push(`${expected.name}: source remote is ${remote}`);
    }
    const recordedTree = await git(
      base,
      'rev-parse',
      `${repository.provenanceCommit}:${expected.path}`,
    );
    if (recordedTree !== expected.treeHash) {
      issues.push(
        `${expected.name}: recorded commit tree is ${recordedTree}, ` +
          `expected ${expected.treeHash}`,
      );
    }
    const currentTree = await git(base, 'rev-parse', `HEAD:${expected.path}`);
    if (currentTree !== expected.treeHash) {
      issues.push(
        `${expected.name}: current source tree is ${currentTree}, ` +
          `expected ${expected.treeHash}`,
      );
    }
    const dirty = await git(base, 'status', '--porcelain', '--', expected.path);
    if (dirty) {
      issues.push(`${expected.name}: source package path has uncommitted changes`);
    }
  } catch (error) {
    issues.push(`${expected.name}: cannot verify Git provenance: ${error.message}`);
  }

  return issues;
}

async function inspectInstalledPackage({
  runtimeRoot,
  expected,
  sourceRoot,
  installKind,
  requireBuild,
}) {
  const installedRoot = resolve(runtimeRoot, 'node_modules', expected.name);
  const issues = [];
  if (!(await exists(resolve(installedRoot, 'package.json')))) {
    return [`${expected.name}: missing from runtime node_modules`];
  }

  const pkg = await readJson(resolve(installedRoot, 'package.json'));
  if (pkg.version !== expected.version) {
    issues.push(
      `${expected.name}: installed ${pkg.version}, expected ${expected.version}`,
    );
  }
  if (requireBuild && !(await exists(resolve(installedRoot, expected.entrypoint)))) {
    issues.push(`${expected.name}: installed package lacks ${expected.entrypoint}`);
  }

  const installedInfo = await lstat(installedRoot);
  if (installKind === 'workspace' || installKind === 'linked-source') {
    const expectedRoot = resolve(sourceRoot, expected.path);
    if ((await realpath(installedRoot)) !== (await realpath(expectedRoot))) {
      issues.push(
        `${expected.name}: ${installKind} does not resolve to ${expectedRoot}`,
      );
    }
  } else if (installKind === 'registry' && installedInfo.isSymbolicLink()) {
    issues.push(`${expected.name}: release install is still a source link`);
  }

  return issues;
}

async function inspectPeerClosure(runtimeRoot, packageNames = []) {
  const args = [
    'ls',
    ...packageNames,
    '--all',
    '--json',
  ];
  let stdout = '';
  let failed = false;
  try {
    ({ stdout } = await execFileAsync('npm', args, {
      cwd: runtimeRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    failed = true;
    stdout = error.stdout || '';
    if (!stdout) {
      return [`npm ls could not inspect the installed graph: ${error.message}`];
    }
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return ['npm ls did not return a readable dependency report'];
  }
  const problems = Array.isArray(report.problems) ? report.problems : [];
  if (failed || problems.length > 0) {
    return problems.length > 0
      ? problems.map((problem) => `installed graph: ${problem}`)
      : ['npm ls rejected the installed dependency graph'];
  }
  return [];
}

async function inspectIsolatedTooling(hostedRoot, manifest) {
  const hostedPackage = await readJson(resolve(hostedRoot, 'package.json'));
  const issues = [];
  if (hostedPackage.dependencies?.['@anthropic-ai/claude-agent-sdk']) {
    issues.push('Claude Agent SDK must not share the hosted MCP dependency graph');
  }
  for (const tool of manifest.isolatedTooling || []) {
    const pkg = await readJson(resolve(hostedRoot, tool.path, 'package.json'));
    for (const coordinate of tool.packages) {
      const separator = coordinate.lastIndexOf('@');
      const name = coordinate.slice(0, separator);
      const version = coordinate.slice(separator + 1);
      if (pkg.dependencies?.[name] !== version) {
        issues.push(`${tool.name}: expected ${coordinate}`);
      }
    }
  }
  return issues;
}

export async function inspectSourceTrain({
  hostedRoot,
  ideRoot,
  runtimeRoot,
  requireBuild = true,
}) {
  if (!runtimeRoot) {
    throw new Error('runtimeRoot is required for source dependency verification');
  }
  const manifest = await readJson(
    resolve(hostedRoot, 'release/opendexter-dependency-train.json'),
  );
  const hostedPackage = await readJson(resolve(hostedRoot, 'package.json'));
  const issues = [];

  if (hostedPackage.name !== manifest.hostedPackage.name) {
    issues.push(`hosted package name is ${hostedPackage.name}`);
  }
  if (hostedPackage.version !== manifest.hostedPackage.version) {
    issues.push(`hosted package version is ${hostedPackage.version}`);
  }
  if (hostedPackage.packageManager !== manifest.packageManager) {
    issues.push(`package manager is ${hostedPackage.packageManager}`);
  }
  if (hostedPackage.engines?.node !== manifest.node) {
    issues.push(`Node engine is ${hostedPackage.engines?.node}`);
  }
  const runtime = await inspectRuntimeNode(hostedRoot);
  issues.push(...runtime.issues);

  for (const expected of manifest.sourcePackages) {
    const sourceRoot = expected.source === 'hosted' ? hostedRoot : ideRoot;
    const repository = manifest.repositories[expected.source];
    issues.push(
      ...(await inspectPackageSource(sourceRoot, expected, repository, {
        requireBuild,
      })),
    );
    if (hostedPackage.dependencies?.[expected.name] !== expected.rootSpecifier) {
      issues.push(
        `${expected.name}: hosted dependency is ` +
          `${hostedPackage.dependencies?.[expected.name]}`,
      );
    }
    issues.push(
      ...(await inspectInstalledPackage({
        runtimeRoot,
        expected,
        sourceRoot,
        installKind: expected.install.source,
        requireBuild,
      })),
    );
  }

  for (const expected of manifest.runtimePackages) {
    if (hostedPackage.dependencies?.[expected.name] !== expected.rootSpecifier) {
      issues.push(
        `${expected.name}: hosted dependency is ` +
          `${hostedPackage.dependencies?.[expected.name]}`,
      );
    }
    issues.push(
      ...(await inspectInstalledPackage({
        runtimeRoot,
        expected,
        sourceRoot: runtimeRoot,
        installKind: 'registry',
        requireBuild: false,
      })),
    );
  }

  issues.push(...(await inspectIsolatedTooling(hostedRoot, manifest)));
  issues.push(
    ...(await inspectPeerClosure(runtimeRoot, [
      ...manifest.sourcePackages,
      ...manifest.runtimePackages,
    ].map(({ name }) => name))),
  );
  return { ready: issues.length === 0, issues };
}

function inspectRegistryEntry(entry, expected, label) {
  const issues = [];
  if (entry?.version !== expected.version) {
    issues.push(`${label}: registry lock has ${entry?.version ?? 'no entry'}`);
    return issues;
  }
  if (entry.link === true) {
    issues.push(`${label}: registry lock still points to a source link`);
  }
  if (
    typeof entry.resolved !== 'string'
    || !entry.resolved.startsWith('https://')
    || typeof entry.integrity !== 'string'
    || !entry.integrity.startsWith('sha512-')
  ) {
    issues.push(`${label}: registry resolution or sha512 integrity is missing`);
  }
  return issues;
}

export async function inspectRegistryLock(hostedRoot) {
  const manifest = await readJson(
    resolve(hostedRoot, 'release/opendexter-dependency-train.json'),
  );
  const lockPath = resolve(hostedRoot, manifest.registryLock.file);
  if (!(await exists(lockPath))) {
    return {
      ready: false,
      issues: [
        `${manifest.registryLock.file} is absent; publish the coordinated ` +
          'internal package train and generate it with npm before deployment',
      ],
    };
  }

  const lock = await readJson(lockPath);
  const rootLock = lock.packages?.[''];
  const issues = [];
  for (const expected of manifest.sourcePackages) {
    if (rootLock?.dependencies?.[expected.name] !== expected.rootSpecifier) {
      issues.push(`${expected.name}: root lock specifier is not exact`);
    }
    const entry = lock.packages?.[`node_modules/${expected.name}`];
    if (expected.install.release === 'workspace') {
      const workspace = lock.packages?.[expected.path];
      if (entry?.link !== true || entry?.resolved !== expected.path) {
        issues.push(
          `${expected.name}: workspace lock must link exactly to ${expected.path}`,
        );
      }
      if (
        workspace?.name !== expected.name
        || workspace?.version !== expected.version
      ) {
        issues.push(`${expected.name}: workspace package entry is stale`);
      }
    } else {
      issues.push(...inspectRegistryEntry(entry, expected, expected.name));
    }
  }
  for (const expected of manifest.runtimePackages) {
    if (rootLock?.dependencies?.[expected.name] !== expected.rootSpecifier) {
      issues.push(`${expected.name}: root lock specifier is not exact`);
    }
    issues.push(
      ...inspectRegistryEntry(
        lock.packages?.[`node_modules/${expected.name}`],
        expected,
        expected.name,
      ),
    );
  }
  return { ready: issues.length === 0, issues };
}

export async function inspectInstalledRelease(hostedRoot) {
  const manifest = await readJson(
    resolve(hostedRoot, 'release/opendexter-dependency-train.json'),
  );
  const issues = [];
  for (const expected of manifest.sourcePackages) {
    issues.push(
      ...(await inspectInstalledPackage({
        runtimeRoot: hostedRoot,
        expected,
        sourceRoot: hostedRoot,
        installKind: expected.install.release,
        requireBuild: true,
      })),
    );
  }
  for (const expected of manifest.runtimePackages) {
    issues.push(
      ...(await inspectInstalledPackage({
        runtimeRoot: hostedRoot,
        expected,
        sourceRoot: hostedRoot,
        installKind: 'registry',
        requireBuild: false,
      })),
    );
  }
  issues.push(...(await inspectIsolatedTooling(hostedRoot, manifest)));
  issues.push(...(await inspectPeerClosure(hostedRoot)));
  return { ready: issues.length === 0, issues };
}

function fail(label, result) {
  console.error(`${label} failed:`);
  for (const issue of result.issues) console.error(`- ${issue}`);
  process.exitCode = 1;
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--runtime') {
    const result = await inspectRuntimeNode(root);
    if (!result.ready) return fail('OpenDexter Node runtime gate', result);
    console.log('OpenDexter Node runtime gate passed.');
    return;
  }
  if (mode === '--lock') {
    const result = await inspectRegistryLock(root);
    if (!result.ready) return fail('OpenDexter registry lock gate', result);
    console.log('OpenDexter registry lock gate passed.');
    return;
  }
  if (mode === '--installed') {
    const result = await inspectInstalledRelease(root);
    if (!result.ready) return fail('OpenDexter installed-runtime gate', result);
    console.log('OpenDexter installed-runtime gate passed.');
    return;
  }
  if (mode === '--source') {
    const ideRoot = process.env.OPENDXTER_IDE_SOURCE;
    const runtimeRoot = process.env.OPENDXTER_RUNTIME_ROOT;
    if (!ideRoot || !runtimeRoot) {
      throw new Error(
        'OPENDXTER_IDE_SOURCE and OPENDXTER_RUNTIME_ROOT must point to the ' +
          'exact source and installed-runtime candidates',
      );
    }
    const result = await inspectSourceTrain({
      hostedRoot: root,
      ideRoot: resolve(ideRoot),
      runtimeRoot: resolve(runtimeRoot),
    });
    if (!result.ready) return fail('OpenDexter source dependency gate', result);
    console.log('OpenDexter source dependency gate passed.');
    return;
  }
  throw new Error(
    'Usage: verify-open-release-dependencies.mjs '
      + '--runtime|--source|--lock|--installed',
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main();
}
