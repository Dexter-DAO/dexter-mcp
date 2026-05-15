import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderOutputTemplate } from '../output-template.js';
import { renderReadme } from '../readme.js';
import { renderLicense } from '../license.js';
import type { HostManifestEnvelope } from '../../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const envelope = JSON.parse(
  readFileSync(path.join(here, '../../__tests__/fixtures/manifest-blockrun.json'), 'utf8')
) as HostManifestEnvelope;

describe('renderOutputTemplate', () => {
  it('describes what success looks like', () => {
    const md = renderOutputTemplate(envelope);
    expect(md.toLowerCase()).toContain('output');
    expect(md).toContain(envelope.host);
  });
});

describe('renderReadme', () => {
  it('mentions the slug, host, and how to install', () => {
    const md = renderReadme({ envelope, slug: 'blockrun-ai', name: 'Blockrun' });
    expect(md).toContain('Blockrun');
    expect(md).toContain('blockrun.ai');
    expect(md.toLowerCase()).toMatch(/install/);
  });
});

describe('renderLicense', () => {
  it('returns MIT license text', () => {
    const text = renderLicense();
    expect(text).toContain('MIT License');
    expect(text).toContain('Permission is hereby granted');
  });
});
