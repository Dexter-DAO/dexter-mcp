import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchHostManifest } from '../fetch.js';

const FIXTURE: any = {
  host: 'example.com',
  status: 'ready',
  version_no: 3,
  provenance: 'ai_authored',
  manifest: {
    positioning: 'Test host',
    capability_clusters: [],
    workflows: [],
  },
};

describe('fetchHostManifest', () => {
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
      json: async () => FIXTURE,
    });
    await fetchHostManifest('blockrun.ai');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://x402gle.com/api/public/skills/blockrun.ai/manifest',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('honors a custom baseUrl', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE,
    });
    await fetchHostManifest('blockrun.ai', { baseUrl: 'https://staging.x402gle.com' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://staging.x402gle.com/api/public/skills/blockrun.ai/manifest',
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

  it('throws a helpful error when manifest is null', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...FIXTURE, manifest: null }),
    });
    await expect(fetchHostManifest('example.com')).rejects.toThrow(/SKILL_NOT_COMPOSABLE/);
  });
});
