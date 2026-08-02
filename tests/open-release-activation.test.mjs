import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  activateOpenRelease,
  capturePriorOpenReleasePair,
  preservedPrivateProcessSnapshot,
  preflightOpenReleaseCandidate,
  readLoopbackHealth,
  startOpenReleaseCandidate,
  verifyPriorOpenReleaseRestartability,
  verifyProductionPm2Executable,
  verifyRestoredOpenReleasePair,
  verifyRunningOpenReleasePair,
} from '../scripts/release/open-release-core.mjs';
import {
  PRODUCTION_NODE_EXECUTABLE,
  PRODUCTION_PM2_EXECUTABLE,
} from '../lib/open-release-pm2-safety.mjs';

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const MANIFEST = 'c'.repeat(64);
const DESCRIPTOR = 'd'.repeat(64);
const PRIVATE_ROSTER = ['private_fixture'];
const OPEN_ROSTER = ['x402_search', 'dexter_prepare_asset_action'];
const GOVERNED_SECRET = 'g'.repeat(32);
const PROTECTED_SERVICE_SECRET = 'protected-service-secret';
const PRODUCTION_PM2_HOME = '/home/branchmanager/.pm2';
const HARNESS_PM2_TIMEOUT_MS = 250;
const DEXTER_SERVICES = ['dexter-open-mcp'];
const FORBIDDEN_LOADER_KEYS = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
];

test('production activation binds the reviewed root-owned PM2 executable', async () => {
  assert.equal(
    await verifyProductionPm2Executable(),
    PRODUCTION_PM2_EXECUTABLE,
  );
});

test('a failing PM2 runtime verifier stops before the first jlist', async () => {
  let commandCalls = 0;
  await assert.rejects(
    activateOpenRelease({
      releaseCandidate: releaseCandidate(),
      preflightCandidate: async () => ({}),
      verifyPm2Executable: async () => {
        throw new Error('untrusted PM2 runtime');
      },
      runCommand: async () => {
        commandCalls += 1;
        return { stdout: '[]' };
      },
    }),
    /untrusted PM2 runtime/,
  );
  assert.equal(commandCalls, 0);
});

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
        'dexter-open-mcp': 'production-bootstrap.mjs',
      },
      rosters: {
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
  pmId = name === 'dexter-mcp' ? 69 : 68,
} = {}) {
  const script = resolve(cwd, 'production-bootstrap.mjs');
  const packageVersion = processPolicy.packageVersion ?? release.packageVersion;
  const environment = {
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
    DEXTER_MCP_RELEASE_MANIFEST_SHA256: release.artifactManifestSha256,
    DEXTER_MCP_DESCRIPTOR_SHA256: release.descriptorSha256,
    DEXTER_MCP_RELEASE_PACKAGE_VERSION: release.packageVersion,
    DEXTER_MCP_RELEASE_SERVICE: release.service,
    unique_id: `fixture-${name}-${pid}`,
    [name]: '{}',
  };
  const effectiveEnvironment = { ...environment };
  delete effectiveEnvironment.unique_id;
  delete effectiveEnvironment[name];
  return {
    name,
    pm_id: pmId,
    pid,
    singleArgument,
    pm2_env: {
      ...effectiveEnvironment,
      NODE_APP_INSTANCE: 0,
      autostart: true,
      km_link: false,
      node_version: process.versions.node,
      pm_err_log_path: resolve(pm2Home, 'logs', `${name}-error-${pmId}.log`),
      pm_out_log_path: resolve(pm2Home, 'logs', `${name}-out-${pmId}.log`),
      pmx: true,
      vizion_running: false,
      name,
      namespace: 'default',
      cwd,
      status: 'online',
      restart_time: 0,
      unstable_restarts: 0,
      pm_id: pmId,
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
      version: packageVersion,
      pm_cwd: cwd,
      pm_exec_path: script,
      exec_interpreter: process.execPath,
      env: environment,
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
      const [, , pid, field] = path.split('/');
      const row = byPid.get(pid);
      if (!row) throw new Error(`unknown fake pid ${pid}`);
      if (field === 'stat') {
        const tail = [
          'S',
          ...Array(18).fill('0'),
          String(row.startTimeTicks ?? Number(pid) * 100),
        ];
        return `${pid} (fixture node) ${tail.join(' ')}\n`;
      }
      return row.singleArgument
        ? `node ${row.pm2_env.pm_exec_path}\0`
        : `${process.execPath}\0${row.pm2_env.pm_exec_path}\0`;
    },
    realpathImpl: async (path) => path,
  };
}

function priorProofProc(rows) {
  const proc = fakeProc(rows);
  return {
    readlinkImpl: proc.readlinkImpl,
    processReadFileImpl: proc.readFileImpl,
    realpathImpl: proc.realpathImpl,
  };
}

const LEGACY_COMMIT = '835bc431a3b8d1d4ebb8809d05c7b383888d177e';
const LEGACY_TREE = 'f3c510b6e0cf9161e1039e74f1dd60377817a911';
const LEGACY_ARCHIVE =
  '680d224bdf387b7d72f614de93a6ac208881aee2a40b6171ba90d155c573ffd7';
const LEGACY_DIR = `/var/lib/dexter-mcp/releases/${LEGACY_COMMIT}`;
const LEGACY_SCRIPT = `${LEGACY_DIR}/open-mcp-server.mjs`;
const LEGACY_INTERPRETER =
  '/home/branchmanager/.nvm/versions/node/v22.19.0/bin/node';
const LEGACY_ENV_FILE = '/home/branchmanager/websites/dexter-mcp/.env';
const LEGACY_ROSTER = [
  'x402_search',
  'x402_check',
  'x402_fetch',
  'x402_status',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
];

function legacyApplicationEnvironment() {
  return Object.fromEntries(Array.from({ length: 63 }, (_, index) => [
    `LEGACY_APP_${String(index).padStart(2, '0')}`,
    `value-${index}`,
  ]));
}

function legacyEnvironmentBytes({
  mutate = (environment) => environment,
} = {}) {
  const environment = mutate({
    ...legacyApplicationEnvironment(),
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: GOVERNED_SECRET,
  });
  return Buffer.from(`${Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`);
}

