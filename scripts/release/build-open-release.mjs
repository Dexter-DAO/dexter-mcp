#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as defaultFs from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  createReviewedGitArchive,
  REVIEWED_NPM_VERSION,
  reviewedGitRemoteRefs,
  reviewedNpmInvocation,
  reviewedReleaseToolEnvironment,
} from '../../lib/open-release-tooling.mjs';
import {
  runOpenReleaseFinalization,
} from '../../lib/open-release-finalization.mjs';

const execFileAsync = promisify(execFile);

export const CANONICAL_SOURCE_ORIGIN =
  'https://github.com/Dexter-DAO/dexter-mcp.git';
export const REQUIRED_NPM_VERSION = REVIEWED_NPM_VERSION;
export const RELEASE_PROVENANCE_SCHEMA =
  'dexter-mcp-immutable-release/v4';

const SOURCE_COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const SOURCE_CONTRACTS_SCHEMA_VERSION = 3;
const SOURCE_CONTRACTS_KIND = 'opendexter-source-contracts/v3';
const PRIVATE_ROSTER_MARKER = 'DEXTER_MCP_PRIVATE_ROSTER=';
const ENTRYPOINTS = Object.freeze({
  'dexter-mcp': 'production-bootstrap.mjs',
  'dexter-open-mcp': 'production-bootstrap.mjs',
});
const APPLICATION_ENTRYPOINTS = Object.freeze({
  'dexter-mcp': 'http-server-oauth.mjs',
  'dexter-open-mcp': 'open-mcp-server.mjs',
});
const PRIVATE_ECOSYSTEM_ENTRYPOINT = 'ecosystem.private.production.cjs';

function exactEnvironment(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

function buildEnvironment({
  production,
  npmCache,
  reviewedEnvironment,
}) {
  return exactEnvironment({
    ...reviewedReleaseToolEnvironment({
      env: reviewedEnvironment,
      production,
      npmCache,
    }),
    SENTRY_DSN: '',
    SENTRY_OPEN_MCP_DSN: '',
    TOKEN_AI_MCP_PROFILE: '',
    TOKEN_AI_MCP_TOOLSETS: '',
  });
}

function textOutput(result) {
  return typeof result?.stdout === 'string'
    ? result.stdout
    : Buffer.isBuffer(result?.stdout)
      ? result.stdout.toString('utf8')
      : '';
}

async function runText(runCommand, command, args, options = {}) {
  return textOutput(await runCommand(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }));
}

function pathIsWithin(root, candidate) {
  const child = relative(root, candidate);
  return child === '' || (
    child !== '..'
    && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(child)
  );
}

function pathsOverlap(left, right) {
  return pathIsWithin(left, right) || pathIsWithin(right, left);
}

