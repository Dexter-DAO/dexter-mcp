import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  acquireReleaseCutoverLock,
  activateOpenRelease,
  activatePrivateRelease,
  capturePriorOpenReleasePair,
  preservedPrivateProcessSnapshot,
  preflightOpenReleaseCandidate,
  privateRestartPm2Config,
  productionPm2ConfigShim,
  readLoopbackHealth,
  recoverPrivateRelease,
  startOpenReleaseCandidate,
  verifyPriorOpenReleaseRestartability,
  verifyPriorPrivateReleaseRestartability,
  verifyPrivateRollbackInputsStillExact,
  verifyLegacyPrivateInterpreter,
  verifyPm2DaemonLaunchAuthority,
  verifyProductionPm2Executable,
  verifyRestoredOpenReleasePair,
  verifyRunningOpenReleasePair,
} from '../scripts/release/open-release-core.mjs';
import {
  PRODUCTION_NODE_EXECUTABLE,
  PRODUCTION_PM2_EXECUTABLE,
  samePm2ProcessSnapshot,
} from '../lib/open-release-pm2-safety.mjs';

const require = createRequire(import.meta.url);
const {
  LEGACY_PRIVATE_RELEASE_CONTRACT,
  OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
} = require('../lib/open-release-provenance.cjs');

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
const HARNESS_PM2_STARTUP_TIMEOUT_MS = 500;
const DEXTER_SERVICES = ['dexter-open-mcp'];
const FORBIDDEN_LOADER_KEYS = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'PM2_NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
];
const EXACT_DAEMON = Object.freeze({
  bootId: 'b8a72f74-0912-45c5-8dcf-a237492acf9f\n',
  cgroup: '0::/system.slice/pm2-branchmanager.service\n',
  executable: '/home/branchmanager/.nvm/versions/node/v20.19.1/bin/node',
  executableSha256:
    'fea3f6e1e5eb8622bf1af1b85a9384ad88c673674e4b7c6bd223ca1127d1e5e9',
  pid: 2432040,
  startTimeTicks: '736087414',
});
const EXACT_SYSTEM_FILES = Object.freeze({
  '/usr/bin/systemctl':
    'e0d3d0e9444da1b2b58c792c3f5028b69f049b77d5ca17b3ec0d09f89117225b',
  '/etc/systemd/system/pm2-branchmanager.service':
    'cdc1563c1d7b3ac18eb0dda51547c4c59bc810e57dee93dbfdc98d59e7d43721',
  '/etc/systemd/system/pm2-branchmanager.service.d/10-umask.conf':
    '9e407d257aa91afd3bb98cbb2a571cbcc25f3ed631ef723ccb340c6de9c1c1d8',
  '/etc/systemd/system/pm2-branchmanager.service.d/20-root-node.conf':
    '78f3f6c8bfd59928f22f66e856c0ed7427a900cf23527d639d88b6e2e12c79c0',
});
const EXACT_SYSTEMD_PROPERTIES = Object.freeze({
  ActiveState: 'active',
  ControlGroup: '/system.slice/pm2-branchmanager.service',
  DropInPaths: '/etc/systemd/system/pm2-branchmanager.service.d/10-umask.conf /etc/systemd/system/pm2-branchmanager.service.d/20-root-node.conf',
  ExecReload: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 reload all ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  ExecStart: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 resurrect ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  ExecStop: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 kill ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  FragmentPath: '/etc/systemd/system/pm2-branchmanager.service',
  MainPID: String(EXACT_DAEMON.pid),
  PIDFile: '/home/branchmanager/.pm2/pm2.pid',
  SubState: 'running',
  Type: 'forking',
  User: 'branchmanager',
});
const EXACT_REPORT = Object.freeze({
  argv: [
    EXACT_DAEMON.executable,
    '/usr/local/lib/node_modules/pm2/lib/Daemon.js',
  ],
  argv0: EXACT_DAEMON.executable,
  gid: 1001,
  node_version: '20.19.1',
  pm2_version: '6.0.5',
  uid: 1001,
  user: 'branchmanager',
});

