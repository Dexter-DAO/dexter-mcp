#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveOpenDexterAcceptedProduction,
  serializeOpenDexterAcceptedProductionReceipt,
  writeFileAtomically,
} from '../lib/open-accepted-production-receipt.mjs';
import {
  deriveOpenDexterSourceContractsForAcceptedProduction,
  materializeOpenToolDescriptorsFromRegistrations,
  OPENDEXTER_ACCEPTED_PRODUCTION_PATH,
  OPENDEXTER_SOURCE_CONTRACTS_PATH,
  OPEN_TOOL_DESCRIPTOR_PATH,
  serializeOpenToolDescriptors,
} from './materialize-open-tool-descriptors.mjs';

export async function prepareOpenDexterAcceptedProduction({
  fetchImpl = globalThis.fetch,
  acceptedProductionPath = OPENDEXTER_ACCEPTED_PRODUCTION_PATH,
  sourceContractsPath = OPENDEXTER_SOURCE_CONTRACTS_PATH,
  descriptorPath = OPEN_TOOL_DESCRIPTOR_PATH,
} = {}) {
  const currentSourceContracts = JSON.parse(
    await readFile(sourceContractsPath, 'utf8'),
  );
  const acceptedProduction = await resolveOpenDexterAcceptedProduction({
    fetchImpl,
  });
  const sourceContracts =
    deriveOpenDexterSourceContractsForAcceptedProduction({
      sourceContracts: currentSourceContracts,
      acceptedProduction,
    });
  const descriptor = await materializeOpenToolDescriptorsFromRegistrations({
    sourceContracts,
    acceptedProduction,
  });

  const outputs = [
    [
      acceptedProductionPath,
      serializeOpenDexterAcceptedProductionReceipt(acceptedProduction),
    ],
    [sourceContractsPath, `${JSON.stringify(sourceContracts, null, 2)}\n`],
    [descriptorPath, serializeOpenToolDescriptors(descriptor)],
  ];
  for (const [path, bytes] of outputs) {
    await writeFileAtomically(path, bytes);
  }
  return Object.freeze({
    acceptedProduction,
    paths: Object.freeze(outputs.map(([path]) => path)),
  });
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    if (process.argv.length !== 2) {
      throw new Error('usage: node scripts/prepare-open-accepted-production.mjs');
    }
    const result = await prepareOpenDexterAcceptedProduction({
      acceptedProductionPath: OPENDEXTER_ACCEPTED_PRODUCTION_PATH,
      sourceContractsPath: OPENDEXTER_SOURCE_CONTRACTS_PATH,
      descriptorPath: OPEN_TOOL_DESCRIPTOR_PATH,
    });
    process.stdout.write(
      `Prepared OpenDexter from accepted API ${result.acceptedProduction.api.sourceCommit} `
      + `and facilitator ${result.acceptedProduction.facilitator.sourceCommit}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
