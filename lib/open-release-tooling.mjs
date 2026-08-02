import {
  lstatSync,
  realpathSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  delimiter,
  dirname,
  join,
  resolve,
} from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA1_OBJECT_ID = /^[0-9a-f]{40}$/;
const REVIEWED_ARCHIVE_REF = 'refs/dexter/release-source';
const REVIEWED_REMOTE_SOURCE_REF = 'refs/dexter/reviewed-remote-source';
const REVIEWED_ARCHIVE_ATTRIBUTES = [
  '* -export-ignore -export-subst',
  '**/* -export-ignore -export-subst',
  '',
].join('\n');

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

function textOutput(result) {
  if (typeof result?.stdout === 'string') return result.stdout;
  if (Buffer.isBuffer(result?.stdout)) return result.stdout.toString('utf8');
  return '';
}

function reviewedBareGitArgs(gitDir, args) {
  return [
    '--no-replace-objects',
    `--git-dir=${gitDir}`,
    '-c', 'core.attributesFile=/dev/null',
    ...args,
  ];
}

async function initializeReviewedBareGit({
  workspace,
  runCommand,
  toolEnvironment,
}) {
  const controlRoot = await mkdtemp(join(workspace, '.reviewed-git-'));
  const gitDir = join(controlRoot, 'objects.git');
  await runCommand('git', [
    '--no-replace-objects',
    '-c', 'init.templateDir=',
    'init', '--bare', '--quiet', '--template=', '--object-format=sha1', gitDir,
  ], {
    cwd: controlRoot,
    encoding: 'utf8',
    env: toolEnvironment,
  });
  await mkdir(join(gitDir, 'info'), { recursive: true, mode: 0o700 });
  await mkdir(join(gitDir, 'objects', 'info'), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    join(gitDir, 'info', 'attributes'),
    REVIEWED_ARCHIVE_ATTRIBUTES,
    { flag: 'wx', mode: 0o600 },
  );
  return { controlRoot, gitDir };
}

/**
 * Query a remote from a new config-isolated bare repository. Running
 * `ls-remote` inside the source checkout would otherwise load its mutable
 * `.git/config` (including url.* rewrites and credential helpers).
 */
