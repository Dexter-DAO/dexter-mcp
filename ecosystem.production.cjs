// Immutable production launcher for both hosted OpenDexter MCP surfaces.
//
// The application release contains no credentials. PM2 must be invoked with
// DEXTER_MCP_ENV_FILE pointing at one explicit, owned mode-0600 regular file.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

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
const releaseDir = fs.realpathSync(__dirname);
const applicationEnvironment = dotenv.parse(fs.readFileSync(envFile, "utf8"));
for (const key of [
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "PWD",
  "DEXTER_MCP_ENV_FILE",
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
  autorestart: true,
  max_restarts: 10,
  filter_env: [""],
  env: {
    ...applicationEnvironment,
    PATH: runtimePath,
    HOME: "/home/branchmanager",
    NODE_ENV: "production",
    DEXTER_MCP_ENV_FILE: envFile,
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: "dexter-mcp",
      script: path.join(releaseDir, "http-server-oauth.mjs"),
    },
    {
      ...common,
      name: "dexter-open-mcp",
      script: path.join(releaseDir, "open-mcp-server.mjs"),
    },
  ],
};
