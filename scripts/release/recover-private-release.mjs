#!/usr/bin/env node

import { recoverPrivateRelease } from './open-release-core.mjs';

if (process.argv.length !== 2) {
  process.stderr.write('Usage: npm run recover:mcp:private\n');
  process.exitCode = 2;
} else {
  try {
    const result = await recoverPrivateRelease();
    process.stdout.write(
      `Recovered ${result.service} from the sealed private cutover journal.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
