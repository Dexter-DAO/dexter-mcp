import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  requireGovernedAgentActionsHmacSecret,
} from "../lib/governed-asset-service-config.mjs";
import {
  productionPm2ConfigShim,
} from "../scripts/release/open-release-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
} = require("../lib/open-release-provenance.cjs");
const forbiddenLoaderKeys = [
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runtimePath() {
  return [
    path.dirname(process.execPath),
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ].filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join(path.delimiter);
}

function writeFileManifest(releaseDir, relativeFiles) {
  const manifest = Buffer.from(`${relativeFiles
    .sort()
    .map((relative) => (
      `F\t${sha256(readFileSync(path.join(releaseDir, relative)))}\t${relative}`
    ))
    .join("\n")}\n`);
  const manifestPath = `${releaseDir}.FILE-MANIFEST.tsv`;
  writeFileSync(manifestPath, manifest, { mode: 0o400 });
  return { manifest, manifestPath };
}

function createReleaseCandidate(parent) {
  const commit = "a".repeat(40);
  const tree = "b".repeat(40);
  const releaseDir = path.join(parent, commit);
  mkdirSync(path.join(releaseDir, "lib"), { recursive: true });
  mkdirSync(path.join(releaseDir, "release"), { recursive: true });
  cpSync(
    path.join(root, "ecosystem.production.cjs"),
    path.join(releaseDir, "ecosystem.production.cjs"),
  );
  cpSync(
    path.join(root, "lib/open-release-provenance.cjs"),
    path.join(releaseDir, "lib/open-release-provenance.cjs"),
  );
  cpSync(
    path.join(root, "lib/open-release-identity.mjs"),
    path.join(releaseDir, "lib/open-release-identity.mjs"),
  );
  cpSync(
    path.join(root, "lib/open-release-runtime-preflight.mjs"),
    path.join(releaseDir, "lib/open-release-runtime-preflight.mjs"),
  );
  cpSync(
    path.join(root, "production-bootstrap.mjs"),
    path.join(releaseDir, "production-bootstrap.mjs"),
  );
  writeFileSync(
    path.join(releaseDir, "open-mcp-server.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "if (process.env.PREIMPORT_MARKER_PATH) {",
      "  writeFileSync(process.env.PREIMPORT_MARKER_PATH, 'imported');",
      "}",
      "export function startOpenMcpServer() {",
      "  if (process.env.START_MARKER_PATH) {",
      "    writeFileSync(process.env.START_MARKER_PATH, 'started');",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(releaseDir, "lib/transitive-fixture.mjs"),
    "export const transitiveFixture = true;\n",
  );
  const pkg = Buffer.from(JSON.stringify({ name: "dexter-mcp", version: "0.5.0" }));
  const lock = Buffer.from("{}\n");
  const rosters = {
    "dexter-open-mcp": ["x402_search", "dexter_prepare_asset_action"],
  };
  const descriptor = Buffer.from(`${JSON.stringify({
    connectedToolNames: rosters["dexter-open-mcp"],
    tools: rosters["dexter-open-mcp"].map((name) => ({ name })),
  })}\n`);
  writeFileSync(path.join(releaseDir, "package.json"), pkg);
  writeFileSync(path.join(releaseDir, "package-lock.json"), lock);
  writeFileSync(
    path.join(releaseDir, "release/open-tool-descriptors.json"),
    descriptor,
  );
  writeFileSync(
    path.join(releaseDir, "direct-entrypoint.mjs"),
    [
      "import './lib/transitive-fixture.mjs';",
      "import { requireSealedOpenReleaseRuntime } from './lib/open-release-runtime-preflight.mjs';",
      "const roster = JSON.parse(process.env.DEXTER_MCP_EXPECTED_ROSTER_JSON);",
      "requireSealedOpenReleaseRuntime({",
      "  releaseDir: new URL('.', import.meta.url).pathname,",
      "  service: process.env.DEXTER_MCP_RELEASE_SERVICE,",
      "  actualRoster: roster,",
      "});",
      "process.stdout.write('verified');",
      "",
    ].join("\n"),
  );
  const manifestedFiles = [
    ".release-provenance.json",
    "ecosystem.production.cjs",
    "production-bootstrap.mjs",
    "lib/open-release-provenance.cjs",
    "lib/open-release-identity.mjs",
    "lib/open-release-runtime-preflight.mjs",
    "lib/transitive-fixture.mjs",
    "direct-entrypoint.mjs",
    "open-mcp-server.mjs",
    "package.json",
    "package-lock.json",
    "release/open-tool-descriptors.json",
  ];
  writeFileSync(
    path.join(releaseDir, ".release-provenance.json"),
    `${JSON.stringify({
      schema: "dexter-mcp-immutable-release/v3",
      sourceCommit: commit,
      sourceTree: tree,
      sourceArchiveSha256: "c".repeat(64),
      packageLockSha256: sha256(lock),
      descriptorSha256: sha256(descriptor),
      packageVersion: "0.5.0",
      nodeVersion: process.version,
      npmVersion: "10.9.3",
      sourceCommittedAt: "2026-08-01T00:00:00.000Z",
      entrypoints: {
        "dexter-open-mcp": "production-bootstrap.mjs",
      },
      rosters,
    }, null, 2)}\n`,
  );
  const { manifestPath } = writeFileManifest(releaseDir, manifestedFiles);
  for (const file of manifestedFiles) {
    chmodSync(path.join(releaseDir, file), 0o400);
  }
  chmodSync(path.join(releaseDir, "lib"), 0o500);
  chmodSync(path.join(releaseDir, "release"), 0o500);
  chmodSync(releaseDir, 0o500);
  return {
    releaseDir,
    rosters,
    commit,
    tree,
    manifestPath,
    transitivePath: path.join(releaseDir, "lib/transitive-fixture.mjs"),
  };
}

function releaseEnvironment(candidate, service, envFile) {
  const provenance = JSON.parse(readFileSync(
    path.join(candidate.releaseDir, ".release-provenance.json"),
    "utf8",
  ));
  const pm2Id = "7";
  const pm2Home = "/home/branchmanager/.pm2";
  return {
    NODE_ENV: "production",
    PATH: runtimePath(),
    HOME: "/home/branchmanager",
    GOVERNED_AGENT_ACTIONS_HMAC_SECRET: "s".repeat(32),
    DEXTER_MCP_ENV_FILE: envFile,
    DEXTER_MCP_ENV_FILE_SHA256: sha256(readFileSync(envFile)),
    DEXTER_MCP_RELEASE_COMMIT: candidate.commit,
    DEXTER_MCP_RELEASE_TREE: candidate.tree,
    DEXTER_MCP_RELEASE_MANIFEST_SHA256:
      sha256(readFileSync(candidate.manifestPath)),
    DEXTER_MCP_DESCRIPTOR_SHA256: provenance.descriptorSha256,
    DEXTER_MCP_RELEASE_PACKAGE_VERSION: provenance.packageVersion,
    DEXTER_MCP_RELEASE_SERVICE: service,
    DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(
      candidate.rosters[service],
    ),
    name: service,
    namespace: "default",
    pm_id: pm2Id,
    cwd: candidate.releaseDir,
    pm_cwd: candidate.releaseDir,
    pm_exec_path: path.join(candidate.releaseDir, "production-bootstrap.mjs"),
    exec_interpreter: process.execPath,
    exec_mode: "fork_mode",
    instances: "1",
    node_args: "",
    args: "",
    autorestart: "true",
    max_restarts: "10",
    wait_ready: "true",
    listen_timeout: "90000",
    kill_timeout: "10000",
    filter_env: "",
    NODE_APP_INSTANCE: "0",
    instance_var: "NODE_APP_INSTANCE",
    PM2_HOME: pm2Home,
    pm_out_log_path: `${pm2Home}/logs/${service}-out-${pm2Id}.log`,
    pm_err_log_path: `${pm2Home}/logs/${service}-error-${pm2Id}.log`,
    pm_pid_path: `${pm2Home}/pids/${service}-${pm2Id}.pid`,
    pm_uptime: "1785566638318",
    created_at: "1785509567332",
    restart_time: "0",
    unstable_restarts: "0",
    status: "launching",
    username: "branchmanager",
    version: provenance.packageVersion,
    node_version: process.versions.node,
    unique_id: "befd8951-6864-4e31-80a2-69082d90347d",
    env: "[object Object]",
    automation: "true",
    autostart: "true",
    axm_actions: "[object Object]",
    axm_dynamic: "[object Object]",
    axm_monitor: "[object Object]",
    axm_options: "[object Object]",
    kill_retry_time: "100",
    km_link: "false",
    pmx: "true",
    treekill: "true",
    vizion: "true",
    vizion_running: "false",
    windowsHide: "true",
    [service]: "{}",
  };
}

function probe(configPath) {
  return `
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
    envFileSha256: app.env.DEXTER_MCP_ENV_FILE_SHA256,
    bindNode: app.interpreter,
    runtimePackageVersion: app.env.version,
    waitReady: app.wait_ready,
    execMode: app.exec_mode,
    instances: app.instances,
    autorestart: app.autorestart,
    maxRestarts: app.max_restarts,
    listenTimeout: app.listen_timeout,
    killTimeout: app.kill_timeout,
    nodeArgs: app.node_args,
    scriptName: require('node:path').basename(app.script),
    releaseCommit: app.env.DEXTER_MCP_RELEASE_COMMIT,
    releaseTree: app.env.DEXTER_MCP_RELEASE_TREE,
    releaseService: app.env.DEXTER_MCP_RELEASE_SERVICE,
    expectedRoster: JSON.parse(app.env.DEXTER_MCP_EXPECTED_ROSTER_JSON),
    privateProfile: app.env.TOKEN_AI_MCP_PROFILE,
    privateToolsets: app.env.TOKEN_AI_MCP_TOOLSETS,
  }))));
`;
}

function removeCandidate(directory, candidate) {
  chmodSync(candidate.releaseDir, 0o700);
  chmodSync(path.join(candidate.releaseDir, "lib"), 0o700);
  chmodSync(path.join(candidate.releaseDir, "release"), 0o700);
  rmSync(directory, { recursive: true, force: true });
}

test("production launcher binds only public OpenDexter to protected environment", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  try {
    const envFileBytes = Buffer.from([
      "TOKEN_AI_MCP_PORT=3930",
      "OPEN_MCP_PORT=3931",
      "INTERNAL_DEXTERCARD_HMAC_SECRET=test-governed-secret-with-at-least-thirty-two-bytes",
      "GOVERNED_AGENT_ACTIONS_HMAC_SECRET=test-dedicated-governed-secret-at-least-thirty-two-bytes",
      "NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET=test-secret-with-at-least-thirty-two-bytes",
      "version=9.9.9",
      `DEXTER_MCP_ENV_FILE_SHA256=${"f".repeat(64)}`,
    ].join("\n"));
    writeFileSync(envFile, envFileBytes, { mode: 0o600 });
    const apps = JSON.parse(execFileSync(process.execPath, ["-e", probe(
      path.join(candidate.releaseDir, "ecosystem.production.cjs"),
    )], {
      cwd: candidate.releaseDir,
      env: {
        PATH: process.env.PATH,
        DEXTER_MCP_ENV_FILE: envFile,
      },
      encoding: "utf8",
    }));
    assert.deepEqual(apps.map((app) => app.name), ["dexter-open-mcp"]);
    for (const app of apps) {
      assert.equal(app.cwd, candidate.releaseDir);
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
      assert.equal(app.envFileSha256, sha256(envFileBytes));
      assert.notEqual(app.envFileSha256, "f".repeat(64));
      assert.equal(app.bindNode, OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE);
      assert.equal(app.runtimePackageVersion, "0.5.0");
      assert.equal(path.dirname(app.script), candidate.releaseDir);
      assert.equal(app.waitReady, true);
      assert.equal(app.execMode, "fork");
      assert.equal(app.instances, 1);
      assert.equal(app.autorestart, true);
      assert.equal(app.maxRestarts, 10);
      assert.equal(app.listenTimeout, 90_000);
      assert.equal(app.killTimeout, 10_000);
      assert.deepEqual(app.nodeArgs ?? [], []);
      assert.equal(app.scriptName, "production-bootstrap.mjs");
      assert.equal(app.releaseCommit, candidate.commit);
      assert.equal(app.releaseTree, candidate.tree);
      assert.deepEqual(
        app.expectedRoster,
        candidate.rosters[app.name],
      );
      assert.equal(app.releaseService, app.name);
    }
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("PM2 control Node 18 evaluates a launcher bound to sealed Node 22", () => {
  const controlNode = "/usr/bin/node";
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-control-node-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  const configShim = path.join(directory, "candidate.config.cjs");
  try {
    writeFileSync(
      envFile,
      `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
      { mode: 0o600 },
    );
    assert.equal(execFileSync(controlNode, ["--version"], {
      encoding: "utf8",
    }).trim(), "v18.19.1");
    writeFileSync(
      configShim,
      productionPm2ConfigShim(
        path.join(candidate.releaseDir, "ecosystem.production.cjs"),
      ),
      { mode: 0o600 },
    );
    const serializationProbe = (target) => [
      `const value = require(${JSON.stringify(target)});`,
      "process.stdout.write(JSON.stringify(value));",
    ].join("\n");
    const commandEnvironment = {
      PATH: "/usr/bin:/bin",
      DEXTER_MCP_ENV_FILE: envFile,
    };
    const directSerialization = execFileSync(
      OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE,
      ["-e", serializationProbe(
        path.join(candidate.releaseDir, "ecosystem.production.cjs"),
      )],
      {
        cwd: candidate.releaseDir,
        env: commandEnvironment,
        encoding: "utf8",
      },
    );
    const shimSerialization = execFileSync(
      controlNode,
      ["-e", serializationProbe(configShim)],
      {
        cwd: candidate.releaseDir,
        env: commandEnvironment,
        encoding: "utf8",
      },
    );
    assert.equal(shimSerialization, directSerialization);
    const [app] = JSON.parse(execFileSync(controlNode, ["-e", probe(
      configShim,
    )], {
      cwd: candidate.releaseDir,
      env: commandEnvironment,
      encoding: "utf8",
    }));
    assert.equal(app.bindNode, OPEN_RELEASE_APPLICATION_NODE_EXECUTABLE);
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("PM2 config shim gives sealed release evaluation a truthful timeout", () => {
  const shim = productionPm2ConfigShim("/tmp/sealed/ecosystem.production.cjs")
    .toString("utf8");
  assert.match(shim, /timeout: 90_000,/);
  assert.doesNotMatch(shim, /timeout: 10_000,/);
});

test("production launcher rejects every loader-influencing environment key", () => {
  for (const source of ["protected-file", "launcher-process"]) {
    for (const key of forbiddenLoaderKeys) {
      const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-loader-"));
      const candidate = createReleaseCandidate(directory);
      const envFile = path.join(directory, "production.env");
      try {
        const fileLines = [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}`,
        ];
        if (source === "protected-file") fileLines.push(`${key}=attacker`);
        writeFileSync(envFile, fileLines.join("\n"), { mode: 0o600 });
        assert.throws(
          () => execFileSync(process.execPath, ["-e", probe(
            path.join(candidate.releaseDir, "ecosystem.production.cjs"),
          )], {
            cwd: candidate.releaseDir,
            env: {
              PATH: process.env.PATH,
              DEXTER_MCP_ENV_FILE: envFile,
              ...(source === "launcher-process" ? { [key]: "attacker" } : {}),
            },
            stdio: ["ignore", "pipe", "pipe"],
          }),
          /Command failed/,
        );
      } finally {
        removeCandidate(directory, candidate);
      }
    }
  }
});

test("public launcher strips legacy private roster selection without touching it", () => {
  for (const key of ["TOKEN_AI_MCP_PROFILE", "TOKEN_AI_MCP_TOOLSETS"]) {
    const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-profile-"));
    const candidate = createReleaseCandidate(directory);
    const envFile = path.join(directory, "production.env");
    try {
      writeFileSync(envFile, [
        `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}`,
        `${key}=legacy-private-selection`,
      ].join("\n"), { mode: 0o600 });
      const [app] = JSON.parse(execFileSync(process.execPath, ["-e", probe(
        path.join(candidate.releaseDir, "ecosystem.production.cjs"),
      )], {
        cwd: candidate.releaseDir,
        env: {
          PATH: process.env.PATH,
          DEXTER_MCP_ENV_FILE: envFile,
        },
        encoding: "utf8",
      }));
      assert.equal(app.privateProfile, undefined);
      assert.equal(app.privateToolsets, undefined);

      const injected = spawnSync(
        process.execPath,
        [path.join(candidate.releaseDir, "direct-entrypoint.mjs")],
        {
          cwd: candidate.releaseDir,
          env: {
            ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
            [key]: "legacy-private-selection",
          },
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      assert.notEqual(injected.status, 0);
      assert.match(
        `${injected.stdout}${injected.stderr}`,
        new RegExp(`opendexter_unprotected_application_env:${key}`),
      );
    } finally {
      removeCandidate(directory, candidate);
    }
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

test("governed secret preflight is byte-exact and has no legacy fallback", () => {
  for (const value of [undefined, "", "   ", "a".repeat(31), "é".repeat(15)]) {
    assert.throws(
      () => requireGovernedAgentActionsHmacSecret({
        GOVERNED_AGENT_ACTIONS_HMAC_SECRET: value,
        INTERNAL_DEXTERCARD_HMAC_SECRET: "z".repeat(64),
      }),
      /governed_agent_actions_hmac_secret_unavailable/,
    );
  }
  assert.equal(
    requireGovernedAgentActionsHmacSecret({
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: `  ${"é".repeat(16)}  `,
      INTERNAL_DEXTERCARD_HMAC_SECRET: "z".repeat(64),
    }),
    "é".repeat(16),
  );
});

test("production launcher rejects missing or short governed secret", () => {
  for (const value of ["", "short", "a".repeat(31)]) {
    const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-"));
    const candidate = createReleaseCandidate(directory);
    const envFile = path.join(directory, "production.env");
    try {
      writeFileSync(
        envFile,
        [
          `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${value}`,
          `INTERNAL_DEXTERCARD_HMAC_SECRET=${"z".repeat(64)}`,
        ].join("\n"),
        { mode: 0o600 },
      );
      assert.throws(
        () => execFileSync(process.execPath, ["-e", probe(
          path.join(candidate.releaseDir, "ecosystem.production.cjs"),
        )], {
          cwd: candidate.releaseDir,
          env: {
            PATH: process.env.PATH,
            DEXTER_MCP_ENV_FILE: envFile,
          },
          stdio: ["ignore", "pipe", "pipe"],
        }),
        /Command failed/,
      );
    } finally {
      removeCandidate(directory, candidate);
    }
  }
});

test("public OpenDexter entrypoint fails closed on the dedicated secret", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-direct-"));
  try {
    // A fresh cwd contains no .env, so open-mcp's instrumentation import
    // cannot inherit the repository's developer configuration during this
    // direct-entrypoint test.
    for (const script of ["open-mcp-server.mjs"]) {
      for (const governedSecret of [undefined, "short", "a".repeat(31)]) {
        const env = {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: "production",
          INTERNAL_DEXTERCARD_HMAC_SECRET: "z".repeat(64),
          DOTENV_CONFIG_QUIET: "true",
          OPEN_MCP_PORT: "0",
          TOKEN_AI_MCP_PORT: "0",
        };
        if (governedSecret !== undefined) {
          env.GOVERNED_AGENT_ACTIONS_HMAC_SECRET = governedSecret;
        }
        const result = spawnSync(
          process.execPath,
          [path.join(root, script)],
          {
            cwd: directory,
            env,
            encoding: "utf8",
            timeout: 8_000,
          },
        );
        assert.notEqual(result.status, 0, `${script} ${governedSecret}`);
        assert.equal(result.signal, null, `${script} must exit, not time out`);
        assert.match(
          `${result.stdout}${result.stderr}`,
          /governed_agent_actions_hmac_secret_unavailable/,
        );
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("direct autorestart preflight re-verifies every byte despite self-asserted old identity", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-restart-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  writeFileSync(
    envFile,
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
    { mode: 0o600 },
  );
  const env = {
    PATH: process.env.PATH,
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
  };
  try {
    const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
    const baseline = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(baseline.status, 0, baseline.stderr);
    assert.equal(baseline.stdout, "verified");

    chmodSync(candidate.releaseDir, 0o700);
    chmodSync(path.join(candidate.releaseDir, "lib"), 0o700);
    chmodSync(candidate.transitivePath, 0o600);
    writeFileSync(candidate.transitivePath, "export const transitiveFixture = false;\n");
    chmodSync(candidate.transitivePath, 0o400);
    chmodSync(path.join(candidate.releaseDir, "lib"), 0o500);
    chmodSync(candidate.releaseDir, 0o500);

    const tampered = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(tampered.status, 0);
    assert.equal(tampered.signal, null);
    assert.match(
      `${tampered.stdout}${tampered.stderr}`,
      /release file digest mismatch: lib\/transitive-fixture\.mjs/,
    );
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("direct autorestart preflight binds sealed identity and roster to PM2 environment", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-binding-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  writeFileSync(
    envFile,
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
    { mode: 0o600 },
  );
  const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
  const baseEnv = {
    PATH: process.env.PATH,
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
  };
  try {
    const cases = [
      {
        env: { ...baseEnv, DEXTER_MCP_RELEASE_COMMIT: "e".repeat(40) },
        error: /opendexter_release_identity_mismatch/,
      },
      {
        env: {
          ...baseEnv,
          DEXTER_MCP_EXPECTED_ROSTER_JSON: JSON.stringify(["x402_search"]),
        },
        error: /opendexter_release_roster_mismatch/,
      },
    ];
    for (const fixture of cases) {
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: candidate.releaseDir,
        env: fixture.env,
        encoding: "utf8",
        timeout: 5_000,
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.signal, null);
      assert.match(`${result.stdout}${result.stderr}`, fixture.error);
    }
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("runtime accepts exact PM2 bookkeeping but refuses launch-authority or policy drift", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-pm2-env-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  writeFileSync(
    envFile,
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
    { mode: 0o600 },
  );
  const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
  const baseEnv = releaseEnvironment(
    candidate,
    "dexter-open-mcp",
    envFile,
  );
  try {
    const baseline = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env: baseEnv,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(baseline.status, 0, baseline.stderr);
    assert.equal(baseline.stdout, "verified");

    const cases = [
      ["name", "attacker"],
      ["cwd", "/tmp"],
      ["pm_cwd", "/tmp"],
      ["pm_exec_path", path.join(candidate.releaseDir, "open-mcp-server.mjs")],
      ["exec_interpreter", "/usr/bin/node"],
      ["exec_mode", "cluster_mode"],
      ["instances", "2"],
      ["node_args", "--require=/tmp/attacker.cjs"],
      ["args", "--attacker"],
      ["autorestart", "false"],
      ["max_restarts", "11"],
      ["wait_ready", "false"],
      ["listen_timeout", "90001"],
      ["kill_timeout", "10001"],
      ["filter_env", "TOKEN_AI_"],
      ["NODE_APP_INSTANCE", "1"],
      ["pm_out_log_path", "/tmp/attacker.log"],
      ["status", "online"],
      ["version", "0.4.0"],
      ["node_version", "0.0.0"],
      ["unique_id", "not-a-uuid"],
    ];
    for (const [key, value] of cases) {
      const refused = spawnSync(process.execPath, [entrypoint], {
        cwd: candidate.releaseDir,
        env: { ...baseEnv, [key]: value },
        encoding: "utf8",
        timeout: 5_000,
      });
      assert.notEqual(refused.status, 0, key);
      assert.equal(refused.signal, null, key);
      assert.match(
        `${refused.stdout}${refused.stderr}`,
        new RegExp(`opendexter_pm2_runtime_identity_mismatch:${key}`),
        key,
      );
    }

    const missingName = { ...baseEnv };
    delete missingName.name;
    const missing = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env: missingName,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(missing.status, 0);
    assert.match(
      `${missing.stdout}${missing.stderr}`,
      /opendexter_pm2_runtime_identity_mismatch:name/,
    );

    const invented = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env: { ...baseEnv, pm_attacker_config: "enabled" },
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(invented.status, 0);
    assert.match(
      `${invented.stdout}${invented.stderr}`,
      /opendexter_unprotected_application_env:pm_attacker_config/,
    );
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("direct autorestart refuses protected environment bytes swapped after PM2 identity was frozen", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-swap-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  const originalBytes = Buffer.from(
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
  );
  writeFileSync(envFile, originalBytes, { mode: 0o600 });
  const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
  const env = {
    PATH: process.env.PATH,
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
  };
  try {
    const baseline = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(baseline.status, 0, baseline.stderr);

    const swappedBytes = Buffer.from(originalBytes);
    swappedBytes[swappedBytes.length - 2] = "t".charCodeAt(0);
    writeFileSync(envFile, swappedBytes);
    chmodSync(envFile, 0o600);

    const swapped = spawnSync(process.execPath, [entrypoint], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(swapped.status, 0);
    assert.equal(swapped.signal, null);
    assert.match(
      `${swapped.stdout}${swapped.stderr}`,
      /opendexter_protected_env_digest_mismatch/,
    );
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("bootstrap refuses a tampered transitive release byte before importing the application", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-bootstrap-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  const marker = path.join(directory, "application-imported.marker");
  writeFileSync(
    envFile,
    [
      `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}`,
      `PREIMPORT_MARKER_PATH=${marker}`,
    ].join("\n"),
    { mode: 0o600 },
  );
  const bootstrap = path.join(candidate.releaseDir, "production-bootstrap.mjs");
  const env = {
    PATH: process.env.PATH,
    PREIMPORT_MARKER_PATH: marker,
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
  };
  try {
    const clean = spawnSync(process.execPath, [bootstrap], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(readFileSync(marker, "utf8"), "imported");
    rmSync(marker);

    chmodSync(candidate.releaseDir, 0o700);
    chmodSync(path.join(candidate.releaseDir, "lib"), 0o700);
    chmodSync(candidate.transitivePath, 0o600);
    writeFileSync(candidate.transitivePath, "export const transitiveFixture = false;\n");
    chmodSync(candidate.transitivePath, 0o400);
    chmodSync(path.join(candidate.releaseDir, "lib"), 0o500);
    chmodSync(candidate.releaseDir, 0o500);

    const refused = spawnSync(process.execPath, [bootstrap], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(refused.status, 0);
    assert.equal(refused.signal, null);
    assert.match(
      `${refused.stdout}${refused.stderr}`,
      /release file digest mismatch: lib\/transitive-fixture\.mjs/,
    );
    assert.equal(existsSync(marker), false);
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("PM2 fork-wrapper import starts the sealed application", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-pm2-wrapper-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  const marker = path.join(directory, "application-started.marker");
  const wrapper = path.join(directory, "ProcessContainerFork.js");
  const unrelatedImporter = path.join(directory, "unrelated-importer.mjs");
  writeFileSync(
    envFile,
    [
      `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}`,
      `START_MARKER_PATH=${marker}`,
    ].join("\n"),
    { mode: 0o600 },
  );
  writeFileSync(
    wrapper,
    [
      "const { pathToFileURL } = require('node:url');",
      "import(pathToFileURL(process.env.pm_exec_path).href).catch((error) => {",
      "  process.stderr.write(`${error?.stack || error}\\n`);",
      "  process.exitCode = 1;",
      "});",
      "",
    ].join("\n"),
  );
  writeFileSync(
    unrelatedImporter,
    `await import(${JSON.stringify(
      path.join(candidate.releaseDir, "production-bootstrap.mjs"),
    )});\n`,
  );
  const env = {
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
    START_MARKER_PATH: marker,
  };
  try {
    const result = spawnSync(process.execPath, [wrapper], {
      cwd: candidate.releaseDir,
      env,
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(marker, "utf8"), "started");
    rmSync(marker);

    const ignored = spawnSync(process.execPath, [unrelatedImporter], {
      cwd: candidate.releaseDir,
      env: {
        ...env,
        pm_exec_path: path.join(candidate.releaseDir, "direct-entrypoint.mjs"),
      },
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("direct autorestart binds protected secret and API base values to process env", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-values-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  writeFileSync(envFile, [
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}`,
    "DEXTER_API_BASE_URL=https://api.dexter.cash",
  ].join("\n"), { mode: 0o600 });
  const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
  const baseEnv = {
    PATH: process.env.PATH,
    DEXTER_API_BASE_URL: "https://api.dexter.cash",
    ...releaseEnvironment(candidate, "dexter-open-mcp", envFile),
  };
  try {
    for (const fixture of [
      {
        env: {
          ...baseEnv,
          GOVERNED_AGENT_ACTIONS_HMAC_SECRET: "x".repeat(32),
        },
        key: "GOVERNED_AGENT_ACTIONS_HMAC_SECRET",
      },
      {
        env: {
          ...baseEnv,
          DEXTER_API_BASE_URL: "https://attacker.invalid",
        },
        key: "DEXTER_API_BASE_URL",
      },
    ]) {
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: candidate.releaseDir,
        env: fixture.env,
        encoding: "utf8",
        timeout: 5_000,
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.signal, null);
      assert.match(
        `${result.stdout}${result.stderr}`,
        new RegExp(`opendexter_protected_env_value_mismatch:${fixture.key}`),
      );
    }
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("direct autorestart rejects unprotected application config and loader env", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-extra-env-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  writeFileSync(
    envFile,
    `GOVERNED_AGENT_ACTIONS_HMAC_SECRET=${"s".repeat(32)}\n`,
    { mode: 0o600 },
  );
  const entrypoint = path.join(candidate.releaseDir, "direct-entrypoint.mjs");
  const baseEnv = releaseEnvironment(candidate, "dexter-open-mcp", envFile);
  try {
    const cases = [
      {
        env: {
          ...baseEnv,
          DEXTER_API_BASE_URL: "https://attacker.invalid",
        },
        error: /opendexter_unprotected_application_env:DEXTER_API_BASE_URL/,
      },
      ...forbiddenLoaderKeys.map((key) => ({
        env: { ...baseEnv, [key]: "attacker" },
        error: new RegExp(`opendexter_forbidden_loader_env:${key}`),
      })),
    ];
    for (const fixture of cases) {
      const result = spawnSync(process.execPath, [entrypoint], {
        cwd: candidate.releaseDir,
        env: fixture.env,
        encoding: "utf8",
        timeout: 5_000,
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.signal, null);
      assert.match(`${result.stdout}${result.stderr}`, fixture.error);
    }
  } finally {
    removeCandidate(directory, candidate);
  }
});

test("public production entrypoint invokes the shared full release preflight", () => {
  for (const script of ["open-mcp-server.mjs"]) {
    const source = readFileSync(path.join(root, script), "utf8");
    assert.match(
      source,
      /requireSealedOpenReleaseRuntime\(\{/,
      `${script} must not rely on ecosystem-only verification`,
    );
  }
  const ecosystem = readFileSync(path.join(root, "ecosystem.production.cjs"), "utf8");
  assert.match(ecosystem, /readSealedOpenRelease\(__dirname\)/);
  assert.doesNotMatch(ecosystem, /verifyFiles:\s*false/);
  const bootstrap = readFileSync(path.join(root, "production-bootstrap.mjs"), "utf8");
  assert.match(bootstrap, /requireSealedOpenReleaseBootstrap\(\{/);
  assert.match(bootstrap, /await import\(pathToFileURL\(applicationPath\)\.href\)/);
  assert.doesNotMatch(bootstrap, /from ['"]\.\/open-mcp-server\.mjs['"]/);
  assert.doesNotMatch(bootstrap, /from ['"]\.\/http-server-oauth\.mjs['"]/);
});

test("production launcher refuses a group-readable environment file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dexter-mcp-env-"));
  const candidate = createReleaseCandidate(directory);
  const envFile = path.join(directory, "production.env");
  try {
    writeFileSync(envFile, "OPEN_MCP_PORT=3931\n", { mode: 0o600 });
    chmodSync(envFile, 0o640);
    assert.throws(
      () => execFileSync(process.execPath, ["-e", probe(
        path.join(candidate.releaseDir, "ecosystem.production.cjs"),
      )], {
        cwd: candidate.releaseDir,
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
    removeCandidate(directory, candidate);
  }
});
