#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReviewedGitArchive,
  REVIEWED_NPM_VERSION,
  reviewedGitRemoteRefs,
  reviewedNpmInvocation,
  reviewedReleaseToolEnvironment,
} from '../lib/open-release-tooling.mjs';

const execFileAsync = promisify(execFile);
const CANONICAL_SOURCE_ORIGIN =
  'https://github.com/Dexter-DAO/dexter-mcp.git';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OPEN_TOOL_DESCRIPTOR_PATH = resolve(
  repositoryRoot,
  'release/open-tool-descriptors.json',
);
export const OPENDEXTER_SOURCE_CONTRACTS_PATH = resolve(
  repositoryRoot,
  'release/opendexter-source-contracts.json',
);

const SOURCE_CONTRACTS_KIND = 'opendexter-source-contracts/v1';
const DESCRIPTOR_KIND = 'opendexter-hosted-tool-descriptors/v2';
const API_REPOSITORY = 'https://github.com/Dexter-DAO/dexter-api';
const MCP_REPOSITORY = 'https://github.com/Dexter-DAO/dexter-mcp';
const RECONCILE_FIXTURE_PATH =
  'tests/fixtures/governed-agent-reconcile-advanced-final-c3e32885.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function requirePath(path, label) {
  try {
    await access(path);
  } catch (error) {
    throw new Error(`${label} is absent from the archived source`, {
      cause: error,
    });
  }
}

function exactKeys(value, expected) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...expected].sort());
}

function exactSourceContractsShape(sourceContracts) {
  const api = sourceContracts?.api;
  const mcp = sourceContracts?.mcp;
  const fixture = api?.consumerFixture;
  return sourceContracts?.schemaVersion === 1
    && sourceContracts?.kind === SOURCE_CONTRACTS_KIND
    && exactKeys(sourceContracts, ['schemaVersion', 'kind', 'api', 'mcp'])
    && exactKeys(api, ['repository', 'commit', 'tree', 'consumerFixture'])
    && exactKeys(fixture, [
      'path', 'sha256', 'canonicalBodyDigest',
    ])
    && exactKeys(mcp, [
      'repository', 'commit', 'tree', 'toolContractPath', 'authContractPath',
    ])
    && api.repository === API_REPOSITORY
    && mcp.repository === MCP_REPOSITORY
    && fixture.path === RECONCILE_FIXTURE_PATH
    && mcp.toolContractPath === 'lib/open-tool-contracts.mjs'
    && mcp.authContractPath === 'lib/open-tool-auth.mjs'
    && /^[0-9a-f]{40}$/.test(api.commit)
    && /^[0-9a-f]{40}$/.test(api.tree)
    && /^[0-9a-f]{40}$/.test(mcp.commit)
    && /^[0-9a-f]{40}$/.test(mcp.tree)
    && /^[0-9a-f]{64}$/.test(fixture.sha256)
    && /^[0-9a-f]{64}$/.test(fixture.canonicalBodyDigest);
}

export async function readOpenDexterSourceContracts({
  sourceRoot = repositoryRoot,
} = {}) {
  const sourceContractsPath = resolve(
    sourceRoot,
    'release/opendexter-source-contracts.json',
  );
  const sourceContracts = await readJson(sourceContractsPath);
  if (!exactSourceContractsShape(sourceContracts)) {
    throw new Error('OpenDexter source-contract manifest is invalid');
  }

  const fixturePath = resolve(sourceRoot, RECONCILE_FIXTURE_PATH);
  const fixtureBytes = await readFile(fixturePath);
  const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
  let fixture;
  try {
    fixture = JSON.parse(fixtureBytes.toString('utf8'));
  } catch (error) {
    throw new Error('OpenDexter governed API consumer fixture is invalid', {
      cause: error,
    });
  }
  if (
    fixtureSha256 !== sourceContracts.api.consumerFixture.sha256
    || fixture?.sourceCommit !== sourceContracts.api.commit
    || fixture?.body?.digest
      !== sourceContracts.api.consumerFixture.canonicalBodyDigest
  ) {
    throw new Error(
      'OpenDexter governed API consumer fixture differs from its source pin',
    );
  }
  await Promise.all([
    requirePath(
      resolve(sourceRoot, sourceContracts.mcp.toolContractPath),
      'OpenDexter tool contract',
    ),
    requirePath(
      resolve(sourceRoot, sourceContracts.mcp.authContractPath),
      'OpenDexter auth contract',
    ),
  ]);
  return sourceContracts;
}

