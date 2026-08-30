import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
import {
  modelSafePortfolioSnapshot,
  validateAndBoundPortfolioSnapshotV1,
} from '../lib/session-portfolio.mjs';
import {
  assertOpenDexterPrivateReceiptChildEnvironment,
  createOpenDexterPrivateSourceAdvertisementReceipt,
  hasExactOpenDexterSourceContractsShape,
  isSafeOpenDexterPrivateSourceReceiptStat,
  readOpenDexterSourceContracts,
  readOpenDexterPrivateSourceAdvertisementReceipts,
  reviewedSourceContractRemoteRefs,
  verifyExactOpenDexterSourceContractsShape,
  verifyOpenDexterCrossRepositorySourceContracts,
  verifyOpenDexterPrivateSourceAdvertisementReceipt,
} from '../scripts/materialize-open-tool-descriptors.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MATERIALIZER_PATH = fileURLToPath(new URL(
  '../scripts/materialize-open-tool-descriptors.mjs',
  import.meta.url,
));
const API_ORIGIN = 'https://github.com/Dexter-DAO/dexter-api.git';
const FACILITATOR_ORIGIN =
  'https://github.com/Dexter-DAO/dexter-facilitator.git';
const BINDING_FIXTURE_PATH = fileURLToPath(new URL(
  './fixtures/governed-agent-trade-api-facilitator-binding-v1.json',
  import.meta.url,
));
const PORTFOLIO_PROJECTION_FIXTURE_PATH = fileURLToPath(new URL(
  './fixtures/opendexter-portfolio-v1-zero-holding-approved-action-targets.json',
  import.meta.url,
));

function manifest() {
  return JSON.parse(readFileSync(
    new URL('../release/opendexter-source-contracts.json', import.meta.url),
    'utf8',
  ));
}

function sourceContractsSha256() {
  return createHash('sha256').update(readFileSync(
    new URL('../release/opendexter-source-contracts.json', import.meta.url),
  )).digest('hex');
}

function descriptorSha256() {
  return createHash('sha256').update(readFileSync(
    new URL('../release/open-tool-descriptors.json', import.meta.url),
  )).digest('hex');
}

function privateReceiptFixture(repository = 'api') {
  const contracts = manifest();
  const descriptorSourceCommit = '1'.repeat(40);
  const descriptorSourceTree = '2'.repeat(40);
  const descriptorDigest = descriptorSha256();
  const sourceDigest = sourceContractsSha256();
  if (repository === 'api') {
    const identities = [
      { commit: contracts.api.commit, tree: contracts.api.tree },
      {
        commit: contracts.integratedApiRelease.commit,
        tree: contracts.integratedApiRelease.tree,
      },
    ];
    return {
      descriptorSourceCommit,
      descriptorSourceTree,
      descriptorSha256: descriptorDigest,
      identities,
      origin: API_ORIGIN,
      receipt: createOpenDexterPrivateSourceAdvertisementReceipt({
        repository: contracts.api.repository,
        origin: API_ORIGIN,
        descriptorSourceCommit,
        descriptorSourceTree,
        descriptorSha256: descriptorDigest,
        sourceContractsSha256: sourceDigest,
        identities,
        remoteRefs: [
          `${contracts.integratedApiRelease.commit}\trefs/heads/integrated`,
          `${contracts.api.commit}\trefs/tags/governed-contract`,
          `${contracts.api.commit}\trefs/heads/governed-contract`,
        ].join('\n'),
      }),
      repository: contracts.api.repository,
      sourceContractsSha256: sourceDigest,
    };
  }
  const identities = [{
    commit: contracts.facilitator.commit,
    tree: contracts.facilitator.tree,
  }];
  return {
    descriptorSourceCommit,
    descriptorSourceTree,
    descriptorSha256: descriptorDigest,
    identities,
    origin: FACILITATOR_ORIGIN,
    receipt: createOpenDexterPrivateSourceAdvertisementReceipt({
      repository: contracts.facilitator.repository,
      origin: FACILITATOR_ORIGIN,
      descriptorSourceCommit,
      descriptorSourceTree,
      descriptorSha256: descriptorDigest,
      sourceContractsSha256: sourceDigest,
      identities,
      remoteRefs:
        `${contracts.facilitator.commit}\trefs/heads/runtime\n`,
    }),
    repository: contracts.facilitator.repository,
    sourceContractsSha256: sourceDigest,
  };
}

