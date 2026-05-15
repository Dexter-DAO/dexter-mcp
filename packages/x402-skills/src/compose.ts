import { fetchHostManifest, fetchHostSkills } from './fetch.js';
import { deriveSlug } from './slug.js';
import { renderSkillMd } from './render/skill-md.js';
import { renderEndpointsMd } from './render/endpoints.js';
import { renderOutputTemplate } from './render/output-template.js';
import { renderPluginJson } from './render/plugin-json.js';
import { renderMarketplaceJson } from './render/marketplace-json.js';
import { renderReadme } from './render/readme.js';
import { renderLicense } from './render/license.js';
import type {
  ComposeInput,
  ComposeResult,
  ComposeHostInclusion,
  BundleFile,
  HostManifestEnvelope,
  HostSkillIndex,
} from './types.js';

function defaultNameFromHost(host: string): string {
  // Strip TLD-ish trailing segments for a readable display name.
  // "blockrun.ai" → "Blockrun"; "defi-shield-hazel.vercel.app" → "Defi Shield Hazel"
  const stripped = host.replace(/\.(ai|com|io|xyz|app|dev|net|org|sh)$/i, '');
  const slug = stripped.replace(/[.-]+/g, ' ').trim();
  return slug
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function totalCallCount(envelope: HostManifestEnvelope, skillIndex: HostSkillIndex): number {
  const workflowSteps = (envelope.manifest!.cross_skill_workflows ?? []).reduce(
    (acc, wf) => acc + (wf.steps?.length ?? 0),
    0
  );
  // If no workflow steps defined, fall back to the skill count as an upper bound.
  return workflowSteps > 0 ? workflowSteps : skillIndex.skills.length;
}

function totalCostEstimate(
  skillIndex: HostSkillIndex
): { amount: string; asset: string; chain: string } | null {
  const paid = skillIndex.skills.filter((s) => s.price !== null);
  if (paid.length === 0) return null;
  const asset = paid[0].price!.asset;
  const chain = paid[0].price!.chain;
  const sum = paid.reduce((acc, s) => acc + Number(s.price!.amount), 0);
  return { amount: sum.toFixed(4), asset, chain };
}

export async function composeSkill(input: ComposeInput): Promise<ComposeResult> {
  if (!input.hosts || input.hosts.length === 0) {
    throw new Error('Must provide at least one host');
  }
  if (input.hosts.length > 1) {
    throw new Error('v0 supports a single host only; multi-host composition arrives in v1.');
  }

  const host = input.hosts[0];
  const [envelope, skillIndex] = await Promise.all([
    fetchHostManifest(host, { baseUrl: input.baseUrl }),
    fetchHostSkills(host, { baseUrl: input.baseUrl }),
  ]);

  const name = input.skill_name ?? defaultNameFromHost(host);
  const slug = deriveSlug(input.skill_name ?? host);

  const skillMd = renderSkillMd({ envelope, slug, name });
  const endpointsMd = renderEndpointsMd(envelope, skillIndex);
  const outputTemplate = renderOutputTemplate(envelope);
  const pluginJson = renderPluginJson({ slug, name, description: envelope.manifest!.positioning });
  const marketplaceJson = renderMarketplaceJson({ slug, name });
  const readme = renderReadme({ envelope, slug, name });
  const license = renderLicense();

  const files: BundleFile[] = [
    { path: `plugins/${slug}/skills/${slug}/SKILL.md`, content: skillMd },
    { path: `plugins/${slug}/skills/${slug}/references/endpoints.md`, content: endpointsMd },
    { path: `plugins/${slug}/skills/${slug}/assets/output-template.md`, content: outputTemplate },
    { path: `plugins/${slug}/.claude-plugin/plugin.json`, content: pluginJson },
    { path: `.claude-plugin/marketplace.json`, content: marketplaceJson },
    { path: `README.md`, content: readme },
    { path: `LICENSE`, content: license },
  ];

  const hosts_included: ComposeHostInclusion[] = [
    {
      host: envelope.host,
      version_no: envelope.version_no,
      provenance: envelope.provenance,
    },
  ];

  return {
    slug,
    name,
    files,
    hosts_included,
    cost_estimate: totalCostEstimate(skillIndex),
    call_count_estimate: totalCallCount(envelope, skillIndex),
    installation_instructions:
      `Save the files in this bundle to disk under any directory name, then from inside Claude Code run:\n\n` +
      `  /skill install ./${slug}\n\n` +
      `Or drop the bundle into ~/.claude/skills/ and restart Claude Code. ` +
      `The skill calls paid endpoints on ${envelope.host}; estimated max cost per run is in cost_estimate.`,
  };
}
