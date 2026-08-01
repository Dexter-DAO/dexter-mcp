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
  runBoundedPm2Command,
  samePm2ProcessSnapshot,
  snapshotPm2ProcessDefinition,
  snapshotUnrelatedPm2Processes,
} from '../../lib/open-release-pm2-safety.mjs';

const require = createRequire(import.meta.url);
const {
  SERVICE_NAMES,
  readSealedOpenRelease,
  releaseIdentityForService,
} = require('../../lib/open-release-provenance.cjs');

const execFileAsync = promisify(execFile);
const PM2_STATUS_ONLINE = 'online';
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
const PRODUCTION_HOME = '/home/branchmanager';
const PRODUCTION_PM2_HOME = `${PRODUCTION_HOME}/.pm2`;
const GOVERNED_SECRET = 'GOVERNED_AGENT_ACTIONS_HMAC_SECRET';
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
  const value = name === 'dexter-mcp'
    ? env.TOKEN_AI_MCP_PORT ?? 3930
    : env.OPEN_MCP_PORT ?? 3931;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ${name} health port`);
  }
  return port;
}

export function stableProcessIdentity(name, row) {
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
    port: Number(name === 'dexter-mcp'
      ? applicationEnvironment.TOKEN_AI_MCP_PORT ?? 3930
      : applicationEnvironment.OPEN_MCP_PORT ?? 3931),
    profile: nullableString(applicationEnvironment.TOKEN_AI_MCP_PROFILE),
    toolsets: nullableString(applicationEnvironment.TOKEN_AI_MCP_TOOLSETS),
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
  if (
    executable !== nodeExecutable
    || !commandLineMatches(commandLine, nodeExecutable, expectedScript)
  ) {
    throw new Error('kernel executable or command line mismatch');
  }
  return { cwd, executable, commandLine };
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
  for (const key of ['TOKEN_AI_MCP_PROFILE', 'TOKEN_AI_MCP_TOOLSETS']) {
    if (String(applicationEnvironment[key] ?? '') !== '') {
      throw new Error(`${key} must be empty for the source-owned private roster`);
    }
  }
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
  if (
    stableProcessIdentity('dexter-mcp', byName['dexter-mcp']).cwd
      !== stableProcessIdentity('dexter-open-mcp', byName['dexter-open-mcp']).cwd
  ) {
    throw new Error('Dexter MCP processes do not share one candidate directory');
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
  };
}

export async function capturePriorOpenReleasePair(
  rows,
  fetchImpl = fetch,
  {
    readlinkImpl = readlink,
    readFileImpl = readFile,
    realpathImpl = realpath,
    healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  } = {},
) {
  const byName = exactServiceRows(rows);
  const processes = {};
  for (const name of SERVICE_NAMES) {
    const row = byName[name];
    const processIdentity = stableProcessIdentity(name, row);
    const pid = row.pid;
    if (
      processField(row, 'status') !== PM2_STATUS_ONLINE
      || !Number.isInteger(pid)
      || pid <= 0
      || !isAbsolute(processIdentity.cwd ?? '')
      || !isAbsolute(processIdentity.script ?? '')
      || !isAbsolute(processIdentity.interpreter ?? '')
      || !Array.isArray(processIdentity.roster)
      || processIdentity.roster.length === 0
      || !exactPriorReleaseIdentity(name, processIdentity.release)
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
    const healthBody = await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    );
    if (
      healthBody.ok !== true
      || healthBody.service !== name
      || healthBody.port !== processIdentity.port
      || !sameJson(healthBody.tools, processIdentity.roster)
      || !sameJson(healthBody.release, processIdentity.release)
    ) {
      throw new Error(`prior ${name} health does not match PM2 identity`);
    }
    processes[name] = {
      process: processIdentity,
      savedProcess: savedProcessIdentity(name, row),
      kernel,
      health: stablePriorHealth(healthBody),
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
 * Prove that the exact pair about to be removed can be restarted without
 * reconstructing code or credentials. This is intentionally independent per
 * service: an existing deployment may run the private and open surfaces from
 * two different sealed release directories.
 */
export async function verifyPriorOpenReleaseRestartability({
  prior,
  rows,
  readSealedReleaseImpl = readSealedOpenRelease,
  lstatImpl = lstat,
  readFileImpl = readFile,
  realpathImpl = realpath,
}) {
  const byName = exactServiceRows(rows);
  if (!sameJson(Object.keys(prior ?? {}).sort(), [...SERVICE_NAMES].sort())) {
    throw new Error('prior restart proof requires the exact two-service topology');
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

    const releaseDir = await realpathImpl(snapshot.process.cwd);
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

    const expectedScript = resolve(
      releaseDir,
      release.provenance.entrypoints[name],
    );
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
    const assertedDigest = snapshot.process.envFileSha256;
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
    if (
      processField(row, 'status') !== PM2_STATUS_ONLINE
      || !Number.isInteger(row.pid)
      || row.pid <= 0
      || !sameJson(stableProcessIdentity(name, row), expected.process)
      || !sameJson(savedProcessIdentity(name, row), expected.savedProcess)
    ) {
      throw new Error(`rollback identity mismatch for ${name}`);
    }
    const nodeExecutable = await realpathImpl(expected.process.interpreter);
    const kernel = await readKernelIdentity({
      pid: row.pid,
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
    ) {
      throw new Error(`rollback kernel identity mismatch for ${name}`);
    }
    const health = stablePriorHealth(await readLoopbackHealth(
      name,
      row,
      fetchImpl,
      healthTimeoutMs,
    ));
    if (!sameJson(health, expected.health)) {
      throw new Error(`rollback health mismatch for ${name}`);
    }
  }
  return true;
}

function boundedPm2Runner({
  runCommand,
  commandEnvironment,
  timeoutMs,
}) {
  return (args) => runBoundedPm2Command({
    runCommand,
    args,
    commandEnvironment,
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

function assertUnrelatedPm2Processes(rows, expected, phase) {
  if (!samePm2ProcessSnapshot(unrelatedPm2Snapshot(rows), expected)) {
    throw new Error(`${phase} changed an unrelated PM2 process definition`);
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

async function deleteServices(rows, runPm2, expectedUnrelated) {
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
    assertUnrelatedPm2Processes(current, expectedUnrelated, 'service deletion');
    const absent = current.every((row) => !SERVICE_NAMES.includes(row?.name));
    const exited = (await Promise.all(oldPids.map(processExists)))
      .every((exists) => !exists);
    return absent && exited;
  });
}

async function bestEffortDeleteServices(runPm2) {
  const errors = [];
  for (const name of SERVICE_NAMES) {
    try {
      await runPm2(['delete', name]);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
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
    throw new Error('saved PM2 proof requires the exact two-service topology');
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
        'Dexter MCP activation requires the exact prior two-service topology; '
        + 'use explicit freshInstall only on a host with neither service',
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
  verifyRestored = verifyRestoredOpenReleasePair,
  verifySaved = verifySavedPair,
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
  const runPm2 = boundedPm2Runner({
    runCommand,
    commandEnvironment: {
      ...commandEnvironment,
      PM2_HOME: pm2Home,
    },
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

  // Persist and prove the exact prior pair before any destructive PM2 change.
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
    assertUnrelatedPm2Processes(
      liveAfterPriorSave,
      liveUnrelatedProcesses,
      'prior save',
    );
    if (hasPriorPair) {
      await verifyPriorRestartability({ prior, rows: liveAfterPriorSave });
    }
    await verifyProtectedEnvironmentStillExact(preflight);
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
    await deleteServices(before, runPm2, liveUnrelatedProcesses);
    await runPm2(['start', ecosystem]);
    const candidateRows = await pm2List(runPm2);
    assertUnrelatedPm2Processes(
      candidateRows,
      liveUnrelatedProcesses,
      'candidate activation',
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
    assertUnrelatedPm2Processes(
      finalRows,
      liveUnrelatedProcesses,
      'post-save candidate activation',
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
      // Do not make rollback conditional on jlist: an unavailable process list
      // is exactly when the known target names still need deletion attempted.
      await bestEffortDeleteServices(runPm2);
      await restorePm2Dump(pm2Home, priorResurrectDump);
      if (hasPriorPair) {
        try {
          await runPm2(['resurrect']);
        } finally {
          await restorePm2Dump(pm2Home, priorSavedDump);
        }
        await waitFor(async () => {
          const rows = await pm2List(runPm2);
          assertUnrelatedPm2Processes(
            rows,
            liveUnrelatedProcesses,
            'rollback',
          );
          return verifyRestored({
            prior,
            rows,
            fetchImpl,
            healthTimeoutMs,
          });
        });
      } else {
        await restorePm2Dump(pm2Home, priorSavedDump);
        await waitFor(async () => {
          const rows = await pm2List(runPm2);
          assertUnrelatedPm2Processes(
            rows,
            liveUnrelatedProcesses,
            'fresh-install rollback',
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
      assertUnrelatedPm2Processes(
        finalRollbackRows,
        liveUnrelatedProcesses,
        'post-save rollback',
      );
      if (hasPriorPair) {
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
