import type { HostManifestEnvelope } from '../types.js';

export function renderOutputTemplate(envelope: HostManifestEnvelope): string {
  const manifest = envelope.manifest!;
  const lines: string[] = [];
  lines.push(`# Expected output — ${envelope.host}\n`);
  lines.push(
    'This skill returns the response shape of the final endpoint in its workflow. The exact ' +
      'shape depends on which capability cluster the workflow exercises.\n'
  );
  const workflows = manifest.cross_skill_workflows ?? [];
  if (workflows.length > 0) {
    lines.push('## Workflows in this skill\n');
    for (const wf of workflows) {
      lines.push(`- **${wf.workflow_name}** — ${wf.when_to_use}`);
    }
    lines.push('');
  }
  lines.push(
    `For per-endpoint response details, see [references/endpoints.md](../references/endpoints.md) ` +
      `or the live host page at https://x402gle.com/servers/${envelope.host}.`
  );
  return lines.join('\n');
}
