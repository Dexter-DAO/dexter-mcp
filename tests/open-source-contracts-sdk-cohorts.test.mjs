import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  createOpenDexterAcceptedProductionReceipt,
} from '../lib/open-accepted-production-receipt.mjs';
import {
  deriveOpenDexterSourceContractsForAcceptedProduction,
  hasExactOpenDexterSourceContractsShape,
  verifyOpenDexterBindingFixtureSources,
} from '../scripts/materialize-open-tool-descriptors.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API_COMMIT = '64dc058fdc9b6929fd34d0eb48a39ef5edb87ec3';
const API_TREE = '1ab982e4f8b32ce6a7318ac960c064f0521afc5f';
const FACILITATOR_COMMIT = '8d351859ff465a0c051da90e0e59f5f5e812acc7';
const HISTORICAL_API = 'fa0701b67625911b8ec97a5399f62ec97a69f976';
const HISTORICAL_PATH = 'tests/fixtures/governed-agent-trade-api-facilitator-binding-v1.json';
const CURRENT_PATH = 'tests/fixtures/governed-agent-trade-api-facilitator-binding-vault-0434.json';
const historical = readFileSync(join(ROOT, HISTORICAL_PATH));
const current = readFileSync(join(ROOT, CURRENT_PATH));

// These synthetic advertisements exercise preparation only. They are never
// written to release/ or used as production acceptance evidence.
function testOnlyReceipt() {
  return createOpenDexterAcceptedProductionReceipt({
    apiAdvertisement: {
      ok: true, service: 'dexter-api',
      release: {
        mode: 'immutable-release',
        releaseId: `${API_COMMIT.slice(0, 12)}-${'a'.repeat(16)}-12345678`,
        sourceCommit: API_COMMIT, sourceTree: API_TREE, toolingCommit: API_COMMIT,
        artifactSha256: 'a'.repeat(64), metadataBindingSha256: 'b'.repeat(64),
      },
    },
    facilitatorAdvertisement: {
      commit: FACILITATOR_COMMIT, identitySource: 'release-provenance',
      release: {
        namespace: 'dexter-facilitator-immutable-release/v1',
        sourceCommit: FACILITATOR_COMMIT,
        sourceTree: '22236cb2da1eed6df4a1b529da6e1944fef41b68',
        sourceArchiveSha256: 'c'.repeat(64), artifactSha256: 'd'.repeat(64),
        artifactBindingDigest: 'e'.repeat(64), metadataBindingDigest: 'f'.repeat(64),
      },
    },
  });
}

function verifyFixtureSources(overrides = {}) {
  return verifyOpenDexterBindingFixtureSources({
    sourceRoot: ROOT, apiSourceRoot: '/test-only/api',
    facilitatorSourceRoot: '/test-only/facilitator',
    integratedApiCommit: API_COMMIT, facilitatorCommit: FACILITATOR_COMMIT,
    environment: {},
    runCommand: async (command, args) => {
      assert.equal(command, 'git');
      assert.deepEqual(args.slice(0, 2), ['--no-replace-objects', '-C']);
      const [commit] = args[4].split(':');
      const key = commit === HISTORICAL_API ? 'historical'
        : commit === API_COMMIT ? 'api' : 'facilitator';
      return { stdout: overrides[key] ?? (key === 'historical' ? historical : current) };
    },
    ...(overrides.sourceRoot ? { sourceRoot: overrides.sourceRoot } : {}),
  });
}

