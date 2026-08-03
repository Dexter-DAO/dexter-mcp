import { chmod, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const OPENDEXTER_ACCEPTED_PRODUCTION_KIND =
  'opendexter-accepted-production-receipt/v1';
export const OPENDEXTER_API_HEALTH_ENDPOINT =
  'https://api.dexter.cash/health';
export const OPENDEXTER_FACILITATOR_VERSION_ENDPOINT =
  'https://x402.dexter.cash/version';
export const OPENDEXTER_API_REPOSITORY =
  'https://github.com/Dexter-DAO/dexter-api';
export const OPENDEXTER_FACILITATOR_REPOSITORY =
  'https://github.com/Dexter-DAO/dexter-facilitator';

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const MAX_ADVERTISEMENT_BYTES = 64 * 1024;

function exactKeys(value, expected) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...expected].sort());
}

function requireHex(value, expression, label) {
  if (typeof value !== 'string' || !expression.test(value)) {
    throw new Error(`OpenDexter accepted production ${label} is invalid`);
  }
  return value;
}

function projectApiAdvertisement(advertisement) {
  const release = advertisement?.release;
  if (
    advertisement?.ok !== true
    || advertisement?.service !== 'dexter-api'
    || release?.mode !== 'immutable-release'
  ) {
    throw new Error('OpenDexter accepted production API advertisement is invalid');
  }
  const sourceCommit = requireHex(
    release.sourceCommit,
    HEX_40,
    'API source commit',
  );
  const sourceTree = requireHex(
    release.sourceTree,
    HEX_40,
    'API source tree',
  );
  const toolingCommit = requireHex(
    release.toolingCommit,
    HEX_40,
    'API tooling commit',
  );
  const artifactSha256 = requireHex(
    release.artifactSha256,
    HEX_64,
    'API artifact digest',
  );
  const metadataBindingSha256 = requireHex(
    release.metadataBindingSha256,
    HEX_64,
    'API metadata binding digest',
  );
  if (
    typeof release.releaseId !== 'string'
    || !release.releaseId.startsWith(
      `${sourceCommit.slice(0, 12)}-${artifactSha256.slice(0, 16)}-`,
    )
    || !/^[0-9a-f-]+$/.test(release.releaseId)
  ) {
    throw new Error('OpenDexter accepted production API release ID is invalid');
  }
  return Object.freeze({
    endpoint: OPENDEXTER_API_HEALTH_ENDPOINT,
    repository: OPENDEXTER_API_REPOSITORY,
    releaseId: release.releaseId,
    sourceCommit,
    sourceTree,
    toolingCommit,
    artifactSha256,
    metadataBindingSha256,
  });
}

function projectFacilitatorAdvertisement(advertisement) {
  const release = advertisement?.release;
  if (
    advertisement?.identitySource !== 'release-provenance'
    || release?.namespace !== 'dexter-facilitator-immutable-release/v1'
  ) {
    throw new Error(
      'OpenDexter accepted production facilitator advertisement is invalid',
    );
  }
  const sourceCommit = requireHex(
    release.sourceCommit,
    HEX_40,
    'facilitator source commit',
  );
  if (advertisement.commit !== sourceCommit) {
    throw new Error(
      'OpenDexter accepted production facilitator commit is inconsistent',
    );
  }
  return Object.freeze({
    endpoint: OPENDEXTER_FACILITATOR_VERSION_ENDPOINT,
    repository: OPENDEXTER_FACILITATOR_REPOSITORY,
    namespace: release.namespace,
    sourceCommit,
    sourceTree: requireHex(
      release.sourceTree,
      HEX_40,
      'facilitator source tree',
    ),
    sourceArchiveSha256: requireHex(
      release.sourceArchiveSha256,
      HEX_64,
      'facilitator source archive digest',
    ),
    artifactSha256: requireHex(
      release.artifactSha256,
      HEX_64,
      'facilitator artifact digest',
    ),
    artifactBindingDigest: requireHex(
      release.artifactBindingDigest,
      HEX_64,
      'facilitator artifact binding digest',
    ),
    metadataBindingDigest: requireHex(
      release.metadataBindingDigest,
      HEX_64,
      'facilitator metadata binding digest',
    ),
  });
}

export function createOpenDexterAcceptedProductionReceipt({
  apiAdvertisement,
  facilitatorAdvertisement,
} = {}) {
  const receipt = {
    schemaVersion: 1,
    kind: OPENDEXTER_ACCEPTED_PRODUCTION_KIND,
    api: projectApiAdvertisement(apiAdvertisement),
    facilitator: projectFacilitatorAdvertisement(facilitatorAdvertisement),
  };
  return Object.freeze(verifyOpenDexterAcceptedProductionReceipt(receipt));
}

