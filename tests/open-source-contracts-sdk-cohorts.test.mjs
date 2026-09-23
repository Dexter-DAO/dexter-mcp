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
const API_COMMIT = '922f29405956e768b3fc7c42d7e44e0af1ca48cd';
const API_TREE = '980b6dc4106b55c93c91dc2acaf61adac588bc04';
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
      value.integratedApiRelease.governedContractCommit = 'ae00d1d27077c6a6fa0626f25656da302cd1f16a';
      value.integratedApiRelease.governedContractTree = '20e922af82fbac900bfbdd263264068c600d8f63';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '372dacdebce2ddbd9d8531d05aab85f602ea6bf5';
      value.integratedApiRelease.governedContractTree = 'b2ea9b6393d6b63801a8abcfd160fcdc4beb81c9';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '4577cf153bfc5572b941f3eca6f3c78601988ca2';
      value.integratedApiRelease.governedContractTree = '9acc9189a9203cc8f8e1c8b987cd893e1174ceda';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '950477b669d46b29641b173a922ede567b92c035';
      value.integratedApiRelease.governedContractTree = '03151880e7111bda9d8d5b9f60f498b86fa524ba';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '8f3e2134e11b6c5995351dda55af64da00501992';
      value.integratedApiRelease.governedContractTree = 'a66c3365469eb1e40738ab1bb371ce37cbb5958f';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '9cce040c55c0e4072c29ba7270ab2db22445fbe0';
      value.integratedApiRelease.governedContractTree = 'f318e6ad2dec4a0351cd5b44dd0668f863da423d';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = 'ddf10a86d3bd0956c5a868c341a929914c14bac4';
      value.integratedApiRelease.governedContractTree = '8476dcc0063fe32a0b96b81ed4f3dabbaa990f86';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '9a20fee4e1c283bd5ae85565ab65e422d1083fd1';
      value.integratedApiRelease.governedContractTree = '6aae2094dbdb34f58b3727521336c5bf0e30aaac';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '8c3f3269f478a89b0e09b73a373cdefd2581e4a1';
      value.integratedApiRelease.governedContractTree = '5b1187a121632b1386389cd70fe60be718de2461';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '481d5edce8c58d26abc06f6c9a5b74506773590c';
      value.integratedApiRelease.governedContractTree = 'ef40206f53c1c470450162128c1cf1b27f916d82';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '868982e31ea06f98d3b6b68ced44b74fe42c00b7';
      value.integratedApiRelease.governedContractTree = '438748027a773ea2f93ff0dd5806ee28d173eb0d';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = 'c3df1b23ee35a5909e3205540e9b115c3f0a7758';
      value.integratedApiRelease.governedContractTree = '47b5accb822bc19707ee5c8337cc092ac4a988ba';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '4734900a0bd3f3a84a89517fe7a2895525e4e407';
      value.integratedApiRelease.governedContractTree = '69200f88041215593e99f9b6462d18063588fa90';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = 'fc2bc22a821939b3da92372d2cd309e00773c207';
      value.integratedApiRelease.governedContractTree = '1ff7a7332103c083e87d1b6486bd551586fd482b';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = 'd6b81113c5a8a8fb5765e70cb6094b2ed7fed32e';
      value.integratedApiRelease.governedContractTree = '81cd281ee505fbba200763b6c2100310bd4d5e78';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '9465de318ca68b93306fdc5893e7d48354f51ff9';
      value.integratedApiRelease.governedContractTree = '4c847919908947bc61bf753afabfc36168a6b7b5';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '61cc13057c19d3cfa3fbedc64e15082334ae429c';
      value.integratedApiRelease.governedContractTree = '9ee214a14c7cd86427457a503610d0dd9badbfbd';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '66b536d2e367dbc4d0a0d1707e8a1154b0fd3f9f';
      value.integratedApiRelease.governedContractTree = '7ef7bd262c535f5cf2334ccb26c64e321d35788c';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '21f365b0fd33302b1b03ea6bb9f5c4ecd1241159';
      value.integratedApiRelease.governedContractTree = '7df84a14bd9e9f5bd99fc6e7711ee516f4d3fbf3';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = 'e564d6000429f49868ebcb020075e3492080e415';
      value.integratedApiRelease.governedContractTree = '48e0a21b7acbc748902c426873fa9167c7d3cdb8';
    },
    value => {
      value.integratedApiRelease.governedContractCommit = '64dc058fdc9b6929fd34d0eb48a39ef5edb87ec3';
      value.integratedApiRelease.governedContractTree = '1ab982e4f8b32ce6a7318ac960c064f0521afc5f';
    },
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
