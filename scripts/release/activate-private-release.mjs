#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activatePrivateRelease } from './open-release-core.mjs';

const releaseDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

try {
  const result = await activatePrivateRelease({ releaseDirectory });
  process.stdout.write(
    `Activated Dexter MCP release ${result.release.provenance.sourceCommit} `
    + 'for dexter-mcp only; dexter-open-mcp stayed on its existing runtime.\n',
  );
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
