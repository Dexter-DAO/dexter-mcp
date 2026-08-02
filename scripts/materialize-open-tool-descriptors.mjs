#!/usr/bin/env node

import {
  constants as fsConstants,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReviewedGitArchive,
  REVIEWED_NPM_VERSION,
  reviewedGitRemoteRefs,
  reviewedNpmInvocation,
  reviewedReleaseToolEnvironment,
} from '../lib/open-release-tooling.mjs';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';

const execFileAsync = promisify(execFile);
const CANONICAL_SOURCE_ORIGIN =
  'https://github.com/Dexter-DAO/dexter-mcp.git';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OPEN_TOOL_DESCRIPTOR_PATH = resolve(
  repositoryRoot,
  'release/open-tool-descriptors.json',
);
export const OPENDEXTER_SOURCE_CONTRACTS_PATH = resolve(
  repositoryRoot,
  'release/opendexter-source-contracts.json',
);

const SOURCE_CONTRACTS_KIND = 'opendexter-source-contracts/v3';
const DESCRIPTOR_KIND = 'opendexter-hosted-tool-descriptors/v2';
const API_REPOSITORY = 'https://github.com/Dexter-DAO/dexter-api';
const API_GIT_ORIGIN = `${API_REPOSITORY}.git`;
const FACILITATOR_REPOSITORY =
  'https://github.com/Dexter-DAO/dexter-facilitator';
const FACILITATOR_GIT_ORIGIN = `${FACILITATOR_REPOSITORY}.git`;
const MCP_REPOSITORY = 'https://github.com/Dexter-DAO/dexter-mcp';
const PRIVATE_SOURCE_RECEIPT_KIND =
  'opendexter-private-source-advertisement-receipt/v1';
const API_SOURCE_RECEIPT_PATH_ENV =
  'OPENDEXTER_API_SOURCE_RECEIPT_PATH';
const API_SOURCE_RECEIPT_SHA256_ENV =
  'OPENDEXTER_API_SOURCE_RECEIPT_SHA256';
const FACILITATOR_SOURCE_RECEIPT_PATH_ENV =
  'OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_PATH';
const FACILITATOR_SOURCE_RECEIPT_SHA256_ENV =
  'OPENDEXTER_FACILITATOR_SOURCE_RECEIPT_SHA256';
const DESCRIPTOR_SOURCE_COMMIT_ENV =
  'OPENDEXTER_DESCRIPTOR_SOURCE_COMMIT';
const DESCRIPTOR_SOURCE_TREE_ENV =
  'OPENDEXTER_DESCRIPTOR_SOURCE_TREE';
const SOURCE_CONTRACTS_RELATIVE_PATH =
  'release/opendexter-source-contracts.json';
const DESCRIPTOR_RELATIVE_PATH =
  'release/open-tool-descriptors.json';
const RECONCILE_FIXTURE_PATH =
  'tests/fixtures/governed-agent-reconcile-advanced-final-c3e32885.json';
const BINDING_FIXTURE_CONSUMER_PATH =
  'tests/fixtures/governed-agent-trade-api-facilitator-binding-v1.json';
const BINDING_FIXTURE_API_PATH =
  'tests/fixtures/governed-agent-trade-api-facilitator-binding-v1.json';
const BINDING_FIXTURE_FACILITATOR_PATH =
  'test/fixtures/governed-agent-trade-api-facilitator-binding-v1.json';
const PORTFOLIO_PROJECTION_SOURCE_PATHS = Object.freeze([
  'src/portfolio/approvedActionTargets.ts',
  'src/routes/passkeyMcpBinding.ts',
  'src/routes/defaultGovernedDelegatedAssetActions.ts',
]);
const PORTFOLIO_PROJECTION_FIXTURE_PATH =
  'tests/fixtures/opendexter-portfolio-v1-zero-holding-approved-action-targets.json';
const API_GOVERNED_CONTRACT_PATHS = Object.freeze([
  'src/portfolio/governedWrites',
  'src/routes/governedDelegatedAssetActions.ts',
  BINDING_FIXTURE_API_PATH,
]);

const EXPECTED_SOURCE_CONTRACTS = Object.freeze({
  apiCommit: 'c3e32885cc39cdee47eca5a054c0fd7d8a0fdd8b',
  apiTree: 'b8a3bdd790379f82b959663e679960f213addb5b',
  apiFixtureSha256:
    '449fc6b5a253d6856ae9f0990932dc6cefb84871c981229afb603a6314efa798',
  apiCanonicalBodyDigest:
    '48e77a936f06fe07b66fee7c2cb9126e8305d4e180c2c304513d5f0ea1636e16',
  integratedApiCommit: '6d8de2cee71fc217559fa2a2825fa2a25faf9497',
  integratedApiTree: 'a8f7a84e001bcd06f0418eb149da4e14fbafbfeb',
  portfolioProjectionFixtureSha256:
    '9c4c29b0d911b490d53a375eca1ae302501397be9c56250591bafaeb34a4e625',
  portfolioProjectionCanonicalDigest:
    'f4a3f826aa1c08531d42da402f08df709642ea75a84fd74608be75cdba2fc28a',
  facilitatorCommit: 'df370826b7b951dfc825a689c4e6f3b1928ee5e2',
  facilitatorTree: 'a9b4b18eb350143f3265834571c910891c83dd5c',
  bindingFixtureSha256:
    '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6',
  mcpCommit: '0647bbdf081733ac3ca5ba82850c2c1db79307cb',
  mcpTree: '66dfac45954b4b0983c56bf967b063fa59e72d91',
});

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function requirePath(path, label) {
  try {
    await access(path);
  } catch (error) {
    throw new Error(`${label} is absent from the archived source`, {
      cause: error,
    });
  }
}

function exactKeys(value, expected) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...expected].sort());
}