function exactPrivateReceiptChildEnvironment(overrides = {}) {
  return {
    PATH: '/usr/bin:/bin',
    HOME: '/tmp/opendexter-child-home',
    LANG: 'C',
    LC_ALL: 'C',
    NODE_ENV: 'production',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_userconfig: '/dev/null',
    npm_config_globalconfig: '/dev/null.opendexter-release-global-npmrc',
    npm_config_cache: '/tmp/opendexter-npm-cache',
    OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS: '1',
    OPENDEXTER_API_SOURCE_ROOT: '/tmp/opendexter-api',
    OPENDEXTER_FACILITATOR_SOURCE_ROOT: '/tmp/opendexter-facilitator',
    OPENDEXTER_API_SOURCE_RECEIPT_PATH: '/tmp/opendexter-api-receipt',
    OPENDEXTER_API_SOURCE_RECEIPT_SHA256: '3'.repeat(64),
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH:
      '/tmp/opendexter-facilitator-receipt',
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_SHA256: '4'.repeat(64),
    OPENDEXTER_DESCRIPTOR_SOURCE_COMMIT: '1'.repeat(40),
    OPENDEXTER_DESCRIPTOR_SOURCE_TREE: '2'.repeat(40),
    SENTRY_DSN: '',
    SENTRY_OPEN_MCP_DSN: '',
    ...overrides,
  };
}

function createCrossRepositoryHarness(t, options = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'opendexter-source-contracts-'));
  const apiRoot = join(workspace, 'api');
  const facilitatorRoot = join(workspace, 'facilitator');
  mkdirSync(apiRoot);
  mkdirSync(facilitatorRoot);
  t.after(() => rmSync(workspace, { recursive: true, force: true }));

  const contracts = manifest();
  const fixtureBytes = readFileSync(BINDING_FIXTURE_PATH);
  const projectionFixtureBytes = readFileSync(
    PORTFOLIO_PROJECTION_FIXTURE_PATH,
  );
  const response = (value, commandOptions) => ({
    stdout: commandOptions?.encoding === null
      ? Buffer.from(value)
      : Buffer.from(value).toString('utf8'),
    stderr: commandOptions?.encoding === null ? Buffer.alloc(0) : '',
  });
  const runCommand = async (command, args, commandOptions = {}) => {
    assert.equal(command, 'git');
    assert.equal(args[0], '--no-replace-objects');
    assert.equal(args[1], '-C');
    const root = args[2];
    const gitArgs = args.slice(3);
    const isApi = root === apiRoot;
    const isFacilitator = root === facilitatorRoot;
    assert.equal(isApi || isFacilitator, true);

    if (gitArgs[0] === 'rev-parse' && gitArgs[1] === '--show-toplevel') {
      return response(root, commandOptions);
    }
    if (gitArgs[0] === 'remote') {
      const canonical = isApi ? API_ORIGIN : FACILITATOR_ORIGIN;
      const value = options.noncanonicalOrigin === (isApi ? 'api' : 'facilitator')
        ? 'file:///tmp/hostile.git'
        : canonical;
      return response(`${value}\n`, commandOptions);
    }
    if (gitArgs[0] === 'rev-parse') {
      const expression = gitArgs[1];
      const commit = expression.slice(0, 40);
      if (expression.endsWith('^{commit}')) {
        return response(`${commit}\n`, commandOptions);
      }
      if (expression.endsWith('^{tree}')) {
        let tree;
        if (isApi && commit === contracts.api.commit) tree = contracts.api.tree;
        if (isApi && commit === contracts.integratedApiRelease.commit) {
          tree = options.wrongTree
            ? 'f'.repeat(40)
            : contracts.integratedApiRelease.tree;
        }
        if (isFacilitator && commit === contracts.facilitator.commit) {
          tree = contracts.facilitator.tree;
        }
        return response(`${tree}\n`, commandOptions);
      }
    }
    if (gitArgs[0] === 'merge-base') {
      if (options.nonAncestor) throw new Error('not an ancestor');
      return response('', commandOptions);
    }
    if (gitArgs[0] === 'diff') {
      return response(
        options.governedDrift
          ? 'src/routes/governedDelegatedAssetActions.ts\n'
          : '',
        commandOptions,
      );
    }
    if (gitArgs[0] === 'show') {
      const [object, path] = gitArgs[1].split(':');
      if (contracts.portfolioProjection.sourcePaths.includes(path)) {
        return response(
          options.projectionSourceMissing === true
            || options.projectionSourceMissing === path
            ? Buffer.alloc(0)
            : Buffer.from(`// exact producer composition: ${path}\n`),
          commandOptions,
        );
      }
      if (path === contracts.portfolioProjection.fixture.apiPath) {
        return response(
          options.projectionFixtureDrift
            ? Buffer.from(JSON.stringify({
                ...JSON.parse(projectionFixtureBytes),
                hostile: true,
              }))
            : projectionFixtureBytes,
          commandOptions,
        );
      }
      const driftKey = isFacilitator
        ? 'facilitator'
        : object === contracts.api.commit ? 'api-contract' : 'api-integrated';
      return response(
        options.fixtureDrift === driftKey
          ? Buffer.concat([fixtureBytes, Buffer.from('hostile')])
          : fixtureBytes,
        commandOptions,
      );
    }
    throw new Error(`unexpected Git command: ${gitArgs.join(' ')}`);
  };
  const remoteRefsReader = async ({ remote }) => {
    if (remote === API_ORIGIN) {
      return [contracts.api.commit, contracts.integratedApiRelease.commit]
        .filter((commit) => options.unadvertisedCommit !== commit)
        .map((commit, index) => `${commit}\trefs/heads/source-${index}\n`)
        .join('');
    }
    if (remote === FACILITATOR_ORIGIN) {
      return options.unadvertisedCommit === contracts.facilitator.commit
        ? ''
        : `${contracts.facilitator.commit}\trefs/heads/source\n`;
    }
    throw new Error('unexpected canonical remote');
  };
  return {
    apiRoot,
    contracts,
    facilitatorRoot,
    remoteRefsReader,
    runCommand,
  };
}