async function exists(io, path) {
  try {
    await io.lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function sha256File(io, path) {
  return createHash('sha256').update(await io.readFile(path)).digest('hex');
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stablePathSort(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRoster(value, label) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((name) => typeof name !== 'string' || !TOOL_NAME.test(name))
    || new Set(value).size !== value.length
  ) {
    throw new Error(`${label} did not produce one exact tool roster`);
  }
  return [...value];
}

function parseDescriptor(stdout) {
  let descriptor;
  try {
    descriptor = JSON.parse(stdout);
  } catch (error) {
    throw new Error('archived OpenDexter materializer returned invalid JSON', {
      cause: error,
    });
  }
  const connected = exactRoster(
    descriptor?.connectedToolNames,
    'OpenDexter materializer',
  );
  const toolNames = exactRoster(
    descriptor?.tools?.map((tool) => tool?.name),
    'OpenDexter tools/list descriptor',
  );
  if (
    descriptor?.schemaVersion !== 2
    || descriptor?.kind !== 'opendexter-hosted-tool-descriptors/v2'
    || descriptor?.sourceContracts?.schemaVersion
      !== SOURCE_CONTRACTS_SCHEMA_VERSION
    || descriptor?.sourceContracts?.kind !== SOURCE_CONTRACTS_KIND
    || descriptor?.oauth?.resource !== 'https://open.dexter.cash/mcp'
    || typeof descriptor?.oauth?.authorizationServer !== 'string'
    || typeof descriptor?.oauth?.authorizationServerMetadata !== 'string'
    || typeof descriptor?.oauth?.tokenIssuer !== 'string'
    || !Array.isArray(descriptor?.oauth?.protectedResourcePaths)
    || !Array.isArray(descriptor?.oauth?.scopesSupported)
    || !Array.isArray(descriptor?.oauth?.challengeRequiredParameters)
    || JSON.stringify(connected) !== JSON.stringify(toolNames)
  ) {
    throw new Error('archived OpenDexter materializer returned a mismatched roster');
  }
  for (const field of [
    'anonymousToolNames',
    'oauthPromotedToolNames',
    'optionalOAuthToolNames',
  ]) {
    const names = descriptor[field];
    if (
      !Array.isArray(names)
      || names.some((name) => !connected.includes(name))
      || new Set(names).size !== names.length
    ) {
      throw new Error(`archived OpenDexter descriptor has invalid ${field}`);
    }
  }
  return { descriptor, connected };
}

function parsePrivateRoster(stdout) {
  const marker = stdout.lastIndexOf(PRIVATE_ROSTER_MARKER);
  if (marker < 0) {
    throw new Error('archived private server did not emit its finalized roster');
  }
  const encoded = stdout
    .slice(marker + PRIVATE_ROSTER_MARKER.length)
    .split(/\r?\n/, 1)[0];
  try {
    return exactRoster(JSON.parse(encoded), 'private MCP server');
  } catch (error) {
    if (error?.message?.includes('exact tool roster')) throw error;
    throw new Error('archived private server emitted an invalid roster', {
      cause: error,
    });
  }
}

const PRIVATE_ROSTER_PROGRAM = String.raw`
  const { buildMcpServer } = await import('./common.mjs');
  const { SEALED_PRIVATE_TOOLSET_PROFILE } = await import('./toolsets/index.mjs');
  const server = await buildMcpServer({
    profile: SEALED_PRIVATE_TOOLSET_PROFILE,
  });
  const tools = server?._registeredTools;
  const names = tools && typeof tools === 'object' ? Object.keys(tools) : [];
  process.stdout.write('\n${PRIVATE_ROSTER_MARKER}' + JSON.stringify(names) + '\n');
  try { await server.close(); } catch {}
  process.exit(0);
`;

async function requireTrustedOutputRoot(io, outputRoot, sourceRoot) {
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) {
    throw new Error('release output root must be one explicit absolute path');
  }
  const requested = resolve(outputRoot);
  const stat = await io.lstat(requested);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0
    || (stat.mode & 0o200) === 0
  ) {
    throw new Error('release output root is not a trusted owned directory');
  }
  const trusted = await io.realpath(requested);
  if (trusted !== requested || pathsOverlap(trusted, sourceRoot)) {
    throw new Error('release output root must be separate from the source checkout');
  }
  return trusted;
}

