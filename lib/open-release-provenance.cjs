const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
// Public cutovers intentionally import SERVICE_NAMES and remain scoped to the
// public process. A v4 candidate additionally attests the private OAuth server
// without changing the standard OpenDexter activation target.
const SERVICE_NAMES = ['dexter-open-mcp'];
const V4_SERVICE_NAMES = ['dexter-mcp', 'dexter-open-mcp'];
const ENTRYPOINTS = {
  'dexter-mcp': 'production-bootstrap.mjs',
  'dexter-open-mcp': 'production-bootstrap.mjs',
};
const APPLICATION_ENTRYPOINTS = {
  'dexter-mcp': 'http-server-oauth.mjs',
  'dexter-open-mcp': 'open-mcp-server.mjs',
};
const OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE =
  '/opt/dexter/runtime/node-v22.19.0/bin/node';
const OPEN_RELEASE_APPLICATION_NODE_VERSION = 'v22.19.0';
const OPEN_RELEASE_APPLICATION_NODE_SHA256 =
  '596b5144ff242737f1c1be6a5f0ccb3907dbba2482344143cb1a6898633402a9';
const OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES = Object.freeze([
  '/opt',
  '/opt/dexter',
  '/opt/dexter/runtime',
  '/opt/dexter/runtime/node-v22.19.0',
  '/opt/dexter/runtime/node-v22.19.0/bin',
]);

const LEGACY_OPEN_RELEASE_CONTRACT = Object.freeze({
  schema: 'dexter-mcp-immutable-release/v1',
  sourceCommit: '835bc431a3b8d1d4ebb8809d05c7b383888d177e',
  sourceTree: 'f3c510b6e0cf9161e1039e74f1dd60377817a911',
  sourceArchiveSha256:
    '680d224bdf387b7d72f614de93a6ac208881aee2a40b6171ba90d155c573ffd7',
  packageLockSha256:
    '067528a060781c85b3c0d2e5688c9408e15a8de737a4b5769529f41e03a6c629',
  artifactManifestSha256:
    'dd4c711e2b3ab11800a62684c8631e99e1ef52bfafd8c96fe966014cae5e8e06',
  artifactManifestSize: 17_787_095,
  packageName: 'dexter-mcp',
  packageVersion: '0.4.0',
  packageManager: 'npm@10.9.3',
  node: '^20.19.0 || >=22.12.0',
  entrypoint: 'open-mcp-server.mjs',
  entrypointSha256:
    'c5c5fd8204161a453784dcce025928eb4866cca87e9f46d629c077335e38be26',
  canonicalRemote: 'https://github.com/Dexter-DAO/dexter-mcp.git',
  canonicalRef: 'refs/heads/codex/mcp-release-graph-closure-20260731',
  healthKeys: Object.freeze([
    'auth',
    'boundSessions',
    'name',
    'ok',
    'rssMb',
    'sessions',
    'timestamp',
    'toolAuth',
    'tools',
    'walletAndPaymentScope',
  ]),
  roster: Object.freeze([
    'x402_search',
    'x402_check',
    'x402_fetch',
    'x402_status',
    'x402_access',
    'x402_wallet',
    'dexter_portfolio',
  ]),
  provenance: Object.freeze({
    schema: 'dexter-mcp-immutable-release/v1',
    sourceCommit: '835bc431a3b8d1d4ebb8809d05c7b383888d177e',
    sourceArchiveSha256:
      '680d224bdf387b7d72f614de93a6ac208881aee2a40b6171ba90d155c573ffd7',
    packageLockSha256:
      '067528a060781c85b3c0d2e5688c9408e15a8de737a4b5769529f41e03a6c629',
    vaultVersion: '0.43.0',
    nodeVersion: '22.19.0',
    npmVersion: '10.9.3',
    builtAt: '2026-07-31T14:06:26.549Z',
    entrypoints: Object.freeze([
      'http-server-oauth.mjs',
      'open-mcp-server.mjs',
    ]),
    environmentContract:
      'DEXTER_MCP_ENV_FILE owned mode-0600 regular file',
  }),
});