async function verifyHarness(harness) {
  return verifyOpenDexterCrossRepositorySourceContracts({
    sourceRoot: REPOSITORY_ROOT,
    apiSourceRoot: harness.apiRoot,
    facilitatorSourceRoot: harness.facilitatorRoot,
    sourceContracts: harness.contracts,
    runCommand: harness.runCommand,
    remoteRefsReader: harness.remoteRefsReader,
    environment: { HOME: '/tmp' },
  });
}

test('sourceContracts/v3 has one exact immutable shape and exact local fixtures', async () => {
  const sourceContracts = manifest();
  assert.equal(hasExactOpenDexterSourceContractsShape(sourceContracts), true);
  assert.equal(
    verifyExactOpenDexterSourceContractsShape(sourceContracts),
    sourceContracts,
  );
  const projectionFixtureBytes = readFileSync(
    PORTFOLIO_PROJECTION_FIXTURE_PATH,
  );
  assert.equal(projectionFixtureBytes.byteLength, 8529);
  assert.equal(
    createHash('sha256').update(projectionFixtureBytes).digest('hex'),
    '9c4c29b0d911b490d53a375eca1ae302501397be9c56250591bafaeb34a4e625',
  );
  assert.equal(
    canonicalHash(JSON.parse(projectionFixtureBytes)),
    'f4a3f826aa1c08531d42da402f08df709642ea75a84fd74608be75cdba2fc28a',
  );
  assert.deepEqual(await readOpenDexterSourceContracts(), sourceContracts);

  const fixtureBytes = readFileSync(BINDING_FIXTURE_PATH);
  assert.equal(fixtureBytes.byteLength, 1049);
  assert.equal(
    createHash('sha256').update(fixtureBytes).digest('hex'),
    '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6',
  );

  const extra = structuredClone(sourceContracts);
  extra.integratedApiRelease.extra = true;
  assert.equal(hasExactOpenDexterSourceContractsShape(extra), false);
  const substitutedComposition = structuredClone(sourceContracts);
  substitutedComposition.portfolioProjection.sourcePaths[2] =
    'src/routes/hostileComposition.ts';
  assert.equal(
    hasExactOpenDexterSourceContractsShape(substitutedComposition),
    false,
  );
  const wrongTree = structuredClone(sourceContracts);
  wrongTree.integratedApiRelease.tree = 'f'.repeat(40);
  assert.throws(
    () => verifyExactOpenDexterSourceContractsShape(wrongTree),
    /manifest is invalid/,
  );
});

