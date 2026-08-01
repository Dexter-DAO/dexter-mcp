import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  activateOpenRelease,
  capturePriorOpenReleasePair,
  preflightOpenReleaseCandidate,
  readLoopbackHealth,
  verifyPriorOpenReleaseRestartability,
  verifyRestoredOpenReleasePair,
  verifyRunningOpenReleasePair,
} from '../scripts/release/open-release-core.mjs';

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const MANIFEST = 'c'.repeat(64);
const DESCRIPTOR = 'd'.repeat(64);
const PRIVATE_ROSTER = ['private_fixture'];
const OPEN_ROSTER = ['x402_search', 'dexter_prepare_asset_action'];
const GOVERNED_SECRET = 'g'.repeat(32);
const PROTECTED_SERVICE_SECRET = 'protected-service-secret';
const PRODUCTION_PM2_HOME = '/home/branchmanager/.pm2';
const DEXTER_SERVICES = ['dexter-mcp', 'dexter-open-mcp'];
const FORBIDDEN_LOADER_KEYS = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function releaseCandidate(releaseDir = '/sealed/releases/new') {
  return {
    releaseDir,
    provenance: {
      sourceCommit: COMMIT,
      sourceTree: TREE,
      artifactManifestSha256: MANIFEST,
      descriptorSha256: DESCRIPTOR,
      packageVersion: '0.5.0',
      nodeVersion: process.version,
      entrypoints: {
        'dexter-mcp': 'production-bootstrap.mjs',
        'dexter-open-mcp': 'production-bootstrap.mjs',
      },
      rosters: {
        'dexter-mcp': PRIVATE_ROSTER,
        'dexter-open-mcp': OPEN_ROSTER,
      },
    },
  };
}

function identity(service, {
  commit = COMMIT,
  tree = TREE,
  manifest = MANIFEST,
  descriptor = DESCRIPTOR,
  version = '0.5.0',
} = {}) {
  return {
    service,
    commit,
    tree,
    artifactManifestSha256: manifest,
    descriptorSha256: descriptor,
    packageVersion: version,
  };
}

function pm2Row(name, cwd, pid, roster, port, {
  envFile = '/protected/dexter-mcp.env',
  envFileSha256 = 'e'.repeat(64),
  release = identity(name),
  profile = '',
  toolsets = '',
  pm2Home = PRODUCTION_PM2_HOME,
  singleArgument = false,
  processPolicy = {},
} = {}) {
  const script = resolve(cwd, 'production-bootstrap.mjs');
  return {
    name,
    pid,
    singleArgument,
    pm2_env: {
      name,
      namespace: 'default',
      cwd,
      status: 'online',
      restart_time: 0,
      exec_mode: processPolicy.execMode ?? 'fork_mode',
      instances: processPolicy.instances ?? 1,
      autorestart: processPolicy.autorestart ?? true,
      wait_ready: processPolicy.waitReady ?? true,
      max_restarts: processPolicy.maxRestarts ?? 10,
      listen_timeout: processPolicy.listenTimeout ?? 15_000,
      kill_timeout: processPolicy.killTimeout ?? 10_000,
      node_args: processPolicy.nodeArgs ?? [],
      args: processPolicy.scriptArgs ?? [],
      filter_env: processPolicy.filterEnvironment ?? [''],
      instance_var: processPolicy.instanceVariable ?? 'NODE_APP_INSTANCE',
      username: processPolicy.username ?? 'branchmanager',
      version: processPolicy.packageVersion ?? release.packageVersion,
      pm_cwd: cwd,
      pm_exec_path: script,
      exec_interpreter: process.execPath,
      env: {
        GOVERNED_AGENT_ACTIONS_HMAC_SECRET: GOVERNED_SECRET,
        SUPABASE_SERVICE_ROLE_KEY: PROTECTED_SERVICE_SECRET,
        TOKEN_AI_MCP_PORT: name === 'dexter-mcp' ? String(port) : '4930',
        OPEN_MCP_PORT: name === 'dexter-open-mcp' ? String(port) : '4931',
        TOKEN_AI_MCP_PROFILE: profile,
        TOKEN_AI_MCP_TOOLSETS: toolsets,
        PATH: [
          resolve(process.execPath, '..'),
          '/usr/local/sbin',
          '/usr/local/bin',
          '/usr/sbin',
          '/usr/bin',
          '/sbin',
          '/bin',
        ].join(':'),
        HOME: '/home/branchmanager',
        PM2_HOME: pm2Home,
        DEXTER_MCP_ENV_FILE: envFile,
        DEXTER_MCP_ENV_FILE_SHA256: envFileSha256,
        NODE_ENV: 'production',
        DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(roster),
        DEXTER_MCP_RELEASE_COMMIT: release.commit,
        DEXTER_MCP_RELEASE_TREE: release.tree,
        DEXTER_MCP_RELEASE_MANIFEST_SHA256:
          release.artifactManifestSha256,
        DEXTER_MCP_DESCRIPTOR_SHA256: release.descriptorSha256,
        DEXTER_MCP_RELEASE_PACKAGE_VERSION: release.packageVersion,
        DEXTER_MCP_RELEASE_SERVICE: release.service,
      },
    },
  };
}

function unrelatedPm2Row({
  pid = 909001,
  port = '4010',
} = {}) {
  return {
    name: 'other-service',
    pid,
    pm2_env: {
      status: 'online',
      restart_time: 4,
      exec_mode: 'fork_mode',
      instances: 1,
      autorestart: true,
      wait_ready: false,
      max_restarts: 20,
      listen_timeout: 3_000,
      kill_timeout: 1_600,
      node_args: [],
      args: [],
      pm_cwd: '/srv/other',
      pm_exec_path: '/srv/other/server.mjs',
      exec_interpreter: process.execPath,
      env: { OTHER_PORT: port, OTHER_SECRET: 'opaque' },
    },
  };
}

function liveOnlyPm2ModuleRow({
  name = 'pm2-logrotate',
  pid = 909101,
} = {}) {
  return {
    name,
    pid,
    pm2_env: {
      status: 'online',
      restart_time: 0,
      pmx_module: true,
      exec_mode: 'fork_mode',
      instances: 1,
      autorestart: true,
      wait_ready: false,
      max_restarts: 15,
      listen_timeout: 3_000,
      kill_timeout: 1_600,
      node_args: [],
      args: [],
      pm_cwd: '/srv/pm2-logrotate',
      pm_exec_path: '/srv/pm2-logrotate/app.js',
      exec_interpreter: process.execPath,
      env: { PM2_MODULE: 'true' },
    },
  };
}

function healthResponse(name, port, roster, release = identity(name)) {
  return {
    status: 200,
    json: async () => ({
      ok: true,
      service: name,
      port,
      tools: roster,
      release,
    }),
  };
}