const LEGACY_PRIVATE_RELEASE_CONTRACT = Object.freeze({
  ...LEGACY_OPEN_RELEASE_CONTRACT,
  directoryName:
    `${LEGACY_OPEN_RELEASE_CONTRACT.sourceCommit}-runtime1`,
  manifestDirectoryName: LEGACY_OPEN_RELEASE_CONTRACT.sourceCommit,
  entrypoint: 'http-server-oauth.mjs',
  entrypointSha256:
    'b627969349e20b80f25ef6d8f69ba39cdcbd6a5a509c995d2b28209051c62d48',
  runtime: Object.freeze({
    interpreter:
      '/home/branchmanager/.nvm/versions/node/v22.19.0/bin/node',
    interpreterVersion: 'v22.19.0',
    interpreterSha256:
      '596b5144ff242737f1c1be6a5f0ccb3907dbba2482344143cb1a6898633402a9',
    interpreterIdentity: Object.freeze({
      dev: 66305,
      ino: 1049014,
      mode: 0o755,
      nlink: 2,
      uid: 1001,
      gid: 1001,
    }),
    // Read-only ext4 ncheck on 2026-08-30 found this as the only other name
    // for the interpreter inode. The branchmanager cutover cannot traverse
    // /root, so the executable contract binds the canonical name plus the
    // shared inode metadata, digest, and version instead of opening this path.
    interpreterObservedHardLink:
      '/root/.debug/home/branchmanager/.nvm/versions/node/v22.19.0/bin/node/12850a97407dc389a653e91f7560a4992af966df/elf',
    environmentFile: '/home/branchmanager/websites/dexter-mcp/.env',
    // Read-only production observation on 2026-08-30. Values are deliberately
    // absent; the cutover binds names and then compares each persisted value
    // to the protected environment file without logging either source.
    persistedEnvironmentKeys: Object.freeze([
      'BIRDEYE_API_KEY',
      'BRANCH_ADMIN_TOKEN',
      'CLOUDFLARE_API_TOKEN',
      'DEXTER_API_BASE_URL',
      'DEXTER_API_ORIGIN',
      'DEXTER_INTERNAL_TOKEN',
      'DEXTER_MCP_ENV_FILE',
      'HARNESS_AUTHORIZATION',
      'HARNESS_COOKIE',
      'HARNESS_COOKIES_JSON',
      'HARNESS_DEBUG_SESSION',
      'HARNESS_MCP_TOKEN',
      'HARNESS_PAGE_SIZE',
      'HARNESS_SESSION_URL',
      'HARNESS_STORAGE_STATE',
      'HARNESS_TARGET_URL',
      'HARNESS_WAIT_MS',
      'HOME',
      'INTERNAL_DEXTERCARD_HMAC_SECRET',
      'MCP_JWT_SECRET',
      'MCP_LOG_FORCE_COLOR',
      'MCP_SCHEMA_DEBUG',
      'MCP_SESSION_LABEL_HEADER',
      'MCP_STREAM_SCENE_PASSWORD',
      'MCP_SUPABASE_BEARER',
      'MCP_X402_FACILITATOR_URL',
      'NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET',
      'NODE_ENV',
      'OPENAI_API_KEY',
      'PATH',
      'PM2_HOME',
      'SENTRY_DSN',
      'SENTRY_OPEN_MCP_DSN',
      'STREAM_SCENE_API_BASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
      'TAVILY_API_KEY',
      'TOKEN_AI_APPS_SDK_ASSET_BASE',
      'TOKEN_AI_DEFAULT_WALLET_ADDRESS',
      'TOKEN_AI_ENABLE_APPS_SDK',
      'TOKEN_AI_MCP_CORS',
      'TOKEN_AI_MCP_OAUTH',
      'TOKEN_AI_MCP_PORT',
      'TOKEN_AI_MCP_PUBLIC_URL',
      'TOKEN_AI_MCP_TOKEN',
      'TOKEN_AI_MCP_TOOLSETS',
      'TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT',
      'TOKEN_AI_OIDC_CLIENT_ID',
      'TOKEN_AI_OIDC_CLIENT_ID_CHATGPT',
      'TOKEN_AI_OIDC_ISSUER',
      'TOKEN_AI_OIDC_SCOPES',
      'TOKEN_AI_OIDC_TOKEN_ENDPOINT',
      'TOKEN_AI_OIDC_USERINFO',
      'TWITTER_MEMORY_MODEL',
      'TWITTER_RESPONDER_ACCESS_TOKEN',
      'TWITTER_RESPONDER_ADMIN_TOKEN',
      'TWITTER_RESPONDER_API_KEY',
      'TWITTER_RESPONDER_API_SECRET',
      'TWITTER_RESPONDER_API_URL',
      'TWITTER_RESPONDER_BEARER_TOKEN',
      'TWITTER_RESPONDER_CALLBACK_URL',
      'TWITTER_RESPONDER_CLIENT_ID',
      'TWITTER_RESPONDER_CLIENT_SECRET',
      'TWITTER_RESPONDER_REFRESH_TOKEN',
      'TWITTER_RESPONDER_TOKEN_EXPIRES_AT',
      'TWITTER_SESSION_PATH',
      'WALLET_ENCRYPTION_KEY',
      'dexter-mcp',
      'unique_id',
    ]),
    environmentFileKeys: Object.freeze([
      'BIRDEYE_API_KEY',
      'BRANCH_ADMIN_TOKEN',
      'CLOUDFLARE_API_TOKEN',
      'DEXTER_API_BASE_URL',
      'DEXTER_API_ORIGIN',
      'DEXTER_INTERNAL_TOKEN',
      'GOVERNED_AGENT_ACTIONS_HMAC_SECRET',
      'HARNESS_AUTHORIZATION',
      'HARNESS_COOKIE',
      'HARNESS_COOKIES_JSON',
      'HARNESS_DEBUG_SESSION',
      'HARNESS_MCP_TOKEN',
      'HARNESS_PAGE_SIZE',
      'HARNESS_SESSION_URL',
      'HARNESS_STORAGE_STATE',
      'HARNESS_TARGET_URL',
      'HARNESS_WAIT_MS',
      'INTERNAL_DEXTERCARD_HMAC_SECRET',
      'MCP_JWT_SECRET',
      'MCP_LOG_FORCE_COLOR',
      'MCP_SCHEMA_DEBUG',
      'MCP_SESSION_LABEL_HEADER',
      'MCP_STREAM_SCENE_PASSWORD',
      'MCP_SUPABASE_BEARER',
      'MCP_X402_FACILITATOR_URL',
      'NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET',
      'OPENAI_API_KEY',
      'SENTRY_DSN',
      'SENTRY_OPEN_MCP_DSN',
      'STREAM_SCENE_API_BASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
      'TAVILY_API_KEY',
      'TOKEN_AI_APPS_SDK_ASSET_BASE',
      'TOKEN_AI_DEFAULT_WALLET_ADDRESS',
      'TOKEN_AI_ENABLE_APPS_SDK',
      'TOKEN_AI_MCP_CORS',
      'TOKEN_AI_MCP_OAUTH',
      'TOKEN_AI_MCP_PORT',
      'TOKEN_AI_MCP_PUBLIC_URL',
      'TOKEN_AI_MCP_TOKEN',
      'TOKEN_AI_MCP_TOOLSETS',
      'TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT',
      'TOKEN_AI_OIDC_CLIENT_ID',
      'TOKEN_AI_OIDC_CLIENT_ID_CHATGPT',
      'TOKEN_AI_OIDC_ISSUER',
      'TOKEN_AI_OIDC_SCOPES',
      'TOKEN_AI_OIDC_TOKEN_ENDPOINT',
      'TOKEN_AI_OIDC_USERINFO',
      'TWITTER_MEMORY_MODEL',
      'TWITTER_RESPONDER_ACCESS_TOKEN',
      'TWITTER_RESPONDER_ADMIN_TOKEN',
      'TWITTER_RESPONDER_API_KEY',
      'TWITTER_RESPONDER_API_SECRET',
      'TWITTER_RESPONDER_API_URL',
      'TWITTER_RESPONDER_BEARER_TOKEN',
      'TWITTER_RESPONDER_CALLBACK_URL',
      'TWITTER_RESPONDER_CLIENT_ID',
      'TWITTER_RESPONDER_CLIENT_SECRET',
      'TWITTER_RESPONDER_REFRESH_TOKEN',
      'TWITTER_RESPONDER_TOKEN_EXPIRES_AT',
      'TWITTER_SESSION_PATH',
      'WALLET_ENCRYPTION_KEY',
    ]),
  }),
});

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

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(
      (key) => [key, canonicalJson(value[key])],
    ));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left))
    === JSON.stringify(canonicalJson(right));
}