function legacyOpenRow({
  pid = 901700,
  pmId = 68,
  cwd = LEGACY_DIR,
  script = LEGACY_SCRIPT,
  interpreter = LEGACY_INTERPRETER,
  loader = {},
  processPolicy = {},
} = {}) {
  const environment = {
    ...legacyApplicationEnvironment(),
    DEXTER_MCP_ENV_FILE: LEGACY_ENV_FILE,
    HOME: '/home/branchmanager',
    NODE_ENV: 'production',
    PATH: '/reviewed/runtime/path',
    PM2_HOME: PRODUCTION_PM2_HOME,
    unique_id: 'legacy-open-unique-id',
    'dexter-open-mcp': '{}',
    ...loader,
  };
  const effectiveEnvironment = { ...environment };
  delete effectiveEnvironment.unique_id;
  delete effectiveEnvironment['dexter-open-mcp'];
  return {
    name: 'dexter-open-mcp',
    pm_id: pmId,
    pid,
    pm2_env: {
      ...effectiveEnvironment,
      NODE_APP_INSTANCE: 0,
      autostart: true,
      km_link: false,
      node_version: process.versions.node,
      pm_err_log_path: resolve(
        PRODUCTION_PM2_HOME,
        'logs',
        `dexter-open-mcp-error-${pmId}.log`,
      ),
      pm_out_log_path: resolve(
        PRODUCTION_PM2_HOME,
        'logs',
        `dexter-open-mcp-out-${pmId}.log`,
      ),
      pmx: true,
      vizion_running: false,
      name: 'dexter-open-mcp',
      pm_id: pmId,
      namespace: 'default',
      cwd,
      status: 'online',
      restart_time: processPolicy.restartTime ?? 0,
      unstable_restarts: processPolicy.unstableRestarts ?? 0,
      exec_mode: 'fork_mode',
      autorestart: true,
      max_restarts: 10,
      node_args: [],
      filter_env: [''],
      instance_var: 'NODE_APP_INSTANCE',
      username: 'branchmanager',
      version: '0.4.0',
      pm_cwd: cwd,
      pm_exec_path: script,
      exec_interpreter: interpreter,
      ...(processPolicy.raw ?? {}),
      env: environment,
    },
  };
}

function legacyHealth(overrides = {}) {
  return {
    auth: 'optional',
    boundSessions: 0,
    name: 'OpenDexter',
    ok: true,
    rssMb: 124,
    sessions: 26,
    timestamp: new Date().toISOString(),
    toolAuth: 'mixed',
    tools: LEGACY_ROSTER,
    walletAndPaymentScope: 'vault',
    ...overrides,
  };
}

function legacyReleaseFixture({ metadata = 'metadata-a' } = {}) {
  return {
    kind: 'legacy-open-v1',
    releaseDir: LEGACY_DIR,
    entrypoint: LEGACY_SCRIPT,
    sourceIdentity: {
      commit: LEGACY_COMMIT,
      tree: LEGACY_TREE,
      archiveSha256: LEGACY_ARCHIVE,
      canonicalRemote: 'https://github.com/Dexter-DAO/dexter-mcp.git',
      canonicalRef: 'refs/heads/codex/mcp-release-graph-closure-20260731',
    },
    rollbackIdentity: {
      artifactManifestSha256: 'd'.repeat(64),
      fileCount: 120_277,
      filesystemMetadataSha256: sha256(metadata),
      manifest: { ino: 10, mode: 0o600 },
      sidecar: { ino: 11, mode: 0o600 },
    },
  };
}

