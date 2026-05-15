import type { HostManifestEnvelope } from '../types.js';

export interface RenderReadmeInput {
  envelope: HostManifestEnvelope;
  slug: string;
  name: string;
}

export function renderReadme(input: RenderReadmeInput): string {
  const { envelope, slug, name } = input;
  const manifest = envelope.manifest!;
  return [
    `# ${name}`,
    '',
    `${manifest.positioning}`,
    '',
    `Composed by [x402gle](https://x402gle.com) from \`${envelope.host}\`'s synthesized manifest ` +
      `at v${envelope.version_no} (provenance: ${envelope.provenance}).`,
    '',
    '## Install',
    '',
    'Save this bundle to disk, then from inside Claude Code:',
    '',
    '```',
    `/skill install ./${slug}`,
    '```',
    '',
    'Or drop the bundle into `~/.claude/skills/` and restart Claude Code.',
    '',
    '## What this skill calls',
    '',
    `This skill calls paid endpoints on \`${envelope.host}\`. Endpoint authors' terms apply ` +
      `to the actual API calls. See [SKILL.md](./plugins/${slug}/skills/${slug}/SKILL.md) for ` +
      'the full workflow and [references/endpoints.md](./plugins/' +
      slug +
      `/skills/${slug}/references/endpoints.md) for endpoint details.`,
    '',
    '## License',
    '',
    'The bundle text and boilerplate are MIT-licensed. See `LICENSE`.',
    '',
  ].join('\n');
}
