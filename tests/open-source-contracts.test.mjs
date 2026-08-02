import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  hasExactOpenDexterSourceContractsShape,
  readOpenDexterSourceContracts,
  verifyExactOpenDexterSourceContractsShape,
  verifyOpenDexterCrossRepositorySourceContracts,
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

function manifest() {
  return JSON.parse(readFileSync(
    new URL('../release/opendexter-source-contracts.json', import.meta.url),
    'utf8',
  ));
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
      const [object] = gitArgs[1].split(':');
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

test('sourceContracts/v2 has one exact immutable shape and exact local fixtures', async () => {
  const sourceContracts = manifest();
  assert.equal(hasExactOpenDexterSourceContractsShape(sourceContracts), true);
  assert.equal(
    verifyExactOpenDexterSourceContractsShape(sourceContracts),
    sourceContracts,
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
  const wrongTree = structuredClone(sourceContracts);
  wrongTree.integratedApiRelease.tree = 'f'.repeat(40);
  assert.throws(
    () => verifyExactOpenDexterSourceContractsShape(wrongTree),
    /manifest is invalid/,
  );
});

test('cross-repository source verifier accepts only the exact frozen graph', async (t) => {
  const harness = createCrossRepositoryHarness(t);
  assert.deepEqual(await verifyHarness(harness), {
    api: {
      repository: 'https://github.com/Dexter-DAO/dexter-api',
      governedContractCommit: harness.contracts.api.commit,
      integratedReleaseCommit: harness.contracts.integratedApiRelease.commit,
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
    ['API fixture drift', { fixtureDrift: 'api-integrated' }, /source bytes differ/],
    ['facilitator fixture drift', { fixtureDrift: 'facilitator' }, /source bytes differ/],
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
});
