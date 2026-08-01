const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const SERVICE = new Set(['dexter-mcp', 'dexter-open-mcp']);
const TOOL_NAME = /^[a-z][a-z0-9_]{0,127}$/;

export const OPEN_RELEASE_COMMIT_ENV = 'DEXTER_MCP_RELEASE_COMMIT';
export const OPEN_RELEASE_TREE_ENV = 'DEXTER_MCP_RELEASE_TREE';

export function readOpenReleaseIdentity(env = process.env) {
  const commit = env?.[OPEN_RELEASE_COMMIT_ENV]?.trim() ?? '';
  const tree = env?.[OPEN_RELEASE_TREE_ENV]?.trim() ?? '';
  const artifactManifestSha256 =
    env?.DEXTER_MCP_RELEASE_MANIFEST_SHA256?.trim() ?? '';
  const descriptorSha256 = env?.DEXTER_MCP_DESCRIPTOR_SHA256?.trim() ?? '';
  const packageVersion = env?.DEXTER_MCP_RELEASE_PACKAGE_VERSION?.trim() ?? '';
  const service = env?.DEXTER_MCP_RELEASE_SERVICE?.trim() ?? '';
  if (
    !commit
    && !tree
    && !artifactManifestSha256
    && !descriptorSha256
    && !packageVersion
    && !service
  ) return null;
  if (
    !COMMIT.test(commit)
    || !COMMIT.test(tree)
    || !DIGEST.test(artifactManifestSha256)
    || !DIGEST.test(descriptorSha256)
    || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(packageVersion)
    || !SERVICE.has(service)
  ) {
    throw new TypeError('invalid_opendexter_release_identity');
  }
  return Object.freeze({
    service,
    commit,
    tree,
    artifactManifestSha256,
    descriptorSha256,
    packageVersion,
  });
}

export function readExpectedOpenReleaseRoster(env = process.env) {
  const encoded = env?.DEXTER_MCP_EXPECTED_ROSTER_JSON;
  if (typeof encoded !== 'string' || encoded.length === 0) return null;
  let roster;
  try {
    roster = JSON.parse(encoded);
  } catch {
    throw new TypeError('invalid_opendexter_release_roster');
  }
  if (
    !Array.isArray(roster)
    || roster.length === 0
    || roster.some((name) => typeof name !== 'string' || !TOOL_NAME.test(name))
    || new Set(roster).size !== roster.length
  ) {
    throw new TypeError('invalid_opendexter_release_roster');
  }
  return Object.freeze([...roster]);
}

export function requireExpectedOpenReleaseRoster(env = process.env) {
  const roster = readExpectedOpenReleaseRoster(env);
  if (!roster) throw new TypeError('opendexter_release_roster_unavailable');
  return roster;
}

export function requireOpenReleaseIdentity(env = process.env) {
  const identity = readOpenReleaseIdentity(env);
  if (!identity) throw new TypeError('opendexter_release_identity_unavailable');
  return identity;
}
