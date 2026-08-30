// Immutable production launcher for the public OpenDexter MCP surface only.
//
// The application release contains no credentials. PM2 must be invoked with
// DEXTER_MCP_ENV_FILE pointing at one explicit, owned mode-0600 regular file.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseEnv } = require("node:util");
const {
  OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
  OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES,
  OPEN_RELEASE_APPLICATION_NODE_SHA256,
  OPEN_RELEASE_APPLICATION_NODE_VERSION,
  readSealedOpenRelease,
  releaseIdentityForService,
} = require("./lib/open-release-provenance.cjs");

function requireApplicationNodeRuntime() {
  for (const directory of OPEN_RELEASE_APPLICATION_NODE_PROTECTED_DIRECTORIES) {
    const identity = fs.lstatSync(directory);
    if (
      !identity.isDirectory()
      || identity.isSymbolicLink()
      || identity.uid !== 0
      || (identity.mode & 0o022) !== 0
    ) {
      throw new Error("OpenDexter application Node directory is not protected");
    }
  }
  const identity = fs.lstatSync(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE);
  if (
    !identity.isFile()
    || identity.isSymbolicLink()
    || identity.nlink !== 1
    || identity.uid !== 0
    || (identity.mode & 0o022) !== 0
    || fs.realpathSync(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE)
      !== OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE
  ) {
    throw new Error("OpenDexter application Node executable is not protected");
  }
  const digest = crypto.createHash("sha256")
    .update(fs.readFileSync(OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE))
    .digest("hex");
  if (digest !== OPEN_RELEASE_APPLICATION_NODE_SHA256) {
    throw new Error("OpenDexter application Node executable differs from review");
  }
  const version = execFileSync(
    OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
    ["--version"],
    {
      encoding: "utf8",
      env: {
        HOME: "/root",
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
      killSignal: "SIGKILL",
    },
  ).trim();
  if (version !== OPEN_RELEASE_APPLICATION_NODE_VERSION) {
    throw new Error("OpenDexter application Node version differs from review");
  }
  return OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE;
}

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
const applicationNodeExecutable = requireApplicationNodeRuntime();
if (release.provenance.nodeVersion !== OPEN_RELEASE_APPLICATION_NODE_VERSION) {
  throw new Error(
    `Dexter MCP release requires ${release.provenance.nodeVersion}, `
    + `but the reviewed application runtime is `
    + `${OPEN_RELEASE_APPLICATION_NODE_VERSION}`,
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

const privateRosterSelectors = Object.freeze(Object.fromEntries(
  ["TOKEN_AI_MCP_PROFILE", "TOKEN_AI_MCP_TOOLSETS"].map((key) => [
    key,
    String(applicationEnvironment[key] ?? "").trim(),
  ]),
));

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
  "TOKEN_AI_MCP_PROFILE",
  "TOKEN_AI_MCP_TOOLSETS",
  "version",
]) {
  delete applicationEnvironment[key];
}

const runtimePath = [
  path.dirname(applicationNodeExecutable),
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
  interpreter: applicationNodeExecutable,
  exec_mode: "fork",
  instances: 1,
  node_args: [],
  args: [],
  autorestart: true,
  max_restarts: 10,
  wait_ready: true,
  listen_timeout: 90_000,
  kill_timeout: 10_000,
  filter_env: [""],
  env: {
    ...applicationEnvironment,
    PATH: runtimePath,
    HOME: "/home/branchmanager",
    NODE_ENV: "production",
    version: release.provenance.packageVersion,
    DEXTER_MCP_ENV_FILE: envFile,
    DEXTER_MCP_ENV_FILE_SHA256: envFileSha256,
  },
};

function service(name) {
  if (name === "dexter-mcp") {
    for (const [key, value] of Object.entries(privateRosterSelectors)) {
      if (value !== "") {
        throw new Error(`${key} must be empty for the sealed private roster`);
      }
    }
  }
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

const ecosystem = {
  apps: [
    service("dexter-open-mcp"),
  ],
};

// The private-only ecosystem entrypoint reuses this exact environment and
// release-identity construction without adding its app to deploy:mcp.
Object.defineProperty(ecosystem, "__dexterBuildSealedService", {
  value: service,
  enumerable: false,
});

module.exports = ecosystem;
