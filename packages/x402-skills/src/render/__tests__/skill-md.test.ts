import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderSkillMd } from '../skill-md.js';
import type { HostManifestEnvelope } from '../../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(here, '../../__tests__/fixtures/manifest-blockrun.json'), 'utf8')
) as HostManifestEnvelope;

describe('renderSkillMd', () => {
  it('emits valid YAML frontmatter with required fields', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    const lines = md.split('\n');
    expect(lines[0]).toBe('---');
    const closing = lines.indexOf('---', 1);
    expect(closing).toBeGreaterThan(1);
    const frontmatter = lines.slice(1, closing).join('\n');
    expect(frontmatter).toContain('name: Blockrun');
    expect(frontmatter).toContain('version: 1.0.0');
    expect(frontmatter).toContain(`pinned_host_version: ${fixture.version_no}`);
    expect(frontmatter).toContain(`host_provenance: ${fixture.provenance}`);
  });

  it('includes the host positioning paragraph in the body', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    expect(md).toContain(fixture.manifest!.positioning);
  });

  it('renders every capability cluster name from cluster_name', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    for (const cluster of fixture.manifest!.capability_clusters) {
      expect(md).toContain(cluster.cluster_name);
    }
  });

  it('renders every workflow_name from cross_skill_workflows when present', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    const workflows = fixture.manifest!.cross_skill_workflows ?? [];
    for (const wf of workflows) {
      expect(md).toContain(wf.workflow_name);
    }
  });

  it('handles a manifest with no cross_skill_workflows (uses ?? [])', () => {
    const envelopeNoWorkflows = {
      ...fixture,
      manifest: { ...fixture.manifest!, cross_skill_workflows: undefined },
    } as HostManifestEnvelope;
    const md = renderSkillMd({
      envelope: envelopeNoWorkflows,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    // Should still render headings and positioning without throwing
    expect(md).toContain('Blockrun');
    expect(md).toContain(fixture.manifest!.positioning);
  });

  it('includes a provenance footer with the x402gle.com host page URL', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    expect(md).toContain('https://x402gle.com/servers/blockrun.ai');
  });

  it('omits the routing_guidance section when not present in manifest', () => {
    const envelopeNoRouting = {
      ...fixture,
      manifest: { ...fixture.manifest!, routing_guidance: undefined },
    } as HostManifestEnvelope;
    const md = renderSkillMd({
      envelope: envelopeNoRouting,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    expect(md).not.toContain('## When to use it');
  });
});