async function requireCanonicalCleanHead({
  io,
  runCommand,
  sourceRoot,
  revision,
  reviewedEnvironment,
}) {
  const env = reviewedEnvironment;
  const topLevel = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'rev-parse', '--show-toplevel',
    ], { env })
  ).trim();
  if (await io.realpath(topLevel) !== sourceRoot) {
    throw new Error('release source must be the repository top level');
  }

  const origin = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'remote', 'get-url', 'origin',
    ], { env })
  ).trim();
  if (origin !== CANONICAL_SOURCE_ORIGIN) {
    throw new Error('release source origin is not canonical Dexter-DAO/dexter-mcp');
  }

  const replacements = await runText(runCommand, 'git', [
    '--no-replace-objects', '-C', sourceRoot,
    'for-each-ref', '--format=%(refname)', 'refs/replace',
  ], { env });
  if (replacements.trim()) {
    throw new Error('release source contains forbidden Git replace refs');
  }

  const status = await runText(runCommand, 'git', [
    '--no-replace-objects', '-C', sourceRoot,
    'status', '--porcelain=v2', '-z', '--untracked-files=all',
  ], { env });
  if (status.length > 0) {
    throw new Error('release source checkout is not clean');
  }

  const trackedFlags = await runText(runCommand, 'git', [
    '--no-replace-objects', '-C', sourceRoot,
    'ls-files', '-v', '-z',
  ], { env });
  if (trackedFlags.split('\0').some((line) => /^[a-zS] /.test(line))) {
    throw new Error(
      'release source contains assume-unchanged or skip-worktree index state',
    );
  }

  const head = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'rev-parse', 'HEAD^{commit}',
    ], { env })
  ).trim();
  const commit = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'rev-parse', `${revision}^{commit}`,
    ], { env })
  ).trim();
  if (!SOURCE_COMMIT.test(head) || commit !== head) {
    throw new Error('release revision must resolve to the exact checked-out HEAD');
  }
  const tree = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'rev-parse', `${commit}^{tree}`,
    ], { env })
  ).trim();
  if (!SOURCE_COMMIT.test(tree)) {
    throw new Error('release source tree identity is invalid');
  }
  const committedAt = (
    await runText(runCommand, 'git', [
      '--no-replace-objects', '-C', sourceRoot,
      'show', '-s', '--format=%cI', commit,
    ], { env })
  ).trim();
  const committedAtDate = new Date(committedAt);
  if (Number.isNaN(committedAtDate.valueOf())) {
    throw new Error('release source commit timestamp is invalid');
  }
  const sourceCommittedAt = committedAtDate.toISOString();

  const remoteRefs = await reviewedGitRemoteRefs({
    remote: CANONICAL_SOURCE_ORIGIN,
    runCommand,
    environment: reviewedEnvironment,
  });
  const remoteContainsCommit = remoteRefs.split(/\r?\n/).some((line) => {
    const [remoteCommit, refname, extra] = line.split(/\s+/);
    return remoteCommit === commit && Boolean(refname) && extra === undefined;
  });
  if (!remoteContainsCommit) {
    throw new Error('canonical origin does not advertise the exact release commit');
  }

  return { commit, tree, sourceCommittedAt };
}

async function requireAbsent(io, path, label) {
  if (await exists(io, path)) throw new Error(`${label} already exists`);
}

async function readPackageIdentity(io, candidate) {
  const packagePath = join(candidate, 'package.json');
  const lockPath = join(candidate, 'package-lock.json');
  let packageJson;
  let packageLock;
  try {
    packageJson = JSON.parse(await io.readFile(packagePath, 'utf8'));
    packageLock = JSON.parse(await io.readFile(lockPath, 'utf8'));
  } catch (error) {
    throw new Error('archived source package identity is invalid', {
      cause: error,
    });
  }
  if (
    packageJson.packageManager !== `npm@${REQUIRED_NPM_VERSION}`
    || typeof packageJson.version !== 'string'
    || packageJson.version.length === 0
    || packageLock.lockfileVersion !== 3
    || !packageLock.packages?.['']
    || packageLock.packages[''].version !== packageJson.version
  ) {
    throw new Error(
      `archived source must use npm@${REQUIRED_NPM_VERSION} and one exact v3 lock`,
    );
  }
  return {
    packageVersion: packageJson.version,
    packageLockSha256: await sha256File(io, lockPath),
  };
}

async function requireCandidateEntrypoints(io, candidate) {
  const expected = new Set([
    ...Object.values(ENTRYPOINTS),
    ...Object.values(APPLICATION_ENTRYPOINTS),
    PRIVATE_ECOSYSTEM_ENTRYPOINT,
  ]);
  for (const entrypoint of expected) {
    const stat = await io.lstat(join(candidate, entrypoint));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`archived release entrypoint is invalid: ${entrypoint}`);
    }
  }
}

