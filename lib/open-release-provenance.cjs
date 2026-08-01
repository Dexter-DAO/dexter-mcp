const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,127}$/;
const SERVICE_NAMES = ['dexter-mcp', 'dexter-open-mcp'];
const ENTRYPOINTS = {
  'dexter-mcp': 'production-bootstrap.mjs',
  'dexter-open-mcp': 'production-bootstrap.mjs',
};
const APPLICATION_ENTRYPOINTS = {
  'dexter-mcp': 'http-server-oauth.mjs',
  'dexter-open-mcp': 'open-mcp-server.mjs',
};

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function ownedRegularFile(file, { writable = false } = {}) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink !== 1
    || stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0
    || (!writable && (stat.mode & 0o200) !== 0)
  ) {
    throw new Error(`release file is not sealed: ${file}`);
  }
  return stat;
}

function exactRoster(value, label) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((name) => typeof name !== 'string' || !TOOL_NAME.test(name))
    || new Set(value).size !== value.length
  ) {
    throw new Error(`invalid ${label} release roster`);
  }
  return [...value];
}

function exactKeys(value, expected, label) {
  const actual = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`invalid ${label} fields`);
  }
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function safeReleasePath(releaseDir, relative) {
  if (
    typeof relative !== 'string'
    || relative.length === 0
    || relative.includes('\0')
    || path.isAbsolute(relative)
  ) {
    throw new Error('invalid release manifest path');
  }
  const resolved = path.resolve(releaseDir, relative);
  if (resolved === releaseDir || !pathIsWithin(releaseDir, resolved)) {
    throw new Error('release manifest path escapes candidate');
  }
  return resolved;
}

function manifestedTargetIsCovered(releaseDir, absolute, entries) {
  const relative = path.relative(releaseDir, absolute);
  const stat = fs.lstatSync(absolute);
  if (stat.isFile() || stat.isSymbolicLink()) {
    return entries.has(relative);
  }
  if (stat.isDirectory()) {
    const prefix = relative === '' ? '' : `${relative}${path.sep}`;
    return [...entries.keys()].some((entry) => (
      entry !== relative && entry.startsWith(prefix)
    ));
  }
  return false;
}

function verifyManifestedSymlink(releaseDir, record, entries) {
  const { absolute, identity, relative } = record;
  if (
    identity.length === 0
    || identity.includes('\0')
    || path.isAbsolute(identity)
  ) {
    throw new Error(`release symlink target must be relative: ${relative}`);
  }
  const lexicalTarget = path.resolve(path.dirname(absolute), identity);
  if (!pathIsWithin(releaseDir, lexicalTarget)) {
    throw new Error(`release symlink target escapes candidate: ${relative}`);
  }
  let resolvedTarget;
  try {
    resolvedTarget = fs.realpathSync(absolute);
  } catch {
    throw new Error(`release symlink target is missing: ${relative}`);
  }
  if (!pathIsWithin(releaseDir, resolvedTarget)) {
    throw new Error(`release symlink target resolves outside candidate: ${relative}`);
  }
  if (
    !manifestedTargetIsCovered(releaseDir, lexicalTarget, entries)
    || !manifestedTargetIsCovered(releaseDir, resolvedTarget, entries)
  ) {
    throw new Error(`release symlink target is not covered by manifest: ${relative}`);
  }
}

function walkRelease(root, directory = root, entries = []) {
  const directoryStat = fs.lstatSync(directory);
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || directoryStat.uid !== process.getuid()
    || (directoryStat.mode & 0o222) !== 0
  ) {
    throw new Error(`release directory is not sealed: ${directory}`);
  }
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    const relative = path.relative(root, absolute);
    if (item.isDirectory()) {
      walkRelease(root, absolute, entries);
    } else if (item.isFile() || item.isSymbolicLink()) {
      entries.push(relative);
    } else {
      throw new Error(`unsupported release filesystem entry: ${relative}`);
    }
  }
  return entries;
}

function verifyReleaseFileManifestIdentity(releaseDir) {
  const manifestPath = `${releaseDir}.FILE-MANIFEST.tsv`;
  ownedRegularFile(manifestPath);
  const bytes = fs.readFileSync(manifestPath);
  const artifactManifestSha256 = sha256(bytes);
  const listed = new Map();
  const symlinks = [];
  for (const line of bytes.toString('utf8').split('\n')) {
    if (!line) continue;
    const fields = line.split('\t');
    if (fields.length !== 3 || !['F', 'L'].includes(fields[0])) {
      throw new Error('invalid release file manifest line');
    }
    const [kind, identity, relative] = fields;
    if (listed.has(relative)) {
      throw new Error('invalid or duplicate release manifest path');
    }
    const absolute = safeReleasePath(releaseDir, relative);
    const stat = fs.lstatSync(absolute);
    if (kind === 'F') {
      if (!HEX_64.test(identity)) {
        throw new Error(`invalid manifested file: ${relative}`);
      }
      ownedRegularFile(absolute);
      if (sha256(fs.readFileSync(absolute)) !== identity) {
        throw new Error(`release file digest mismatch: ${relative}`);
      }
    } else {
      if (!stat.isSymbolicLink() || fs.readlinkSync(absolute) !== identity) {
        throw new Error(`release symlink mismatch: ${relative}`);
      }
      symlinks.push({ absolute, identity, relative });
    }
    listed.set(relative, kind);
  }
  for (const record of symlinks) {
    verifyManifestedSymlink(releaseDir, record, listed);
  }
  const actual = walkRelease(releaseDir).sort();
  const expected = [...listed.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('release file manifest is incomplete');
  }
  return Object.freeze({
    artifactManifestSha256,
    manifestPath,
  });
}

