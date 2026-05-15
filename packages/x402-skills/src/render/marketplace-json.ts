export interface RenderMarketplaceJsonInput {
  slug: string;
  name: string;
}

export function renderMarketplaceJson(input: RenderMarketplaceJsonInput): string {
  const payload = {
    name: input.slug,
    displayName: input.name,
    owner: {
      name: 'x402gle',
      url: 'https://x402gle.com',
    },
    plugins: [
      {
        name: input.slug,
        source: `./plugins/${input.slug}`,
      },
    ],
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
