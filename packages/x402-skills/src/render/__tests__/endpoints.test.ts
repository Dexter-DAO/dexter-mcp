import { describe, it, expect } from 'vitest';
import { renderEndpointsMd } from '../endpoints.js';
import type { HostManifestEnvelope, HostSkillIndex } from '../../types.js';

const envelope: HostManifestEnvelope = {
  host: 'example.com',
  status: 'ready',
  version_no: 1,
  provenance: 'ai_authored_unreviewed',
  manifest: {
    positioning: 'test',
    capability_clusters: [
      {
        cluster_name: 'Pricing',
        cluster_summary: 'Get prices',
        skill_names: ['fetch-price', 'fetch-history'],
      },
      {
        cluster_name: 'Admin',
        cluster_summary: 'Internal stuff (no skills indexed)',
        skill_names: [],
      },
    ],
  },
};

const skillIndex: HostSkillIndex = {
  ok: true,
  host: 'example.com',
  skill_count: 3,
  skills: [
    {
      skill_name: 'fetch-price',
      display_name: 'Fetch Price',
      one_liner: 'Spot price',
      when_to_use: 'When you want a price',
      price: { amount: '0.01', asset: 'USDC', chain: 'base' },
      network: 'eip155:8453',
      method: 'GET',
      resource_url: 'https://example.com/v1/price',
      version: 1,
      merchant_approved: false,
      verification_status: 'pass',
    },
    {
      skill_name: 'fetch-history',
      display_name: 'Historical Data',
      one_liner: 'Historical prices',
      when_to_use: 'When you want history',
      price: { amount: '0.05', asset: 'USDC', chain: 'base' },
      network: 'eip155:8453',
      method: 'POST',
      resource_url: 'https://example.com/v1/history',
      version: 1,
      merchant_approved: false,
      verification_status: 'pass',
    },
    {
      skill_name: 'orphan-skill',
      display_name: 'Orphan',
      one_liner: 'Not in any cluster',
      when_to_use: 'Edge case',
      price: null,
      network: 'eip155:8453',
      method: 'GET',
      resource_url: 'https://example.com/v1/orphan',
      version: 1,
      merchant_approved: false,
      verification_status: 'pass',
    },
  ],
};

describe('renderEndpointsMd', () => {
  it('lists every skill from the index', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    expect(md).toContain('https://example.com/v1/price');
    expect(md).toContain('https://example.com/v1/history');
    expect(md).toContain('https://example.com/v1/orphan');
  });

  it('shows method and price per skill', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    expect(md).toContain('GET');
    expect(md).toContain('POST');
    expect(md).toContain('0.01 USDC');
    expect(md).toContain('0.05 USDC');
  });

  it('renders "free" for null-priced skills', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    expect(md).toMatch(/orphan-skill[\s\S]*free/i);
  });

  it('groups skills under their owning cluster_name', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    const pricingIdx = md.indexOf('Pricing');
    const fetchPriceIdx = md.indexOf('fetch-price');
    const fetchHistoryIdx = md.indexOf('fetch-history');
    expect(pricingIdx).toBeGreaterThan(-1);
    expect(fetchPriceIdx).toBeGreaterThan(pricingIdx);
    expect(fetchHistoryIdx).toBeGreaterThan(pricingIdx);
  });

  it('omits clusters that have no skills indexed', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    expect(md).not.toContain('## Admin');
  });

  it('puts skills not in any cluster under "Unclustered"', () => {
    const md = renderEndpointsMd(envelope, skillIndex);
    const unclusteredIdx = md.indexOf('Unclustered');
    const orphanIdx = md.indexOf('orphan-skill');
    expect(unclusteredIdx).toBeGreaterThan(-1);
    expect(orphanIdx).toBeGreaterThan(unclusteredIdx);
  });

  it('renders against the real blockrun fixture without throwing', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const realEnvelope = JSON.parse(
      readFileSync(path.join(here, '../../__tests__/fixtures/manifest-blockrun.json'), 'utf8')
    ) as HostManifestEnvelope;
    const realSkills = JSON.parse(
      readFileSync(path.join(here, '../../__tests__/fixtures/skills-blockrun.json'), 'utf8')
    ) as HostSkillIndex;
    const md = renderEndpointsMd(realEnvelope, realSkills);
    expect(md).toContain('blockrun.ai');
    expect(md.length).toBeGreaterThan(200);
  });
});
