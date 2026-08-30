import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseEnv, promisify } from 'node:util';
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  resolve,
} from 'node:path';
import {
  DEFAULT_PM2_COMMAND_TIMEOUT_MS,
  DEFAULT_PM2_STARTUP_TIMEOUT_MS,
  PRODUCTION_NODE_EXECUTABLE,
  PRODUCTION_PM2_EXECUTABLE,
  runBoundedPm2Command,
  samePm2ProcessSnapshot,
  snapshotPm2EnvironmentNamespaces,
  snapshotPm2ProcessDefinition,
  snapshotUnrelatedPm2Processes,
} from '../../lib/open-release-pm2-safety.mjs';
import {
  reviewedRemoteGitSourceIdentity,
} from '../../lib/open-release-tooling.mjs';
import {
  publishAndVerifyOpenWidgetAssets,
  verifyPublicOpenWidgetAssets,
} from '../../lib/open-release-widget-assets.mjs';

const require = createRequire(import.meta.url);
const {
  LEGACY_OPEN_RELEASE_CONTRACT,
  LEGACY_PRIVATE_RELEASE_CONTRACT,
  OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
  OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES,
  OPEN_RELEASE_APPLICATION_NODE_SHA256,
  OPEN_RELEASE_APPLICATION_NODE_VERSION,
  SERVICE_NAMES,
  readSealedLegacyOpenRelease,
  readSealedOpenRelease,
  releaseIdentityForService,
} = require('../../lib/open-release-provenance.cjs');

const execFileAsync = promisify(execFile);
const PM2_STATUS_ONLINE = 'online';
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
const PRODUCTION_HOME = '/home/branchmanager';
const PRODUCTION_PM2_HOME = `${PRODUCTION_HOME}/.pm2`;
const PRODUCTION_PM2_PACKAGE_ROOT = '/usr/local/lib/node_modules/pm2';
const PRODUCTION_PM2_PACKAGE_JSON = `${PRODUCTION_PM2_PACKAGE_ROOT}/package.json`;
const PRODUCTION_PM2_CLI = `${PRODUCTION_PM2_PACKAGE_ROOT}/lib/binaries/CLI.js`;
const PRODUCTION_PM2_VERSION = '6.0.5';
const PRODUCTION_PM2_SHA256 =
  'bbb586713050b21d86aa41bde704a3a4776aa300ddcbd9710e81fa7c0089256d';
const PRODUCTION_PM2_PACKAGE_SHA256 =
  'd0269334e995c0e0f9c52bfc28654149ffc48ef43cf02db6e9e9f337ce7f4a59';
const PRODUCTION_PM2_CLI_SHA256 =
  '106cda22f755c29701742a5e7dc280e4e484a31c976e9f8c9c6afc8f31dde3bb';
const PRODUCTION_NODE_VERSION = 'v18.19.1';
const PRODUCTION_NODE_SHA256 =
  'f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d';
const LEGACY_PM2_DAEMON = Object.freeze({
  bootId: 'b8a72f74-0912-45c5-8dcf-a237492acf9f\n',
  cgroup: '0::/system.slice/pm2-branchmanager.service\n',
  executable:
    '/home/branchmanager/.nvm/versions/node/v20.19.1/bin/node',
  executableSha256:
    'fea3f6e1e5eb8622bf1af1b85a9384ad88c673674e4b7c6bd223ca1127d1e5e9',
  image: Object.freeze({
    dev: 66305,
    gid: 1001,
    ino: 1870520,
    mode: 0o100755,
    nlink: 1,
    size: 99831240,
    uid: 1001,
  }),
  pid: 2432040,
  startTimeTicks: '736087414',
});
const PM2_SYSTEMD_SERVICE = 'pm2-branchmanager.service';
const SYSTEMCTL_EXECUTABLE = '/usr/bin/systemctl';
const SYSTEMD_UNIT = '/etc/systemd/system/pm2-branchmanager.service';
const SYSTEMD_UMASK_DROP_IN =
  '/etc/systemd/system/pm2-branchmanager.service.d/10-umask.conf';
const SYSTEMD_ROOT_NODE_DROP_IN =
  '/etc/systemd/system/pm2-branchmanager.service.d/20-root-node.conf';
const LEGACY_PM2_SYSTEM_FILES = Object.freeze([
  Object.freeze({
    path: SYSTEMCTL_EXECUTABLE,
    sha256: 'e0d3d0e9444da1b2b58c792c3f5028b69f049b77d5ca17b3ec0d09f89117225b',
  }),
  Object.freeze({
    path: SYSTEMD_UNIT,
    sha256: 'cdc1563c1d7b3ac18eb0dda51547c4c59bc810e57dee93dbfdc98d59e7d43721',
  }),
  Object.freeze({
    path: SYSTEMD_UMASK_DROP_IN,
    sha256: '9e407d257aa91afd3bb98cbb2a571cbcc25f3ed631ef723ccb340c6de9c1c1d8',
  }),
  Object.freeze({
    path: SYSTEMD_ROOT_NODE_DROP_IN,
    sha256: '78f3f6c8bfd59928f22f66e856c0ed7427a900cf23527d639d88b6e2e12c79c0',
  }),
]);
const LEGACY_PM2_SYSTEMD_PROPERTIES = Object.freeze({
  ActiveState: 'active',
  ControlGroup: '/system.slice/pm2-branchmanager.service',
  DropInPaths: `${SYSTEMD_UMASK_DROP_IN} ${SYSTEMD_ROOT_NODE_DROP_IN}`,
  ExecReload: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 reload all ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  ExecStart: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 resurrect ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  ExecStop: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/lib/node_modules/pm2/bin/pm2 kill ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }',
  FragmentPath: SYSTEMD_UNIT,
  MainPID: String(LEGACY_PM2_DAEMON.pid),
  PIDFile: `${PRODUCTION_PM2_HOME}/pm2.pid`,
  SubState: 'running',
  Type: 'forking',
  User: 'branchmanager',
});
const LEGACY_PM2_REPORT_FIELDS = Object.freeze({
  argv: Object.freeze([
    LEGACY_PM2_DAEMON.executable,
    `${PRODUCTION_PM2_PACKAGE_ROOT}/lib/Daemon.js`,
  ]),
  argv0: LEGACY_PM2_DAEMON.executable,
  gid: 1001,
  node_version: '20.19.1',
  pm2_version: PRODUCTION_PM2_VERSION,
  uid: 1001,
  user: 'branchmanager',
});
const LEGACY_PM2_REPORT_PROBE = `
const pm2 = require(${JSON.stringify(PRODUCTION_PM2_PACKAGE_ROOT)});
pm2.Client.launchRPC((connectionError) => {
  if (connectionError) process.exit(2);
  pm2.Client.executeRemote('getReport', {}, (reportError, report) => {
    if (reportError || !report) process.exitCode = 3;
    else process.stdout.write(JSON.stringify({
      argv: report.argv,
      argv0: report.argv0,
      gid: report.gid,
      node_version: report.node_version,
      pm2_version: report.pm2_version,
      uid: report.uid,
      user: report.user,
    }));
    pm2.Client.close(() => process.exit());
  });
});
`;
const GOVERNED_SECRET = 'GOVERNED_AGENT_ACTIONS_HMAC_SECRET';
const PRESERVED_PRIVATE_SERVICE = 'dexter-mcp';
const LEGACY_OPEN_RELEASE_DIR =
  `/var/lib/dexter-mcp/releases/${LEGACY_OPEN_RELEASE_CONTRACT.sourceCommit}`;
const LEGACY_OPEN_ENTRYPOINT =
  `${LEGACY_OPEN_RELEASE_DIR}/${LEGACY_OPEN_RELEASE_CONTRACT.entrypoint}`;
const LEGACY_OPEN_INTERPRETER =
  '/home/branchmanager/.nvm/versions/node/v22.19.0/bin/node';
const LEGACY_OPEN_ENV_FILE =
  '/home/branchmanager/websites/dexter-mcp/.env';
const LEGACY_HEALTH_CLOCK_SKEW_MS = 5_000;
const FORBIDDEN_LOADER_ENV_KEYS = Object.freeze([
  'NODE_OPTIONS',
  'NODE_PATH',
  'PM2_NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
]);
const RELEASE_ENV_KEYS = Object.freeze({
  commit: 'DEXTER_MCP_RELEASE_COMMIT',
  tree: 'DEXTER_MCP_RELEASE_TREE',
  artifactManifestSha256: 'DEXTER_MCP_RELEASE_MANIFEST_SHA256',
  descriptorSha256: 'DEXTER_MCP_DESCRIPTOR_SHA256',
  packageVersion: 'DEXTER_MCP_RELEASE_PACKAGE_VERSION',
  service: 'DEXTER_MCP_RELEASE_SERVICE',
});
const ECOSYSTEM_REMOVED_ENV_KEYS = Object.freeze([
  ...FORBIDDEN_LOADER_ENV_KEYS,
  'PWD',
  'PM2_HOME',
  'DEXTER_MCP_ENV_FILE',
  'DEXTER_MCP_ENV_FILE_SHA256',
  ...Object.values(RELEASE_ENV_KEYS),
  'DEXTER_MCP_EXPECTED_ROSTER_JSON',
  'TOKEN_AI_MCP_PROFILE',
  'TOKEN_AI_MCP_TOOLSETS',
  'version',
]);

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON`, { cause: error });
  }
}

export function parsePm2ProcessList(text) {
  const parsed = parseJson(text, 'pm2 jlist');
  if (!Array.isArray(parsed)) throw new Error('pm2 jlist is not an array');
  return parsed;
}

function exactServiceRows(rows, services = SERVICE_NAMES) {
  const selected = rows.filter((row) => services.includes(row?.name));
  for (const service of services) {
    if (selected.filter((row) => row.name === service).length !== 1) {
      throw new Error(`PM2 must contain exactly one ${service} process`);
    }
  }
  return Object.fromEntries(selected.map((row) => [row.name, row]));
}

function processMetadata(row) {
  return row?.pm2_env ?? row ?? {};
}

function processEnvironment(row) {
  const metadata = processMetadata(row);
  const nested = metadata?.env && typeof metadata.env === 'object'
    ? metadata.env
    : {};
  const topLevel = row?.env && typeof row.env === 'object' ? row.env : {};
  // PM2 jlist versions disagree about whether environment variables are direct
  // pm2_env properties or nested under env. Merge both representations.
  return { ...metadata, ...nested, ...topLevel };
}

function declaredProcessEnvironment(row, name) {
  const metadata = processMetadata(row);
  const nested = metadata?.env && typeof metadata.env === 'object'
    ? metadata.env
    : {};
  const topLevel = row?.env && typeof row.env === 'object' ? row.env : {};
  const environment = { ...nested, ...topLevel };
  // These entries are injected by PM2 and are not part of the ecosystem's
  // source-owned application environment. PM2_HOME is bound separately.
  for (const key of ['unique_id', 'NODE_APP_INSTANCE', name, 'PM2_HOME']) {
    delete environment[key];
  }
  if (Object.values(environment).some((value) => typeof value !== 'string')) {
    throw new Error(`PM2 ${name} declared environment is invalid`);
  }
  return environment;
}

function environmentSha256(environment) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJson(environment)))
    .digest('hex');
}

function expectedRuntimePath() {
  return [
    dirname(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE),
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ].filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join(delimiter);
}

function expectedCandidateDeclaredEnvironment({
  release,
  applicationEnvironment,
  envFile,
  envFileSha256,
  name,
}) {
  const environment = { ...applicationEnvironment };
  for (const key of ECOSYSTEM_REMOVED_ENV_KEYS) delete environment[key];
  const releaseIdentity = releaseIdentityForService(release, name);
  return {
    ...environment,
    PATH: expectedRuntimePath(),
    HOME: '/home/branchmanager',
    NODE_ENV: 'production',
    version: release.provenance.packageVersion,
    DEXTER_MCP_ENV_FILE: envFile,
    DEXTER_MCP_ENV_FILE_SHA256: envFileSha256,
    DEXTER_MCP_RELEASE_COMMIT: releaseIdentity.commit,
    DEXTER_MCP_RELEASE_TREE: releaseIdentity.tree,
    DEXTER_MCP_RELEASE_MANIFEST_SHA256:
      releaseIdentity.artifactManifestSha256,
    DEXTER_MCP_DESCRIPTOR_SHA256: releaseIdentity.descriptorSha256,
    DEXTER_MCP_RELEASE_PACKAGE_VERSION: releaseIdentity.packageVersion,
    DEXTER_MCP_RELEASE_SERVICE: releaseIdentity.service,
    DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(
      release.provenance.rosters[name],
    ),
  };
}

function processField(row, key) {
  return processMetadata(row)?.[key] ?? row?.[key];
}

function rawProcessField(row, key) {
  const metadata = processMetadata(row);
  return Object.hasOwn(metadata, key) ? metadata[key] : row?.[key];
}

function exactPm2EnvironmentNamespaceIdentity(name, row) {
  const environment = processEnvironment(row);
  const metadata = processMetadata(row);
  const declaredEnvironment = metadata?.env
    && typeof metadata.env === 'object'
    ? metadata.env
    : {};
  const versionIsDeclared = Object.hasOwn(declaredEnvironment, 'version');
  const pm2Home = nullableString(environment.PM2_HOME);
  const packageVersion = nullableString(processField(row, 'version'));
  const runtimePmId = row?.pm_id ?? processField(row, 'pm_id');
  const errorLogPrefix = pm2Home === null
    ? null
    : resolve(pm2Home, 'logs', `${name}-error-`);
  const errorLog = nullableString(environment.pm_err_log_path);
  const outputLog = nullableString(environment.pm_out_log_path);
  const encodedPmId = errorLogPrefix !== null
    && errorLog?.startsWith(errorLogPrefix)
    && errorLog.endsWith('.log')
    ? errorLog.slice(errorLogPrefix.length, -4)
    : '';
  const logPmId = /^\d+$/.test(encodedPmId) ? Number(encodedPmId) : null;
  const pmId = Number.isInteger(runtimePmId) ? runtimePmId : logPmId;
  if (
    !Number.isInteger(pmId)
    || pmId < 0
    || pm2Home === null
    || packageVersion === null
    || (runtimePmId !== undefined && runtimePmId !== pmId)
    || outputLog !== resolve(
      pm2Home,
      'logs',
      `${name}-out-${pmId}.log`,
    )
  ) {
    throw new Error(`PM2 ${name} environment namespace identity is incomplete`);
  }
  return snapshotPm2EnvironmentNamespaces(row, {
    expectedDeclaredOnlyKeys: ['unique_id', name],
    expectedEffectiveOnly: {
      NODE_APP_INSTANCE: 0,
      autostart: true,
      km_link: false,
      node_version: process.versions.node,
      pm_err_log_path: resolve(
        pm2Home,
        'logs',
        `${name}-error-${pmId}.log`,
      ),
      pm_out_log_path: resolve(
        pm2Home,
        'logs',
        `${name}-out-${pmId}.log`,
      ),
      pmx: true,
      ...(versionIsDeclared ? {} : { version: packageVersion }),
      vizion_running: false,
    },
  });
}

function livePm2RuntimeIdentity(row, label, { expectedPmId } = {}) {
  const pmId = row?.pm_id ?? processField(row, 'pm_id');
  const pid = row?.pid;
  const restartTime = processField(row, 'restart_time');
  const unstableRestarts = processField(row, 'unstable_restarts');
  if (
    processField(row, 'status') !== PM2_STATUS_ONLINE
    || !Number.isInteger(pmId)
    || pmId < 0
    || (expectedPmId !== undefined && pmId !== expectedPmId)
    || !Number.isInteger(pid)
    || pid <= 0
    || !Number.isInteger(restartTime)
    || restartTime < 0
    || !Number.isInteger(unstableRestarts)
    || unstableRestarts < 0
  ) {
    throw new Error(`${label} PM2 runtime identity is not exact`);
  }
  return Object.freeze({ pmId, pid, restartTime, unstableRestarts });
}

function nullableString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function exactEnvironmentValue(env, key) {
  return env[key] === undefined ? null : String(env[key]);
}

function exactStringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`PM2 ${label} is invalid`);
  }
  return [...value];
}

function verifyPrivateExecutionArgumentsAreEmpty(row, label) {
  const nodeArgs = rawProcessField(row, 'node_args');
  const scriptArgs = rawProcessField(row, 'args');
  const interpreterArgs = rawProcessField(row, 'interpreter_args');
  if (
    !Array.isArray(nodeArgs)
    || nodeArgs.length !== 0
    || !(
      scriptArgs === undefined
      || scriptArgs === null
      || (Array.isArray(scriptArgs) && scriptArgs.length === 0)
    )
    || !(
      interpreterArgs === undefined
      || interpreterArgs === null
    )
  ) {
    throw new Error(`${label} execution arguments are not exactly empty`);
  }
}

function exactRosterFromEnvironment(env) {
  const encoded = nullableString(env.DEXTER_MCP_EXPECTED_ROSTER_JSON);
  if (encoded === null) return null;
  const roster = parseJson(encoded, 'PM2 expected roster');
  if (
    !Array.isArray(roster)
    || roster.some((name) => typeof name !== 'string')
    || new Set(roster).size !== roster.length
  ) {
    throw new Error('PM2 expected roster is invalid');
  }
  return roster;
}

function expectedHealthPort(name, row) {
  const env = processEnvironment(row);
  const value = name === 'dexter-mcp'
    ? env.TOKEN_AI_MCP_PORT ?? 3930
    : env.OPEN_MCP_PORT ?? 3931;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ${name} health port`);
  }
  return port;
}

function processIdentityWithoutNamespaceProof(name, row) {
  const env = processEnvironment(row);
  const release = Object.fromEntries(Object.entries(RELEASE_ENV_KEYS).map(
    ([field, key]) => [field, nullableString(env[key])],
  ));
  const rawInstances = processField(row, 'instances');
  return {
    cwd: nullableString(processField(row, 'pm_cwd')),
    script: nullableString(processField(row, 'pm_exec_path')),
    interpreter: nullableString(processField(row, 'exec_interpreter')),
    port: expectedHealthPort(name, row),
    profile: nullableString(env.TOKEN_AI_MCP_PROFILE),
    toolsets: nullableString(env.TOKEN_AI_MCP_TOOLSETS),
    envFile: nullableString(env.DEXTER_MCP_ENV_FILE),
    envFileSha256: nullableString(env.DEXTER_MCP_ENV_FILE_SHA256),
    pm2Home: nullableString(env.PM2_HOME),
    nodeEnv: nullableString(env.NODE_ENV),
    environmentSha256: environmentSha256(
      declaredProcessEnvironment(row, name),
    ),
    processPolicy: {
      name: nullableString(row?.name ?? processField(row, 'name')),
      namespace: nullableString(processField(row, 'namespace')),
      configuredCwd: nullableString(processField(row, 'cwd')),
      execMode: nullableString(processField(row, 'exec_mode')),
      instances: rawInstances === undefined || rawInstances === null
        ? 1
        : Number(rawInstances),
      autorestart: processField(row, 'autorestart'),
      waitReady: processField(row, 'wait_ready'),
      maxRestarts: Number(processField(row, 'max_restarts')),
      listenTimeout: Number(processField(row, 'listen_timeout')),
      killTimeout: Number(processField(row, 'kill_timeout')),
      nodeArgs: exactStringArray(processField(row, 'node_args'), 'node args'),
      scriptArgs: exactStringArray(processField(row, 'args'), 'script args'),
      filterEnvironment: exactStringArray(
        processField(row, 'filter_env'),
        'filter environment',
      ),
      instanceVariable: nullableString(processField(row, 'instance_var')),
      username: nullableString(processField(row, 'username')),
      packageVersion: nullableString(processField(row, 'version')),
    },
    forbiddenLoaderEnvironment: Object.fromEntries(
      FORBIDDEN_LOADER_ENV_KEYS.map((key) => [
        key,
        exactEnvironmentValue(env, key),
      ]),
    ),
    roster: exactRosterFromEnvironment(env),
    release: Object.values(release).every((value) => value === null)
      ? null
      : release,
  };
}