test('private source receipts bind exact repository refs and descriptor source', () => {
  const fixture = privateReceiptFixture('api');
  assert.equal(
    verifyOpenDexterPrivateSourceAdvertisementReceipt(fixture.receipt, {
      repository: fixture.repository,
      origin: fixture.origin,
      descriptorSourceCommit: fixture.descriptorSourceCommit,
      descriptorSourceTree: fixture.descriptorSourceTree,
      descriptorSha256: fixture.descriptorSha256,
      sourceContractsSha256: fixture.sourceContractsSha256,
      identities: fixture.identities,
    }),
    fixture.receipt,
  );
  assert.deepEqual(fixture.receipt.identities[0].refs, [
    'refs/heads/governed-contract',
    'refs/tags/governed-contract',
  ]);
  assert.deepEqual(fixture.receipt.identities[1].refs, [
    'refs/heads/integrated',
  ]);

  const cases = [
    ['wrong repository', (value) => { value.repository += '-hostile'; }],
    ['wrong origin', (value) => { value.origin = 'file:///tmp/hostile'; }],
    ['wrong descriptor commit', (value) => {
      value.descriptorSource.commit = 'f'.repeat(40);
    }],
    ['wrong descriptor tree', (value) => {
      value.descriptorSource.tree = 'f'.repeat(40);
    }],
    ['wrong descriptor digest', (value) => {
      value.descriptorSource.sha256 = 'f'.repeat(64);
    }],
    ['wrong manifest digest', (value) => {
      value.sourceContracts.sha256 = 'f'.repeat(64);
    }],
    ['wrong source identity', (value) => {
      value.identities[0].commit = 'f'.repeat(40);
    }],
    ['missing advertised ref', (value) => { value.identities[0].refs = []; }],
    ['duplicate advertised ref', (value) => {
      value.identities[0].refs.push(value.identities[0].refs[0]);
    }],
    ['unsorted advertised refs', (value) => {
      value.identities[0].refs.reverse();
    }],
    ['invalid advertised ref', (value) => {
      value.identities[0].refs = ['refs/heads/../hostile'];
    }],
    ['invented field', (value) => { value.hostile = true; }],
  ];
  for (const [name, mutate] of cases) {
    const hostile = structuredClone(fixture.receipt);
    mutate(hostile);
    assert.throws(
      () => verifyOpenDexterPrivateSourceAdvertisementReceipt(hostile, {
        repository: fixture.repository,
        origin: fixture.origin,
        descriptorSourceCommit: fixture.descriptorSourceCommit,
        descriptorSourceTree: fixture.descriptorSourceTree,
        descriptorSha256: fixture.descriptorSha256,
        sourceContractsSha256: fixture.sourceContractsSha256,
        identities: fixture.identities,
      }),
      /private source receipt is invalid/,
      name,
    );
  }

  assert.throws(
    () => createOpenDexterPrivateSourceAdvertisementReceipt({
      repository: fixture.repository,
      origin: fixture.origin,
      descriptorSourceCommit: fixture.descriptorSourceCommit,
      descriptorSourceTree: fixture.descriptorSourceTree,
      descriptorSha256: fixture.descriptorSha256,
      sourceContractsSha256: fixture.sourceContractsSha256,
      identities: fixture.identities,
      remoteRefs: '',
    }),
    /does not advertise/,
  );
  assert.throws(
    () => createOpenDexterPrivateSourceAdvertisementReceipt({
      repository: fixture.repository,
      origin: fixture.origin,
      descriptorSourceCommit: fixture.descriptorSourceCommit,
      descriptorSourceTree: fixture.descriptorSourceTree,
      descriptorSha256: fixture.descriptorSha256,
      sourceContractsSha256: fixture.sourceContractsSha256,
      identities: fixture.identities,
      remoteRefs: `${fixture.identities[0].commit}\trefs/heads/../hostile\n`,
    }),
    /remote refs are invalid/,
  );
  assert.throws(
    () => createOpenDexterPrivateSourceAdvertisementReceipt({
      repository: fixture.repository,
      origin: fixture.origin,
      descriptorSourceCommit: fixture.descriptorSourceCommit,
      descriptorSourceTree: fixture.descriptorSourceTree,
      descriptorSha256: fixture.descriptorSha256,
      sourceContractsSha256: fixture.sourceContractsSha256,
      identities: fixture.identities,
      // --refs exposes an annotated tag object's SHA, not its peeled commit.
      // Such a tag alone is deliberately insufficient; a direct branch or
      // lightweight tag must advertise the exact accepted commit.
      remoteRefs: `${'e'.repeat(40)}\trefs/tags/annotated-only\n`,
    }),
    /does not advertise/,
  );
});