function safeManifestRelative(relativePath) {
  if (
    !relativePath
    || /[\0\t\r\n]/.test(relativePath)
    || isAbsolute(relativePath)
    || relativePath === '..'
    || relativePath.startsWith('../')
  ) {
    throw new Error('candidate contains an unsafe release manifest path');
  }
  return relativePath;
}

async function collectCandidateEntries(io, candidate, directory = candidate) {
  const entries = [];
  const visit = async (current) => {
    const names = await io.readdir(current);
    names.sort(stablePathSort);
    for (const name of names) {
      const absolute = join(current, name);
      const relativePath = safeManifestRelative(relative(candidate, absolute));
      const stat = await io.lstat(absolute);
      if (stat.uid !== process.getuid()) {
        throw new Error(`candidate entry is not owned by the release user: ${relativePath}`);
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        entries.push({ kind: 'D', absolute, relative: relativePath });
        await visit(absolute);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        if (stat.nlink !== 1) {
          throw new Error(`candidate file has multiple hard links: ${relativePath}`);
        }
        entries.push({
          kind: 'F',
          absolute,
          relative: relativePath,
          identity: await sha256File(io, absolute),
          executable: (stat.mode & 0o111) !== 0,
        });
      } else if (stat.isSymbolicLink()) {
        const identity = await io.readlink(absolute);
        if (!identity || /[\0\t\r\n]/.test(identity) || isAbsolute(identity)) {
          throw new Error(`candidate symlink target must be relative: ${relativePath}`);
        }
        const lexical = resolve(dirname(absolute), identity);
        if (!pathIsWithin(candidate, lexical)) {
          throw new Error(`candidate symlink escapes release: ${relativePath}`);
        }
        let resolvedTarget;
        try {
          resolvedTarget = await io.realpath(absolute);
        } catch (error) {
          throw new Error(`candidate symlink is dangling: ${relativePath}`, {
            cause: error,
          });
        }
        if (!pathIsWithin(candidate, resolvedTarget)) {
          throw new Error(`candidate symlink resolves outside release: ${relativePath}`);
        }
        entries.push({
          kind: 'L',
          absolute,
          relative: relativePath,
          identity,
          lexical,
          resolvedTarget,
        });
      } else {
        throw new Error(`candidate contains unsupported entry: ${relativePath}`);
      }
    }
  };
  await visit(directory);
  return entries;
}

function targetCovered(candidate, target, entries) {
  const targetRelative = relative(candidate, target);
  const manifested = entries.filter(({ kind }) => kind !== 'D');
  const exact = manifested.some((entry) => entry.relative === targetRelative);
  const prefix = targetRelative ? `${targetRelative}/` : '';
  return exact || manifested.some((entry) => entry.relative.startsWith(prefix));
}

async function buildFileManifest(io, candidate) {
  const entries = await collectCandidateEntries(io, candidate);
  for (const entry of entries.filter(({ kind }) => kind === 'L')) {
    if (
      !targetCovered(candidate, entry.lexical, entries)
      || !targetCovered(candidate, entry.resolvedTarget, entries)
    ) {
      throw new Error(`candidate symlink target is not manifested: ${entry.relative}`);
    }
  }
  const records = entries
    .filter(({ kind }) => kind !== 'D')
    .sort((left, right) => stablePathSort(left.relative, right.relative))
    .map(({ kind, identity, relative: relativePath }) => (
      `${kind}\t${identity}\t${relativePath}\n`
    ));
  return {
    entries,
    bytes: Buffer.from(records.join('')),
  };
}

