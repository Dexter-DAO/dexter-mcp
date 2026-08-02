export const OPEN_RELEASE_INSTALL_ARGS = Object.freeze([
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
]);

export const OPEN_RELEASE_FINALIZATION_SCRIPTS = Object.freeze([
  'studio:setup',
  'build:runtime-workspaces',
  'typecheck:open-release',
  'build:apps-sdk:local',
  'verify:release:runtime',
  'verify:release:lock',
  'verify:release:installed',
]);

/**
 * Install and finalize the exact archived OpenDexter release graph before any
 * tools/list descriptor is emitted or attested. Descriptor generation and the
 * immutable release builder must call this one sequence so widget content
 * hashes cannot depend on which release path ran first.
 */
export async function runOpenReleaseFinalization({ runNpm, options }) {
  if (typeof runNpm !== 'function') {
    throw new TypeError('OpenDexter release finalization requires runNpm');
  }
  await runNpm([...OPEN_RELEASE_INSTALL_ARGS], options);
  for (const script of OPEN_RELEASE_FINALIZATION_SCRIPTS) {
    await runNpm(['run', script], options);
  }
}
