import { createHash } from 'node:crypto';

// `pm2 start` may itself wait for the ecosystem's 15-second `wait_ready`
// boundary. Give the command wrapper independent headroom so it does not kill
// a valid readiness response at the same deadline it asks PM2 to enforce.
export const DEFAULT_PM2_COMMAND_TIMEOUT_MS = 30_000;

const SAFE_PM2_OPERATIONS = new Set([
  'delete',
  'jlist',
  'resurrect',
  'save',
  'start',
]);
const SAFE_PROCESS_ERROR_CODES = new Set([
  'ABORT_ERR',
  'EACCES',
  'ECANCELED',
  'EINTR',
  'ENOENT',
  'ENOMEM',
  'EPERM',
  'ETIMEDOUT',
]);
const SAFE_PROCESS_SIGNALS = new Set([
  'SIGABRT',
  'SIGALRM',
  'SIGHUP',
  'SIGINT',
  'SIGKILL',
  'SIGPIPE',
  'SIGQUIT',
  'SIGSEGV',
  'SIGTERM',
  'SIGUSR1',
  'SIGUSR2',
]);

function safePm2Operation(args) {
  return SAFE_PM2_OPERATIONS.has(args?.[0]) ? args[0] : 'command';
}

function sanitizedPm2Failure(error, args, timeoutMs) {
  const operation = safePm2Operation(args);
  if (error?.code === 'OPENDEXTER_PM2_TIMEOUT') {
    return new Error(`PM2 ${operation} timed out after ${timeoutMs}ms`);
  }
  const details = [];
  if (
    Number.isInteger(error?.code)
    && error.code >= 0
    && error.code <= 255
  ) {
    details.push(`exit=${error.code}`);
  } else if (SAFE_PROCESS_ERROR_CODES.has(error?.code)) {
    details.push(`code=${error.code}`);
  }
  if (SAFE_PROCESS_SIGNALS.has(error?.signal)) {
    details.push(`signal=${error.signal}`);
  }
  return new Error(
    `PM2 ${operation} failed${details.length ? ` (${details.join(',')})` : ''}`,
  );
}

const VOLATILE_PM2_FIELDS = new Set([
  'axm_actions',
  'axm_dynamic',
  'axm_monitor',
  'axm_options',
  'created_at',
  'env',
  'exit_code',
  'monit',
  'pid',
  'pm_id',
  'pm_pid_path',
  'pm_uptime',
  'prev_restart_delay',
  'restart_time',
  'status',
  'unique_id',
  'unstable_restarts',
  'vizion',
]);

const PM2_DEFINITION_FIELDS = new Set([
  'append_env_to_name',
  'args',
  'autorestart',
  'automation',
  'combine_logs',
  'cron_restart',
  'cwd',
  'disable_logs',
  'error_file',
  'exec_interpreter',
  'exec_mode',
  'exp_backoff_restart_delay',
  'filter_env',
  'force',
  'gid',
  'ignore_watch',
  'instance_var',
  'instances',
  'interpreter_args',
  'kill_retry_time',
  'kill_timeout',
  'listen_timeout',
  'log_date_format',
  'log_file',
  'log_type',
  'max_memory_restart',
  'max_restarts',
  'merge_logs',
  'min_uptime',
  'name',
  'namespace',
  'node_args',
  'out_file',
  'pid_file',
  'pm_cwd',
  'pm_exec_path',
  'restart_delay',
  'script',
  'source_map_support',
  'time',
  'treekill',
  'uid',
  'username',
  'wait_ready',
  'watch',
  'windowsHide',
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(
      (key) => [key, canonicalValue(value[key])],
    ));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function stablePm2Namespaces(row) {
  const metadata = row?.pm2_env && typeof row.pm2_env === 'object'
    ? row.pm2_env
    : row ?? {};
  const declaredEnvironment = metadata?.env && typeof metadata.env === 'object'
    ? metadata.env
    : {};
  const rowEnvironment = row?.pm2_env
    && row?.env
    && typeof row.env === 'object'
    ? row.env
    : {};
  const definition = {};
  const effectiveEnvironment = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      VOLATILE_PM2_FIELDS.has(key)
      || key === row?.name
      || key === 'name'
      || key === 'env'
      || key === 'pm2_env'
    ) {
      continue;
    }
    const target = PM2_DEFINITION_FIELDS.has(key)
      ? definition
      : effectiveEnvironment;
    target[key] = value;
  }
  return {
    definition,
    declaredEnvironment,
    effectiveEnvironment,
    rowEnvironment,
  };
}

/**
 * Validate and bind PM2's two environment representations. `env` is the
 * durable declared namespace, while non-definition fields copied directly
 * onto the PM2 process object are the effective namespace. PM2 also repeats
 * `env` at the dump row root; when present it must be byte-for-byte equivalent
 * after canonical JSON normalization.
 */