async function sealCandidate(io, candidate, entries) {
  for (const entry of entries) {
    if (entry.kind === 'F') {
      // Installed runtimes may contain native executables or package bins.
      // Preserve owner execute only; remove every write/group/world bit.
      await io.chmod(entry.absolute, entry.executable ? 0o500 : 0o400);
    }
  }
  const directories = entries
    .filter(({ kind }) => kind === 'D')
    .sort((left, right) => right.relative.length - left.relative.length);
  for (const entry of directories) await io.chmod(entry.absolute, 0o500);
  // The kernel requires write permission on the moved directory itself in
  // this deployment environment. Keep only owner write+search during the one
  // rename, then remove write permission from the published root before this
  // function returns. Every child is already sealed above, and outputRoot is
  // an owner-only trusted directory.
  await io.chmod(candidate, 0o300);
}

async function makeTreeRemovable(io, root) {
  if (!await exists(io, root)) return;
  const stat = await io.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  await io.chmod(root, 0o700).catch(() => {});
  for (const name of await io.readdir(root)) {
    const child = join(root, name);
    const childStat = await io.lstat(child).catch(() => null);
    if (childStat?.isDirectory() && !childStat.isSymbolicLink()) {
      await makeTreeRemovable(io, child);
    }
  }
}

function serializeDescriptor(descriptor) {
  return Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
}

