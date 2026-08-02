import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { parseEnv } from 'node:util';
import releaseProvenance from './open-release-provenance.cjs';
import {
  requireExpectedOpenReleaseRoster,
  requireOpenReleaseIdentity,
} from './open-release-identity.mjs';

const {
  readSealedOpenRelease,
  releaseIdentityForService,
} = releaseProvenance;

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const PROTECTED_ENV_ERROR =
  'opendexter_protected_env_must_be_absolute_owned_mode_0600_regular_one_link';
const DIGEST = /^[0-9a-f]{64}$/;
const GOVERNED_SECRET = 'GOVERNED_AGENT_ACTIONS_HMAC_SECRET';
const FORBIDDEN_LOADER_ENV_KEYS = Object.freeze([
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
]);
const CONTROL_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'NODE_ENV',
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'PWD',
  'DEXTER_MCP_ENV_FILE',
  'DEXTER_MCP_ENV_FILE_SHA256',
  'DEXTER_MCP_RELEASE_COMMIT',
  'DEXTER_MCP_RELEASE_TREE',
  'DEXTER_MCP_RELEASE_MANIFEST_SHA256',
  'DEXTER_MCP_DESCRIPTOR_SHA256',
  'DEXTER_MCP_RELEASE_PACKAGE_VERSION',
  'DEXTER_MCP_RELEASE_SERVICE',
  'DEXTER_MCP_EXPECTED_ROSTER_JSON',
  'TOKEN_AI_MCP_PROFILE',
  'TOKEN_AI_MCP_TOOLSETS',
]);
const SAFE_SYSTEM_PM2_ENV_KEYS = new Set([
  ...CONTROL_ENV_KEYS,
  'NODE_CHANNEL_FD',
  'NODE_CHANNEL_SERIALIZATION_MODE',
]);
const PM2_OPTIONAL_EXACT_ENV = Object.freeze({
  automation: 'true',
  autostart: 'true',
  kill_retry_time: '100',
  km_link: 'false',
  pmx: 'true',
  treekill: 'true',
  vizion: 'true',
  vizion_running: 'false',
  windowsHide: 'true',
});
const PM2_OPTIONAL_UNSIGNED_INTEGER_ENV = Object.freeze([
  'created_at',
  'pm_uptime',
  'restart_time',
  'unstable_restarts',
  'prev_restart_delay',
  'exit_code',
]);
const PM2_OPTIONAL_TELEMETRY_ENV = Object.freeze([
  'axm_actions',
  'axm_dynamic',
  'axm_monitor',
  'axm_options',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/;

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

function isProtectedEnvironmentStat(stat) {
  return stat.isFile()
    && !stat.isSymbolicLink?.()
    && stat.nlink === 1
    && stat.uid === process.getuid()
    && (stat.mode & 0o7777) === 0o600;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function requireProtectedEnvironmentBytes(env) {
  const configuredPath = env?.DEXTER_MCP_ENV_FILE?.trim() ?? '';
  const assertedDigest = env?.DEXTER_MCP_ENV_FILE_SHA256?.trim() ?? '';
  if (!configuredPath || !isAbsolute(configuredPath) || !DIGEST.test(assertedDigest)) {
    throw new TypeError(PROTECTED_ENV_ERROR);
  }

  const pathStat = lstatSync(configuredPath);
  const canonicalPath = realpathSync(configuredPath);
  if (
    !isProtectedEnvironmentStat(pathStat)
    || canonicalPath !== configuredPath
  ) {
    throw new TypeError(PROTECTED_ENV_ERROR);
  }

  let descriptor;
  try {
    descriptor = openSync(
      configuredPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (
      !isProtectedEnvironmentStat(before)
      || !sameFileIdentity(pathStat, before)
    ) {
      throw new TypeError('opendexter_protected_env_changed_during_read');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalPathStat = lstatSync(configuredPath);
    if (
      !sameFileIdentity(before, after)
      || !sameFileIdentity(after, finalPathStat)
      || realpathSync(configuredPath) !== canonicalPath
    ) {
      throw new TypeError('opendexter_protected_env_changed_during_read');
    }
    const actualDigest = createHash('sha256').update(bytes).digest('hex');
    if (actualDigest !== assertedDigest) {
      throw new TypeError('opendexter_protected_env_digest_mismatch');
    }
    return { path: canonicalPath, sha256: actualDigest, bytes };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function applicationDerivedEnvironment(protectedValues, service) {
  const derived = new Map();
  const forceColor = ['1', 'true', 'yes', 'on'].includes(
    String(protectedValues.MCP_LOG_FORCE_COLOR ?? '').toLowerCase(),
  );
  if (forceColor && !Object.hasOwn(protectedValues, 'FORCE_COLOR')) {
    derived.set('FORCE_COLOR', '1');
  }
  if (service === 'dexter-open-mcp') {
    derived.set('TOKEN_AI_MCP_PUBLIC_URL', 'https://open.dexter.cash/mcp');
    derived.set('TOKEN_AI_WIDGET_DOMAIN', 'https://dexter.cash');
    derived.set(
      'TOKEN_AI_APPS_SDK_ASSET_BASE',
      'https://dexter.cash/mcp/app-assets/assets',
    );
  }
  for (const key of Object.keys(protectedValues)) derived.delete(key);
  return derived;
}

function requireExactEnvironmentValue(env, key, expected) {
  if (env?.[key] !== expected) {
    throw new TypeError(`opendexter_pm2_runtime_identity_mismatch:${key}`);
  }
}

function requirePm2RuntimeEnvironment(env, release, service) {
  const pm2Home = '/home/branchmanager/.pm2';
  const pmId = env?.pm_id;
  if (!UNSIGNED_INTEGER.test(pmId ?? '')) {
    throw new TypeError('opendexter_pm2_runtime_identity_mismatch:pm_id');
  }
  const expected = {
    name: service,
    namespace: 'default',
    cwd: release.releaseDir,
    pm_cwd: release.releaseDir,
    pm_exec_path: join(
      release.releaseDir,
      release.provenance.entrypoints[service],
    ),
    exec_interpreter: process.execPath,
    exec_mode: 'fork_mode',
    node_args: '',
    args: '',
    autorestart: 'true',
    max_restarts: '10',
    wait_ready: 'true',
    listen_timeout: '15000',
    kill_timeout: '10000',
    filter_env: '',
    NODE_APP_INSTANCE: '0',
    instance_var: 'NODE_APP_INSTANCE',
    PM2_HOME: pm2Home,
    pm_out_log_path: `${pm2Home}/logs/${service}-out-${pmId}.log`,
    pm_err_log_path: `${pm2Home}/logs/${service}-error-${pmId}.log`,
    pm_pid_path: `${pm2Home}/pids/${service}-${pmId}.pid`,
    status: 'launching',
    username: 'branchmanager',
    version: release.provenance.packageVersion,
    env: '[object Object]',
    [service]: '{}',
  };
  for (const [key, value] of Object.entries(expected)) {
    requireExactEnvironmentValue(env, key, value);
  }
  // PM2 deliberately removes instances from saved dumps. Absence and the
  // canonical singleton value therefore mean the same fork-mode policy.
  if (env.instances !== undefined && env.instances !== '1') {
    throw new TypeError('opendexter_pm2_runtime_identity_mismatch:instances');
  }
  if (env.node_version !== undefined && env.node_version !== process.versions.node) {
    throw new TypeError('opendexter_pm2_runtime_identity_mismatch:node_version');
  }
  if (!UUID.test(env.unique_id ?? '')) {
    throw new TypeError('opendexter_pm2_runtime_identity_mismatch:unique_id');
  }
  for (const [key, value] of Object.entries(PM2_OPTIONAL_EXACT_ENV)) {
    if (env[key] !== undefined) requireExactEnvironmentValue(env, key, value);
  }
  for (const key of PM2_OPTIONAL_UNSIGNED_INTEGER_ENV) {
    if (env[key] !== undefined && !UNSIGNED_INTEGER.test(env[key])) {
      throw new TypeError(`opendexter_pm2_runtime_identity_mismatch:${key}`);
    }
  }
  for (const key of PM2_OPTIONAL_TELEMETRY_ENV) {
    if (env[key] !== undefined && typeof env[key] !== 'string') {
      throw new TypeError(`opendexter_pm2_runtime_identity_mismatch:${key}`);
    }
  }
  if (
    env.NODE_CHANNEL_FD !== undefined
    && !UNSIGNED_INTEGER.test(env.NODE_CHANNEL_FD)
  ) {
    throw new TypeError('opendexter_pm2_runtime_identity_mismatch:NODE_CHANNEL_FD');
  }
  if (
    env.NODE_CHANNEL_SERIALIZATION_MODE !== undefined
    && !['json', 'advanced'].includes(env.NODE_CHANNEL_SERIALIZATION_MODE)
  ) {
    throw new TypeError(
      'opendexter_pm2_runtime_identity_mismatch:NODE_CHANNEL_SERIALIZATION_MODE',
    );
  }
  return new Set([
    ...Object.keys(expected),
    'pm_id',
    'instances',
    'node_version',
    'unique_id',
    ...Object.keys(PM2_OPTIONAL_EXACT_ENV),
    ...PM2_OPTIONAL_UNSIGNED_INTEGER_ENV,
    ...PM2_OPTIONAL_TELEMETRY_ENV,
  ]);
}

function requireProtectedEnvironmentValues(
  bytes,
  env,
  { release, service, allowApplicationDerived },
) {
  const releaseDir = release.releaseDir;
  const protectedValues = parseEnv(bytes.toString('utf8'));
  for (const key of ['TOKEN_AI_MCP_PROFILE', 'TOKEN_AI_MCP_TOOLSETS']) {
    if (env?.[key] !== undefined) {
      throw new TypeError(`opendexter_unprotected_application_env:${key}`);
    }
  }
  if (Object.hasOwn(protectedValues, 'PM2_HOME')) {
    throw new TypeError('opendexter_protected_env_forbidden_key:PM2_HOME');
  }
  for (const key of FORBIDDEN_LOADER_ENV_KEYS) {
    if (Object.hasOwn(protectedValues, key)) {
      throw new TypeError(`opendexter_protected_env_forbidden_key:${key}`);
    }
    if (env?.[key] !== undefined) {
      throw new TypeError(`opendexter_forbidden_loader_env:${key}`);
    }
  }
  const governedSecret = String(protectedValues[GOVERNED_SECRET] ?? '').trim();
  if (Buffer.byteLength(governedSecret, 'utf8') < 32) {
    throw new TypeError('opendexter_protected_env_governed_secret_unavailable');
  }
  protectedValues[GOVERNED_SECRET] = governedSecret;
  for (const [key, expected] of Object.entries(protectedValues)) {
    if (CONTROL_ENV_KEYS.has(key)) continue;
    if (env?.[key] !== expected) {
      throw new TypeError(`opendexter_protected_env_value_mismatch:${key}`);
    }
  }

  const exactSystemValues = {
    PATH: expectedRuntimePath(),
    HOME: '/home/branchmanager',
    NODE_ENV: 'production',
  };
  for (const [key, expected] of Object.entries(exactSystemValues)) {
    if (env?.[key] !== expected) {
      throw new TypeError(`opendexter_system_env_value_mismatch:${key}`);
    }
  }
  if (env?.PWD !== undefined && env.PWD !== releaseDir) {
    throw new TypeError('opendexter_system_env_value_mismatch:PWD');
  }

  const derived = allowApplicationDerived
    ? applicationDerivedEnvironment(protectedValues, service)
    : new Map();
  const pm2RuntimeKeys = requirePm2RuntimeEnvironment(env, release, service);
  const allowed = new Set([
    ...SAFE_SYSTEM_PM2_ENV_KEYS,
    ...pm2RuntimeKeys,
    ...Object.keys(protectedValues),
  ]);
  for (const [key, expected] of derived) {
    if (env?.[key] === expected) allowed.add(key);
  }
  for (const key of Object.keys(env ?? {})) {
    if (!allowed.has(key)) {
      throw new TypeError(`opendexter_unprotected_application_env:${key}`);
    }
  }
}

function requireSealedOpenReleaseBinding({
  releaseDir,
  service,
  env,
  allowApplicationDerived,
}) {
  const protectedRead = requireProtectedEnvironmentBytes(env);
  const release = readSealedOpenRelease(releaseDir);
  if (release.provenance.nodeVersion !== process.version) {
    throw new TypeError('opendexter_release_node_version_mismatch');
  }
  requireProtectedEnvironmentValues(protectedRead.bytes, env, {
    release,
    service,
    allowApplicationDerived,
  });

  const sealedIdentity = releaseIdentityForService(release, service);
  const assertedIdentity = requireOpenReleaseIdentity(env);
  if (!exactJson(assertedIdentity, sealedIdentity)) {
    throw new TypeError('opendexter_release_identity_mismatch');
  }

  const sealedRoster = release.provenance.rosters[service];
  const assertedRoster = requireExpectedOpenReleaseRoster(env);
  if (!exactJson(assertedRoster, sealedRoster)) {
    throw new TypeError('opendexter_release_roster_mismatch');
  }

  return {
    release,
    identity: sealedIdentity,
    roster: sealedRoster,
    protectedEnvironment: Object.freeze({
      path: protectedRead.path,
      sha256: protectedRead.sha256,
    }),
  };
}

/** Verify the release and asserted sealed roster before application import. */
export function requireSealedOpenReleaseBootstrap({
  releaseDir,
  service,
  env = process.env,
}) {
  const binding = requireSealedOpenReleaseBinding({
    releaseDir,
    service,
    env,
    allowApplicationDerived: false,
  });
  return Object.freeze({
    ...binding,
    roster: Object.freeze([...binding.roster]),
  });
}

/**
 * Re-prove the immutable release at process startup.
 *
 * PM2 can restart a saved script without evaluating ecosystem.production.cjs,
 * so the process itself must verify every manifested byte and bind the sealed
 * release identity and roster to the environment supplied by PM2.
 */
export function requireSealedOpenReleaseRuntime({
  releaseDir,
  service,
  actualRoster,
  env = process.env,
}) {
  const binding = requireSealedOpenReleaseBinding({
    releaseDir,
    service,
    env,
    allowApplicationDerived: true,
  });
  if (
    !Array.isArray(actualRoster)
    || !exactJson(actualRoster, binding.roster)
  ) {
    throw new TypeError('opendexter_release_roster_mismatch');
  }

  return Object.freeze({
    ...binding,
    roster: Object.freeze([...binding.roster]),
  });
}
