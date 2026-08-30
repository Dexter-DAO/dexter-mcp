#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import releaseProvenance from './lib/open-release-provenance.cjs';
import {
  requireSealedOpenReleaseBootstrap,
} from './lib/open-release-runtime-preflight.mjs';

const { APPLICATION_ENTRYPOINTS } = releaseProvenance;
const releaseDir = resolve(dirname(fileURLToPath(import.meta.url)));
const APPLICATION_STARTERS = Object.freeze({
  'dexter-mcp': 'startHttpServer',
  'dexter-open-mcp': 'startOpenMcpServer',
});

export async function startProductionService(env = process.env) {
  const service = env.DEXTER_MCP_RELEASE_SERVICE?.trim() ?? '';
  if (!Object.hasOwn(APPLICATION_ENTRYPOINTS, service)) {
    throw new TypeError('opendexter_release_service_unavailable');
  }
  requireSealedOpenReleaseBootstrap({ releaseDir, service, env });

  // Application modules are intentionally absent from the bootstrap's static
  // import graph. Only authenticated release bytes can reach this import.
  const applicationPath = resolve(releaseDir, APPLICATION_ENTRYPOINTS[service]);
  const application = await import(pathToFileURL(applicationPath).href);
  const start = application[APPLICATION_STARTERS[service]];
  if (typeof start !== 'function') {
    throw new TypeError('opendexter_release_application_unavailable');
  }
  await start();
}

const bootstrapPath = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === bootstrapPath
  : false;
// PM2 fork mode starts ProcessContainerFork.js, which imports the configured
// application instead of placing it in argv[1]. Treat only PM2's exact sealed
// pm_exec_path as launch authority; startProductionService repeats the full
// release, environment, PM2-policy, identity, and roster proof before import.
const isPm2Entrypoint = process.env.pm_exec_path
  ? resolve(process.env.pm_exec_path) === bootstrapPath
  : false;

if (isMainModule || isPm2Entrypoint) await startProductionService();