function expectedProcess(row) {
  const env = row.pm2_env.env;
  const declaredEnvironment = { ...env };
  for (const key of [
    'unique_id',
    'NODE_APP_INSTANCE',
    row.name,
    'PM2_HOME',
  ]) {
    delete declaredEnvironment[key];
  }
  const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(
          (key) => [key, canonical(value[key])],
        ))
      : value;
  return {
    cwd: row.pm2_env.pm_cwd,
    script: row.pm2_env.pm_exec_path,
    interpreter: row.pm2_env.exec_interpreter,
    port: Number(
      env[row.name === 'dexter-mcp' ? 'TOKEN_AI_MCP_PORT' : 'OPEN_MCP_PORT'],
    ),
    profile: env.TOKEN_AI_MCP_PROFILE || null,
    toolsets: env.TOKEN_AI_MCP_TOOLSETS || null,
    envFile: env.DEXTER_MCP_ENV_FILE,
    envFileSha256: env.DEXTER_MCP_ENV_FILE_SHA256,
    pm2Home: env.PM2_HOME,
    nodeEnv: env.NODE_ENV,
    environmentSha256: sha256(JSON.stringify(canonical(declaredEnvironment))),
    processPolicy: {
      name: row.name,
      namespace: row.pm2_env.namespace,
      configuredCwd: row.pm2_env.cwd,
      execMode: row.pm2_env.exec_mode,
      instances: row.pm2_env.instances,
      autorestart: row.pm2_env.autorestart,
      waitReady: row.pm2_env.wait_ready,
      maxRestarts: row.pm2_env.max_restarts,
      listenTimeout: row.pm2_env.listen_timeout,
      killTimeout: row.pm2_env.kill_timeout,
      nodeArgs: row.pm2_env.node_args,
      scriptArgs: row.pm2_env.args,
      filterEnvironment: row.pm2_env.filter_env,
      instanceVariable: row.pm2_env.instance_var,
      username: row.pm2_env.username,
      packageVersion: row.pm2_env.version,
    },
    forbiddenLoaderEnvironment: {
      NODE_OPTIONS: env.NODE_OPTIONS ?? null,
      NODE_PATH: env.NODE_PATH ?? null,
      LD_PRELOAD: env.LD_PRELOAD ?? null,
      LD_LIBRARY_PATH: env.LD_LIBRARY_PATH ?? null,
      LD_AUDIT: env.LD_AUDIT ?? null,
    },
    roster: JSON.parse(env.DEXTER_MCP_EXPECTED_ROSTER_JSON),
    release: {
      commit: env.DEXTER_MCP_RELEASE_COMMIT,
      tree: env.DEXTER_MCP_RELEASE_TREE,
      artifactManifestSha256: env.DEXTER_MCP_RELEASE_MANIFEST_SHA256,
      descriptorSha256: env.DEXTER_MCP_DESCRIPTOR_SHA256,
      packageVersion: env.DEXTER_MCP_RELEASE_PACKAGE_VERSION,
      service: env.DEXTER_MCP_RELEASE_SERVICE,
    },
  };
}

function fakeProc(rows) {
  const byPid = new Map(rows.map((row) => [String(row.pid), row]));
  return {
    readlinkImpl: async (path) => {
      const [, , pid, field] = path.split('/');
      const row = byPid.get(pid);
      if (!row) throw new Error(`unknown fake pid ${pid}`);
      if (field === 'cwd') return row.pm2_env.pm_cwd;
      if (field === 'exe') return process.execPath;
      throw new Error(`unknown fake proc link ${path}`);
    },
    readFileImpl: async (path) => {
      const pid = path.split('/')[2];
      const row = byPid.get(pid);
      if (!row) throw new Error(`unknown fake pid ${pid}`);
      return row.singleArgument
        ? `node ${row.pm2_env.pm_exec_path}\0`
        : `${process.execPath}\0${row.pm2_env.pm_exec_path}\0`;
    },
    realpathImpl: async (path) => path,
  };
}

test('running proof binds PM2, kernel, nonsecret env, health, roster, and release', async () => {
  const release = releaseCandidate();
  const rows = [
    pm2Row('dexter-mcp', release.releaseDir, 901001, PRIVATE_ROSTER, 4930),
    pm2Row('dexter-open-mcp', release.releaseDir, 901002, OPEN_ROSTER, 4931, {
      singleArgument: true,
    }),
  ];
  const expectedProcesses = Object.fromEntries(rows.map((row) => [
    row.name,
    expectedProcess(row),
  ]));
  const result = await verifyRunningOpenReleasePair({
    release,
    rows,
    expectedProcesses,
    fetchImpl: async (url) => url.includes(':4930/')
      ? healthResponse('dexter-mcp', 4930, PRIVATE_ROSTER)
      : healthResponse('dexter-open-mcp', 4931, OPEN_ROSTER),
    ...fakeProc(rows),
  });
  assert.deepEqual(Object.keys(result.byName).sort(), [
    'dexter-mcp',
    'dexter-open-mcp',
  ]);

  rows[0].pm2_env.env.TOKEN_AI_MCP_PROFILE = 'stale';
  await assert.rejects(
    verifyRunningOpenReleasePair({
      release,
      rows,
      expectedProcesses,
      fetchImpl: async () => healthResponse(
        'dexter-mcp',
        4930,
        PRIVATE_ROSTER,
      ),
      ...fakeProc(rows),
    }),
    /PM2 environment identity/,
  );

  rows[0].pm2_env.env.TOKEN_AI_MCP_PROFILE = 'hosted';
  rows[0].pm2_env.env.DEXTER_MCP_ENV_FILE_SHA256 = 'f'.repeat(64);
  await assert.rejects(
    verifyRunningOpenReleasePair({
      release,
      rows,
      expectedProcesses,
      fetchImpl: async () => healthResponse(
        'dexter-mcp',
        4930,
        PRIVATE_ROSTER,
      ),
      ...fakeProc(rows),
    }),
    /PM2 environment identity/,
  );

  rows[0].pm2_env.env.DEXTER_MCP_ENV_FILE_SHA256 = 'e'.repeat(64);
  const hostilePolicies = [
    ['exec_mode', 'cluster_mode'],
    ['instances', 2],
    ['autorestart', false],
    ['wait_ready', false],
    ['max_restarts', 11],
    ['listen_timeout', 15_001],
    ['kill_timeout', 10_001],
    ['node_args', ['--no-warnings']],
  ];
  for (const [field, hostileValue] of hostilePolicies) {
    const originalValue = structuredClone(rows[0].pm2_env[field]);
    rows[0].pm2_env[field] = hostileValue;
    await assert.rejects(
      verifyRunningOpenReleasePair({
        release,
        rows,
        expectedProcesses,
        fetchImpl: async () => healthResponse(
          'dexter-mcp',
          4930,
          PRIVATE_ROSTER,
        ),
        ...fakeProc(rows),
      }),
      /PM2 environment identity/,
      `running proof must bind ${field}`,
    );
    rows[0].pm2_env[field] = originalValue;
  }

  for (const key of FORBIDDEN_LOADER_KEYS) {
    rows[0].pm2_env.env[key] = 'attacker';
    await assert.rejects(
      verifyRunningOpenReleasePair({
        release,
        rows,
        expectedProcesses,
        fetchImpl: async () => healthResponse(
          'dexter-mcp',
          4930,
          PRIVATE_ROSTER,
        ),
        ...fakeProc(rows),
      }),
      /PM2 environment identity/,
      `running proof must reject ${key}`,
    );
    delete rows[0].pm2_env.env[key];
  }
});