test('public and private cutovers share one fail-closed host lock', async () => {
  const directory = await realpath(
    await mkdtemp(resolve(tmpdir(), 'dexter-release-lock-')),
  );
  try {
    const first = await acquireReleaseCutoverLock(directory);
    await assert.rejects(
      acquireReleaseCutoverLock(directory),
      /another Dexter MCP release cutover is active/,
    );
    await first.release();
    const next = await acquireReleaseCutoverLock(directory);
    await next.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('private recovery can reclaim a second dead recovery lock', async () => {
  const directory = await realpath(
    await mkdtemp(resolve(tmpdir(), 'dexter-recovery-lock-')),
  );
  const journalSha256 = 'a'.repeat(64);
  try {
    const activation = await acquireReleaseCutoverLock(directory);
    const firstRecovery = await acquireReleaseCutoverLock(directory, {
      recoverOwner: activation.owner,
      recoverJournalSha256: journalSha256,
      processAliveImpl: async () => false,
    });
    const secondRecovery = await acquireReleaseCutoverLock(directory, {
      recoverOwner: activation.owner,
      recoverJournalSha256: journalSha256,
      processAliveImpl: async () => false,
    });
    assert.notDeepEqual(firstRecovery.owner, secondRecovery.owner);
    await secondRecovery.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('private recovery CLI rejects arguments before recovery side effects', () => {
  const result = spawnSync(process.execPath, [
    resolve('scripts/release/recover-private-release.mjs'),
    'unexpected',
  ], {
    cwd: resolve('.'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Usage: npm run recover:mcp:private\n$/);
});

test('production activation binds the reviewed root-owned PM2 executable', async () => {
  assert.equal(
    await verifyProductionPm2Executable(),
    PRODUCTION_PM2_EXECUTABLE,
  );
});

test('PM2 daemon proof refuses ambient fork loader options', async () => {
  const pid = 4242;
  const pm2Home = PRODUCTION_PM2_HOME;
  const pidPath = resolve(pm2Home, 'pm2.pid');
  const stat = fakeProtectedEnvironmentStat();
  const procStat = `${pid} (PM2 daemon) ${[
    'S',
    ...Array(18).fill('0'),
    '987654321',
  ].join(' ')}\n`;
  const common = {
    pm2Home,
    lstatImpl: async (path) => {
      assert.equal(path, pidPath);
      return stat;
    },
    readlinkImpl: async (path) => {
      assert.equal(path, `/proc/${pid}/exe`);
      return PRODUCTION_NODE_EXECUTABLE;
    },
    realpathImpl: async (path) => path,
  };
  const readFileForEnvironment = (environment) => async (path) => {
    if (path === pidPath) return Buffer.from(`${pid}\n`);
    if (path === `/proc/${pid}/stat`) return procStat;
    if (path === `/proc/${pid}/cmdline`) {
      return Buffer.from(
        `PM2 v6.0.5: God Daemon (${pm2Home})\0`,
      );
    }
    if (path === `/proc/${pid}/environ`) return Buffer.from(environment);
    throw new Error(`unexpected PM2 daemon fixture path ${path}`);
  };
  await assert.doesNotReject(verifyPm2DaemonLaunchAuthority({
    ...common,
    readFileImpl: readFileForEnvironment('HOME=/home/branchmanager\0'),
  }));
  await assert.rejects(
    verifyPm2DaemonLaunchAuthority({
      ...common,
      readFileImpl: readFileForEnvironment(
        'HOME=/home/branchmanager\0PM2_NODE_OPTIONS=--require /tmp/x.cjs\0',
      ),
    }),
    /daemon launch authority is not exact/,
  );
});

test('PM2 daemon proof accepts only the exact current legacy instance', async () => {
  await assert.doesNotReject(
    verifyPm2DaemonLaunchAuthority(exactLegacyDaemonFixture()),
  );
});

test('PM2 daemon legacy exception rejects identity and provenance drift', async () => {
  const cases = [
    ['pid', { pid: EXACT_DAEMON.pid + 1 }],
    ['start time', { startTimeTicks: '736087415' }],
    ['boot', { bootId: 'different-boot\n' }],
    ['cgroup', { cgroup: '0::/user.slice\n' }],
    ['title', { title: 'PM2 v6.0.5: forged' }],
    ['loader environment', { environment: 'PM2_NODE_OPTIONS=--require /tmp/x.cjs\0' }],
    ['executable path', { executable: '/tmp/node' }],
    ['executable image hash', { imageSha256: '0'.repeat(64) }],
    ['executable image inode', { imageStat: { ino: 1870521 } }],
    ['systemctl hash', {
      systemFileHashes: { '/usr/bin/systemctl': '0'.repeat(64) },
    }],
    ['systemd MainPID', { systemdProperties: { MainPID: '1' } }],
    ['systemd ExecStart', { systemdProperties: { ExecStart: 'forged' } }],
    ['systemd drop-ins', { systemdProperties: { DropInPaths: 'forged' } }],
    ['daemon report version', { report: { pm2_version: '6.0.8' } }],
    ['daemon report argv', { report: { argv: ['/tmp/node'] } }],
    ['final pid bytes race', { finalPid: EXACT_DAEMON.pid + 1 }],
    ['final start-time race', { finalStartTimeTicks: '736087415' }],
    ['final boot race', { finalBootId: 'different-boot\n' }],
    ['final cgroup race', { finalCgroup: '0::/user.slice\n' }],
    ['final executable-link race', { finalExecutable: '/tmp/node' }],
    ['final title race', { finalTitle: 'PM2 v6.0.5: forged' }],
    ['final loader race', {
      finalEnvironment: 'PM2_NODE_OPTIONS=--require /tmp/x.cjs\0',
    }],
    ['mid-hash executable race', { imageAfterStat: { size: 99831241 } }],
    ['final executable hash race', { finalImageSha256: '0'.repeat(64) }],
  ];
  for (const [label, overrides] of cases) {
    await assert.rejects(
      verifyPm2DaemonLaunchAuthority(exactLegacyDaemonFixture(overrides)),
      /daemon launch authority is not exact/,
      label,
    );
  }
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

test('an unavailable public widget asset stops before the first PM2 command', async () => {
  let commandCalls = 0;
  await assert.rejects(
    activateOpenRelease({
      releaseCandidate: releaseCandidate(),
      preflightCandidate: async () => ({}),
      verifyPm2Executable: async () => PRODUCTION_PM2_EXECUTABLE,
      prepareWidgetAssets: async () => {
        throw new Error('public widget asset returned HTTP 404');
      },
      runCommand: async () => {
        commandCalls += 1;
        return { stdout: '[]' };
      },
    }),
    /public widget asset returned HTTP 404/,
  );
  assert.equal(commandCalls, 0);
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function releaseCandidate(
  releaseDir = '/sealed/releases/new',
  { privateService = false } = {},
) {
  return {
    releaseDir,
    provenance: {
      schema: privateService
        ? 'dexter-mcp-immutable-release/v4'
        : 'dexter-mcp-immutable-release/v3',
      sourceCommit: COMMIT,
      sourceTree: TREE,
      artifactManifestSha256: MANIFEST,
      descriptorSha256: DESCRIPTOR,
      packageVersion: '0.5.0',
      nodeVersion: process.version,
      entrypoints: {
        ...(privateService
          ? { 'dexter-mcp': 'production-bootstrap.mjs' }
          : {}),
        'dexter-open-mcp': 'production-bootstrap.mjs',
      },
      rosters: {
        ...(privateService ? { 'dexter-mcp': PRIVATE_ROSTER } : {}),
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
  interpreter = name === 'dexter-open-mcp'
    ? OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE
    : process.execPath,
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
      resolve(interpreter, '..'),
      '/usr/local/sbin',
      '/usr/local/bin',
      '/usr/sbin',
      '/usr/bin',
      '/sbin',
      '/bin',
    ].join(':'),
    HOME: '/home/branchmanager',
    PM2_HOME: pm2Home,
    version: release.packageVersion,
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
      listen_timeout: processPolicy.listenTimeout ?? 90_000,
      kill_timeout: processPolicy.killTimeout ?? 10_000,
      node_args: processPolicy.nodeArgs ?? [],
      args: processPolicy.scriptArgs ?? [],
      filter_env: processPolicy.filterEnvironment ?? [''],
      instance_var: processPolicy.instanceVariable ?? 'NODE_APP_INSTANCE',
      username: processPolicy.username ?? 'branchmanager',
      version: packageVersion,
      pm_cwd: cwd,
      pm_exec_path: script,
      exec_interpreter: interpreter,
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
      status: 'ok',
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
      PM2_NODE_OPTIONS: env.PM2_NODE_OPTIONS ?? null,
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
      if (field === 'exe') return row.pm2_env.exec_interpreter;
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
        : `${row.pm2_env.exec_interpreter}\0${row.pm2_env.pm_exec_path}\0`;
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

function observedLegacyPrivateFixture() {
  const persisted = Object.fromEntries(
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.persistedEnvironmentKeys.map(
      (key) => [key, `fixture-${key.toLowerCase()}`],
    ),
  );
  Object.assign(persisted, {
    DEXTER_MCP_ENV_FILE:
      LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.environmentFile,
    HOME: '/home/branchmanager',
    NODE_ENV: 'production',
    PATH: '/reviewed/runtime/path',
    PM2_HOME: PRODUCTION_PM2_HOME,
    TOKEN_AI_MCP_PORT: '3930',
    unique_id: 'legacy-private-unique-id',
    'dexter-mcp': '{}',
  });
  const fileEnvironment = Object.fromEntries(
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.environmentFileKeys.map((key) => [
      key,
      key === 'GOVERNED_AGENT_ACTIONS_HMAC_SECRET'
        ? GOVERNED_SECRET
        : persisted[key],
    ]),
  );
  const environmentBytes = Buffer.from(`${Object.entries(fileEnvironment)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`);
  const effectiveEnvironment = { ...persisted };
  delete effectiveEnvironment.unique_id;
  delete effectiveEnvironment['dexter-mcp'];
  const pmId = 63;
  const releaseDir = `/var/lib/dexter-mcp/releases/${
    LEGACY_PRIVATE_RELEASE_CONTRACT.directoryName
  }`;
  const script = resolve(
    releaseDir,
    LEGACY_PRIVATE_RELEASE_CONTRACT.entrypoint,
  );
  const row = {
    name: 'dexter-mcp',
    pm_id: pmId,
    pid: 2_432_302,
    pm2_env: {
      ...effectiveEnvironment,
      NODE_APP_INSTANCE: 0,
      autostart: true,
      km_link: false,
      node_version: process.versions.node,
      pm_err_log_path: resolve(
        PRODUCTION_PM2_HOME,
        'logs',
        `dexter-mcp-error-${pmId}.log`,
      ),
      pm_out_log_path: resolve(
        PRODUCTION_PM2_HOME,
        'logs',
        `dexter-mcp-out-${pmId}.log`,
      ),
      pmx: true,
      vizion_running: false,
      name: 'dexter-mcp',
      namespace: 'default',
      cwd: releaseDir,
      status: 'online',
      restart_time: 0,
      unstable_restarts: 0,
      pm_id: pmId,
      exec_mode: 'fork_mode',
      instances: null,
      autorestart: true,
      max_restarts: 15,
      node_args: [],
      args: null,
      filter_env: [''],
      instance_var: 'NODE_APP_INSTANCE',
      username: 'branchmanager',
      watch: null,
      merge_logs: null,
      version: LEGACY_PRIVATE_RELEASE_CONTRACT.packageVersion,
      pm_cwd: releaseDir,
      pm_exec_path: script,
      exec_interpreter:
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreter,
      env: persisted,
    },
  };
  return { environmentBytes, releaseDir, row, script };
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

function exactLegacyImageStat(overrides = {}) {
  return {
    dev: 66305,
    gid: 1001,
    ino: 1870520,
    mode: 0o100755,
    nlink: 1,
    size: 99831240,
    uid: 1001,
    mtimeMs: 100,
    ctimeMs: 100,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function exactLegacyDaemonFixture(overrides = {}) {
  const pid = overrides.pid ?? EXACT_DAEMON.pid;
  const pm2Home = PRODUCTION_PM2_HOME;
  const pidPath = resolve(pm2Home, 'pm2.pid');
  const procRoot = `/proc/${pid}`;
  const counters = {
    boot: 0,
    cgroup: 0,
    cmdline: 0,
    environment: 0,
    image: 0,
    pid: 0,
    pidStat: 0,
    procStat: 0,
    readlink: 0,
  };
  const protectedPidStat = fakeProtectedEnvironmentStat();
  const procStat = (ticks) => `${pid} (PM2 daemon) ${[
    'S',
    ...Array(18).fill('0'),
    ticks,
  ].join(' ')}\n`;
  return {
    pm2Home,
    lstatImpl: async (path) => {
      if (path === pidPath) {
        counters.pidStat += 1;
        if (counters.pidStat > 1 && overrides.finalPidStat) {
          return { ...protectedPidStat, ...overrides.finalPidStat };
        }
        return protectedPidStat;
      }
      if (Object.hasOwn(EXACT_SYSTEM_FILES, path)) {
        return {
          dev: 66305,
          ino: 100,
          mode: path === '/usr/bin/systemctl' ? 0o100755 : 0o100644,
          nlink: 1,
          uid: 0,
          gid: 0,
          size: 100,
          mtimeMs: 100,
          ctimeMs: 100,
          isDirectory: () => false,
          isFile: () => true,
          isSymbolicLink: () => false,
        };
      }
      throw new Error(`unexpected daemon lstat ${path}`);
    },
    openImpl: async (path, flags) => {
      assert.equal(path, `${procRoot}/exe`);
      assert.equal(flags, 'r');
      const imageIndex = counters.image;
      counters.image += 1;
      const base = exactLegacyImageStat(
        imageIndex === 0
          ? overrides.imageStat
          : overrides.finalImageStat,
      );
      const after = imageIndex === 0 && overrides.imageAfterStat
        ? exactLegacyImageStat({ ...overrides.imageStat, ...overrides.imageAfterStat })
        : base;
      let statCalls = 0;
      return {
        stat: async () => {
          statCalls += 1;
          return statCalls === 1 ? base : after;
        },
        readFile: async () => Buffer.from(`daemon-image-${imageIndex}`),
        close: async () => {},
      };
    },
    readFileImpl: async (path) => {
      if (path === pidPath) {
        counters.pid += 1;
        const observedPid = counters.pid > 1
          ? (overrides.finalPid ?? pid)
          : pid;
        return Buffer.from(`${observedPid}\n`);
      }
      if (path === `${procRoot}/stat`) {
        counters.procStat += 1;
        return procStat(
          counters.procStat > 1
            ? (overrides.finalStartTimeTicks
              ?? overrides.startTimeTicks
              ?? EXACT_DAEMON.startTimeTicks)
            : (overrides.startTimeTicks ?? EXACT_DAEMON.startTimeTicks),
        );
      }
      if (path === `${procRoot}/cmdline`) {
        counters.cmdline += 1;
        return Buffer.from(
          `${counters.cmdline > 1
            ? (overrides.finalTitle
              ?? overrides.title
              ?? `PM2 v6.0.5: God Daemon (${pm2Home})`)
            : (overrides.title
              ?? `PM2 v6.0.5: God Daemon (${pm2Home})`)}\0`,
        );
      }
      if (path === `${procRoot}/environ`) {
        counters.environment += 1;
        return Buffer.from(
          counters.environment > 1
            ? (overrides.finalEnvironment
              ?? overrides.environment
              ?? 'HOME=/home/branchmanager\0')
            : (overrides.environment ?? 'HOME=/home/branchmanager\0'),
        );
      }
      if (path === '/proc/sys/kernel/random/boot_id') {
        counters.boot += 1;
        return Buffer.from(
          counters.boot > 1
            ? (overrides.finalBootId ?? overrides.bootId ?? EXACT_DAEMON.bootId)
            : (overrides.bootId ?? EXACT_DAEMON.bootId),
        );
      }
      if (path === `${procRoot}/cgroup`) {
        counters.cgroup += 1;
        return Buffer.from(
          counters.cgroup > 1
            ? (overrides.finalCgroup ?? overrides.cgroup ?? EXACT_DAEMON.cgroup)
            : (overrides.cgroup ?? EXACT_DAEMON.cgroup),
        );
      }
      if (Object.hasOwn(EXACT_SYSTEM_FILES, path)) {
        return Buffer.from(`system-file:${path}`);
      }
      throw new Error(`unexpected daemon read ${path}`);
    },
    readlinkImpl: async (path) => {
      assert.equal(path, `${procRoot}/exe`);
      counters.readlink += 1;
      return counters.readlink > 1
        ? (overrides.finalExecutable
          ?? overrides.executable
          ?? EXACT_DAEMON.executable)
        : (overrides.executable ?? EXACT_DAEMON.executable);
    },
    realpathImpl: async (path) => path,
    runCommand: async (command, args, options) => {
      assert.equal(options.env.HOME, '/home/branchmanager');
      if (command === '/usr/bin/systemctl') {
        assert.equal(args[0], 'show');
        return {
          stdout: `${Object.entries({
            ...EXACT_SYSTEMD_PROPERTIES,
            ...overrides.systemdProperties,
          }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`,
          stderr: overrides.systemdStderr ?? '',
        };
      }
      assert.equal(command, PRODUCTION_NODE_EXECUTABLE);
      assert.equal(args[0], '-e');
      assert.match(args[1], /executeRemote\('getReport'/);
      return {
        stdout: JSON.stringify({ ...EXACT_REPORT, ...overrides.report }),
        stderr: overrides.reportStderr ?? '',
      };
    },
    sha256Impl: (bytes) => {
      const value = Buffer.from(bytes).toString('utf8');
      if (value.startsWith('system-file:')) {
        const path = value.slice('system-file:'.length);
        return overrides.systemFileHashes?.[path] ?? EXACT_SYSTEM_FILES[path];
      }
      if (value === 'daemon-image-0') {
        return overrides.imageSha256 ?? EXACT_DAEMON.executableSha256;
      }
      if (value === 'daemon-image-1') {
        return overrides.finalImageSha256 ?? EXACT_DAEMON.executableSha256;
      }
      throw new Error('unexpected daemon hash input');
    },
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
    ['listen_timeout', 90_001],
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

test('v4 running proof binds the private OAuth service without selecting public OpenDexter', async () => {
  const release = releaseCandidate('/sealed/releases/new', {
    privateService: true,
  });
  const rows = [
    pm2Row('dexter-mcp', release.releaseDir, 901011, PRIVATE_ROSTER, 4930, {
      interpreter: OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
    }),
    pm2Row('dexter-open-mcp', release.releaseDir, 901012, OPEN_ROSTER, 4931),
  ];
  const result = await verifyRunningOpenReleasePair({
    release,
    rows,
    services: ['dexter-mcp'],
    expectedProcesses: {
      'dexter-mcp': expectedProcess(rows[0]),
    },
    fetchImpl: async () => healthResponse(
      'dexter-mcp', 4930, PRIVATE_ROSTER,
    ),
    ...fakeProc(rows),
  });
  assert.deepEqual(Object.keys(result.byName), ['dexter-mcp']);
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

test('private runtime snapshot binds its exact dynamic PM2 id, PID, counters, definition, and kernel start time', async () => {
  const row = pm2Row(
    'dexter-mcp',
    '/sealed/releases/private-runtime1',
    3206769,
    PRIVATE_ROSTER,
    3930,
    { pmId: 65 },
  );
  row.pm2_env.pm_exec_path =
    '/sealed/releases/private-runtime1/http-server-oauth.mjs';
  const baseline = await preservedPrivateProcessSnapshot(
    [row],
    fakeProc([row]),
  );
  assert.equal(baseline.pmId, 65);
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
      candidate.pm_id = '65';
      candidate.pm2_env.pm_id = '65';
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

  const changedPmId = structuredClone(row);
  changedPmId.pm_id = 66;
  changedPmId.pm2_env.pm_id = 66;
  changedPmId.pm2_env.pm_err_log_path = resolve(
    PRODUCTION_PM2_HOME,
    'logs',
    'dexter-mcp-error-66.log',
  );
  changedPmId.pm2_env.pm_out_log_path = resolve(
    PRODUCTION_PM2_HOME,
    'logs',
    'dexter-mcp-out-66.log',
  );
  const changedPmIdSnapshot = await preservedPrivateProcessSnapshot(
    [changedPmId],
    fakeProc([changedPmId]),
  );
  assert.equal(
    samePm2ProcessSnapshot(changedPmIdSnapshot, baseline),
    false,
  );

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

test('private restart proof refuses a missing script or changed protected environment', async () => {
  const envBytes = Buffer.from(
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${GOVERNED_SECRET}\n`,
  );
  const release = releaseCandidate('/sealed/releases/private-restart', {
    privateService: true,
  });
  const row = pm2Row(
    'dexter-mcp',
    release.releaseDir,
    3206770,
    PRIVATE_ROSTER,
    3930,
    {
      envFile: '/protected/private.env',
      envFileSha256: sha256(envBytes),
      interpreter: OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
    },
  );
  const proc = fakeProc([row]);
  const expectedRuntime = await preservedPrivateProcessSnapshot([row], proc);
  const common = {
    row,
    expectedRuntime,
    expectedSavedRow: row,
    processProofOptions: proc,
    readSealedReleaseImpl: async () => release,
    lstatImpl: async () => fakeProtectedEnvironmentStat(),
    realpathImpl: async (path) => path,
  };
  await assert.doesNotReject(verifyPriorPrivateReleaseRestartability({
    ...common,
    readFileImpl: async () => envBytes,
  }));
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      readFileImpl: async () => envBytes,
      realpathImpl: async (path) => {
        if (path === row.pm2_env.pm_exec_path) {
          throw new Error('missing private script');
        }
        return path;
      },
    }),
    /missing private script/,
  );
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      readFileImpl: async () => Buffer.from(`${envBytes}changed=true\n`),
    }),
    /environment-file digest mismatch/,
  );

  const loaderRow = structuredClone(row);
  loaderRow.pm2_env.NODE_OPTIONS = '--require /attacker/loader.cjs';
  loaderRow.pm2_env.env.NODE_OPTIONS = '--require /attacker/loader.cjs';
  const loaderProc = fakeProc([loaderRow]);
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      row: loaderRow,
      expectedRuntime: await preservedPrivateProcessSnapshot(
        [loaderRow],
        loaderProc,
      ),
      expectedSavedRow: loaderRow,
      processProofOptions: loaderProc,
      readFileImpl: async () => envBytes,
    }),
    /forbidden loader input/,
  );

  const interpreterRow = structuredClone(row);
  interpreterRow.pm2_env.exec_interpreter = '/attacker/node';
  const interpreterProc = fakeProc([interpreterRow]);
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      row: interpreterRow,
      expectedRuntime: await preservedPrivateProcessSnapshot(
        [interpreterRow],
        interpreterProc,
      ),
      expectedSavedRow: interpreterRow,
      processProofOptions: interpreterProc,
      readFileImpl: async () => envBytes,
    }),
    /interpreter is not restartable exactly/,
  );

  for (const [field, value] of [
    ['node_args', ['--require', '/same-user/unsealed.cjs']],
    ['args', ['--eval', 'require("/same-user/unsealed.cjs")']],
    ['interpreter_args', ['--require', '/same-user/unsealed.cjs']],
  ]) {
    const argumentRow = structuredClone(row);
    argumentRow.pm2_env[field] = value;
    const argumentProc = fakeProc([argumentRow]);
    await assert.rejects(
      verifyPriorPrivateReleaseRestartability({
        ...common,
        row: argumentRow,
        expectedRuntime: await preservedPrivateProcessSnapshot(
          [argumentRow],
          argumentProc,
        ),
        expectedSavedRow: argumentRow,
        processProofOptions: argumentProc,
        readFileImpl: async () => envBytes,
      }),
      /execution arguments are not exactly empty/,
    );
  }
});

test('legacy private restart proof binds the observed runtime1 PM2 and environment tuple', async () => {
  const {
    environmentBytes,
    releaseDir,
    row,
    script,
  } = observedLegacyPrivateFixture();
  const proc = fakeProc([row]);
  const expectedRuntime = await preservedPrivateProcessSnapshot([row], proc);
  const release = {
    ...legacyReleaseFixture(),
    kind: 'legacy-private-v1',
    releaseDir,
    entrypoint: script,
  };
  const common = {
    row,
    expectedRuntime,
    expectedSavedRow: row,
    processProofOptions: proc,
    readLegacyReleaseImpl: async () => release,
    lstatImpl: async () => fakeProtectedEnvironmentStat(),
    realpathImpl: async (path) => path,
    verifyLegacyInterpreterImpl: async ({ interpreter }) => {
      assert.equal(
        interpreter,
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreter,
      );
      return {
        path: interpreter,
        version: LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterVersion,
        sha256: LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterSha256,
        identity: { fixture: 'legacy-private-node' },
      };
    },
  };
  const priorProof = await verifyPriorPrivateReleaseRestartability({
    ...common,
    readFileImpl: async () => environmentBytes,
  });
  await assert.doesNotReject(verifyPrivateRollbackInputsStillExact({
    row,
    priorProof,
    readLegacyReleaseImpl: async () => release,
    lstatImpl: common.lstatImpl,
    readFileImpl: async () => environmentBytes,
    realpathImpl: common.realpathImpl,
    verifyLegacyInterpreterImpl: common.verifyLegacyInterpreterImpl,
  }));

  await assert.rejects(
    verifyPrivateRollbackInputsStillExact({
      row,
      priorProof,
      readLegacyReleaseImpl: async () => release,
      lstatImpl: common.lstatImpl,
      readFileImpl: async () => environmentBytes,
      realpathImpl: common.realpathImpl,
      verifyLegacyInterpreterImpl: async ({ interpreter }) => ({
        path: interpreter,
        version: LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterVersion,
        sha256: '0'.repeat(64),
        identity: { fixture: 'legacy-private-node' },
      }),
    }),
    /code or interpreter changed after proof/,
  );

  await assert.rejects(
    verifyPrivateRollbackInputsStillExact({
      row,
      priorProof,
      readLegacyReleaseImpl: async () => release,
      lstatImpl: common.lstatImpl,
      readFileImpl: async () => Buffer.from(
        `${environmentBytes.toString('utf8')}HOSTILE_ADDITION=true\n`,
      ),
      realpathImpl: common.realpathImpl,
      verifyLegacyInterpreterImpl: common.verifyLegacyInterpreterImpl,
    }),
    /rollback environment changed after proof/,
  );

  const changedEnvironment = Buffer.from(
    `${environmentBytes.toString('utf8')}HOSTILE_ADDITION=true\n`,
  );
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      readFileImpl: async () => changedEnvironment,
    }),
    /environment-file keys changed/,
  );

  const changedRow = structuredClone(row);
  delete changedRow.pm2_env.env.HARNESS_COOKIE;
  delete changedRow.pm2_env.HARNESS_COOKIE;
  const changedProc = fakeProc([changedRow]);
  await assert.rejects(
    verifyPriorPrivateReleaseRestartability({
      ...common,
      row: changedRow,
      expectedRuntime: await preservedPrivateProcessSnapshot(
        [changedRow],
        changedProc,
      ),
      expectedSavedRow: changedRow,
      processProofOptions: changedProc,
      readFileImpl: async () => environmentBytes,
    }),
    /persisted environment keys changed/,
  );
});

test('legacy private interpreter proof binds path, bytes, version, and inode', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'legacy-private-node-'));
  const interpreter = resolve(directory, 'node');
  const bytes = Buffer.from('reviewed legacy node fixture');
  await writeFile(interpreter, bytes, { mode: 0o755 });
  await chmod(interpreter, 0o755);
  try {
    const interpreterStat = await lstat(interpreter);
    const expectedIdentity = {
      dev: interpreterStat.dev,
      ino: interpreterStat.ino,
      mode: interpreterStat.mode & 0o7777,
      nlink: interpreterStat.nlink,
      uid: interpreterStat.uid,
      gid: interpreterStat.gid,
    };
    const proof = await verifyLegacyPrivateInterpreter({
      expectedInterpreter: interpreter,
      interpreter,
      expectedVersion: 'v22.19.0',
      expectedSha256: sha256(bytes),
      expectedIdentity,
      realpathImpl: async (path) => path,
      runCommandImpl: async (command, args) => {
        assert.equal(command, interpreter);
        assert.deepEqual(args, ['--version']);
        return { stdout: 'v22.19.0\n' };
      },
    });
    assert.equal(proof.sha256, sha256(bytes));
    await assert.rejects(
      verifyLegacyPrivateInterpreter({
        expectedInterpreter: interpreter,
        interpreter,
        expectedVersion: 'v22.19.0',
        expectedSha256: '0'.repeat(64),
        expectedIdentity,
        realpathImpl: async (path) => path,
        runCommandImpl: async () => ({ stdout: 'v22.19.0\n' }),
      }),
      /interpreter digest changed/,
    );
    await assert.rejects(
      verifyLegacyPrivateInterpreter({
        expectedInterpreter: interpreter,
        interpreter,
        expectedVersion: 'v22.19.0',
        expectedSha256: sha256(bytes),
        expectedIdentity: {
          ...expectedIdentity,
          ino: expectedIdentity.ino + 1,
        },
        realpathImpl: async (path) => path,
        runCommandImpl: async () => ({ stdout: 'v22.19.0\n' }),
      }),
      /interpreter filesystem identity is unsafe/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
  const envBytes = Buffer.from([
    'EXACT_APP_VALUE=preserved',
    'TOKEN_AI_MCP_PROFILE=private-only-profile',
    'TOKEN_AI_MCP_TOOLSETS=private-only-toolsets',
    'version=9.9.9',
    '',
  ].join('\n'));
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
  for (const key of ['TOKEN_AI_MCP_PROFILE', 'TOKEN_AI_MCP_TOOLSETS']) {
    delete rows[1].pm2_env.env[key];
    delete rows[1].pm2_env[key];
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
  mutateLiveUnrelatedAfterCandidateStart = false,
  candidateStartDelayMs = 0,
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
  omitDefaultInstancesInSavedDump = false,
  finalPriorHealthMutation = null,
  failWidgetPost = false,
  harnessPm2TimeoutMs = HARNESS_PM2_TIMEOUT_MS,
  harnessPm2StartupTimeoutMs = HARNESS_PM2_STARTUP_TIMEOUT_MS,
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
    await writeFile(
      resolve(pm2Home, 'dump.pm2'),
      initialSavedBytes,
      { mode: 0o600 },
    );
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
      if (omitDefaultInstancesInSavedDump) {
        for (const row of dump) {
          if (row.instances === 1) delete row.instances;
        }
      }
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
      await writeFile(
        resolve(pm2Home, 'dump.pm2'),
        JSON.stringify(dump),
        { mode: 0o600 },
      );
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
      if (candidateStartDelayMs > 0) {
        await new Promise((resolveDelay) => setTimeout(
          resolveDelay,
          candidateStartDelayMs,
        ));
      }
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
      if (mutateLiveUnrelatedAfterCandidateStart) {
        const unrelatedRow = rows.find((row) => row.name === 'other-service');
        unrelatedRow.pm2_env.OTHER_PORT = '4012';
        unrelatedRow.pm2_env.env.OTHER_PORT = '4012';
      }
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
      pm2StartupTimeoutMs: harnessPm2StartupTimeoutMs,
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
      prepareWidgetAssets: async () => {
        events.push('verified-widget-assets:pre');
        return { referencedAssets: [{ name: 'fixture.js' }] };
      },
      verifyWidgetAssets: async () => {
        events.push('verified-widget-assets:post');
        if (failWidgetPost) throw new Error('hostile_public_widget_asset');
        return true;
      },
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
  assert.ok(
    events.indexOf('verified-widget-assets:pre')
      < events.indexOf('delete:dexter-open-mcp'),
  );
  assert.ok(
    events.indexOf('verified-widget-assets:post')
      > events.lastIndexOf('verified-candidate'),
  );
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

test('a post-activation public widget failure restores the prior service', async () => {
  const result = await activationHarness({ failWidgetPost: true });
  assert.match(
    result.error?.message ?? '',
    /candidate failed; the exact prior state was restored/,
  );
  assert.ok(result.events.includes('verified-widget-assets:pre'));
  assert.ok(result.events.includes('verified-widget-assets:post'));
  assert.equal(result.events.at(-1), 'verified-rollback');
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-open-mcp')
      .pm2_env.pm_cwd,
    result.priorRows.find((row) => row.name === 'dexter-open-mcp')
      .pm2_env.pm_cwd,
  );
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
          productionPm2ConfigShim(ecosystem).toString('utf8'),
        );
      },
    });
    assert.notEqual(observedConfigPath, null);
    assert.equal(
      (await readdir(directory)).some((name) => name.endsWith('.config.cjs')),
      false,
    );

    await startOpenReleaseCandidate({
      ecosystem,
      pm2Home: directory,
      serviceName: 'dexter-mcp',
      runPm2: async (args) => {
        assert.deepEqual(args.slice(2), ['--only', 'dexter-mcp']);
      },
    });

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

test('private rollback config contains one captured service and rejects loaders', () => {
  const row = pm2Row(
    'dexter-mcp',
    '/sealed/releases/private-prior',
    909991,
    ['prior'],
    3930,
  );
  const savedRow = dumpRows([row])[0];
  const source = privateRestartPm2Config(savedRow).toString('utf8');
  const encoded = source.match(/module\.exports = (.*);\n$/s)?.[1];
  assert.notEqual(encoded, undefined);
  const config = JSON.parse(encoded);
  assert.equal(config.apps.length, 1);
  assert.equal(config.apps[0].name, 'dexter-mcp');
  assert.equal(
    config.apps[0].script,
    '/sealed/releases/private-prior/production-bootstrap.mjs',
  );
  assert.equal(
    config.apps[0].env.SUPABASE_SERVICE_ROLE_KEY,
    PROTECTED_SERVICE_SECRET,
  );
  assert.equal(Object.hasOwn(config.apps[0].env, 'unique_id'), false);
  assert.equal(Object.hasOwn(config.apps[0].env, 'dexter-mcp'), false);

  const loaderRow = structuredClone(savedRow);
  loaderRow.env.NODE_OPTIONS = '--require /attacker/loader.cjs';
  assert.throws(
    () => privateRestartPm2Config(loaderRow),
    /environment is not exact/,
  );
  for (const [field, value] of [
    ['node_args', ['--require', '/same-user/unsealed.cjs']],
    ['args', ['--eval', 'require("/same-user/unsealed.cjs")']],
    ['interpreter_args', ['--require', '/same-user/unsealed.cjs']],
  ]) {
    const argumentRow = structuredClone(savedRow);
    argumentRow[field] = value;
    assert.throws(
      () => privateRestartPm2Config(argumentRow),
      /execution arguments are not exactly empty/,
    );
  }
});

async function privateActivationHarness({
  candidateSaveBackupMode = 'exact',
  changePrivateBeforeDelete = false,
  degradePriorBeforeRecovery = false,
  failRollbackDelete = false,
  candidateStartMode = 'online',
  evolveCandidateOnReject = false,
  initialSavedMode = 'full',
  replaceAfterTargetProof = false,
  rejectCandidate = false,
  rejectRollbackInputs = false,
  recoverAfterFailure = false,
  removeJournalDuringRecoveryPreflight = false,
  mutateRollbackConfigDuringInputProof = false,
  tamperRollbackApplicationEnvironment = false,
} = {}) {
  const directory = await realpath(
    await mkdtemp(resolve(tmpdir(), 'dexter-private-activation-')),
  );
  const pm2Home = resolve(directory, 'pm2');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(pm2Home));
  const envFile = await writeProtectedEnvironment(directory);
  const envFileSha256 = sha256(await readFile(envFile));
  const release = releaseCandidate('/sealed/releases/private-new', {
    privateService: true,
  });
  const oldPrivateIdentity = identity('dexter-mcp', {
    commit: '1'.repeat(40),
    tree: '2'.repeat(40),
    manifest: '3'.repeat(64),
    descriptor: '4'.repeat(64),
    version: '0.4.0',
  });
  const oldOpenIdentity = identity('dexter-open-mcp', {
    commit: '5'.repeat(40),
    tree: '6'.repeat(40),
    manifest: '7'.repeat(64),
    descriptor: '8'.repeat(64),
    version: '0.4.0',
  });
  const priorRows = [
    pm2Row('dexter-mcp', '/sealed/releases/private-old', 910001, ['old'], 5930, {
      pm2Home,
      envFile,
      envFileSha256,
      release: oldPrivateIdentity,
    }),
    pm2Row(
      'dexter-open-mcp',
      '/sealed/releases/open-old',
      910002,
      ['open-old'],
      5931,
      {
        pm2Home,
        envFile,
        envFileSha256,
        release: oldOpenIdentity,
        interpreter: OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
      },
    ),
  ];
  const candidatePrivate = pm2Row(
    'dexter-mcp',
    release.releaseDir,
    920001,
    PRIVATE_ROSTER,
    4930,
    {
      pm2Home,
      envFile,
      envFileSha256,
      interpreter: OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
    },
  );
  const savedOnlyRow = pm2Row(
    'saved-only-worker',
    '/sealed/releases/saved-only',
    910003,
    ['saved-only'],
    5999,
    {
      pm2Home,
      envFile,
      envFileSha256,
      pmId: 81,
      release: identity('saved-only-worker'),
    },
  );
  let rows = structuredClone(priorRows);
  let deleteCount = 0;
  let saveCount = 0;
  const events = [];
  const initialSavedRows = initialSavedMode === 'without-private'
    ? [priorRows[1], savedOnlyRow]
    : [...priorRows, savedOnlyRow];
  const initialSavedBytes = initialSavedMode === 'absent'
    ? null
    : JSON.stringify(dumpRows(initialSavedRows));
  if (initialSavedBytes !== null) {
    await writeFile(
      resolve(pm2Home, 'dump.pm2'),
      initialSavedBytes,
      { mode: 0o600 },
    );
  }
  const initialBackupBytes = JSON.stringify(dumpRows([savedOnlyRow]));
  await writeFile(
    resolve(pm2Home, 'dump.pm2.bak'),
    initialBackupBytes,
    { mode: 0o600 },
  );
  const dynamicProc = {
    realpathImpl: async (path) => path,
    readlinkImpl: async (path) => {
      const [, , pid, leaf] = path.split('/');
      const row = rows.find((candidate) => String(candidate.pid) === pid);
      if (leaf === 'exe') return row.pm2_env.exec_interpreter;
      if (leaf === 'cwd') return row.pm2_env.pm_cwd;
      throw new Error(`unexpected proc link ${path}`);
    },
    readFileImpl: async (path) => {
      const [, , pid, leaf] = path.split('/');
      const row = rows.find((candidate) => String(candidate.pid) === pid);
      if (leaf === 'cmdline') {
        return `${row.pm2_env.exec_interpreter}\0${row.pm2_env.pm_exec_path}\0`;
      }
      if (leaf === 'stat') {
        const tail = [
          'S',
          ...Array(18).fill('0'),
          String(Number(pid) * 100),
        ];
        return `${pid} (fixture node) ${tail.join(' ')}\n`;
      }
      throw new Error(`unexpected proc file ${path}`);
    },
  };
  const runCommand = async (command, args) => {
    assert.equal(command, PRODUCTION_NODE_EXECUTABLE);
    assert.equal(args[0], PRODUCTION_PM2_EXECUTABLE);
    const pm2Args = args.slice(1);
    events.push(pm2Args.join(':'));
    if (pm2Args[0] === 'jlist') return { stdout: JSON.stringify(rows) };
    if (pm2Args[0] === 'save') {
      saveCount += 1;
      const primaryPath = resolve(pm2Home, 'dump.pm2');
      const previousPrimary = await readFile(primaryPath).catch(
        (error) => error?.code === 'ENOENT' ? null : Promise.reject(error),
      );
      if (saveCount === 2 && candidateSaveBackupMode === 'missing') {
        await rm(resolve(pm2Home, 'dump.pm2.bak'), { force: true });
      } else if (saveCount === 2 && candidateSaveBackupMode === 'wrong') {
        await writeFile(
          resolve(pm2Home, 'dump.pm2.bak'),
          '[]',
          { mode: 0o600 },
        );
      } else if (previousPrimary !== null) {
        await writeFile(
          resolve(pm2Home, 'dump.pm2.bak'),
          previousPrimary,
          { mode: 0o600 },
        );
      }
      await writeFile(
        primaryPath,
        JSON.stringify(dumpRows(rows)),
        { mode: 0o600 },
      );
      return { stdout: 'saved' };
    }
    if (pm2Args[0] === 'delete') {
      deleteCount += 1;
      if (failRollbackDelete && deleteCount === 2) {
        throw new Error('simulated crash during rollback delete');
      }
      rows = rows.filter((row) => String(row.pm_id) !== pm2Args[1]);
      return { stdout: 'deleted' };
    }
    if (pm2Args[0] === 'start') {
      assert.deepEqual(pm2Args.slice(2), ['--only', 'dexter-mcp']);
      const rollback = pm2Args[1].includes('.opendexter-private-rollback-');
      if (!rollback && candidateStartMode === 'absent-failure') {
        throw new Error('candidate failed before PM2 row creation');
      }
      const started = rollback
        ? {
          ...structuredClone(priorRows[0]),
          pid: 930001,
          pm_id: 79,
          pm2_env: {
            ...structuredClone(priorRows[0].pm2_env),
            pm_id: 79,
            pm_err_log_path: resolve(
              pm2Home,
              'logs',
              'dexter-mcp-error-79.log',
            ),
            pm_out_log_path: resolve(
              pm2Home,
              'logs',
              'dexter-mcp-out-79.log',
            ),
          },
        }
        : structuredClone(candidatePrivate);
      if (!rollback && [
        'errored-failure',
        'pre-ipc-errored-failure',
      ].includes(candidateStartMode)) {
        started.pid = 0;
        started.pm2_env.status = 'errored';
        started.pm2_env.restart_time = 10;
        if (candidateStartMode === 'pre-ipc-errored-failure') {
          delete started.pm2_env.node_version;
        }
      }
      if (rollback) {
        started.pm2_env.env.unique_id = 'pm2-generated-rollback-uuid';
        if (tamperRollbackApplicationEnvironment) {
          started.pm2_env.env.SUPABASE_SERVICE_ROLE_KEY =
            'hostile-rollback-application-environment';
        }
      }
      rows = [
        started,
        ...rows.filter((row) => row.name !== 'dexter-mcp'),
      ];
      if (!rollback && [
        'errored-failure',
        'pre-ipc-errored-failure',
      ].includes(candidateStartMode)) {
        throw new Error('candidate retained an errored PM2 row');
      }
      return { stdout: 'started' };
    }
    throw new Error(`unexpected PM2 operation ${pm2Args.join(' ')}`);
  };
  const fetchImpl = async (url) => {
    const port = Number(new URL(url).port);
    if (port === 5930) {
      return {
        status: 200,
        json: async () => ({
          ok: true,
          status: 'ok',
          oauth: true,
          issuer: 'https://mcp.dexter.cash/mcp',
          base: 'https://mcp.dexter.cash/mcp',
          port,
          toolProfile: null,
          toolsetsEnv: null,
          sessions: { transports: 0, servers: 0 },
          timestamp: '2026-08-29T00:00:00.000Z',
        }),
      };
    }
    return healthResponse('dexter-mcp', port, PRIVATE_ROSTER);
  };
  const envStat = await lstat(envFile);
  const preflight = {
    envFile,
    envFileSha256,
    envFileIdentity: {
      dev: envStat.dev,
      ino: envStat.ino,
      nlink: envStat.nlink,
      uid: envStat.uid,
      mode: envStat.mode,
      size: envStat.size,
      mtimeMs: envStat.mtimeMs,
      ctimeMs: envStat.ctimeMs,
    },
    expectedProcesses: {
      'dexter-mcp': expectedProcess(candidatePrivate),
    },
  };
  try {
    let result;
    let error;
    let recoveryResult;
    let recoveryError;
    try {
      result = await activatePrivateRelease({
        releaseCandidate: release,
        runCommand,
        fetchImpl,
        pm2Home,
        commandEnvironment: {
          PATH: process.env.PATH,
          DEXTER_MCP_ENV_FILE: envFile,
        },
        healthTimeoutMs: 20,
        pm2CommandTimeoutMs: HARNESS_PM2_TIMEOUT_MS,
        pm2StartupTimeoutMs: HARNESS_PM2_STARTUP_TIMEOUT_MS,
        preflightCandidate: async ({ services }) => {
          assert.deepEqual(services, ['dexter-mcp']);
          return preflight;
        },
        verifyCandidate: async (args) => {
          if (rejectCandidate) {
            if (evolveCandidateOnReject) {
              const current = rows.find((row) => row.name === 'dexter-mcp');
              rows = [
                {
                  ...structuredClone(current),
                  pid: current.pid + 7,
                  pm2_env: {
                    ...structuredClone(current.pm2_env),
                    status: 'launching',
                    restart_time: current.pm2_env.restart_time + 1,
                    unstable_restarts:
                      current.pm2_env.unstable_restarts + 1,
                  },
                },
                ...rows.filter((row) => row.name !== 'dexter-mcp'),
              ];
            }
            throw new Error('hostile_private_candidate');
          }
          return verifyRunningOpenReleasePair({
            ...args,
            ...fakeProc(args.rows),
          });
        },
        verifyPriorRestartability: async () => {
          if (changePrivateBeforeDelete) {
            const current = rows.find((row) => row.name === 'dexter-mcp');
            rows = [
              {
                ...structuredClone(current),
                pid: current.pid + 100,
              },
              ...rows.filter((row) => row.name !== 'dexter-mcp'),
            ];
          }
          return { fixture: 'private-restart-proof' };
        },
        verifyRollbackInputs: async ({ row, priorProof }) => {
          assert.equal(row.name, 'dexter-mcp');
          assert.deepEqual(priorProof, { fixture: 'private-restart-proof' });
          events.push('verified-rollback-inputs');
          if (mutateRollbackConfigDuringInputProof) {
            const configName = (await readdir(pm2Home)).find(
              (name) => name.startsWith('.opendexter-private-rollback-'),
            );
            assert.notEqual(configName, undefined);
            await writeFile(resolve(pm2Home, configName), 'hostile-config');
          }
          if (rejectRollbackInputs) {
            throw new Error('hostile_rollback_input_swap');
          }
          return true;
        },
        verifyDaemon: async ({ pm2Home: verifiedPm2Home }) => {
          assert.equal(verifiedPm2Home, pm2Home);
          events.push('verified-pm2-daemon');
          return true;
        },
        verifyPm2Executable: async () => PRODUCTION_PM2_EXECUTABLE,
        processProofOptions: dynamicProc,
        beforePrivateDelete: async ({ phase }) => {
          if (!replaceAfterTargetProof || phase !== 'activation') return;
          const current = rows.find((row) => row.name === 'dexter-mcp');
          const replacementPmId = 82;
          rows = [
            {
              ...structuredClone(current),
              pid: current.pid + 200,
              pm_id: replacementPmId,
              pm2_env: {
                ...structuredClone(current.pm2_env),
                pm_id: replacementPmId,
                pm_err_log_path: resolve(
                  pm2Home,
                  'logs',
                  `dexter-mcp-error-${replacementPmId}.log`,
                ),
                pm_out_log_path: resolve(
                  pm2Home,
                  'logs',
                  `dexter-mcp-out-${replacementPmId}.log`,
                ),
              },
            },
            ...rows.filter((row) => row.name !== 'dexter-mcp'),
          ];
        },
      });
    } catch (caught) {
      error = caught;
    }
    const eventsBeforeRecovery = events.length;
    if (recoverAfterFailure) {
      if (degradePriorBeforeRecovery) {
        const current = rows.find((row) => row.name === 'dexter-mcp');
        assert.notEqual(current, undefined);
        const degraded = structuredClone(current);
        degraded.pid = 0;
        degraded.pm2_env.status = 'launching';
        delete degraded.pm2_env.node_version;
        rows = [
          degraded,
          ...rows.filter((row) => row.name !== 'dexter-mcp'),
        ];
      }
      try {
        recoveryResult = await recoverPrivateRelease({
          runCommand,
          fetchImpl,
          pm2Home,
          commandEnvironment: {
            PATH: process.env.PATH,
            DEXTER_MCP_ENV_FILE: envFile,
          },
          healthTimeoutMs: 20,
          pm2CommandTimeoutMs: HARNESS_PM2_TIMEOUT_MS,
          pm2StartupTimeoutMs: HARNESS_PM2_STARTUP_TIMEOUT_MS,
          verifyPriorRestartability: async () => ({
            fixture: 'private-restart-proof',
          }),
          verifyRollbackInputs: async ({ row, priorProof }) => {
            assert.equal(row.name, 'dexter-mcp');
            assert.deepEqual(priorProof, {
              fixture: 'private-restart-proof',
            });
            events.push('recovery-verified-rollback-inputs');
            return true;
          },
          verifyDaemon: async () => {
            events.push('recovery-verified-pm2-daemon');
            return true;
          },
          verifyPm2Executable: async () => {
            if (removeJournalDuringRecoveryPreflight) {
              await rm(resolve(
                pm2Home,
                '.dexter-mcp-private-cutover-journal.json',
              ), { force: true });
            }
            return PRODUCTION_PM2_EXECUTABLE;
          },
          processAliveImpl: async () => false,
          processProofOptions: dynamicProc,
        });
      } catch (caught) {
        recoveryError = caught;
      }
    }
    const savedBytes = await readFile(resolve(pm2Home, 'dump.pm2'), 'utf8')
      .catch((readError) => readError?.code === 'ENOENT'
        ? null
        : Promise.reject(readError));
    const savedBackupBytes = await readFile(
      resolve(pm2Home, 'dump.pm2.bak'),
      'utf8',
    ).catch((readError) => readError?.code === 'ENOENT'
      ? null
      : Promise.reject(readError));
    const journalPath = resolve(
      pm2Home,
      '.dexter-mcp-private-cutover-journal.json',
    );
    const journalBytes = await readFile(journalPath, 'utf8').catch(
      (readError) => readError?.code === 'ENOENT'
        ? null
        : Promise.reject(readError),
    );
    return {
      error,
      events,
      eventsBeforeRecovery,
      result,
      recoveryError,
      recoveryResult,
      rows,
      initialSavedBytes,
      initialBackupBytes,
      journalBytes,
      savedBytes,
      savedBackupBytes,
      savedRows: savedBytes === null ? [] : JSON.parse(savedBytes),
      priorRows,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('private activation selects only dexter-mcp and preserves public OpenDexter', async () => {
  const result = await privateActivationHarness();
  assert.equal(result.error, undefined);
  assert.equal(result.result.health['dexter-mcp'].ok, true);
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-open-mcp').pid,
    result.priorRows.find((row) => row.name === 'dexter-open-mcp').pid,
  );
  assert.equal(result.events.includes('delete:68'), false);
  assert.ok(result.events.some((event) => event.endsWith(':--only:dexter-mcp')));
  assert.deepEqual(
    result.savedRows.map((row) => row.name).sort(),
    ['dexter-mcp', 'dexter-open-mcp', 'saved-only-worker'],
  );
  assert.equal(result.journalBytes, null);
});

test('private activation commits only with the exact prior backup dump', async () => {
  for (const candidateSaveBackupMode of ['missing', 'wrong']) {
    const result = await privateActivationHarness({
      candidateSaveBackupMode,
    });
    assert.match(
      result.error?.message ?? '',
      /private Dexter candidate failed; the exact prior state was restored/,
    );
    assert.equal(result.savedBytes, result.initialSavedBytes);
    assert.equal(result.savedBackupBytes, result.initialBackupBytes);
    assert.equal(result.journalBytes, null);
    assert.equal(
      result.rows.find((row) => row.name === 'dexter-mcp')
        .pm2_env.pm_cwd,
      result.priorRows.find((row) => row.name === 'dexter-mcp')
        .pm2_env.pm_cwd,
    );
  }
});

test('private candidate failure restores the prior process and saved definition', async () => {
  const result = await privateActivationHarness({ rejectCandidate: true });
  assert.match(
    result.error?.message ?? '',
    /private Dexter candidate failed; the exact prior state was restored/,
  );
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-open-mcp').pid,
    result.priorRows.find((row) => row.name === 'dexter-open-mcp').pid,
  );
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
    result.priorRows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
  );
  assert.equal(result.events.includes('resurrect'), false);
  assert.equal(
    result.events.filter((event) => event.startsWith('start:')).length,
    2,
  );
  assert.notEqual(
    result.rows.find((row) => row.name === 'dexter-mcp')
      .pm2_env.env.unique_id,
    result.priorRows.find((row) => row.name === 'dexter-mcp')
      .pm2_env.env.unique_id,
  );
  assert.ok(
    result.events.indexOf('verified-rollback-inputs')
      < result.events.findLastIndex((event) => event.startsWith('start:')),
  );
  assert.equal(result.savedBytes, result.initialSavedBytes);
  assert.equal(result.savedBackupBytes, result.initialBackupBytes);
  assert.equal(result.journalBytes, null);
});

test('private rollback handles absent and pre-IPC errored candidate starts', async () => {
  for (const candidateStartMode of [
    'absent-failure',
    'errored-failure',
    'pre-ipc-errored-failure',
  ]) {
    const result = await privateActivationHarness({ candidateStartMode });
    assert.match(
      result.error?.message ?? '',
      /private Dexter candidate failed; the exact prior state was restored/,
    );
    assert.equal(
      result.rows.find((row) => row.name === 'dexter-mcp')
        .pm2_env.pm_cwd,
      result.priorRows.find((row) => row.name === 'dexter-mcp')
        .pm2_env.pm_cwd,
    );
    if (candidateStartMode !== 'absent-failure') {
      assert.ok(result.events.includes('delete:69'));
    }
  }
});

test('private rollback follows one candidate PM2 id across restart drift', async () => {
  const result = await privateActivationHarness({
    rejectCandidate: true,
    evolveCandidateOnReject: true,
  });
  assert.match(
    result.error?.message ?? '',
    /private Dexter candidate failed; the exact prior state was restored/,
  );
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
    result.priorRows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
  );
});

test('private rollback re-proves inputs before start and binds application env', async () => {
  const swappedInput = await privateActivationHarness({
    rejectCandidate: true,
    rejectRollbackInputs: true,
  });
  assert.match(
    swappedInput.error?.message ?? '',
    /rollback could not be proven/,
  );
  assert.equal(
    swappedInput.events.filter((event) => event.startsWith('start:')).length,
    1,
  );
  assert.equal(
    swappedInput.rows.some((row) => row.name === 'dexter-mcp'),
    false,
  );

  const changedApplicationEnvironment = await privateActivationHarness({
    rejectCandidate: true,
    tamperRollbackApplicationEnvironment: true,
  });
  assert.match(
    changedApplicationEnvironment.error?.message ?? '',
    /rollback could not be proven/,
  );
  assert.equal(
    changedApplicationEnvironment.events.includes('verified-rollback-inputs'),
    true,
  );

  const changedConfig = await privateActivationHarness({
    rejectCandidate: true,
    mutateRollbackConfigDuringInputProof: true,
  });
  assert.match(changedConfig.error?.message ?? '', /rollback could not be proven/);
  assert.equal(
    changedConfig.events.filter((event) => event.startsWith('start:')).length,
    1,
  );
});

test('private failure restores an absent or private-free saved baseline exactly', async () => {
  for (const initialSavedMode of ['absent', 'without-private']) {
    const result = await privateActivationHarness({
      initialSavedMode,
      rejectCandidate: true,
    });
    assert.match(
      result.error?.message ?? '',
      /private Dexter candidate failed; the exact prior state was restored/,
    );
    assert.equal(result.savedBytes, result.initialSavedBytes);
    assert.equal(result.savedBackupBytes, result.initialBackupBytes);
    assert.equal(result.journalBytes, null);
    if (initialSavedMode === 'without-private') {
      assert.equal(
        result.savedRows.some((row) => row.name === 'dexter-mcp'),
        false,
      );
    }
  }
});

test('private pre-delete race leaves the replacement runtime untouched', async () => {
  const result = await privateActivationHarness({
    changePrivateBeforeDelete: true,
  });
  assert.match(
    result.error?.message ?? '',
    /private Dexter runtime changed before (?:cutover|deletion)/,
  );
  assert.equal(
    result.events.some((event) => event.startsWith('delete:')),
    false,
  );
  assert.equal(result.events.includes('resurrect'), false);
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pid,
    result.priorRows.find((row) => row.name === 'dexter-mcp').pid + 100,
  );
});

test('private post-jlist replacement is never deleted by mutable name', async () => {
  const result = await privateActivationHarness({
    replaceAfterTargetProof: true,
  });
  assert.match(
    result.error?.message ?? '',
    /rollback could not be proven/,
  );
  assert.ok(result.events.includes('delete:69'));
  assert.equal(result.events.includes('delete:82'), false);
  assert.equal(result.events.includes('resurrect'), false);
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pm_id,
    82,
  );
  assert.equal(result.savedBytes, result.initialSavedBytes);
  assert.notEqual(result.journalBytes, null);
  const journal = JSON.parse(result.journalBytes);
  assert.equal(
    journal.schema,
    'dexter-mcp-private-cutover-journal/v1',
  );
  assert.equal(journal.savedState.primary.present, true);
  assert.equal(journal.savedState.backup.present, true);
});

test('private recovery removes an exact candidate and restores both dumps', async () => {
  const result = await privateActivationHarness({
    failRollbackDelete: true,
    recoverAfterFailure: true,
    rejectCandidate: true,
  });
  assert.match(result.error?.message ?? '', /rollback could not be proven/);
  assert.equal(result.recoveryError, undefined);
  assert.deepEqual(result.recoveryResult, {
    recovered: true,
    service: 'dexter-mcp',
  });
  assert.equal(result.journalBytes, null);
  assert.equal(result.savedBytes, result.initialSavedBytes);
  assert.equal(result.savedBackupBytes, result.initialBackupBytes);
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
    result.priorRows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
  );
});

test('private recovery replaces a degraded pre-IPC prior generation', async () => {
  const result = await privateActivationHarness({
    degradePriorBeforeRecovery: true,
    recoverAfterFailure: true,
    replaceAfterTargetProof: true,
  });
  assert.match(result.error?.message ?? '', /rollback could not be proven/);
  assert.equal(result.recoveryError, undefined);
  assert.equal(result.recoveryResult?.recovered, true);
  const restored = result.rows.find((row) => row.name === 'dexter-mcp');
  assert.equal(restored.pm2_env.status, 'online');
  assert.equal(restored.pm2_env.pm_cwd, result.priorRows[0].pm2_env.pm_cwd);
  assert.equal(result.journalBytes, null);
});

test('private recovery refuses a journal cleared before lock acquisition', async () => {
  const result = await privateActivationHarness({
    failRollbackDelete: true,
    recoverAfterFailure: true,
    rejectCandidate: true,
    removeJournalDuringRecoveryPreflight: true,
  });
  assert.match(result.error?.message ?? '', /rollback could not be proven/);
  assert.equal(result.recoveryResult, undefined);
  assert.equal(result.recoveryError?.code, 'ENOENT');
  assert.equal(result.events.length, result.eventsBeforeRecovery);
  assert.equal(
    result.rows.find((row) => row.name === 'dexter-mcp').pm2_env.pm_cwd,
    '/sealed/releases/private-new',
  );
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
    omitDefaultInstancesInSavedDump: true,
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
  const successful = await activationHarness({
    includeUnrelated: true,
    candidateStartDelayMs: HARNESS_PM2_TIMEOUT_MS + 50,
  });
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
  for (const { args, options } of calls) {
    const expectedTimeout = args[0] === 'start' || args[0] === 'resurrect'
      ? HARNESS_PM2_STARTUP_TIMEOUT_MS
      : HARNESS_PM2_TIMEOUT_MS;
    assert.equal(options.timeout, expectedTimeout);
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

test('unrelated live changes do not block a service-scoped OpenDexter cutover', async () => {
  for (const rejectCandidate of [false, true]) {
    const result = await activationHarness({
      includeUnrelated: true,
      mutateLiveUnrelatedAfterCandidateStart: true,
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
      '4012',
    );
    assert.equal(
      result.savedRows.find((row) => row.name === 'other-service')
        .env.OTHER_PORT,
      '4010',
    );
    assert.equal(
      result.rows.find((row) => row.name === 'dexter-mcp').pid,
      902001,
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
      ['listen_timeout', 90_001],
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
  assert.deepEqual(partialResult.events, ['verified-widget-assets:pre', 'jlist']);

  const absentResult = await activationHarness({ initialRows: [] });
  assert.match(absentResult.error?.message ?? '', /explicit freshInstall/);
  assert.deepEqual(absentResult.events, ['verified-widget-assets:pre', 'jlist']);

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
  assert.deepEqual(
    staleSavedTarget.events,
    ['verified-widget-assets:pre', 'jlist'],
  );
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