function stableLegacyStat(stat) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode & 0o7777,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  });
}

function exactLegacyRegularFile(file, { control = false } = {}) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink < 1
    || stat.uid !== process.getuid()
    || (control
      ? (stat.mode & 0o7777) !== 0o600
      : (stat.mode & 0o222) !== 0)
  ) {
    throw new Error(`legacy release file is not exact: ${file}`);
  }
  return stat;
}

function stableLegacyControlFile(file) {
  const before = exactLegacyRegularFile(file, { control: true });
  const bytes = fs.readFileSync(file);
  const after = exactLegacyRegularFile(file, { control: true });
  if (!sameJson(stableLegacyStat(before), stableLegacyStat(after))) {
    throw new Error(`legacy release control file changed: ${file}`);
  }
  return Object.freeze({ bytes, identity: stableLegacyStat(after) });
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

function collectLegacyDirectoryMetadata(
  root,
  directory = root,
  records = [],
) {
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || stat.uid !== process.getuid()
    || (stat.mode & 0o222) !== 0
  ) {
    throw new Error(`legacy release directory is not sealed: ${directory}`);
  }
  records.push({
    kind: 'D',
    relative: path.relative(root, directory),
    stat: stableLegacyStat(stat),
  });
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isDirectory()) {
      collectLegacyDirectoryMetadata(
        root,
        path.join(directory, item.name),
        records,
      );
    }
  }
  return records;
}

