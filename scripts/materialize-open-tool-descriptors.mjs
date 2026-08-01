#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OPEN_TOOL_DESCRIPTOR_PATH = resolve(
  repositoryRoot,
  'release/open-tool-descriptors.json',
);

async function materializeInIsolatedProcess() {
  const childEnv = {
    ...process.env,
    SENTRY_DSN: '',
    SENTRY_OPEN_MCP_DSN: '',
  };
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'LD_AUDIT',
  ]) {
    delete childEnv[key];
  }
  const { stdout } = await execFileAsync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--emit-json'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      env: childEnv,
    },
  );
  const descriptor = JSON.parse(stdout);
  if (
    descriptor?.schemaVersion !== 1
    || descriptor?.kind !== 'opendexter-hosted-tool-descriptors/v1'
  ) {
    throw new Error('isolated OpenDexter descriptor materializer returned invalid JSON');
  }
  return descriptor;
}

/**
 * Return the exact release descriptor produced by the finalized hosted server
 * registrations. This is the fixed interface consumed by the OpenDexter IDE
 * package verifier; callers must not reconstruct or supplement its schemas.
 */
export async function materializeOpenToolDescriptors() {
  return materializeInIsolatedProcess();
}

export function serializeOpenToolDescriptors(descriptor) {
  return `${JSON.stringify(descriptor, null, 2)}\n`;
}

export async function verifyOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  let actual;
  try {
    actual = readFileSync(descriptorPath, 'utf8');
  } catch (error) {
    throw new Error(
      `OpenDexter tool descriptor is missing at ${descriptorPath}`,
      { cause: error },
    );
  }
  if (actual !== expected) {
    throw new Error(
      'OpenDexter tool descriptor differs from the finalized hosted tools; '
      + 'run npm run generate:open-tool-descriptors and review the exact diff',
    );
  }
  return descriptorPath;
}

export async function writeOpenToolDescriptor({
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
  descriptor,
} = {}) {
  const expected = serializeOpenToolDescriptors(
    descriptor ?? await materializeOpenToolDescriptors(),
  );
  mkdirSync(dirname(descriptorPath), { recursive: true });
  writeFileSync(descriptorPath, expected);
  return descriptorPath;
}

function cliMode(argv) {
  const modes = argv.filter((arg) => arg === '--check' || arg === '--write');
  if (modes.length > 1 || argv.some((arg) => !modes.includes(arg))) {
    throw new Error(
      'usage: node scripts/materialize-open-tool-descriptors.mjs [--check|--write]',
    );
  }
  return modes[0] ?? '--check';
}

async function emitDescriptorJson() {
  const { buildHostedOpenToolDescriptor } = await import(
    '../lib/open-tool-contracts.mjs'
  );
  const { createOpenMcpServer } = await import('../open-mcp-server.mjs');
  const server = createOpenMcpServer({ includeResources: false });
  process.stdout.write(JSON.stringify(buildHostedOpenToolDescriptor(server)));
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    if (process.argv[2] === '--emit-json' && process.argv.length === 3) {
      await emitDescriptorJson();
    } else {
      const mode = cliMode(process.argv.slice(2));
      const descriptorPath = mode === '--write'
        ? await writeOpenToolDescriptor()
        : await verifyOpenToolDescriptor();
      process.stdout.write(
        `${mode === '--write' ? 'Wrote' : 'Verified'} ${descriptorPath}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
