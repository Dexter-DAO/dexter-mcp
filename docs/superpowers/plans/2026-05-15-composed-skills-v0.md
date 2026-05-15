# Composed Skills v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `x402_compose_skill` — a new MCP tool on `dexter-open-mcp` that takes a single x402gle host slug and returns an installable Claude Code skill bundle (Anthropic plugin spec envelope, content rendered from the host's synthesized manifest), with all primitives in a new `@dexterai/x402-skills@1.0.0` workspace package.

**Architecture:** New TypeScript workspace package under `dexter-mcp/packages/x402-skills/` exporting a `composeSkill()` primitive that (1) fetches the host manifest over public HTTP from `https://x402gle.com/api/public/skills/:host/manifest`, (2) renders the bundle file-by-file from the manifest using pure functions, (3) returns `{ slug, name, files: [{path, content}], hosts_included, cost_estimate, call_count_estimate, installation_instructions }` for the MCP layer to wrap. The MCP tool is registered in `open-mcp-server.mjs` alongside `x402_search`. The package is consumed via workspace symlink — no npm publish is required for v0.

**Tech Stack:** TypeScript 5.7, tsup (bundling), Node ≥18, vitest (tests), zod (MCP input schema), js-yaml (frontmatter rendering). All matching what `packages/x402-core` already uses.

**Reference spec:** `docs/superpowers/specs/2026-05-15-composed-skills-design.md`

---

## File Structure

### New package: `packages/x402-skills/`

| File | Responsibility |
|---|---|
| `package.json` | Package metadata, scripts matching x402-core |
| `tsconfig.json` | TypeScript config matching x402-core |
| `tsup.config.ts` | Bundler config matching x402-core |
| `vitest.config.ts` | Test config |
| `README.md` | Package description + usage |
| `src/index.ts` | Public exports |
| `src/types.ts` | `HostManifest`, `ComposeInput`, `ComposeResult`, `BundleFile` |
| `src/fetch.ts` | `fetchHostManifest(host, baseUrl?)` — public HTTP client |
| `src/slug.ts` | `deriveSlug(input)` — host or skill_name → kebab-case ASCII |
| `src/compose.ts` | `composeSkill(input)` — orchestrator |
| `src/render/skill-md.ts` | `renderSkillMd(manifest, opts)` — main SKILL.md from manifest |
| `src/render/endpoints.ts` | `renderEndpointsMd(manifest)` — references/endpoints.md |
| `src/render/output-template.ts` | `renderOutputTemplate(manifest)` — assets/output-template.md |
| `src/render/plugin-json.ts` | `renderPluginJson(slug, name, description)` — plugins/<slug>/.claude-plugin/plugin.json |
| `src/render/marketplace-json.ts` | `renderMarketplaceJson(slug, name)` — .claude-plugin/marketplace.json |
| `src/render/readme.ts` | `renderReadme(manifest, slug)` — top-level README.md |
| `src/render/license.ts` | `renderLicense()` — MIT |
| `src/render/__tests__/skill-md.test.ts` | Unit tests for SKILL.md rendering |
| `src/render/__tests__/endpoints.test.ts` | Unit tests for endpoints rendering |
| `src/render/__tests__/plugin-json.test.ts` | Unit tests for plugin.json shape |
| `src/render/__tests__/marketplace-json.test.ts` | Unit tests for marketplace.json shape |
| `src/__tests__/slug.test.ts` | Slug derivation tests |
| `src/__tests__/compose.test.ts` | End-to-end compose integration (uses fixture manifest) |
| `src/__tests__/fixtures/manifest-blockrun.json` | Saved snapshot of `blockrun.ai`'s real manifest, for offline tests |

### Modified files at repo root

| File | Change |
|---|---|
| `package.json` | Add `"workspaces": ["packages/*"]` if missing; add `@dexterai/x402-skills` to deps via `file:./packages/x402-skills` |
| `open-mcp-server.mjs` | Import composeSkill, register `x402_compose_skill` tool around line 1190 |

---

## Task 1: Scaffold the package

**Files:**
- Create: `packages/x402-skills/package.json`
- Create: `packages/x402-skills/tsconfig.json`
- Create: `packages/x402-skills/tsup.config.ts`
- Create: `packages/x402-skills/vitest.config.ts`
- Create: `packages/x402-skills/README.md`
- Create: `packages/x402-skills/src/index.ts` (empty placeholder)

- [ ] **Step 1: Create `packages/x402-skills/package.json`**

```json
{
  "name": "@dexterai/x402-skills",
  "version": "1.0.0",
  "description": "Compose Claude Code skill bundles from x402gle host manifests. Generates Anthropic-spec plugin bundles (plugin.json, marketplace.json, SKILL.md, references) from any host's synthesized manifest.",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup && tsc --emitDeclarationOnly --outDir dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "tsup": "^8.5.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "@types/js-yaml": "^4.0.9"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": [
    "x402",
    "dexter",
    "x402gle",
    "claude-code",
    "skills",
    "mcp",
    "opendexter"
  ],
  "author": "Dexter",
  "license": "MIT"
}
```

- [ ] **Step 2: Create `packages/x402-skills/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/x402-skills/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  minify: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  target: 'es2022',
});
```

- [ ] **Step 4: Create `packages/x402-skills/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `packages/x402-skills/README.md`**

```markdown
# @dexterai/x402-skills

Compose Claude Code skill bundles from x402gle host manifests.

This package generates Anthropic-spec plugin bundles (plugin.json, marketplace.json, SKILL.md, references) from any host's synthesized manifest on x402gle.com. The output is an array of `{ path, content }` files that can be written to disk and installed via `/skill install`.

## Usage

```ts
import { composeSkill } from '@dexterai/x402-skills';

const result = await composeSkill({ hosts: ['blockrun.ai'] });
// result.files: [{ path: 'plugins/blockrun-ai/skills/blockrun-ai/SKILL.md', content: '...' }, ...]
```