function verifyLegacyReleaseFileManifest(releaseDir, bytes) {
  const listed = new Map();
  const symlinks = [];
  const metadata = [];
  for (const line of bytes.toString('utf8').split('\n')) {
    if (!line) continue;
    const fields = line.split('\t');
    if (fields.length !== 3 || !['F', 'L'].includes(fields[0])) {
      throw new Error('invalid legacy release file manifest line');
    }
    const [kind, identity, relative] = fields;
    if (listed.has(relative)) {
      throw new Error('invalid or duplicate legacy release manifest path');
    }
    const absolute = safeReleasePath(releaseDir, relative);
    const before = fs.lstatSync(absolute);
    if (kind === 'F') {
      if (!HEX_64.test(identity)) {
        throw new Error(`invalid legacy manifested file: ${relative}`);
      }
      exactLegacyRegularFile(absolute);
      const fileBytes = fs.readFileSync(absolute);
      const after = exactLegacyRegularFile(absolute);
      if (
        !sameJson(stableLegacyStat(before), stableLegacyStat(after))
        || sha256(fileBytes) !== identity
      ) {
        throw new Error(`legacy release file identity mismatch: ${relative}`);
      }
      metadata.push({
        kind,
        identity,
        relative,
        stat: stableLegacyStat(after),
      });
    } else {
      if (
        !before.isSymbolicLink()
        || before.uid !== process.getuid()
        || fs.readlinkSync(absolute) !== identity
      ) {
        throw new Error(`legacy release symlink mismatch: ${relative}`);
      }
      symlinks.push({ absolute, identity, relative });
      metadata.push({
        kind,
        identity,
        relative,
        stat: stableLegacyStat(before),
      });
    }
    listed.set(relative, kind);
  }
  for (const record of symlinks) {
    verifyManifestedSymlink(releaseDir, record, listed);
  }
  const actual = walkRelease(releaseDir).sort();
  const expected = [...listed.keys()].sort();
  if (!sameJson(actual, expected)) {
    throw new Error('legacy release file manifest is incomplete');
  }
  metadata.push(...collectLegacyDirectoryMetadata(releaseDir));
  metadata.sort((left, right) => (
    left.relative.localeCompare(right.relative)
    || left.kind.localeCompare(right.kind)
  ));
  return Object.freeze({
    fileCount: listed.size,
    filesystemMetadataSha256: sha256(
      Buffer.from(JSON.stringify(canonicalJson(metadata))),
    ),
  });
}