function fakeProtectedEnvironmentStat() {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100600,
    nlink: 1,
    uid: process.getuid(),
    size: 4096,
    mtimeMs: 100,
    ctimeMs: 100,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function legacyProc(row, { startTimeTicks } = {}) {
  return {
    readlinkImpl: async (path) => {
      if (path.endsWith('/cwd')) return row.pm2_env.pm_cwd;
      if (path.endsWith('/exe')) return row.pm2_env.exec_interpreter;
      throw new Error(`unexpected legacy proc link ${path}`);
    },
    readFileImpl: async (path) => {
      if (path.endsWith('/cmdline')) {
        return `${row.pm2_env.exec_interpreter}\0${row.pm2_env.pm_exec_path}\0`;
      }
      if (path.endsWith('/stat')) {
        const tail = [
          'S',
          ...Array(18).fill('0'),
          String(startTimeTicks ?? row.pid * 100),
        ];
        return `${row.pid} (legacy open) ${tail.join(' ')}\n`;
      }
      throw new Error(`unexpected legacy proc file ${path}`);
    },
    realpathImpl: async (path) => path,
  };
}

function legacyCaptureOptions(row, {
  environmentBytes = legacyEnvironmentBytes(),
  release = legacyReleaseFixture(),
  remoteProof = (request) => request,
  startTimeTicks,
} = {}) {
  const proc = legacyProc(row, { startTimeTicks });
  return {
    ...proc,
    lstatImpl: async () => fakeProtectedEnvironmentStat(),
    environmentReadFileImpl: async () => environmentBytes,
    readLegacyReleaseImpl: async () => release,
    remoteSourceIdentityImpl: remoteProof,
    healthTimeoutMs: 20,
  };
}

function legacyRestartOptions(row, {
  environmentBytes = legacyEnvironmentBytes(),
  release = legacyReleaseFixture(),
  startTimeTicks,
  runtimeMode = 'captured',
} = {}) {
  const proc = legacyProc(row, { startTimeTicks });
  return {
    readlinkImpl: proc.readlinkImpl,
    processReadFileImpl: proc.readFileImpl,
    realpathImpl: proc.realpathImpl,
    lstatImpl: async () => fakeProtectedEnvironmentStat(),
    readFileImpl: async () => environmentBytes,
    readLegacyReleaseImpl: async () => release,
    runtimeMode,
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
  const expectedProcesses = Object.fromEntries(rows
    .filter((row) => DEXTER_SERVICES.includes(row.name)).map((row) => [
    row.name,
    expectedProcess(row),
  ]));
  const result = await verifyRunningOpenReleasePair({
    release,
    rows,
    expectedProcesses,
    fetchImpl: async () => healthResponse(
      'dexter-open-mcp', 4931, OPEN_ROSTER,
    ),
    ...fakeProc(rows),
  });
  assert.deepEqual(Object.keys(result.byName), ['dexter-open-mcp']);

  rows[1].pm2_env.env.TOKEN_AI_MCP_PROFILE = 'stale';
  await assert.rejects(
    verifyRunningOpenReleasePair({
      release,
      rows,
      expectedProcesses,
      fetchImpl: async () => healthResponse(
        'dexter-open-mcp', 4931, OPEN_ROSTER,
      ),
      ...fakeProc(rows),
    }),
    /PM2 (?:environment identity|effective environment)/,
  );

  rows[1].pm2_env.env.TOKEN_AI_MCP_PROFILE = '';
  rows[1].pm2_env.env.DEXTER_MCP_ENV_FILE_SHA256 = 'f'.repeat(64);
  await assert.rejects(
    verifyRunningOpenReleasePair({
      release,
      rows,
      expectedProcesses,
      fetchImpl: async () => healthResponse(
        'dexter-open-mcp', 4931, OPEN_ROSTER,
      ),
      ...fakeProc(rows),
    }),
    /PM2 (?:environment identity|effective environment)/,
  );

  rows[1].pm2_env.env.DEXTER_MCP_ENV_FILE_SHA256 = 'e'.repeat(64);
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
    const originalValue = structuredClone(rows[1].pm2_env[field]);
    rows[1].pm2_env[field] = hostileValue;
    await assert.rejects(
      verifyRunningOpenReleasePair({
        release,
        rows,
        expectedProcesses,
        fetchImpl: async () => healthResponse(
          'dexter-open-mcp', 4931, OPEN_ROSTER,
        ),
        ...fakeProc(rows),
      }),
      /PM2 environment identity/,
      `running proof must bind ${field}`,
    );
    rows[1].pm2_env[field] = originalValue;
  }

  for (const key of FORBIDDEN_LOADER_KEYS) {
    rows[1].pm2_env.env[key] = 'attacker';
    rows[1].pm2_env[key] = 'attacker';
    await assert.rejects(
      verifyRunningOpenReleasePair({
        release,
        rows,
        expectedProcesses,
        fetchImpl: async () => healthResponse(
          'dexter-open-mcp', 4931, OPEN_ROSTER,
        ),
        ...fakeProc(rows),
      }),
      /PM2 environment identity/,
      `running proof must reject ${key}`,
    );
    delete rows[1].pm2_env.env[key];
    delete rows[1].pm2_env[key];
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
      expectedProcesses: Object.fromEntries(rows
        .filter((row) => DEXTER_SERVICES.includes(row.name)).map((row) => [
        row.name,
        expectedProcess(row),
      ])),
      fetchImpl: async () => healthResponse(
        'dexter-open-mcp', 4931, OPEN_ROSTER,
      ),
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

test('private runtime snapshot binds id69, PID, counters, definition, and kernel start time', async () => {
  const row = pm2Row(
    'dexter-mcp',
    '/sealed/releases/private-runtime1',
    3206769,
    PRIVATE_ROSTER,
    3930,
  );
  row.pm2_env.pm_exec_path =
    '/sealed/releases/private-runtime1/http-server-oauth.mjs';
  const baseline = await preservedPrivateProcessSnapshot(
    [row],
    fakeProc([row]),
  );
  assert.equal(baseline.pmId, 69);
  assert.equal(baseline.pid, 3206769);
  assert.equal(baseline.restartTime, 0);
  assert.equal(baseline.unstableRestarts, 0);
  assert.equal(baseline.kernel.startTimeTicks, String(3206769 * 100));

  for (const mutate of [
    (candidate) => {
      delete candidate.pm_id;
      delete candidate.pm2_env.pm_id;
    },
    (candidate) => {
      candidate.pm_id = '69';
      candidate.pm2_env.pm_id = '69';
    },
    (candidate) => {
      candidate.pm_id = Number.NaN;
      candidate.pm2_env.pm_id = Number.NaN;
    },
    (candidate) => {
      candidate.pm2_env.restart_time = -1;
    },
    (candidate) => {
      candidate.pm2_env.unstable_restarts = '0';
    },
  ]) {
    const candidate = structuredClone(row);
    mutate(candidate);
    await assert.rejects(
      preservedPrivateProcessSnapshot([candidate], fakeProc([candidate])),
      /private Dexter PM2 runtime identity is not exact/,
    );
  }

  const changedCounter = structuredClone(row);
  changedCounter.pm2_env.restart_time = 1;
  const changedCounterSnapshot = await preservedPrivateProcessSnapshot(
    [changedCounter],
    fakeProc([changedCounter]),
  );
  assert.notDeepEqual(changedCounterSnapshot, baseline);

  const changedKernelSnapshot = await preservedPrivateProcessSnapshot(
    [row],
    {
      ...fakeProc([row]),
      readFileImpl: async (path) => {
        if (path.endsWith('/stat')) {
          const tail = ['S', ...Array(18).fill('0'), '999999999'];
          return `${row.pid} (fixture node) ${tail.join(' ')}\n`;
        }
        return `${process.execPath}\0${row.pm2_env.pm_exec_path}\0`;
      },
    },
  );
  assert.notDeepEqual(changedKernelSnapshot, baseline);
});

test('health timeout is bounded even when an injected fetch ignores abort', async () => {
  const row = pm2Row('dexter-open-mcp', '/release', 901201, [], 4931);
  const started = Date.now();
  await assert.rejects(
    readLoopbackHealth(
      'dexter-open-mcp',
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
  const healthFor = async (url, mutationOrOptions = () => {}) => {
    const mutation = typeof mutationOrOptions === 'function'
      ? mutationOrOptions
      : () => {};
    const port = Number(new URL(url).port);
    const name = port === 5930 ? 'dexter-mcp' : 'dexter-open-mcp';
    const roster = name === 'dexter-mcp' ? PRIVATE_ROSTER : OPEN_ROSTER;
    const body = await healthResponse(name, port, roster).json();
    mutation(body);
    return { status: 200, json: async () => body };
  };

  for (const mutateRows of [
    (candidate) => {
      delete candidate[1].pm2_env.env.DEXTER_MCP_EXPECTED_ROSTER_JSON;
    },
    (candidate) => {
      delete candidate[1].pm2_env.env.DEXTER_MCP_RELEASE_TREE;
    },
  ]) {
    const candidate = structuredClone(rows);
    mutateRows(candidate);
    await assert.rejects(
      capturePriorOpenReleasePair(candidate, healthFor, {
        ...fakeProc(candidate),
        healthTimeoutMs: 20,
      }),
      /(?:identity is not safe to restore|declared\/effective environment)/,
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

test('exact live v1 public tuple is captured with source, bytes, env, and fresh health', async () => {
  const row = legacyOpenRow({ pmId: 85 });
  let remoteProofCalls = 0;
  const prior = await capturePriorOpenReleasePair(
    [row],
    async () => ({ status: 200, json: async () => legacyHealth() }),
    legacyCaptureOptions(row, {
      remoteProof: (request) => {
        remoteProofCalls += 1;
        return request;
      },
    }),
  );
  assert.equal(remoteProofCalls, 1);
  assert.equal(prior['dexter-open-mcp'].legacy.release.sourceIdentity.tree, LEGACY_TREE);
  assert.equal(
    prior['dexter-open-mcp'].legacy.environment.envFileSha256,
    sha256(legacyEnvironmentBytes()),
  );
  await assert.doesNotReject(verifyPriorOpenReleaseRestartability({
    prior,
    rows: [row],
    ...legacyRestartOptions(row),
    verifyRemoteSource: true,
    remoteSourceIdentityImpl: (request) => {
      remoteProofCalls += 1;
      return request;
    },
  }));
  assert.equal(remoteProofCalls, 2);
});

test('legacy capture freezes the one exact deployed PM2 tuple', async () => {
  const mutations = [
    (row) => {
      row.pm2_env.cwd = `/tmp/${LEGACY_COMMIT}`;
      row.pm2_env.pm_cwd = `/tmp/${LEGACY_COMMIT}`;
    },
    (row) => { row.pm2_env.exec_interpreter = '/usr/bin/node'; },
    (row) => { row.pm2_env.env.NODE_OPTIONS = '--require=/tmp/hostile'; },
    (row) => { row.pm2_env.env.OPEN_MCP_PORT = '4931'; },
    (row) => { row.pm2_env.listen_timeout = 'not-a-number'; },
    (row) => { row.pm2_env.instances = null; },
    (row) => { row.pm2_env.instances = '1'; },
    (row) => { row.pm2_env.instances = 2; },
    (row) => { row.pm2_env.autorestart = false; },
    (row) => { row.pm2_env.restart_time = 1; },
    (row) => { row.pm2_env.unstable_restarts = 1; },
  ];
  for (const mutate of mutations) {
    const row = legacyOpenRow({ pmId: 85 });
    mutate(row);
    await assert.rejects(
      capturePriorOpenReleasePair(
        [row],
        async () => ({ status: 200, json: async () => legacyHealth() }),
        legacyCaptureOptions(row),
      ),
      /(?:identity is not safe to restore|environment namespace identity|declared\/effective environment|effective-only environment)/,
    );
  }
});

test('legacy capture admits only a positive emergency-restored public PM2 id', async () => {
  for (const pmId of [1, 68, 85, 4096]) {
    const row = legacyOpenRow({ pmId });
    await assert.doesNotReject(capturePriorOpenReleasePair(
      [row],
      async () => ({ status: 200, json: async () => legacyHealth() }),
      legacyCaptureOptions(row),
    ));
  }

  const restoredRawOne = legacyOpenRow({
    pmId: 85,
    processPolicy: { raw: { instances: 1 } },
  });
  await assert.doesNotReject(capturePriorOpenReleasePair(
    [restoredRawOne],
    async () => ({ status: 200, json: async () => legacyHealth() }),
    legacyCaptureOptions(restoredRawOne),
  ));

  for (const pmId of [0, -1, 1.5]) {
    const row = legacyOpenRow({ pmId });
    await assert.rejects(
      capturePriorOpenReleasePair(
        [row],
        async () => ({ status: 200, json: async () => legacyHealth() }),
        legacyCaptureOptions(row),
      ),
      /environment namespace identity is incomplete|identity is not safe to restore|runtime identity is not exact/,
    );
  }
});

test('legacy capture accepts only one valid governed-secret addition to 63 exact app keys', async () => {
  const exactRow = legacyOpenRow();
  await assert.doesNotReject(capturePriorOpenReleasePair(
    [exactRow],
    async () => ({ status: 200, json: async () => legacyHealth() }),
    legacyCaptureOptions(exactRow),
  ));

  const hostileFiles = [
    legacyEnvironmentBytes({
      mutate: (environment) => ({ ...environment, UNAPPROVED_EXTRA: 'true' }),
    }),
    legacyEnvironmentBytes({
      mutate: (environment) => ({ ...environment, LEGACY_APP_00: 'changed' }),
    }),
    legacyEnvironmentBytes({
      mutate: (environment) => {
        delete environment.LEGACY_APP_00;
        return environment;
      },
    }),
    legacyEnvironmentBytes({
      mutate: (environment) => ({
        ...environment,
        GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 'short',
      }),
    }),
  ];
  for (const environmentBytes of hostileFiles) {
    const row = legacyOpenRow();
    await assert.rejects(
      capturePriorOpenReleasePair(
        [row],
        async () => ({ status: 200, json: async () => legacyHealth() }),
        legacyCaptureOptions(row, { environmentBytes }),
      ),
      /persisted environment does not match|unapproved addition|HMAC_SECRET is invalid/,
    );
  }
});

test('legacy health refuses stale, missing, extra, changed auth, and changed roster', async () => {
  const bodies = [
    legacyHealth({ timestamp: new Date(Date.now() - 60_000).toISOString() }),
    (() => {
      const body = legacyHealth();
      delete body.auth;
      return body;
    })(),
    legacyHealth({ unexpected: true }),
    legacyHealth({ auth: 'required' }),
    legacyHealth({ tools: [...LEGACY_ROSTER].reverse() }),
  ];
  for (const body of bodies) {
    const row = legacyOpenRow();
    await assert.rejects(
      capturePriorOpenReleasePair(
        [row],
        async () => ({ status: 200, json: async () => body }),
        legacyCaptureOptions(row),
      ),
      /health does not match PM2 identity/,
    );
  }
});

test('legacy source proof refuses wrong objects, moved ref proof, and outage', async () => {
  for (const remoteProof of [
    (request) => ({ ...request, tree: 'f'.repeat(40) }),
    (request) => ({ ...request, ref: 'refs/heads/moved' }),
    async () => { throw new Error('origin unavailable'); },
  ]) {
    const row = legacyOpenRow();
    await assert.rejects(
      capturePriorOpenReleasePair(
        [row],
        async () => ({ status: 200, json: async () => legacyHealth() }),
        legacyCaptureOptions(row, { remoteProof }),
      ),
      /canonical source proof mismatch|origin unavailable/,
    );
  }
});

test('pre-delete legacy reproof binds PID, start time, counters, bytes, env, and second source proof', async () => {
  const row = legacyOpenRow();
  const prior = await capturePriorOpenReleasePair(
    [row],
    async () => ({ status: 200, json: async () => legacyHealth() }),
    legacyCaptureOptions(row),
  );

  const changedPid = structuredClone(row);
  changedPid.pid += 1;
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [changedPid],
      ...legacyRestartOptions(changedPid),
    }),
    /PM2 runtime changed before restart proof/,
  );
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [row],
      ...legacyRestartOptions(row, { startTimeTicks: row.pid * 100 + 1 }),
    }),
    /kernel identity changed before restart proof/,
  );
  const changedCounter = structuredClone(row);
  changedCounter.pm2_env.restart_time = 1;
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [changedCounter],
      ...legacyRestartOptions(changedCounter),
    }),
    /PM2 runtime changed before restart proof/,
  );
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [row],
      ...legacyRestartOptions(row, {
        release: legacyReleaseFixture({ metadata: 'metadata-b' }),
      }),
    }),
    /legacy release identity mismatch/,
  );
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [row],
      ...legacyRestartOptions(row, {
        environmentBytes: legacyEnvironmentBytes({
          mutate: (environment) => ({
            ...environment,
            LEGACY_APP_00: 'changed-after-capture',
          }),
        }),
      }),
    }),
    /environment-file digest mismatch/,
  );
  await assert.rejects(
    verifyPriorOpenReleaseRestartability({
      prior,
      rows: [row],
      ...legacyRestartOptions(row),
      verifyRemoteSource: true,
      remoteSourceIdentityImpl: () => {
        throw new Error('ref moved before delete');
      },
    }),
    /ref moved before delete/,
  );
});