## v0 scope

- Single host only (`hosts: [oneHost]`)
- Stateless (`publish: false`)
- Fetches manifests via public HTTP from `x402gle.com`

See `docs/superpowers/specs/2026-05-15-composed-skills-design.md` for the full design and v3 roadmap.
```

- [ ] **Step 6: Create `packages/x402-skills/src/index.ts` as a placeholder**

```ts
export {};
```

- [ ] **Step 7: Verify root `package.json` has the `workspaces` field and add the new package as a dep**

Run: `cat package.json | python3 -c "import json,sys; p=json.load(sys.stdin); print('workspaces:', p.get('workspaces')); print('has x402-skills:', '@dexterai/x402-skills' in p.get('dependencies', {}))"`

If `workspaces` is None, add this to `package.json` after the `"private"` line:

```json
  "workspaces": ["packages/*"],
```

Then add `"@dexterai/x402-skills": "file:./packages/x402-skills"` to `dependencies`, alphabetically between `@dexterai/x402-core` and `@dexterai/x402-mcp-tools`.

- [ ] **Step 8: Install workspace dependencies**

Run: `npm install`
Expected: completes without errors. Verify with: `ls node_modules/@dexterai/x402-skills` — should show a symlink to `../../../packages/x402-skills`.

- [ ] **Step 9: Verify the package builds (empty content)**

Run: `cd packages/x402-skills && npm run build`
Expected: `dist/index.js` and `dist/index.d.ts` are created. No errors.

- [ ] **Step 10: Commit**

```bash
git add packages/x402-skills/ package.json package-lock.json
git commit -m "feat(x402-skills): scaffold @dexterai/x402-skills@1.0.0 workspace package"
```

---

## Task 2: Types and slug derivation

**Files:**
- Create: `packages/x402-skills/src/types.ts`
- Create: `packages/x402-skills/src/slug.ts`
- Create: `packages/x402-skills/src/__tests__/slug.test.ts`

- [ ] **Step 1: Create `packages/x402-skills/src/types.ts`**

```ts
// Subset of x402gle's HostManifest response shape we actually need to render bundles.
// Full manifest shape lives in dexter-api; we only declare what we read.
// Reference: https://x402gle.com/api/public/skills/:host/manifest

export type HostManifestProvenance = 'merchant_reviewed' | 'merchant_edited' | 'ai_authored';
export type HostManifestStatus = 'ready' | 'generating' | 'failed';

export interface HostManifestWorkflow {
  name: string;
  description: string;
  steps: string[];
}

export interface HostManifestCluster {
  name: string;
  description: string;
  endpoints?: HostManifestEndpoint[];
  price?: { amount: string; asset: string; chain: string } | null;
}

export interface HostManifestEndpoint {
  url: string;
  method?: string;
  description?: string;
  inputSchema?: unknown;
  price?: { amount: string; asset: string; chain: string } | null;
  authMode?: string;
}

