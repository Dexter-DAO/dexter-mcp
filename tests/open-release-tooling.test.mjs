import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  createReviewedGitArchive,
  reviewedGitRemoteRefs,
  reviewedRemoteGitSourceIdentity,
} from '../lib/open-release-tooling.mjs';
import {
  readExpectedOpenReleaseRoster,
} from '../lib/open-release-identity.mjs';

const execFileAsync = promisify(execFile);

async function git(root, ...args) {
  const { stdout = '' } = await execFileAsync(
    'git',
    ['--no-replace-objects', '-C', root, ...args],
    { encoding: 'utf8' },
  );
  return stdout.trim();
}

async function committedRepository(prefix, files) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = resolve(root, relative);
    await mkdir(resolve(absolute, '..'), { recursive: true });
    await writeFile(absolute, contents);
  }
  await git(root, 'init', '--quiet');
  await git(root, 'config', 'user.email', 'fixture@example.test');
  await git(root, 'config', 'user.name', 'Fixture');
  await git(root, 'add', '.');
  await git(root, 'commit', '--quiet', '-m', 'fixture');
  return root;
}

test('reviewed archive preserves exact tree bytes despite every Git attribute layer', async () => {
  const sourceRoot = await committedRepository(
    'opendexter-hostile-attributes-',
    {
      '.gitattributes': [
        'committed-hidden.txt export-ignore',
        'committed-substituted.txt export-subst',
        'nested/** export-ignore export-subst',
        '',
      ].join('\n'),
      'committed-hidden.txt': 'must remain present\n',
      'committed-substituted.txt': 'literal $Format:%H$ bytes\n',
      'nested/deep.txt': 'literal nested $Format:%H$ bytes\n',
      'info-hidden.txt': 'mutable info attributes cannot hide me\n',
      'global-hidden.txt': 'mutable global attributes cannot hide me\n',
    },
  );
  const workspace = await mkdtemp(join(tmpdir(), 'opendexter-archive-work-'));
  const archivePath = resolve(workspace, 'source.tar');
  const extracted = resolve(workspace, 'extracted');
  try {
    const infoAttributes = await git(
      sourceRoot,
      'rev-parse', '--path-format=absolute', '--git-path', 'info/attributes',
    );
    await mkdir(resolve(infoAttributes, '..'), { recursive: true });
    await writeFile(infoAttributes, [
      'info-hidden.txt export-ignore',
      'committed-substituted.txt export-subst',
      '',
    ].join('\n'));
    const globalAttributes = resolve(workspace, 'global.attributes');
    await writeFile(globalAttributes, [
      'global-hidden.txt export-ignore',
      'nested/deep.txt export-subst',
      '',
    ].join('\n'));
    await git(sourceRoot, 'config', 'core.attributesFile', globalAttributes);

    const commit = await git(sourceRoot, 'rev-parse', 'HEAD');
    const tree = await git(sourceRoot, 'rev-parse', 'HEAD^{tree}');
    assert.deepEqual(
      await createReviewedGitArchive({
        sourceRoot,
        commit,
        expectedTree: tree,
        outputPath: archivePath,
        workspace,
      }),
      { commit, tree },
    );
    await mkdir(extracted);
    await execFileAsync('tar', ['-xf', archivePath, '-C', extracted]);
    for (const [relative, expected] of [
      ['committed-hidden.txt', 'must remain present\n'],
      ['committed-substituted.txt', 'literal $Format:%H$ bytes\n'],
      ['nested/deep.txt', 'literal nested $Format:%H$ bytes\n'],
      ['info-hidden.txt', 'mutable info attributes cannot hide me\n'],
      ['global-hidden.txt', 'mutable global attributes cannot hide me\n'],
    ]) {
      assert.equal(await readFile(resolve(extracted, relative), 'utf8'), expected);
    }
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test('remote proof ignores caller-CWD local, global, system, and injected Git rewrites', async () => {
  const correctSource = await committedRepository(
    'opendexter-correct-remote-',
    { 'correct.txt': 'correct\n' },
  );
  const wrongSource = await committedRepository(
    'opendexter-wrong-remote-',
    { 'wrong.txt': 'wrong\n' },
  );
  const fixture = await mkdtemp(join(tmpdir(), 'opendexter-git-config-'));
  const correctRemote = resolve(fixture, 'correct.git');
  const wrongRemote = resolve(fixture, 'wrong.git');
  const hostileHome = resolve(fixture, 'home');
  const hostileSystemConfig = resolve(fixture, 'system.gitconfig');
  const calls = [];
  const originalCwd = process.cwd();
  try {
    await execFileAsync('git', ['clone', '--quiet', '--bare', correctSource, correctRemote]);
    await execFileAsync('git', ['clone', '--quiet', '--bare', wrongSource, wrongRemote]);
    await mkdir(hostileHome);
    const rewrite = [
      `[url "${wrongRemote}"]`,
      `\tinsteadOf = ${correctRemote}`,
      '',
    ].join('\n');
    await writeFile(resolve(hostileHome, '.gitconfig'), rewrite);
    await writeFile(hostileSystemConfig, rewrite);
    await git(
      correctSource,
      'config', `url.${wrongRemote}.insteadOf`, correctRemote,
    );
    const correctCommit = await git(correctSource, 'rev-parse', 'HEAD');
    const wrongCommit = await git(wrongSource, 'rev-parse', 'HEAD');
    process.chdir(correctSource);
    const refs = await reviewedGitRemoteRefs({
      remote: correctRemote,
      environment: {
        ...process.env,
        HOME: hostileHome,
        GIT_CONFIG_GLOBAL: resolve(hostileHome, '.gitconfig'),
        GIT_CONFIG_SYSTEM: hostileSystemConfig,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.${wrongRemote}.insteadOf`,
        GIT_CONFIG_VALUE_0: correctRemote,
      },
      runCommand: async (command, args, options = {}) => {
        calls.push({ command, args: [...args], options });
        return execFileAsync(command, args, options);
      },
    });
    assert.match(refs, new RegExp(`^${correctCommit}\\s`, 'm'));
    assert.doesNotMatch(refs, new RegExp(`^${wrongCommit}\\s`, 'm'));
    const remoteCall = calls.find(({ args }) => args.includes('ls-remote'));
    assert.ok(remoteCall);
    assert.equal(remoteCall.args.some((arg) => arg === '-C'), false);
    assert.equal(
      remoteCall.args.some((arg) => arg.startsWith('--git-dir=')),
      true,
    );
    assert.equal(remoteCall.options.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(remoteCall.options.env.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(remoteCall.options.env.GIT_CONFIG_COUNT, undefined);
    assert.equal(remoteCall.options.env.GIT_CONFIG_SYSTEM, undefined);
  } finally {
    process.chdir(originalCwd);
    await rm(correctSource, { recursive: true, force: true });
    await rm(wrongSource, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
  }
});

test('remote source proof binds advertised ref, exact tree, and sterile archive bytes', async () => {
  const source = await committedRepository(
    'opendexter-exact-remote-source-',
    {
      '.gitattributes': 'ignored.txt export-ignore\nsubstituted.txt export-subst\n',
      'ignored.txt': 'still part of the sterile archive\n',
      'substituted.txt': 'literal $Format:%H$ bytes\n',
    },
  );
  const fixture = await mkdtemp(join(tmpdir(), 'opendexter-remote-source-proof-'));
  const remote = resolve(fixture, 'source.git');
  const archive = resolve(fixture, 'expected.tar');
  const ref = 'refs/heads/main';
  try {
    await git(source, 'branch', '-M', 'main');
    await execFileAsync('git', ['clone', '--quiet', '--bare', source, remote]);
    const commit = await git(source, 'rev-parse', 'HEAD');
    const tree = await git(source, 'rev-parse', 'HEAD^{tree}');
    await createReviewedGitArchive({
      sourceRoot: source,
      commit,
      expectedTree: tree,
      outputPath: archive,
      workspace: fixture,
    });
    const archiveSha256 = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
    assert.deepEqual(
      await reviewedRemoteGitSourceIdentity({
        remote,
        ref,
        commit,
        tree,
        archiveSha256,
      }),
      { remote, ref, commit, tree, archiveSha256 },
    );

    await assert.rejects(
      reviewedRemoteGitSourceIdentity({
        remote,
        ref: 'refs/heads/missing',
        commit,
        tree,
        archiveSha256,
      }),
      /remote source ref is not exact/,
    );
    await assert.rejects(
      reviewedRemoteGitSourceIdentity({
        remote,
        ref,
        commit,
        tree: 'f'.repeat(40),
        archiveSha256,
      }),
      /remote source object identity mismatch/,
    );
    await assert.rejects(
      reviewedRemoteGitSourceIdentity({
        remote,
        ref,
        commit,
        tree,
        archiveSha256: 'f'.repeat(64),
      }),
      /remote source archive identity mismatch/,
    );
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
  }
});

test('runtime roster accepts final SEP-986 names and refuses slash or overflow', () => {
  const accepted = [
    'A',
    'tools_code-interpreter_jobs',
    'tools.deep-research-jobs',
    'x'.repeat(128),
  ];
  assert.deepEqual(
    readExpectedOpenReleaseRoster({
      DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(accepted),
    }),
    accepted,
  );
  for (const rejected of [
    ['tools/code-interpreter'],
    ['tools code-interpreter'],
    [''],
    ['x'.repeat(129)],
  ]) {
    assert.throws(
      () => readExpectedOpenReleaseRoster({
        DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(rejected),
      }),
      /invalid_opendexter_release_roster/,
    );
  }
});