test('kernel command line requires an exact script, not a substring match', async () => {
  const release = releaseCandidate();
  const rows = [
    pm2Row('dexter-mcp', release.releaseDir, 901101, PRIVATE_ROSTER, 4930),
    pm2Row('dexter-open-mcp', release.releaseDir, 901102, OPEN_ROSTER, 4931),
  ];
  const proc = fakeProc(rows);
  await assert.rejects(
    verifyRunningOpenReleasePair({
      release,
      rows,
      expectedProcesses: Object.fromEntries(rows.map((row) => [
        row.name,
        expectedProcess(row),
      ])),
      fetchImpl: async (url) => url.includes(':4930/')
        ? healthResponse('dexter-mcp', 4930, PRIVATE_ROSTER)
        : healthResponse('dexter-open-mcp', 4931, OPEN_ROSTER),
      ...proc,
      readFileImpl: async (path) => {
        const pid = path.split('/')[2];
        const row = rows.find((candidate) => String(candidate.pid) === pid);
        return `${process.execPath}\0${row.pm2_env.pm_exec_path}.attacker\0`;
      },
    }),
    /kernel executable or command line mismatch/,
  );
});

test('health timeout is bounded even when an injected fetch ignores abort', async () => {
  const row = pm2Row('dexter-mcp', '/release', 901201, [], 4930);
  const started = Date.now();
  await assert.rejects(
    readLoopbackHealth(
      'dexter-mcp',
      row,
      async () => new Promise(() => {}),
      20,
    ),
    /health timed out/,
  );
  assert.ok(Date.now() - started < 500);
});

test('prior capture requires complete PM2 and health roster/release identity', async () => {
  const rows = [
    pm2Row('dexter-mcp', '/sealed/old', 901301, PRIVATE_ROSTER, 5930),
    pm2Row('dexter-open-mcp', '/sealed/old', 901302, OPEN_ROSTER, 5931),
  ];
  const healthFor = async (url, mutation = () => {}) => {
    const port = Number(new URL(url).port);
    const name = port === 5930 ? 'dexter-mcp' : 'dexter-open-mcp';
    const roster = name === 'dexter-mcp' ? PRIVATE_ROSTER : OPEN_ROSTER;
    const body = await healthResponse(name, port, roster).json();
    mutation(body);
    return { status: 200, json: async () => body };
  };

  for (const mutateRows of [
    (candidate) => {
      delete candidate[0].pm2_env.env.DEXTER_MCP_EXPECTED_ROSTER_JSON;
    },
    (candidate) => {
      delete candidate[0].pm2_env.env.DEXTER_MCP_RELEASE_TREE;
    },
  ]) {
    const candidate = structuredClone(rows);
    mutateRows(candidate);
    await assert.rejects(
      capturePriorOpenReleasePair(candidate, healthFor, {
        ...fakeProc(candidate),
        healthTimeoutMs: 20,
      }),
      /identity is not safe to restore/,
    );
  }

  for (const mutation of [
    (body) => {
      body.name = body.service;
      delete body.service;
    },
    (body) => { delete body.tools; },
    (body) => { delete body.release; },
  ]) {
    await assert.rejects(
      capturePriorOpenReleasePair(
        rows,
        (url) => healthFor(url, mutation),
        { ...fakeProc(rows), healthTimeoutMs: 20 },
      ),
      /health does not match PM2 identity/,
    );
  }
});

test('prior restart proof independently seals split releases and exact environment bytes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opendexter-prior-restart-'));
  const envFile = resolve(directory, 'prior.env');
  const envBytes = Buffer.from('EXACT_APP_VALUE=preserved\n');
  await writeFile(envFile, envBytes, { mode: 0o600 });
  await chmod(envFile, 0o600);
  const envFileSha256 = sha256(envBytes);
  const rows = [
    pm2Row(
      'dexter-mcp',
      '/sealed/releases/private-prior',
      901401,
      PRIVATE_ROSTER,
      5930,
      { envFile, envFileSha256 },
    ),
    pm2Row(
      'dexter-open-mcp',
      '/sealed/releases/open-prior',
      901402,
      OPEN_ROSTER,
      5931,
      { envFile, envFileSha256, singleArgument: true },
    ),
  ];
  for (const row of rows) {
    row.pm2_env.env.EXACT_APP_VALUE = 'preserved';
  }
  const fetchImpl = async (url) => {
    const port = Number(new URL(url).port);
    return port === 5930
      ? healthResponse('dexter-mcp', port, PRIVATE_ROSTER)
      : healthResponse('dexter-open-mcp', port, OPEN_ROSTER);
  };
  const prior = await capturePriorOpenReleasePair(rows, fetchImpl, {
    ...fakeProc(rows),
    healthTimeoutMs: 20,
  });
  const releaseDirectories = [];
  const readSealedReleaseImpl = (releaseDir) => {
    releaseDirectories.push(releaseDir);
    return releaseCandidate(releaseDir);
  };

  try {
    await assert.doesNotReject(verifyPriorOpenReleaseRestartability({
      prior,
      rows,
      readSealedReleaseImpl,
      realpathImpl: async (path) => path,
    }));
    assert.deepEqual(releaseDirectories, [
      '/sealed/releases/private-prior',
      '/sealed/releases/open-prior',
    ]);

    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl: (releaseDir) => {
          const candidate = releaseCandidate(releaseDir);
          candidate.provenance.sourceTree = '9'.repeat(40);
          return candidate;
        },
        realpathImpl: async (path) => path,
      }),
      /sealed release identity mismatch/,
    );

    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl: (releaseDir) => {
          const candidate = releaseCandidate(releaseDir);
          candidate.provenance.entrypoints['dexter-mcp'] = 'different.mjs';
          return candidate;
        },
        realpathImpl: async (path) => path,
      }),
      /script is not the sealed entrypoint/,
    );

    const wrongInterpreter = structuredClone(prior);
    wrongInterpreter['dexter-mcp'].kernel.executable = '/different/node';
    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior: wrongInterpreter,
        rows,
        readSealedReleaseImpl,
        realpathImpl: async (path) => path,
      }),
      /interpreter is not restartable exactly/,
    );

    const mismatchedRows = structuredClone(rows);
    mismatchedRows[0].pm2_env.env.EXACT_APP_VALUE = 'not-the-file-value';
    const mismatchedPrior = await capturePriorOpenReleasePair(
      mismatchedRows,
      fetchImpl,
      { ...fakeProc(mismatchedRows), healthTimeoutMs: 20 },
    );
    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior: mismatchedPrior,
        rows: mismatchedRows,
        readSealedReleaseImpl,
        realpathImpl: async (path) => path,
      }),
      /persisted environment does not match EXACT_APP_VALUE/,
    );

    await writeFile(envFile, 'EXACT_APP_VALUE=changed\n');
    await chmod(envFile, 0o600);
    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl,
        realpathImpl: async (path) => path,
      }),
      /environment-file digest mismatch/,
    );

    await writeFile(envFile, envBytes);
    await chmod(envFile, 0o644);
    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl,
        realpathImpl: async (path) => path,
      }),
      /environment file is not owned mode-0600 with one link/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function dumpRows(rows) {
  return rows.map((row) => ({
    name: row.name,
    namespace: row.pm2_env.namespace,
    cwd: row.pm2_env.cwd,
    pm_cwd: row.pm2_env.pm_cwd,
    pm_exec_path: row.pm2_env.pm_exec_path,
    exec_interpreter: row.pm2_env.exec_interpreter,
    exec_mode: row.pm2_env.exec_mode,
    instances: row.pm2_env.instances,
    autorestart: row.pm2_env.autorestart,
    wait_ready: row.pm2_env.wait_ready,
    max_restarts: row.pm2_env.max_restarts,
    listen_timeout: row.pm2_env.listen_timeout,
    kill_timeout: row.pm2_env.kill_timeout,
    node_args: structuredClone(row.pm2_env.node_args),
    args: structuredClone(row.pm2_env.args),
    filter_env: structuredClone(row.pm2_env.filter_env),
    instance_var: row.pm2_env.instance_var,
    username: row.pm2_env.username,
    version: row.pm2_env.version,
    env: structuredClone(row.pm2_env.env),
  }));
}

