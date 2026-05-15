import { describe, it, expect } from 'vitest';
import { renderMarketplaceJson } from '../marketplace-json.js';

describe('renderMarketplaceJson', () => {
  it('produces valid JSON with the plugin listed', () => {
    const out = renderMarketplaceJson({ slug: 'blockrun-ai', name: 'Blockrun' });
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.plugins)).toBe(true);
    expect(parsed.plugins.length).toBe(1);
    expect(parsed.plugins[0].name).toBe('blockrun-ai');
    expect(parsed.plugins[0].source).toBe('./plugins/blockrun-ai');
  });

  it('includes marketplace metadata', () => {
    const out = renderMarketplaceJson({ slug: 'blockrun-ai', name: 'Blockrun' });
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('blockrun-ai');
    expect(parsed.owner).toBeDefined();
  });
});
