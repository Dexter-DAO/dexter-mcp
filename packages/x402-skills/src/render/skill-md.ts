import yaml from 'js-yaml';
import type { HostManifestEnvelope } from '../types.js';

export interface RenderSkillMdInput {
  envelope: HostManifestEnvelope;
  slug: string;
  name: string;
  authoredAt?: string; // ISO timestamp; defaults to now
}

export function renderSkillMd(input: RenderSkillMdInput): string {
  const { envelope, slug, name } = input;
  const manifest = envelope.manifest!;
  const authoredAt = input.authoredAt ?? new Date().toISOString();

  const frontmatter = yaml.dump(
    {
      name,
      version: '1.0.0',
      description: manifest.positioning,
      authored_by: 'x402gle',
      authored_at: authoredAt,
      pinned_host_version: envelope.version_no,
      host_provenance: envelope.provenance,
      host: envelope.host,
      slug,
    },
    { lineWidth: 100 }
  );

  const sections: string[] = [];
  sections.push(`---\n${frontmatter}---\n`);
  sections.push(`# ${name}\n`);
  sections.push(`${manifest.positioning}\n`);

  sections.push(`## What this skill does\n${manifest.host_overview ?? manifest.positioning}\n`);

  if (manifest.routing_guidance) {
    sections.push(`## When to use it\n${manifest.routing_guidance}\n`);
  }

  const workflows = manifest.cross_skill_workflows ?? [];
  if (workflows.length > 0) {
    sections.push('## Workflows\n');
    for (const wf of workflows) {
      sections.push(`### ${wf.workflow_name}\n${wf.when_to_use}\n`);
      if (wf.steps && wf.steps.length > 0) {
        sections.push('Steps:');
        wf.steps.forEach((step, idx) => {
          sections.push(`${idx + 1}. **${step.skill_name}** — ${step.description}`);
        });
        sections.push('');
      }
    }
  }

  if (manifest.capability_clusters.length > 0) {
    sections.push('## Capabilities\n');
    for (const cluster of manifest.capability_clusters) {
      const skillCount = cluster.skill_names?.length ?? 0;
      sections.push(`- **${cluster.cluster_name}**`);
      sections.push(`  ${cluster.cluster_summary}`);
      if (skillCount > 0) {
        sections.push(`  Skills: ${cluster.skill_names.join(', ')}`);
      }
    }
    sections.push('');
  }

  sections.push(
    `## Provenance\nThis skill was synthesized by x402gle from \`${envelope.host}\`'s manifest at v${envelope.version_no} (provenance: ${envelope.provenance}).\n` +
      `Current host manifest: https://x402gle.com/servers/${envelope.host}\n`
  );

  return sections.join('\n');
}