test('private ref lookup keeps its token only in the outer askpass environment', async () => {
  const token = 'github-app-token-that-must-never-reach-disk';
  let askpassPath;
  const remoteRefs = await reviewedSourceContractRemoteRefs({
    remote: API_ORIGIN,
    environment: {
      HOME: '/tmp',
      GH_TOKEN: token,
    },
    runCommand: async (command, args, options) => {
      assert.equal(command, 'git');
      assert.equal(args.includes('credential.helper='), true);
      assert.equal(args.includes('--git-dir=/dev/null'), true);
      assert.equal(args.includes('--refs'), true);
      assert.deepEqual(args.slice(-3), [
        API_ORIGIN,
        'refs/heads/*',
        'refs/tags/*',
      ]);
      assert.equal(JSON.stringify(args).includes(token), false);
      assert.equal(options.cwd.includes(token), false);
      assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null');
      assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
      assert.equal(options.env.GIT_ASKPASS_REQUIRE, 'force');
      assert.equal(options.env.OPENDEXTER_PRIVATE_GIT_TOKEN, token);
      assert.equal(Object.hasOwn(options.env, 'GH_TOKEN'), false);
      assert.equal(
        Object.hasOwn(options.env, 'GITHUB_PERSONAL_ACCESS_TOKEN'),
        false,
      );
      askpassPath = options.env.GIT_ASKPASS;
      const helperBytes = readFileSync(askpassPath, 'utf8');
      assert.equal(helperBytes.includes(token), false);
      assert.equal(helperBytes.includes('extraHeader'), false);
      assert.equal(lstatSync(askpassPath).mode & 0o777, 0o700);
      return {
        stdout: `${manifest().api.commit}\trefs/heads/governed-contract\n`,
        stderr: '',
      };
    },
  });
  assert.equal(remoteRefs.includes(token), false);
  assert.match(remoteRefs, /refs\/heads\/governed-contract/);
  assert.equal(existsSync(askpassPath), false);

  let contacted = false;
  await assert.rejects(
    reviewedSourceContractRemoteRefs({
      remote: API_ORIGIN,
      environment: { GH_TOKEN: 'hostile\nsecond-line' },
      runCommand: async () => {
        contacted = true;
        throw new Error('must not run');
      },
    }),
    /private source token is invalid/,
  );
  assert.equal(contacted, false);
});

test('archived child accepts only two mode-0600 digest-pinned receipts', async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'opendexter-private-receipts-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const api = privateReceiptFixture('api');
  const facilitator = privateReceiptFixture('facilitator');
  const apiPath = join(workspace, 'api.json');
  const facilitatorPath = join(workspace, 'facilitator.json');
  const apiBytes = Buffer.from(`${JSON.stringify(api.receipt, null, 2)}\n`);
  const facilitatorBytes = Buffer.from(
    `${JSON.stringify(facilitator.receipt, null, 2)}\n`,
  );
  writeFileSync(apiPath, apiBytes, { mode: 0o600 });
  writeFileSync(facilitatorPath, facilitatorBytes, { mode: 0o600 });
  const environment = {
    OPENDEXTER_API_SOURCE_RECEIPT_PATH: apiPath,
    OPENDEXTER_API_SOURCE_RECEIPT_SHA256:
      createHash('sha256').update(apiBytes).digest('hex'),
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH: facilitatorPath,
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_SHA256:
      createHash('sha256').update(facilitatorBytes).digest('hex'),
    OPENDEXTER_DESCRIPTOR_SOURCE_COMMIT: api.descriptorSourceCommit,
    OPENDEXTER_DESCRIPTOR_SOURCE_TREE: api.descriptorSourceTree,
  };
  const receipts =
    await readOpenDexterPrivateSourceAdvertisementReceipts({ environment });
  assert.equal(receipts.apiReceipt.repository, manifest().api.repository);
  assert.equal(
    receipts.facilitatorReceipt.repository,
    manifest().facilitator.repository,
  );
  assert.match(
    await receipts.remoteRefsReader({ remote: API_ORIGIN }),
    new RegExp(manifest().integratedApiRelease.commit),
  );
  await assert.rejects(
    receipts.remoteRefsReader({ remote: 'file:///tmp/hostile.git' }),
    /origin is unknown/,
  );

  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({
      environment: {
        ...environment,
        OPENDEXTER_API_SOURCE_RECEIPT_SHA256: 'f'.repeat(64),
      },
    }),
    /digest mismatch/,
  );
  writeFileSync(apiPath, Buffer.concat([apiBytes, Buffer.from(' ')]));
  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({ environment }),
    /digest mismatch/,
  );
  writeFileSync(apiPath, apiBytes);
  chmodSync(apiPath, 0o644);
  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({ environment }),
    /receipt file is unsafe/,
  );
});

