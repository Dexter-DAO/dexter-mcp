#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import releaseProvenance from './lib/open-release-provenance.cjs';
import {
  requireSealedOpenReleaseBootstrap,
} from './lib/open-release-runtime-preflight.mjs';

const { APPLICATION_ENTRYPOINTS, SERVICE_NAMES } = releaseProvenance;
const releaseDir = resolve(dirname(fileURLToPath(import.meta.url)));

export async function startProductionService(env = process.env) {
  const service = env.DEXTER_MCP_RELEASE_SERVICE?.trim() ?? '';
  if (!SERVICE_NAMES.includes(service)) {
    throw new TypeError('opendexter_release_service_unavailable');
  }
  requireSealedOpenReleaseBootstrap({ releaseDir, service, env });

  // Application modules are intentionally absent from the bootstrap's static
  // import graph. Only authenticated release bytes can reach this import.
  const applicationPath = resolve(releaseDir, APPLICATION_ENTRYPOINTS[service]);
  const application = await import(pathToFileURL(applicationPath).href);
  await application.startOpenMcpServer();
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) await startProductionService();