test('rollback accepts fresh public PM2 id/PID/start time and re-proves local material', async () => {
  const row = legacyOpenRow();
  const prior = await capturePriorOpenReleasePair(
    [row],
    async () => ({ status: 200, json: async () => legacyHealth() }),
    legacyCaptureOptions(row),
  );
  const restored = structuredClone(row);
  restored.pid += 100;
  restored.pm_id = 77;
  restored.pm2_env.pm_id = 77;
  restored.pm2_env.pm_err_log_path = resolve(
    PRODUCTION_PM2_HOME,
    'logs',
    'dexter-open-mcp-error-77.log',
  );
  restored.pm2_env.pm_out_log_path = resolve(
    PRODUCTION_PM2_HOME,
    'logs',
    'dexter-open-mcp-out-77.log',
  );
  await assert.doesNotReject(verifyPriorOpenReleaseRestartability({
    prior,
    rows: [restored],
    ...legacyRestartOptions(restored, { runtimeMode: 'restored' }),
  }));
  await assert.doesNotReject(verifyRestoredOpenReleasePair({
    prior,
    rows: [restored],
    fetchImpl: async () => ({ status: 200, json: async () => legacyHealth() }),
    ...legacyProc(restored),
    healthTimeoutMs: 20,
  }));
  await assert.rejects(
    verifyRestoredOpenReleasePair({
      prior,
      rows: [restored],
      fetchImpl: async () => ({
        status: 200,
        json: async () => legacyHealth({
          timestamp: new Date(Date.now() - 60_000).toISOString(),
        }),
      }),
      ...legacyProc(restored),
      healthTimeoutMs: 20,
    }),
    /rollback health mismatch/,
  );
});

