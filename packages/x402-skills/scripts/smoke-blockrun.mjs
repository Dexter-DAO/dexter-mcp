#!/usr/bin/env node
// Smoke test: compose a real bundle from blockrun.ai's live manifest,
// write to /tmp/blockrun-skill-bundle/, print a summary.

import { composeSkill } from '../dist/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = '/tmp/blockrun-skill-bundle';

async function main() {
  console.log('→ composing blockrun.ai...');
  const result = await composeSkill({ hosts: ['blockrun.ai'] });

  console.log(`  slug: ${result.slug}`);
  console.log(`  name: ${result.name}`);
  console.log(`  files: ${result.files.length}`);
  console.log(`  cost_estimate: ${JSON.stringify(result.cost_estimate)}`);
  console.log(`  call_count_estimate: ${result.call_count_estimate}`);
  console.log(`  hosts_included:`);
  for (const h of result.hosts_included) {
    console.log(`    - ${h.host} v${h.version_no} (${h.provenance})`);
  }

  console.log(`\n→ writing bundle to ${OUT_DIR}/`);
  for (const f of result.files) {
    const dest = path.join(OUT_DIR, f.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, f.content, 'utf8');
    console.log(`  ${f.path}`);
  }
  console.log('\n✓ smoke test complete');
}

main().catch((err) => {
  console.error('✗ smoke test failed:', err);
  process.exit(1);
});