export interface HostManifestPayload {
  positioning: string;
  host_overview?: string;
  routing_guidance?: string;
  capability_clusters: HostManifestCluster[];
  workflows: HostManifestWorkflow[];
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface HostManifestEnvelope {
  host: string;
  status: HostManifestStatus;
  version_no: number;
  provenance: HostManifestProvenance;
  manifest: HostManifestPayload | null;
  // free-form fields we tolerate but do not require
  [key: string]: unknown;
}

export interface ComposeInput {
  hosts: string[];          // v0: exactly one
  skill_name?: string;      // optional override; otherwise derived from host
  publish?: boolean;        // v0: ignored (always false)
  baseUrl?: string;         // optional override for tests; defaults to https://x402gle.com
}

export interface BundleFile {
  path: string;
  content: string;
}

export interface ComposeHostInclusion {
  host: string;
  version_no: number;
  provenance: HostManifestProvenance;
}

export interface ComposeResult {
  slug: string;
  name: string;
  files: BundleFile[];
  hosts_included: ComposeHostInclusion[];
  cost_estimate: { amount: string; asset: string; chain: string } | null;
  call_count_estimate: number;
  installation_instructions: string;
}
```

- [ ] **Step 2: Write failing test `packages/x402-skills/src/__tests__/slug.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { deriveSlug } from '../slug.js';

describe('deriveSlug', () => {
  it('lowercases', () => {
    expect(deriveSlug('BlockRun.AI')).toBe('blockrun-ai');
  });
  it('replaces non-alphanumeric runs with single hyphen', () => {
    expect(deriveSlug('defi-shield-hazel.vercel.app')).toBe('defi-shield-hazel-vercel-app');
  });
  it('strips leading and trailing hyphens', () => {
    expect(deriveSlug('--foo--bar--')).toBe('foo-bar');
  });
  it('truncates to 64 chars', () => {
    const long = 'a'.repeat(100);
    expect(deriveSlug(long).length).toBe(64);
  });
  it('keeps existing kebab-case unchanged', () => {
    expect(deriveSlug('research-and-narrate')).toBe('research-and-narrate');
  });
  it('handles unicode by stripping to ascii', () => {
    expect(deriveSlug('café-é.test')).toBe('caf-test');
  });
  it('throws on empty input after normalization', () => {
    expect(() => deriveSlug('!!!')).toThrow(/slug/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/slug.test.ts`
Expected: FAIL with "Cannot find module '../slug.js'" or similar.

- [ ] **Step 4: Create `packages/x402-skills/src/slug.ts`**

```ts
const MAX_SLUG_LENGTH = 64;

/**
 * Normalize an arbitrary string (a host name or a user-supplied skill_name) into
 * a kebab-case ASCII slug suitable for filesystem paths and URL segments.
 *
 * Rules: lowercase, strip non-ASCII, replace any run of non-alphanumeric
 * characters with a single hyphen, trim leading/trailing hyphens, truncate to
 * 64 chars (and trim again after truncation).
 *
 * Throws if the normalized result is empty.
 */
export function deriveSlug(input: string): string {
  const ascii = input.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const lower = ascii.toLowerCase();
  const hyphenated = lower.replace(/[^a-z0-9]+/g, '-');
  const trimmed = hyphenated.replace(/^-+|-+$/g, '');
  const truncated = trimmed.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  if (!truncated) {
    throw new Error(`Cannot derive slug from input: "${input}"`);
  }
  return truncated;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/slug.test.ts`
Expected: PASS — 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/x402-skills/src/types.ts packages/x402-skills/src/slug.ts packages/x402-skills/src/__tests__/slug.test.ts
git commit -m "feat(x402-skills): add HostManifest types and deriveSlug helper"
```

---

## Task 3: Manifest fetch over public HTTP

**Files:**
- Create: `packages/x402-skills/src/fetch.ts`
- Create: `packages/x402-skills/src/__tests__/fetch.test.ts`

- [ ] **Step 1: Write failing test `packages/x402-skills/src/__tests__/fetch.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/fetch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/x402-skills/src/fetch.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/fetch.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/x402-skills/src/fetch.ts packages/x402-skills/src/__tests__/fetch.test.ts
git commit -m "feat(x402-skills): add fetchHostManifest HTTP client"
```

---

## Task 4: Save a real `blockrun.ai` manifest as a test fixture

**Files:**
- Create: `packages/x402-skills/src/__tests__/fixtures/manifest-blockrun.json`

- [ ] **Step 1: Pull the live manifest from x402gle**

Run:
```bash
curl -s https://x402gle.com/api/public/skills/blockrun.ai/manifest > packages/x402-skills/src/__tests__/fixtures/manifest-blockrun.json
```
Then verify:
```bash
node -e "const m=require('./packages/x402-skills/src/__tests__/fixtures/manifest-blockrun.json'); console.log('status:', m.status, 'clusters:', m.manifest?.capability_clusters?.length, 'workflows:', m.manifest?.workflows?.length)"
```
Expected: prints `status: ready clusters: 6 workflows: 3` (or whatever the live values are — record what you actually got).

- [ ] **Step 2: Sanity-check the fixture is well-formed**

```bash
node -e "
const m = require('./packages/x402-skills/src/__tests__/fixtures/manifest-blockrun.json');
if (!m.manifest) throw new Error('null manifest');
if (!m.manifest.positioning) throw new Error('no positioning');
if (!Array.isArray(m.manifest.capability_clusters)) throw new Error('no clusters');
console.log('fixture OK');
"
```
Expected: prints `fixture OK`.

- [ ] **Step 3: Commit**

```bash
git add packages/x402-skills/src/__tests__/fixtures/manifest-blockrun.json
git commit -m "test(x402-skills): add blockrun.ai manifest fixture for offline tests"
```

---

## Task 5: Render SKILL.md from manifest

**Files:**
- Create: `packages/x402-skills/src/render/skill-md.ts`
- Create: `packages/x402-skills/src/render/__tests__/skill-md.test.ts`

- [ ] **Step 1: Write failing test `packages/x402-skills/src/render/__tests__/skill-md.test.ts`**

```ts
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

  it('renders every capability cluster name', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    for (const cluster of fixture.manifest!.capability_clusters) {
      expect(md).toContain(cluster.name);
    }
  });

  it('renders every workflow name', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    for (const wf of fixture.manifest!.workflows) {
      expect(md).toContain(wf.name);
    }
  });

  it('includes a provenance footer with the host URL', () => {
    const md = renderSkillMd({
      envelope: fixture,
      slug: 'blockrun-ai',
      name: 'Blockrun',
    });
    expect(md).toContain('https://x402gle.com/servers/blockrun.ai');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/skill-md.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/x402-skills/src/render/skill-md.ts`**

```ts
import yaml from 'js-yaml';
import type { HostManifestEnvelope } from '../types.js';

export interface RenderSkillMdInput {
  envelope: HostManifestEnvelope;
  slug: string;
  name: string;
  authoredAt?: string; // ISO timestamp; defaults to now
}

export function renderSkillMd(input: RenderSkillMdInput): string {
  const { envelope, slug, name } = input;
  const manifest = envelope.manifest!;
  const authoredAt = input.authoredAt ?? new Date().toISOString();

  const frontmatter = yaml.dump(
    {
      name,
      version: '1.0.0',
      description: manifest.positioning,
      authored_by: 'x402gle',
      authored_at: authoredAt,
      pinned_host_version: envelope.version_no,
      host_provenance: envelope.provenance,
      host: envelope.host,
      slug,
    },
    { lineWidth: 100 }
  );

  const sections: string[] = [];
  sections.push(`---\n${frontmatter}---\n`);
  sections.push(`# ${name}\n`);

  sections.push(`## What this skill does\n${manifest.host_overview ?? manifest.positioning}\n`);

  if (manifest.routing_guidance) {
    sections.push(`## When to use it\n${manifest.routing_guidance}\n`);
  }

  if (manifest.workflows.length > 0) {
    sections.push('## Workflow\n');
    for (const wf of manifest.workflows) {
      sections.push(`### ${wf.name}\n${wf.description}\n`);
      if (wf.steps && wf.steps.length > 0) {
        sections.push('Steps:');
        wf.steps.forEach((step, idx) => sections.push(`${idx + 1}. ${step}`));
        sections.push('');
      }
    }
  }

  if (manifest.capability_clusters.length > 0) {
    sections.push('## Capabilities\n');
    for (const cluster of manifest.capability_clusters) {
      const endpointCount = cluster.endpoints?.length ?? 0;
      const priceLine =
        cluster.price ? ` — ${cluster.price.amount} ${cluster.price.asset} on ${cluster.price.chain}` : '';
      sections.push(`- **${cluster.name}**${priceLine}\n  ${cluster.description}`);
      if (endpointCount > 0) sections.push(`  Endpoints: ${endpointCount}`);
    }
    sections.push('');
  }

  sections.push(
    `## Provenance\nThis skill was synthesized by x402gle from \`${envelope.host}\`'s manifest at v${envelope.version_no}.\n` +
      `Current host manifest: https://x402gle.com/servers/${envelope.host}\n`
  );

  return sections.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/skill-md.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/x402-skills/src/render/skill-md.ts packages/x402-skills/src/render/__tests__/skill-md.test.ts
git commit -m "feat(x402-skills): render SKILL.md from host manifest"
```

---

## Task 6: Render `references/endpoints.md`

**Files:**
- Create: `packages/x402-skills/src/render/endpoints.ts`
- Create: `packages/x402-skills/src/render/__tests__/endpoints.test.ts`

- [ ] **Step 1: Write failing test `packages/x402-skills/src/render/__tests__/endpoints.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderEndpointsMd } from '../endpoints.js';
import type { HostManifestEnvelope } from '../../types.js';

const envelope: HostManifestEnvelope = {
  host: 'example.com',
  status: 'ready',
  version_no: 1,
  provenance: 'ai_authored',
  manifest: {
    positioning: 'test',
    capability_clusters: [
      {
        name: 'Pricing',
        description: 'Get prices',
        endpoints: [
          {
            url: 'https://example.com/v1/price',
            method: 'GET',
            description: 'Spot price',
            price: { amount: '0.01', asset: 'USDC', chain: 'base' },
            authMode: 'x402',
          },
          {
            url: 'https://example.com/v1/history',
            method: 'POST',
            description: 'Historical data',
            price: { amount: '0.05', asset: 'USDC', chain: 'base' },
          },
        ],
      },
      {
        name: 'Admin',
        description: 'Internal',
        endpoints: [],
      },
    ],
    workflows: [],
  },
};

describe('renderEndpointsMd', () => {
  it('lists every endpoint from every cluster', () => {
    const md = renderEndpointsMd(envelope);
    expect(md).toContain('https://example.com/v1/price');
    expect(md).toContain('https://example.com/v1/history');
  });

  it('shows method and price per endpoint', () => {
    const md = renderEndpointsMd(envelope);
    expect(md).toContain('GET');
    expect(md).toContain('POST');
    expect(md).toContain('0.01 USDC');
    expect(md).toContain('0.05 USDC');
  });

  it('groups by cluster name', () => {
    const md = renderEndpointsMd(envelope);
    const pricingIdx = md.indexOf('Pricing');
    const priceUrlIdx = md.indexOf('https://example.com/v1/price');
    expect(pricingIdx).toBeGreaterThan(-1);
    expect(priceUrlIdx).toBeGreaterThan(pricingIdx);
  });

  it('does not include clusters with no endpoints', () => {
    const md = renderEndpointsMd(envelope);
    expect(md).not.toContain('## Admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/endpoints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/x402-skills/src/render/endpoints.ts`**

```ts
import type { HostManifestEnvelope } from '../types.js';

export function renderEndpointsMd(envelope: HostManifestEnvelope): string {
  const manifest = envelope.manifest!;
  const lines: string[] = [];
  lines.push(`# Endpoints reference — ${envelope.host}\n`);
  lines.push(
    `This file is auto-generated from \`${envelope.host}\`'s synthesized manifest at v${envelope.version_no}.\n`
  );

  for (const cluster of manifest.capability_clusters) {
    if (!cluster.endpoints || cluster.endpoints.length === 0) continue;
    lines.push(`## ${cluster.name}\n${cluster.description}\n`);
    for (const ep of cluster.endpoints) {
      const method = ep.method ?? 'GET';
      const priceLabel = ep.price ? `${ep.price.amount} ${ep.price.asset} on ${ep.price.chain}` : 'free';
      lines.push(`### ${method} ${ep.url}`);
      if (ep.description) lines.push(ep.description);
      lines.push(`- **Price:** ${priceLabel}`);
      if (ep.authMode) lines.push(`- **Auth:** ${ep.authMode}`);
      if (ep.inputSchema && typeof ep.inputSchema === 'object' && Object.keys(ep.inputSchema as object).length > 0) {
        lines.push('- **Input schema:**');
        lines.push('```json');
        lines.push(JSON.stringify(ep.inputSchema, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/endpoints.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/x402-skills/src/render/endpoints.ts packages/x402-skills/src/render/__tests__/endpoints.test.ts
git commit -m "feat(x402-skills): render references/endpoints.md"
```

---

## Task 7: Render `plugin.json` and `marketplace.json`

**Files:**
- Create: `packages/x402-skills/src/render/plugin-json.ts`
- Create: `packages/x402-skills/src/render/marketplace-json.ts`
- Create: `packages/x402-skills/src/render/__tests__/plugin-json.test.ts`
- Create: `packages/x402-skills/src/render/__tests__/marketplace-json.test.ts`

- [ ] **Step 1: Write failing test `packages/x402-skills/src/render/__tests__/plugin-json.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/plugin-json.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/x402-skills/src/render/plugin-json.ts`**

```ts
export interface RenderPluginJsonInput {
  slug: string;
  name: string;
  description: string;
}

export function renderPluginJson(input: RenderPluginJsonInput): string {
  const payload = {
    name: input.slug,
    displayName: input.name,
    version: '1.0.0',
    description: input.description,
    author: {
      name: 'x402gle',
      url: 'https://x402gle.com',
    },
    skills: [`./skills/${input.slug}/SKILL.md`],
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
```

- [ ] **Step 4: Run plugin.json test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/plugin-json.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write failing test `packages/x402-skills/src/render/__tests__/marketplace-json.test.ts`**

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/marketplace-json.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `packages/x402-skills/src/render/marketplace-json.ts`**

```ts
export interface RenderMarketplaceJsonInput {
  slug: string;
  name: string;
}

export function renderMarketplaceJson(input: RenderMarketplaceJsonInput): string {
  const payload = {
    name: input.slug,
    displayName: input.name,
    owner: {
      name: 'x402gle',
      url: 'https://x402gle.com',
    },
    plugins: [
      {
        name: input.slug,
        source: `./plugins/${input.slug}`,
      },
    ],
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
```

- [ ] **Step 8: Run marketplace.json test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/marketplace-json.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/x402-skills/src/render/plugin-json.ts packages/x402-skills/src/render/marketplace-json.ts packages/x402-skills/src/render/__tests__/plugin-json.test.ts packages/x402-skills/src/render/__tests__/marketplace-json.test.ts
git commit -m "feat(x402-skills): render plugin.json and marketplace.json"
```

---

## Task 8: Render `output-template.md`, `README.md`, and `LICENSE`

**Files:**
- Create: `packages/x402-skills/src/render/output-template.ts`
- Create: `packages/x402-skills/src/render/readme.ts`
- Create: `packages/x402-skills/src/render/license.ts`

These are deterministic small renderers; one combined test covers them.

- [ ] **Step 1: Write a combined test `packages/x402-skills/src/render/__tests__/boilerplate.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/boilerplate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `packages/x402-skills/src/render/output-template.ts`**

```ts
import type { HostManifestEnvelope } from '../types.js';

export function renderOutputTemplate(envelope: HostManifestEnvelope): string {
  const manifest = envelope.manifest!;
  const lines: string[] = [];
  lines.push(`# Expected output — ${envelope.host}\n`);
  lines.push(
    'This skill returns the response shape of the final endpoint in its workflow. The exact ' +
      'shape depends on which capability cluster the workflow exercises.\n'
  );
  if (manifest.workflows.length > 0) {
    lines.push('## Workflows in this skill\n');
    for (const wf of manifest.workflows) {
      lines.push(`- **${wf.name}** — ${wf.description}`);
    }
    lines.push('');
  }
  lines.push(
    `For per-endpoint response details, see [references/endpoints.md](../references/endpoints.md) ` +
      `or the live host page at https://x402gle.com/servers/${envelope.host}.`
  );
  return lines.join('\n');
}
```

- [ ] **Step 4: Create `packages/x402-skills/src/render/readme.ts`**

```ts
import type { HostManifestEnvelope } from '../types.js';

export interface RenderReadmeInput {
  envelope: HostManifestEnvelope;
  slug: string;
  name: string;
}

export function renderReadme(input: RenderReadmeInput): string {
  const { envelope, slug, name } = input;
  const manifest = envelope.manifest!;
  return [
    `# ${name}`,
    '',
    `${manifest.positioning}`,
    '',
    `Composed by [x402gle](https://x402gle.com) from \`${envelope.host}\`'s synthesized manifest ` +
      `at v${envelope.version_no} (provenance: ${envelope.provenance}).`,
    '',
    '## Install',
    '',
    'Save this bundle to disk, then from inside Claude Code:',
    '',
    '```',
    `/skill install ./${slug}`,
    '```',
    '',
    'Or drop the bundle into `~/.claude/skills/` and restart Claude Code.',
    '',
    '## What this skill calls',
    '',
    `This skill calls paid endpoints on \`${envelope.host}\`. Endpoint authors' terms apply ` +
      `to the actual API calls. See [SKILL.md](./plugins/${slug}/skills/${slug}/SKILL.md) for ` +
      'the full workflow and [references/endpoints.md](./plugins/' +
      slug +
      `/skills/${slug}/references/endpoints.md) for endpoint details.`,
    '',
    '## License',
    '',
    'The bundle text and boilerplate are MIT-licensed. See `LICENSE`.',
    '',
  ].join('\n');
}
```

- [ ] **Step 5: Create `packages/x402-skills/src/render/license.ts`**

```ts
export function renderLicense(): string {
  const year = new Date().getFullYear();
  return `MIT License

Copyright (c) ${year} Dexter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/render/__tests__/boilerplate.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/x402-skills/src/render/output-template.ts packages/x402-skills/src/render/readme.ts packages/x402-skills/src/render/license.ts packages/x402-skills/src/render/__tests__/boilerplate.test.ts
git commit -m "feat(x402-skills): render output-template, README, and LICENSE"
```

---

## Task 9: The `composeSkill()` orchestrator

**Files:**
- Create: `packages/x402-skills/src/compose.ts`
- Create: `packages/x402-skills/src/__tests__/compose.test.ts`
- Modify: `packages/x402-skills/src/index.ts`

- [ ] **Step 1: Write failing test `packages/x402-skills/src/__tests__/compose.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { composeSkill } from '../compose.js';
import type { HostManifestEnvelope } from '../types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(here, 'fixtures/manifest-blockrun.json'), 'utf8')
) as HostManifestEnvelope;

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
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
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
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.hosts_included).toHaveLength(1);
    expect(result.hosts_included[0].host).toBe('blockrun.ai');
    expect(result.hosts_included[0].version_no).toBe(fixture.version_no);
    expect(result.hosts_included[0].provenance).toBe(fixture.provenance);
  });

  it('uses a derived slug when skill_name is not provided', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.slug).toBe('blockrun-ai');
  });

  it('respects an explicit skill_name', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    const result = await composeSkill({ hosts: ['blockrun.ai'], skill_name: 'Polymarket Trader Analytics' });
    expect(result.slug).toBe('polymarket-trader-analytics');
    expect(result.name).toBe('Polymarket Trader Analytics');
  });

  it('ignores publish:true in v0 (returns without persisting)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    const result = await composeSkill({ hosts: ['blockrun.ai'], publish: true });
    // No preview_url in v0 since persistence is not wired
    expect((result as any).preview_url).toBeUndefined();
  });

  it('produces an installation_instructions string', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fixture,
    });
    const result = await composeSkill({ hosts: ['blockrun.ai'] });
    expect(result.installation_instructions).toMatch(/skill install/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/compose.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/x402-skills/src/compose.ts`**

```ts
import { fetchHostManifest } from './fetch.js';
import { deriveSlug } from './slug.js';
import { renderSkillMd } from './render/skill-md.js';
import { renderEndpointsMd } from './render/endpoints.js';
import { renderOutputTemplate } from './render/output-template.js';
import { renderPluginJson } from './render/plugin-json.js';
import { renderMarketplaceJson } from './render/marketplace-json.js';
import { renderReadme } from './render/readme.js';
import { renderLicense } from './render/license.js';
import type {
  ComposeInput,
  ComposeResult,
  ComposeHostInclusion,
  BundleFile,
  HostManifestEnvelope,
} from './types.js';

function defaultNameFromHost(host: string): string {
  // Strip TLD-ish trailing segments for a readable display name.
  // "blockrun.ai" → "Blockrun"; "defi-shield-hazel.vercel.app" → "Defi Shield Hazel"
  const stripped = host.replace(/\.(ai|com|io|xyz|app|dev|net|org|sh|vercel\.app|run\.app)$/i, '');
  const slug = stripped.replace(/[.-]+/g, ' ').trim();
  return slug
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function totalCallCount(envelope: HostManifestEnvelope): number {
  return envelope.manifest!.workflows.reduce((acc, wf) => acc + (wf.steps?.length ?? 0), 0);
}

function totalCostEstimate(
  envelope: HostManifestEnvelope
): { amount: string; asset: string; chain: string } | null {
  const clusters = envelope.manifest!.capability_clusters.filter((c) => c.price);
  if (clusters.length === 0) return null;
  const asset = clusters[0].price!.asset;
  const chain = clusters[0].price!.chain;
  const sum = clusters.reduce((acc, c) => acc + Number(c.price!.amount), 0);
  return { amount: sum.toFixed(4), asset, chain };
}

export async function composeSkill(input: ComposeInput): Promise<ComposeResult> {
  if (!input.hosts || input.hosts.length === 0) {
    throw new Error('Must provide at least one host');
  }
  if (input.hosts.length > 1) {
    throw new Error('v0 supports a single host only; multi-host composition arrives in v1.');
  }

  const host = input.hosts[0];
  const envelope = await fetchHostManifest(host, { baseUrl: input.baseUrl });

  const name = input.skill_name ?? defaultNameFromHost(host);
  const slug = deriveSlug(input.skill_name ?? host);

  const skillMd = renderSkillMd({ envelope, slug, name });
  const endpointsMd = renderEndpointsMd(envelope);
  const outputTemplate = renderOutputTemplate(envelope);
  const pluginJson = renderPluginJson({ slug, name, description: envelope.manifest!.positioning });
  const marketplaceJson = renderMarketplaceJson({ slug, name });
  const readme = renderReadme({ envelope, slug, name });
  const license = renderLicense();

  const files: BundleFile[] = [
    { path: `plugins/${slug}/skills/${slug}/SKILL.md`, content: skillMd },
    { path: `plugins/${slug}/skills/${slug}/references/endpoints.md`, content: endpointsMd },
    { path: `plugins/${slug}/skills/${slug}/assets/output-template.md`, content: outputTemplate },
    { path: `plugins/${slug}/.claude-plugin/plugin.json`, content: pluginJson },
    { path: `.claude-plugin/marketplace.json`, content: marketplaceJson },
    { path: `README.md`, content: readme },
    { path: `LICENSE`, content: license },
  ];

  const hosts_included: ComposeHostInclusion[] = [
    {
      host: envelope.host,
      version_no: envelope.version_no,
      provenance: envelope.provenance,
    },
  ];

  return {
    slug,
    name,
    files,
    hosts_included,
    cost_estimate: totalCostEstimate(envelope),
    call_count_estimate: totalCallCount(envelope),
    installation_instructions:
      `Save the files in this bundle to disk under any directory name, then from inside Claude Code run:\n\n` +
      `  /skill install ./${slug}\n\n` +
      `Or drop the bundle into ~/.claude/skills/ and restart Claude Code. ` +
      `The skill calls paid endpoints on ${envelope.host}; estimated max cost per run is in cost_estimate.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/x402-skills && npx vitest run src/__tests__/compose.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Update `packages/x402-skills/src/index.ts` to export the public surface**

```ts
export { composeSkill } from './compose.js';
export { fetchHostManifest } from './fetch.js';
export { deriveSlug } from './slug.js';
export type {
  ComposeInput,
  ComposeResult,
  ComposeHostInclusion,
  BundleFile,
  HostManifestEnvelope,
  HostManifestPayload,
  HostManifestCluster,
  HostManifestEndpoint,
  HostManifestWorkflow,
  HostManifestProvenance,
  HostManifestStatus,
} from './types.js';
```

- [ ] **Step 6: Run all package tests to confirm nothing regressed**

Run: `cd packages/x402-skills && npm test`
Expected: PASS — all tests pass (slug, fetch, skill-md, endpoints, plugin-json, marketplace-json, boilerplate, compose).

- [ ] **Step 7: Build the package**

Run: `cd packages/x402-skills && npm run build`
Expected: `dist/index.js` and `dist/index.d.ts` exist, no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/x402-skills/src/compose.ts packages/x402-skills/src/__tests__/compose.test.ts packages/x402-skills/src/index.ts
git commit -m "feat(x402-skills): composeSkill orchestrator (v0 single-host stateless)"
```

---

## Task 10: Register `x402_compose_skill` on `dexter-open-mcp`

**Files:**
- Modify: `open-mcp-server.mjs` (around line 1190, after `dexter_passkey_probe` registration)
- Modify: `open-mcp-server.mjs:132` (the `ALL_TOOLS` array — add `x402_compose_skill`)

- [ ] **Step 1: Verify the package builds and is symlinked from the repo root**

Run: `ls -la node_modules/@dexterai/x402-skills/dist/index.js`
Expected: file exists (resolved through the workspace symlink).

If the symlink doesn't exist or the dist folder is empty, run from repo root:
```bash
cd packages/x402-skills && npm run build && cd -
```

- [ ] **Step 2: Add `x402_compose_skill` to the `ALL_TOOLS` allowlist at `open-mcp-server.mjs:132`**

Open the file. Find this line (around 132):
```js
const ALL_TOOLS = ['x402_search', 'x402_pay', 'x402_fetch', 'x402_check', 'x402_access', 'x402_wallet', 'card_status', 'card_issue', 'card_link_wallet', 'card_freeze', 'card_login_request_otp', 'card_login_complete', 'dexter_passkey_probe', 'dexter_passkey'];
```

Replace with:
```js
const ALL_TOOLS = ['x402_search', 'x402_pay', 'x402_fetch', 'x402_check', 'x402_access', 'x402_wallet', 'x402_compose_skill', 'card_status', 'card_issue', 'card_link_wallet', 'card_freeze', 'card_login_request_otp', 'card_login_complete', 'dexter_passkey_probe', 'dexter_passkey'];
```

- [ ] **Step 3: Add the import near the top of `open-mcp-server.mjs`**

Find the existing import block where `@dexterai/x402-core` is imported (search for `from '@dexterai/x402-core'`). Add this line right after that import:

```js
import { composeSkill } from '@dexterai/x402-skills';
```

- [ ] **Step 4: Register the tool**

Find this registration block (around line 1235):

```js
  server.registerTool('dexter_passkey', {
```

Insert the following block **immediately before** `dexter_passkey` registration (so right after `dexter_passkey_probe`):

```js
  server.registerTool('x402_compose_skill', {
    title: 'x402 Compose Skill',
    description: 'Compose a Claude Code skill bundle from an x402gle host. Pass a single host slug (e.g. "blockrun.ai") and receive a complete Anthropic-spec plugin bundle (plugin.json, marketplace.json, SKILL.md, references/endpoints.md, assets/output-template.md, README, LICENSE) as inline files the user can save to disk and install via `/skill install`. The bundle content is rendered from the host\'s synthesized manifest on x402gle.com (positioning, capability clusters, workflows, provenance). Use this when the user wants to ADOPT a host as a reusable skill — not when they want to call it directly. For a single call, use x402_fetch instead. v0 supports single-host composition only; multi-host workflows arrive in v1.',
    inputSchema: {
      hosts: z.array(z.string()).min(1).max(1).describe('Exactly one host slug (e.g. "blockrun.ai"). v0 is single-host only.'),
      skill_name: z.string().optional().describe('Optional display name. Defaults to a title derived from the host (e.g. "blockrun.ai" → "Blockrun").'),
      publish: z.boolean().optional().describe('v0: ignored (always treated as false). Persistence and public publishing arrive in v1+.'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const result = await composeSkill({
        hosts: args.hosts,
        skill_name: args.skill_name,
        publish: args.publish,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (err) {
      const message = err?.message || String(err);
      const data = { error: 'compose_failed', message };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: true,
      };
    }
  });

```

- [ ] **Step 5: Run a syntax check on the MJS file**

Run: `node --check open-mcp-server.mjs`
Expected: no output. Any error means there's a syntax issue in the edits.

- [ ] **Step 6: Commit**

```bash
git add open-mcp-server.mjs
git commit -m "feat(open-mcp): register x402_compose_skill tool wrapping @dexterai/x402-skills"
```

---

## Task 11: End-to-end smoke test against the live API

**Files:**
- Create: `packages/x402-skills/scripts/smoke-blockrun.mjs`

This is a manual smoke test — not part of `npm test`, since it hits the network.

- [ ] **Step 1: Create `packages/x402-skills/scripts/smoke-blockrun.mjs`**

```js
#!/usr/bin/env node
// Smoke test: compose a real bundle from blockrun.ai's live manifest,
// write to /tmp/blockrun-skill-bundle/, print a summary.

import { composeSkill } from '../dist/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = '/tmp/blockrun-skill-bundle';

async function main() {
  console.log('→ composing blockrun.ai...');
  const result = await composeSkill({ hosts: ['blockrun.ai'] });

  console.log(`  slug: ${result.slug}`);
  console.log(`  name: ${result.name}`);
  console.log(`  files: ${result.files.length}`);
  console.log(`  cost_estimate: ${JSON.stringify(result.cost_estimate)}`);
  console.log(`  call_count_estimate: ${result.call_count_estimate}`);
  console.log(`  hosts_included:`);
  for (const h of result.hosts_included) {
    console.log(`    - ${h.host} v${h.version_no} (${h.provenance})`);
  }

  console.log(`\n→ writing bundle to ${OUT_DIR}/`);
  for (const f of result.files) {
    const dest = path.join(OUT_DIR, f.path);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, f.content, 'utf8');
    console.log(`  ${f.path}`);
  }
  console.log('\n✓ smoke test complete');
}

main().catch((err) => {
  console.error('✗ smoke test failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Build the package**

Run: `cd packages/x402-skills && npm run build`
Expected: dist updated.

- [ ] **Step 3: Run the smoke test**

Run: `cd packages/x402-skills && node scripts/smoke-blockrun.mjs`
Expected: prints the summary and writes 7 files to `/tmp/blockrun-skill-bundle/`. No errors.

- [ ] **Step 4: Inspect a few generated files**

Run: `head -40 /tmp/blockrun-skill-bundle/plugins/blockrun-ai/skills/blockrun-ai/SKILL.md`
Expected: YAML frontmatter with `name: Blockrun`, `pinned_host_version: <n>`, `host_provenance: <kind>`; then a body that includes the blockrun positioning paragraph.

Run: `cat /tmp/blockrun-skill-bundle/.claude-plugin/marketplace.json`
Expected: valid JSON listing one plugin with `name: "blockrun-ai"` and `source: "./plugins/blockrun-ai"`.

- [ ] **Step 5: Commit**

```bash
git add packages/x402-skills/scripts/smoke-blockrun.mjs
git commit -m "test(x402-skills): smoke script for live blockrun.ai compose"
```

---

## Task 12: Restart `dexter-open-mcp` and verify the tool is live

- [ ] **Step 1: Confirm the symlinked package is built**

Run: `node -e "import('@dexterai/x402-skills').then(m => console.log(typeof m.composeSkill))"`
Expected: prints `function`.

- [ ] **Step 2: Restart the PM2 process**

Run: `pm2 restart dexter-open-mcp --update-env && pm2 logs dexter-open-mcp --lines 30 --nostream`
Expected: process restarts cleanly; logs show server booting with no errors related to `@dexterai/x402-skills`.

- [ ] **Step 3: Verify the tool is registered**

Run: `pm2 logs dexter-open-mcp --lines 200 --nostream | grep -iE 'x402_compose_skill|registered'`
Expected: a line indicating `x402_compose_skill` was registered, or at minimum no errors mentioning it.

If logs don't surface registrations, query the MCP server's tool list directly:
```bash
curl -s -X POST https://open.dexter.cash/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin); print([t['name'] for t in r['result']['tools']])"
```
Expected: the printed list includes `'x402_compose_skill'`.

- [ ] **Step 4: Call the tool end-to-end**

```bash
curl -s -X POST https://open.dexter.cash/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"x402_compose_skill","arguments":{"hosts":["blockrun.ai"]}}}' \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
sc = r.get('result', {}).get('structuredContent', {})
print('slug:', sc.get('slug'))
print('files:', len(sc.get('files', [])))
print('hosts_included:', sc.get('hosts_included'))
"
```
Expected: `slug: blockrun-ai`, `files: 7`, `hosts_included: [{host: 'blockrun.ai', ...}]`.

- [ ] **Step 5: Final commit (no code, just a marker that smoke passed in prod)**

No commit needed if everything works. If you adjusted the registration during smoke (logs revealed an issue), commit the fix and re-run Task 12.

---

## Self-Review

**Spec coverage check.** Walking each section of the spec:

- v0 scope: package + tool + single host + stateless + public-HTTP fetch + Anthropic envelope + manifest-driven content — Tasks 1–10 cover all of it.
- v3 schema: not implemented (correctly out of v0 scope).
- "Why now" / competitive framing: belongs in the spec, not the plan.
- Architecture diagram: implemented exactly by Tasks 9 + 10.
- Tool surface: Task 10 registers it with the prescriptive description from the spec.
- Bundle envelope (Anthropic): Tasks 7 (plugin.json, marketplace.json) + 5 (SKILL.md) + 6 (endpoints) + 8 (output-template, README, LICENSE) cover every file path the spec lists.
- Bundle content (ours): Task 5 (SKILL.md from manifest fields).
- Decisions locked: scoped slugs (deferred to v3, plan respects this), unlisted-by-default (deferred to v3), drift policy (deferred), pingback (deferred), no minimum hosts (v0 is single-host so trivially honored). Slug derivation: Task 2. License choice: Task 8.
- Risks/edge cases: "Host with no synthesized manifest" — handled by `fetchHostManifest()` throwing `SKILL_NOT_COMPOSABLE` (Task 3). "Failed state with no cached content" — same path. "Bundle drifts from Anthropic spec" — separated render functions make this a single-file change later.
- Testing approach: Tasks 5–9 cover renderer unit tests; Task 9 covers compose integration; Tasks 11–12 cover live smoke.
- Implementation plan stub in the spec: this document.

**Placeholder scan.** No "TBD", no "implement later", no "similar to Task N" without code, no "appropriate error handling" — every step has either code or an exact command with expected output.

**Type consistency check.** Names used:
- `composeSkill` (Tasks 9, 10, 11) — consistent
- `fetchHostManifest` (Tasks 3, 9) — consistent
- `deriveSlug` (Tasks 2, 9) — consistent
- `renderSkillMd`, `renderEndpointsMd`, `renderOutputTemplate`, `renderPluginJson`, `renderMarketplaceJson`, `renderReadme`, `renderLicense` (Tasks 5–9) — all match
- `HostManifestEnvelope`, `HostManifestPayload`, `ComposeInput`, `ComposeResult`, `BundleFile`, `ComposeHostInclusion` (Task 2, used in 3, 5, 6, 8, 9) — consistent
- `pinned_host_version` in YAML frontmatter (Task 5) matches the spec's renamed field — consistent

One potential drift to call out and resolve here: the spec uses `pinned_version` in the v3 schema column but `pinned_host_version` in the YAML frontmatter. These are two different surfaces (Postgres column vs YAML key), so they may legitimately have different names. The plan keeps them as written. If we want strict parity later, that becomes a v1 spec amendment.

**Scope check.** This plan covers exactly v0: one package, one MCP tool, single host, stateless. No v1 or v3 scope leaks in. Ready to execute as one unit.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-15-composed-skills-v0.md`.