/**
 * Read the one exact v1 public OpenDexter release currently on the production
 * host. This is rollback-only compatibility: it cannot validate a candidate
 * and it accepts no other legacy commit, provenance, manifest, or roster.
 * The two writable v1 control sidecars are read stably but never normalized;
 * every release path remains read-only, including hard links shared with the
 * private runtime.
 */
function readSealedLegacyOpenRelease(
  releaseDirectory,
  contract = LEGACY_OPEN_RELEASE_CONTRACT,
) {
  const releaseDir = fs.realpathSync(releaseDirectory);
  const releaseStat = fs.lstatSync(releaseDir);
  const expectedDirectoryName = contract.directoryName
    ?? contract.sourceCommit;
  if (
    !releaseStat.isDirectory()
    || releaseStat.isSymbolicLink()
    || releaseStat.uid !== process.getuid()
    || (releaseStat.mode & 0o222) !== 0
    || path.basename(releaseDir) !== expectedDirectoryName
  ) {
    throw new Error('legacy OpenDexter release directory is not exact');
  }
  const manifestDirectoryName = contract.manifestDirectoryName
    ?? contract.sourceCommit;
  if (
    typeof manifestDirectoryName !== 'string'
    || !HEX_40.test(manifestDirectoryName)
    || manifestDirectoryName !== contract.sourceCommit
  ) {
    throw new Error('legacy OpenDexter manifest location is not exact');
  }
  const manifestPath = path.join(
    path.dirname(releaseDir),
    `${manifestDirectoryName}.FILE-MANIFEST.tsv`,
  );
  const sidecarPath = `${manifestPath}.sha256`;
  const manifest = stableLegacyControlFile(manifestPath);
  const sidecar = stableLegacyControlFile(sidecarPath);
  const artifactManifestSha256 = sha256(manifest.bytes);
  if (
    artifactManifestSha256 !== contract.artifactManifestSha256
    || manifest.bytes.length !== contract.artifactManifestSize
    || sidecar.bytes.toString('utf8')
      !== `${artifactManifestSha256}  ${manifestPath}\n`
  ) {
    throw new Error('legacy OpenDexter manifest identity mismatch');
  }
  const verified = verifyLegacyReleaseFileManifest(
    releaseDir,
    manifest.bytes,
  );
  const provenancePath = path.join(releaseDir, '.release-provenance.json');
  exactLegacyRegularFile(provenancePath);
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  if (!sameJson(provenance, contract.provenance)) {
    throw new Error('legacy OpenDexter provenance mismatch');
  }
  const packageLockPath = path.join(releaseDir, 'package-lock.json');
  exactLegacyRegularFile(packageLockPath);
  if (sha256(fs.readFileSync(packageLockPath)) !== contract.packageLockSha256) {
    throw new Error('legacy OpenDexter package-lock mismatch');
  }
  const packagePath = path.join(releaseDir, 'package.json');
  exactLegacyRegularFile(packagePath);
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (
    pkg.name !== contract.packageName
    || pkg.version !== contract.packageVersion
    || pkg.packageManager !== contract.packageManager
    || pkg.engines?.node !== contract.node
  ) {
    throw new Error('legacy OpenDexter package identity mismatch');
  }
  const entrypoint = path.join(releaseDir, contract.entrypoint);
  exactLegacyRegularFile(entrypoint);
  if (sha256(fs.readFileSync(entrypoint)) !== contract.entrypointSha256) {
    throw new Error('legacy OpenDexter entrypoint mismatch');
  }
  const closingManifest = stableLegacyControlFile(manifestPath);
  const closingSidecar = stableLegacyControlFile(sidecarPath);
  const closingReleaseStat = fs.lstatSync(releaseDir);
  if (
    !manifest.bytes.equals(closingManifest.bytes)
    || !sidecar.bytes.equals(closingSidecar.bytes)
    || !sameJson(manifest.identity, closingManifest.identity)
    || !sameJson(sidecar.identity, closingSidecar.identity)
    || !sameJson(
      stableLegacyStat(releaseStat),
      stableLegacyStat(closingReleaseStat),
    )
  ) {
    throw new Error('legacy OpenDexter controls changed during verification');
  }
  return Object.freeze({
    kind: 'legacy-open-v1',
    releaseDir,
    manifestPath,
    sidecarPath,
    provenancePath,
    entrypoint,
    sourceIdentity: Object.freeze({
      commit: contract.sourceCommit,
      tree: contract.sourceTree,
      archiveSha256: contract.sourceArchiveSha256,
      canonicalRemote: contract.canonicalRemote,
      canonicalRef: contract.canonicalRef,
    }),
    provenance: Object.freeze({
      ...provenance,
      artifactManifestSha256,
      packageVersion: contract.packageVersion,
    }),
    rollbackIdentity: Object.freeze({
      artifactManifestSha256,
      fileCount: verified.fileCount,
      filesystemMetadataSha256: verified.filesystemMetadataSha256,
      manifest: manifest.identity,
      sidecar: sidecar.identity,
    }),
  });
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
  const releaseServices = sealedProvenance.schema
    === 'dexter-mcp-immutable-release/v3'
    ? SERVICE_NAMES
    : sealedProvenance.schema === 'dexter-mcp-immutable-release/v4'
      ? V4_SERVICE_NAMES
      : null;
  if (
    releaseServices === null
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
  exactKeys(sealedProvenance.entrypoints, releaseServices, 'release entrypoints');
  exactKeys(sealedProvenance.rosters, releaseServices, 'release rosters');
  const rosters = Object.fromEntries(releaseServices.map((name) => [
    name,
    exactRoster(sealedProvenance.rosters[name], name),
  ]));
  for (const name of releaseServices) {
    if (sealedProvenance.entrypoints[name] !== ENTRYPOINTS[name]) {
      throw new Error(`invalid ${name} release entrypoint`);
    }
    ownedRegularFile(path.join(releaseDir, ENTRYPOINTS[name]));
    ownedRegularFile(path.join(releaseDir, APPLICATION_ENTRYPOINTS[name]));
  }
  if (sealedProvenance.schema === 'dexter-mcp-immutable-release/v4') {
    ownedRegularFile(path.join(
      releaseDir,
      'ecosystem.private.production.cjs',
    ));
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
  if (
    !V4_SERVICE_NAMES.includes(service)
    || !Object.hasOwn(release?.provenance?.entrypoints ?? {}, service)
    || !Object.hasOwn(release?.provenance?.rosters ?? {}, service)
  ) {
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
  LEGACY_OPEN_RELEASE_CONTRACT,
  LEGACY_PRIVATE_RELEASE_CONTRACT,
  OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
  OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES,
  OPEN_RELEASE_APPLICATION_NODE_SHA256,
  OPEN_RELEASE_APPLICATION_NODE_VERSION,
  SERVICE_NAMES,
  V4_SERVICE_NAMES,
  readSealedLegacyOpenRelease,
  readSealedOpenRelease,
  releaseIdentityForService,
  sha256,
  verifyReleaseFileManifest,
};