test('prior restart proof seals only the public release and exact environment bytes', async () => {
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
    row.pm2_env.EXACT_APP_VALUE = 'preserved';
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
      ...priorProofProc(rows),
    }));
    assert.deepEqual(releaseDirectories, ['/sealed/releases/open-prior']);

    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl: (releaseDir) => {
          const candidate = releaseCandidate(releaseDir);
          candidate.provenance.sourceTree = '9'.repeat(40);
          return candidate;
        },
        ...priorProofProc(rows),
      }),
      /sealed release identity mismatch/,
    );

    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior,
        rows,
        readSealedReleaseImpl: (releaseDir) => {
          const candidate = releaseCandidate(releaseDir);
          candidate.provenance.entrypoints['dexter-open-mcp'] = 'different.mjs';
          return candidate;
        },
        ...priorProofProc(rows),
      }),
      /script is not the sealed entrypoint/,
    );

    const wrongInterpreter = structuredClone(prior);
    wrongInterpreter['dexter-open-mcp'].kernel.executable = '/different/node';
    await assert.rejects(
      verifyPriorOpenReleaseRestartability({
        prior: wrongInterpreter,
        rows,
        readSealedReleaseImpl,
        ...priorProofProc(rows),
      }),
      /kernel identity changed before restart proof/,
    );

    const mismatchedRows = structuredClone(rows);
    mismatchedRows[1].pm2_env.env.EXACT_APP_VALUE = 'not-the-file-value';
    mismatchedRows[1].pm2_env.EXACT_APP_VALUE = 'not-the-file-value';
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
        ...priorProofProc(mismatchedRows),
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
        ...priorProofProc(rows),
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
        ...priorProofProc(rows),
      }),
      /environment file is not owned mode-0600 with one link/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function dumpRows(rows) {
  return rows.map((row) => {
    const persisted = structuredClone(row.pm2_env);
    for (const key of [
      'status',
      'restart_time',
      'unstable_restarts',
      'pm_id',
    ]) {
      delete persisted[key];
    }
    persisted.name = row.name;
    persisted.env = structuredClone(row.pm2_env.env);
    return persisted;
  });
}