function serializeProvenance(provenance) {
  return Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`);
}

/**
 * Construct one immutable Dexter MCP release solely from an attested Git HEAD.
 * No mutable checkout file or pre-existing node_modules entry is copied into
 * the candidate. This function only constructs a sealed directory; it never
 * starts PM2, publishes a package, pushes Git, or contacts a money route.
 */
export async function buildOpenRelease({
  sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  outputRoot,
  revision = 'HEAD',
  privateProfile: forbiddenPrivateProfile,
  privateToolsets: forbiddenPrivateToolsets,
  runCommand = execFileAsync,
  fsOps = {},
  environment = process.env,
} = {}) {
  if (
    forbiddenPrivateProfile !== undefined
    || forbiddenPrivateToolsets !== undefined
  ) {
    throw new Error(
      'release private profile and toolsets are source-owned and cannot be overridden',
    );
  }
  const io = { ...defaultFs, ...fsOps };
  const source = await io.realpath(resolve(sourceRoot));
  const trustedOutputRoot = await requireTrustedOutputRoot(io, outputRoot, source);
  // Validate and replace the ambient process environment before the first
  // child process. Every Git/archive/build/materializer child below receives
  // only this reviewed source-owned environment (plus explicit build fields).
  const sourceEnvironment = reviewedReleaseToolEnvironment({
    env: environment,
  });
  const { commit, tree, sourceCommittedAt } =
    await requireCanonicalCleanHead({
      io,
      runCommand,
      sourceRoot: source,
      revision,
      reviewedEnvironment: sourceEnvironment,
    });
  const destination = join(trustedOutputRoot, commit);
  const manifestDestination = `${destination}.FILE-MANIFEST.tsv`;
  await requireAbsent(io, destination, 'release destination');
  await requireAbsent(io, manifestDestination, 'release manifest destination');

  const workspace = await io.mkdtemp(join(trustedOutputRoot, '.dexter-mcp-build-'));
  const archivePath = join(workspace, 'source.tar');
  const candidate = join(workspace, 'candidate');
  const temporaryManifest = join(workspace, 'FILE-MANIFEST.tsv');
  let installedManifest = false;
  let publishedCandidate = false;
  try {
    await io.mkdir(candidate, { mode: 0o700 });
    await createReviewedGitArchive({
      sourceRoot: source,
      commit,
      expectedTree: tree,
      outputPath: archivePath,
      workspace,
      runCommand,
      environment,
    });
    const sourceArchiveSha256 = await sha256File(io, archivePath);
    if (!SHA256.test(sourceArchiveSha256)) {
      throw new Error('release source archive digest is invalid');
    }
    await runText(runCommand, 'tar', [
      '-xf', archivePath,
      '-C', candidate,
      '--no-same-owner',
      '--no-same-permissions',
    ], { env: sourceEnvironment });

    const descriptorPath = join(candidate, 'release/open-tool-descriptors.json');
    if (!(await exists(io, descriptorPath))) {
      throw new Error(
        'committed OpenDexter descriptor is missing from source',
      );
    }
    const descriptorStat = await io.lstat(descriptorPath);
    if (!descriptorStat.isFile() || descriptorStat.isSymbolicLink()) {
      throw new Error('committed OpenDexter descriptor is not a regular file');
    }
    const committedDescriptorBytes = await io.readFile(descriptorPath);
    const packageIdentity = await readPackageIdentity(io, candidate);
    await requireCandidateEntrypoints(io, candidate);

    // npm treats NODE_ENV=production as an implicit --omit=dev. Build and
    // verification need the exact committed development graph; only the
    // descriptor/roster execution below is production-mode.
    const buildEnv = buildEnvironment({
      production: false,
      npmCache: join(workspace, 'npm-cache'),
      reviewedEnvironment: sourceEnvironment,
    });
    const materializerEnv = buildEnvironment({
      production: true,
      npmCache: join(workspace, 'npm-cache'),
      reviewedEnvironment: sourceEnvironment,
    });
    const reviewedNpm = reviewedNpmInvocation();
    const runNpm = (args, options) => {
      const invocation = reviewedNpmInvocation(args);
      return runText(
        runCommand,
        invocation.command,
        invocation.args,
        options,
      );
    };
    const installedNpm = (
      await runNpm(['--version'], {
        cwd: candidate,
        env: buildEnv,
      })
    ).trim();
    if (installedNpm !== REQUIRED_NPM_VERSION) {
      throw new Error(
        `release builder found npm ${installedNpm || '(empty)'}, `
        + `expected ${REQUIRED_NPM_VERSION}`,
      );
    }

    const npmOptions = {
      cwd: candidate,
      env: buildEnv,
      maxBuffer: 64 * 1024 * 1024,
    };
    await runOpenReleaseFinalization({ runNpm, options: npmOptions });
    if (
      await sha256File(io, join(candidate, 'package-lock.json'))
      !== packageIdentity.packageLockSha256
    ) {
      throw new Error('release build changed the exact committed package lock');
    }

    const materializerPath = join(
      candidate,
      'scripts/materialize-open-tool-descriptors.mjs',
    );
    const materializerStat = await io.lstat(materializerPath);
    if (!materializerStat.isFile() || materializerStat.isSymbolicLink()) {
      throw new Error('archived OpenDexter descriptor materializer is invalid');
    }
    const descriptorOutput = await runText(
      runCommand,
      reviewedNpm.nodeExecutable,
      [materializerPath, '--emit-json'],
      { cwd: candidate, env: materializerEnv },
    );
    const { descriptor, connected } = parseDescriptor(descriptorOutput);
    const descriptorBytes = serializeDescriptor(descriptor);
    const postBuildDescriptorBytes = await io.readFile(descriptorPath);
    if (!committedDescriptorBytes.equals(postBuildDescriptorBytes)) {
      throw new Error('release build changed the committed OpenDexter descriptor');
    }
    if (!committedDescriptorBytes.equals(descriptorBytes)) {
      throw new Error(
        'committed OpenDexter descriptor differs from the archived '
        + 'finalized tools',
      );
    }

    const privateOutput = await runText(
      runCommand,
      reviewedNpm.nodeExecutable,
      ['--input-type=module', '--eval', PRIVATE_ROSTER_PROGRAM],
      { cwd: candidate, env: materializerEnv },
    );
    const privateRoster = parsePrivateRoster(privateOutput);

    const sealedProvenance = {
      schema: RELEASE_PROVENANCE_SCHEMA,
      sourceCommit: commit,
      sourceTree: tree,
      sourceArchiveSha256,
      packageLockSha256: packageIdentity.packageLockSha256,
      descriptorSha256: sha256Bytes(descriptorBytes),
      packageVersion: packageIdentity.packageVersion,
      nodeVersion: process.version,
      npmVersion: REQUIRED_NPM_VERSION,
      sourceCommittedAt,
      entrypoints: { ...ENTRYPOINTS },
      rosters: {
        'dexter-mcp': privateRoster,
        'dexter-open-mcp': connected,
      },
    };
    await io.writeFile(
      join(candidate, '.release-provenance.json'),
      serializeProvenance(sealedProvenance),
      { flag: 'wx', mode: 0o600 },
    );
    const { entries, bytes: manifestBytes } =
      await buildFileManifest(io, candidate);
    const provenance = {
      ...sealedProvenance,
      artifactManifestSha256: sha256Bytes(manifestBytes),
    };
    await io.writeFile(temporaryManifest, manifestBytes, {
      flag: 'wx',
      mode: 0o400,
    });
    await sealCandidate(io, candidate, entries);

    // No-clobber the external manifest first. The sealed candidate then
    // appears in one atomic same-filesystem rename with its verifier input
    // already present beside it.
    await requireAbsent(io, destination, 'release destination');
    await requireAbsent(io, manifestDestination, 'release manifest destination');
    await io.link(temporaryManifest, manifestDestination);
    installedManifest = true;
    try {
      await io.rename(candidate, destination);
      publishedCandidate = true;
      await io.chmod(destination, 0o500);
      // Drop the staging hard link so the published manifest has exactly one
      // link, then make the candidate prove itself through its own archived
      // verifier before returning it to an activator.
      await io.unlink(temporaryManifest);
      const candidateRequire = createRequire(join(destination, 'package.json'));
      const candidateVerifier = candidateRequire(
        join(destination, 'lib/open-release-provenance.cjs'),
      );
      const verifiedRelease = candidateVerifier.readSealedOpenRelease(
        destination,
      );
      if (
        verifiedRelease.provenance.sourceCommit !== provenance.sourceCommit
        || verifiedRelease.provenance.sourceTree !== provenance.sourceTree
        || verifiedRelease.provenance.artifactManifestSha256
          !== provenance.artifactManifestSha256
      ) {
        throw new Error('published release self-verification identity mismatch');
      }
    } catch (error) {
      await io.unlink(manifestDestination).catch(() => {});
      installedManifest = false;
      throw error;
    }

    return Object.freeze({
      releaseDirectory: destination,
      manifestPath: manifestDestination,
      provenance: Object.freeze(provenance),
    });
  } catch (error) {
    if (publishedCandidate) {
      await makeTreeRemovable(io, destination).catch(() => {});
      await io.rm(destination, { recursive: true, force: true }).catch(() => {});
      publishedCandidate = false;
    }
    if (installedManifest) {
      await io.unlink(manifestDestination).catch(() => {});
      installedManifest = false;
    }
    throw error;
  } finally {
    await makeTreeRemovable(io, workspace).catch(() => {});
    await io.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function cliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name, inline] = argument.split('=', 2);
    const value = inline ?? argv[++index];
    if (!value || !name.startsWith('--')) {
      throw new Error(
        'usage: build-open-release.mjs --output-root <absolute-path> '
        + '[--revision HEAD]',
      );
    }
    if (name === '--output-root') options.outputRoot = value;
    else if (name === '--revision') options.revision = value;
    else throw new Error(`unknown release builder option: ${name}`);
  }
  return options;
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    const result = await buildOpenRelease(cliOptions(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      releaseDirectory: result.releaseDirectory,
      manifestPath: result.manifestPath,
      sourceCommit: result.provenance.sourceCommit,
      sourceTree: result.provenance.sourceTree,
      artifactManifestSha256: result.provenance.artifactManifestSha256,
      descriptorSha256: result.provenance.descriptorSha256,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
