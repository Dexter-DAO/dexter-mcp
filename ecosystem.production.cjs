// Immutable production launcher for both hosted OpenDexter MCP surfaces.
//
// The application release contains no credentials. PM2 must be invoked with
// DEXTER_MCP_ENV_FILE pointing at one explicit, owned mode-0600 regular file.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { parseEnv } = require("node:util");
const {
  readSealedOpenRelease,
  releaseIdentityForService,
} = require("./lib/open-release-provenance.cjs");

const ENV_ERROR =
  "DEXTER_MCP_ENV_FILE must be an absolute, owned mode-0600 regular file with one link";
const configuredEnvFile = process.env.DEXTER_MCP_ENV_FILE?.trim();
if (!configuredEnvFile || !path.isAbsolute(configuredEnvFile)) {
  throw new Error(ENV_ERROR);
}
const configuredEnvStat = fs.lstatSync(configuredEnvFile);
if (
  !configuredEnvStat.isFile()
  || configuredEnvStat.isSymbolicLink()
  || configuredEnvStat.nlink !== 1
  || configuredEnvStat.uid !== process.getuid()
  || (configuredEnvStat.mode & 0o7777) !== 0o600
) {
  throw new Error(ENV_ERROR);
}

const envFile = fs.realpathSync(configuredEnvFile);
// Activation evaluates this file, but each process repeats the full proof
// because PM2 autorestart/resurrect can bypass ecosystem evaluation.
const release = readSealedOpenRelease(__dirname);
const releaseDir = release.releaseDir;
if (release.provenance.nodeVersion !== process.version) {
  throw new Error(
    `Dexter MCP release requires ${release.provenance.nodeVersion}, `
    + `found ${process.version}`,
  );
}
const envFileBytes = fs.readFileSync(envFile);
const envFileSha256 = crypto.createHash("sha256")
  .update(envFileBytes)
  .digest("hex");
const applicationEnvironment = parseEnv(envFileBytes.toString("utf8"));
const governedSecret = String(
  applicationEnvironment.GOVERNED_AGENT_ACTIONS_HMAC_SECRET || "",
).trim();
if (Buffer.byteLength(governedSecret, "utf8") < 32) {
  throw new Error(
    "GOVERNED_AGENT_ACTIONS_HMAC_SECRET must contain at least 32 UTF-8 bytes",
  );
}
applicationEnvironment.GOVERNED_AGENT_ACTIONS_HMAC_SECRET = governedSecret;

for (const key of ["TOKEN_AI_MCP_PROFILE", "TOKEN_AI_MCP_TOOLSETS"]) {
  if (String(applicationEnvironment[key] ?? "") !== "") {
    throw new Error(`${key} must be empty for the source-owned private roster`);
  }
}
if (Object.hasOwn(applicationEnvironment, "PM2_HOME")) {
  throw new Error("PM2_HOME is forbidden in DEXTER_MCP_ENV_FILE");
}

for (const key of [
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
]) {
  if (Object.hasOwn(applicationEnvironment, key)) {
    throw new Error(`${key} is forbidden in DEXTER_MCP_ENV_FILE`);
  }
  if (process.env[key] !== undefined) {
    throw new Error(`${key} is forbidden in the production launcher environment`);
  }
}

for (const key of [
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "PWD",
  "PM2_HOME",
  "DEXTER_MCP_ENV_FILE",
  "DEXTER_MCP_ENV_FILE_SHA256",
  "DEXTER_MCP_RELEASE_COMMIT",
  "DEXTER_MCP_RELEASE_TREE",
  "DEXTER_MCP_RELEASE_MANIFEST_SHA256",
  "DEXTER_MCP_DESCRIPTOR_SHA256",
  "DEXTER_MCP_RELEASE_PACKAGE_VERSION",
  "DEXTER_MCP_RELEASE_SERVICE",
  "DEXTER_MCP_EXPECTED_ROSTER_JSON",
]) {
  delete applicationEnvironment[key];
}

const runtimePath = [
  path.dirname(process.execPath),
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
].filter((entry, index, entries) => entries.indexOf(entry) === index)
  .join(path.delimiter);

const common = {
  cwd: releaseDir,
  interpreter: process.execPath,
  exec_mode: "fork",
  instances: 1,
  node_args: [],
  args: [],
  autorestart: true,
  max_restarts: 10,
  wait_ready: true,
  listen_timeout: 15_000,
  kill_timeout: 10_000,
  filter_env: [""],
  env: {
    ...applicationEnvironment,
    PATH: runtimePath,
    HOME: "/home/branchmanager",
    NODE_ENV: "production",
    DEXTER_MCP_ENV_FILE: envFile,
    DEXTER_MCP_ENV_FILE_SHA256: envFileSha256,
  },
};

function service(name) {
  const identity = releaseIdentityForService(release, name);
  return {
    ...common,
    name,
    script: path.join(releaseDir, release.provenance.entrypoints[name]),
    env: {
      ...common.env,
      DEXTER_MCP_RELEASE_COMMIT: identity.commit,
      DEXTER_MCP_RELEASE_TREE: identity.tree,
      DEXTER_MCP_RELEASE_MANIFEST_SHA256:
        identity.artifactManifestSha256,
      DEXTER_MCP_DESCRIPTOR_SHA256: identity.descriptorSha256,
      DEXTER_MCP_RELEASE_PACKAGE_VERSION: identity.packageVersion,
      DEXTER_MCP_RELEASE_SERVICE: identity.service,
      DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(
        release.provenance.rosters[name],
      ),
    },
  };
}

module.exports = {
  apps: [
    service("dexter-mcp"),
    service("dexter-open-mcp"),
  ],
};