export function hasExactOpenDexterSourceContractsShape(sourceContracts) {
  const api = sourceContracts?.api;
  const integratedApiRelease = sourceContracts?.integratedApiRelease;
  const portfolioProjection = sourceContracts?.portfolioProjection;
  const projectionFixture = portfolioProjection?.fixture;
  const facilitator = sourceContracts?.facilitator;
  const bindingFixture = facilitator?.bindingFixture;
  const mcp = sourceContracts?.mcp;
  const fixture = api?.consumerFixture;
  return sourceContracts?.schemaVersion === 3
    && sourceContracts?.kind === SOURCE_CONTRACTS_KIND
    && exactKeys(sourceContracts, [
      'schemaVersion',
      'kind',
      'api',
      'integratedApiRelease',
      'portfolioProjection',
      'facilitator',
      'mcp',
    ])
    && exactKeys(api, ['repository', 'commit', 'tree', 'consumerFixture'])
    && exactKeys(fixture, [
      'path', 'sha256', 'canonicalBodyDigest',
    ])
    && exactKeys(integratedApiRelease, [
      'repository',
      'commit',
      'tree',
      'governedContractCommit',
      'governedContractTree',
    ])
    && exactKeys(portfolioProjection, [
      'repository', 'commit', 'tree', 'sourcePaths', 'fixture',
    ])
    && exactKeys(projectionFixture, [
      'consumerPath', 'apiPath', 'sha256', 'canonicalDigest',
    ])
    && exactKeys(facilitator, [
      'repository', 'commit', 'tree', 'bindingFixture',
    ])
    && exactKeys(bindingFixture, [
      'consumerPath', 'apiPath', 'facilitatorPath', 'sha256',
    ])
    && exactKeys(mcp, [
      'repository', 'commit', 'tree', 'toolContractPath', 'authContractPath',
    ])
    && api.repository === API_REPOSITORY
    && api.commit === EXPECTED_SOURCE_CONTRACTS.apiCommit
    && api.tree === EXPECTED_SOURCE_CONTRACTS.apiTree
    && fixture.sha256 === EXPECTED_SOURCE_CONTRACTS.apiFixtureSha256
    && fixture.canonicalBodyDigest
      === EXPECTED_SOURCE_CONTRACTS.apiCanonicalBodyDigest
    && integratedApiRelease.repository === API_REPOSITORY
    && integratedApiRelease.commit
      === EXPECTED_SOURCE_CONTRACTS.integratedApiCommit
    && integratedApiRelease.tree
      === EXPECTED_SOURCE_CONTRACTS.integratedApiTree
    && integratedApiRelease.governedContractCommit === api.commit
    && integratedApiRelease.governedContractTree === api.tree
    && portfolioProjection.repository === API_REPOSITORY
    && portfolioProjection.commit === integratedApiRelease.commit
    && portfolioProjection.tree === integratedApiRelease.tree
    && Array.isArray(portfolioProjection.sourcePaths)
    && JSON.stringify(portfolioProjection.sourcePaths)
      === JSON.stringify(PORTFOLIO_PROJECTION_SOURCE_PATHS)
    && projectionFixture.consumerPath === PORTFOLIO_PROJECTION_FIXTURE_PATH
    && projectionFixture.apiPath === PORTFOLIO_PROJECTION_FIXTURE_PATH
    && projectionFixture.sha256
      === EXPECTED_SOURCE_CONTRACTS.portfolioProjectionFixtureSha256
    && projectionFixture.canonicalDigest
      === EXPECTED_SOURCE_CONTRACTS.portfolioProjectionCanonicalDigest
    && facilitator.repository === FACILITATOR_REPOSITORY
    && facilitator.commit === EXPECTED_SOURCE_CONTRACTS.facilitatorCommit
    && facilitator.tree === EXPECTED_SOURCE_CONTRACTS.facilitatorTree
    && bindingFixture.consumerPath === BINDING_FIXTURE_CONSUMER_PATH
    && bindingFixture.apiPath === BINDING_FIXTURE_API_PATH
    && bindingFixture.facilitatorPath === BINDING_FIXTURE_FACILITATOR_PATH
    && bindingFixture.sha256
      === EXPECTED_SOURCE_CONTRACTS.bindingFixtureSha256
    && mcp.repository === MCP_REPOSITORY
    && mcp.commit === EXPECTED_SOURCE_CONTRACTS.mcpCommit
    && mcp.tree === EXPECTED_SOURCE_CONTRACTS.mcpTree
    && fixture.path === RECONCILE_FIXTURE_PATH
    && mcp.toolContractPath === 'lib/open-tool-contracts.mjs'
    && mcp.authContractPath === 'lib/open-tool-auth.mjs'
    && /^[0-9a-f]{40}$/.test(integratedApiRelease.commit)
    && /^[0-9a-f]{40}$/.test(integratedApiRelease.tree)
    && /^[0-9a-f]{40}$/.test(portfolioProjection.commit)
    && /^[0-9a-f]{40}$/.test(portfolioProjection.tree)
    && /^[0-9a-f]{40}$/.test(facilitator.commit)
    && /^[0-9a-f]{40}$/.test(facilitator.tree);
}

export function verifyExactOpenDexterSourceContractsShape(sourceContracts) {
  if (!hasExactOpenDexterSourceContractsShape(sourceContracts)) {
    throw new Error('OpenDexter source-contract manifest is invalid');
  }
  return sourceContracts;
}

export async function readOpenDexterSourceContracts({
  sourceRoot = repositoryRoot,
} = {}) {
  const sourceContractsPath = resolve(
    sourceRoot,
    'release/opendexter-source-contracts.json',
  );
  const sourceContracts = await readJson(sourceContractsPath);
  verifyExactOpenDexterSourceContractsShape(sourceContracts);

  const fixturePath = resolve(sourceRoot, RECONCILE_FIXTURE_PATH);
  const fixtureBytes = await readFile(fixturePath);
  const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
  let fixture;
  try {
    fixture = JSON.parse(fixtureBytes.toString('utf8'));
  } catch (error) {
    throw new Error('OpenDexter governed API consumer fixture is invalid', {
      cause: error,
    });
  }
  if (
    fixtureSha256 !== sourceContracts.api.consumerFixture.sha256
    || fixture?.sourceCommit !== sourceContracts.api.commit
    || fixture?.body?.digest
      !== sourceContracts.api.consumerFixture.canonicalBodyDigest
  ) {
    throw new Error(
      'OpenDexter governed API consumer fixture differs from its source pin',
    );
  }
  const bindingFixturePath = resolve(
    sourceRoot,
    sourceContracts.facilitator.bindingFixture.consumerPath,
  );
  const bindingFixtureBytes = await readFile(bindingFixturePath);
  if (
    createHash('sha256').update(bindingFixtureBytes).digest('hex')
      !== sourceContracts.facilitator.bindingFixture.sha256
  ) {
    throw new Error(
      'OpenDexter API-facilitator binding fixture differs from its source pin',
    );
  }
  const projectionFixturePath = resolve(
    sourceRoot,
    sourceContracts.portfolioProjection.fixture.consumerPath,
  );
  const projectionFixtureBytes = await readFile(projectionFixturePath);
  let projectionFixture;
  try {
    projectionFixture = JSON.parse(projectionFixtureBytes.toString('utf8'));
  } catch (error) {
    throw new Error('OpenDexter portfolio projection fixture is invalid', {
      cause: error,
    });
  }
  if (
    createHash('sha256').update(projectionFixtureBytes).digest('hex')
      !== sourceContracts.portfolioProjection.fixture.sha256
    || canonicalHash(projectionFixture)
      !== sourceContracts.portfolioProjection.fixture.canonicalDigest
  ) {
    throw new Error(
      'OpenDexter portfolio projection fixture differs from its source pin',
    );
  }
  await Promise.all([
    requirePath(
      resolve(sourceRoot, sourceContracts.mcp.toolContractPath),
      'OpenDexter tool contract',
    ),
    requirePath(
      resolve(sourceRoot, sourceContracts.mcp.authContractPath),
      'OpenDexter auth contract',
    ),
  ]);
  return sourceContracts;
}

function commandText(result) {
  if (typeof result?.stdout === 'string') return result.stdout;
  if (Buffer.isBuffer(result?.stdout)) return result.stdout.toString('utf8');
  return '';
}

function commandBytes(result) {
  if (Buffer.isBuffer(result?.stdout)) return result.stdout;
  if (typeof result?.stdout === 'string') return Buffer.from(result.stdout);
  return Buffer.alloc(0);
}

