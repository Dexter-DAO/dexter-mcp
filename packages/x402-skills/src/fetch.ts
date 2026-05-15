import type { HostManifestEnvelope } from './types.js';

const DEFAULT_BASE_URL = 'https://x402gle.com';

export interface FetchManifestOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Fetch the public host manifest envelope from x402gle.
 *
 * Throws when the HTTP call fails OR when the response has no cached
 * manifest yet (manifest === null). The bug fix on 2026-05-14 means the
 * API serves cached manifests on retry/failed status, so a null manifest
 * indicates the host has genuinely never been synthesized.
 */
export async function fetchHostManifest(
  host: string,
  options: FetchManifestOptions = {}
): Promise<HostManifestEnvelope> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/api/public/skills/${encodeURIComponent(host)}/manifest`;

  const response = await fetch(url, { method: 'GET', signal: options.signal });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed to fetch manifest for "${host}": HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`
    );
  }

  const envelope = (await response.json()) as HostManifestEnvelope;
  if (!envelope.manifest) {
    throw new Error(
      `SKILL_NOT_COMPOSABLE: host "${host}" has no synthesized manifest. ` +
        `Trigger synthesis at ${baseUrl}/servers/${encodeURIComponent(host)}`
    );
  }
  return envelope;
}