test('reviewed SDK source policy preserves history and derives current producer pins', () => {
  const policy = JSON.parse(readFileSync(join(ROOT, 'release/opendexter-source-contracts.json')));
  const before = structuredClone(policy);
  const receipt = testOnlyReceipt();
  const derived = deriveOpenDexterSourceContractsForAcceptedProduction({
    sourceContracts: policy, acceptedProduction: receipt,
  });
  assert.deepEqual(policy, before);
  assert.deepEqual(derived.api, before.api);
  assert.equal(derived.integratedApiRelease.governedContractCommit, API_COMMIT);
  assert.equal(derived.integratedApiRelease.governedContractTree, API_TREE);
  assert.equal(derived.facilitator.bindingFixture.consumerPath, CURRENT_PATH);
  assert.equal(derived.facilitator.bindingFixture.sha256,
    '54b23f1650bf0b65861f4c7dbe9594cd1a4ea752915819792d7ae8d14d362848');
  assert.equal(hasExactOpenDexterSourceContractsShape(derived, receipt), true);
  for (const mutate of [
    value => {
      value.integratedApiRelease.governedContractCommit = 'b9a278ab13e9baa91cca210bdc237c942045097b';
      value.integratedApiRelease.governedContractTree = 'c8139f896ce7f0e776f3da5443cb0d4d858629f0';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '33ffd350e3ceb6ac6cd36ec48ebcf1552a4872dd';
      value.integratedApiRelease.governedContractTree = '557ff0e749ab41157b01cb18fd6f6593fb8689a1';
    },
    value => { value.integratedApiRelease.governedContractCommit = '3563384462e4d7d063a50942c88d589afe20aeae'; },
    value => { value.integratedApiRelease.governedContractTree = 'f5f34b460fa3c476b61e42578cf714e58e109673'; },
    value => { value.facilitator.bindingFixture.consumerPath = HISTORICAL_PATH; },
    value => { value.facilitator.bindingFixture.sha256 = '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6'; },
    value => { value.api.consumerFixture.canonicalBodyDigest = '1'.repeat(64); },
  ]) {
    const changed = structuredClone(derived);
    mutate(changed);
    assert.equal(hasExactOpenDexterSourceContractsShape(changed, receipt), false);
  }
});

test('historical fixture and both current producers verify against their own exact bytes', async () => {
  assert.notDeepEqual(historical, current);
  const historicalBody = JSON.parse(historical);
  const currentBody = JSON.parse(current);
  assert.notEqual(historicalBody.requestDigest, currentBody.requestDigest);
  delete historicalBody.requestDigest;
  delete currentBody.requestDigest;
  assert.deepEqual(historicalBody, currentBody);
  assert.deepEqual(await verifyFixtureSources(), {
    historicalSha256: '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6',
    currentSha256: '54b23f1650bf0b65861f4c7dbe9594cd1a4ea752915819792d7ae8d14d362848',
  });
});

test('fixture source verification rejects stale, mixed, rewritten, and altered producers', async t => {
  for (const [name, overrides] of [
    ['old API with current facilitator', { api: historical }],
    ['old facilitator with current API', { facilitator: historical }],
    ['both current producers stale', { api: historical, facilitator: historical }],
    ['historical evidence rewritten', { historical: current }],
    ['altered API bytes', { api: Buffer.concat([current, Buffer.from(' ')]) }],
    ['altered facilitator bytes', { facilitator: Buffer.concat([current, Buffer.from(' ')]) }],
  ]) {
    await t.test(name, () => assert.rejects(verifyFixtureSources(overrides), /source bytes differ/));
  }
});

test('fixture source verification refuses altered local historical or current pins', async t => {
  for (const path of [HISTORICAL_PATH, CURRENT_PATH]) {
    await t.test(path, async child => {
      const root = mkdtempSync(join(tmpdir(), 'opendexter-fixture-cohorts-'));
      child.after(() => rmSync(root, { recursive: true, force: true }));
      mkdirSync(join(root, 'tests/fixtures'), { recursive: true });
      writeFileSync(join(root, HISTORICAL_PATH), historical);
      writeFileSync(join(root, CURRENT_PATH), current);
      writeFileSync(join(root, path), Buffer.from('altered'));
      await assert.rejects(verifyFixtureSources({ sourceRoot: root }), /source pin/);
    });
  }
});
