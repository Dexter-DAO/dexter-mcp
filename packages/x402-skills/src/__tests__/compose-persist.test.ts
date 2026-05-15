import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { composeSkill } from '../compose.js';
import type { HostManifestEnvelope, HostSkillIndex, Persister } from '../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestFixture = JSON.parse(
  readFileSync(path.join(here, 'fixtures/manifest-blockrun.json'), 'utf8')
) as HostManifestEnvelope;
const skillIndexFixture = JSON.parse(
  readFileSync(path.join(here, 'fixtures/skills-blockrun.json'), 'utf8')
) as HostSkillIndex;

function mockFetch() {
  (globalThis.fetch as any).mockImplementation(async (url: string) => {
    if (url.endsWith('/manifest')) {
      return { ok: true, status: 200, json: async () => manifestFixture };
    }
    return { ok: true, status: 200, json: async () => skillIndexFixture };
  });
}

describe('composeSkill persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call persister when publish:false', async () => {
    mockFetch();
    const persister = vi.fn();
    const result = await composeSkill({
      hosts: ['blockrun.ai'],
      persister: persister as any,
    });
    expect(persister).not.toHaveBeenCalled();
    expect(result.skill_id).toBeUndefined();
    expect(result.preview_url).toBeUndefined();
  });

  it('calls persister when publish:true and threads result into ComposeResult', async () => {
    mockFetch();
    const persister: Persister = vi.fn().mockResolvedValue({
      skill_id: 'abc-123',
      version_no: 1,
      preview_url: 'https://x402gle.com/skills/branchm/blockrun-ai',
    });
    const result = await composeSkill({
      hosts: ['blockrun.ai'],
      publish: true,
      owner_handle: 'branchm',
      composer_kind: 'user_authored',
      composer_id: 'supabase-uuid-xyz',
      visibility: 'public',
      persister,
    });
    expect(persister).toHaveBeenCalledTimes(1);
    expect(persister).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_handle: 'branchm',
        slug: 'blockrun-ai',
        composer_kind: 'user_authored',
        composer_id: 'supabase-uuid-xyz',
        visibility: 'public',
      })
    );
    expect(result.skill_id).toBe('abc-123');
    expect(result.preview_url).toBe('https://x402gle.com/skills/branchm/blockrun-ai');
    expect(result.version_no).toBe(1);
  });

  it('throws when publish:true but persister is not provided', async () => {
    mockFetch();
    await expect(
      composeSkill({
        hosts: ['blockrun.ai'],
        publish: true,
        owner_handle: 'branchm',
      })
    ).rejects.toThrow(/persister/i);
  });

  it('throws when publish:true but owner_handle is not provided', async () => {
    mockFetch();
    const persister: Persister = vi.fn();
    await expect(
      composeSkill({
        hosts: ['blockrun.ai'],
        publish: true,
        persister,
      })
    ).rejects.toThrow(/owner_handle/i);
  });
});