export function stableProcessIdentity(name, row) {
  exactPm2EnvironmentNamespaceIdentity(name, row);
  return processIdentityWithoutNamespaceProof(name, row);
}

function privateGenerationIdentity(row) {
  if (row?.name !== 'dexter-mcp') {
    throw new Error('private generation identity requires dexter-mcp');
  }
  const metadata = processMetadata(row);
  const declared = {
    ...(metadata?.env && typeof metadata.env === 'object'
      ? metadata.env
      : {}),
    ...(row?.env && typeof row.env === 'object' ? row.env : {}),
  };
  const uniqueId = nullableString(declared.unique_id);
  if (uniqueId === null) {
    throw new Error('private generation identity has no PM2 unique id');
  }
  return canonicalJson({
    uniqueId,
    declaredEnvironmentKeyCount: Object.keys(declared).length,
    declaredEnvironmentSha256: environmentSha256(declared),
    process: processIdentityWithoutNamespaceProof('dexter-mcp', row),
    pm2Definition: snapshotPm2ProcessDefinition(row),
  });
}

function savedProcessIdentity(name, row) {
  return {
    ...stableProcessIdentity(name, row),
    pm2EnvironmentNamespaces: exactPm2EnvironmentNamespaceIdentity(name, row),
    pm2Definition: snapshotPm2ProcessDefinition(row),
  };
}

function expectedCandidateIdentity(
  release,
  applicationEnvironment,
  envFile,
  envFileSha256,
  pm2Home,
  name,
) {
  const releaseIdentity = releaseIdentityForService(release, name);
  const declaredEnvironment = expectedCandidateDeclaredEnvironment({
    release,
    applicationEnvironment,
    envFile,
    envFileSha256,
    name,
  });
  return {
    cwd: release.releaseDir,
    script: resolve(release.releaseDir, release.provenance.entrypoints[name]),
    interpreter: OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
    port: Number(name === 'dexter-mcp'
      ? applicationEnvironment.TOKEN_AI_MCP_PORT ?? 3930
      : applicationEnvironment.OPEN_MCP_PORT ?? 3931),
    profile: null,
    toolsets: null,
    envFile,
    envFileSha256,
    pm2Home,
    nodeEnv: 'production',
    environmentSha256: environmentSha256(declaredEnvironment),
    processPolicy: {
      name,
      namespace: 'default',
      configuredCwd: release.releaseDir,
      execMode: 'fork_mode',
      instances: 1,
      autorestart: true,
      waitReady: true,
      maxRestarts: 10,
      listenTimeout: 90_000,
      killTimeout: 10_000,
      nodeArgs: [],
      scriptArgs: [],
      filterEnvironment: [''],
      instanceVariable: 'NODE_APP_INSTANCE',
      username: 'branchmanager',
      packageVersion: release.provenance.packageVersion,
    },
    forbiddenLoaderEnvironment: Object.fromEntries(
      FORBIDDEN_LOADER_ENV_KEYS.map((key) => [key, null]),
    ),
    roster: release.provenance.rosters[name],
    release: releaseIdentity,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(
      (key) => [key, canonicalJson(value[key])],
    ));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left))
    === JSON.stringify(canonicalJson(right));
}