export async function reviewedGitRemoteRefs({
  remote,
  runCommand = execFileAsync,
  environment = process.env,
  timeout = 30_000,
} = {}) {
  if (typeof remote !== 'string' || remote.length === 0) {
    throw new TypeError('opendexter_reviewed_git_remote_invalid');
  }
  const toolEnvironment = reviewedReleaseToolEnvironment({ env: environment });
  const workspace = await mkdtemp(join(tmpdir(), 'opendexter-git-remote-'));
  try {
    const { controlRoot, gitDir } = await initializeReviewedBareGit({
      workspace,
      runCommand,
      toolEnvironment,
    });
    return textOutput(await runCommand('git', reviewedBareGitArgs(gitDir, [
      'ls-remote', '--refs', remote,
    ]), {
      cwd: controlRoot,
      encoding: 'utf8',
      env: toolEnvironment,
      timeout,
    }));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/**
 * Prove one advertised remote ref all the way through exact source bytes.
 * The ref is fetched into a new config-free bare repository, its commit/tree
 * are resolved, and a second controlled archive repository reconstructs the
 * same sterile tar bytes used by release provenance.
 */
export async function reviewedRemoteGitSourceIdentity({
  remote,
  ref,
  commit,
  tree,
  archiveSha256,
  runCommand = execFileAsync,
  environment = process.env,
  timeout = 120_000,
} = {}) {
  if (
    typeof remote !== 'string'
    || remote.length === 0
    || !/^refs\/[A-Za-z0-9._/-]+$/.test(String(ref ?? ''))
    || !SHA1_OBJECT_ID.test(String(commit ?? ''))
    || !SHA1_OBJECT_ID.test(String(tree ?? ''))
    || !/^[0-9a-f]{64}$/.test(String(archiveSha256 ?? ''))
  ) {
    throw new TypeError('opendexter_reviewed_remote_source_invalid');
  }
  const toolEnvironment = reviewedReleaseToolEnvironment({ env: environment });
  const workspace = await mkdtemp(join(tmpdir(), 'opendexter-git-source-'));
  const archivePath = join(workspace, 'source.tar');
  try {
    const { controlRoot, gitDir } = await initializeReviewedBareGit({
      workspace,
      runCommand,
      toolEnvironment,
    });
    const advertised = textOutput(await runCommand(
      'git',
      reviewedBareGitArgs(gitDir, ['ls-remote', '--refs', remote, ref]),
      {
        cwd: controlRoot,
        encoding: 'utf8',
        env: toolEnvironment,
        timeout,
      },
    )).trim();
    if (advertised !== `${commit}\t${ref}`) {
      throw new Error('reviewed remote source ref is not exact');
    }
    await runCommand('git', reviewedBareGitArgs(gitDir, [
      'fetch', '--quiet', '--force', '--no-tags', '--no-recurse-submodules',
      remote, `${ref}:${REVIEWED_REMOTE_SOURCE_REF}`,
    ]), {
      cwd: controlRoot,
      encoding: 'utf8',
      env: toolEnvironment,
      timeout,
    });
    const fetchedCommit = textOutput(await runCommand(
      'git',
      reviewedBareGitArgs(gitDir, [
        'rev-parse', `${REVIEWED_REMOTE_SOURCE_REF}^{commit}`,
      ]),
      { cwd: controlRoot, encoding: 'utf8', env: toolEnvironment },
    )).trim();
    const fetchedTree = textOutput(await runCommand(
      'git',
      reviewedBareGitArgs(gitDir, [
        'rev-parse', `${REVIEWED_REMOTE_SOURCE_REF}^{tree}`,
      ]),
      { cwd: controlRoot, encoding: 'utf8', env: toolEnvironment },
    )).trim();
    if (fetchedCommit !== commit || fetchedTree !== tree) {
      throw new Error('reviewed remote source object identity mismatch');
    }
    await createReviewedGitArchive({
      sourceRoot: gitDir,
      commit,
      expectedTree: tree,
      outputPath: archivePath,
      workspace,
      runCommand,
      environment,
    });
    const actualArchiveSha256 = createHash('sha256')
      .update(await readFile(archivePath))
      .digest('hex');
    if (actualArchiveSha256 !== archiveSha256) {
      throw new Error('reviewed remote source archive identity mismatch');
    }
    return Object.freeze({
      remote,
      ref,
      commit: fetchedCommit,
      tree: fetchedTree,
      archiveSha256: actualArchiveSha256,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/**
 * Archive one exact commit through a disposable bare object repository. The
 * source checkout supplies content-addressed objects only: its local config,
 * info/attributes, core.attributesFile, templates, and Git defaults are never
 * consulted by `git archive`. Controlled highest-precedence attributes force
 * export-ignore/export-subst off for every path, preserving exact tree bytes.
 */
export async function createReviewedGitArchive({
  sourceRoot,
  commit,
  expectedTree,
  outputPath,
  workspace,
  runCommand = execFileAsync,
  environment = process.env,
} = {}) {
  if (!SHA1_OBJECT_ID.test(String(commit ?? ''))) {
    throw new TypeError('opendexter_reviewed_git_commit_invalid');
  }
  if (
    expectedTree !== undefined
    && !SHA1_OBJECT_ID.test(String(expectedTree ?? ''))
  ) {
    throw new TypeError('opendexter_reviewed_git_tree_invalid');
  }
  if (
    typeof sourceRoot !== 'string'
    || typeof outputPath !== 'string'
    || typeof workspace !== 'string'
  ) {
    throw new TypeError('opendexter_reviewed_git_archive_path_invalid');
  }
  const toolEnvironment = reviewedReleaseToolEnvironment({ env: environment });
  const { controlRoot, gitDir } = await initializeReviewedBareGit({
    workspace,
    runCommand,
    toolEnvironment,
  });
  try {
    const sourceGitArgs = [
      '--no-replace-objects',
      '-c', 'core.attributesFile=/dev/null',
      '-C', sourceRoot,
      'rev-parse', '--path-format=absolute', '--git-path', 'objects',
    ];
    const objectDirectoryOutput = textOutput(await runCommand(
      'git',
      sourceGitArgs,
      { encoding: 'utf8', env: toolEnvironment },
    )).trim();
    if (!objectDirectoryOutput || /[\0\r\n]/.test(objectDirectoryOutput)) {
      throw new Error('reviewed Git source object directory is invalid');
    }
    const objectDirectory = await realpath(objectDirectoryOutput);
    const objectStat = await lstat(objectDirectory);
    if (!objectStat.isDirectory() || objectStat.isSymbolicLink()) {
      throw new Error('reviewed Git source object directory is not a directory');
    }
    await writeFile(
      join(gitDir, 'objects', 'info', 'alternates'),
      `${objectDirectory}\n`,
      { flag: 'wx', mode: 0o600 },
    );

    await runCommand('git', reviewedBareGitArgs(gitDir, [
      'update-ref', REVIEWED_ARCHIVE_REF, commit,
    ]), {
      cwd: controlRoot,
      encoding: 'utf8',
      env: toolEnvironment,
    });
    const resolvedCommit = textOutput(await runCommand(
      'git',
      reviewedBareGitArgs(gitDir, [
        'rev-parse', `${REVIEWED_ARCHIVE_REF}^{commit}`,
      ]),
      { cwd: controlRoot, encoding: 'utf8', env: toolEnvironment },
    )).trim();
    const resolvedTree = textOutput(await runCommand(
      'git',
      reviewedBareGitArgs(gitDir, [
        'rev-parse', `${REVIEWED_ARCHIVE_REF}^{tree}`,
      ]),
      { cwd: controlRoot, encoding: 'utf8', env: toolEnvironment },
    )).trim();
    if (
      resolvedCommit !== commit
      || !SHA1_OBJECT_ID.test(resolvedTree)
      || (expectedTree !== undefined && resolvedTree !== expectedTree)
    ) {
      throw new Error('reviewed Git archive object identity mismatch');
    }

    await runCommand('git', reviewedBareGitArgs(gitDir, [
      'archive', '--format=tar', '--output', outputPath,
      REVIEWED_ARCHIVE_REF,
    ]), {
      cwd: controlRoot,
      encoding: 'utf8',
      env: toolEnvironment,
    });
    return Object.freeze({ commit: resolvedCommit, tree: resolvedTree });
  } finally {
    await rm(controlRoot, { recursive: true, force: true });
  }
}