function verifyReleaseFileManifest(releaseDir, expectedDigest) {
  const verified = verifyReleaseFileManifestIdentity(releaseDir);
  if (
    expectedDigest !== undefined
    && verified.artifactManifestSha256 !== expectedDigest
  ) {
    throw new Error('release file manifest digest mismatch');
  }
  return verified.manifestPath;
}

function readSealedOpenRelease(releaseDirectory = __dirname) {
  const releaseDir = fs.realpathSync(releaseDirectory);
  const releaseStat = fs.lstatSync(releaseDir);
  if (
    !releaseStat.isDirectory()
    || releaseStat.isSymbolicLink()
    || releaseStat.uid !== process.getuid()
    || (releaseStat.mode & 0o222) !== 0
  ) {
    throw new Error('Dexter MCP release directory is not sealed');
  }
  const {
    artifactManifestSha256,
    manifestPath,
  } = verifyReleaseFileManifestIdentity(releaseDir);
  const provenancePath = path.join(releaseDir, '.release-provenance.json');
  ownedRegularFile(provenancePath);
  const sealedProvenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  exactKeys(sealedProvenance, [
    'schema',
    'sourceCommit',
    'sourceTree',
    'sourceArchiveSha256',
    'packageLockSha256',
    'descriptorSha256',
    'packageVersion',
    'nodeVersion',
    'npmVersion',
    'sourceCommittedAt',
    'entrypoints',
    'rosters',
  ], 'release provenance');
  const sourceCommittedAt = new Date(sealedProvenance.sourceCommittedAt);
  if (
    sealedProvenance.schema !== 'dexter-mcp-immutable-release/v3'
    || !HEX_40.test(sealedProvenance.sourceCommit)
    || !HEX_40.test(sealedProvenance.sourceTree)
    || !HEX_64.test(sealedProvenance.sourceArchiveSha256)
    || !HEX_64.test(sealedProvenance.packageLockSha256)
    || !HEX_64.test(sealedProvenance.descriptorSha256)
    || typeof sealedProvenance.packageVersion !== 'string'
    || typeof sealedProvenance.nodeVersion !== 'string'
    || typeof sealedProvenance.npmVersion !== 'string'
    || Number.isNaN(sourceCommittedAt.valueOf())
    || sourceCommittedAt.toISOString() !== sealedProvenance.sourceCommittedAt
    || path.basename(releaseDir) !== sealedProvenance.sourceCommit
  ) {
    throw new Error('invalid Dexter MCP release provenance');
  }
  exactKeys(sealedProvenance.entrypoints, SERVICE_NAMES, 'release entrypoints');
  exactKeys(sealedProvenance.rosters, SERVICE_NAMES, 'release rosters');
  const rosters = Object.fromEntries(SERVICE_NAMES.map((name) => [
    name,
    exactRoster(sealedProvenance.rosters[name], name),
  ]));
  for (const name of SERVICE_NAMES) {
    if (sealedProvenance.entrypoints[name] !== ENTRYPOINTS[name]) {
      throw new Error(`invalid ${name} release entrypoint`);
    }
    ownedRegularFile(path.join(releaseDir, ENTRYPOINTS[name]));
    ownedRegularFile(path.join(releaseDir, APPLICATION_ENTRYPOINTS[name]));
  }
  const packagePath = path.join(releaseDir, 'package.json');
  ownedRegularFile(packagePath);
  const pkg = JSON.parse(fs.readFileSync(packagePath));
  if (pkg.version !== sealedProvenance.packageVersion) {
    throw new Error('release package version mismatch');
  }
  const lockPath = path.join(releaseDir, 'package-lock.json');
  ownedRegularFile(lockPath);
  const lockBytes = fs.readFileSync(lockPath);
  if (sha256(lockBytes) !== sealedProvenance.packageLockSha256) {
    throw new Error('release package-lock digest mismatch');
  }
  const descriptorPath = path.join(
    releaseDir,
    'release/open-tool-descriptors.json',
  );
  ownedRegularFile(descriptorPath);
  const descriptorBytes = fs.readFileSync(descriptorPath);
  if (sha256(descriptorBytes) !== sealedProvenance.descriptorSha256) {
    throw new Error('release descriptor digest mismatch');
  }
  const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
  if (
    JSON.stringify(descriptor.connectedToolNames)
      !== JSON.stringify(rosters['dexter-open-mcp'])
    || JSON.stringify(descriptor.tools?.map(({ name }) => name))
      !== JSON.stringify(rosters['dexter-open-mcp'])
  ) {
    throw new Error('release descriptor roster mismatch');
  }
  return Object.freeze({
    releaseDir,
    manifestPath,
    provenancePath,
    descriptorPath,
    provenance: Object.freeze({
      ...sealedProvenance,
      artifactManifestSha256,
      rosters,
    }),
  });
}

function releaseIdentityForService(release, service) {
  if (!SERVICE_NAMES.includes(service)) {
    throw new Error('invalid Dexter MCP release service');
  }
  const { provenance } = release;
  return Object.freeze({
    service,
    commit: provenance.sourceCommit,
    tree: provenance.sourceTree,
    artifactManifestSha256: provenance.artifactManifestSha256,
    descriptorSha256: provenance.descriptorSha256,
    packageVersion: provenance.packageVersion,
  });
}

module.exports = {
  APPLICATION_ENTRYPOINTS,
  ENTRYPOINTS,
  SERVICE_NAMES,
  readSealedOpenRelease,
  releaseIdentityForService,
  sha256,
  verifyReleaseFileManifest,
};