function protectedEnvironmentFileIdentity(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    nlink: stat.nlink,
    uid: stat.uid,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function validProtectedEnvironmentStat(stat) {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1
    && stat.uid === process.getuid()
    && (stat.mode & 0o7777) === 0o600;
}

async function readStableProtectedEnvironment({
  configuredPath,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
}) {
  const before = await lstatImpl(configuredPath);
  if (!validProtectedEnvironmentStat(before)) {
    throw new Error(
      'DEXTER_MCP_ENV_FILE must be an absolute, owned mode-0600 regular file with one link',
    );
  }
  const canonicalPath = await realpathImpl(configuredPath);
  const bytes = await readFileImpl(canonicalPath);
  const after = await lstatImpl(canonicalPath);
  if (
    !validProtectedEnvironmentStat(after)
    || await realpathImpl(canonicalPath) !== canonicalPath
    || !sameJson(
      protectedEnvironmentFileIdentity(before),
      protectedEnvironmentFileIdentity(after),
    )
  ) {
    throw new Error('DEXTER_MCP_ENV_FILE changed during verification');
  }
  return {
    envFile: canonicalPath,
    envFileBytes: bytes,
    envFileSha256: createHash('sha256').update(bytes).digest('hex'),
    envFileIdentity: protectedEnvironmentFileIdentity(after),
  };
}

async function verifyProtectedEnvironmentStillExact(preflight) {
  const current = await readStableProtectedEnvironment({
    configuredPath: preflight.envFile,
  });
  if (
    current.envFile !== preflight.envFile
    || current.envFileSha256 !== preflight.envFileSha256
    || !sameJson(current.envFileIdentity, preflight.envFileIdentity)
  ) {
    throw new Error('DEXTER_MCP_ENV_FILE changed after activation preflight');
  }
  return true;
}

function exactPriorReleaseIdentity(name, identity) {
  return identity !== null
    && sameJson(Object.keys(identity).sort(), Object.keys(RELEASE_ENV_KEYS).sort())
    && /^[a-f0-9]{40}$/.test(identity.commit ?? '')
    && /^[a-f0-9]{40}$/.test(identity.tree ?? '')
    && /^[a-f0-9]{64}$/.test(identity.artifactManifestSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(identity.descriptorSha256 ?? '')
    && typeof identity.packageVersion === 'string'
    && identity.packageVersion.length > 0
    && identity.packageVersion.length <= 128
    && identity.service === name;
}

async function processExists(pid) {
  try {
    await access(`/proc/${pid}`);
    return true;
  } catch {
    return false;
  }
}

function commandLineMatches(commandLine, nodeExecutable, expectedScript) {
  const acceptedNodeNames = new Set([
    'node',
    basename(nodeExecutable),
    nodeExecutable,
    process.execPath,
  ]);
  if (
    commandLine.length === 2
    && acceptedNodeNames.has(commandLine[0])
    && commandLine[1] === expectedScript
  ) return true;
  if (commandLine.length !== 1) return false;
  return [...acceptedNodeNames].some(
    (nodeName) => commandLine[0] === `${nodeName} ${expectedScript}`,
  );
}

async function readKernelIdentity({
  pid,
  expectedScript,
  nodeExecutable,
  readlinkImpl,
  readFileImpl,
  realpathImpl,
}) {
  const cwd = await realpathImpl(await readlinkImpl(`/proc/${pid}/cwd`));
  const executable = await realpathImpl(
    await readlinkImpl(`/proc/${pid}/exe`),
  );
  const commandLine = (await readFileImpl(`/proc/${pid}/cmdline`, 'utf8'))
    .split('\0')
    .filter(Boolean);
  const statText = await readFileImpl(`/proc/${pid}/stat`, 'utf8');
  const statTail = statText.slice(statText.lastIndexOf(') ') + 2).trim()
    .split(/\s+/);
  const startTimeTicks = statTail[19];
  if (
    executable !== nodeExecutable
    || !commandLineMatches(commandLine, nodeExecutable, expectedScript)
    || !/^[1-9][0-9]*$/.test(startTimeTicks ?? '')
  ) {
    throw new Error('kernel executable or command line mismatch');
  }
  return { cwd, executable, commandLine, startTimeTicks };
}

export async function readLoopbackHealth(
  name,
  row,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('health timeout must be a positive integer');
  }
  const port = expectedHealthPort(name, row);
  const controller = new AbortController();
  let timeout;
  const operation = (async () => {
    const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status !== 200) {
      throw new Error(`${name} health returned HTTP ${response.status}`);
    }
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`${name} health returned an invalid body`);
    }
    return body;
  })();
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`${name} health timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export async function preflightOpenReleaseCandidate({
  release,
  services = SERVICE_NAMES,
  commandEnvironment,
  pm2Home = defaultPm2Home(),
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
}) {
  if (
    release?.provenance?.nodeVersion !== process.version
    || release.provenance.nodeVersion !== OPEN_RELEASE_APPLICATION_NODE_VERSION
  ) {
    throw new Error('Dexter MCP release Node runtime does not match this host');
  }
  if (typeof pm2Home !== 'string' || !isAbsolute(pm2Home)) {
    throw new Error('PM2_HOME must be one explicit absolute path');
  }
  if (pm2Home !== PRODUCTION_PM2_HOME) {
    throw new Error(`PM2_HOME must be exactly ${PRODUCTION_PM2_HOME}`);
  }
  if (
    commandEnvironment?.PM2_HOME !== undefined
    && commandEnvironment.PM2_HOME !== PRODUCTION_PM2_HOME
  ) {
    throw new Error(`release command PM2_HOME must be exactly ${PRODUCTION_PM2_HOME}`);
  }
  for (const key of FORBIDDEN_LOADER_ENV_KEYS) {
    if (commandEnvironment?.[key] !== undefined) {
      throw new Error(`${key} is forbidden in the release command environment`);
    }
  }
  const configuredEnvFile = commandEnvironment?.DEXTER_MCP_ENV_FILE?.trim();
  if (!configuredEnvFile || !isAbsolute(configuredEnvFile)) {
    throw new Error(
      'DEXTER_MCP_ENV_FILE must be an absolute, owned mode-0600 regular file with one link',
    );
  }
  const {
    envFile,
    envFileBytes,
    envFileSha256,
    envFileIdentity,
  } = await readStableProtectedEnvironment({
    configuredPath: configuredEnvFile,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  const applicationEnvironment = parseEnv(envFileBytes.toString('utf8'));
  if (Object.hasOwn(applicationEnvironment, 'PM2_HOME')) {
    throw new Error('PM2_HOME is forbidden in DEXTER_MCP_ENV_FILE');
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'PM2_NODE_OPTIONS',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'LD_AUDIT',
  ]) {
    if (Object.hasOwn(applicationEnvironment, key)) {
      throw new Error(`${key} is forbidden in DEXTER_MCP_ENV_FILE`);
    }
  }
  const governedSecret = String(applicationEnvironment[GOVERNED_SECRET] ?? '')
    .trim();
  if (Buffer.byteLength(governedSecret, 'utf8') < 32) {
    throw new Error(`${GOVERNED_SECRET} must contain at least 32 UTF-8 bytes`);
  }
  // Deliberately do not accept INTERNAL_DEXTERCARD_HMAC_SECRET as a fallback.
  applicationEnvironment[GOVERNED_SECRET] = governedSecret;
  if (
    !Array.isArray(services)
    || services.length === 0
    || new Set(services).size !== services.length
    || services.some((name) => (
      !Object.hasOwn(release?.provenance?.entrypoints ?? {}, name)
      || !Object.hasOwn(release?.provenance?.rosters ?? {}, name)
    ))
  ) {
    throw new Error('candidate preflight requires exact attested services');
  }
  if (services.includes('dexter-mcp')) {
    for (const key of ['TOKEN_AI_MCP_PROFILE', 'TOKEN_AI_MCP_TOOLSETS']) {
      if (String(applicationEnvironment[key] ?? '').trim() !== '') {
        throw new Error(`${key} must be empty for the sealed private roster`);
      }
    }
  }
  const expectedProcesses = Object.fromEntries(services.map((name) => [
    name,
    expectedCandidateIdentity(
      release,
      applicationEnvironment,
      envFile,
      envFileSha256,
      resolve(pm2Home),
      name,
    ),
  ]));
  for (const [name, expected] of Object.entries(expectedProcesses)) {
    if (!Number.isInteger(expected.port) || expected.port < 1 || expected.port > 65_535) {
      throw new Error(`invalid ${name} health port`);
    }
  }
  return Object.freeze({
    envFile,
    envFileSha256,
    envFileIdentity: Object.freeze(envFileIdentity),
    expectedProcesses,
  });
}

export async function verifyRunningOpenReleasePair({
  release,
  rows,
  expectedProcesses,
  services = SERVICE_NAMES,
  fetchImpl = fetch,
  readlinkImpl = readlink,
  readFileImpl = readFile,
  realpathImpl = realpath,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
}) {
  if (
    !expectedProcesses
    || !sameJson(Object.keys(expectedProcesses).sort(), [...services].sort())
  ) {
    throw new Error('candidate proof requires exact preflight process identities');
  }
  const byName = exactServiceRows(rows, services);
  const nodeExecutable = await realpathImpl(
    OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
  );
  const health = {};
  for (const name of services) {
    const row = byName[name];
    const expectedScript = resolve(
      release.releaseDir,
      release.provenance.entrypoints[name],
    );
    const pid = row.pid;
    if (
      processField(row, 'status') !== PM2_STATUS_ONLINE
      || !Number.isInteger(pid)
      || pid <= 0
      || Number(processField(row, 'restart_time') ?? 0) !== 0
      || await realpathImpl(processField(row, 'pm_cwd') ?? '')
        !== release.releaseDir
      || await realpathImpl(processField(row, 'pm_exec_path') ?? '')
        !== expectedScript
      || await realpathImpl(processField(row, 'exec_interpreter') ?? '')
        !== nodeExecutable
    ) {
      throw new Error(`${name} PM2 identity does not match the candidate`);
    }

    const actualProcess = stableProcessIdentity(name, row);
    const expectedProcess = expectedProcesses[name];
    if (!sameJson(actualProcess, expectedProcess)) {
      throw new Error(`${name} PM2 environment identity does not match the candidate`);
    }

    const kernel = await readKernelIdentity({
      pid,
      expectedScript,
      nodeExecutable,
      readlinkImpl,
      readFileImpl,
      realpathImpl,
    });
    if (kernel.cwd !== release.releaseDir) {
      throw new Error(`${name} kernel identity does not match the candidate`);
    }

    const body = await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    );
    const identity = releaseIdentityForService(release, name);
    if (
      body.ok !== true
      || body.service !== name
      || body.port !== expectedHealthPort(name, row)
      || !sameJson(body.release, identity)
      || !sameJson(body.tools, release.provenance.rosters[name])
    ) {
      throw new Error(`${name} health identity or roster mismatch`);
    }
    health[name] = body;
  }
  return { byName, health };
}

function stablePriorHealth(body) {
  return {
    ok: body?.ok,
    name: body?.name ?? null,
    service: body?.service ?? null,
    port: body?.port ?? null,
    tools: body?.tools ?? null,
    release: body?.release ?? null,
    auth: body?.auth ?? null,
    toolAuth: body?.toolAuth ?? null,
    walletAndPaymentScope: body?.walletAndPaymentScope ?? null,
  };
}

function exactLegacyOpenHealth(body, {
  requestStartedAt,
  responseReceivedAt,
} = {}) {
  const keys = body && typeof body === 'object' && !Array.isArray(body)
    ? Object.keys(body).sort()
    : [];
  const timestamp = new Date(body?.timestamp);
  return (
    sameJson(keys, [...LEGACY_OPEN_RELEASE_CONTRACT.healthKeys].sort())
    && body.ok === true
    && body.name === 'OpenDexter'
    && sameJson(body.tools, LEGACY_OPEN_RELEASE_CONTRACT.roster)
    && body.auth === 'optional'
    && body.toolAuth === 'mixed'
    && body.walletAndPaymentScope === 'vault'
    && Number.isInteger(body.sessions)
    && body.sessions >= 0
    && Number.isInteger(body.boundSessions)
    && body.boundSessions >= 0
    && body.boundSessions <= body.sessions
    && typeof body.rssMb === 'number'
    && Number.isFinite(body.rssMb)
    && body.rssMb >= 0
    && typeof body.timestamp === 'string'
    && !Number.isNaN(timestamp.valueOf())
    && timestamp.toISOString() === body.timestamp
    && Number.isFinite(requestStartedAt)
    && Number.isFinite(responseReceivedAt)
    && timestamp.valueOf() >= requestStartedAt - LEGACY_HEALTH_CLOCK_SKEW_MS
    && timestamp.valueOf() <= responseReceivedAt + LEGACY_HEALTH_CLOCK_SKEW_MS
  );
}

export async function verifyCapturedPriorOpenReleaseHealth({
  prior,
  rows,
  fetchImpl = fetch,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
}) {
  const byName = exactServiceRows(rows);
  for (const name of SERVICE_NAMES) {
    const expected = prior?.[name];
    const row = byName[name];
    if (
      !expected
      || !sameJson(stableProcessIdentity(name, row), expected.process)
      || !sameJson(savedProcessIdentity(name, row), expected.savedProcess)
      || !sameJson(
        livePm2RuntimeIdentity(row, `final prior ${name}`),
        expected.runtime,
      )
    ) {
      throw new Error(`final prior ${name} PM2 identity changed`);
    }
    const requestStartedAt = Date.now();
    const body = await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    );
    const responseReceivedAt = Date.now();
    const matches = expected.legacy
      ? exactLegacyOpenHealth(body, {
        requestStartedAt,
        responseReceivedAt,
      })
      : sameJson(stablePriorHealth(body), expected.health);
    if (!matches) {
      throw new Error(`final prior ${name} health identity changed`);
    }
  }
  return true;
}

async function verifyLegacySourceAdvertisement(
  sourceIdentity,
  remoteSourceIdentityImpl,
) {
  const proof = await remoteSourceIdentityImpl({
    remote: sourceIdentity.canonicalRemote,
    ref: sourceIdentity.canonicalRef,
    commit: sourceIdentity.commit,
    tree: sourceIdentity.tree,
    archiveSha256: sourceIdentity.archiveSha256,
  });
  const expected = {
    remote: sourceIdentity.canonicalRemote,
    ref: sourceIdentity.canonicalRef,
    commit: sourceIdentity.commit,
    tree: sourceIdentity.tree,
    archiveSha256: sourceIdentity.archiveSha256,
  };
  if (!sameJson(proof, expected)) {
    throw new Error('prior dexter-open-mcp canonical source proof mismatch');
  }
  return Object.freeze(expected);
}

function legacyProcessIdentityIsExact(name, identity, runtime, row) {
  const policy = identity.processPolicy;
  return name === 'dexter-open-mcp'
    && runtime.pmId > 0
    && runtime.restartTime === 0
    && runtime.unstableRestarts === 0
    && identity.release === null
    && identity.roster === null
    && identity.envFileSha256 === null
    && identity.profile === null
    && identity.toolsets === null
    && identity.cwd === LEGACY_OPEN_RELEASE_DIR
    && identity.script === LEGACY_OPEN_ENTRYPOINT
    && identity.interpreter === LEGACY_OPEN_INTERPRETER
    && identity.port === 3931
    && identity.envFile === LEGACY_OPEN_ENV_FILE
    && identity.pm2Home === PRODUCTION_PM2_HOME
    && identity.nodeEnv === 'production'
    && policy.name === 'dexter-open-mcp'
    && policy.namespace === 'default'
    && policy.configuredCwd === LEGACY_OPEN_RELEASE_DIR
    && policy.execMode === 'fork_mode'
    && policy.instances === 1
    && policy.autorestart === true
    && policy.waitReady === undefined
    && policy.maxRestarts === 10
    && Number.isNaN(policy.listenTimeout)
    && Number.isNaN(policy.killTimeout)
    && sameJson(policy.nodeArgs, [])
    && sameJson(policy.scriptArgs, [])
    && sameJson(policy.filterEnvironment, [''])
    && policy.instanceVariable === 'NODE_APP_INSTANCE'
    && policy.username === 'branchmanager'
    && policy.packageVersion === LEGACY_OPEN_RELEASE_CONTRACT.packageVersion
    && (
      rawProcessField(row, 'instances') === undefined
      || rawProcessField(row, 'instances') === 1
    )
    && processField(row, 'wait_ready') === undefined
    && processField(row, 'listen_timeout') === undefined
    && processField(row, 'kill_timeout') === undefined
    && processField(row, 'args') === undefined
    && Object.values(identity.forbiddenLoaderEnvironment)
      .every((value) => value === null);
}

const LEGACY_INJECTED_ENVIRONMENT_KEYS = new Set([
  'DEXTER_MCP_ENV_FILE',
  'HOME',
  'NODE_ENV',
  'PATH',
  'PM2_HOME',
  'unique_id',
  'dexter-mcp',
  'dexter-open-mcp',
]);

function verifyLegacyPersistedEnvironment(row, environmentBytes, {
  label = 'prior dexter-open-mcp',
  persistedEnvironmentKeys,
  environmentFileKeys,
} = {}) {
  const persisted = exactPersistedEnvironment(row);
  const current = parseEnv(environmentBytes.toString('utf8'));
  if (
    persistedEnvironmentKeys !== undefined
    && !sameJson(
      Object.keys(persisted).sort(),
      [...persistedEnvironmentKeys].sort(),
    )
  ) {
    throw new Error(`${label} persisted environment keys changed`);
  }
  if (
    environmentFileKeys !== undefined
    && !sameJson(
      Object.keys(current).sort(),
      [...environmentFileKeys].sort(),
    )
  ) {
    throw new Error(`${label} environment-file keys changed`);
  }
  const persistedApplicationKeys = new Set();
  for (const [key, value] of Object.entries(persisted)) {
    if (LEGACY_INJECTED_ENVIRONMENT_KEYS.has(key)) continue;
    persistedApplicationKeys.add(key);
    if (!Object.hasOwn(current, key) || current[key] !== String(value)) {
      throw new Error(
        `${label} persisted environment does not match ${key}`,
      );
    }
  }
  const additions = Object.keys(current).filter(
    (key) => !persistedApplicationKeys.has(key),
  );
  if (
    persistedApplicationKeys.size !== 63
    || !sameJson(additions, [GOVERNED_SECRET])
    || Object.keys(current).length !== 64
  ) {
    throw new Error(`${label} environment has an unapproved addition`);
  }
  if (Object.hasOwn(current, GOVERNED_SECRET)) {
    const secret = current[GOVERNED_SECRET];
    if (
      secret !== secret.trim()
      || Buffer.byteLength(secret, 'utf8') < 32
    ) {
      throw new Error(`${label} ${GOVERNED_SECRET} is invalid`);
    }
  }
  return current;
}

export async function capturePriorOpenReleasePair(
  rows,
  fetchImpl = fetch,
  {
    readlinkImpl = readlink,
    readFileImpl = readFile,
    realpathImpl = realpath,
    lstatImpl = lstat,
    environmentReadFileImpl = readFile,
    readLegacyReleaseImpl = readSealedLegacyOpenRelease,
    remoteSourceIdentityImpl = reviewedRemoteGitSourceIdentity,
    healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  } = {},
) {
  const byName = exactServiceRows(rows);
  const processes = {};
  for (const name of SERVICE_NAMES) {
    const row = byName[name];
    const processIdentity = stableProcessIdentity(name, row);
    const runtime = livePm2RuntimeIdentity(row, `prior ${name}`);
    const isLegacy = legacyProcessIdentityIsExact(
      name,
      processIdentity,
      runtime,
      row,
    );
    const pid = runtime.pid;
    if (
      !isAbsolute(processIdentity.cwd ?? '')
      || !isAbsolute(processIdentity.script ?? '')
      || !isAbsolute(processIdentity.interpreter ?? '')
      || (!isLegacy && (
        !Array.isArray(processIdentity.roster)
        || processIdentity.roster.length === 0
        || !exactPriorReleaseIdentity(name, processIdentity.release)
      ))
    ) {
      throw new Error(`prior ${name} identity is not safe to restore`);
    }
    const nodeExecutable = await realpathImpl(processIdentity.interpreter);
    const kernel = await readKernelIdentity({
      pid,
      expectedScript: processIdentity.script,
      nodeExecutable,
      readlinkImpl,
      readFileImpl,
      realpathImpl,
    });
    if (kernel.cwd !== await realpathImpl(processIdentity.cwd)) {
      throw new Error(`prior ${name} kernel cwd does not match PM2`);
    }
    const healthRequestedAt = Date.now();
    const healthBody = await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    );
    const healthReceivedAt = Date.now();
    const healthMatches = isLegacy
      ? exactLegacyOpenHealth(healthBody, {
        requestStartedAt: healthRequestedAt,
        responseReceivedAt: healthReceivedAt,
      })
      : (
        healthBody.ok === true
        && healthBody.service === name
        && healthBody.port === processIdentity.port
        && sameJson(healthBody.tools, processIdentity.roster)
        && sameJson(healthBody.release, processIdentity.release)
      );
    if (!healthMatches) {
      throw new Error(`prior ${name} health does not match PM2 identity`);
    }
    let legacy;
    if (isLegacy) {
      const release = await readLegacyReleaseImpl(processIdentity.cwd);
      if (
        release.kind !== 'legacy-open-v1'
        || release.releaseDir !== await realpathImpl(processIdentity.cwd)
        || release.entrypoint !== await realpathImpl(processIdentity.script)
      ) {
        throw new Error(`prior ${name} legacy release identity mismatch`);
      }
      const environment = await readStableProtectedEnvironment({
        configuredPath: processIdentity.envFile,
        lstatImpl,
        readFileImpl: environmentReadFileImpl,
        realpathImpl,
      });
      verifyLegacyPersistedEnvironment(row, environment.envFileBytes);
      const sourceAdvertisement = await verifyLegacySourceAdvertisement(
        release.sourceIdentity,
        remoteSourceIdentityImpl,
      );
      legacy = Object.freeze({
        release: Object.freeze({
          sourceIdentity: release.sourceIdentity,
          rollbackIdentity: release.rollbackIdentity,
          entrypoint: release.entrypoint,
        }),
        environment: Object.freeze({
          envFile: environment.envFile,
          envFileSha256: environment.envFileSha256,
          envFileIdentity: Object.freeze(environment.envFileIdentity),
        }),
        sourceAdvertisement,
      });
    }
    processes[name] = {
      process: processIdentity,
      savedProcess: savedProcessIdentity(name, row),
      runtime,
      kernel,
      health: stablePriorHealth(healthBody),
      ...(legacy ? { legacy } : {}),
    };
  }
  return processes;
}

function exactPersistedEnvironment(row) {
  const metadata = processMetadata(row);
  const persisted = metadata?.env && typeof metadata.env === 'object'
    && !Array.isArray(metadata.env)
    ? metadata.env
    : row?.env;
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
    throw new Error('prior PM2 definition has no persisted environment');
  }
  return persisted;
}

function protectedEnvironmentStat(stat) {
  return stat?.isFile?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat.nlink === 1
    && stat.uid === process.getuid()
    && (stat.mode & 0o7777) === 0o600;
}

function sameEnvironmentFileIdentity(before, after) {
  return [
    'dev',
    'ino',
    'mode',
    'nlink',
    'uid',
    'size',
    'mtimeMs',
    'ctimeMs',
  ].every((field) => before[field] === after[field]);
}

/**
 * Prove that the exact public OpenDexter process about to be removed can be
 * restarted without reconstructing code or credentials. The private
 * `dexter-mcp` process is outside this release and is never contacted.
 */
export async function verifyPriorOpenReleaseRestartability({
  prior,
  rows,
  readSealedReleaseImpl = readSealedOpenRelease,
  readLegacyReleaseImpl = readSealedLegacyOpenRelease,
  lstatImpl = lstat,
  readFileImpl = readFile,
  readlinkImpl = readlink,
  processReadFileImpl = readFile,
  realpathImpl = realpath,
  runtimeMode = 'captured',
  verifyRemoteSource = false,
  remoteSourceIdentityImpl = reviewedRemoteGitSourceIdentity,
}) {
  if (!['captured', 'restored'].includes(runtimeMode)) {
    throw new Error('prior restart proof runtime mode is invalid');
  }
  const byName = exactServiceRows(rows);
  if (!sameJson(Object.keys(prior ?? {}).sort(), [...SERVICE_NAMES].sort())) {
    throw new Error('prior restart proof requires the exact open-service topology');
  }

  for (const name of SERVICE_NAMES) {
    const snapshot = prior[name];
    const row = byName[name];
    if (!sameJson(stableProcessIdentity(name, row), snapshot?.process)) {
      throw new Error(`prior ${name} PM2 identity changed before restart proof`);
    }
    if (!sameJson(savedProcessIdentity(name, row), snapshot?.savedProcess)) {
      throw new Error(`prior ${name} PM2 restart definition changed before proof`);
    }
    const runtime = livePm2RuntimeIdentity(row, `prior ${name}`);
    if (
      (runtimeMode === 'captured' && !sameJson(runtime, snapshot?.runtime))
      || (runtimeMode === 'restored' && (
        runtime.pid === snapshot.runtime.pid
        || runtime.restartTime !== snapshot.runtime.restartTime
        || runtime.unstableRestarts !== snapshot.runtime.unstableRestarts
      ))
    ) {
      throw new Error(`prior ${name} PM2 runtime changed before restart proof`);
    }
    const currentKernel = await readKernelIdentity({
      pid: runtime.pid,
      expectedScript: snapshot.process.script,
      nodeExecutable: await realpathImpl(snapshot.process.interpreter),
      readlinkImpl,
      readFileImpl: processReadFileImpl,
      realpathImpl,
    });
    const kernelMatches = runtimeMode === 'captured'
      ? sameJson(currentKernel, snapshot.kernel)
      : (
        currentKernel.cwd === snapshot.kernel.cwd
        && currentKernel.executable === snapshot.kernel.executable
        && sameJson(currentKernel.commandLine, snapshot.kernel.commandLine)
        && currentKernel.startTimeTicks !== snapshot.kernel.startTimeTicks
      );
    if (!kernelMatches) {
      throw new Error(`prior ${name} kernel identity changed before restart proof`);
    }

    const releaseDir = await realpathImpl(snapshot.process.cwd);
    let expectedScript;
    if (snapshot.legacy) {
      const release = await readLegacyReleaseImpl(releaseDir);
      if (
        release.releaseDir !== releaseDir
        || !sameJson(release.sourceIdentity, snapshot.legacy.release.sourceIdentity)
        || !sameJson(
          release.rollbackIdentity,
          snapshot.legacy.release.rollbackIdentity,
        )
        || release.entrypoint !== snapshot.legacy.release.entrypoint
      ) {
        throw new Error(`prior ${name} legacy release identity mismatch`);
      }
      if (verifyRemoteSource) {
        const sourceAdvertisement = await verifyLegacySourceAdvertisement(
          release.sourceIdentity,
          remoteSourceIdentityImpl,
        );
        if (!sameJson(
          sourceAdvertisement,
          snapshot.legacy.sourceAdvertisement,
        )) {
          throw new Error(`prior ${name} canonical source proof changed`);
        }
      }
      expectedScript = release.entrypoint;
    } else {
      const release = await readSealedReleaseImpl(releaseDir);
      if (release.releaseDir !== releaseDir) {
        throw new Error(`prior ${name} release directory is not exact`);
      }
      if (!sameJson(
        releaseIdentityForService(release, name),
        snapshot.process.release,
      )) {
        throw new Error(`prior ${name} sealed release identity mismatch`);
      }
      expectedScript = resolve(
        releaseDir,
        release.provenance.entrypoints[name],
      );
    }
    if (
      snapshot.process.script !== expectedScript
      || await realpathImpl(snapshot.process.script)
        !== await realpathImpl(expectedScript)
    ) {
      throw new Error(`prior ${name} script is not the sealed entrypoint`);
    }
    const interpreter = await realpathImpl(snapshot.process.interpreter);
    if (
      interpreter !== snapshot.kernel.executable
      || !commandLineMatches(
        snapshot.kernel.commandLine,
        interpreter,
        expectedScript,
      )
    ) {
      throw new Error(`prior ${name} interpreter is not restartable exactly`);
    }

    const envFile = snapshot.process.envFile;
    const assertedDigest = snapshot.legacy
      ? snapshot.legacy.environment.envFileSha256
      : snapshot.process.envFileSha256;
    if (
      !isAbsolute(envFile ?? '')
      || !/^[a-f0-9]{64}$/.test(assertedDigest ?? '')
    ) {
      throw new Error(`prior ${name} has no exact environment-file identity`);
    }
    const before = await lstatImpl(envFile);
    if (!protectedEnvironmentStat(before)) {
      throw new Error(
        `prior ${name} environment file is not owned mode-0600 with one link`,
      );
    }
    if (await realpathImpl(envFile) !== envFile) {
      throw new Error(`prior ${name} environment file path is not canonical`);
    }
    const bytes = await readFileImpl(envFile);
    const after = await lstatImpl(envFile);
    if (
      !protectedEnvironmentStat(after)
      || !sameEnvironmentFileIdentity(before, after)
    ) {
      throw new Error(`prior ${name} environment file changed during proof`);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== assertedDigest) {
      throw new Error(`prior ${name} environment-file digest mismatch`);
    }

    if (snapshot.legacy) {
      const currentIdentity = protectedEnvironmentFileIdentity(after);
      if (
        envFile !== snapshot.legacy.environment.envFile
        || !sameJson(
          currentIdentity,
          snapshot.legacy.environment.envFileIdentity,
        )
      ) {
        throw new Error(`prior ${name} environment-file identity mismatch`);
      }
      verifyLegacyPersistedEnvironment(row, bytes);
    } else {
      const persisted = exactPersistedEnvironment(row);
      const applicationEnvironment = parseEnv(bytes.toString('utf8'));
      for (const key of ECOSYSTEM_REMOVED_ENV_KEYS) {
        delete applicationEnvironment[key];
      }
      for (const [key, value] of Object.entries(applicationEnvironment)) {
        if (
          !Object.hasOwn(persisted, key)
          || String(persisted[key]) !== value
        ) {
          throw new Error(
            `prior ${name} persisted environment does not match ${key}`,
          );
        }
      }
    }
  }
  return true;
}

export async function verifyRestoredOpenReleasePair({
  prior,
  rows,
  fetchImpl = fetch,
  readlinkImpl = readlink,
  readFileImpl = readFile,
  realpathImpl = realpath,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
}) {
  const byName = exactServiceRows(rows);
  for (const name of SERVICE_NAMES) {
    const expected = prior[name];
    if (!expected) throw new Error(`rollback has no snapshot for ${name}`);
    const row = byName[name];
    const runtime = livePm2RuntimeIdentity(row, `rollback ${name}`);
    if (
      runtime.pid === expected.runtime.pid
      || runtime.restartTime !== expected.runtime.restartTime
      || runtime.unstableRestarts !== expected.runtime.unstableRestarts
      || !sameJson(stableProcessIdentity(name, row), expected.process)
      || !sameJson(savedProcessIdentity(name, row), expected.savedProcess)
    ) {
      throw new Error(`rollback identity mismatch for ${name}`);
    }
    const nodeExecutable = await realpathImpl(expected.process.interpreter);
    const kernel = await readKernelIdentity({
      pid: runtime.pid,
      expectedScript: expected.process.script,
      nodeExecutable,
      readlinkImpl,
      readFileImpl,
      realpathImpl,
    });
    if (
      kernel.cwd !== expected.kernel.cwd
      || kernel.executable !== expected.kernel.executable
      || !sameJson(kernel.commandLine, expected.kernel.commandLine)
      || kernel.startTimeTicks === expected.kernel.startTimeTicks
    ) {
      throw new Error(`rollback kernel identity mismatch for ${name}`);
    }
    const healthRequestedAt = Date.now();
    const healthBody = await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    );
    const healthReceivedAt = Date.now();
    if (
      (expected.legacy && !exactLegacyOpenHealth(healthBody, {
        requestStartedAt: healthRequestedAt,
        responseReceivedAt: healthReceivedAt,
      }))
      || !sameJson(stablePriorHealth(healthBody), expected.health)
    ) {
      throw new Error(`rollback health mismatch for ${name}`);
    }
  }
  return true;
}

function boundedPm2Runner({
  runCommand,
  commandEnvironment,
  nodeExecutable,
  pm2Executable,
  timeoutMs,
  startupTimeoutMs,
}) {
  return (args) => {
    const operation = args?.[0];
    const commandTimeoutMs = operation === 'start' || operation === 'resurrect'
      ? startupTimeoutMs
      : timeoutMs;
    return runBoundedPm2Command({
      runCommand,
      args,
      commandEnvironment,
      nodeExecutable,
      pm2Executable,
      timeoutMs: commandTimeoutMs,
    });
  };
}

async function pm2List(runPm2) {
  const { stdout } = await runPm2(['jlist']);
  return parsePm2ProcessList(stdout);
}

function unrelatedPm2Snapshot(rows) {
  return snapshotUnrelatedPm2Processes(rows, SERVICE_NAMES);
}

export async function runningServiceProcessSnapshot(
  serviceName,
  rows,
  {
    readlinkImpl = readlink,
    readFileImpl = readFile,
    realpathImpl = realpath,
  } = {},
) {
  if (typeof serviceName !== 'string' || serviceName.length === 0) {
    throw new Error('running service name is invalid');
  }
  const label = serviceName === PRESERVED_PRIVATE_SERVICE
    ? 'private Dexter'
    : serviceName;
  const selected = rows.filter((row) => row?.name === serviceName);
  if (selected.length > 1) {
    throw new Error(serviceName === PRESERVED_PRIVATE_SERVICE
      ? 'PM2 contains duplicate preserved private Dexter processes'
      : `PM2 contains duplicate ${serviceName} processes`);
  }
  if (selected.length === 0) return null;
  const row = selected[0];
  const runtime = livePm2RuntimeIdentity(row, label);
  const { pid } = runtime;
  const cwd = processField(row, 'pm_cwd') ?? null;
  const script = processField(row, 'pm_exec_path') ?? null;
  const interpreter = processField(row, 'exec_interpreter') ?? null;
  if (
    !isAbsolute(cwd ?? '')
    || !isAbsolute(script ?? '')
    || !isAbsolute(interpreter ?? '')
  ) {
    throw new Error(`${label} process identity is not exact`);
  }
  const nodeExecutable = await realpathImpl(interpreter);
  const kernel = await readKernelIdentity({
    pid,
    expectedScript: script,
    nodeExecutable,
    readlinkImpl,
    readFileImpl,
    realpathImpl,
  });
  if (kernel.cwd !== await realpathImpl(cwd)) {
    throw new Error(`${label} kernel cwd does not match PM2`);
  }
  return Object.freeze({
    ...runtime,
    status: PM2_STATUS_ONLINE,
    cwd,
    script,
    interpreter: nodeExecutable,
    kernel: Object.freeze(kernel),
    definition: snapshotUnrelatedPm2Processes([row], [])[0],
  });
}

export async function preservedPrivateProcessSnapshot(rows, options = {}) {
  return runningServiceProcessSnapshot(
    PRESERVED_PRIVATE_SERVICE,
    rows,
    options,
  );
}

function assertUnrelatedPm2Processes(
  rows,
  expected,
  phase,
) {
  if (!samePm2ProcessSnapshot(unrelatedPm2Snapshot(rows), expected)) {
    throw new Error(`${phase} changed an unrelated PM2 process definition`);
  }
}

async function assertPreservedPrivateProcess(
  rows,
  phase,
  expectedPrivateProcess,
  privateProcessProofOptions,
) {
  if (
    expectedPrivateProcess !== undefined
    && !samePm2ProcessSnapshot(
      await preservedPrivateProcessSnapshot(rows, privateProcessProofOptions),
      expectedPrivateProcess,
    )
  ) {
    throw new Error(`${phase} changed the private Dexter process`);
  }
}

async function waitFor(condition, {
  timeoutMs = 30_000,
  intervalMs = 100,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw lastError ?? new Error('OpenDexter release activation timed out');
}

async function deleteServices(
  rows,
  runPm2,
  expectedPrivateProcess,
  privateProcessProofOptions,
) {
  for (const name of SERVICE_NAMES) {
    if (!rows.some((row) => row?.name === name)) continue;
    await runPm2(['delete', name]);
  }
  const oldPids = rows
    .filter((row) => SERVICE_NAMES.includes(row?.name))
    .map((row) => row.pid)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  await waitFor(async () => {
    const current = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      current,
      'service deletion',
      expectedPrivateProcess,
      privateProcessProofOptions,
    );
    const absent = current.every((row) => !SERVICE_NAMES.includes(row?.name));
    const exited = (await Promise.all(oldPids.map(processExists)))
      .every((exists) => !exists);
    return absent && exited;
  });
}

async function deleteServicesForRollback(
  runPm2,
  expectedPrivateProcess,
  privateProcessProofOptions,
  timeoutMs,
) {
  await waitFor(async () => {
    let current;
    try {
      current = await pm2List(runPm2);
      await assertPreservedPrivateProcess(
        current,
        'rollback deletion',
        expectedPrivateProcess,
        privateProcessProofOptions,
      );
      if (current.every((row) => !SERVICE_NAMES.includes(row?.name))) {
        return true;
      }
    } catch {
      // A transient jlist failure cannot skip the known target delete. The
      // next bounded iteration must still obtain a fresh absence proof.
      current = null;
    }
    const presentNames = current === null
      ? SERVICE_NAMES
      : SERVICE_NAMES.filter((name) => current.some((row) => row?.name === name));
    for (const name of presentNames) {
      try {
        await runPm2(['delete', name]);
      } catch {
        // Retry only within the explicit rollback deadline.
      }
    }
    const after = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      after,
      'rollback deletion',
      expectedPrivateProcess,
      privateProcessProofOptions,
    );
    return after.every((row) => !SERVICE_NAMES.includes(row?.name));
  }, {
    timeoutMs,
    intervalMs: Math.min(100, Math.max(1, Math.floor(timeoutMs / 4))),
  });
}

function defaultPm2Home() {
  return PRODUCTION_PM2_HOME;
}

function defaultCommandEnvironment() {
  return Object.fromEntries(Object.entries({
    PATH: process.env.PATH,
    HOME: PRODUCTION_HOME,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    PM2_HOME: PRODUCTION_PM2_HOME,
    DEXTER_MCP_ENV_FILE: process.env.DEXTER_MCP_ENV_FILE,
  }).filter(([, value]) => value !== undefined));
}

export async function acquireReleaseCutoverLock(
  pm2Home = defaultPm2Home(),
  {
    recoverOwner = null,
    recoverJournalSha256 = null,
    processAliveImpl = async (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    },
  } = {},
) {
  if (typeof pm2Home !== 'string' || !isAbsolute(pm2Home)) {
    throw new Error('release cutover lock requires one absolute PM2_HOME');
  }
  const lockDirectory = resolve(
    pm2Home,
    '.dexter-mcp-release-cutover.lock',
  );
  const ownerPath = resolve(lockDirectory, 'owner.json');
  const token = randomUUID();
  const recovery = recoverOwner !== null || recoverJournalSha256 !== null;
  if (recovery && (
    !recoverOwner
    || !Number.isInteger(recoverOwner.pid)
    || recoverOwner.pid <= 0
    || typeof recoverOwner.token !== 'string'
    || recoverOwner.token.length === 0
    || !/^[a-f0-9]{64}$/.test(recoverJournalSha256 ?? '')
  )) {
    throw new Error('release recovery lock proof is incomplete');
  }
  const owner = canonicalJson({
    pid: process.pid,
    token,
    ...(recovery ? { recoveryJournalSha256: recoverJournalSha256 } : {}),
  });
  const ownerBytes = Buffer.from(JSON.stringify(owner));
  let ownsCanonicalDirectory = false;
  try {
    await mkdir(lockDirectory, { mode: 0o700 });
    ownsCanonicalDirectory = true;
  } catch (error) {
    if (error?.code !== 'EEXIST' || !recovery) {
      if (error?.code !== 'EEXIST') throw error;
      throw new Error('another Dexter MCP release cutover is active');
    }
    const lockIdentity = await lstat(lockDirectory);
    const staleOwnerPath = resolve(lockDirectory, 'owner.json');
    const staleOwnerState = await readStableOwnedOptionalFile(staleOwnerPath);
    const staleOwner = parseJson(
      staleOwnerState.bytes.toString('utf8'),
      'stale release cutover owner',
    );
    const ownerAlive = Number.isInteger(staleOwner?.pid)
      ? await processAliveImpl(staleOwner.pid)
      : true;
    const originalOwner = sameJson(staleOwner, recoverOwner);
    const priorRecoveryOwner = (
      staleOwner?.recoveryJournalSha256 === recoverJournalSha256
      && Number.isInteger(staleOwner?.pid)
      && typeof staleOwner?.token === 'string'
      && staleOwner.token.length > 0
    );
    if (
      !lockIdentity.isDirectory()
      || lockIdentity.isSymbolicLink()
      || lockIdentity.uid !== process.getuid()
      || (lockIdentity.mode & 0o7777) !== 0o700
      || await realpath(lockDirectory) !== lockDirectory
      || !Number.isInteger(staleOwner?.pid)
      || typeof staleOwner.token !== 'string'
      || (!originalOwner && !priorRecoveryOwner)
      || ownerAlive
    ) {
      throw new Error('another Dexter MCP release cutover is active');
    }
    const claimId = randomUUID();
    const quarantine = resolve(
      pm2Home,
      `.dexter-mcp-stale-cutover-${claimId}`,
    );
    const prepared = resolve(
      pm2Home,
      `.dexter-mcp-recovery-claim-${claimId}`,
    );
    const preparedOwnerPath = resolve(prepared, 'owner.json');
    try {
      // Renaming the whole directory is the recovery CAS. Only one contender
      // can capture the observed dead owner; every other contender loses the
      // canonical path or finds the winner's new live owner.
      await rename(lockDirectory, quarantine);
      const capturedOwner = await readStableOwnedOptionalFile(
        resolve(quarantine, 'owner.json'),
      );
      if (!capturedOwner.bytes.equals(staleOwnerState.bytes)) {
        throw new Error('release recovery lock changed during claim');
      }
      await mkdir(prepared, { mode: 0o700 });
      let preparedOwner;
      try {
        preparedOwner = await open(preparedOwnerPath, 'wx', 0o600);
        await preparedOwner.writeFile(ownerBytes);
        await preparedOwner.sync();
      } finally {
        await preparedOwner?.close();
      }
      await syncDirectory(prepared);
      await rename(prepared, lockDirectory);
      ownsCanonicalDirectory = true;
      await syncDirectory(pm2Home);
      await unlink(resolve(quarantine, 'owner.json')).catch(() => {});
      await rmdir(quarantine).catch(() => {});
      await syncDirectory(pm2Home);
    } catch (recoveryError) {
      await rm(preparedOwnerPath, { force: true }).catch(() => {});
      await rmdir(prepared).catch(() => {});
      if (!ownsCanonicalDirectory) {
        try {
          await rename(quarantine, lockDirectory);
        } catch (restoreError) {
          if (!['EEXIST', 'ENOTEMPTY'].includes(restoreError?.code)) {
            throw new AggregateError([recoveryError, restoreError]);
          }
          await unlink(resolve(quarantine, 'owner.json')).catch(() => {});
          await rmdir(quarantine).catch(() => {});
        }
      }
      throw recoveryError;
    }
  }
  try {
    const identity = await lstat(lockDirectory);
    if (
      !identity.isDirectory()
      || identity.isSymbolicLink()
      || identity.uid !== process.getuid()
      || (identity.mode & 0o7777) !== 0o700
      || await realpath(lockDirectory) !== lockDirectory
    ) {
      throw new Error('release cutover lock directory is not exact');
    }
    const existingOwner = await readFile(ownerPath).catch(
      (error) => error?.code === 'ENOENT' ? null : Promise.reject(error),
    );
    if (existingOwner === null && ownsCanonicalDirectory) {
      let handle;
      try {
        handle = await open(ownerPath, 'wx', 0o600);
        await handle.writeFile(ownerBytes);
        await handle.sync();
      } finally {
        await handle?.close();
      }
    } else if (existingOwner === null || !existingOwner.equals(ownerBytes)) {
      throw new Error('release recovery lock ownership changed');
    }
    await syncDirectory(lockDirectory);
    await syncDirectory(pm2Home);
  } catch (error) {
    const current = await readFile(ownerPath).catch(() => null);
    if (ownsCanonicalDirectory && current?.equals(ownerBytes)) {
      await rm(ownerPath, { force: true });
      await rmdir(lockDirectory).catch(() => {});
    }
    throw error;
  }
  let released = false;
  return Object.freeze({
    lockDirectory,
    owner: Object.freeze(owner),
    async release() {
      if (released) throw new Error('release cutover lock was already released');
      const current = await readFile(ownerPath);
      if (!current.equals(ownerBytes)) {
        throw new Error('release cutover lock ownership changed');
      }
      await unlink(ownerPath);
      await rmdir(lockDirectory);
      released = true;
    },
  });
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function procStartTimeTicks(statText) {
  const tail = statText.slice(statText.lastIndexOf(') ') + 2).trim()
    .split(/\s+/);
  const startTimeTicks = tail[19];
  if (!/^[1-9][0-9]*$/.test(startTimeTicks ?? '')) {
    throw new Error('process start time is unreadable');
  }
  return startTimeTicks;
}

function environmentKeySet(bytes) {
  const keys = new Set();
  for (const entry of Buffer.from(bytes).toString('utf8').split('\0')) {
    if (entry.length === 0) continue;
    const separator = entry.indexOf('=');
    const key = separator < 0 ? entry : entry.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || keys.has(key)) {
      throw new Error('PM2 daemon environment namespace is invalid');
    }
    keys.add(key);
  }
  return keys;
}

function exactLegacyDaemonImageStat(stat) {
  return stat?.isFile?.() === true
    && stat?.isSymbolicLink?.() !== true
    && Object.entries(LEGACY_PM2_DAEMON.image).every(
      ([field, expected]) => stat[field] === expected,
    );
}

function sameLegacyDaemonImageIdentity(before, after) {
  return [
    'dev',
    'gid',
    'ino',
    'mode',
    'nlink',
    'size',
    'uid',
    'mtimeMs',
    'ctimeMs',
  ].every((field) => before[field] === after[field]);
}

async function proveLegacyDaemonImage({
  openImpl,
  procRoot,
  sha256Impl,
}) {
  const handle = await openImpl(`${procRoot}/exe`, 'r');
  try {
    const before = await handle.stat();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    return exactLegacyDaemonImageStat(before)
      && exactLegacyDaemonImageStat(after)
      && sameLegacyDaemonImageIdentity(before, after)
      && sha256Impl(bytes) === LEGACY_PM2_DAEMON.executableSha256;
  } finally {
    await handle.close();
  }
}

function exactSystemdProperties(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return false;
  const expectedKeys = new Set(Object.keys(LEGACY_PM2_SYSTEMD_PROPERTIES));
  const observed = new Map();
  for (const line of stdout.trimEnd().split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 1) return false;
    const key = line.slice(0, separator);
    if (!expectedKeys.has(key) || observed.has(key)) return false;
    observed.set(key, line.slice(separator + 1));
  }
  return observed.size === expectedKeys.size
    && Object.entries(LEGACY_PM2_SYSTEMD_PROPERTIES).every(
      ([key, value]) => observed.get(key) === value,
    );
}

function exactPm2Report(stdout) {
  if (typeof stdout !== 'string') return false;
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return false;
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const expectedKeys = Object.keys(LEGACY_PM2_REPORT_FIELDS).sort();
  if (JSON.stringify(Object.keys(report).sort()) !== JSON.stringify(expectedKeys)) {
    return false;
  }
  return Object.entries(LEGACY_PM2_REPORT_FIELDS).every(([key, value]) => (
    JSON.stringify(report[key]) === JSON.stringify(value)
  ));
}

async function verifyExactLegacyPm2Daemon({
  beforePidStat,
  environmentKeys,
  executable,
  expectedTitle,
  lstatImpl,
  openImpl,
  pid,
  pidBytes,
  pidPath,
  pm2Home,
  readFileImpl,
  readlinkImpl,
  realpathImpl,
  runCommand,
  sha256Impl,
  startBefore,
}) {
  if (
    pid !== LEGACY_PM2_DAEMON.pid
    || startBefore !== LEGACY_PM2_DAEMON.startTimeTicks
    || executable !== LEGACY_PM2_DAEMON.executable
    || FORBIDDEN_LOADER_ENV_KEYS.some((key) => environmentKeys.has(key))
  ) {
    return false;
  }
  const procRoot = `/proc/${pid}`;
  try {
    const [bootId, cgroup] = await Promise.all([
      readFileImpl('/proc/sys/kernel/random/boot_id'),
      readFileImpl(`${procRoot}/cgroup`),
    ]);
    if (
      !Buffer.from(bootId).equals(Buffer.from(LEGACY_PM2_DAEMON.bootId))
      || !Buffer.from(cgroup).equals(Buffer.from(LEGACY_PM2_DAEMON.cgroup))
      || !await proveLegacyDaemonImage({ openImpl, procRoot, sha256Impl })
    ) {
      return false;
    }
    await Promise.all(LEGACY_PM2_SYSTEM_FILES.map(({ path, sha256 }) => (
      requireProtectedRootOwnedPath(path, {
        directory: false,
        expectedSha256: sha256,
        lstatImpl,
        readFileImpl,
        realpathImpl,
        sha256Impl,
      })
    )));
    const cleanLocale = {
      LANG: 'C',
      LC_ALL: 'C',
      NO_COLOR: '1',
      PATH: '/usr/bin:/bin',
    };
    const [systemd, report] = await Promise.all([
      runCommand(SYSTEMCTL_EXECUTABLE, [
        'show',
        PM2_SYSTEMD_SERVICE,
        '--no-pager',
        ...Object.keys(LEGACY_PM2_SYSTEMD_PROPERTIES).map(
          (key) => `--property=${key}`,
        ),
      ], {
        encoding: 'utf8',
        env: { HOME: PRODUCTION_HOME, ...cleanLocale },
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
        timeout: 5_000,
      }),
      runCommand(PRODUCTION_NODE_EXECUTABLE, ['-e', LEGACY_PM2_REPORT_PROBE], {
        encoding: 'utf8',
        env: {
          HOME: PRODUCTION_HOME,
          PM2_HOME: pm2Home,
          ...cleanLocale,
        },
        killSignal: 'SIGKILL',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
      }),
    ]);
    if (
      systemd.stderr !== ''
      || report.stderr !== ''
      || !exactSystemdProperties(systemd.stdout)
      || !exactPm2Report(report.stdout)
    ) {
      return false;
    }
    const [finalPidStat, finalPidBytes, finalProcStat, finalBootId,
      finalCgroup, finalExecutableLink, finalCommandLineBytes,
      finalEnvironmentBytes] = await Promise.all([
      lstatImpl(pidPath),
      readFileImpl(pidPath),
      readFileImpl(`${procRoot}/stat`, 'utf8'),
      readFileImpl('/proc/sys/kernel/random/boot_id'),
      readFileImpl(`${procRoot}/cgroup`),
      readlinkImpl(`${procRoot}/exe`),
      readFileImpl(`${procRoot}/cmdline`),
      readFileImpl(`${procRoot}/environ`),
    ]);
    const finalExecutable = await realpathImpl(finalExecutableLink);
    const finalCommandLine = Buffer.from(finalCommandLineBytes)
      .toString('utf8').split('\0').filter(Boolean);
    const finalEnvironmentKeys = environmentKeySet(finalEnvironmentBytes);
    return sameEnvironmentFileIdentity(beforePidStat, finalPidStat)
      && Buffer.from(finalPidBytes).equals(Buffer.from(pidBytes))
      && procStartTimeTicks(finalProcStat) === LEGACY_PM2_DAEMON.startTimeTicks
      && Buffer.from(finalBootId).equals(Buffer.from(LEGACY_PM2_DAEMON.bootId))
      && Buffer.from(finalCgroup).equals(Buffer.from(LEGACY_PM2_DAEMON.cgroup))
      && finalExecutable === LEGACY_PM2_DAEMON.executable
      && finalCommandLine.length === 1
      && finalCommandLine[0] === expectedTitle
      && !FORBIDDEN_LOADER_ENV_KEYS.some(
        (key) => finalEnvironmentKeys.has(key),
      )
      && await proveLegacyDaemonImage({ openImpl, procRoot, sha256Impl });
  } catch {
    return false;
  }
}

/**
 * PM2 6.0.5 prepends its daemon-level PM2_NODE_OPTIONS to every forked Node
 * process. Prove the already-running daemon has no loader-bearing ambient
 * environment before asking it to start either a candidate or rollback.
 */
export async function verifyPm2DaemonLaunchAuthority({
  pm2Home = defaultPm2Home(),
  lstatImpl = lstat,
  openImpl = open,
  readFileImpl = readFile,
  readlinkImpl = readlink,
  realpathImpl = realpath,
  runCommand = execFileAsync,
  sha256Impl = sha256Bytes,
} = {}) {
  if (pm2Home !== PRODUCTION_PM2_HOME) {
    throw new Error('PM2 daemon proof requires the production PM2_HOME');
  }
  const pidPath = resolve(pm2Home, 'pm2.pid');
  const before = await lstatImpl(pidPath);
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1
    || before.uid !== process.getuid()
    || (before.mode & 0o022) !== 0
    || await realpathImpl(pidPath) !== pidPath
  ) {
    throw new Error('PM2 daemon pid file is not exact');
  }
  const pidBytes = await readFileImpl(pidPath);
  const encodedPid = Buffer.from(pidBytes).toString('utf8').trim();
  if (!/^[1-9][0-9]*$/.test(encodedPid)) {
    throw new Error('PM2 daemon pid is invalid');
  }
  const pid = Number(encodedPid);
  if (!Number.isSafeInteger(pid)) {
    throw new Error('PM2 daemon pid is invalid');
  }
  const procRoot = `/proc/${pid}`;
  const expectedTitle = `PM2 v${PRODUCTION_PM2_VERSION}: God Daemon (${pm2Home})`;
  const startBefore = procStartTimeTicks(
    await readFileImpl(`${procRoot}/stat`, 'utf8'),
  );
  const executable = await realpathImpl(
    await readlinkImpl(`${procRoot}/exe`),
  );
  const commandLine = Buffer.from(
    await readFileImpl(`${procRoot}/cmdline`),
  ).toString('utf8').split('\0').filter(Boolean);
  const environmentKeys = environmentKeySet(
    await readFileImpl(`${procRoot}/environ`),
  );
  const exactExecutable = executable === PRODUCTION_NODE_EXECUTABLE
    || await verifyExactLegacyPm2Daemon({
      beforePidStat: before,
      environmentKeys,
      executable,
      expectedTitle,
      lstatImpl,
      openImpl,
      pid,
      pidBytes,
      pidPath,
      pm2Home,
      readFileImpl,
      readlinkImpl,
      realpathImpl,
      runCommand,
      sha256Impl,
      startBefore,
    });
  const startAfter = procStartTimeTicks(
    await readFileImpl(`${procRoot}/stat`, 'utf8'),
  );
  const after = await lstatImpl(pidPath);
  if (
    !exactExecutable
    || commandLine.length !== 1
    || commandLine[0] !== expectedTitle
    || FORBIDDEN_LOADER_ENV_KEYS.some((key) => environmentKeys.has(key))
    || startBefore !== startAfter
    || !sameEnvironmentFileIdentity(before, after)
    || !Buffer.from(await readFileImpl(pidPath)).equals(Buffer.from(pidBytes))
  ) {
    throw new Error('PM2 daemon launch authority is not exact');
  }
  return Object.freeze({
    pid,
    startTimeTicks: startAfter,
    executable,
    title: expectedTitle,
  });
}

async function requireProtectedRootOwnedPath(path, {
  directory,
  expectedSha256 = null,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
  sha256Impl = sha256Bytes,
} = {}) {
  if (await realpathImpl(path) !== path) {
    throw new Error(`production PM2 path is not canonical: ${path}`);
  }
  const identity = await lstatImpl(path);
  if (
    identity.uid !== 0
    || (identity.mode & 0o022) !== 0
    || (directory ? !identity.isDirectory() : !identity.isFile())
    || (!directory && identity.nlink !== 1)
  ) {
    throw new Error(`production PM2 path is not root-owned and protected: ${path}`);
  }
  if (
    expectedSha256 !== null
    && sha256Impl(await readFileImpl(path)) !== expectedSha256
  ) {
    throw new Error(`production PM2 bytes differ from the reviewed release: ${path}`);
  }
}

export async function verifyProductionPm2Executable({
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
  runCommand = execFileAsync,
} = {}) {
  for (const path of [
    '/usr',
    '/usr/bin',
    '/usr/local',
    '/usr/local/lib',
    '/usr/local/lib/node_modules',
    PRODUCTION_PM2_PACKAGE_ROOT,
    `${PRODUCTION_PM2_PACKAGE_ROOT}/bin`,
    `${PRODUCTION_PM2_PACKAGE_ROOT}/lib`,
    `${PRODUCTION_PM2_PACKAGE_ROOT}/lib/binaries`,
    ...OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES,
  ]) {
    await requireProtectedRootOwnedPath(path, {
      directory: true,
      lstatImpl,
      readFileImpl,
      realpathImpl,
    });
  }
  await requireProtectedRootOwnedPath(PRODUCTION_NODE_EXECUTABLE, {
    directory: false,
    expectedSha256: PRODUCTION_NODE_SHA256,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  await requireProtectedRootOwnedPath(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE, {
    directory: false,
    expectedSha256: OPEN_RELEASE_APPLICATION_NODE_SHA256,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  await requireProtectedRootOwnedPath(PRODUCTION_PM2_EXECUTABLE, {
    directory: false,
    expectedSha256: PRODUCTION_PM2_SHA256,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  await requireProtectedRootOwnedPath(PRODUCTION_PM2_PACKAGE_JSON, {
    directory: false,
    expectedSha256: PRODUCTION_PM2_PACKAGE_SHA256,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  await requireProtectedRootOwnedPath(PRODUCTION_PM2_CLI, {
    directory: false,
    expectedSha256: PRODUCTION_PM2_CLI_SHA256,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  let packageJson;
  try {
    packageJson = JSON.parse(await readFileImpl(PRODUCTION_PM2_PACKAGE_JSON, 'utf8'));
  } catch (error) {
    throw new Error('production PM2 package identity is unreadable', { cause: error });
  }
  if (packageJson?.name !== 'pm2' || packageJson?.version !== PRODUCTION_PM2_VERSION) {
    throw new Error('production PM2 package identity differs from the reviewed release');
  }
  let nodeVersion;
  try {
    const result = await runCommand(
      PRODUCTION_NODE_EXECUTABLE,
      ['--version'],
      {
        encoding: 'utf8',
        env: {
          HOME: '/root',
          LANG: 'C',
          LC_ALL: 'C',
          PATH: '/usr/bin:/bin',
        },
        maxBuffer: 1024 * 1024,
        timeout: 5_000,
        killSignal: 'SIGKILL',
      },
    );
    nodeVersion = result.stdout.trim();
  } catch (error) {
    throw new Error('production Node runtime identity is unreadable', {
      cause: error,
    });
  }
  if (nodeVersion !== PRODUCTION_NODE_VERSION) {
    throw new Error('production Node runtime identity differs from the reviewed release');
  }
  let applicationNodeVersion;
  try {
    const result = await runCommand(
      OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
      ['--version'],
      {
        encoding: 'utf8',
        env: {
          HOME: '/root',
          LANG: 'C',
          LC_ALL: 'C',
          PATH: '/usr/bin:/bin',
        },
        maxBuffer: 1024 * 1024,
        timeout: 5_000,
        killSignal: 'SIGKILL',
      },
    );
    applicationNodeVersion = result.stdout.trim();
  } catch (error) {
    throw new Error('OpenDexter application Node runtime identity is unreadable', {
      cause: error,
    });
  }
  if (applicationNodeVersion !== OPEN_RELEASE_APPLICATION_NODE_VERSION) {
    throw new Error(
      'OpenDexter application Node runtime differs from the reviewed release',
    );
  }
  return PRODUCTION_PM2_EXECUTABLE;
}

async function syncDirectory(path) {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function restorePm2Dump(pm2Home, bytes, name = 'dump.pm2') {
  if (!['dump.pm2', 'dump.pm2.bak'].includes(name)) {
    throw new Error('PM2 restore target is invalid');
  }
  const dumpPath = resolve(pm2Home, name);
  const temporaryPath = resolve(
    pm2Home,
    `.opendexter-rollback-${process.pid}-${Date.now()}.json`,
  );
  let temporary;
  try {
    temporary = await open(temporaryPath, 'wx', 0o600);
    await temporary.writeFile(bytes);
    await temporary.sync();
  } finally {
    await temporary?.close();
  }
  try {
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, dumpPath);
    await syncDirectory(pm2Home);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function productionPm2ConfigShim(ecosystem) {
  if (!isAbsolute(ecosystem)) {
    throw new Error('OpenDexter ecosystem path must be absolute');
  }
  const evaluator = [
    `'use strict';`,
    `const value = require(${JSON.stringify(ecosystem)});`,
    `process.stdout.write(JSON.stringify(value));`,
  ].join('\n');
  return Buffer.from([
    `'use strict';`,
    `const { execFileSync } = require('node:child_process');`,
    `const serialized = execFileSync(`,
    `  ${JSON.stringify(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE)},`,
    `  ${JSON.stringify(['-e', evaluator])},`,
    `  {`,
    `    encoding: 'utf8',`,
    `    env: process.env,`,
    `    maxBuffer: 1024 * 1024,`,
    `    timeout: 90_000,`,
    `    killSignal: 'SIGKILL',`,
    `  },`,
    `);`,
    `module.exports = JSON.parse(serialized);`,
    ``,
  ].join('\n'));
}

export async function startOpenReleaseCandidate({
  beforeStart = async () => {},
  ecosystem,
  pm2Home,
  runPm2,
  serviceName = SERVICE_NAMES[0],
}) {
  if (!isAbsolute(ecosystem) || !isAbsolute(pm2Home)) {
    throw new Error('OpenDexter candidate paths must be absolute');
  }
  if (!['dexter-mcp', 'dexter-open-mcp'].includes(serviceName)) {
    throw new Error('Dexter MCP candidate requires one exact service');
  }

  // PM2 6 only recognizes JavaScript configuration files whose names contain
  // `.config.js`, `.config.cjs`, or `.config.mjs`. The sealed release file is
  // deliberately named ecosystem.production.cjs; passing it directly makes
  // PM2 execute the configuration itself as an application named
  // `ecosystem.production` instead of starting its declared app. Load the
  // sealed file through a protected, one-shot config shim with a recognized
  // suffix and select the exact public app explicitly. PM2's reviewed CLI
  // runs on Node 18, while the sealed application contract requires Node 22.
  // Evaluate the ecosystem through the independently verified application
  // runtime so its parser and emitted interpreter match the runtime that will
  // actually execute the service.
  const configPath = resolve(
    pm2Home,
    `.opendexter-candidate-${process.pid}-${randomUUID()}.config.cjs`,
  );
  const configBytes = productionPm2ConfigShim(ecosystem);
  await writeFile(configPath, configBytes, { mode: 0o600, flag: 'wx' });
  try {
    await chmod(configPath, 0o600);
    const identity = await lstat(configPath);
    if (
      !identity.isFile()
      || identity.isSymbolicLink()
      || identity.nlink !== 1
      || identity.uid !== process.getuid()
      || (identity.mode & 0o7777) !== 0o600
      || !(await readFile(configPath)).equals(configBytes)
    ) {
      throw new Error('OpenDexter candidate PM2 config shim is not exact');
    }
    await beforeStart();
    const finalIdentity = await lstat(configPath);
    if (
      !finalIdentity.isFile()
      || finalIdentity.isSymbolicLink()
      || finalIdentity.nlink !== 1
      || finalIdentity.uid !== process.getuid()
      || (finalIdentity.mode & 0o7777) !== 0o600
      || !sameEnvironmentFileIdentity(identity, finalIdentity)
      || !(await readFile(configPath)).equals(configBytes)
    ) {
      throw new Error('OpenDexter candidate PM2 config changed before start');
    }
    await runPm2([
      'start',
      configPath,
      '--only',
      serviceName,
    ]);
  } finally {
    await rm(configPath, { force: true });
  }
}

export function privateRestartPm2Config(savedRow) {
  if (savedRow?.name !== 'dexter-mcp') {
    throw new Error('private rollback config requires dexter-mcp');
  }
  verifyPrivateExecutionArgumentsAreEmpty(
    savedRow,
    'private rollback PM2',
  );
  const snapshot = snapshotPm2ProcessDefinition(savedRow);
  const definition = structuredClone(snapshot.definition);
  const script = definition.pm_exec_path ?? definition.script;
  const cwd = definition.pm_cwd ?? definition.cwd;
  const interpreter = definition.exec_interpreter;
  if (
    !isAbsolute(script ?? '')
    || !isAbsolute(cwd ?? '')
    || !isAbsolute(interpreter ?? '')
    || (definition.script !== undefined && definition.script !== script)
    || (definition.cwd !== undefined && definition.cwd !== cwd)
    || (definition.pm_cwd !== undefined && definition.pm_cwd !== cwd)
  ) {
    throw new Error('private rollback PM2 definition has conflicting paths');
  }
  const metadata = processMetadata(savedRow);
  const environment = metadata?.env;
  if (
    !environment
    || typeof environment !== 'object'
    || Array.isArray(environment)
    || Object.values(environment).some((value) => typeof value !== 'string')
    || FORBIDDEN_LOADER_ENV_KEYS.some((key) => Object.hasOwn(environment, key))
  ) {
    throw new Error('private rollback PM2 environment is not exact');
  }
  const restartEnvironment = structuredClone(environment);
  for (const key of ['unique_id', 'NODE_APP_INSTANCE', 'dexter-mcp']) {
    delete restartEnvironment[key];
  }
  for (const key of [
    'name',
    'script',
    'cwd',
    'pm_cwd',
    'pm_exec_path',
    'exec_interpreter',
  ]) {
    delete definition[key];
  }
  const app = {
    ...definition,
    name: 'dexter-mcp',
    script,
    cwd,
    interpreter,
    env: restartEnvironment,
  };
  return Buffer.from([
    `'use strict';`,
    `module.exports = ${JSON.stringify({ apps: [app] })};`,
    ``,
  ].join('\n'));
}

async function startPrivateServiceFromSavedRow({
  beforeStart = async () => {},
  pm2Home,
  runPm2,
  savedRow,
}) {
  if (!isAbsolute(pm2Home)) {
    throw new Error('private rollback PM2_HOME must be absolute');
  }
  const configPath = resolve(
    pm2Home,
    `.opendexter-private-rollback-${process.pid}-${randomUUID()}.config.cjs`,
  );
  const configBytes = privateRestartPm2Config(savedRow);
  await writeFile(configPath, configBytes, { mode: 0o600, flag: 'wx' });
  try {
    await chmod(configPath, 0o600);
    const identity = await lstat(configPath);
    if (
      !identity.isFile()
      || identity.isSymbolicLink()
      || identity.nlink !== 1
      || identity.uid !== process.getuid()
      || (identity.mode & 0o7777) !== 0o600
      || !(await readFile(configPath)).equals(configBytes)
    ) {
      throw new Error('private rollback PM2 config is not exact');
    }
    await beforeStart();
    const finalIdentity = await lstat(configPath);
    if (
      !finalIdentity.isFile()
      || finalIdentity.isSymbolicLink()
      || finalIdentity.nlink !== 1
      || finalIdentity.uid !== process.getuid()
      || (finalIdentity.mode & 0o7777) !== 0o600
      || !sameEnvironmentFileIdentity(identity, finalIdentity)
      || !(await readFile(configPath)).equals(configBytes)
    ) {
      throw new Error('private rollback PM2 config changed before start');
    }
    await runPm2([
      'start',
      configPath,
      '--only',
      'dexter-mcp',
    ]);
  } finally {
    await rm(configPath, { force: true });
  }
}

async function readStableOwnedOptionalFile(path, { allowMissing = false } = {}) {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') {
      return { bytes: null, identity: null };
    }
    throw error;
  }
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1
    || before.uid !== process.getuid()
    || (before.mode & 0o022) !== 0
    || await realpath(path) !== path
  ) {
    throw new Error(`PM2 saved-state file is not exact: ${path}`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    !sameEnvironmentFileIdentity(before, after)
    || !(await readFile(path)).equals(bytes)
  ) {
    throw new Error(`PM2 saved-state file changed during read: ${path}`);
  }
  return {
    bytes,
    identity: protectedEnvironmentFileIdentity(after),
  };
}

async function readSavedPm2Dump(pm2Home, { allowMissing = false } = {}) {
  const state = await readStableOwnedOptionalFile(
    resolve(pm2Home, 'dump.pm2'),
    { allowMissing },
  );
  if (state.bytes === null) return { ...state, rows: [] };
  const { bytes } = state;
  const rows = parseJson(bytes.toString('utf8'), 'PM2 saved dump');
  if (!Array.isArray(rows)) throw new Error('PM2 saved dump is not an array');
  return { ...state, rows };
}

async function readPrivateSavedPm2State(pm2Home) {
  const primary = await readSavedPm2Dump(pm2Home, { allowMissing: true });
  const backupState = await readStableOwnedOptionalFile(
    resolve(pm2Home, 'dump.pm2.bak'),
    { allowMissing: true },
  );
  let backupRows = [];
  if (backupState.bytes !== null) {
    backupRows = parseJson(
      backupState.bytes.toString('utf8'),
      'PM2 saved backup dump',
    );
    if (!Array.isArray(backupRows)) {
      throw new Error('PM2 saved backup dump is not an array');
    }
  }
  return {
    primary,
    backup: { ...backupState, rows: backupRows },
  };
}

async function restoreOriginalSavedPm2Dump(pm2Home, bytes) {
  if (bytes === null) {
    await rm(resolve(pm2Home, 'dump.pm2'), { force: true });
    await syncDirectory(pm2Home);
    const restored = await readSavedPm2Dump(pm2Home, { allowMissing: true });
    if (restored.bytes !== null) {
      throw new Error('original absent PM2 dump was not restored');
    }
    return;
  }
  await restorePm2Dump(pm2Home, bytes);
  const restored = (await readSavedPm2Dump(pm2Home)).bytes;
  if (!restored.equals(bytes)) {
    throw new Error('original PM2 dump bytes were not restored exactly');
  }
}

async function restorePrivateSavedPm2State(pm2Home, state) {
  for (const [name, original] of [
    ['dump.pm2', state.primary],
    ['dump.pm2.bak', state.backup],
  ]) {
    const path = resolve(pm2Home, name);
    const current = await readStableOwnedOptionalFile(path, {
      allowMissing: true,
    });
    if (original.bytes === null) {
      if (current.bytes !== null) await unlink(path);
      await syncDirectory(pm2Home);
      continue;
    }
    await restorePm2Dump(pm2Home, original.bytes, name);
    const restored = await readStableOwnedOptionalFile(path);
    if (!restored.bytes.equals(original.bytes)) {
      throw new Error(`original ${name} bytes were not restored exactly`);
    }
  }
}

function journalSavedFile(state) {
  return state.bytes === null
    ? { present: false }
    : {
      present: true,
      sha256: sha256Bytes(state.bytes),
      bytesBase64: state.bytes.toString('base64'),
      identity: state.identity,
    };
}

async function assertNoPrivateCutoverJournal(pm2Home) {
  const path = resolve(pm2Home, PRIVATE_CUTOVER_JOURNAL);
  const state = await readStableOwnedOptionalFile(path, {
    allowMissing: true,
  });
  if (state.bytes !== null) {
    throw new Error(
      `unfinished private cutover journal requires recovery: ${path}`,
    );
  }
}

async function createPrivateCutoverJournal(pm2Home, {
  candidateProcess,
  expectedOtherProcesses,
  expectedPublicRuntime,
  lockOwner,
  priorHealth,
  priorFence,
  priorProof,
  priorRow,
  savedState,
}) {
  const path = resolve(pm2Home, PRIVATE_CUTOVER_JOURNAL);
  await assertNoPrivateCutoverJournal(pm2Home);
  const bytes = Buffer.from(JSON.stringify(canonicalJson({
    schema: 'dexter-mcp-private-cutover-journal/v1',
    controllerPid: process.pid,
    createdAt: new Date().toISOString(),
    candidateProcess,
    expectedOtherProcesses,
    expectedPublicRuntime,
    lockOwner,
    priorHealth,
    priorFence,
    priorProof,
    priorRow,
    savedState: {
      primary: journalSavedFile(savedState.primary),
      backup: journalSavedFile(savedState.backup),
    },
  })));
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle?.close();
  }
  await chmod(path, 0o600);
  await syncDirectory(pm2Home);
  const persisted = await readStableOwnedOptionalFile(path);
  if (!persisted.bytes.equals(bytes)) {
    throw new Error('private cutover journal is not durable and exact');
  }
  let cleared = false;
  return Object.freeze({
    path,
    async clear() {
      if (cleared) throw new Error('private cutover journal was already cleared');
      const current = await readStableOwnedOptionalFile(path);
      if (!current.bytes.equals(bytes)) {
        throw new Error('private cutover journal changed before commit');
      }
      await unlink(path);
      await syncDirectory(pm2Home);
      cleared = true;
    },
  });
}

function decodeJournalSavedFile(value, label) {
  if (value?.present === false && Object.keys(value).length === 1) {
    return { bytes: null, identity: null, rows: [] };
  }
  if (
    value?.present !== true
    || typeof value.bytesBase64 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.sha256 ?? '')
    || !value.identity
  ) {
    throw new Error(`private cutover journal ${label} is invalid`);
  }
  const bytes = Buffer.from(value.bytesBase64, 'base64');
  if (
    bytes.toString('base64') !== value.bytesBase64
    || sha256Bytes(bytes) !== value.sha256
  ) {
    throw new Error(`private cutover journal ${label} digest changed`);
  }
  const rows = parseJson(bytes.toString('utf8'), `journal ${label}`);
  if (!Array.isArray(rows)) {
    throw new Error(`private cutover journal ${label} is not a PM2 dump`);
  }
  return { bytes, identity: value.identity, rows };
}

async function readPrivateCutoverJournal(pm2Home) {
  const path = resolve(pm2Home, PRIVATE_CUTOVER_JOURNAL);
  const state = await readStableOwnedOptionalFile(path);
  const payload = parseJson(
    state.bytes.toString('utf8'),
    'private cutover journal',
  );
  const expectedKeys = [
    'candidateProcess',
    'controllerPid',
    'createdAt',
    'expectedOtherProcesses',
    'expectedPublicRuntime',
    'lockOwner',
    'priorFence',
    'priorHealth',
    'priorProof',
    'priorRow',
    'savedState',
    'schema',
  ];
  if (
    payload?.schema !== 'dexter-mcp-private-cutover-journal/v1'
    || !Number.isInteger(payload.controllerPid)
    || payload.controllerPid <= 0
    || Number.isNaN(new Date(payload.createdAt).valueOf())
    || !sameJson(Object.keys(payload).sort(), expectedKeys)
    || payload.priorRow?.name !== 'dexter-mcp'
    || payload.lockOwner?.pid !== payload.controllerPid
    || typeof payload.lockOwner?.token !== 'string'
    || payload.lockOwner.token.length === 0
    || Object.keys(payload.lockOwner).length !== 2
    || payload.priorFence?.kind !== 'strict-runtime'
    || !payload.priorProof
    || !payload.priorHealth
    || !payload.candidateProcess
    || !payload.savedState
  ) {
    throw new Error('private cutover journal contract is invalid');
  }
  const savedState = {
    primary: decodeJournalSavedFile(
      payload.savedState.primary,
      'primary dump',
    ),
    backup: decodeJournalSavedFile(
      payload.savedState.backup,
      'backup dump',
    ),
  };
  let cleared = false;
  return Object.freeze({
    path,
    bytes: Buffer.from(state.bytes),
    sha256: sha256Bytes(state.bytes),
    payload: Object.freeze(payload),
    savedState: Object.freeze(savedState),
    async clear() {
      if (cleared) throw new Error('private cutover journal was already cleared');
      const current = await readStableOwnedOptionalFile(path);
      if (!current.bytes.equals(state.bytes)) {
        throw new Error('private cutover journal changed during recovery');
      }
      await unlink(path);
      await syncDirectory(pm2Home);
      cleared = true;
    },
  });
}

function unrelatedRows(rows, services = SERVICE_NAMES) {
  return rows.filter((row) => !services.includes(row?.name));
}

async function recomposeSavedPm2Dump({
  pm2Home,
  originalSavedUnrelatedRows,
  services = SERVICE_NAMES,
}) {
  const generated = await readSavedPm2Dump(pm2Home);
  const targetRows = generated.rows.filter(
    (row) => services.includes(row?.name),
  );
  const rows = [
    ...structuredClone(originalSavedUnrelatedRows),
    ...structuredClone(targetRows),
  ];
  const bytes = Buffer.from(JSON.stringify(rows));
  await restorePm2Dump(pm2Home, bytes);
  return { bytes, rows, targetRows };
}

async function verifySavedPm2BackupExact(pm2Home, expectedBytes) {
  const backup = await readStableOwnedOptionalFile(
    resolve(pm2Home, 'dump.pm2.bak'),
    { allowMissing: true },
  );
  if (backup.bytes === null || !backup.bytes.equals(expectedBytes)) {
    throw new Error('PM2 saved backup is not the exact prior private state');
  }
  return true;
}

function expectedPriorProcesses(prior) {
  return Object.fromEntries(Object.entries(prior).map(
    ([name, snapshot]) => [name, snapshot.savedProcess],
  ));
}

export async function verifySavedPair({
  expectedProcesses,
  expectedUnrelatedProcesses,
  pm2Home = defaultPm2Home(),
}) {
  const { rows: dump } = await readSavedPm2Dump(pm2Home);
  if (!Array.isArray(expectedUnrelatedProcesses)) {
    throw new Error('saved PM2 proof requires unrelated process identities');
  }
  assertUnrelatedPm2Processes(
    dump,
    expectedUnrelatedProcesses,
    'saved PM2 state',
  );
  const expectedNames = Object.keys(expectedProcesses).sort();
  if (expectedNames.length === 0) {
    if (dump.some((row) => SERVICE_NAMES.includes(row?.name))) {
      throw new Error('saved PM2 dump retained an unexpected Dexter MCP process');
    }
    return true;
  }
  if (!sameJson(expectedNames, [...SERVICE_NAMES].sort())) {
    throw new Error('saved PM2 proof requires the exact open-service topology');
  }
  const byName = exactServiceRows(dump);
  for (const name of SERVICE_NAMES) {
    if (!sameJson(
      savedProcessIdentity(name, byName[name]),
      expectedProcesses[name],
    )) {
      throw new Error(`saved PM2 identity mismatch for ${name}`);
    }
  }
  return true;
}

function assertPriorTopology(rows, freshInstall) {
  const selected = rows.filter((row) => SERVICE_NAMES.includes(row?.name));
  if (selected.length === 0) {
    if (!freshInstall) {
      throw new Error(
        'OpenDexter activation requires the exact prior public-service topology; '
        + 'use explicit freshInstall only on a host without the public service',
      );
    }
    return false;
  }
  exactServiceRows(rows);
  return true;
}

export async function activateOpenRelease({
  releaseDirectory,
  releaseCandidate,
  runCommand = execFileAsync,
  fetchImpl = fetch,
  commandEnvironment = defaultCommandEnvironment(),
  pm2Home = defaultPm2Home(),
  freshInstall = false,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  pm2CommandTimeoutMs = DEFAULT_PM2_COMMAND_TIMEOUT_MS,
  pm2StartupTimeoutMs = DEFAULT_PM2_STARTUP_TIMEOUT_MS,
  preflightCandidate = preflightOpenReleaseCandidate,
  verifyPair = verifyRunningOpenReleasePair,
  capturePrior = capturePriorOpenReleasePair,
  verifyPriorRestartability = verifyPriorOpenReleaseRestartability,
  verifyPriorHealth = verifyCapturedPriorOpenReleaseHealth,
  verifyRestored = verifyRestoredOpenReleasePair,
  verifySaved = verifySavedPair,
  verifyPm2Executable = verifyProductionPm2Executable,
  prepareWidgetAssets = publishAndVerifyOpenWidgetAssets,
  verifyWidgetAssets = verifyPublicOpenWidgetAssets,
  privateProcessProofOptions = {},
} = {}) {
  const release = releaseCandidate
    ?? readSealedOpenRelease(releaseDirectory);
  const ecosystem = resolve(release.releaseDir, 'ecosystem.production.cjs');

  // This reads and validates the protected env file, including the dedicated
  // governed-action secret, before even a read-only PM2 command. Missing,
  // legacy-only, weak, or unprotected configuration cannot mutate PM2 state.
  const preflight = await preflightCandidate({
    release,
    commandEnvironment,
    pm2Home,
  });
  const pm2Executable = await verifyPm2Executable();
  if (pm2Executable !== PRODUCTION_PM2_EXECUTABLE) {
    throw new Error('verified PM2 executable is not the production binary');
  }
  // Publish only immutable release bytes, without deleting any historical
  // hashes, and prove every JS/CSS URL referenced by release HTML before the
  // first PM2 read or mutation. The old service remains live throughout this
  // append-only preparation phase.
  const widgetAssetPlan = await prepareWidgetAssets({
    release,
    fetchImpl,
  });
  const runPm2 = boundedPm2Runner({
    runCommand,
    commandEnvironment: {
      ...commandEnvironment,
      PM2_HOME: pm2Home,
    },
    nodeExecutable: PRODUCTION_NODE_EXECUTABLE,
    pm2Executable,
    timeoutMs: pm2CommandTimeoutMs,
    startupTimeoutMs: pm2StartupTimeoutMs,
  });
  await assertNoPrivateCutoverJournal(pm2Home);
  const cutoverLock = await acquireReleaseCutoverLock(pm2Home);
  try {
  const before = await pm2List(runPm2);
  const hasPriorPair = assertPriorTopology(before, freshInstall);
  const prior = hasPriorPair
    ? await capturePrior(before, fetchImpl, { healthTimeoutMs })
    : {};
  if (hasPriorPair) {
    await verifyPriorRestartability({ prior, rows: before });
  }
  const priorProcesses = expectedPriorProcesses(prior);
  const preservedPrivateProcess = await preservedPrivateProcessSnapshot(
    before,
    privateProcessProofOptions,
  );
  if (
    (!freshInstall && preservedPrivateProcess === null)
    || (freshInstall && preservedPrivateProcess !== null)
  ) {
    throw new Error(
      freshInstall
        ? 'freshInstall requires the private Dexter process to be absent'
        : 'OpenDexter cutover requires the exact preserved private Dexter process',
    );
  }
  const savedBefore = await readSavedPm2Dump(pm2Home, { allowMissing: true });
  const originalSavedUnrelatedRows = unrelatedRows(savedBefore.rows);
  const savedUnrelatedProcesses = unrelatedPm2Snapshot(savedBefore.rows);
  if (
    !hasPriorPair
    && savedBefore.rows.some((row) => SERVICE_NAMES.includes(row?.name))
  ) {
    throw new Error(
      'freshInstall requires no saved Dexter MCP process definitions',
    );
  }

  // Persist and prove the exact prior public service before any PM2 change.
  // A failed candidate is restored from these bytes, not reconstructed.
  let priorResurrectDump;
  let priorSavedDump;
  try {
    await runPm2(['save', '--force']);
    const recomposed = await recomposeSavedPm2Dump({
      pm2Home,
      originalSavedUnrelatedRows,
    });
    priorSavedDump = recomposed.bytes;
    priorResurrectDump = Buffer.from(JSON.stringify(recomposed.targetRows));
    await verifySaved({
      expectedProcesses: priorProcesses,
      expectedUnrelatedProcesses: savedUnrelatedProcesses,
      pm2Home,
      phase: 'prior',
    });
    const liveAfterPriorSave = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      liveAfterPriorSave,
      'prior save',
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    if (hasPriorPair) {
      await verifyPriorRestartability({
        prior,
        rows: liveAfterPriorSave,
        verifyRemoteSource: true,
      });
    }
    await verifyProtectedEnvironmentStillExact(preflight);
    const finalPreDeleteRows = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      finalPreDeleteRows,
      'final pre-delete proof',
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    if (hasPriorPair) {
      await verifyPriorRestartability({
        prior,
        rows: finalPreDeleteRows,
      });
    }
    await verifyProtectedEnvironmentStillExact(preflight);
    if (hasPriorPair) {
      await verifyPriorHealth({
        prior,
        rows: finalPreDeleteRows,
        fetchImpl,
        healthTimeoutMs,
      });
    }
    before.splice(0, before.length, ...finalPreDeleteRows);
  } catch (priorSaveError) {
    try {
      await restoreOriginalSavedPm2Dump(pm2Home, savedBefore.bytes);
    } catch (restoreError) {
      throw new Error(
        'OpenDexter could not prove prior PM2 state and could not restore '
        + 'the original saved state',
      );
    }
    throw new Error(
      'OpenDexter could not prove prior PM2 state; the original saved '
      + 'state was restored',
    );
  }

  try {
    await deleteServices(
      before,
      runPm2,
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    await startOpenReleaseCandidate({
      ecosystem,
      pm2Home,
      runPm2,
    });
    const candidateRows = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      candidateRows,
      'candidate activation',
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    await verifyPair({
      release,
      rows: candidateRows,
      expectedProcesses: preflight.expectedProcesses,
      fetchImpl,
      healthTimeoutMs,
    });
    const candidateSavedProcesses = Object.fromEntries(SERVICE_NAMES.map(
      (name) => [
        name,
        savedProcessIdentity(
          name,
          candidateRows.find((row) => row?.name === name),
        ),
      ],
    ));
    await runPm2(['save', '--force']);
    await recomposeSavedPm2Dump({
      pm2Home,
      originalSavedUnrelatedRows,
    });
    await verifySaved({
      expectedProcesses: candidateSavedProcesses,
      expectedUnrelatedProcesses: savedUnrelatedProcesses,
      pm2Home,
      phase: 'candidate',
    });
    const finalRows = await pm2List(runPm2);
    await assertPreservedPrivateProcess(
      finalRows,
      'post-save candidate activation',
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    const verified = await verifyPair({
      release,
      rows: finalRows,
      expectedProcesses: preflight.expectedProcesses,
      fetchImpl,
      healthTimeoutMs,
    });
    for (const name of SERVICE_NAMES) {
      const finalRow = finalRows.find((row) => row?.name === name);
      if (!sameJson(
        savedProcessIdentity(name, finalRow),
        candidateSavedProcesses[name],
      )) {
        throw new Error(`${name} PM2 restart definition changed after save`);
      }
    }
    await verifyProtectedEnvironmentStillExact(preflight);
    // Re-prove the public asset boundary after candidate activation/save. A
    // CDN, MIME, or byte mismatch here enters the existing exact rollback path
    // rather than reporting a successful cutover with blank renderers.
    await verifyWidgetAssets({
      plan: widgetAssetPlan,
      fetchImpl,
    });
    return { release, ...verified };
  } catch (activationError) {
    try {
      // Resurrect skips a saved app when a process with the same name remains.
      // Therefore rollback first performs bounded delete retries and obtains a
      // fresh PM2/private-runtime proof that the public name is absent.
      await deleteServicesForRollback(
        runPm2,
        preservedPrivateProcess,
        privateProcessProofOptions,
        pm2CommandTimeoutMs,
      );
      await restorePm2Dump(pm2Home, priorResurrectDump);
      if (hasPriorPair) {
        try {
          await runPm2(['resurrect']);
        } finally {
          await restorePm2Dump(pm2Home, priorSavedDump);
        }
        await waitFor(async () => {
          const rows = await pm2List(runPm2);
          await assertPreservedPrivateProcess(
            rows,
            'rollback',
            preservedPrivateProcess,
            privateProcessProofOptions,
          );
          await verifyPriorRestartability({
            prior,
            rows,
            runtimeMode: 'restored',
          });
          await verifyRestored({
            prior,
            rows,
            fetchImpl,
            healthTimeoutMs,
          });
          return true;
        }, { timeoutMs: pm2StartupTimeoutMs });
      } else {
        await restorePm2Dump(pm2Home, priorSavedDump);
        await waitFor(async () => {
          const rows = await pm2List(runPm2);
          await assertPreservedPrivateProcess(
            rows,
            'fresh-install rollback',
            preservedPrivateProcess,
            privateProcessProofOptions,
          );
          return rows.every((row) => !SERVICE_NAMES.includes(row?.name));
        });
      }
      await runPm2(['save', '--force']);
      await recomposeSavedPm2Dump({
        pm2Home,
        originalSavedUnrelatedRows,
      });
      await verifySaved({
        expectedProcesses: priorProcesses,
        expectedUnrelatedProcesses: savedUnrelatedProcesses,
        pm2Home,
        phase: 'rollback',
      });
      if (!hasPriorPair) {
        // A fresh-install rollback must return the saved-state boundary to
        // exactly what existed before activation, including restoring the
        // absence of dump.pm2. The save/proof above still demonstrates that
        // PM2 generated no target definitions before those original bytes are
        // restored.
        await restoreOriginalSavedPm2Dump(pm2Home, savedBefore.bytes);
      }
      const finalRollbackRows = await pm2List(runPm2);
      await assertPreservedPrivateProcess(
        finalRollbackRows,
        'post-save rollback',
        preservedPrivateProcess,
        privateProcessProofOptions,
      );
      if (hasPriorPair) {
        await verifyPriorRestartability({
          prior,
          rows: finalRollbackRows,
          runtimeMode: 'restored',
        });
        await verifyRestored({
          prior,
          rows: finalRollbackRows,
          fetchImpl,
          healthTimeoutMs,
        });
      } else if (finalRollbackRows.some(
        (row) => SERVICE_NAMES.includes(row?.name),
      )) {
        throw new Error('fresh-install rollback retained a Dexter MCP process');
      }
    } catch (rollbackError) {
      throw new Error(
        'OpenDexter candidate failed and rollback could not be proven',
      );
    }
    throw new Error(
      'OpenDexter candidate failed; the exact prior state was restored',
    );
  }
  } finally {
    await cutoverLock.release();
  }
}

const PRIVATE_RELEASE_SERVICES = Object.freeze(['dexter-mcp']);
const PRIVATE_CUTOVER_JOURNAL =
  '.dexter-mcp-private-cutover-journal.json';

function exactNamedRow(rows, name, label = name) {
  const selected = rows.filter((row) => row?.name === name);
  if (selected.length !== 1) {
    throw new Error(`PM2 must contain exactly one ${label} process`);
  }
  return selected[0];
}

function stablePrivateHealth(body, expectedPort) {
  const hasService = body?.service !== undefined;
  const hasTools = body?.tools !== undefined;
  if (
    body?.ok !== true
    || body.status !== 'ok'
    || Number(body.port) !== expectedPort
    || (hasService && body.service !== 'dexter-mcp')
    || (hasTools && (
      !Array.isArray(body.tools)
      || body.tools.length === 0
      || body.tools.some((name) => typeof name !== 'string')
      || new Set(body.tools).size !== body.tools.length
    ))
    || (!hasService && !hasTools && (
      typeof body.oauth !== 'boolean'
      || typeof body.issuer !== 'string'
      || body.issuer.length === 0
      || typeof body.base !== 'string'
      || body.base.length === 0
    ))
  ) {
    throw new Error('private Dexter health identity is incomplete');
  }
  const stable = structuredClone(body);
  delete stable.timestamp;
  delete stable.sessions;
  return canonicalJson(stable);
}

function restartableProcessDefinition(row) {
  const declaredEnvironment = declaredProcessEnvironment(
    row,
    row?.name ?? '',
  );
  return canonicalJson({
    definition: snapshotPm2ProcessDefinition(row),
    declaredEnvironment,
  });
}

export async function verifyLegacyPrivateInterpreter({
  expectedInterpreter =
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreter,
  interpreter = expectedInterpreter,
  expectedVersion =
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterVersion,
  expectedSha256 =
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterSha256,
  expectedIdentity =
    LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreterIdentity,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
  runCommandImpl = execFileAsync,
} = {}) {
  if (
    interpreter !== expectedInterpreter
    || await realpathImpl(interpreter) !== interpreter
    || !/^v\d+\.\d+\.\d+$/.test(expectedVersion ?? '')
    || !/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')
    || !expectedIdentity
    || !['dev', 'ino', 'mode', 'nlink', 'uid', 'gid'].every(
      (key) => Number.isInteger(expectedIdentity[key]),
    )
    || expectedIdentity.uid !== process.getuid()
  ) {
    throw new Error('legacy private interpreter contract is invalid');
  }
  const before = await lstatImpl(interpreter);
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.dev !== expectedIdentity.dev
    || before.ino !== expectedIdentity.ino
    || (before.mode & 0o7777) !== expectedIdentity.mode
    || before.nlink !== expectedIdentity.nlink
    || before.uid !== expectedIdentity.uid
    || before.gid !== expectedIdentity.gid
    || (before.mode & 0o022) !== 0
    || (before.mode & 0o100) === 0
  ) {
    throw new Error('legacy private interpreter filesystem identity is unsafe');
  }
  const bytes = await readFileImpl(interpreter);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) {
    throw new Error('legacy private interpreter digest changed');
  }
  let version;
  try {
    const result = await runCommandImpl(interpreter, ['--version'], {
      encoding: 'utf8',
      env: {
        HOME: '/home/branchmanager',
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
      killSignal: 'SIGKILL',
    });
    version = result.stdout.trim();
  } catch (error) {
    throw new Error('legacy private interpreter version is unreadable', {
      cause: error,
    });
  }
  const after = await lstatImpl(interpreter);
  if (
    version !== expectedVersion
    || after.dev !== expectedIdentity.dev
    || after.ino !== expectedIdentity.ino
    || (after.mode & 0o7777) !== expectedIdentity.mode
    || after.nlink !== expectedIdentity.nlink
    || after.uid !== expectedIdentity.uid
    || after.gid !== expectedIdentity.gid
    || !sameEnvironmentFileIdentity(before, after)
  ) {
    throw new Error('legacy private interpreter identity changed');
  }
  return Object.freeze({
    path: interpreter,
    version,
    sha256: expectedSha256,
    identity: protectedEnvironmentFileIdentity(after),
  });
}

export async function verifyPriorPrivateReleaseRestartability({
  row,
  expectedRuntime,
  expectedSavedRow,
  readSealedReleaseImpl = readSealedOpenRelease,
  readLegacyReleaseImpl = readSealedLegacyOpenRelease,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
  processProofOptions = {},
  verifyLegacyInterpreterImpl = verifyLegacyPrivateInterpreter,
}) {
  if (row?.name !== 'dexter-mcp') {
    throw new Error('private restart proof requires dexter-mcp');
  }
  const runtime = await runningServiceProcessSnapshot(
    'dexter-mcp',
    [row],
    processProofOptions,
  );
  if (!samePm2ProcessSnapshot(runtime, expectedRuntime)) {
    throw new Error('private Dexter runtime changed before restart proof');
  }
  if (!sameJson(
    restartableProcessDefinition(row),
    restartableProcessDefinition(expectedSavedRow),
  )) {
    throw new Error('private Dexter saved definition is not restartable exactly');
  }

  const processIdentity = stableProcessIdentity('dexter-mcp', row);
  verifyPrivateExecutionArgumentsAreEmpty(row, 'prior private runtime');
  if (Object.values(processIdentity.forbiddenLoaderEnvironment)
    .some((value) => value !== null)) {
    throw new Error('prior private runtime contains a forbidden loader input');
  }
  const releaseDir = await realpathImpl(processIdentity.cwd ?? '');
  let expectedScript;
  let expectedInterpreter;
  let releaseProof;
  let legacy = false;
  if (basename(releaseDir) === LEGACY_PRIVATE_RELEASE_CONTRACT.directoryName) {
    legacy = true;
    const release = await readLegacyReleaseImpl(
      releaseDir,
      LEGACY_PRIVATE_RELEASE_CONTRACT,
    );
    if (
      release.releaseDir !== releaseDir
      || processIdentity.release !== null
      || processIdentity.roster !== null
    ) {
      throw new Error('prior private legacy release identity mismatch');
    }
    expectedScript = release.entrypoint;
    expectedInterpreter = LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.interpreter;
    releaseProof = {
      kind: release.kind,
      sourceIdentity: release.sourceIdentity,
      provenance: release.provenance,
      rollbackIdentity: release.rollbackIdentity,
    };
  } else {
    const release = await readSealedReleaseImpl(releaseDir);
    if (
      release.releaseDir !== releaseDir
      || release.provenance.schema !== 'dexter-mcp-immutable-release/v4'
      || !sameJson(
        releaseIdentityForService(release, 'dexter-mcp'),
        processIdentity.release,
      )
      || !sameJson(
        release.provenance.rosters['dexter-mcp'],
        processIdentity.roster,
      )
    ) {
      throw new Error('prior private sealed release identity mismatch');
    }
    expectedScript = resolve(
      releaseDir,
      release.provenance.entrypoints['dexter-mcp'],
    );
    expectedInterpreter = OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE;
    releaseProof = {
      kind: release.provenance.schema,
      identity: releaseIdentityForService(release, 'dexter-mcp'),
      roster: release.provenance.rosters['dexter-mcp'],
    };
  }
  if (
    processIdentity.script !== expectedScript
    || await realpathImpl(processIdentity.script ?? '')
      !== await realpathImpl(expectedScript)
  ) {
    throw new Error('prior private script is not the sealed entrypoint');
  }
  const interpreter = await realpathImpl(processIdentity.interpreter ?? '');
  if (
    interpreter !== await realpathImpl(expectedInterpreter)
    || interpreter !== expectedRuntime.kernel.executable
    || !commandLineMatches(
      expectedRuntime.kernel.commandLine,
      interpreter,
      expectedScript,
    )
  ) {
    throw new Error('prior private interpreter is not restartable exactly');
  }
  let interpreterProof = Object.freeze({ path: interpreter });
  if (legacy) {
    interpreterProof = await verifyLegacyInterpreterImpl({ interpreter });
    if (
      !interpreterProof
      || interpreterProof.path !== interpreter
      || typeof interpreterProof.sha256 !== 'string'
      || typeof interpreterProof.version !== 'string'
      || !interpreterProof.identity
    ) {
      throw new Error('prior private legacy interpreter proof is incomplete');
    }
  }

  const envFile = processIdentity.envFile;
  if (
    !isAbsolute(envFile ?? '')
    || (legacy
      && envFile !== LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.environmentFile)
  ) {
    throw new Error('prior private environment file is unavailable');
  }
  const before = await lstatImpl(envFile);
  if (
    !protectedEnvironmentStat(before)
    || await realpathImpl(envFile) !== envFile
  ) {
    throw new Error('prior private environment file is not exact');
  }
  const environmentBytes = await readFileImpl(envFile);
  const after = await lstatImpl(envFile);
  if (
    !protectedEnvironmentStat(after)
    || !sameEnvironmentFileIdentity(before, after)
  ) {
    throw new Error('prior private environment file changed during proof');
  }
  const environmentSha256 = createHash('sha256')
    .update(environmentBytes)
    .digest('hex');
  if (legacy) {
    verifyLegacyPersistedEnvironment(row, environmentBytes, {
      label: 'prior private legacy runtime',
      persistedEnvironmentKeys:
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.persistedEnvironmentKeys,
      environmentFileKeys:
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.environmentFileKeys,
    });
  } else {
    if (environmentSha256 !== processIdentity.envFileSha256) {
      throw new Error('prior private environment-file digest mismatch');
    }
    const persisted = exactPersistedEnvironment(row);
    const applicationEnvironment = parseEnv(environmentBytes.toString('utf8'));
    for (const key of ECOSYSTEM_REMOVED_ENV_KEYS) {
      delete applicationEnvironment[key];
    }
    for (const [key, value] of Object.entries(applicationEnvironment)) {
      if (
        !Object.hasOwn(persisted, key)
        || String(persisted[key]) !== value
      ) {
        throw new Error(`prior private persisted environment does not match ${key}`);
      }
    }
  }
  return Object.freeze({
    release: canonicalJson(releaseProof),
    interpreter: canonicalJson(interpreterProof),
    environment: Object.freeze({
      path: envFile,
      sha256: environmentSha256,
      identity: protectedEnvironmentFileIdentity(after),
    }),
  });
}

/**
 * Re-read every mutable input needed to restart the captured private process.
 * This runs after the rejected candidate has been removed and immediately
 * before PM2 evaluates the one-service rollback configuration.
 */
export async function verifyPrivateRollbackInputsStillExact({
  row,
  priorProof,
  readSealedReleaseImpl = readSealedOpenRelease,
  readLegacyReleaseImpl = readSealedLegacyOpenRelease,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
  verifyLegacyInterpreterImpl = verifyLegacyPrivateInterpreter,
}) {
  if (row?.name !== 'dexter-mcp' || !priorProof) {
    throw new Error('private rollback source proof is incomplete');
  }
  const processIdentity = stableProcessIdentity('dexter-mcp', row);
  verifyPrivateExecutionArgumentsAreEmpty(row, 'private rollback source');
  if (Object.values(processIdentity.forbiddenLoaderEnvironment)
    .some((value) => value !== null)) {
    throw new Error('private rollback source contains a forbidden loader input');
  }
  const releaseDir = await realpathImpl(processIdentity.cwd ?? '');
  const legacy = basename(releaseDir)
    === LEGACY_PRIVATE_RELEASE_CONTRACT.directoryName;
  let currentReleaseProof;
  let expectedScript;
  let currentInterpreterProof;
  if (legacy) {
    const release = await readLegacyReleaseImpl(
      releaseDir,
      LEGACY_PRIVATE_RELEASE_CONTRACT,
    );
    currentReleaseProof = {
      kind: release.kind,
      sourceIdentity: release.sourceIdentity,
      provenance: release.provenance,
      rollbackIdentity: release.rollbackIdentity,
    };
    expectedScript = release.entrypoint;
    const interpreter = await realpathImpl(processIdentity.interpreter ?? '');
    currentInterpreterProof = await verifyLegacyInterpreterImpl({
      interpreter,
    });
  } else {
    const release = await readSealedReleaseImpl(releaseDir);
    if (
      release.releaseDir !== releaseDir
      || release.provenance.schema !== 'dexter-mcp-immutable-release/v4'
    ) {
      throw new Error('private rollback sealed release identity mismatch');
    }
    currentReleaseProof = {
      kind: release.provenance.schema,
      identity: releaseIdentityForService(release, 'dexter-mcp'),
      roster: release.provenance.rosters['dexter-mcp'],
    };
    expectedScript = resolve(
      releaseDir,
      release.provenance.entrypoints['dexter-mcp'],
    );
    const interpreter = await realpathImpl(processIdentity.interpreter ?? '');
    if (
      interpreter !== await realpathImpl(
        OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
      )
    ) {
      throw new Error('private rollback interpreter is not exact');
    }
    currentInterpreterProof = { path: interpreter };
  }
  if (
    processIdentity.script !== expectedScript
    || await realpathImpl(processIdentity.script ?? '')
      !== await realpathImpl(expectedScript)
    || !sameJson(currentReleaseProof, priorProof.release)
    || !sameJson(currentInterpreterProof, priorProof.interpreter)
  ) {
    throw new Error('private rollback code or interpreter changed after proof');
  }

  const currentEnvironment = await readStableProtectedEnvironment({
    configuredPath: processIdentity.envFile,
    lstatImpl,
    readFileImpl,
    realpathImpl,
  });
  if (
    currentEnvironment.envFile !== priorProof.environment?.path
    || currentEnvironment.envFileSha256 !== priorProof.environment?.sha256
    || !sameJson(
      currentEnvironment.envFileIdentity,
      priorProof.environment?.identity,
    )
  ) {
    throw new Error('private rollback environment changed after proof');
  }
  if (legacy) {
    verifyLegacyPersistedEnvironment(row, currentEnvironment.envFileBytes, {
      label: 'private rollback legacy runtime',
      persistedEnvironmentKeys:
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.persistedEnvironmentKeys,
      environmentFileKeys:
        LEGACY_PRIVATE_RELEASE_CONTRACT.runtime.environmentFileKeys,
    });
  } else {
    const persisted = exactPersistedEnvironment(row);
    const applicationEnvironment = parseEnv(
      currentEnvironment.envFileBytes.toString('utf8'),
    );
    for (const key of ECOSYSTEM_REMOVED_ENV_KEYS) {
      delete applicationEnvironment[key];
    }
    for (const [key, value] of Object.entries(applicationEnvironment)) {
      if (
        !Object.hasOwn(persisted, key)
        || String(persisted[key]) !== value
      ) {
        throw new Error(
          `private rollback persisted environment does not match ${key}`,
        );
      }
    }
  }
  return true;
}

async function assertPrivateCutoverPreservation({
  rows,
  expectedOtherProcesses,
  expectedPublicRuntime,
  phase,
  processProofOptions,
}) {
  if (!samePm2ProcessSnapshot(
    snapshotUnrelatedPm2Processes(rows, PRIVATE_RELEASE_SERVICES),
    expectedOtherProcesses,
  )) {
    throw new Error(`${phase} changed another PM2 process definition`);
  }
  if (!samePm2ProcessSnapshot(
    await runningServiceProcessSnapshot(
      'dexter-open-mcp',
      rows,
      processProofOptions,
    ),
    expectedPublicRuntime,
  )) {
    throw new Error(`${phase} changed the public OpenDexter process`);
  }
}

async function expectedPrivateCandidateRuntime({
  rows,
  expectedProcess,
  processProofOptions,
}) {
  const row = exactNamedRow(rows, 'dexter-mcp', 'candidate private Dexter');
  if (!sameJson(
    stableProcessIdentity('dexter-mcp', row),
    expectedProcess,
  )) {
    throw new Error('private candidate process identity is not exact');
  }
  return runningServiceProcessSnapshot(
    'dexter-mcp',
    rows,
    processProofOptions,
  );
}

async function privateDeletionFence(
  row,
  processProofOptions,
  { kind = 'strict-runtime' } = {},
) {
  if (row?.name !== 'dexter-mcp') {
    throw new Error('private deletion fence requires dexter-mcp');
  }
  const pmId = row?.pm_id ?? processField(row, 'pm_id');
  const pid = row?.pid ?? null;
  const status = processField(row, 'status');
  const restartTime = processField(row, 'restart_time');
  const unstableRestarts = processField(row, 'unstable_restarts');
  if (
    !Number.isInteger(pmId)
    || pmId < 0
    || !(pid === null || (Number.isInteger(pid) && pid >= 0))
    || typeof status !== 'string'
    || status.length === 0
    || !Number.isInteger(restartTime)
    || restartTime < 0
    || !Number.isInteger(unstableRestarts)
    || unstableRestarts < 0
  ) {
    throw new Error('private deletion fence runtime identity is incomplete');
  }
  if (!['strict-runtime', 'candidate', 'prior-generation'].includes(kind)) {
    throw new Error('private deletion fence kind is invalid');
  }
  const generationOnly = kind !== 'strict-runtime';
  const onlineRuntime = !generationOnly
    && status === PM2_STATUS_ONLINE
    && pid > 0
    ? await runningServiceProcessSnapshot(
      'dexter-mcp',
      [row],
      processProofOptions,
    )
    : null;
  return canonicalJson({
    kind,
    pmId,
    process: generationOnly
      ? privateGenerationIdentity(row)
      : savedProcessIdentity('dexter-mcp', row),
    ...(generationOnly ? {} : {
      pid,
      status,
      restartTime,
      unstableRestarts,
      onlineRuntime,
    }),
  });
}

async function expectedPrivateCandidateDeletionFence({
  rows,
  expectedProcess,
  processProofOptions,
}) {
  const candidates = rows.filter((row) => row?.name === 'dexter-mcp');
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) {
    throw new Error('candidate private Dexter PM2 row is not unique');
  }
  if (!sameJson(
    processIdentityWithoutNamespaceProof('dexter-mcp', candidates[0]),
    expectedProcess,
  )) {
    throw new Error('private candidate process identity is not exact');
  }
  return privateDeletionFence(candidates[0], processProofOptions, {
    kind: 'candidate',
  });
}

async function expectedPrivatePriorGenerationDeletionFence({
  row,
  priorRow,
  processProofOptions,
}) {
  if (
    !sameJson(
      processIdentityWithoutNamespaceProof('dexter-mcp', row),
      processIdentityWithoutNamespaceProof('dexter-mcp', priorRow),
    )
    || !sameJson(
      snapshotPm2ProcessDefinition(row),
      snapshotPm2ProcessDefinition(priorRow),
    )
  ) {
    throw new Error('private recovery prior generation is not exact');
  }
  return privateDeletionFence(row, processProofOptions, {
    kind: 'prior-generation',
  });
}

async function deletePrivateServiceForCutover({
  beforeDelete = async () => {},
  deletionPhase,
  runPm2,
  expectedOtherProcesses,
  expectedPublicRuntime,
  expectedTargetFence,
  onMutation = () => {},
  processProofOptions,
  timeoutMs,
}) {
  if (expectedTargetFence === undefined) {
    throw new Error('private deletion requires an exact expected target');
  }
  const initial = await pm2List(runPm2);
  await assertPrivateCutoverPreservation({
    rows: initial,
    expectedOtherProcesses,
    expectedPublicRuntime,
    phase: 'private pre-delete proof',
    processProofOptions,
  });
  const targetRows = initial.filter((row) => row?.name === 'dexter-mcp');
  if (expectedTargetFence === null) {
    if (targetRows.length !== 0) {
      throw new Error('private Dexter appeared before deletion');
    }
    return;
  }
  const currentTargetFence = targetRows.length === 1
    ? await privateDeletionFence(
      targetRows[0],
      processProofOptions,
      { kind: expectedTargetFence.kind },
    )
    : null;
  if (targetRows.length !== 1 || !sameJson(
    currentTargetFence,
    expectedTargetFence,
  )) {
    throw new Error('private Dexter runtime changed before deletion');
  }
  const targetPids = targetRows
    .map((row) => row?.pid)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  if (targetRows.length > 0) {
    const targetPmId = expectedTargetFence.pmId;
    if (!Number.isInteger(targetPmId) || targetPmId < 0) {
      throw new Error('private deletion target has no exact PM2 id');
    }
    await beforeDelete(Object.freeze({
      phase: deletionPhase,
      pm2Id: targetPmId,
      pid: targetRows[0].pid,
    }));
    onMutation();
    await runPm2(['delete', String(targetPmId)]);
  }
  await waitFor(async () => {
    const rows = await pm2List(runPm2);
    await assertPrivateCutoverPreservation({
      rows,
      expectedOtherProcesses,
      expectedPublicRuntime,
      phase: 'private deletion',
      processProofOptions,
    });
    const exited = (await Promise.all(targetPids.map(processExists)))
      .every((exists) => !exists);
    return rows.every((row) => row?.name !== 'dexter-mcp') && exited;
  }, {
    timeoutMs,
    intervalMs: Math.min(100, Math.max(1, Math.floor(timeoutMs / 4))),
  });
}

/**
 * Transactionally replace only the private OAuth MCP process from a v4 sealed
 * release. The public OpenDexter PID/kernel and every other PM2 definition are
 * bound before the first mutation and re-proved after start, save, and any
 * rollback. Standard deploy:mcp continues to call activateOpenRelease above.
 */
export async function activatePrivateRelease({
  releaseDirectory,
  releaseCandidate,
  runCommand = execFileAsync,
  fetchImpl = fetch,
  commandEnvironment = defaultCommandEnvironment(),
  pm2Home = defaultPm2Home(),
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  pm2CommandTimeoutMs = DEFAULT_PM2_COMMAND_TIMEOUT_MS,
  pm2StartupTimeoutMs = DEFAULT_PM2_STARTUP_TIMEOUT_MS,
  preflightCandidate = preflightOpenReleaseCandidate,
  verifyCandidate = verifyRunningOpenReleasePair,
  verifyPriorRestartability = verifyPriorPrivateReleaseRestartability,
  verifyRollbackInputs = verifyPrivateRollbackInputsStillExact,
  verifyDaemon = verifyPm2DaemonLaunchAuthority,
  verifyPm2Executable = verifyProductionPm2Executable,
  processProofOptions = {},
  beforePrivateDelete = async () => {},
} = {}) {
  const release = releaseCandidate
    ?? readSealedOpenRelease(releaseDirectory);
  if (
    release?.provenance?.schema !== 'dexter-mcp-immutable-release/v4'
    || release.provenance.entrypoints?.['dexter-mcp']
      !== 'production-bootstrap.mjs'
    || !Array.isArray(release.provenance.rosters?.['dexter-mcp'])
  ) {
    throw new Error('private cutover requires a v4 sealed Dexter MCP release');
  }
  const preflight = await preflightCandidate({
    release,
    services: PRIVATE_RELEASE_SERVICES,
    commandEnvironment,
    pm2Home,
  });
  const pm2Executable = await verifyPm2Executable();
  if (pm2Executable !== PRODUCTION_PM2_EXECUTABLE) {
    throw new Error('verified PM2 executable is not the production binary');
  }
  const runPm2 = boundedPm2Runner({
    runCommand,
    commandEnvironment: {
      ...commandEnvironment,
      PM2_HOME: pm2Home,
    },
    nodeExecutable: PRODUCTION_NODE_EXECUTABLE,
    pm2Executable,
    timeoutMs: pm2CommandTimeoutMs,
    startupTimeoutMs: pm2StartupTimeoutMs,
  });
  const cutoverLock = await acquireReleaseCutoverLock(pm2Home);
  try {
  const before = await pm2List(runPm2);
  const priorPrivateRow = exactNamedRow(before, 'dexter-mcp', 'private Dexter');
  exactNamedRow(before, 'dexter-open-mcp', 'public OpenDexter');
  await verifyDaemon({ pm2Home });
  const expectedOtherProcesses = snapshotUnrelatedPm2Processes(
    before,
    PRIVATE_RELEASE_SERVICES,
  );
  const expectedPublicRuntime = await runningServiceProcessSnapshot(
    'dexter-open-mcp',
    before,
    processProofOptions,
  );
  const priorPrivateRuntime = await runningServiceProcessSnapshot(
    'dexter-mcp',
    before,
    processProofOptions,
  );
  const priorPrivateFence = await privateDeletionFence(
    priorPrivateRow,
    processProofOptions,
  );
  const priorPrivateHealth = stablePrivateHealth(await readLoopbackHealth(
    'dexter-mcp',
    priorPrivateRow,
    fetchImpl,
    healthTimeoutMs,
  ), expectedHealthPort('dexter-mcp', priorPrivateRow));
  const savedBefore = await readPrivateSavedPm2State(pm2Home);
  const originalSavedOtherRows = unrelatedRows(
    savedBefore.primary.rows,
    PRIVATE_RELEASE_SERVICES,
  );
  const expectedSavedOtherProcesses = snapshotUnrelatedPm2Processes(
    savedBefore.primary.rows,
    PRIVATE_RELEASE_SERVICES,
  );
  let priorSavedPrivateRow;
  const finalPreSave = await pm2List(runPm2);
  await assertPrivateCutoverPreservation({
    rows: finalPreSave,
    expectedOtherProcesses,
    expectedPublicRuntime,
    phase: 'private pre-save proof',
    processProofOptions,
  });
  if (!samePm2ProcessSnapshot(
    await runningServiceProcessSnapshot(
      'dexter-mcp',
      finalPreSave,
      processProofOptions,
    ),
    priorPrivateRuntime,
  )) {
    throw new Error('private Dexter runtime changed before saved-state journal');
  }
  const priorPrivateRestartProof = await verifyPriorRestartability({
    row: exactNamedRow(finalPreSave, 'dexter-mcp', 'private Dexter'),
    expectedRuntime: priorPrivateRuntime,
    expectedSavedRow: priorPrivateRow,
    processProofOptions,
  });
  await verifyProtectedEnvironmentStillExact(preflight);
  const cutoverJournal = await createPrivateCutoverJournal(pm2Home, {
    candidateProcess: preflight.expectedProcesses['dexter-mcp'],
    expectedOtherProcesses,
    expectedPublicRuntime,
    lockOwner: cutoverLock.owner,
    priorHealth: priorPrivateHealth,
    priorFence: priorPrivateFence,
    priorProof: priorPrivateRestartProof,
    priorRow: priorPrivateRow,
    savedState: savedBefore,
  });
  let mutationStarted = false;
  let candidatePrivateFence;
  let priorRecomposedBytes;

  try {
    await runPm2(['save', '--force']);
    const recomposed = await recomposeSavedPm2Dump({
      pm2Home,
      originalSavedUnrelatedRows: originalSavedOtherRows,
      services: PRIVATE_RELEASE_SERVICES,
    });
    priorRecomposedBytes = recomposed.bytes;
    priorSavedPrivateRow = exactNamedRow(
      recomposed.rows,
      'dexter-mcp',
      'saved private Dexter',
    );
    if (!sameJson(
      restartableProcessDefinition(priorSavedPrivateRow),
      restartableProcessDefinition(priorPrivateRow),
    )) {
      throw new Error('saved private Dexter definition cannot restart the live process');
    }
    if (!samePm2ProcessSnapshot(
      snapshotUnrelatedPm2Processes(
        recomposed.rows,
        PRIVATE_RELEASE_SERVICES,
      ),
      expectedSavedOtherProcesses,
    )) {
      throw new Error('private preflight changed another saved PM2 definition');
    }
    const finalPreDelete = await pm2List(runPm2);
    await assertPrivateCutoverPreservation({
      rows: finalPreDelete,
      expectedOtherProcesses,
      expectedPublicRuntime,
      phase: 'private pre-delete proof',
      processProofOptions,
    });
    if (!samePm2ProcessSnapshot(
      await runningServiceProcessSnapshot(
        'dexter-mcp',
        finalPreDelete,
        processProofOptions,
      ),
      priorPrivateRuntime,
    )) {
      throw new Error('private Dexter runtime changed before cutover');
    }
    await verifyProtectedEnvironmentStillExact(preflight);
  } catch (preMutationError) {
    await restorePrivateSavedPm2State(pm2Home, savedBefore);
    await cutoverJournal.clear();
    throw preMutationError;
  }

  try {
    await deletePrivateServiceForCutover({
      beforeDelete: beforePrivateDelete,
      deletionPhase: 'activation',
      runPm2,
      expectedOtherProcesses,
      expectedPublicRuntime,
      expectedTargetFence: priorPrivateFence,
      onMutation: () => {
        mutationStarted = true;
      },
      processProofOptions,
      timeoutMs: pm2CommandTimeoutMs,
    });
    await startOpenReleaseCandidate({
      beforeStart: () => verifyDaemon({ pm2Home }),
      ecosystem: resolve(
        release.releaseDir,
        'ecosystem.private.production.cjs',
      ),
      pm2Home,
      runPm2,
      serviceName: 'dexter-mcp',
    });
    let candidateRows = await pm2List(runPm2);
    await assertPrivateCutoverPreservation({
      rows: candidateRows,
      expectedOtherProcesses,
      expectedPublicRuntime,
      phase: 'private candidate activation',
      processProofOptions,
    });
    candidatePrivateFence = await expectedPrivateCandidateDeletionFence({
      rows: candidateRows,
      expectedProcess: preflight.expectedProcesses['dexter-mcp'],
      processProofOptions,
    });
    await expectedPrivateCandidateRuntime({
      rows: candidateRows,
      expectedProcess: preflight.expectedProcesses['dexter-mcp'],
      processProofOptions,
    });
    await verifyCandidate({
      release,
      rows: candidateRows,
      expectedProcesses: preflight.expectedProcesses,
      services: PRIVATE_RELEASE_SERVICES,
      fetchImpl,
      healthTimeoutMs,
    });
    await runPm2(['save', '--force']);
    const recomposed = await recomposeSavedPm2Dump({
      pm2Home,
      originalSavedUnrelatedRows: originalSavedOtherRows,
      services: PRIVATE_RELEASE_SERVICES,
    });
    await verifySavedPm2BackupExact(pm2Home, priorRecomposedBytes);
    const candidatePrivateRow = exactNamedRow(
      candidateRows,
      'dexter-mcp',
      'candidate private Dexter',
    );
    const savedCandidatePrivateRow = exactNamedRow(
      recomposed.rows,
      'dexter-mcp',
      'saved candidate private Dexter',
    );
    if (!sameJson(
      savedProcessIdentity('dexter-mcp', candidatePrivateRow),
      savedProcessIdentity('dexter-mcp', savedCandidatePrivateRow),
    )) {
      throw new Error('saved private candidate definition differs from live');
    }
    if (!samePm2ProcessSnapshot(
      snapshotUnrelatedPm2Processes(
        recomposed.rows,
        PRIVATE_RELEASE_SERVICES,
      ),
      expectedSavedOtherProcesses,
    )) {
      throw new Error('private candidate save changed another PM2 definition');
    }
    candidateRows = await pm2List(runPm2);
    await assertPrivateCutoverPreservation({
      rows: candidateRows,
      expectedOtherProcesses,
      expectedPublicRuntime,
      phase: 'private post-save proof',
      processProofOptions,
    });
    const verified = await verifyCandidate({
      release,
      rows: candidateRows,
      expectedProcesses: preflight.expectedProcesses,
      services: PRIVATE_RELEASE_SERVICES,
      fetchImpl,
      healthTimeoutMs,
    });
    await verifyProtectedEnvironmentStillExact(preflight);
    await cutoverJournal.clear();
    return { release, ...verified };
  } catch (activationError) {
    if (!mutationStarted) {
      try {
        await restorePrivateSavedPm2State(pm2Home, savedBefore);
        await cutoverJournal.clear();
      } catch (restoreError) {
        throw new Error(
          'private cutover stopped before live mutation and the original saved state could not be restored',
          { cause: restoreError },
        );
      }
      throw activationError;
    }
    try {
      if (candidatePrivateFence === undefined) {
        const rollbackRows = await pm2List(runPm2);
        await assertPrivateCutoverPreservation({
          rows: rollbackRows,
          expectedOtherProcesses,
          expectedPublicRuntime,
          phase: 'private rollback target proof',
          processProofOptions,
        });
        candidatePrivateFence =
          await expectedPrivateCandidateDeletionFence({
            rows: rollbackRows,
            expectedProcess: preflight.expectedProcesses['dexter-mcp'],
            processProofOptions,
          });
      }
      await deletePrivateServiceForCutover({
        beforeDelete: beforePrivateDelete,
        deletionPhase: 'rollback',
        runPm2,
        expectedOtherProcesses,
        expectedPublicRuntime,
        expectedTargetFence: candidatePrivateFence,
        processProofOptions,
        timeoutMs: pm2CommandTimeoutMs,
      });
      await startPrivateServiceFromSavedRow({
        beforeStart: async () => {
          await verifyRollbackInputs({
            row: priorSavedPrivateRow,
            priorProof: priorPrivateRestartProof,
          });
          await verifyDaemon({ pm2Home });
        },
        pm2Home,
        runPm2,
        savedRow: priorSavedPrivateRow,
      });
      const restoredRows = await waitFor(async () => {
        const rows = await pm2List(runPm2);
        await assertPrivateCutoverPreservation({
          rows,
          expectedOtherProcesses,
          expectedPublicRuntime,
          phase: 'private rollback',
          processProofOptions,
        });
        const restored = rows.find((row) => row?.name === 'dexter-mcp');
        if (!restored || !sameJson(
          restartableProcessDefinition(restored),
          restartableProcessDefinition(priorSavedPrivateRow),
        )) return false;
        const health = stablePrivateHealth(await readLoopbackHealth(
          'dexter-mcp',
          restored,
          fetchImpl,
          healthTimeoutMs,
        ), expectedHealthPort('dexter-mcp', restored));
        return sameJson(health, priorPrivateHealth) ? rows : false;
      }, { timeoutMs: pm2StartupTimeoutMs });
      const restoredPrivateRow = exactNamedRow(
        restoredRows,
        'dexter-mcp',
        'restored private Dexter',
      );
      const restoredPrivateRuntime = await runningServiceProcessSnapshot(
        'dexter-mcp',
        restoredRows,
        processProofOptions,
      );
      const restoredRestartProof = await verifyPriorRestartability({
        row: restoredPrivateRow,
        expectedRuntime: restoredPrivateRuntime,
        expectedSavedRow: priorSavedPrivateRow,
        processProofOptions,
      });
      if (!sameJson(restoredRestartProof, priorPrivateRestartProof)) {
        throw new Error('private rollback restartability proof changed');
      }
      await restorePrivateSavedPm2State(pm2Home, savedBefore);
      await cutoverJournal.clear();
    } catch (rollbackError) {
      let savedStateError;
      try {
        await restorePrivateSavedPm2State(pm2Home, savedBefore);
      } catch (error) {
        savedStateError = error;
      }
      throw new Error(
        'private Dexter candidate failed and rollback could not be proven',
        {
          cause: savedStateError === undefined
            ? rollbackError
            : new AggregateError([rollbackError, savedStateError]),
        },
      );
    }
    throw new Error(
      'private Dexter candidate failed; the exact prior state was restored',
    );
  }
  } finally {
    await cutoverLock.release();
  }
}

/** Recover an interrupted private-only cutover from its fsynced journal. */
export async function recoverPrivateRelease({
  runCommand = execFileAsync,
  fetchImpl = fetch,
  commandEnvironment = defaultCommandEnvironment(),
  pm2Home = defaultPm2Home(),
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  pm2CommandTimeoutMs = DEFAULT_PM2_COMMAND_TIMEOUT_MS,
  pm2StartupTimeoutMs = DEFAULT_PM2_STARTUP_TIMEOUT_MS,
  verifyPriorRestartability = verifyPriorPrivateReleaseRestartability,
  verifyRollbackInputs = verifyPrivateRollbackInputsStillExact,
  verifyDaemon = verifyPm2DaemonLaunchAuthority,
  verifyPm2Executable = verifyProductionPm2Executable,
  processAliveImpl = async (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  },
  processProofOptions = {},
} = {}) {
  for (const key of FORBIDDEN_LOADER_ENV_KEYS) {
    if (commandEnvironment?.[key] !== undefined) {
      throw new Error(`${key} is forbidden in the recovery environment`);
    }
  }
  const initialJournal = await readPrivateCutoverJournal(pm2Home);
  const pm2Executable = await verifyPm2Executable();
  if (pm2Executable !== PRODUCTION_PM2_EXECUTABLE) {
    throw new Error('verified PM2 executable is not the production binary');
  }
  const runPm2 = boundedPm2Runner({
    runCommand,
    commandEnvironment: {
      ...commandEnvironment,
      PM2_HOME: pm2Home,
    },
    nodeExecutable: PRODUCTION_NODE_EXECUTABLE,
    pm2Executable,
    timeoutMs: pm2CommandTimeoutMs,
    startupTimeoutMs: pm2StartupTimeoutMs,
  });
  const lock = await acquireReleaseCutoverLock(pm2Home, {
    recoverOwner: initialJournal.payload.lockOwner,
    recoverJournalSha256: initialJournal.sha256,
    processAliveImpl,
  });
  try {
    const journal = await readPrivateCutoverJournal(pm2Home);
    if (!journal.bytes.equals(initialJournal.bytes)) {
      throw new Error('private cutover journal changed before recovery lock');
    }
    if (await processAliveImpl(journal.payload.controllerPid)) {
      throw new Error('private cutover controller is still active');
    }
    const expectedOtherProcesses = journal.payload.expectedOtherProcesses;
    const expectedPublicRuntime = journal.payload.expectedPublicRuntime;
    const priorRow = journal.payload.priorRow;
    const priorProof = journal.payload.priorProof;
    const priorHealth = journal.payload.priorHealth;
    let rows = await pm2List(runPm2);
    await assertPrivateCutoverPreservation({
      rows,
      expectedOtherProcesses,
      expectedPublicRuntime,
      phase: 'private crash recovery',
      processProofOptions,
    });
    const privateRows = rows.filter((row) => row?.name === 'dexter-mcp');
    if (privateRows.length > 1) {
      throw new Error('private crash recovery found duplicate target rows');
    }
    let priorIsHealthy = false;
    let candidateFence = null;
    if (privateRows.length === 1 && sameJson(
      restartableProcessDefinition(privateRows[0]),
      restartableProcessDefinition(priorRow),
    )) {
      candidateFence = await expectedPrivatePriorGenerationDeletionFence({
        row: privateRows[0],
        priorRow,
        processProofOptions,
      });
      const status = processField(privateRows[0], 'status');
      const pid = privateRows[0]?.pid;
      if (status === PM2_STATUS_ONLINE && Number.isInteger(pid) && pid > 0) {
        try {
          const runtime = await runningServiceProcessSnapshot(
            'dexter-mcp',
            rows,
            processProofOptions,
          );
          const proof = await verifyPriorRestartability({
            row: privateRows[0],
            expectedRuntime: runtime,
            expectedSavedRow: priorRow,
            processProofOptions,
          });
          const health = stablePrivateHealth(await readLoopbackHealth(
            'dexter-mcp',
            privateRows[0],
            fetchImpl,
            healthTimeoutMs,
          ), expectedHealthPort('dexter-mcp', privateRows[0]));
          priorIsHealthy = sameJson(proof, priorProof)
            && sameJson(health, priorHealth);
        } catch {
          priorIsHealthy = false;
        }
      }
    } else if (privateRows.length === 1) {
      candidateFence = await expectedPrivateCandidateDeletionFence({
        rows,
        expectedProcess: journal.payload.candidateProcess,
        processProofOptions,
      });
    }

    if (!priorIsHealthy) {
      await deletePrivateServiceForCutover({
        deletionPhase: 'crash recovery',
        runPm2,
        expectedOtherProcesses,
        expectedPublicRuntime,
        expectedTargetFence: candidateFence,
        processProofOptions,
        timeoutMs: pm2CommandTimeoutMs,
      });
      await startPrivateServiceFromSavedRow({
        beforeStart: async () => {
          await verifyRollbackInputs({ row: priorRow, priorProof });
          await verifyDaemon({ pm2Home });
        },
        pm2Home,
        runPm2,
        savedRow: priorRow,
      });
      rows = await waitFor(async () => {
        const current = await pm2List(runPm2);
        await assertPrivateCutoverPreservation({
          rows: current,
          expectedOtherProcesses,
          expectedPublicRuntime,
          phase: 'private crash recovery rollback',
          processProofOptions,
        });
        const restored = current.find((row) => row?.name === 'dexter-mcp');
        if (!restored || !sameJson(
          restartableProcessDefinition(restored),
          restartableProcessDefinition(priorRow),
        )) return false;
        const health = stablePrivateHealth(await readLoopbackHealth(
          'dexter-mcp',
          restored,
          fetchImpl,
          healthTimeoutMs,
        ), expectedHealthPort('dexter-mcp', restored));
        return sameJson(health, priorHealth) ? current : false;
      }, { timeoutMs: pm2StartupTimeoutMs });
      const restored = exactNamedRow(rows, 'dexter-mcp', 'recovered private Dexter');
      const runtime = await runningServiceProcessSnapshot(
        'dexter-mcp',
        rows,
        processProofOptions,
      );
      const proof = await verifyPriorRestartability({
        row: restored,
        expectedRuntime: runtime,
        expectedSavedRow: priorRow,
        processProofOptions,
      });
      if (!sameJson(proof, priorProof)) {
        throw new Error('private crash recovery restart proof changed');
      }
    }
    await restorePrivateSavedPm2State(pm2Home, journal.savedState);
    await journal.clear();
    return Object.freeze({ recovered: true, service: 'dexter-mcp' });
  } finally {
    await lock.release();
  }
}
