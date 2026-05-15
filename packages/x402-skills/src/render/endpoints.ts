import type { HostManifestEnvelope, HostSkill, HostSkillIndex } from '../types.js';

function formatPrice(price: HostSkill['price']): string {
  if (!price) return 'free';
  return `${price.amount} ${price.asset} on ${price.chain}`;
}

function renderSkill(skill: HostSkill): string {
  const lines: string[] = [];
  lines.push(`### ${skill.method} ${skill.resource_url}`);
  lines.push(`**${skill.skill_name}** — ${skill.one_liner}`);
  lines.push('');
  lines.push(`- **When to use:** ${skill.when_to_use}`);
  lines.push(`- **Price:** ${formatPrice(skill.price)}`);
  lines.push(`- **Network:** ${skill.network}`);
  if (skill.not_for) {
    lines.push(`- **Not for:** ${skill.not_for}`);
  }
  if (typeof skill.quality_score === 'number') {
    lines.push(`- **Quality score:** ${skill.quality_score}`);
  }
  lines.push(`- **Verification:** ${skill.verification_status}${skill.merchant_approved ? ' (merchant-approved)' : ''}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Render the endpoints reference markdown for a host, grouping skills by their
 * owning cluster. Skills present in the L2 index but not referenced by any
 * cluster's skill_names get a final "Unclustered" section so nothing is dropped.
 */
export function renderEndpointsMd(
  envelope: HostManifestEnvelope,
  skillIndex: HostSkillIndex
): string {
  const manifest = envelope.manifest!;
  const skillsByName = new Map(skillIndex.skills.map((s) => [s.skill_name, s]));
  const claimed = new Set<string>();

  const sections: string[] = [];
  sections.push(`# Endpoints reference — ${envelope.host}\n`);
  sections.push(
    `This file is auto-generated from \`${envelope.host}\`'s synthesized manifest at v${envelope.version_no} ` +
      `combined with the public skill index (${skillIndex.skill_count} skills).\n`
  );

  for (const cluster of manifest.capability_clusters) {
    const skills = (cluster.skill_names ?? [])
      .map((name) => skillsByName.get(name))
      .filter((s): s is HostSkill => Boolean(s));
    if (skills.length === 0) continue;
    skills.forEach((s) => claimed.add(s.skill_name));
    sections.push(`## ${cluster.cluster_name}\n${cluster.cluster_summary}\n`);
    for (const s of skills) sections.push(renderSkill(s));
  }

  const unclustered = skillIndex.skills.filter((s) => !claimed.has(s.skill_name));
  if (unclustered.length > 0) {
    sections.push('## Unclustered\nSkills present on the host that are not part of any synthesized capability cluster.\n');
    for (const s of unclustered) sections.push(renderSkill(s));
  }

  return sections.join('\n');
}
