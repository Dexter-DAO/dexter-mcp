import {
  lstatSync,
  realpathSync,
} from 'node:fs';
import {
  delimiter,
  dirname,
  resolve,
} from 'node:path';

export const REVIEWED_NPM_VERSION = '10.9.3';

export const FORBIDDEN_RELEASE_TOOL_ENV_KEYS = Object.freeze([
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'TAR_OPTIONS',
]);

function nonemptyEnvironmentValue(env, key) {
  return typeof env?.[key] === 'string' && env[key].length > 0;
}

/**
 * Return one deliberately small environment for every release-proof child.
 * Ambient npm configuration is not inherited; loader/archive injection is a
 * hard refusal because it may already have affected the reviewing process.
 */
export function reviewedReleaseToolEnvironment({
  env = process.env,
  production = false,
  npmCache,
} = {}) {
  const forbiddenKeys = new Set([
    ...FORBIDDEN_RELEASE_TOOL_ENV_KEYS,
    ...Object.keys(env || {}).filter((key) => key.startsWith('LD_')),
  ]);
  for (const key of forbiddenKeys) {
    if (nonemptyEnvironmentValue(env, key)) {
      throw new TypeError(`opendexter_release_tool_env_forbidden:${key}`);
    }
  }
  const nodeBin = dirname(realpathSync(process.execPath));
  const path = [
    nodeBin,
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ].filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join(delimiter);
  return Object.fromEntries(Object.entries({
    PATH: path,
    HOME: env?.HOME,
    LANG: 'C',
    LC_ALL: 'C',
    NODE_ENV: production ? 'production' : undefined,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_userconfig: '/dev/null',
    // npm 10 rejects loading one path as both user and global config. This
    // second path cannot be created by the unprivileged release user, so both
    // config layers remain inert without inheriting an ambient npmrc.
    npm_config_globalconfig: '/dev/null.opendexter-release-global-npmrc',
    npm_config_cache: npmCache,
  }).filter(([, value]) => value !== undefined));
}

/** Bind npm execution to the npm CLI installed beside this exact Node. */
export function reviewedNpmInvocation(args = []) {
  const nodeExecutable = realpathSync(process.execPath);
  const npmCli = realpathSync(resolve(
    dirname(nodeExecutable),
    '../lib/node_modules/npm/bin/npm-cli.js',
  ));
  const stat = lstatSync(npmCli);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || (stat.mode & 0o022) !== 0
  ) {
    throw new TypeError('opendexter_reviewed_npm_cli_invalid');
  }
  return Object.freeze({
    command: nodeExecutable,
    args: Object.freeze([npmCli, ...args]),
    npmCli,
    nodeExecutable,
  });
}