test('receipt files reject ownership, links, swaps, and oversized substitution', async (t) => {
  const safeStat = {
    isFile: () => true,
    mode: 0o100600,
    nlink: 1,
    size: 32,
    uid: typeof process.getuid === 'function' ? process.getuid() : 1001,
  };
  assert.equal(
    isSafeOpenDexterPrivateSourceReceiptStat(safeStat, safeStat.uid),
    true,
  );
  assert.equal(isSafeOpenDexterPrivateSourceReceiptStat({
    ...safeStat,
    uid: safeStat.uid + 1,
  }, safeStat.uid), false);
  assert.equal(isSafeOpenDexterPrivateSourceReceiptStat({
    ...safeStat,
    nlink: 2,
  }, safeStat.uid), false);
  assert.equal(isSafeOpenDexterPrivateSourceReceiptStat({
    ...safeStat,
    mode: 0o100644,
  }, safeStat.uid), false);
  assert.equal(isSafeOpenDexterPrivateSourceReceiptStat({
    ...safeStat,
    size: (64 * 1024) + 1,
  }, safeStat.uid), false);

  const workspace = mkdtempSync(join(tmpdir(), 'opendexter-receipt-attacks-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const api = privateReceiptFixture('api');
  const facilitator = privateReceiptFixture('facilitator');
  const apiPath = join(workspace, 'api.json');
  const facilitatorPath = join(workspace, 'facilitator.json');
  const apiBytes = Buffer.from(`${JSON.stringify(api.receipt, null, 2)}\n`);
  const facilitatorBytes = Buffer.from(
    `${JSON.stringify(facilitator.receipt, null, 2)}\n`,
  );
  writeFileSync(apiPath, apiBytes, { mode: 0o600 });
  writeFileSync(facilitatorPath, facilitatorBytes, { mode: 0o600 });
  const environment = {
    OPENDEXTER_API_SOURCE_RECEIPT_PATH: apiPath,
    OPENDEXTER_API_SOURCE_RECEIPT_SHA256:
      createHash('sha256').update(apiBytes).digest('hex'),
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH: facilitatorPath,
    OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_SHA256:
      createHash('sha256').update(facilitatorBytes).digest('hex'),
    OPENDEXTER_DESCRIPTOR_SOURCE_COMMIT: api.descriptorSourceCommit,
    OPENDEXTER_DESCRIPTOR_SOURCE_TREE: api.descriptorSourceTree,
  };

  const hardlink = join(workspace, 'api-hardlink.json');
  linkSync(apiPath, hardlink);
  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({ environment }),
    /receipt file is unsafe/,
  );
  rmSync(hardlink);

  const symlink = join(workspace, 'api-symlink.json');
  symlinkSync(apiPath, symlink);
  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({
      environment: {
        ...environment,
        OPENDEXTER_API_SOURCE_RECEIPT_PATH: symlink,
      },
    }),
    /receipt file is unsafe/,
  );

  const oversized = join(workspace, 'oversized.json');
  const oversizedBytes = Buffer.alloc((64 * 1024) + 1, 0x20);
  writeFileSync(oversized, oversizedBytes, { mode: 0o600 });
  await assert.rejects(
    readOpenDexterPrivateSourceAdvertisementReceipts({
      environment: {
        ...environment,
        OPENDEXTER_API_SOURCE_RECEIPT_PATH: oversized,
        OPENDEXTER_API_SOURCE_RECEIPT_SHA256:
          createHash('sha256').update(oversizedBytes).digest('hex'),
      },
    }),
    /receipt file is unsafe/,
  );

  const originalPath = join(workspace, 'api-opened-original.json');
  let swapped = false;
  const swappingOpen = async (path, flags) => {
    const handle = await openFile(path, flags);
    if (path !== apiPath) return handle;
    return {
      close: () => handle.close(),
      stat: () => handle.stat(),
      readFile: async () => {
        renameSync(apiPath, originalPath);
        writeFileSync(apiPath, '{"hostile":true}\n', { mode: 0o600 });
        swapped = true;
        return handle.readFile();
      },
    };
  };
  const readAfterSwap =
    await readOpenDexterPrivateSourceAdvertisementReceipts({
      environment,
      openFile: swappingOpen,
    });
  assert.equal(swapped, true);
  assert.equal(readAfterSwap.apiReceipt.repository, manifest().api.repository);
});

