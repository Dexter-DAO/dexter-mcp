import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHostManifest, fetchHostSkills } from '../fetch.js';

const FIXTURE: any = {
  host: 'example.com',
  status: 'ready',
  version_no: 3,
  provenance: 'ai_authored_unreviewed',
  manifest: {
    positioning: 'Test host',
    capability_clusters: [],
    cross_skill_workflows: [],
  },
};

const SKILLS_FIXTURE: any = {
  ok: true,
  host: 'example.com',
  skill_count: 2,
  skills: [
    {
      skill_name: 'fetch-price',
      display_name: 'Fetch Price',
      one_liner: 'Get a price',
      when_to_use: 'When you want a price',
      confidence: 'high',
      price: { amount: '0.01', asset: 'USDC', chain: 'base' },
      network: 'eip155:8453',
      method: 'GET',
      resource_url: 'https://example.com/v1/price',
      version: 1,
      merchant_approved: false,
      verification_status: 'pass',
    },
  ],
};

describe('fetchHostManifest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the correct URL with default base (api.dexter.cash)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE,
    });
    await fetchHostManifest('blockrun.ai');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.dexter.cash/api/public/skills/blockrun.ai/manifest',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('honors a custom baseUrl', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE,
    });
    await fetchHostManifest('blockrun.ai', { baseUrl: 'https://staging.api.dexter.cash' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://staging.api.dexter.cash/api/public/skills/blockrun.ai/manifest',
      expect.anything()
    );
  });

  it('URL-encodes hosts with special characters', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE,
    });
    await fetchHostManifest('host:with/slashes');
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain(encodeURIComponent('host:with/slashes'));
  });

  it('returns the parsed envelope on success', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE,
    });
    const result = await fetchHostManifest('example.com');
    expect(result.host).toBe('example.com');
    expect(result.manifest?.positioning).toBe('Test host');
  });

  it('throws with HTTP status on non-2xx', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });
    await expect(fetchHostManifest('nope.com')).rejects.toThrow(/404/);
  });

  it('throws SKILL_NOT_COMPOSABLE with x402gle.com synthesis link when manifest is null', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...FIXTURE, manifest: null }),
    });
    await expect(fetchHostManifest('example.com')).rejects.toThrow(/SKILL_NOT_COMPOSABLE/);
    await expect(fetchHostManifest('example.com')).rejects.toThrow(/x402gle\.com\/servers\/example\.com/);
  });
});

describe('fetchHostSkills', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the correct URL with default base', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SKILLS_FIXTURE,
    });
    await fetchHostSkills('blockrun.ai');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.dexter.cash/api/public/skills/blockrun.ai',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns the parsed skill index', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SKILLS_FIXTURE,
    });
    const result = await fetchHostSkills('example.com');
    expect(result.skill_count).toBe(2);
    expect(result.skills[0].resource_url).toBe('https://example.com/v1/price');
  });

  it('throws with HTTP status on non-2xx', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'upstream unavailable',
    });
    await expect(fetchHostSkills('flaky.com')).rejects.toThrow(/503/);
  });
});