function remoteAdvertises(remoteRefs, commit) {
  return remoteRefs.split(/\r?\n/).some((line) => {
    const [remoteCommit, refname, extra] = line.trim().split(/\s+/);
    return remoteCommit === commit && Boolean(refname) && extra === undefined;
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isExactPrivateSourceRef(ref) {
  return typeof ref === 'string'
    && /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(ref)
    && !ref.includes('..')
    && !ref.includes('//')
    && !ref.includes('@{')
    && !ref.endsWith('/')
    && !ref.endsWith('.')
    && !ref.includes('\\');
}

function exactRemoteAdvertisements(remoteRefs) {
  const advertisements = [];
  for (const rawLine of String(remoteRefs).split(/\r?\n/)) {
    if (rawLine.length === 0) continue;
    const fields = rawLine.split(/\s+/);
    if (
      fields.length !== 2
      || !/^[0-9a-f]{40}$/.test(fields[0])
      || !isExactPrivateSourceRef(fields[1])
    ) {
      throw new Error('OpenDexter private source remote refs are invalid');
    }
    advertisements.push(Object.freeze({
      commit: fields[0],
      ref: fields[1],
    }));
  }
  advertisements.sort((left, right) => {
    const leftIdentity = `${left.commit}\0${left.ref}`;
    const rightIdentity = `${right.commit}\0${right.ref}`;
    if (leftIdentity < rightIdentity) return -1;
    if (leftIdentity > rightIdentity) return 1;
    return 0;
  });
  for (let index = 1; index < advertisements.length; index += 1) {
    if (
      advertisements[index - 1].commit === advertisements[index].commit
      && advertisements[index - 1].ref === advertisements[index].ref
    ) {
      throw new Error('OpenDexter private source remote refs are duplicated');
    }
  }
  return advertisements;
}

/**
 * Freeze only the canonical refs that advertise the exact source identities
 * needed by one private-repository proof. The receipt carries no credential;
 * its exact bytes are SHA-256 pinned into the already-scrubbed archive child.
 */
export function createOpenDexterPrivateSourceAdvertisementReceipt({
  repository,
  origin,
  descriptorSourceCommit,
  descriptorSourceTree,
  descriptorSha256,
  sourceContractsSha256,
  identities,
  remoteRefs,
} = {}) {
  const advertisements = exactRemoteAdvertisements(remoteRefs);
  const exactIdentities = identities.map(({ commit, tree }) => {
    if (!/^[0-9a-f]{40}$/.test(commit) || !/^[0-9a-f]{40}$/.test(tree)) {
      throw new Error('OpenDexter private source receipt identity is invalid');
    }
    // reviewedSourceContractRemoteRefs deliberately uses `ls-remote --refs`.
    // Only a ref whose object ID is the exact accepted commit counts. An
    // annotated tag object is not peeled here and cannot stand in for a direct
    // branch or lightweight tag advertisement.
    const refs = advertisements
      .filter((advertisement) => advertisement.commit === commit)
      .map((advertisement) => advertisement.ref);
    if (refs.length === 0) {
      throw new Error(
        `OpenDexter private source canonical origin does not advertise ${commit}`,
      );
    }
    return Object.freeze({ commit, tree, refs: Object.freeze(refs) });
  });
  const receipt = {
    schemaVersion: 1,
    kind: PRIVATE_SOURCE_RECEIPT_KIND,
    repository,
    origin,
    descriptorSource: {
      repository: MCP_REPOSITORY,
      commit: descriptorSourceCommit,
      tree: descriptorSourceTree,
      path: DESCRIPTOR_RELATIVE_PATH,
      sha256: descriptorSha256,
    },
    sourceContracts: {
      kind: SOURCE_CONTRACTS_KIND,
      path: SOURCE_CONTRACTS_RELATIVE_PATH,
      sha256: sourceContractsSha256,
    },
    identities: exactIdentities,
  };
  verifyOpenDexterPrivateSourceAdvertisementReceipt(receipt, {
    repository,
    origin,
    descriptorSourceCommit,
    descriptorSourceTree,
    descriptorSha256,
    sourceContractsSha256,
    identities,
  });
  return Object.freeze(receipt);
}

export function verifyOpenDexterPrivateSourceAdvertisementReceipt(
  receipt,
  {
    repository,
    origin,
    descriptorSourceCommit,
    descriptorSourceTree,
    descriptorSha256,
    sourceContractsSha256,
    identities,
  } = {},
) {
  if (
    !exactKeys(receipt, [
      'schemaVersion',
      'kind',
      'repository',
      'origin',
      'descriptorSource',
      'sourceContracts',
      'identities',
    ])
    || receipt.schemaVersion !== 1
    || receipt.kind !== PRIVATE_SOURCE_RECEIPT_KIND
    || receipt.repository !== repository
    || receipt.origin !== origin
    || !exactKeys(receipt.descriptorSource, [
      'repository', 'commit', 'tree', 'path', 'sha256',
    ])
    || receipt.descriptorSource.repository !== MCP_REPOSITORY
    || receipt.descriptorSource.commit !== descriptorSourceCommit
    || receipt.descriptorSource.tree !== descriptorSourceTree
    || receipt.descriptorSource.path !== DESCRIPTOR_RELATIVE_PATH
    || receipt.descriptorSource.sha256 !== descriptorSha256
    || !/^[0-9a-f]{64}$/.test(receipt.descriptorSource.sha256)
    || !exactKeys(receipt.sourceContracts, [
      'kind', 'path', 'sha256',
    ])
    || receipt.sourceContracts.kind !== SOURCE_CONTRACTS_KIND
    || receipt.sourceContracts.path !== SOURCE_CONTRACTS_RELATIVE_PATH
    || receipt.sourceContracts.sha256 !== sourceContractsSha256
    || !/^[0-9a-f]{64}$/.test(receipt.sourceContracts.sha256)
    || !Array.isArray(receipt.identities)
    || receipt.identities.length !== identities.length
  ) {
    throw new Error('OpenDexter private source receipt is invalid');
  }
  for (let index = 0; index < identities.length; index += 1) {
    const expected = identities[index];
    const actual = receipt.identities[index];
    if (
      !exactKeys(actual, ['commit', 'tree', 'refs'])
      || actual.commit !== expected.commit
      || actual.tree !== expected.tree
      || !Array.isArray(actual.refs)
      || actual.refs.length === 0
      || actual.refs.some((ref) => !isExactPrivateSourceRef(ref))
      || JSON.stringify(actual.refs)
        !== JSON.stringify([...new Set(actual.refs)].sort())
    ) {
      throw new Error('OpenDexter private source receipt is invalid');
    }
  }
  return receipt;
}

function privateSourceReceiptRemoteRefsReader(receipts) {
  const byOrigin = new Map(receipts.map((receipt) => [
    receipt.origin,
    receipt.identities.flatMap(({ commit, refs }) =>
      refs.map((ref) => `${commit}\t${ref}\n`)).join(''),
  ]));
  return async ({ remote }) => {
    if (!byOrigin.has(remote)) {
      throw new Error('OpenDexter private source receipt origin is unknown');
    }
    return byOrigin.get(remote);
  };
}

async function readPinnedPrivateSourceReceipt({
  path,
  expectedSha256,
  expected,
  openFile = open,
}) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path !== resolve(path)
    || !/^[0-9a-f]{64}$/.test(expectedSha256 ?? '')
  ) {
    throw new Error('OpenDexter private source receipt path/digest is invalid');
  }
  let handle;
  try {
    handle = await openFile(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    throw new Error('OpenDexter private source receipt file is unsafe', {
      cause: error,
    });
  }
  let bytes;
  try {
    const stat = await handle.stat();
    if (!isSafeOpenDexterPrivateSourceReceiptStat(stat)) {
      throw new Error('OpenDexter private source receipt file is unsafe');
    }
    bytes = await handle.readFile();
    if (bytes.byteLength !== stat.size || bytes.byteLength > 64 * 1024) {
      throw new Error('OpenDexter private source receipt file changed');
    }
  } finally {
    await handle.close();
  }
  if (sha256(bytes) !== expectedSha256) {
    throw new Error('OpenDexter private source receipt digest mismatch');
  }
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('OpenDexter private source receipt JSON is invalid', {
      cause: error,
    });
  }
  return verifyOpenDexterPrivateSourceAdvertisementReceipt(receipt, expected);
}

export function isSafeOpenDexterPrivateSourceReceiptStat(
  stat,
  expectedUid = typeof process.getuid === 'function' ? process.getuid() : null,
) {
  return Boolean(stat?.isFile?.())
    && stat.nlink === 1
    && (expectedUid === null || stat.uid === expectedUid)
    && (stat.mode & 0o777) === 0o600
    && stat.size > 0
    && stat.size <= 64 * 1024;
}

const PRIVATE_RECEIPT_CHILD_FORBIDDEN_ENV = Object.freeze([
  'GH_TOKEN',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_SSH_COMMAND',
  'GIT_CREDENTIAL_HELPER',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
]);
const PRIVATE_RECEIPT_CHILD_ALLOWED_ENV = Object.freeze([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_TERMINAL_PROMPT',
  'npm_config_audit',
  'npm_config_fund',
  'npm_config_ignore_scripts',
  'npm_config_userconfig',
  'npm_config_globalconfig',
  'npm_config_cache',
  'OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS',
  'OPENDEXTER_API_SOURCE_ROOT',
  'OPENDEXTER_FACILITATOR_SOURCE_ROOT',
  API_SOURCE_RECEIPT_PATH_ENV,
  API_SOURCE_RECEIPT_SHA256_ENV,
  FACILITATOR_SOURCE_RECEIPT_PATH_ENV,
  FACILITATOR_SOURCE_RECEIPT_SHA256_ENV,
  DESCRIPTOR_SOURCE_COMMIT_ENV,
  DESCRIPTOR_SOURCE_TREE_ENV,
  'SENTRY_DSN',
  'SENTRY_OPEN_MCP_DSN',
]);

export function assertOpenDexterPrivateReceiptChildEnvironment(environment) {
  const keys = Object.keys(environment ?? {}).sort();
  const expectedKeys = [...PRIVATE_RECEIPT_CHILD_ALLOWED_ENV].sort();
  const forbidden = keys.find((key) =>
    PRIVATE_RECEIPT_CHILD_FORBIDDEN_ENV.includes(key)
    || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)
    || /extraheader/i.test(key)
    || /credential.*helper/i.test(key)
    || !PRIVATE_RECEIPT_CHILD_ALLOWED_ENV.includes(key));
  if (
    forbidden
    || JSON.stringify(keys) !== JSON.stringify(expectedKeys)
    || typeof environment.PATH !== 'string'
    || environment.PATH.length === 0
    || environment.HOME !== resolve(environment.HOME ?? '')
    || environment.NODE_ENV !== 'production'
    || environment.LANG !== 'C'
    || environment.LC_ALL !== 'C'
    || environment.GIT_NO_REPLACE_OBJECTS !== '1'
    || environment?.GIT_CONFIG_GLOBAL !== '/dev/null'
    || environment?.GIT_CONFIG_NOSYSTEM !== '1'
    || environment?.GIT_TERMINAL_PROMPT !== '0'
    || environment.npm_config_audit !== 'false'
    || environment.npm_config_fund !== 'false'
    || environment.npm_config_ignore_scripts !== 'true'
    || environment.npm_config_userconfig !== '/dev/null'
    || environment.npm_config_globalconfig
      !== '/dev/null.opendexter-release-global-npmrc'
    || environment.npm_config_cache
      !== resolve(environment.npm_config_cache ?? '')
    || environment.OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS !== '1'
    || environment.OPENDEXTER_API_SOURCE_ROOT
      !== resolve(environment.OPENDEXTER_API_SOURCE_ROOT ?? '')
    || environment.OPENDEXTER_FACILITATOR_SOURCE_ROOT
      !== resolve(environment.OPENDEXTER_FACILITATOR_SOURCE_ROOT ?? '')
    || environment[API_SOURCE_RECEIPT_PATH_ENV]
      !== resolve(environment[API_SOURCE_RECEIPT_PATH_ENV] ?? '')
    || !/^[0-9a-f]{64}$/.test(
      environment[API_SOURCE_RECEIPT_SHA256_ENV] ?? '',
    )
    || environment[FACILITATOR_SOURCE_RECEIPT_PATH_ENV]
      !== resolve(environment[FACILITATOR_SOURCE_RECEIPT_PATH_ENV] ?? '')
    || !/^[0-9a-f]{64}$/.test(
      environment[FACILITATOR_SOURCE_RECEIPT_SHA256_ENV] ?? '',
    )
    || !/^[0-9a-f]{40}$/.test(environment[DESCRIPTOR_SOURCE_COMMIT_ENV] ?? '')
    || !/^[0-9a-f]{40}$/.test(environment[DESCRIPTOR_SOURCE_TREE_ENV] ?? '')
    || environment.SENTRY_DSN !== ''
    || environment.SENTRY_OPEN_MCP_DSN !== ''
  ) {
    throw new Error(
      `OpenDexter private receipt child environment is unsafe${
        forbidden ? `: ${forbidden}` : ''
      }`,
    );
  }
  return environment;
}