test('archived receipt mode rejects credential-bearing child environments', () => {
  const safe = exactPrivateReceiptChildEnvironment();
  assert.equal(assertOpenDexterPrivateReceiptChildEnvironment(safe), safe);
  for (const key of [
    'GH_TOKEN',
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'GIT_ASKPASS',
    'GIT_CREDENTIAL_HELPER',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'HTTP_EXTRAHEADER',
  ]) {
    assert.throws(
      () => assertOpenDexterPrivateReceiptChildEnvironment({
        ...safe,
        [key]: 'hostile',
      }),
      /child environment is unsafe/,
      key,
    );
  }
  assert.throws(
    () => assertOpenDexterPrivateReceiptChildEnvironment({
      ...safe,
      GIT_CONFIG_GLOBAL: '/tmp/persisted-gitconfig',
    }),
    /child environment is unsafe/,
  );
  assert.throws(
    () => assertOpenDexterPrivateReceiptChildEnvironment({
      ...safe,
      AMBIENT_UNKNOWN_KEY: 'hostile',
    }),
    /child environment is unsafe/,
  );
  const missing = { ...safe };
  delete missing.OPENDEXTER_API_SOURCE_RECEIPT_SHA256;
  assert.throws(
    () => assertOpenDexterPrivateReceiptChildEnvironment(missing),
    /child environment is unsafe/,
  );
});

test('accepted API projection fixture is an exact zero-holding discovery contract', () => {
  const source = JSON.parse(readFileSync(PORTFOLIO_PROJECTION_FIXTURE_PATH));
  const validated = validateAndBoundPortfolioSnapshotV1(source);
  assert.ok(validated);
  assert.deepEqual(validated.holdings, []);
  assert.equal(validated.portfolioValueUsd, '0');
  assert.equal(validated.approvedActionTargets.length, 4);
  assert.deepEqual(
    validated.approvedActionTargets.map(({ assetId }) => assetId),
    ['backpack-spcx', 'dexter', 'syrup-usdc', 'wrapped-solana'],
  );
  for (const target of validated.approvedActionTargets) {
    assert.deepEqual(
      target.actions.map(({ action, available, reason }) => ({
        action,
        available,
        reason,
      })),
      [
        { action: 'buy', available: true, reason: null },
        { action: 'sell', available: true, reason: null },
        {
          action: 'send',
          available: false,
          reason: 'protected_agent_send_sdk_required',
        },
      ],
    );
  }
  const projected = modelSafePortfolioSnapshot(validated);
  assert.deepEqual(
    projected.approvedActionTargets,
    source.approvedActionTargets,
  );
  assert.deepEqual(projected.holdings, []);
});

test('cross-repository source verifier accepts only the exact frozen graph', async (t) => {
  const harness = createCrossRepositoryHarness(t);
  assert.deepEqual(await verifyHarness(harness), {
    api: {
      repository: 'https://github.com/Dexter-DAO/dexter-api',
      governedContractCommit: harness.contracts.api.commit,
      integratedReleaseCommit: harness.contracts.integratedApiRelease.commit,
    },
    portfolioProjection: {
      repository: 'https://github.com/Dexter-DAO/dexter-api',
      commit: harness.contracts.portfolioProjection.commit,
      fixtureSha256:
        '9c4c29b0d911b490d53a375eca1ae302501397be9c56250591bafaeb34a4e625',
      canonicalDigest:
        'f4a3f826aa1c08531d42da402f08df709642ea75a84fd74608be75cdba2fc28a',
    },
    facilitator: {
      repository: 'https://github.com/Dexter-DAO/dexter-facilitator',
      commit: harness.contracts.facilitator.commit,
    },
    bindingFixtureSha256:
      '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6',
  });
});

