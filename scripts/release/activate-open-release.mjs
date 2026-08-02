#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activateOpenRelease } from './open-release-core.mjs';

const releaseDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

try {
  const result = await activateOpenRelease({ releaseDirectory });
  process.stdout.write(
    `Activated Dexter MCP release ${result.release.provenance.sourceCommit} `
    + 'for dexter-open-mcp only; the private dexter-mcp process is untouched.\n',
  );
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
