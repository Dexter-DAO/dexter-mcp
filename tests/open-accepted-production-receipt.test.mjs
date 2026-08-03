import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createOpenDexterAcceptedProductionReceipt,
  OPENDEXTER_API_HEALTH_ENDPOINT,
  OPENDEXTER_FACILITATOR_VERSION_ENDPOINT,
  resolveOpenDexterAcceptedProduction,
  serializeOpenDexterAcceptedProductionReceipt,
  verifyOpenDexterAcceptedProductionReceipt,
} from '../lib/open-accepted-production-receipt.mjs';
import {
  deriveOpenDexterSourceContractsForAcceptedProduction,
  readOpenDexterSourceContracts,
} from '../scripts/materialize-open-tool-descriptors.mjs';
import {
  prepareOpenDexterAcceptedProduction,
} from '../scripts/prepare-open-accepted-production.mjs';

const RECEIPT_PATH = new URL(
  '../release/opendexter-accepted-production.json',
  import.meta.url,
);
const SOURCE_CONTRACTS_PATH = new URL(
  '../release/opendexter-source-contracts.json',
  import.meta.url,
);

function receipt() {
  return JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
}

function advertisements(value = receipt()) {
  return {
    api: {
      ok: true,
      service: 'dexter-api',
      release: {
        mode: 'immutable-release',
        releaseId: value.api.releaseId,
        sourceCommit: value.api.sourceCommit,
        sourceTree: value.api.sourceTree,
        toolingCommit: value.api.toolingCommit,
        artifactSha256: value.api.artifactSha256,
        metadataBindingSha256: value.api.metadataBindingSha256,
      },
    },
    facilitator: {
      commit: value.facilitator.sourceCommit,
      identitySource: 'release-provenance',
      startedAt: 'deliberately-not-receipt-evidence',
      release: {
        namespace: value.facilitator.namespace,
        sourceCommit: value.facilitator.sourceCommit,
        sourceTree: value.facilitator.sourceTree,
        sourceArchiveSha256: value.facilitator.sourceArchiveSha256,
        artifactSha256: value.facilitator.artifactSha256,
        artifactBindingDigest: value.facilitator.artifactBindingDigest,
        metadataBindingDigest: value.facilitator.metadataBindingDigest,
      },
    },
  };
}

function jsonResponse(endpoint, value, overrides = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    ok: true,
    status: 200,
    url: endpoint,
    arrayBuffer: async () => bytes,
    ...overrides,
  };
}

function exactFetch(advertisement, calls) {
  return async (endpoint, options) => {
    calls.push({ endpoint, options });
    if (endpoint === OPENDEXTER_API_HEALTH_ENDPOINT) {
      return jsonResponse(endpoint, advertisement.api);
    }
    if (endpoint === OPENDEXTER_FACILITATOR_VERSION_ENDPOINT) {
      return jsonResponse(endpoint, advertisement.facilitator);
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
}

test('accepted-production receipt is exact, deterministic, and owns live pins', async () => {
  const accepted = receipt();
  assert.equal(
    verifyOpenDexterAcceptedProductionReceipt(accepted),
    accepted,
  );
  const projected = createOpenDexterAcceptedProductionReceipt({
    apiAdvertisement: advertisements(accepted).api,
    facilitatorAdvertisement: advertisements(accepted).facilitator,
  });
  assert.deepEqual(projected, accepted);
  assert.equal(
    serializeOpenDexterAcceptedProductionReceipt(projected),
    readFileSync(RECEIPT_PATH, 'utf8'),
  );

  const sourceContracts = JSON.parse(readFileSync(
    SOURCE_CONTRACTS_PATH,
    'utf8',
  ));
  assert.equal(
    sourceContracts.integratedApiRelease.commit,
    accepted.api.sourceCommit,
  );
  assert.equal(
    sourceContracts.portfolioProjection.tree,
    accepted.api.sourceTree,
  );
  assert.equal(
    sourceContracts.facilitator.commit,
    accepted.facilitator.sourceCommit,
  );
  const originalFetch = globalThis.fetch;
  let contactedProduction = false;
  globalThis.fetch = async () => {
    contactedProduction = true;
    throw new Error('frozen verification must not fetch');
  };
  try {
    assert.deepEqual(await readOpenDexterSourceContracts(), sourceContracts);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(contactedProduction, false);
});

test('production resolver reads each fixed endpoint exactly once', async () => {
  const calls = [];
  const accepted = await resolveOpenDexterAcceptedProduction({
    fetchImpl: exactFetch(advertisements(), calls),
  });
  assert.deepEqual(accepted, receipt());
  assert.deepEqual(calls.map(({ endpoint }) => endpoint).sort(), [
    OPENDEXTER_API_HEALTH_ENDPOINT,
    OPENDEXTER_FACILITATOR_VERSION_ENDPOINT,
  ].sort());
  for (const { options } of calls) {
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.accept, 'application/json');
  }
});

test('receipt validation refuses substitution and inconsistent advertisements', async () => {
  const accepted = receipt();
  const hostileReceipt = structuredClone(accepted);
  hostileReceipt.api.sourceCommit = 'f'.repeat(40);
  assert.throws(
    () => verifyOpenDexterAcceptedProductionReceipt(hostileReceipt),
    /receipt is invalid/,
  );

  const hostileAdvertisement = advertisements(accepted);
  hostileAdvertisement.facilitator.commit = 'f'.repeat(40);
  assert.throws(
    () => createOpenDexterAcceptedProductionReceipt({
      apiAdvertisement: hostileAdvertisement.api,
      facilitatorAdvertisement: hostileAdvertisement.facilitator,
    }),
    /commit is inconsistent/,
  );

  const calls = [];
  await assert.rejects(
    resolveOpenDexterAcceptedProduction({
      fetchImpl: async (endpoint, options) => {
        calls.push({ endpoint, options });
        const value = endpoint === OPENDEXTER_API_HEALTH_ENDPOINT
          ? advertisements().api
          : advertisements().facilitator;
        return jsonResponse(endpoint, value, {
          url: `${endpoint}/redirected`,
        });
      },
    }),
    /advertisement is invalid/,
  );
  assert.equal(calls.length, 2);
});

test('one preparation writes the receipt and both generated derivatives', async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'opendexter-preparation-'));
  const releaseRoot = join(workspace, 'release');
  mkdirSync(releaseRoot);
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const acceptedPath = join(releaseRoot, 'accepted.json');
  const sourcePath = join(releaseRoot, 'source-contracts.json');
  const descriptorPath = join(releaseRoot, 'descriptor.json');
  writeFileSync(sourcePath, readFileSync(SOURCE_CONTRACTS_PATH));

  const calls = [];
  const result = await prepareOpenDexterAcceptedProduction({
    fetchImpl: exactFetch(advertisements(), calls),
    acceptedProductionPath: acceptedPath,
    sourceContractsPath: sourcePath,
    descriptorPath,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(acceptedPath)), receipt());
  const generatedContracts = JSON.parse(readFileSync(sourcePath));
  assert.deepEqual(
    generatedContracts,
    deriveOpenDexterSourceContractsForAcceptedProduction({
      sourceContracts: JSON.parse(readFileSync(SOURCE_CONTRACTS_PATH)),
      acceptedProduction: receipt(),
    }),
  );
  const descriptor = JSON.parse(readFileSync(descriptorPath));
  assert.deepEqual(descriptor.sourceContracts, generatedContracts);
  assert.deepEqual(result.paths, [acceptedPath, sourcePath, descriptorPath]);
  for (const path of result.paths) {
    assert.equal(statSync(path).mode & 0o777, 0o644);
  }
});