function exactNpmVersion(packageManager) {
  const match = String(packageManager).match(/^npm@(\d+\.\d+\.\d+)$/);
  if (!match) {
    throw new Error('archived source does not pin one exact npm version');
  }
  return match[1];
}

async function parseDescriptor(stdout) {
  const descriptor = JSON.parse(stdout);
  if (
    descriptor?.schemaVersion !== 2
    || descriptor?.kind !== DESCRIPTOR_KIND
    || descriptor?.sourceContracts?.kind !== SOURCE_CONTRACTS_KIND
    || descriptor?.oauth?.resource !== 'https://open.dexter.cash/mcp'
    || typeof descriptor?.oauth?.authorizationServer !== 'string'
    || typeof descriptor?.oauth?.authorizationServerMetadata !== 'string'
    || typeof descriptor?.oauth?.tokenIssuer !== 'string'
    || !Array.isArray(descriptor?.oauth?.protectedResourcePaths)
    || !Array.isArray(descriptor?.oauth?.scopesSupported)
    || !Array.isArray(descriptor?.oauth?.challengeRequiredParameters)
  ) {
    throw new Error('OpenDexter descriptor materializer returned invalid JSON');
  }
  return descriptor;
}

/**
 * Rebuild and execute the descriptor producer only from one committed Git
 * archive. The caller's working files and ignored node_modules are never read
 * as release evidence.
 */