export function verifyOpenDexterAcceptedProductionReceipt(receipt) {
  if (
    !exactKeys(receipt, ['schemaVersion', 'kind', 'api', 'facilitator'])
    || receipt.schemaVersion !== 1
    || receipt.kind !== OPENDEXTER_ACCEPTED_PRODUCTION_KIND
    || !exactKeys(receipt.api, [
      'endpoint',
      'repository',
      'releaseId',
      'sourceCommit',
      'sourceTree',
      'toolingCommit',
      'artifactSha256',
      'metadataBindingSha256',
    ])
    || receipt.api.endpoint !== OPENDEXTER_API_HEALTH_ENDPOINT
    || receipt.api.repository !== OPENDEXTER_API_REPOSITORY
    || !HEX_40.test(receipt.api.sourceCommit ?? '')
    || !HEX_40.test(receipt.api.sourceTree ?? '')
    || !HEX_40.test(receipt.api.toolingCommit ?? '')
    || !HEX_64.test(receipt.api.artifactSha256 ?? '')
    || !HEX_64.test(receipt.api.metadataBindingSha256 ?? '')
    || typeof receipt.api.releaseId !== 'string'
    || !receipt.api.releaseId.startsWith(
      `${receipt.api.sourceCommit.slice(0, 12)}-`
        + `${receipt.api.artifactSha256.slice(0, 16)}-`,
    )
    || !/^[0-9a-f-]+$/.test(receipt.api.releaseId)
    || !exactKeys(receipt.facilitator, [
      'endpoint',
      'repository',
      'namespace',
      'sourceCommit',
      'sourceTree',
      'sourceArchiveSha256',
      'artifactSha256',
      'artifactBindingDigest',
      'metadataBindingDigest',
    ])
    || receipt.facilitator.endpoint
      !== OPENDEXTER_FACILITATOR_VERSION_ENDPOINT
    || receipt.facilitator.repository
      !== OPENDEXTER_FACILITATOR_REPOSITORY
    || receipt.facilitator.namespace
      !== 'dexter-facilitator-immutable-release/v1'
    || !HEX_40.test(receipt.facilitator.sourceCommit ?? '')
    || !HEX_40.test(receipt.facilitator.sourceTree ?? '')
    || !HEX_64.test(receipt.facilitator.sourceArchiveSha256 ?? '')
    || !HEX_64.test(receipt.facilitator.artifactSha256 ?? '')
    || !HEX_64.test(receipt.facilitator.artifactBindingDigest ?? '')
    || !HEX_64.test(receipt.facilitator.metadataBindingDigest ?? '')
  ) {
    throw new Error('OpenDexter accepted production receipt is invalid');
  }
  return receipt;
}

async function fetchJsonAdvertisement({ endpoint, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`OpenDexter production advertisement is unreachable: ${endpoint}`, {
      cause: error,
    });
  }
  if (
    response?.ok !== true
    || response.status !== 200
    || (typeof response.url === 'string'
      && response.url.length > 0
      && response.url !== endpoint)
  ) {
    throw new Error(`OpenDexter production advertisement is invalid: ${endpoint}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ADVERTISEMENT_BYTES) {
    throw new Error(`OpenDexter production advertisement is oversized: ${endpoint}`);
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`OpenDexter production advertisement is not JSON: ${endpoint}`, {
      cause: error,
    });
  }
}

/**
 * Resolve each mutable production advertisement exactly once. The returned
 * receipt contains only stable immutable-release identities, so retrying the
 * preparation against the same accepted releases produces identical bytes.
 */
export async function resolveOpenDexterAcceptedProduction({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('OpenDexter accepted production fetch implementation is absent');
  }
  const [apiAdvertisement, facilitatorAdvertisement] = await Promise.all([
    fetchJsonAdvertisement({
      endpoint: OPENDEXTER_API_HEALTH_ENDPOINT,
      fetchImpl,
    }),
    fetchJsonAdvertisement({
      endpoint: OPENDEXTER_FACILITATOR_VERSION_ENDPOINT,
      fetchImpl,
    }),
  ]);
  return createOpenDexterAcceptedProductionReceipt({
    apiAdvertisement,
    facilitatorAdvertisement,
  });
}

export function serializeOpenDexterAcceptedProductionReceipt(receipt) {
  verifyOpenDexterAcceptedProductionReceipt(receipt);
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export async function writeFileAtomically(path, bytes) {
  const target = resolve(path);
  const temporary = resolve(
    dirname(target),
    `.${target.split('/').at(-1)}.${process.pid}.`
      + `${randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o644 });
    await chmod(temporary, 0o644);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return target;
}
