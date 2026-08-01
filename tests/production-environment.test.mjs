import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "ecosystem.production.cjs");
const probe = `
  const value = require(${JSON.stringify(configPath)});
  process.stdout.write(JSON.stringify(value.apps.map((app) => ({
    name: app.name,
    script: app.script,
    cwd: app.cwd,
    nodeOptions: app.env.NODE_OPTIONS,
    dextercardSecret: app.env.INTERNAL_DEXTERCARD_HMAC_SECRET,
    governedSecret: app.env.GOVERNED_AGENT_ACTIONS_HMAC_SECRET,
    nativeExactSecret: app.env.NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET,
    envFile: app.env.DEXTER_MCP_ENV_FILE,
    bindNode: app.interpreter,
  }))));
`;

test("production launcher binds both services to one protected external environment", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-"));
  const envFile = path.join(directory, "production.env");
  try {
    writeFileSync(
      envFile,
      [
        "TOKEN_AI_MCP_PORT=3930",
        "OPEN_MCP_PORT=3931",
        "INTERNAL_DEXTERCARD_HMAC_SECRET=test-governed-secret-with-at-least-thirty-two-bytes",
        "GOVERNED_AGENT_ACTIONS_HMAC_SECRET=test-dedicated-governed-secret-at-least-thirty-two-bytes",
        "NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET=test-secret-with-at-least-thirty-two-bytes",
        "NODE_OPTIONS=--inspect",
      ].join("\n"),
      { mode: 0o600 },
    );
    const apps = JSON.parse(execFileSync(process.execPath, ["-e", probe], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        DEXTER_MCP_ENV_FILE: envFile,
      },
      encoding: "utf8",
    }));
    assert.deepEqual(apps.map((app) => app.name), [
      "dexter-mcp",
      "dexter-open-mcp",
    ]);
    for (const app of apps) {
      assert.equal(app.cwd, root);
      assert.equal(app.nodeOptions, undefined);
      assert.equal(
        app.dextercardSecret,
        "test-governed-secret-with-at-least-thirty-two-bytes",
      );
      assert.equal(
        app.governedSecret,
        "test-dedicated-governed-secret-at-least-thirty-two-bytes",
      );
      assert.equal(
        app.nativeExactSecret,
        "test-secret-with-at-least-thirty-two-bytes",
      );
      assert.equal(app.envFile, envFile);
      assert.equal(app.bindNode, process.execPath);
      assert.equal(path.dirname(app.script), root);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fresh environment template declares all purpose-separated service secrets", () => {
  const example = readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(example, /^INTERNAL_DEXTERCARD_HMAC_SECRET=$/m);
  assert.match(example, /^GOVERNED_AGENT_ACTIONS_HMAC_SECRET=$/m);
  assert.match(example, /^NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET=$/m);
  assert.match(example, /same 32\+ byte secret as dexter-api/);
});

test("governed tools read only the dedicated governed-money secret", () => {
  const server = readFileSync(path.join(root, "open-mcp-server.mjs"), "utf8");
  const start = server.indexOf("async function governedAssetAction");
  const end = server.indexOf("// ─── MCP Server Setup", start);
  assert.ok(start >= 0 && end > start);
  const governedAction = server.slice(start, end);
  assert.match(governedAction, /secret: GOVERNED_AGENT_ACTIONS_HMAC_SECRET/);
  assert.doesNotMatch(governedAction, /secret: INTERNAL_HMAC_SECRET/);
});

test("production launcher refuses a group-readable environment file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-"));
  const envFile = path.join(directory, "production.env");
  try {
    writeFileSync(envFile, "OPEN_MCP_PORT=3931\n", { mode: 0o600 });
    chmodSync(envFile, 0o640);
    assert.throws(
      () => execFileSync(process.execPath, ["-e", probe], {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          DEXTER_MCP_ENV_FILE: envFile,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      /Command failed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