export async function materializeOpenToolDescriptorsFromGit({
  sourceRoot = repositoryRoot,
  revision = 'HEAD',
  runCommand = execFileAsync,
  environment = process.env,
} = {}) {
  const cleanGitEnvironment = reviewedReleaseToolEnvironment({
    env: environment,
  });
  const [{ stdout: topLevelOutput }, { stdout: remoteOutput }] =
    await Promise.all([
      runCommand('git', [
        '--no-replace-objects',
        '-C', sourceRoot,
        'rev-parse', '--show-toplevel',
      ], { encoding: 'utf8', env: cleanGitEnvironment }),
      runCommand('git', [
        '--no-replace-objects',
        '-C', sourceRoot,
        'remote', 'get-url', 'origin',
      ], { encoding: 'utf8', env: cleanGitEnvironment }),
    ]);
  if (
    await realpath(topLevelOutput.trim()) !== await realpath(sourceRoot)
    || remoteOutput.trim() !== CANONICAL_SOURCE_ORIGIN
  ) {
    throw new Error('OpenDexter descriptor source repository is not canonical');
  }
  const { stdout: statusOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (statusOutput.length > 0) {
    throw new Error('OpenDexter descriptor source checkout is not clean');
  }
  const { stdout: trackedFlags } = await runCommand(
    'git',
    ['--no-replace-objects', '-C', sourceRoot, 'ls-files', '-v', '-z'],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  const hiddenPaths = trackedFlags.split('\0').filter((entry) =>
    /^[a-zS] /.test(entry));
  if (hiddenPaths.length > 0) {
    throw new Error(
      'OpenDexter descriptor source contains hidden index state '
      + '(assume-unchanged or skip-worktree)',
    );
  }
  const { stdout: replaceRefs } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'for-each-ref', '--format=%(refname)', 'refs/replace',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (replaceRefs.trim().length > 0) {
    throw new Error('OpenDexter descriptor source contains Git replace refs');
  }
  const { stdout: commitOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'rev-parse', `${revision}^{commit}`,
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  const commit = commitOutput.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('OpenDexter descriptor source commit is invalid');
  }
  const { stdout: headOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'rev-parse', 'HEAD^{commit}',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (headOutput.trim() !== commit) {
    throw new Error(
      'OpenDexter descriptor revision must be the clean checkout HEAD',
    );
  }
  let remoteRefs;
  try {
    remoteRefs = await reviewedGitRemoteRefs({
      remote: CANONICAL_SOURCE_ORIGIN,
      runCommand,
      environment,
    });
  } catch (error) {
    throw new Error('OpenDexter descriptor canonical origin is unreachable', {
      cause: error,
    });
  }
  const advertised = remoteRefs.split(/\r?\n/).some((line) => {
    const [remoteCommit, refname, extra] = line.trim().split(/\s+/);
    return remoteCommit === commit && Boolean(refname) && extra === undefined;
  });
  if (!advertised) {
    throw new Error(
      'OpenDexter descriptor canonical origin does not advertise HEAD',
    );
  }

  const disposableRoot = await mkdtemp(
    resolve(tmpdir(), 'opendexter-descriptor-source-'),
  );
  const archivePath = resolve(disposableRoot, 'source.tar');
  const archiveRoot = resolve(disposableRoot, 'source');
  try {
    await mkdir(archiveRoot, { recursive: true });
    const { stdout: treeOutput } = await runCommand('git', [
      '--no-replace-objects',
      '-C', sourceRoot,
      'rev-parse', `${commit}^{tree}`,
    ], { encoding: 'utf8', env: cleanGitEnvironment });
    await createReviewedGitArchive({
      sourceRoot,
      commit,
      expectedTree: treeOutput.trim(),
      outputPath: archivePath,
      workspace: disposableRoot,
      runCommand,
      environment,
    });
    await runCommand('tar', ['-xf', archivePath, '-C', archiveRoot], {
      encoding: 'utf8',
      env: cleanGitEnvironment,
    });

    const archivedPackage = await readJson(resolve(archiveRoot, 'package.json'));
    const npmVersion = exactNpmVersion(archivedPackage.packageManager);
    await requirePath(
      resolve(archiveRoot, 'package-lock.json'),
      'package-lock.json',
    );
    if (npmVersion !== REVIEWED_NPM_VERSION) {
      throw new Error(
        `archived source pins npm ${npmVersion}, expected ${REVIEWED_NPM_VERSION}`,
      );
    }
    const buildEnv = reviewedReleaseToolEnvironment({
      env: environment,
      npmCache: resolve(disposableRoot, 'npm-cache'),
    });
    const materializerEnv = reviewedReleaseToolEnvironment({
      env: environment,
      production: true,
      npmCache: resolve(disposableRoot, 'npm-cache'),
    });
    materializerEnv.SENTRY_DSN = '';
    materializerEnv.SENTRY_OPEN_MCP_DSN = '';
    const npmVersionCommand = reviewedNpmInvocation(['--version']);
    const { stdout: installedNpmOutput } = await runCommand(
      npmVersionCommand.command,
      npmVersionCommand.args,
      { encoding: 'utf8', env: buildEnv },
    );
    if (installedNpmOutput.trim() !== REVIEWED_NPM_VERSION) {
      throw new Error(
        `npm is ${installedNpmOutput.trim()}, expected ${REVIEWED_NPM_VERSION}`,
      );
    }

    // npm treats NODE_ENV=production as an implicit --omit=dev. The exact
    // archived development graph is required to run the reviewed workspace
    // build; only descriptor execution itself runs in production mode.
    const npmCi = reviewedNpmInvocation([
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);
    await runCommand(npmCi.command, npmCi.args, {
      cwd: archiveRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: buildEnv,
    });
    const npmBuild = reviewedNpmInvocation([
      'run', 'build:runtime-workspaces',
    ]);
    await runCommand(npmBuild.command, npmBuild.args, {
      cwd: archiveRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: buildEnv,
    });

    const archivedMaterializer = resolve(
      archiveRoot,
      'scripts/materialize-open-tool-descriptors.mjs',
    );
    await requirePath(archivedMaterializer, 'descriptor materializer');
    const { stdout } = await runCommand(
      npmVersionCommand.nodeExecutable,
      [archivedMaterializer, '--emit-json'],
      {
        cwd: archiveRoot,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        env: materializerEnv,
      },
    );
    return await parseDescriptor(stdout);
  } finally {
    await rm(disposableRoot, { recursive: true, force: true });
  }
}

/**
 * Return the exact release descriptor produced by the finalized hosted server
 * registrations. This is the fixed interface consumed by the OpenDexter IDE
 * package verifier; callers must not reconstruct or supplement its schemas.
 */
export async function materializeOpenToolDescriptors(options = {}) {
  return materializeOpenToolDescriptorsFromGit(options);
}

/**
 * Project the finalized registrations already loaded from this source tree.
 * This starts no listener or reaper and is suitable for ordinary schema tests;
 * release write/check still go through the strict committed-archive function.
 */
export async function materializeOpenToolDescriptorsFromRegistrations() {
  const [
    { buildHostedOpenToolDescriptor },
    { createOpenMcpServer },
    {
      OPEN_MCP_AUTHORIZATION_SERVER,
      OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
      OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS,
      OPEN_MCP_PRM,
      OPEN_MCP_PRM_URL,
      OPEN_MCP_PROTECTED_RESOURCE_PATHS,
      OPEN_MCP_TOKEN_ISSUER,
    },
    sourceContracts,
  ] = await Promise.all([
    import('../lib/open-tool-contracts.mjs'),
    import('../open-mcp-server.mjs'),
    import('../lib/open-tool-auth.mjs'),
    readOpenDexterSourceContracts(),
  ]);
  const server = createOpenMcpServer({ includeResources: false });
  const {
    schemaVersion: _schemaVersion,
    kind: _kind,
    ...hostedTools
  } = buildHostedOpenToolDescriptor(server);
  return {
    schemaVersion: 2,
    kind: DESCRIPTOR_KIND,
    sourceContracts,
    oauth: {
      mode: 'mixed',
      resource: OPEN_MCP_PRM.resource,
      protectedResourceMetadata: OPEN_MCP_PRM_URL,
      protectedResourcePaths: [...OPEN_MCP_PROTECTED_RESOURCE_PATHS],
      authorizationServer: OPEN_MCP_AUTHORIZATION_SERVER,
      authorizationServerMetadata: OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
      tokenIssuer: OPEN_MCP_TOKEN_ISSUER,
      scopesSupported: [...OPEN_MCP_PRM.scopes_supported],
      challengeRequiredParameters: [
        ...OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS,
      ],
    },
    ...hostedTools,
  };
}

export function serializeOpenToolDescriptors(descriptor) {
  return `${JSON.stringify(descriptor, null, 2)}\n`;
}

export async function verifyOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  let actual;
  try {
    actual = readFileSync(descriptorPath, 'utf8');
  } catch (error) {
    throw new Error(
      `OpenDexter tool descriptor is missing at ${descriptorPath}`,
      { cause: error },
    );
  }
  if (actual !== expected) {
    throw new Error(
      'OpenDexter tool descriptor differs from the finalized hosted tools; '
      + 'run npm run generate:open-tool-descriptors and review the exact diff',
    );
  }
  return descriptorPath;
}

export async function writeOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  mkdirSync(dirname(descriptorPath), { recursive: true });
  writeFileSync(descriptorPath, expected);
  return descriptorPath;
}

function cliMode(argv) {
  const modes = argv.filter((arg) => arg === '--check' || arg === '--write');
  if (modes.length > 1 || argv.some((arg) => !modes.includes(arg))) {
    throw new Error(
      'usage: node scripts/materialize-open-tool-descriptors.mjs [--check|--write]',
    );
  }
  return modes[0] ?? '--check';
}

async function emitDescriptorJson() {
  process.stdout.write(JSON.stringify(
    await materializeOpenToolDescriptorsFromRegistrations(),
  ));
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    if (process.argv[2] === '--emit-json' && process.argv.length === 3) {
      await emitDescriptorJson();
    } else {
      const mode = cliMode(process.argv.slice(2));
      const descriptorPath = mode === '--write'
        ? await writeOpenToolDescriptor()
        : await verifyOpenToolDescriptor();
      process.stdout.write(
        `${mode === '--write' ? 'Wrote' : 'Verified'} ${descriptorPath}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