export function snapshotPm2EnvironmentNamespaces(row, {
  expectedEffectiveOnly,
  expectedDeclaredOnlyKeys,
} = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('PM2 environment identity must be an object');
  }
  if (
    !expectedEffectiveOnly
    || typeof expectedEffectiveOnly !== 'object'
    || Array.isArray(expectedEffectiveOnly)
    || !Array.isArray(expectedDeclaredOnlyKeys)
  ) {
    throw new TypeError('PM2 environment expectations are incomplete');
  }
  const {
    declaredEnvironment,
    effectiveEnvironment,
    rowEnvironment,
  } = stablePm2Namespaces(row);
  const declaredKeys = Object.keys(declaredEnvironment).sort();
  const effectiveKeys = Object.keys(effectiveEnvironment).sort();
  const declaredOnly = declaredKeys.filter(
    (key) => !Object.hasOwn(effectiveEnvironment, key),
  );
  const effectiveOnly = effectiveKeys.filter(
    (key) => !Object.hasOwn(declaredEnvironment, key),
  );
  if (
    JSON.stringify(declaredOnly)
      !== JSON.stringify([...expectedDeclaredOnlyKeys].sort())
    || JSON.stringify(effectiveOnly)
      !== JSON.stringify(Object.keys(expectedEffectiveOnly).sort())
  ) {
    throw new Error('PM2 declared/effective environment keys are not exact');
  }
  for (const key of declaredKeys) {
    if (!Object.hasOwn(effectiveEnvironment, key)) continue;
    if (
      JSON.stringify(canonicalValue(declaredEnvironment[key]))
      !== JSON.stringify(canonicalValue(effectiveEnvironment[key]))
    ) {
      throw new Error(`PM2 effective environment differs for ${key}`);
    }
  }
  for (const [key, value] of Object.entries(expectedEffectiveOnly)) {
    if (
      JSON.stringify(canonicalValue(effectiveEnvironment[key]))
      !== JSON.stringify(canonicalValue(value))
    ) {
      throw new Error(`PM2 effective-only environment differs for ${key}`);
    }
  }
  if (
    Object.keys(rowEnvironment).length > 0
    && JSON.stringify(canonicalValue(rowEnvironment))
      !== JSON.stringify(canonicalValue(declaredEnvironment))
  ) {
    throw new Error('PM2 saved row environment differs from declared environment');
  }
  return Object.freeze({
    declaredKeyCount: declaredKeys.length,
    declaredSha256: canonicalSha256(declaredEnvironment),
    effectiveKeyCount: effectiveKeys.length,
    effectiveSharedKeyCount: effectiveKeys.length - effectiveOnly.length,
    effectiveSharedSha256: canonicalSha256(Object.fromEntries(
      effectiveKeys
        .filter((key) => Object.hasOwn(declaredEnvironment, key))
        .map((key) => [key, effectiveEnvironment[key]]),
    )),
    effectiveOnlyKeyCount: effectiveOnly.length,
  });
}

/**
 * Capture every known durable PM2 launch/restart control for one target. This
 * is intentionally separate from application environment identity: callers
 * can compare live and saved definitions without retaining credential values.
 */
export function snapshotPm2ProcessDefinition(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('PM2 target definition must be an object');
  }
  if (typeof row.name !== 'string' || row.name.length === 0) {
    throw new TypeError('PM2 target definition requires a process name');
  }
  const { definition } = stablePm2Namespaces(row);
  return Object.freeze(canonicalValue({ name: row.name, definition }));
}

/**
 * Capture the durable PM2 definition of every process outside the caller's
 * selected release services. Runtime-only counters are omitted; configuration, environment,
 * paths, arguments, restart policy, and every unknown stable field are bound.
 */
export function snapshotUnrelatedPm2Processes(rows, excludedNames) {
  if (!Array.isArray(rows)) throw new TypeError('PM2 process list must be an array');
  const excluded = new Set(excludedNames);
  const selected = rows.filter((row) => !excluded.has(row?.name));
  const names = selected.map((row) => row?.name);
  if (
    names.some((name) => typeof name !== 'string' || name.length === 0)
    || new Set(names).size !== names.length
  ) {
    throw new TypeError('unrelated PM2 process names must be unique strings');
  }
  return Object.freeze(selected
    .map((row) => {
      const namespaces = stablePm2Namespaces(row);
      return Object.freeze(canonicalValue({ name: row.name, ...namespaces }));
    })
    .sort((left, right) => left.name.localeCompare(right.name)));
}

export function samePm2ProcessSnapshot(left, right) {
  return JSON.stringify(canonicalValue(left))
    === JSON.stringify(canonicalValue(right));
}

/**
 * Bound both real execFile calls and injected test runners. With execFile,
 * timeout/killSignal stops the child. The outer race bounds caller wait for an
 * injected runner, but cannot stop a runner that deliberately ignores abort.
 */
export async function runBoundedPm2Command({
  runCommand,
  args,
  commandEnvironment,
  timeoutMs = DEFAULT_PM2_COMMAND_TIMEOUT_MS,
  maxBuffer = 16 * 1024 * 1024,
}) {
  if (typeof runCommand !== 'function') {
    throw new TypeError('PM2 command runner must be a function');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('PM2 command arguments must be strings');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('PM2 command timeout must be a positive integer');
  }

  const controller = new AbortController();
  let timeout;
  const operation = Promise.resolve().then(() => runCommand('pm2', args, {
    encoding: 'utf8',
    env: commandEnvironment,
    maxBuffer,
    signal: controller.signal,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  }));
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const timeoutError = new Error('bounded PM2 command timed out');
          timeoutError.code = 'OPENDEXTER_PM2_TIMEOUT';
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    // execFile attaches stdout/stderr to failures. `pm2 jlist` can place the
    // complete process environment there, so never propagate the original
    // error, message, cause, output, or enumerable fields.
    throw sanitizedPm2Failure(error, args, timeoutMs);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