test('cross-repository source verifier rejects every identity and byte attack', async (t) => {
  const cases = [
    ['wrong tree', { wrongTree: true }, /commit\/tree identity mismatch/],
    ['non-ancestor release', { nonAncestor: true }, /does not descend/],
    ['governed byte drift', { governedDrift: true }, /changes the frozen/],
    ['API fixture drift', { fixtureDrift: 'api-contract' }, /source bytes differ/],
    ['facilitator fixture drift', { fixtureDrift: 'facilitator' }, /source bytes differ/],
    ['portfolio fixture drift', { projectionFixtureDrift: true }, /projection source bytes differ/],
    ['portfolio source missing', {
      projectionSourceMissing: 'src/routes/passkeyMcpBinding.ts',
    }, /projection source bytes differ/],
    ['noncanonical API origin', { noncanonicalOrigin: 'api' }, /not canonical/],
    ['noncanonical facilitator origin', {
      noncanonicalOrigin: 'facilitator',
    }, /not canonical/],
    ['unadvertised API release', {
      unadvertisedCommit: manifest().integratedApiRelease.commit,
    }, /does not advertise/],
    ['unadvertised facilitator source', {
      unadvertisedCommit: manifest().facilitator.commit,
    }, /does not advertise/],
  ];
  for (const [name, options, expected] of cases) {
    await t.test(name, async (child) => {
      await assert.rejects(
        verifyHarness(createCrossRepositoryHarness(child, options)),
        expected,
      );
    });
  }
});

test('release CLI and archived emit proof fail before success without explicit roots', () => {
  const baseEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => ![
      'OPENDEXTER_API_SOURCE_ROOT',
      'OPENDEXTER_FACILITATOR_SOURCE_ROOT',
      'OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS',
      'OPENDEXTER_API_SOURCE_RECEIPT_PATH',
      'OPENDEXTER_API_SOURCE_RECEIPT_SHA256',
      'OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH',
      'OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_SHA256',
      'OPENDEXTER_DESCRIPTOR_SOURCE_COMMIT',
      'OPENDEXTER_DESCRIPTOR_SOURCE_TREE',
      'GH_TOKEN',
      'GITHUB_PERSONAL_ACCESS_TOKEN',
    ].includes(key)),
  );
  for (const args of [['--check'], ['--write']]) {
    const result = spawnSync(process.execPath, [MATERIALIZER_PATH, ...args], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: baseEnvironment,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OPENDEXTER_API_SOURCE_ROOT must be supplied/);
  }

  const archivedEmit = spawnSync(
    process.execPath,
    [MATERIALIZER_PATH, '--emit-json'],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: {
        ...baseEnvironment,
        OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS: '1',
      },
    },
  );
  assert.equal(archivedEmit.status, 1);
  assert.match(
    archivedEmit.stderr,
    /OPENDEXTER_API_SOURCE_ROOT must be supplied/,
  );
  assert.equal(archivedEmit.stdout, '');

  const noReceiptFallback = spawnSync(
    process.execPath,
    [MATERIALIZER_PATH, '--emit-json'],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: exactPrivateReceiptChildEnvironment({
        OPENDEXTER_API_SOURCE_ROOT: '/tmp/no-api-fallback',
        OPENDEXTER_FACILITATOR_SOURCE_ROOT: '/tmp/no-facilitator-fallback',
        OPENDEXTER_API_SOURCE_RECEIPT_PATH: '/tmp/no-api-receipt',
        OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH:
          '/tmp/no-facilitator-receipt',
      }),
    },
  );
  assert.equal(noReceiptFallback.status, 1);
  assert.match(
    noReceiptFallback.stderr,
    /private source receipt file is unsafe/,
  );
  assert.doesNotMatch(noReceiptFallback.stderr, /origin is unreachable/);
});