function orderedRows(rows) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
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
  tamperPriorDirectOnly = false,
  tamperCandidateDirectOnly = false,
  tamperSavedCandidateDirectOnly = false,
  tamperSavedUnrelated = false,
  swapEnvBeforeCandidateStart = false,
  swapEnvAfterCandidateSave = false,
  initialRows,
  initialSavedRows,
  includeUnrelated = false,
  includeLiveOnlyModule = false,
  failCandidateJlistOnce = false,
  failRollbackDelete = false,
  failRollbackDeleteOnce = false,
  failPriorRestartability = false,
  failPriorSavedVerification = false,
  omitInitialSavedDump = false,
  freshInstall = false,
  restartPublicDuringRemoteProof = false,
  useLegacyPrior = false,
  legacyPriorPmId = 68,
  legacyPriorRawInstances,
  finalPriorHealthMutation = null,
  harnessPm2TimeoutMs = HARNESS_PM2_TIMEOUT_MS,
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
    useLegacyPrior
      ? legacyOpenRow({
        pid: 902002,
        pmId: legacyPriorPmId,
        processPolicy: legacyPriorRawInstances === undefined
          ? {}
          : { raw: { instances: legacyPriorRawInstances } },
      })
      : pm2Row('dexter-open-mcp', '/sealed/releases/old-open', 902002, ['old'], 5931, {
        envFile: '/protected/old.env',
        release: oldIdentity('dexter-open-mcp'),
        profile: 'legacy-open',
        toolsets: 'old-open',
        singleArgument: true,
      }),
    pm2Row('dexter-mcp', '/sealed/releases/old-private', 902001, ['old'], 5930, {
      envFile: '/protected/old.env',
      release: oldIdentity('dexter-mcp'),
      profile: 'legacy-private',
      toolsets: 'old-private',
    }),
  ];
  if (includeUnrelated) defaultPriorRows.push(unrelatedPm2Row());
  if (includeLiveOnlyModule) defaultPriorRows.push(liveOnlyPm2ModuleRow());
  const priorRows = initialRows ?? defaultPriorRows;
  const candidateRows = [
    pm2Row('dexter-open-mcp', release.releaseDir, 903002, OPEN_ROSTER, 4931, {
      envFile,
      envFileSha256,
      pm2Home: PRODUCTION_PM2_HOME,
      singleArgument: true,
    }),
  ];
  delete candidateRows[0].pm2_env.env.TOKEN_AI_MCP_PROFILE;
  delete candidateRows[0].pm2_env.env.TOKEN_AI_MCP_TOOLSETS;
  delete candidateRows[0].pm2_env.TOKEN_AI_MCP_PROFILE;
  delete candidateRows[0].pm2_env.TOKEN_AI_MCP_TOOLSETS;
  let rows = structuredClone(priorRows);
  if (tamperPriorDirectOnly) {
    rows.find((row) => row.name === 'dexter-open-mcp')
      .pm2_env.HOSTILE_DIRECT_ONLY = 'not-declared';
  }
  if (tamperCandidateDirectOnly) {
    candidateRows[0].pm2_env.HOSTILE_DIRECT_ONLY = 'not-declared';
  }
  const events = [];
  const commandCalls = [];
  let candidateStarted = false;
  let candidateJlistFailed = false;
  let deleteCalls = 0;
  let rollbackDeleteFailures = 0;
  let priorRestartProofCalls = 0;
  let legacyPriorHealthCalls = 0;
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
    assert.equal(command, PRODUCTION_NODE_EXECUTABLE);
    assert.equal(args[0], PRODUCTION_PM2_EXECUTABLE);
    const pm2Args = args.slice(1);
    commandCalls.push({ args: [...pm2Args], options });
    const operation = pm2Args[0];
    events.push(`${operation}${pm2Args[1] ? `:${pm2Args[1]}` : ''}`);
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
          || tamperSavedCandidateDirectOnly
        )
        && dump.some((row) => row.pm_cwd === release.releaseDir)
      ) {
        if (tamperCandidateDump) {
          dump.find((row) => row.pm_cwd === release.releaseDir)
            .env.TOKEN_AI_MCP_PROFILE = 'tampered-after-save';
        }
        if (tamperCandidatePolicy) {
          const [field, value] = tamperCandidatePolicy;
          dump.find((row) => row.pm_cwd === release.releaseDir)[field] = value;
        }
        if (tamperCandidateLoader) {
          dump.find((row) => row.pm_cwd === release.releaseDir)
            .env[tamperCandidateLoader] = 'attacker';
        }
        if (tamperCandidateProtectedSecret) {
          const candidate = dump.find((row) => row.pm_cwd === release.releaseDir);
          candidate.env.GOVERNED_AGENT_ACTIONS_HMAC_SECRET =
            'SENTINEL_TAMPERED_GOVERNED_SECRET';
          candidate.env.SUPABASE_SERVICE_ROLE_KEY =
            'SENTINEL_TAMPERED_SUPABASE_SECRET';
        }
        if (tamperSavedUnrelated) {
          const unrelated = dump.find((row) => row.name === 'other-service');
          if (unrelated) unrelated.env.OTHER_PORT = '4999';
        }
        if (tamperSavedCandidateDirectOnly) {
          dump.find((row) => row.pm_cwd === release.releaseDir)
            .HOSTILE_DIRECT_ONLY = 'not-declared';
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
        rows.find((row) => row.name === 'dexter-open-mcp')
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
      if (
        deleteCalls > DEXTER_SERVICES.length
        && (
          failRollbackDelete
          || (failRollbackDeleteOnce && rollbackDeleteFailures === 0)
        )
      ) {
        rollbackDeleteFailures += 1;
        throw new Error('rollback_delete_failed');
      }
      rows = rows.filter((row) => row.name !== pm2Args[1]);
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
      const priorServices = priorRows.filter(
        (row) => DEXTER_SERVICES.includes(row.name),
      );
      const occupiedNames = new Set(rows.map((row) => row.name));
      const missingPriorServices = priorServices.filter(
        (row) => !occupiedNames.has(row.name),
      );
      rows = rows.concat(structuredClone(missingPriorServices).map((row, index) => ({
        ...row,
        pid: 904001 + index,
        pm_id: 70 + index,
        pm2_env: {
          ...row.pm2_env,
          pm_id: 70 + index,
          pm_err_log_path: resolve(
            row.pm2_env.PM2_HOME,
            'logs',
            `${row.name}-error-${70 + index}.log`,
          ),
          pm_out_log_path: resolve(
            row.pm2_env.PM2_HOME,
            'logs',
            `${row.name}-out-${70 + index}.log`,
          ),
        },
      })));
      return { stdout: 'resurrected' };
    }
    throw new Error(`unexpected PM2 operation: ${pm2Args.join(' ')}`);
  };
  const fetchImpl = async (url) => {
    const port = Number(new URL(url).port);
    if (port === 3931) {
      legacyPriorHealthCalls += 1;
      const body = legacyHealth();
      const responseBody = legacyPriorHealthCalls === 2
        && typeof finalPriorHealthMutation === 'function'
        ? finalPriorHealthMutation(body)
        : body;
      return { status: 200, json: async () => responseBody };
    }
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
    const legacyOptions = useLegacyPrior
      ? {
        lstatImpl: async () => fakeProtectedEnvironmentStat(),
        environmentReadFileImpl: async () => legacyEnvironmentBytes(),
        readLegacyReleaseImpl: async () => legacyReleaseFixture(),
        remoteSourceIdentityImpl: (request) => request,
      }
      : {};
    return capturePriorOpenReleasePair(current, fetcher, {
      ...options,
      ...fakeProc(current),
      ...legacyOptions,
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
      pm2CommandTimeoutMs: harnessPm2TimeoutMs,
      preflightCandidate: (args) => preflightOpenReleaseCandidate({
        ...args,
        pm2Home: PRODUCTION_PM2_HOME,
      }),
      capturePrior,
      verifyPriorRestartability: async (args) => {
        priorRestartProofCalls += 1;
        events.push('verified-prior-restart');
        if (failPriorRestartability) {
          throw new Error('hostile_prior_restartability');
        }
        if (
          restartPublicDuringRemoteProof
          && priorRestartProofCalls === 2
        ) {
          const publicRow = rows.find(
            (row) => row.name === 'dexter-open-mcp',
          );
          publicRow.pid += 100;
          publicRow.startTimeTicks = publicRow.pid * 100;
        }
        if (
          restartPublicDuringRemoteProof
          && priorRestartProofCalls === 3
          && args.rows.find((row) => row.name === 'dexter-open-mcp').pid
            !== priorRows.find((row) => row.name === 'dexter-open-mcp').pid
        ) {
          throw new Error('hostile_public_restarted_during_remote_proof');
        }
        return true;
      },
      verifyRestored,
      verifyPair,
      privateProcessProofOptions: fakeProc(priorRows),
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
      legacyPriorHealthCalls,
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
      legacyPriorHealthCalls,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('activation replaces only public OpenDexter and preserves private runtime', async () => {
  const {
    error,
    rows,
    events,
    commandCalls,
  } = await activationHarness();
  assert.equal(error, undefined);
  assert.deepEqual(rows.map((row) => [
    row.name,
    row.pid,
    row.pm2_env.pm_cwd,
    row.pm2_env.pm_exec_path,
  ]), [
    [
      'dexter-open-mcp',
      903002,
      '/sealed/releases/new',
      '/sealed/releases/new/production-bootstrap.mjs',
    ],
    [
      'dexter-mcp',
      902001,
      '/sealed/releases/old-private',
      '/sealed/releases/old-private/production-bootstrap.mjs',
    ],
  ]);
  assert.ok(events.indexOf('verified-prior-restart') < events.indexOf('save:--force'));
  assert.ok(
    events.indexOf('verified-saved:prior')
      < events.indexOf('delete:dexter-open-mcp'),
  );
  assert.equal(events.includes('delete:dexter-mcp'), false);
  assert.equal(events.filter((event) => event === 'verified-candidate').length, 2);
  assert.ok(events.indexOf('verified-candidate') < events.lastIndexOf('save:--force'));
  assert.ok(events.indexOf('verified-saved:candidate') > events.lastIndexOf('save:--force'));
  assert.ok(events.lastIndexOf('verified-candidate') > events.indexOf('verified-saved:candidate'));
  assert.equal(events.some(
    (event) => /^(?:reload|restart|startOrReload)(?::|$)/.test(event),
  ), false);
  const startCalls = commandCalls.filter(({ args }) => args[0] === 'start');
  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0].args[1].endsWith('.config.cjs'), true);
  assert.notEqual(
    startCalls[0].args[1],
    '/sealed/releases/new/ecosystem.production.cjs',
  );
  assert.deepEqual(startCalls[0].args.slice(2), [
    '--only',
    'dexter-open-mcp',
  ]);
});

test('candidate PM2 config shim is exact during start and removed afterward', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'opendexter-config-shim-'));
  const ecosystem = resolve(directory, 'ecosystem.production.cjs');
  await writeFile(ecosystem, 'module.exports = { apps: [] };\n');
  try {
    let observedConfigPath = null;
    await startOpenReleaseCandidate({
      ecosystem,
      pm2Home: directory,
      runPm2: async (args) => {
        assert.equal(args[0], 'start');
        assert.equal(args[1].endsWith('.config.cjs'), true);
        assert.notEqual(args[1], ecosystem);
        assert.deepEqual(args.slice(2), ['--only', 'dexter-open-mcp']);
        observedConfigPath = args[1];
        assert.equal(
          await readFile(args[1], 'utf8'),
          `'use strict';\nmodule.exports = require(${JSON.stringify(ecosystem)});\n`,
        );
      },
    });
    assert.notEqual(observedConfigPath, null);
    assert.equal(
      (await readdir(directory)).some((name) => name.endsWith('.config.cjs')),
      false,
    );

    await assert.rejects(
      startOpenReleaseCandidate({
        ecosystem,
        pm2Home: directory,
        runPm2: async () => {
          throw new Error('hostile_start_failure');
        },
      }),
      /hostile_start_failure/,
    );
    assert.equal(
      (await readdir(directory)).some((name) => name.endsWith('.config.cjs')),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('candidate failure resurrects the sealed prior row and never executes a PM2 dump', async () => {
  const result = await activationHarness({ rejectCandidate: true });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  const startCalls = result.commandCalls.filter(({ args }) => args[0] === 'start');
  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0].args[1].endsWith('.config.cjs'), true);
  assert.equal(result.commandCalls.some(({ args }) => (
    args[0] === 'start'
    && args.slice(1).some((argument) => (
      argument.endsWith('dump.pm2')
      || argument.includes('.opendexter-rollback-')
    ))
  )), false);
  assert.equal(
    result.commandCalls.filter(({ args }) => args[0] === 'resurrect').length,
    1,
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.deepEqual(
    result.rows.find((row) => row.name === 'dexter-mcp'),
    result.priorRows.find((row) => row.name === 'dexter-mcp'),
  );
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-open-mcp')
      .pm2_env.pm_exec_path,
    result.priorRows.find((row) => row.name === 'dexter-open-mcp')
      .pm2_env.pm_exec_path,
  );
});

