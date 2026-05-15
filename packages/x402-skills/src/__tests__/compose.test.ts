import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { composeSkill } from '../compose.js';
import type { HostManifestEnvelope, HostSkillIndex } from '../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestFixture = JSON.parse(
  readFileSync(path.join(here, 'fixtures/manifest-blockrun.json'), 'utf8')
) as HostManifestEnvelope;
const skillIndexFixture = JSON.parse(
  readFileSync(path.join(here, 'fixtures/skills-blockrun.json'), 'utf8')
) as HostSkillIndex;

function mockFetch() {
  // Returns the manifest for /manifest URLs, the index for bare /skills/:host URLs
  (globalThis.fetch as any).mockImplementation(async (url: string) => {
    if (url.endsWith('/manifest')) {
      return { ok: true, status: 200, json: async () => manifestFixture };
    }
    return { ok: true, status: 200, json: async () => skillIndexFixture };
  });
}

describe('composeSkill (v0: single host, stateless)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects multi-host input in v0', async () => {
    await expect(composeSkill({ hosts: ['a.com', 'b.com'] })).rejects.toThrow(/single host/i);
  });

  it('rejects empty hosts array', async () => {
    await expect(composeSkill({ hosts: [] })).rejects.toThrow(/at least one host/i);
  });

  it('produces a bundle with the expected file paths', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain('.claude-plugin/marketplace.json');
    expect(paths).toContain('plugins/blockrun-ai/.claude-plugin/plugin.json');
    expect(paths).toContain('plugins/blockrun-ai/skills/blockrun-ai/SKILL.md');
    expect(paths).toContain('plugins/blockrun-ai/skills/blockrun-ai/references/endpoints.md');
    expect(paths).toContain('plugins/blockrun-ai/skills/blockrun-ai/assets/output-template.md');
    expect(paths).toContain('README.md');
    expect(paths).toContain('LICENSE');
  });

  it('returns hosts_included with provenance + version', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.hosts_included).toHaveLength(1);
    expect(result.hosts_included[0].host).toBe('blockrun.ai');
    expect(result.hosts_included[0].version_no).toBe(manifestFixture.version_no);
    expect(result.hosts_included[0].provenance).toBe(manifestFixture.provenance);
  });

  it('uses a derived slug when skill_name is not provided', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.slug).toBe('blockrun-ai');
  });

  it('respects an explicit skill_name', async () => {
    mockFetch();
    const result = await composeSkill({
      hosts: ['blockrun.ai'],
      skill_name: 'Polymarket Trader Analytics',
    });
    expect(result.slug).toBe('polymarket-trader-analytics');
    expect(result.name).toBe('Polymarket Trader Analytics');
  });

  it('throws when publish:true is provided without a persister (v1 contract)', async () => {
    mockFetch();
    await expect(
      composeSkill({ hosts: ['blockrun.ai'], publish: true })
    ).rejects.toThrow(/persister/i);
  });

  it('produces an installation_instructions string mentioning /skill install', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.installation_instructions).toMatch(/skill install/);
  });

  it('counts paid endpoints in call_count_estimate (skills.length when no workflows)', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.call_count_estimate).toBeGreaterThan(0);
  });

  it('cost_estimate is null when no skills have a price', async () => {
    mockFetch();
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    // blockrun fixture has all skills with price:null currently
    const allFree = skillIndexFixture.skills.every((s) => !s.price);
    if (allFree) {
      expect(result.cost_estimate).toBeNull();
    } else {
      expect(result.cost_estimate).not.toBeNull();
    }
  });
});
