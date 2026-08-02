import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseEnv, promisify } from 'node:util';
import {
  access,
  chmod,
  lstat,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
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

const require = createRequire(import.meta.url);
const {
  LEGACY_OPEN_RELEASE_CONTRACT,
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

function exactServiceRows(rows) {
  const selected = rows.filter((row) => SERVICE_NAMES.includes(row?.name));
  for (const service of SERVICE_NAMES) {
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
    dirname(process.execPath),
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

function exactPm2EnvironmentNamespaceIdentity(name, row) {
  const environment = processEnvironment(row);
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
      version: packageVersion,
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
  const value = env.OPEN_MCP_PORT ?? 3931;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ${name} health port`);
  }
  return port;
}

export function stableProcessIdentity(name, row) {
  exactPm2EnvironmentNamespaceIdentity(name, row);
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
    interpreter: process.execPath,
    port: Number(applicationEnvironment.OPEN_MCP_PORT ?? 3931),
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
      listenTimeout: 15_000,
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
  commandEnvironment,
  pm2Home = defaultPm2Home(),
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
}) {
  if (release?.provenance?.nodeVersion !== process.version) {
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
  const expectedProcesses = Object.fromEntries(SERVICE_NAMES.map((name) => [
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
  fetchImpl = fetch,
  readlinkImpl = readlink,
  readFileImpl = readFile,
  realpathImpl = realpath,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
}) {
  if (
    !expectedProcesses
    || !sameJson(Object.keys(expectedProcesses).sort(), [...SERVICE_NAMES].sort())
  ) {
    throw new Error('candidate proof requires exact preflight process identities');
  }
  const byName = exactServiceRows(rows);
  const nodeExecutable = await realpathImpl(process.execPath);
  const health = {};
  for (const name of SERVICE_NAMES) {
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
    && runtime.pmId === 68
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
    && processField(row, 'instances') === undefined
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
  'dexter-open-mcp',
]);

function verifyLegacyPersistedEnvironment(row, environmentBytes) {
  const persisted = exactPersistedEnvironment(row);
  const current = parseEnv(environmentBytes.toString('utf8'));
  const persistedApplicationKeys = new Set();
  for (const [key, value] of Object.entries(persisted)) {
    if (LEGACY_INJECTED_ENVIRONMENT_KEYS.has(key)) continue;
    persistedApplicationKeys.add(key);
    if (!Object.hasOwn(current, key) || current[key] !== String(value)) {
      throw new Error(
        `prior dexter-open-mcp persisted environment does not match ${key}`,
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
    throw new Error('prior dexter-open-mcp environment has an unapproved addition');
  }
  if (Object.hasOwn(current, GOVERNED_SECRET)) {
    const secret = current[GOVERNED_SECRET];
    if (
      secret !== secret.trim()
      || Buffer.byteLength(secret, 'utf8') < 32
    ) {
      throw new Error(`prior dexter-open-mcp ${GOVERNED_SECRET} is invalid`);
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
}) {
  return (args) => runBoundedPm2Command({
    runCommand,
    args,
    commandEnvironment,
    nodeExecutable,
    pm2Executable,
    timeoutMs,
  });
}

async function pm2List(runPm2) {
  const { stdout } = await runPm2(['jlist']);
  return parsePm2ProcessList(stdout);
}

function unrelatedPm2Snapshot(rows) {
  return snapshotUnrelatedPm2Processes(rows, SERVICE_NAMES);
}

export async function preservedPrivateProcessSnapshot(
  rows,
  {
    readlinkImpl = readlink,
    readFileImpl = readFile,
    realpathImpl = realpath,
  } = {},
) {
  const selected = rows.filter((row) => row?.name === PRESERVED_PRIVATE_SERVICE);
  if (selected.length > 1) {
    throw new Error('PM2 contains duplicate preserved private Dexter processes');
  }
  if (selected.length === 0) return null;
  const row = selected[0];
  const runtime = livePm2RuntimeIdentity(
    row,
    'private Dexter',
    { expectedPmId: 69 },
  );
  const { pid } = runtime;
  const cwd = processField(row, 'pm_cwd') ?? null;
  const script = processField(row, 'pm_exec_path') ?? null;
  const interpreter = processField(row, 'exec_interpreter') ?? null;
  if (
    !isAbsolute(cwd ?? '')
    || !isAbsolute(script ?? '')
    || !isAbsolute(interpreter ?? '')
  ) {
    throw new Error('private Dexter process identity is not exact');
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
    throw new Error('private Dexter kernel cwd does not match PM2');
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

function assertUnrelatedPm2Processes(
  rows,
  expected,
  phase,
) {
  if (!samePm2ProcessSnapshot(unrelatedPm2Snapshot(rows), expected)) {
    throw new Error(`${phase} changed an unrelated PM2 process definition`);
  }
}

async function assertLiveUnrelatedPm2Processes(
  rows,
  expected,
  phase,
  expectedPrivateProcess,
  privateProcessProofOptions,
) {
  assertUnrelatedPm2Processes(rows, expected, phase);
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
  expectedUnrelated,
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
    await assertLiveUnrelatedPm2Processes(
      current,
      expectedUnrelated,
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
  expectedUnrelated,
  expectedPrivateProcess,
  privateProcessProofOptions,
  timeoutMs,
) {
  await waitFor(async () => {
    let current;
    try {
      current = await pm2List(runPm2);
      await assertLiveUnrelatedPm2Processes(
        current,
        expectedUnrelated,
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
    await assertLiveUnrelatedPm2Processes(
      after,
      expectedUnrelated,
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

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function requireProtectedRootOwnedPath(path, {
  directory,
  expectedSha256 = null,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
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
    && sha256Bytes(await readFileImpl(path)) !== expectedSha256
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
  return PRODUCTION_PM2_EXECUTABLE;
}

async function restorePm2Dump(pm2Home, bytes) {
  const dumpPath = resolve(pm2Home, 'dump.pm2');
  const temporaryPath = resolve(
    pm2Home,
    `.opendexter-rollback-${process.pid}-${Date.now()}.json`,
  );
  await writeFile(temporaryPath, bytes, { mode: 0o600, flag: 'wx' });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, dumpPath);
}

async function readSavedPm2Dump(pm2Home, { allowMissing = false } = {}) {
  let bytes;
  try {
    bytes = await readFile(resolve(pm2Home, 'dump.pm2'));
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') {
      return { bytes: null, rows: [] };
    }
    throw error;
  }
  const rows = parseJson(bytes.toString('utf8'), 'PM2 saved dump');
  if (!Array.isArray(rows)) throw new Error('PM2 saved dump is not an array');
  return { bytes, rows };
}

async function restoreOriginalSavedPm2Dump(pm2Home, bytes) {
  if (bytes === null) {
    await rm(resolve(pm2Home, 'dump.pm2'), { force: true });
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

function unrelatedRows(rows) {
  return rows.filter((row) => !SERVICE_NAMES.includes(row?.name));
}

async function recomposeSavedPm2Dump({
  pm2Home,
  originalSavedUnrelatedRows,
}) {
  const generated = await readSavedPm2Dump(pm2Home);
  const targetRows = generated.rows.filter(
    (row) => SERVICE_NAMES.includes(row?.name),
  );
  const rows = [
    ...structuredClone(originalSavedUnrelatedRows),
    ...structuredClone(targetRows),
  ];
  const bytes = Buffer.from(JSON.stringify(rows));
  await restorePm2Dump(pm2Home, bytes);
  return { bytes, rows, targetRows };
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
  preflightCandidate = preflightOpenReleaseCandidate,
  verifyPair = verifyRunningOpenReleasePair,
  capturePrior = capturePriorOpenReleasePair,
  verifyPriorRestartability = verifyPriorOpenReleaseRestartability,
  verifyPriorHealth = verifyCapturedPriorOpenReleaseHealth,
  verifyRestored = verifyRestoredOpenReleasePair,
  verifySaved = verifySavedPair,
  verifyPm2Executable = verifyProductionPm2Executable,
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
  const runPm2 = boundedPm2Runner({
    runCommand,
    commandEnvironment: {
      ...commandEnvironment,
      PM2_HOME: pm2Home,
    },
    nodeExecutable: PRODUCTION_NODE_EXECUTABLE,
    pm2Executable,
    timeoutMs: pm2CommandTimeoutMs,
  });
  const before = await pm2List(runPm2);
  const hasPriorPair = assertPriorTopology(before, freshInstall);
  const prior = hasPriorPair
    ? await capturePrior(before, fetchImpl, { healthTimeoutMs })
    : {};
  if (hasPriorPair) {
    await verifyPriorRestartability({ prior, rows: before });
  }
  const priorProcesses = expectedPriorProcesses(prior);
  const liveUnrelatedProcesses = unrelatedPm2Snapshot(before);
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
    await assertLiveUnrelatedPm2Processes(
      liveAfterPriorSave,
      liveUnrelatedProcesses,
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
    await assertLiveUnrelatedPm2Processes(
      finalPreDeleteRows,
      liveUnrelatedProcesses,
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
      liveUnrelatedProcesses,
      preservedPrivateProcess,
      privateProcessProofOptions,
    );
    await runPm2(['start', ecosystem]);
    const candidateRows = await pm2List(runPm2);
    await assertLiveUnrelatedPm2Processes(
      candidateRows,
      liveUnrelatedProcesses,
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
    await assertLiveUnrelatedPm2Processes(
      finalRows,
      liveUnrelatedProcesses,
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
    return { release, ...verified };
  } catch (activationError) {
    try {
      // Resurrect skips a saved app when a process with the same name remains.
      // Therefore rollback first performs bounded delete retries and obtains a
      // fresh PM2/private-runtime proof that the public name is absent.
      await deleteServicesForRollback(
        runPm2,
        liveUnrelatedProcesses,
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
          await assertLiveUnrelatedPm2Processes(
            rows,
            liveUnrelatedProcesses,
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
        });
      } else {
        await restorePm2Dump(pm2Home, priorSavedDump);
        await waitFor(async () => {
          const rows = await pm2List(runPm2);
          await assertLiveUnrelatedPm2Processes(
            rows,
            liveUnrelatedProcesses,
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
      await assertLiveUnrelatedPm2Processes(
        finalRollbackRows,
        liveUnrelatedProcesses,
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
}