export async function readOpenDexterPrivateSourceAdvertisementReceipts({
  sourceRoot = repositoryRoot,
  sourceContracts,
  environment = process.env,
  openFile = open,
} = {}) {
  const descriptorSourceCommit = environment?.[DESCRIPTOR_SOURCE_COMMIT_ENV];
  const descriptorSourceTree = environment?.[DESCRIPTOR_SOURCE_TREE_ENV];
  if (
    !/^[0-9a-f]{40}$/.test(descriptorSourceCommit ?? '')
    || !/^[0-9a-f]{40}$/.test(descriptorSourceTree ?? '')
  ) {
    throw new Error('OpenDexter descriptor source receipt identity is invalid');
  }
  const contracts = sourceContracts
    ?? await readOpenDexterSourceContracts({ sourceRoot });
  const sourceContractsSha256 = sha256(await readFile(resolve(
    sourceRoot,
    SOURCE_CONTRACTS_RELATIVE_PATH,
  )));
  const descriptorSha256 = sha256(await readFile(resolve(
    sourceRoot,
    DESCRIPTOR_RELATIVE_PATH,
  )));
  const descriptorIdentity = {
    descriptorSourceCommit,
    descriptorSourceTree,
    descriptorSha256,
    sourceContractsSha256,
  };
  const [apiReceipt, facilitatorReceipt] = await Promise.all([
    readPinnedPrivateSourceReceipt({
      path: environment?.[API_SOURCE_RECEIPT_PATH_ENV],
      expectedSha256: environment?.[API_SOURCE_RECEIPT_SHA256_ENV],
      expected: {
        repository: API_REPOSITORY,
        origin: API_GIT_ORIGIN,
        ...descriptorIdentity,
        identities: [
          { commit: contracts.api.commit, tree: contracts.api.tree },
          {
            commit: contracts.integratedApiRelease.commit,
            tree: contracts.integratedApiRelease.tree,
          },
        ],
      },
      openFile,
    }),
    readPinnedPrivateSourceReceipt({
      path: environment?.[FACILITATOR_SOURCE_RECEIPT_PATH_ENV],
      expectedSha256:
        environment?.[FACILITATOR_SOURCE_RECEIPT_SHA256_ENV],
      expected: {
        repository: FACILITATOR_REPOSITORY,
        origin: FACILITATOR_GIT_ORIGIN,
        ...descriptorIdentity,
        identities: [{
          commit: contracts.facilitator.commit,
          tree: contracts.facilitator.tree,
        }],
      },
      openFile,
    }),
  ]);
  return Object.freeze({
    apiReceipt,
    facilitatorReceipt,
    remoteRefsReader: privateSourceReceiptRemoteRefsReader([
      apiReceipt,
      facilitatorReceipt,
    ]),
  });
}