test('emergency-restored legacy public id can roll back through another PM2 id', async () => {
  const result = await activationHarness({
    useLegacyPrior: true,
    legacyPriorPmId: 85,
    legacyPriorRawInstances: 1,
    rejectCandidate: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  const restoredPublic = result.rows.find(
    (row) => row.name === 'dexter-open-mcp',
  );
  assert.notEqual(restoredPublic.pm_id, 85);
  assert.equal(restoredPublic.pm2_env.restart_time, 0);
  assert.equal(restoredPublic.pm2_env.unstable_restarts, 0);
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.deepEqual(
    result.rows.find((row) => row.name === 'dexter-mcp'),
    result.priorRows.find((row) => row.name === 'dexter-mcp'),
  );
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

test('a public restart during final remote proof is re-read and refused before delete/start', async () => {
  const result = await activationHarness({
    restartPublicDuringRemoteProof: true,
  });
  assert.match(
    result.error?.message ?? '',
    /could not prove prior PM2 state/,
  );
  assert.equal(result.events.includes('delete:dexter-open-mcp'), false);
  assert.equal(result.events.some((event) => event.startsWith('start:')), false);
  assert.equal(
    result.commandCalls.filter(({ args }) => args[0] === 'jlist').length >= 3,
    true,
  );
});

test('final post-source legacy health proof refuses stale or changed v1 state before delete', async () => {
  const mutations = [
    (body) => ({
      ...body,
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    }),
    (body) => ({ ...body, auth: 'required' }),
    (body) => ({ ...body, hostileExtraKey: true }),
    (body) => ({ ...body, tools: [...body.tools, 'invented_tool'] }),
  ];
  for (const finalPriorHealthMutation of mutations) {
    const result = await activationHarness({
      useLegacyPrior: true,
      finalPriorHealthMutation,
    });
    assert.match(
      result.error?.message ?? '',
      /could not prove prior PM2 state; the original saved state was restored/,
    );
    assert.equal(result.legacyPriorHealthCalls, 2);
    assert.equal(
      result.events.some((event) => event.startsWith('delete:')),
      false,
    );
    assert.equal(result.events.some((event) => event.startsWith('start:')), false);
  }
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
    assert.equal(options.timeout, HARNESS_PM2_TIMEOUT_MS);
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

test('the post-save live proof catches candidate drift and restores the prior public service', async () => {
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

test('rollback retries a transient target delete before resurrecting', async () => {
  const result = await activationHarness({
    failCandidateJlistOnce: true,
    failRollbackDeleteOnce: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.ok(result.events.includes('resurrect'));
  assert.ok(
    result.events.filter(
      (event) => event === 'delete:dexter-open-mcp',
    ).length >= 3,
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
});

test('rollback refuses resurrect while a persistently undeletable public name remains', async () => {
  const result = await activationHarness({
    rejectCandidate: true,
    failRollbackDelete: true,
  });
  assert.match(
    result.error?.message ?? '',
    /candidate failed and rollback could not be proven/,
  );
  assert.equal(result.events.includes('resurrect'), false);
  const privateBefore = result.priorRows.find(
    (row) => row.name === 'dexter-mcp',
  );
  const privateAfter = result.rows.find((row) => row.name === 'dexter-mcp');
  assert.deepEqual(
    [privateAfter.pm_id, privateAfter.pid, privateAfter.pm2_env.pm_cwd],
    [privateBefore.pm_id, privateBefore.pid, privateBefore.pm2_env.pm_cwd],
  );
});

test('a candidate mismatch restores and proves the exact prior public service', async () => {
  const { error, rows, events, priorRows } = await activationHarness({
    rejectCandidate: true,
  });
  assert.match(error?.message ?? '', /candidate failed; the exact prior state was restored/);
  assert.deepEqual(
    orderedRows(rows).map((row) => [
      row.name,
      row.pm2_env.pm_cwd,
      row.pm2_env.env.TOKEN_AI_MCP_PROFILE,
      row.pm2_env.env.DEXTER_MCP_RELEASE_COMMIT,
    ]),
    orderedRows(priorRows).map((row) => [
      row.name,
      row.pm2_env.pm_cwd,
      row.pm2_env.env.TOKEN_AI_MCP_PROFILE,
      row.pm2_env.env.DEXTER_MCP_RELEASE_COMMIT,
    ]),
  );
  assert.ok(events.includes('resurrect'));
  assert.equal(events.at(-1), 'verified-rollback');
});

test('a candidate health call that never settles restores the prior public service', async () => {
  const started = Date.now();
  const { error, rows, events, priorRows } = await activationHarness({
    hangCandidateHealth: true,
  });
  assert.match(error?.message ?? '', /candidate failed; the exact prior state was restored/);
  assert.ok(Date.now() - started < 1_000);
  assert.deepEqual(
    orderedRows(rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
    orderedRows(priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
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
    orderedRows(rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
    orderedRows(priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
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
    orderedRows(result.rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
    orderedRows(result.priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.doesNotMatch(
    `${result.error?.message ?? ''}\n${result.error?.stack ?? ''}`,
    /SENTINEL_TAMPERED_(?:GOVERNED|SUPABASE)_SECRET/,
  );
});

test('direct-only PM2 environment injection is refused in prior, live candidate, and saved candidate states', async () => {
  const prior = await activationHarness({ tamperPriorDirectOnly: true });
  assert.match(
    prior.error?.message ?? '',
    /declared\/effective environment keys are not exact/,
  );
  assert.equal(prior.events.includes('save'), false);
  assert.equal(prior.events.some((event) => event.startsWith('delete:')), false);

  for (const fixture of [
    { tamperCandidateDirectOnly: true },
    { tamperSavedCandidateDirectOnly: true },
  ]) {
    const result = await activationHarness(fixture);
    assert.match(
      result.error?.message ?? '',
      /candidate failed; the exact prior state was restored/,
    );
    assert.equal(result.events.at(-1), 'verified-rollback');
  }
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
      orderedRows(result.rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
      orderedRows(result.priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
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
    orderedRows(rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
    orderedRows(priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
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
    orderedRows(result.rows).map((row) => [row.name, row.pm2_env.pm_cwd]),
    orderedRows(result.priorRows).map((row) => [row.name, row.pm2_env.pm_cwd]),
  );
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.doesNotMatch(
    `${result.error?.message ?? ''}\n${result.error?.stack ?? ''}`,
    /SENTINEL_SWAPPED_AFTER_CANDIDATE_SAVE/,
  );
});

test('partial or absent prior topology is refused before save/delete unless fresh is explicit', async () => {
  const partial = [pm2Row(
    'dexter-open-mcp',
    '/sealed/releases/old',
    905001,
    ['old'],
    5931,
  ), pm2Row(
    'dexter-open-mcp',
    '/sealed/releases/duplicate',
    905002,
    ['old'],
    5931,
  )];
  const partialResult = await activationHarness({ initialRows: partial });
  assert.match(partialResult.error?.message ?? '', /exactly one dexter-open-mcp/);
  assert.deepEqual(partialResult.events, ['jlist']);

  const absentResult = await activationHarness({ initialRows: [] });
  assert.match(absentResult.error?.message ?? '', /explicit freshInstall/);
  assert.deepEqual(absentResult.events, ['jlist']);

  const publicWithoutPrivate = await activationHarness({
    initialRows: [legacyOpenRow({ pid: 905003 })],
    useLegacyPrior: true,
  });
  assert.match(
    publicWithoutPrivate.error?.message ?? '',
    /requires the exact preserved private Dexter process/,
  );
  assert.equal(
    publicWithoutPrivate.events.some((event) => event === 'save'),
    false,
  );
  assert.equal(
    publicWithoutPrivate.events.some((event) => event.startsWith('delete:')),
    false,
  );
  assert.equal(publicWithoutPrivate.events.includes('start'), false);

  const freshWithPrivate = await activationHarness({
    initialRows: [pm2Row(
      'dexter-mcp',
      '/sealed/releases/old-private',
      905004,
      ['old'],
      5930,
      {
        envFile: '/protected/old.env',
        profile: 'legacy-private',
        toolsets: 'old-private',
      },
    )],
    freshInstall: true,
  });
  assert.match(
    freshWithPrivate.error?.message ?? '',
    /freshInstall requires the private Dexter process to be absent/,
  );
  assert.equal(
    freshWithPrivate.events.some((event) => event === 'save'),
    false,
  );
  assert.equal(freshWithPrivate.events.includes('start'), false);

  const freshResult = await activationHarness({
    initialRows: [],
    freshInstall: true,
  });
  assert.equal(freshResult.error, undefined);
  assert.deepEqual(freshResult.rows.map((row) => row.name), [
    'dexter-open-mcp',
  ]);

  const staleSavedTarget = await activationHarness({
    initialRows: [],
    initialSavedRows: [pm2Row(
      'dexter-open-mcp',
      '/sealed/releases/stale-saved',
      0,
      ['stale'],
      5931,
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
    assert.equal(result.expectedProcesses['dexter-open-mcp'].port, 4931);
    assert.equal(
      result.expectedProcesses['dexter-open-mcp'].envFile,
      envFile,
    );
    assert.equal(result.envFileSha256, sha256(await readFile(envFile)));
    assert.equal(
      result.expectedProcesses['dexter-open-mcp'].envFileSha256,
      result.envFileSha256,
    );
    assert.deepEqual(Object.keys(result.expectedProcesses), ['dexter-open-mcp']);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(GOVERNED_SECRET));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