async function writeProtectedEnvironment(directory, lines = []) {
  const envFile = resolve(directory, 'production.env');
  await writeFile(envFile, [
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
    `SUPABASE_SERVICE_ROLE_KEY=${PROTECTED_SERVICE_SECRET}`,
    'TOKEN_AI_MCP_PORT=4930',
    'OPEN_MCP_PORT=4931',
    'TOKEN_AI_MCP_PROFILE=',
    'TOKEN_AI_MCP_TOOLSETS=',
    ...lines,
  ].join('\n'), { mode: 0o600 });
  await chmod(envFile, 0o600);
  return envFile;
}

async function activationHarness({
  rejectCandidate = false,
  hangCandidateHealth = false,
  tamperCandidateDump = false,
  tamperCandidateProtectedSecret = false,
  tamperPriorSavedSecret = false,
  tamperPriorSavedDefinition = null,
  tamperCandidatePolicy = false,
  tamperCandidateLoader = false,
  tamperCandidateAfterSave = false,
  tamperSavedUnrelated = false,
  swapEnvBeforeCandidateStart = false,
  swapEnvAfterCandidateSave = false,
  initialRows,
  initialSavedRows,
  includeUnrelated = false,
  includeLiveOnlyModule = false,
  failCandidateJlistOnce = false,
  failRollbackDelete = false,
  failPriorRestartability = false,
  failPriorSavedVerification = false,
  omitInitialSavedDump = false,
  freshInstall = false,
} = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), 'opendexter-activation-'));
  const pm2Home = resolve(directory, 'pm2');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(pm2Home));
  const envFile = await writeProtectedEnvironment(directory);
  const envFileSha256 = sha256(await readFile(envFile));
  const release = releaseCandidate('/sealed/releases/new');
  const oldIdentity = (name) => identity(name, {
    commit: '1'.repeat(40),
    tree: '2'.repeat(40),
    manifest: '3'.repeat(64),
    descriptor: '4'.repeat(64),
    version: '0.4.0',
  });
  const defaultPriorRows = [
    pm2Row('dexter-mcp', '/sealed/releases/old-private', 902001, ['old'], 5930, {
      envFile: '/protected/old.env',
      release: oldIdentity('dexter-mcp'),
      profile: 'legacy-private',
      toolsets: 'old-private',
    }),
    pm2Row('dexter-open-mcp', '/sealed/releases/old-open', 902002, ['old'], 5931, {
      envFile: '/protected/old.env',
      release: oldIdentity('dexter-open-mcp'),
      profile: 'legacy-open',
      toolsets: 'old-open',
      singleArgument: true,
    }),
  ];
  if (includeUnrelated) defaultPriorRows.push(unrelatedPm2Row());
  if (includeLiveOnlyModule) defaultPriorRows.push(liveOnlyPm2ModuleRow());
  const priorRows = initialRows ?? defaultPriorRows;
  const candidateRows = [
    pm2Row('dexter-mcp', release.releaseDir, 903001, PRIVATE_ROSTER, 4930, {
      envFile,
      envFileSha256,
      pm2Home: PRODUCTION_PM2_HOME,
    }),
    pm2Row('dexter-open-mcp', release.releaseDir, 903002, OPEN_ROSTER, 4931, {
      envFile,
      envFileSha256,
      pm2Home: PRODUCTION_PM2_HOME,
      singleArgument: true,
    }),
  ];
  let rows = structuredClone(priorRows);
  const events = [];
  const commandCalls = [];
  let candidateStarted = false;
  let candidateJlistFailed = false;
  let deleteCalls = 0;
  const initialSavedBytes = omitInitialSavedDump
    ? null
    : JSON.stringify(dumpRows(
      initialSavedRows
        ?? priorRows.filter((row) => row.pm2_env.pmx_module !== true),
    ));
  if (initialSavedBytes !== null) {
    await writeFile(resolve(pm2Home, 'dump.pm2'), initialSavedBytes);
  }
  const runCommand = async (command, args, options) => {
    assert.equal(command, 'pm2');
    commandCalls.push({ args: [...args], options });
    const operation = args[0];
    events.push(`${operation}${args[1] ? `:${args[1]}` : ''}`);
    if (operation === 'jlist') {
      if (
        failCandidateJlistOnce
        && candidateStarted
        && !candidateJlistFailed
      ) {
        candidateJlistFailed = true;
        throw new Error('candidate_jlist_unavailable');
      }
      return { stdout: JSON.stringify(rows) };
    }
    if (operation === 'save') {
      // PM2 modules appear in `jlist`, but PM2 intentionally omits them from
      // dump.pm2. The activation path must preserve live and saved baselines
      // independently instead of requiring those two universes to be equal.
      const dump = dumpRows(
        rows.filter((row) => row.pm2_env.pmx_module !== true),
      );
      if (
        (
          tamperCandidateDump
          || tamperCandidatePolicy
          || tamperCandidateLoader
          || tamperCandidateProtectedSecret
          || tamperSavedUnrelated
        )
        && dump.some((row) => row.pm_cwd === release.releaseDir)
      ) {
        if (tamperCandidateDump) {
          dump[0].env.TOKEN_AI_MCP_PROFILE = 'tampered-after-save';
        }
        if (tamperCandidatePolicy) {
          const [field, value] = tamperCandidatePolicy;
          dump[0][field] = value;
        }
        if (tamperCandidateLoader) {
          dump[0].env[tamperCandidateLoader] = 'attacker';
        }
        if (tamperCandidateProtectedSecret) {
          dump[0].env.GOVERNED_AGENT_ACTIONS_HMAC_SECRET =
            'SENTINEL_TAMPERED_GOVERNED_SECRET';
          dump[0].env.SUPABASE_SERVICE_ROLE_KEY =
            'SENTINEL_TAMPERED_SUPABASE_SECRET';
        }
        if (tamperSavedUnrelated) {
          const unrelated = dump.find((row) => row.name === 'other-service');
          if (unrelated) unrelated.env.OTHER_PORT = '4999';
        }
      }
      if (
        (tamperPriorSavedSecret || tamperPriorSavedDefinition)
        && !dump.some((row) => row.pm_cwd === release.releaseDir)
      ) {
        if (tamperPriorSavedSecret) {
          dump[0].env.GOVERNED_AGENT_ACTIONS_HMAC_SECRET =
            'SENTINEL_TAMPERED_PRIOR_SECRET';
        }
        if (tamperPriorSavedDefinition) {
          const [field, value] = tamperPriorSavedDefinition;
          dump[0][field] = value;
        }
      }
      await writeFile(resolve(pm2Home, 'dump.pm2'), JSON.stringify(dump));
      if (
        tamperCandidateAfterSave
        && dump.some((row) => row.pm_cwd === release.releaseDir)
      ) {
        rows.find((row) => row.name === 'dexter-mcp')
          .pm2_env.env.TOKEN_AI_MCP_PROFILE = 'tampered-live-after-save';
      }
      if (
        swapEnvAfterCandidateSave
        && dump.some((row) => row.pm_cwd === release.releaseDir)
      ) {
        await writeFile(envFile, [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
          'SUPABASE_SERVICE_ROLE_KEY=SENTINEL_SWAPPED_AFTER_CANDIDATE_SAVE',
          'TOKEN_AI_MCP_PORT=4930',
          'OPEN_MCP_PORT=4931',
          'TOKEN_AI_MCP_PROFILE=',
          'TOKEN_AI_MCP_TOOLSETS=',
        ].join('\n'));
        await chmod(envFile, 0o600);
      }
      return { stdout: 'saved' };
    }
    if (operation === 'delete') {
      deleteCalls += 1;
      if (failRollbackDelete && deleteCalls > DEXTER_SERVICES.length) {
        throw new Error('rollback_delete_failed');
      }
      rows = rows.filter((row) => row.name !== args[1]);
      return { stdout: 'deleted' };
    }
    if (operation === 'start') {
      if (swapEnvBeforeCandidateStart) {
        await writeFile(envFile, [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
          `SUPABASE_SERVICE_ROLE_KEY=${PROTECTED_SERVICE_SECRET}`,
          'TOKEN_AI_MCP_PORT=4930',
          'OPEN_MCP_PORT=4931',
          'TOKEN_AI_MCP_PROFILE=',
          'TOKEN_AI_MCP_TOOLSETS=',
          'SWAPPED_AFTER_ACTIVATION_PREFLIGHT=true',
        ].join('\n'));
        await chmod(envFile, 0o600);
        const swappedDigest = sha256(await readFile(envFile));
        for (const row of candidateRows) {
          row.pm2_env.env.DEXTER_MCP_ENV_FILE_SHA256 = swappedDigest;
        }
      }
      const unrelated = rows.filter(
        (row) => !DEXTER_SERVICES.includes(row.name),
      );
      rows = [...structuredClone(candidateRows), ...structuredClone(unrelated)];
      candidateStarted = true;
      return { stdout: 'started' };
    }
    if (operation === 'resurrect') {
      const unrelated = rows.filter(
        (row) => !DEXTER_SERVICES.includes(row.name),
      );
      const priorServices = priorRows.filter(
        (row) => DEXTER_SERVICES.includes(row.name),
      );
      rows = structuredClone(priorServices).map((row, index) => ({
        ...row,
        pid: 904001 + index,
      })).concat(structuredClone(unrelated));
      return { stdout: 'resurrected' };
    }
    throw new Error(`unexpected PM2 operation: ${args.join(' ')}`);
  };
  const fetchImpl = async (url) => {
    const port = Number(new URL(url).port);
    if (port === 5930) {
      return healthResponse('dexter-mcp', port, ['old'], oldIdentity('dexter-mcp'));
    }
    if (port === 5931) {
      return healthResponse(
        'dexter-open-mcp',
        port,
        ['old'],
        oldIdentity('dexter-open-mcp'),
      );
    }
    if (hangCandidateHealth) return new Promise(() => {});
    return port === 4930
      ? healthResponse('dexter-mcp', port, PRIVATE_ROSTER)
      : healthResponse('dexter-open-mcp', port, OPEN_ROSTER);
  };
  const capturePrior = (current, fetcher, options) => {
    if (current.length === 0) return {};
    return capturePriorOpenReleasePair(current, fetcher, {
      ...options,
      ...fakeProc(current),
    });
  };
  const verifyRestored = (args) => {
    events.push('verified-rollback');
    return verifyRestoredOpenReleasePair({
      ...args,
      ...fakeProc(args.rows),
    });
  };
  const verifyPair = async (args) => {
    events.push('verified-candidate');
    if (rejectCandidate) throw new Error('hostile_candidate');
    return verifyRunningOpenReleasePair({
      ...args,
      ...fakeProc(args.rows),
    });
  };
  try {
    const result = await activateOpenRelease({
      releaseCandidate: release,
      runCommand,
      fetchImpl,
      pm2Home,
      commandEnvironment: {
        PATH: process.env.PATH,
        DEXTER_MCP_ENV_FILE: envFile,
      },
      freshInstall,
      healthTimeoutMs: 20,
      pm2CommandTimeoutMs: 20,
      preflightCandidate: (args) => preflightOpenReleaseCandidate({
        ...args,
        pm2Home: PRODUCTION_PM2_HOME,
      }),
      capturePrior,
      verifyPriorRestartability: async () => {
        events.push('verified-prior-restart');
        if (failPriorRestartability) {
          throw new Error('hostile_prior_restartability');
        }
        return true;
      },
      verifyRestored,
      verifyPair,
      verifySaved: async (args) => {
        events.push(`verified-saved:${args.phase}`);
        if (failPriorSavedVerification && args.phase === 'prior') {
          throw new Error('hostile_prior_saved_verification');
        }
        const { verifySavedPair } = await import(
          '../scripts/release/open-release-core.mjs'
        );
        return verifySavedPair(args);
      },
    });
    const savedBytes = await readFile(resolve(pm2Home, 'dump.pm2'), 'utf8')
      .catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    const savedRows = savedBytes === null ? [] : JSON.parse(savedBytes);
    return {
      result,
      rows,
      savedRows,
      savedBytes,
      initialSavedBytes,
      events,
      priorRows,
      commandCalls,
    };
  } catch (error) {
    const savedBytes = await readFile(resolve(pm2Home, 'dump.pm2'), 'utf8')
      .catch((readError) => readError?.code === 'ENOENT'
        ? null
        : Promise.reject(readError));
    const savedRows = savedBytes === null ? [] : JSON.parse(savedBytes);
    return {
      error,
      rows,
      savedRows,
      savedBytes,
      initialSavedBytes,
      events,
      priorRows,
      commandCalls,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('activation proves prior dump, replaces split paths, proves candidate, then saves', async () => {
  const { error, rows, events } = await activationHarness();
  assert.equal(error, undefined);
  assert.deepEqual(rows.map((row) => row.pm2_env.pm_cwd), [
    '/sealed/releases/new',
    '/sealed/releases/new',
  ]);
  assert.ok(events.indexOf('verified-prior-restart') < events.indexOf('save:--force'));
  assert.ok(events.indexOf('verified-saved:prior') < events.indexOf('delete:dexter-mcp'));
  assert.equal(events.filter((event) => event === 'verified-candidate').length, 2);
  assert.ok(events.indexOf('verified-candidate') < events.lastIndexOf('save:--force'));
  assert.ok(events.indexOf('verified-saved:candidate') > events.lastIndexOf('save:--force'));
  assert.ok(events.lastIndexOf('verified-candidate') > events.indexOf('verified-saved:candidate'));
  assert.equal(events.some(
    (event) => /^(?:reload|restart|startOrReload)(?::|$)/.test(event),
  ), false);
});

test('an unprovable prior causes zero PM2 save, delete, or start calls', async () => {
  const result = await activationHarness({ failPriorRestartability: true });
  assert.match(result.error?.message ?? '', /hostile_prior_restartability/);
  assert.deepEqual(
    result.commandCalls.map(({ args }) => args[0]),
    ['jlist'],
  );
  assert.equal(result.savedBytes, result.initialSavedBytes);
});

test('activation preserves unrelated live and saved definitions and bounds every PM2 operation', async () => {
  const successful = await activationHarness({ includeUnrelated: true });
  assert.equal(successful.error, undefined);
  assert.equal(
    successful.rows.find((row) => row.name === 'other-service')
      .pm2_env.env.OTHER_PORT,
    '4010',
  );
  assert.equal(
    successful.savedRows.find((row) => row.name === 'other-service')
      .env.OTHER_PORT,
    '4010',
  );

  const rolledBack = await activationHarness({ rejectCandidate: true });
  const calls = [...successful.commandCalls, ...rolledBack.commandCalls];
  assert.deepEqual(
    [...new Set(calls.map((call) => call.args[0]))].sort(),
    ['delete', 'jlist', 'resurrect', 'save', 'start'],
  );
  for (const { options } of calls) {
    assert.equal(options.timeout, 20);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.signal instanceof AbortSignal, true);
  }
});

test('distinct unrelated saved and live definitions are each preserved', async () => {
  for (const rejectCandidate of [false, true]) {
    const result = await activationHarness({
      includeUnrelated: true,
      initialSavedRows: [unrelatedPm2Row({ port: '4999' })],
      rejectCandidate,
    });
    if (rejectCandidate) {
      assert.match(
        result.error?.message ?? '',
        /candidate failed; the exact prior state was restored/,
      );
    } else {
      assert.equal(result.error, undefined);
    }
    assert.equal(
      result.rows.find((row) => row.name === 'other-service')
        .pm2_env.env.OTHER_PORT,
      '4010',
    );
    assert.equal(
      result.savedRows.find((row) => row.name === 'other-service')
        .env.OTHER_PORT,
      '4999',
    );
  }
});

test('live-only PM2 modules remain live without being invented in the saved dump', async () => {
  for (const rejectCandidate of [false, true]) {
    const result = await activationHarness({
      includeUnrelated: true,
      includeLiveOnlyModule: true,
      rejectCandidate,
    });
    if (rejectCandidate) {
      assert.match(
        result.error?.message ?? '',
        /candidate failed; the exact prior state was restored/,
      );
    } else {
      assert.equal(result.error, undefined);
    }
    assert.equal(
      result.rows.some((row) => row.name === 'pm2-logrotate'),
      true,
    );
    assert.equal(
      result.savedRows.some((row) => row.name === 'pm2-logrotate'),
      false,
    );
  }
});

test('a failed prior saved proof restores exact original dump bytes or absence', async () => {
  for (const omitInitialSavedDump of [false, true]) {
    const result = await activationHarness({
      includeUnrelated: !omitInitialSavedDump,
      failPriorSavedVerification: true,
      omitInitialSavedDump,
    });
    assert.match(
      result.error?.message ?? '',
      /could not prove prior PM2 state; the original saved state was restored/,
    );
    assert.equal(result.savedBytes, result.initialSavedBytes);
    assert.equal(
      result.events.some((event) => event.startsWith('delete:')),
      false,
    );
    assert.equal(result.events.includes('start'), false);
  }
});

test('the post-save live proof catches candidate drift and restores the prior pair', async () => {
  const result = await activationHarness({ tamperCandidateAfterSave: true });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.equal(
    result.events.filter((event) => event === 'verified-candidate').length,
    2,
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
});

test('generated saved unrelated drift is discarded in favor of the sealed saved baseline', async () => {
  const result = await activationHarness({
    includeUnrelated: true,
    tamperSavedUnrelated: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(
    result.savedRows.find((row) => row.name === 'other-service')
      .env.OTHER_PORT,
    '4010',
  );
  assert.equal(result.events.includes('verified-rollback'), false);
});

test('rollback is attempted when candidate jlist and target deletes fail', async () => {
  const result = await activationHarness({
    failCandidateJlistOnce: true,
    failRollbackDelete: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.ok(result.events.includes('resurrect'));
  assert.ok(
    result.events.filter((event) => event === 'delete:dexter-mcp').length >= 2,
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
});

test('a candidate mismatch restores and proves running and saved exact prior pair', async () => {
  const { error, rows, events, priorRows } = await activationHarness({
    rejectCandidate: true,
  });
  assert.match(error?.message ?? '', /candidate failed; the exact prior state was restored/);
  assert.deepEqual(
    rows.map((row) => [
      row.name,
      row.pm2_env.pm_cwd,
      row.pm2_env.env.TOKEN_AI_MCP_PROFILE,
      row.pm2_env.env.DEXTER_MCP_RELEASE_COMMIT,
    ]),
    priorRows.map((row) => [
      row.name,
      row.pm2_env.pm_cwd,
      row.pm2_env.env.TOKEN_AI_MCP_PROFILE,
      row.pm2_env.env.DEXTER_MCP_RELEASE_COMMIT,
    ]),
  );
  assert.ok(events.includes('resurrect'));
  assert.equal(events.at(-1), 'verified-rollback');
});

test('a candidate health call that never settles times out and restores the prior pair', async () => {
  const started = Date.now();
  const { error, rows, events, priorRows } = await activationHarness({
    hangCandidateHealth: true,
  });
  assert.match(error?.message ?? '', /candidate failed; the exact prior state was restored/);
  assert.ok(Date.now() - started < 1_000);
  assert.deepEqual(
    rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(events.at(-1), 'verified-rollback');
});

test('a saved candidate dump mismatch is detected and rolled back', async () => {
  const { error, rows, events, priorRows } = await activationHarness({
    tamperCandidateDump: true,
  });
  assert.match(
    error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.deepEqual(
    rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(events.at(-1), 'verified-rollback');
});

test('saved candidate proof binds every protected environment value without leaking it', async () => {
  const result = await activationHarness({
    tamperCandidateProtectedSecret: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.deepEqual(
    result.rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    result.priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.doesNotMatch(
    `${result.error?.message ?? ''}\n${result.error?.stack ?? ''}`,
    /SENTINEL_TAMPERED_(?:GOVERNED|SUPABASE)_SECRET/,
  );
});

test('prior saved proof binds every protected environment value before deletion', async () => {
  const result = await activationHarness({
    tamperPriorSavedSecret: true,
  });
  assert.match(
    result.error?.message ?? '',
    /could not prove prior PM2 state; the original saved state was restored/,
  );
  assert.deepEqual(
    result.commandCalls.map(({ args }) => args[0]),
    ['jlist', 'save'],
  );
  assert.equal(result.savedBytes, result.initialSavedBytes);
  assert.deepEqual(result.rows, result.priorRows);
  assert.doesNotMatch(
    `${result.error?.message ?? ''}\n${result.error?.stack ?? ''}`,
    /SENTINEL_TAMPERED_PRIOR_SECRET/,
  );
});

test('prior saved proof rejects altered durable PM2 restart controls before deletion', async () => {
  for (const tamperPriorSavedDefinition of [
    ['filter_env', ['HOSTILE_SECRET_FILTER']],
    ['namespace', 'hostile-namespace'],
    ['instance_var', 'HOSTILE_INSTANCE'],
    ['interpreter_args', ['--import', '/tmp/hostile.mjs']],
    ['cron_restart', '* * * * *'],
    ['watch', true],
    ['restart_delay', 9_999],
  ]) {
    const result = await activationHarness({ tamperPriorSavedDefinition });
    assert.match(
      result.error?.message ?? '',
      /could not prove prior PM2 state; the original saved state was restored/,
    );
    assert.deepEqual(
      result.commandCalls.map(({ args }) => args[0]),
      ['jlist', 'save'],
    );
    assert.equal(result.savedBytes, result.initialSavedBytes);
    assert.deepEqual(result.rows, result.priorRows);
  }
});

test('saved candidate restart controls or loader injection are detected and rolled back', async () => {
  const cases = [
    ...[
      ['namespace', 'hostile-namespace'],
      ['cwd', '/tmp/hostile-cwd'],
      ['exec_mode', 'cluster_mode'],
      ['instances', 2],
      ['autorestart', false],
      ['wait_ready', false],
      ['max_restarts', 11],
      ['listen_timeout', 15_001],
      ['kill_timeout', 10_001],
      ['node_args', ['--no-warnings']],
      ['filter_env', ['HOSTILE_SECRET_FILTER']],
      ['instance_var', 'HOSTILE_INSTANCE'],
      ['username', 'root'],
      ['interpreter_args', ['--import', '/tmp/hostile.mjs']],
      ['cron_restart', '* * * * *'],
      ['watch', true],
      ['restart_delay', 9_999],
      ['uid', 0],
      ['gid', 0],
      ['out_file', '/tmp/hostile-out.log'],
    ].map((value) => ({ tamperCandidatePolicy: value })),
    ...FORBIDDEN_LOADER_KEYS.map((key) => ({ tamperCandidateLoader: key })),
  ];
  for (const fixture of cases) {
    const result = await activationHarness(fixture);
    assert.match(
      result.error?.message ?? '',
      /candidate failed; the exact prior state was restored/,
    );
    assert.deepEqual(
      result.rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
      result.priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    );
    assert.equal(result.events.at(-1), 'verified-rollback');
  }
});

test('an environment byte swap between activation preflight and PM2 start is detected and rolled back', async () => {
  const { error, rows, events, priorRows } = await activationHarness({
    swapEnvBeforeCandidateStart: true,
  });
  assert.match(
    error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.deepEqual(
    rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(events.at(-1), 'verified-rollback');
});

test('protected environment drift after candidate save is detected and rolled back', async () => {
  const result = await activationHarness({
    swapEnvAfterCandidateSave: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.deepEqual(
    result.rows.map((row) => [row.name, row.pm2_env.pm_cwd]),
    result.priorRows.map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.doesNotMatch(
    `${result.error?.message ?? ''}\n${result.error?.stack ?? ''}`,
    /SENTINEL_SWAPPED_AFTER_CANDIDATE_SAVE/,
  );
});

test('partial or absent prior topology is refused before save/delete unless fresh is explicit', async () => {
  const partial = [pm2Row(
    'dexter-mcp',
    '/sealed/releases/old',
    905001,
    ['old'],
    5930,
  )];
  const partialResult = await activationHarness({ initialRows: partial });
  assert.match(partialResult.error?.message ?? '', /exactly one dexter-open-mcp/);
  assert.deepEqual(partialResult.events, ['jlist']);

  const absentResult = await activationHarness({ initialRows: [] });
  assert.match(absentResult.error?.message ?? '', /explicit freshInstall/);
  assert.deepEqual(absentResult.events, ['jlist']);

  const freshResult = await activationHarness({
    initialRows: [],
    freshInstall: true,
  });
  assert.equal(freshResult.error, undefined);
  assert.deepEqual(freshResult.rows.map((row) => row.name), [
    'dexter-mcp',
    'dexter-open-mcp',
  ]);

  const staleSavedTarget = await activationHarness({
    initialRows: [],
    initialSavedRows: [pm2Row(
      'dexter-mcp',
      '/sealed/releases/stale-saved',
      0,
      ['stale'],
      5930,
    )],
    freshInstall: true,
  });
  assert.match(
    staleSavedTarget.error?.message ?? '',
    /freshInstall requires no saved Dexter MCP process definitions/,
  );
  assert.deepEqual(staleSavedTarget.events, ['jlist']);
  assert.equal(
    staleSavedTarget.savedBytes,
    staleSavedTarget.initialSavedBytes,
  );
});

test('failed fresh activation restores the exact original saved bytes or absence', async () => {
  for (const omitInitialSavedDump of [false, true]) {
    const result = await activationHarness({
      initialRows: [],
      freshInstall: true,
      rejectCandidate: true,
      omitInitialSavedDump,
    });
    assert.match(
      result.error?.message ?? '',
      /candidate failed; the exact prior state was restored/,
    );
    assert.equal(result.savedBytes, result.initialSavedBytes);
    assert.deepEqual(result.rows, []);
    assert.ok(result.events.includes('verified-saved:rollback'));
  }
});

test('missing, weak, legacy-only, or unprotected governed env fails with zero PM2 calls', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opendexter-preflight-'));
  const release = releaseCandidate('/sealed/releases/new');
  try {
    const cases = [
      { name: 'missing', body: '' },
      { name: 'weak', body: 'GOVERNED_AGENT_ACTIONS_HMAC_SECRET=short' },
      {
        name: 'legacy-only',
        body: `INTERNAL_DEXTERCARD_HMAC_SECRET=${'l'.repeat(64)}`,
      },
      ...[
        ['TOKEN_AI_MCP_PROFILE', 'hosted'],
        ['TOKEN_AI_MCP_PROFILE', '" "'],
        ['TOKEN_AI_MCP_TOOLSETS', 'open'],
        ['TOKEN_AI_MCP_TOOLSETS', '" "'],
      ].map(([key, value], index) => ({
        name: `private-selection-${key}-${index}`,
        body: [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
          `${key}=${value}`,
        ].join('\n'),
        error: new RegExp(`${key} must be empty`),
      })),
      {
        name: 'protected-pm2-home',
        body: [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
          'PM2_HOME=/tmp/hostile',
        ].join('\n'),
        error: /PM2_HOME is forbidden/,
      },
      ...FORBIDDEN_LOADER_KEYS.map((key) => ({
        name: `forbidden-loader-${key}`,
        body: [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
          `${key}=attacker`,
        ].join('\n'),
        error: new RegExp(`${key} is forbidden`),
      })),
    ];
    for (const fixture of cases) {
      const envFile = resolve(directory, `${fixture.name}.env`);
      await writeFile(envFile, fixture.body, { mode: 0o600 });
      const events = [];
      await assert.rejects(
        activateOpenRelease({
          releaseCandidate: release,
          commandEnvironment: { DEXTER_MCP_ENV_FILE: envFile },
          runCommand: async (...args) => {
            events.push(args);
            return { stdout: '[]' };
          },
        }),
        fixture.error ?? /GOVERNED_AGENT_ACTIONS_HMAC_SECRET/,
      );
      assert.deepEqual(events, []);
    }

    const mismatchedRuntime = releaseCandidate('/sealed/releases/new');
    mismatchedRuntime.provenance.nodeVersion = 'v0.0.0-hostile';
    const runtimeEnv = await writeProtectedEnvironment(directory);
    const runtimeEvents = [];
    await assert.rejects(
      activateOpenRelease({
        releaseCandidate: mismatchedRuntime,
        commandEnvironment: { DEXTER_MCP_ENV_FILE: runtimeEnv },
        runCommand: async (...args) => {
          runtimeEvents.push(args);
          return { stdout: '[]' };
        },
      }),
      /Node runtime does not match/,
    );
    assert.deepEqual(runtimeEvents, []);

    for (const fixture of [
      {
        name: 'noncanonical-storage-home',
        pm2Home: resolve(directory, 'hostile-pm2-home'),
        commandEnvironment: { DEXTER_MCP_ENV_FILE: runtimeEnv },
      },
      {
        name: 'conflicting-command-home',
        commandEnvironment: {
          DEXTER_MCP_ENV_FILE: runtimeEnv,
          PM2_HOME: resolve(directory, 'hostile-command-pm2-home'),
        },
      },
    ]) {
      const pm2Events = [];
      await assert.rejects(
        activateOpenRelease({
          releaseCandidate: release,
          pm2Home: fixture.pm2Home,
          commandEnvironment: fixture.commandEnvironment,
          runCommand: async (...args) => {
            pm2Events.push(args);
            return { stdout: '[]' };
          },
        }),
        /PM2_HOME must be exactly \/home\/branchmanager\/\.pm2/,
      );
      assert.deepEqual(pm2Events, [], fixture.name);
    }

    const openMode = resolve(directory, 'open-mode.env');
    await writeFile(
      openMode,
      `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}`,
      { mode: 0o644 },
    );
    await chmod(openMode, 0o644);
    const events = [];
    await assert.rejects(
      activateOpenRelease({
        releaseCandidate: release,
        commandEnvironment: { DEXTER_MCP_ENV_FILE: openMode },
        runCommand: async (...args) => {
          events.push(args);
          return { stdout: '[]' };
        },
      }),
      /mode-0600/,
    );
    assert.deepEqual(events, []);

    for (const key of FORBIDDEN_LOADER_KEYS) {
      const envFile = await writeProtectedEnvironment(directory);
      const commandEvents = [];
      await assert.rejects(
        activateOpenRelease({
          releaseCandidate: release,
          commandEnvironment: {
            DEXTER_MCP_ENV_FILE: envFile,
            [key]: 'attacker',
          },
          runCommand: async (...args) => {
            commandEvents.push(args);
            return { stdout: '[]' };
          },
        }),
        new RegExp(`${key} is forbidden`),
      );
      assert.deepEqual(commandEvents, []);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preflight returns only nonsecret candidate identity and trims the governed secret', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opendexter-preflight-ok-'));
  try {
    const envFile = resolve(directory, 'production.env');
    await writeFile(envFile, [
      `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=  ${GOVERNED_SECRET}  `,
      'TOKEN_AI_MCP_PORT=4930',
      'OPEN_MCP_PORT=4931',
      'TOKEN_AI_MCP_PROFILE=',
      'TOKEN_AI_MCP_TOOLSETS=',
    ].join('\n'), { mode: 0o600 });
    const result = await preflightOpenReleaseCandidate({
      release: releaseCandidate('/sealed/releases/new'),
      commandEnvironment: { DEXTER_MCP_ENV_FILE: envFile },
    });
    assert.equal(result.expectedProcesses['dexter-mcp'].port, 4930);
    assert.equal(result.expectedProcesses['dexter-open-mcp'].port, 4931);
    assert.equal(result.expectedProcesses['dexter-mcp'].envFile, envFile);
    assert.equal(result.envFileSha256, sha256(await readFile(envFile)));
    assert.equal(
      result.expectedProcesses['dexter-mcp'].envFileSha256,
      result.envFileSha256,
    );
    assert.doesNotMatch(JSON.stringify(result), new RegExp(GOVERNED_SECRET));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
