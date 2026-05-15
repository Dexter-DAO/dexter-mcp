export interface RenderPluginJsonInput {
  slug: string;
  name: string;
  description: string;
}

export function renderPluginJson(input: RenderPluginJsonInput): string {
  const payload = {
    name: input.slug,
    displayName: input.name,
    version: '1.0.0',
    description: input.description,
    author: {
      name: 'x402gle',
      url: 'https://x402gle.com',
    },
    skills: [`./skills/${input.slug}/SKILL.md`],
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
