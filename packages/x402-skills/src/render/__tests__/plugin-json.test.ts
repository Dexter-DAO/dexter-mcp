import { describe, it, expect } from 'vitest';
import { renderPluginJson } from '../plugin-json.js';

describe('renderPluginJson', () => {
  it('produces valid JSON', () => {
    const out = renderPluginJson({ slug: 'blockrun-ai', name: 'Blockrun', description: 'A skill' });
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('includes slug, name, version, and description', () => {
    const out = renderPluginJson({ slug: 'blockrun-ai', name: 'Blockrun', description: 'A skill' });
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('blockrun-ai');
    expect(parsed.displayName ?? parsed.display_name).toBe('Blockrun');
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.description).toBe('A skill');
  });

  it('points skills entries at the skill DIRECTORY, not the SKILL.md file', () => {
    // Anthropic plugin spec: skills[] entries must reference the directory
    // containing SKILL.md, not SKILL.md itself. Otherwise `claude plugin install`
    // fails with "path is a file; expected a directory".
    const out = renderPluginJson({ slug: 'blockrun-ai', name: 'Blockrun', description: 'A skill' });
    const parsed = JSON.parse(out);
    expect(parsed.skills).toEqual(['./skills/blockrun-ai']);
    for (const entry of parsed.skills) {
      expect(entry).not.toMatch(/SKILL\.md$/);
    }
  });
});