function requiredExplicitSourceRoot(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be supplied explicitly`);
  }
  return resolve(value);
}

async function gitText({
  root,
  args,
  runCommand,
  environment,
}) {
  return commandText(await runCommand('git', [
    '--no-replace-objects',
    '-C', root,
    ...args,
  ], {
    encoding: 'utf8',
    env: environment,
  })).trim();
}

async function gitBlob({
  root,
  object,
  path,
  runCommand,
  environment,
}) {
  return commandBytes(await runCommand('git', [
    '--no-replace-objects',
    '-C', root,
    'show', `${object}:${path}`,
  ], {
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    env: environment,
  }));
}

async function verifySourceRepository({
  label,
  sourceRoot,
  expectedOrigin,
  identities,
  runCommand,
  environment,
  remoteEnvironment,
  remoteRefsReader,
}) {
  const [actualRoot, topLevel, origin] = await Promise.all([
    realpath(sourceRoot),
    gitText({
      root: sourceRoot,
      args: ['rev-parse', '--show-toplevel'],
      runCommand,
      environment,
    }),
    gitText({
      root: sourceRoot,
      args: ['remote', 'get-url', 'origin'],
      runCommand,
      environment,
    }),
  ]);
  if (await realpath(topLevel) !== actualRoot || origin !== expectedOrigin) {
    throw new Error(`${label} source repository is not canonical`);
  }

  let remoteRefs;
  try {
    remoteRefs = await remoteRefsReader({
      remote: expectedOrigin,
      runCommand,
      environment: remoteEnvironment,
    });
  } catch (error) {
    throw new Error(`${label} canonical origin is unreachable`, {
      cause: error,
    });
  }
  for (const { commit, tree } of identities) {
    const [actualCommit, actualTree] = await Promise.all([
      gitText({
        root: sourceRoot,
        args: ['rev-parse', `${commit}^{commit}`],
        runCommand,
        environment,
      }),
      gitText({
        root: sourceRoot,
        args: ['rev-parse', `${commit}^{tree}`],
        runCommand,
        environment,
      }),
    ]);
    if (actualCommit !== commit || actualTree !== tree) {
      throw new Error(`${label} source commit/tree identity mismatch`);
    }
    if (!remoteAdvertises(remoteRefs, commit)) {
      throw new Error(`${label} canonical origin does not advertise ${commit}`);
    }
  }
  return actualRoot;
}

/**
 * Query canonical GitHub refs without inheriting Git configuration. Private
 * canonical repositories may use the explicitly supplied release token only
 * in the outer Git/askpass process environment. The disposable helper never
 * contains the credential, and neither argv nor Git configuration carries it.
 */
export async function reviewedSourceContractRemoteRefs({
  remote,
  runCommand = execFileAsync,
  environment = process.env,
} = {}) {
  const token = environment?.GITHUB_PERSONAL_ACCESS_TOKEN
    || environment?.GH_TOKEN;
  if (!token) {
    return reviewedGitRemoteRefs({ remote, runCommand, environment });
  }
  if (
    typeof token !== 'string'
    || token.length === 0
    || token.length > 4096
    || /[\r\n\0]/.test(token)
  ) {
    throw new Error('OpenDexter private source token is invalid');
  }
  const workspace = await mkdtemp(
    resolve(tmpdir(), 'opendexter-source-contract-remote-'),
  );
  const askpassPath = resolve(workspace, 'askpass.sh');
  try {
    await writeFile(
      askpassPath,
      '#!/bin/sh\n'
        + 'set -eu\n'
        + 'case "${1:-}" in\n'
        + '  Username*) printf "%s\\n" "x-access-token" ;;\n'
        + '  Password*) printf "%s\\n" '
        + '"${OPENDEXTER_PRIVATE_GIT_TOKEN:?}" ;;\n'
        + '  *) exit 1 ;;\n'
        + 'esac\n',
      { flag: 'wx', mode: 0o700 },
    );
    const cleanEnvironment = reviewedReleaseToolEnvironment({
      env: environment,
    });
    cleanEnvironment.HOME = workspace;
    cleanEnvironment.GIT_ASKPASS = askpassPath;
    cleanEnvironment.GIT_ASKPASS_REQUIRE = 'force';
    cleanEnvironment.GIT_TERMINAL_PROMPT = '0';
    cleanEnvironment.OPENDEXTER_PRIVATE_GIT_TOKEN = token;
    return commandText(await runCommand('git', [
      '--no-replace-objects',
      '--git-dir=/dev/null',
      '-c', 'credential.helper=',
      '-c', 'core.attributesFile=/dev/null',
      'ls-remote', '--refs', remote, 'refs/heads/*', 'refs/tags/*',
    ], {
      cwd: workspace,
      encoding: 'utf8',
      env: cleanEnvironment,
      timeout: 30_000,
    }));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/**
 * Prove the exact API/facilitator sources that one hosted descriptor claims.
 * Both roots are mandatory inputs: release proof must never discover a mutable
 * sibling checkout from the caller's filesystem layout.
 */
export async function verifyOpenDexterCrossRepositorySourceContracts({
  sourceRoot = repositoryRoot,
  apiSourceRoot,
  facilitatorSourceRoot,
  sourceContracts,
  runCommand = execFileAsync,
  environment = process.env,
  remoteRefsReader = reviewedSourceContractRemoteRefs,
} = {}) {
  const explicitApiRoot = requiredExplicitSourceRoot(
    apiSourceRoot,
    'OPENDEXTER_API_SOURCE_ROOT',
  );
  const explicitFacilitatorRoot = requiredExplicitSourceRoot(
    facilitatorSourceRoot,
    'OPENDEXTER_FACILITATOR_SOURCE_ROOT',
  );
  const contracts = sourceContracts
    ?? await readOpenDexterSourceContracts({ sourceRoot });
  verifyExactOpenDexterSourceContractsShape(contracts);
  const cleanGitEnvironment = reviewedReleaseToolEnvironment({
    env: environment,
  });

  await Promise.all([
    verifySourceRepository({
      label: 'OpenDexter API',
      sourceRoot: explicitApiRoot,
      expectedOrigin: API_GIT_ORIGIN,
      identities: [
        { commit: contracts.api.commit, tree: contracts.api.tree },
        {
          commit: contracts.integratedApiRelease.commit,
          tree: contracts.integratedApiRelease.tree,
        },
      ],
      runCommand,
      environment: cleanGitEnvironment,
      remoteEnvironment: environment,
      remoteRefsReader,
    }),
    verifySourceRepository({
      label: 'OpenDexter facilitator',
      sourceRoot: explicitFacilitatorRoot,
      expectedOrigin: FACILITATOR_GIT_ORIGIN,
      identities: [{
        commit: contracts.facilitator.commit,
        tree: contracts.facilitator.tree,
      }],
      runCommand,
      environment: cleanGitEnvironment,
      remoteEnvironment: environment,
      remoteRefsReader,
    }),
  ]);

  try {
    await runCommand('git', [
      '--no-replace-objects',
      '-C', explicitApiRoot,
      'merge-base', '--is-ancestor',
      contracts.api.commit,
      contracts.integratedApiRelease.commit,
    ], { encoding: 'utf8', env: cleanGitEnvironment });
  } catch (error) {
    throw new Error(
      'OpenDexter integrated API release does not descend from its governed contract',
      { cause: error },
    );
  }

  const governedDiff = await gitText({
    root: explicitApiRoot,
    args: [
      'diff', '--no-ext-diff', '--no-textconv', '--name-only',
      contracts.api.commit,
      contracts.integratedApiRelease.commit,
      '--',
      ...API_GOVERNED_CONTRACT_PATHS,
    ],
    runCommand,
    environment: cleanGitEnvironment,
  });
  if (governedDiff.length > 0) {
    throw new Error(
      'OpenDexter integrated API release changes the frozen governed contract bytes',
    );
  }

  const fixture = contracts.facilitator.bindingFixture;
  const localFixture = await readFile(resolve(sourceRoot, fixture.consumerPath));
  const sourceFixtures = await Promise.all([
    gitBlob({
      root: explicitApiRoot,
      object: contracts.api.commit,
      path: fixture.apiPath,
      runCommand,
      environment: cleanGitEnvironment,
    }),
    gitBlob({
      root: explicitApiRoot,
      object: contracts.integratedApiRelease.commit,
      path: fixture.apiPath,
      runCommand,
      environment: cleanGitEnvironment,
    }),
    gitBlob({
      root: explicitFacilitatorRoot,
      object: contracts.facilitator.commit,
      path: fixture.facilitatorPath,
      runCommand,
      environment: cleanGitEnvironment,
    }),
  ]);
  for (const sourceFixture of sourceFixtures) {
    if (
      !sourceFixture.equals(localFixture)
      || createHash('sha256').update(sourceFixture).digest('hex')
        !== fixture.sha256
    ) {
      throw new Error(
        'OpenDexter API-facilitator binding fixture source bytes differ',
      );
    }
  }
  const projection = contracts.portfolioProjection;
  const localProjectionFixture = await readFile(
    resolve(sourceRoot, projection.fixture.consumerPath),
  );
  const [projectionSources, projectionSourceFixture] = await Promise.all([
    Promise.all(projection.sourcePaths.map((path) => gitBlob({
      root: explicitApiRoot,
      object: projection.commit,
      path,
      runCommand,
      environment: cleanGitEnvironment,
    }))),
    gitBlob({
      root: explicitApiRoot,
      object: projection.commit,
      path: projection.fixture.apiPath,
      runCommand,
      environment: cleanGitEnvironment,
    }),
  ]);
  let parsedProjectionFixture;
  try {
    parsedProjectionFixture = JSON.parse(
      projectionSourceFixture.toString('utf8'),
    );
  } catch (error) {
    throw new Error(
      'OpenDexter portfolio projection source fixture is invalid',
      { cause: error },
    );
  }
  if (
    projectionSources.some((source) => source.byteLength === 0)
    || !projectionSourceFixture.equals(localProjectionFixture)
    || createHash('sha256').update(projectionSourceFixture).digest('hex')
      !== projection.fixture.sha256
    || canonicalHash(parsedProjectionFixture)
      !== projection.fixture.canonicalDigest
  ) {
    throw new Error(
      'OpenDexter portfolio projection source bytes differ',
    );
  }
  return Object.freeze({
    api: Object.freeze({
      repository: contracts.api.repository,
      governedContractCommit: contracts.api.commit,
      integratedReleaseCommit: contracts.integratedApiRelease.commit,
    }),
    portfolioProjection: Object.freeze({
      repository: projection.repository,
      commit: projection.commit,
      fixtureSha256: projection.fixture.sha256,
      canonicalDigest: projection.fixture.canonicalDigest,
    }),
    facilitator: Object.freeze({
      repository: contracts.facilitator.repository,
      commit: contracts.facilitator.commit,
    }),
    bindingFixtureSha256: fixture.sha256,
  });
}

function exactNpmVersion(packageManager) {
  const match = String(packageManager).match(/^npm@(\d+\.\d+\.\d+)$/);
  if (!match) {
    throw new Error('archived source does not pin one exact npm version');
  }
  return match[1];
}

async function parseDescriptor(stdout) {
  const descriptor = JSON.parse(stdout);
  if (
    descriptor?.schemaVersion !== 2
    || descriptor?.kind !== DESCRIPTOR_KIND
    || descriptor?.sourceContracts?.kind !== SOURCE_CONTRACTS_KIND
    || descriptor?.oauth?.resource !== 'https://open.dexter.cash/mcp'
    || typeof descriptor?.oauth?.authorizationServer !== 'string'
    || typeof descriptor?.oauth?.authorizationServerMetadata !== 'string'
    || typeof descriptor?.oauth?.tokenIssuer !== 'string'
    || !Array.isArray(descriptor?.oauth?.protectedResourcePaths)
    || !Array.isArray(descriptor?.oauth?.scopesSupported)
    || !Array.isArray(descriptor?.oauth?.challengeRequiredParameters)
  ) {
    throw new Error('OpenDexter descriptor materializer returned invalid JSON');
  }
  return descriptor;
}

/**
 * Rebuild and execute the descriptor producer only from one committed Git
 * archive. The caller's working files and ignored node_modules are never read
 * as release evidence.
 */
export async function materializeOpenToolDescriptorsFromGit({
  sourceRoot = repositoryRoot,
  revision = 'HEAD',
  runCommand = execFileAsync,
  environment = process.env,
  verifyCrossRepositorySources = false,
  apiSourceRoot = environment?.OPENDEXTER_API_SOURCE_ROOT,
  facilitatorSourceRoot = environment?.OPENDEXTER_FACILITATOR_SOURCE_ROOT,
} = {}) {
  let explicitApiSourceRoot;
  let explicitFacilitatorSourceRoot;
  let sourceContracts;
  let sourceContractsSha256;
  let descriptorSha256;
  if (verifyCrossRepositorySources) {
    explicitApiSourceRoot = requiredExplicitSourceRoot(
      apiSourceRoot,
      'OPENDEXTER_API_SOURCE_ROOT',
    );
    explicitFacilitatorSourceRoot = requiredExplicitSourceRoot(
      facilitatorSourceRoot,
      'OPENDEXTER_FACILITATOR_SOURCE_ROOT',
    );
    sourceContracts = await readOpenDexterSourceContracts({ sourceRoot });
    sourceContractsSha256 = sha256(await readFile(resolve(
      sourceRoot,
      SOURCE_CONTRACTS_RELATIVE_PATH,
    )));
    descriptorSha256 = sha256(await readFile(resolve(
      sourceRoot,
      DESCRIPTOR_RELATIVE_PATH,
    )));
  }
  const cleanGitEnvironment = reviewedReleaseToolEnvironment({
    env: environment,
  });
  const [{ stdout: topLevelOutput }, { stdout: remoteOutput }] =
    await Promise.all([
      runCommand('git', [
        '--no-replace-objects',
        '-C', sourceRoot,
        'rev-parse', '--show-toplevel',
      ], { encoding: 'utf8', env: cleanGitEnvironment }),
      runCommand('git', [
        '--no-replace-objects',
        '-C', sourceRoot,
        'remote', 'get-url', 'origin',
      ], { encoding: 'utf8', env: cleanGitEnvironment }),
    ]);
  if (
    await realpath(topLevelOutput.trim()) !== await realpath(sourceRoot)
    || remoteOutput.trim() !== CANONICAL_SOURCE_ORIGIN
  ) {
    throw new Error('OpenDexter descriptor source repository is not canonical');
  }
  const { stdout: statusOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (statusOutput.length > 0) {
    throw new Error('OpenDexter descriptor source checkout is not clean');
  }
  const { stdout: trackedFlags } = await runCommand(
    'git',
    ['--no-replace-objects', '-C', sourceRoot, 'ls-files', '-v', '-z'],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  const hiddenPaths = trackedFlags.split('\0').filter((entry) =>
    /^[a-zS] /.test(entry));
  if (hiddenPaths.length > 0) {
    throw new Error(
      'OpenDexter descriptor source contains hidden index state '
      + '(assume-unchanged or skip-worktree)',
    );
  }
  const { stdout: replaceRefs } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'for-each-ref', '--format=%(refname)', 'refs/replace',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (replaceRefs.trim().length > 0) {
    throw new Error('OpenDexter descriptor source contains Git replace refs');
  }
  const { stdout: commitOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'rev-parse', `${revision}^{commit}`,
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  const commit = commitOutput.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('OpenDexter descriptor source commit is invalid');
  }
  const { stdout: headOutput } = await runCommand(
    'git',
    [
      '--no-replace-objects',
      '-C', sourceRoot,
      'rev-parse', 'HEAD^{commit}',
    ],
    { encoding: 'utf8', env: cleanGitEnvironment },
  );
  if (headOutput.trim() !== commit) {
    throw new Error(
      'OpenDexter descriptor revision must be the clean checkout HEAD',
    );
  }
  const { stdout: treeOutput } = await runCommand('git', [
    '--no-replace-objects',
    '-C', sourceRoot,
    'rev-parse', `${commit}^{tree}`,
  ], { encoding: 'utf8', env: cleanGitEnvironment });
  const sourceTree = treeOutput.trim();
  if (!/^[0-9a-f]{40}$/.test(sourceTree)) {
    throw new Error('OpenDexter descriptor source tree is invalid');
  }
  let remoteRefs;
  try {
    remoteRefs = await reviewedGitRemoteRefs({
      remote: CANONICAL_SOURCE_ORIGIN,
      runCommand,
      environment,
    });
  } catch (error) {
    throw new Error('OpenDexter descriptor canonical origin is unreachable', {
      cause: error,
    });
  }
  const advertised = remoteRefs.split(/\r?\n/).some((line) => {
    const [remoteCommit, refname, extra] = line.trim().split(/\s+/);
    return remoteCommit === commit && Boolean(refname) && extra === undefined;
  });
  if (!advertised) {
    throw new Error(
      'OpenDexter descriptor canonical origin does not advertise HEAD',
    );
  }

  let apiReceiptBytes;
  let facilitatorReceiptBytes;
  if (verifyCrossRepositorySources) {
    let apiRemoteRefs;
    let facilitatorRemoteRefs;
    try {
      [apiRemoteRefs, facilitatorRemoteRefs] = await Promise.all([
        reviewedSourceContractRemoteRefs({
          remote: API_GIT_ORIGIN,
          runCommand,
          environment,
        }),
        reviewedSourceContractRemoteRefs({
          remote: FACILITATOR_GIT_ORIGIN,
          runCommand,
          environment,
        }),
      ]);
    } catch (error) {
      throw new Error(
        'OpenDexter private source canonical origins are unreachable',
        { cause: error },
      );
    }
    const descriptorIdentity = {
      descriptorSourceCommit: commit,
      descriptorSourceTree: sourceTree,
      descriptorSha256,
      sourceContractsSha256,
    };
    const apiIdentities = [
      { commit: sourceContracts.api.commit, tree: sourceContracts.api.tree },
      {
        commit: sourceContracts.integratedApiRelease.commit,
        tree: sourceContracts.integratedApiRelease.tree,
      },
    ];
    const facilitatorIdentities = [{
      commit: sourceContracts.facilitator.commit,
      tree: sourceContracts.facilitator.tree,
    }];
    const apiReceipt = createOpenDexterPrivateSourceAdvertisementReceipt({
      repository: API_REPOSITORY,
      origin: API_GIT_ORIGIN,
      ...descriptorIdentity,
      identities: apiIdentities,
      remoteRefs: apiRemoteRefs,
    });
    const facilitatorReceipt =
      createOpenDexterPrivateSourceAdvertisementReceipt({
        repository: FACILITATOR_REPOSITORY,
        origin: FACILITATOR_GIT_ORIGIN,
        ...descriptorIdentity,
        identities: facilitatorIdentities,
        remoteRefs: facilitatorRemoteRefs,
      });
    await verifyOpenDexterCrossRepositorySourceContracts({
      sourceRoot,
      apiSourceRoot: explicitApiSourceRoot,
      facilitatorSourceRoot: explicitFacilitatorSourceRoot,
      sourceContracts,
      runCommand,
      environment,
      remoteRefsReader: privateSourceReceiptRemoteRefsReader([
        apiReceipt,
        facilitatorReceipt,
      ]),
    });
    apiReceiptBytes = Buffer.from(`${JSON.stringify(apiReceipt, null, 2)}\n`);
    facilitatorReceiptBytes = Buffer.from(
      `${JSON.stringify(facilitatorReceipt, null, 2)}\n`,
    );
  }

  const disposableRoot = await mkdtemp(
    resolve(tmpdir(), 'opendexter-descriptor-source-'),
  );
  const archivePath = resolve(disposableRoot, 'source.tar');
  const archiveRoot = resolve(disposableRoot, 'source');
  try {
    await mkdir(archiveRoot, { recursive: true });
    await createReviewedGitArchive({
      sourceRoot,
      commit,
      expectedTree: sourceTree,
      outputPath: archivePath,
      workspace: disposableRoot,
      runCommand,
      environment,
    });
    await runCommand('tar', ['-xf', archivePath, '-C', archiveRoot], {
      encoding: 'utf8',
      env: cleanGitEnvironment,
    });

    const archivedPackage = await readJson(resolve(archiveRoot, 'package.json'));
    const npmVersion = exactNpmVersion(archivedPackage.packageManager);
    await requirePath(
      resolve(archiveRoot, 'package-lock.json'),
      'package-lock.json',
    );
    if (npmVersion !== REVIEWED_NPM_VERSION) {
      throw new Error(
        `archived source pins npm ${npmVersion}, expected ${REVIEWED_NPM_VERSION}`,
      );
    }
    const buildHome = resolve(disposableRoot, 'build-home');
    const childHome = resolve(disposableRoot, 'child-home');
    await Promise.all([
      mkdir(buildHome, { mode: 0o700 }),
      mkdir(childHome, { mode: 0o700 }),
    ]);
    const buildEnv = reviewedReleaseToolEnvironment({
      env: environment,
      npmCache: resolve(disposableRoot, 'npm-cache'),
    });
    buildEnv.HOME = buildHome;
    const materializerEnv = reviewedReleaseToolEnvironment({
      env: environment,
      production: true,
      npmCache: resolve(disposableRoot, 'npm-cache'),
    });
    materializerEnv.HOME = childHome;
    if (verifyCrossRepositorySources) {
      const apiReceiptPath = resolve(
        disposableRoot,
        'api-source-advertisement-receipt.json',
      );
      const facilitatorReceiptPath = resolve(
        disposableRoot,
        'facilitator-source-advertisement-receipt.json',
      );
      await Promise.all([
        writeFile(apiReceiptPath, apiReceiptBytes, {
          flag: 'wx',
          mode: 0o600,
        }),
        writeFile(facilitatorReceiptPath, facilitatorReceiptBytes, {
          flag: 'wx',
          mode: 0o600,
        }),
      ]);
      materializerEnv.OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS = '1';
      materializerEnv.OPENDEXTER_API_SOURCE_ROOT = explicitApiSourceRoot;
      materializerEnv.OPENDEXTER_FACILITATOR_SOURCE_ROOT =
        explicitFacilitatorSourceRoot;
      materializerEnv[API_SOURCE_RECEIPT_PATH_ENV] = apiReceiptPath;
      materializerEnv[API_SOURCE_RECEIPT_SHA256_ENV] = sha256(apiReceiptBytes);
      materializerEnv[FACILITATOR_SOURCE_RECEIPT_PATH_ENV] =
        facilitatorReceiptPath;
      materializerEnv[FACILITATOR_SOURCE_RECEIPT_SHA256_ENV] =
        sha256(facilitatorReceiptBytes);
      materializerEnv[DESCRIPTOR_SOURCE_COMMIT_ENV] = commit;
      materializerEnv[DESCRIPTOR_SOURCE_TREE_ENV] = sourceTree;
      materializerEnv.GIT_TERMINAL_PROMPT = '0';
    }
    materializerEnv.SENTRY_DSN = '';
    materializerEnv.SENTRY_OPEN_MCP_DSN = '';
    const npmVersionCommand = reviewedNpmInvocation(['--version']);
    const { stdout: installedNpmOutput } = await runCommand(
      npmVersionCommand.command,
      npmVersionCommand.args,
      { encoding: 'utf8', env: buildEnv },
    );
    if (installedNpmOutput.trim() !== REVIEWED_NPM_VERSION) {
      throw new Error(
        `npm is ${installedNpmOutput.trim()}, expected ${REVIEWED_NPM_VERSION}`,
      );
    }

    // npm treats NODE_ENV=production as an implicit --omit=dev. The exact
    // archived development graph is required to run the reviewed workspace
    // build; only descriptor execution itself runs in production mode.
    const npmCi = reviewedNpmInvocation([
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);
    await runCommand(npmCi.command, npmCi.args, {
      cwd: archiveRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: buildEnv,
    });
    const npmBuild = reviewedNpmInvocation([
      'run', 'build:runtime-workspaces',
    ]);
    await runCommand(npmBuild.command, npmBuild.args, {
      cwd: archiveRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: buildEnv,
    });

    const homeStats = await Promise.all([
      lstat(buildHome),
      lstat(childHome),
    ]);
    for (const homeStat of homeStats) {
      if (
        !homeStat.isDirectory()
        || homeStat.isSymbolicLink()
        || homeStat.nlink < 1
        || (typeof process.getuid === 'function'
          && homeStat.uid !== process.getuid())
        || (homeStat.mode & 0o777) !== 0o700
      ) {
        throw new Error('OpenDexter descriptor release HOME is unsafe');
      }
    }
    if (verifyCrossRepositorySources) {
      assertOpenDexterPrivateReceiptChildEnvironment(materializerEnv);
    }

    const archivedMaterializer = resolve(
      archiveRoot,
      'scripts/materialize-open-tool-descriptors.mjs',
    );
    await requirePath(archivedMaterializer, 'descriptor materializer');
    const { stdout } = await runCommand(
      npmVersionCommand.nodeExecutable,
      [archivedMaterializer, '--emit-json'],
      {
        cwd: archiveRoot,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        env: materializerEnv,
      },
    );
    return await parseDescriptor(stdout);
  } finally {
    await rm(disposableRoot, { recursive: true, force: true });
  }
}

/**
 * Return the exact release descriptor produced by the finalized hosted server
 * registrations. This is the fixed interface consumed by the OpenDexter IDE
 * package verifier; callers must not reconstruct or supplement its schemas.
 */
export async function materializeOpenToolDescriptors(options = {}) {
  return materializeOpenToolDescriptorsFromGit(options);
}

/**
 * Project the finalized registrations already loaded from this source tree.
 * This starts no listener or reaper and is suitable for ordinary schema tests;
 * release write/check still go through the strict committed-archive function.
 */
export async function materializeOpenToolDescriptorsFromRegistrations() {
  const [
    { buildHostedOpenToolDescriptor },
    { createOpenMcpServer },
    {
      OPEN_MCP_AUTHORIZATION_SERVER,
      OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
      OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS,
      OPEN_MCP_PRM,
      OPEN_MCP_PRM_URL,
      OPEN_MCP_PROTECTED_RESOURCE_PATHS,
      OPEN_MCP_TOKEN_ISSUER,
    },
    sourceContracts,
  ] = await Promise.all([
    import('../lib/open-tool-contracts.mjs'),
    import('../open-mcp-server.mjs'),
    import('../lib/open-tool-auth.mjs'),
    readOpenDexterSourceContracts(),
  ]);
  const server = createOpenMcpServer({ includeResources: false });
  const {
    schemaVersion: _schemaVersion,
    kind: _kind,
    ...hostedTools
  } = buildHostedOpenToolDescriptor(server);
  return {
    schemaVersion: 2,
    kind: DESCRIPTOR_KIND,
    sourceContracts,
    oauth: {
      mode: 'mixed',
      resource: OPEN_MCP_PRM.resource,
      protectedResourceMetadata: OPEN_MCP_PRM_URL,
      protectedResourcePaths: [...OPEN_MCP_PROTECTED_RESOURCE_PATHS],
      authorizationServer: OPEN_MCP_AUTHORIZATION_SERVER,
      authorizationServerMetadata: OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
      tokenIssuer: OPEN_MCP_TOKEN_ISSUER,
      scopesSupported: [...OPEN_MCP_PRM.scopes_supported],
      challengeRequiredParameters: [
        ...OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS,
      ],
    },
    ...hostedTools,
  };
}

export function serializeOpenToolDescriptors(descriptor) {
  return `${JSON.stringify(descriptor, null, 2)}\n`;
}

export async function verifyOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  let actual;
  try {
    actual = readFileSync(descriptorPath, 'utf8');
  } catch (error) {
    throw new Error(
      `OpenDexter tool descriptor is missing at ${descriptorPath}`,
      { cause: error },
    );
  }
  if (actual !== expected) {
    throw new Error(
      'OpenDexter tool descriptor differs from the finalized hosted tools; '
      + 'run npm run generate:open-tool-descriptors and review the exact diff',
    );
  }
  return descriptorPath;
}

export async function writeOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  mkdirSync(dirname(descriptorPath), { recursive: true });
  writeFileSync(descriptorPath, expected);
  return descriptorPath;
}

function cliMode(argv) {
  const modes = argv.filter((arg) => arg === '--check' || arg === '--write');
  if (modes.length > 1 || argv.some((arg) => !modes.includes(arg))) {
    throw new Error(
      'usage: node scripts/materialize-open-tool-descriptors.mjs [--check|--write]',
    );
  }
  return modes[0] ?? '--check';
}

async function emitDescriptorJson() {
  if (process.env.OPENDEXTER_VERIFY_CROSS_REPO_SOURCE_CONTRACTS === '1') {
    const apiSourceRoot = requiredExplicitSourceRoot(
      process.env.OPENDEXTER_API_SOURCE_ROOT,
      'OPENDEXTER_API_SOURCE_ROOT',
    );
    const facilitatorSourceRoot = requiredExplicitSourceRoot(
      process.env.OPENDEXTER_FACILITATOR_SOURCE_ROOT,
      'OPENDEXTER_FACILITATOR_SOURCE_ROOT',
    );
    assertOpenDexterPrivateReceiptChildEnvironment(process.env);
    const sourceContracts = await readOpenDexterSourceContracts();
    const receipts =
      await readOpenDexterPrivateSourceAdvertisementReceipts({
        sourceContracts,
      });
    await verifyOpenDexterCrossRepositorySourceContracts({
      apiSourceRoot,
      facilitatorSourceRoot,
      sourceContracts,
      remoteRefsReader: receipts.remoteRefsReader,
    });
  }
  process.stdout.write(JSON.stringify(
    await materializeOpenToolDescriptorsFromRegistrations(),
  ));
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    if (process.argv[2] === '--emit-json' && process.argv.length === 3) {
      await emitDescriptorJson();
    } else {
      const mode = cliMode(process.argv.slice(2));
      const descriptor = await materializeOpenToolDescriptorsFromGit({
        verifyCrossRepositorySources: true,
        apiSourceRoot: process.env.OPENDEXTER_API_SOURCE_ROOT,
        facilitatorSourceRoot:
          process.env.OPENDEXTER_FACILITATOR_SOURCE_ROOT,
      });
      const descriptorPath = mode === '--write'
        ? await writeOpenToolDescriptor({ descriptor })
        : await verifyOpenToolDescriptor({ descriptor });
      process.stdout.write(
        `${mode === '--write' ? 'Wrote' : 'Verified'} ${descriptorPath}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
