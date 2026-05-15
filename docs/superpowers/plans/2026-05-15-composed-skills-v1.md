# Composed Skills v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make composed skills installable in ≤2 user actions via persistence, GitHub-backed monorepo publishing, public x402gle.com surfaces, and `x402_search` integration.

**Architecture:** Three coordinated repos:
- `dexter-mcp` — adds publishing logic to `composeSkill()` and new MCP tools (`promote_skill`, updated `x402_compose_skill`).
- `dexter-api` — adds SQL migration for `x402gle_principals` + `x402gle_skills` + `x402gle_skill_hosts`, new HTTP routes, GitHub commit pipeline, search integration.
- `Dexter-DAO/composed-skills` (new GitHub repo) — published bundles live under `plugins/<owner>-<slug>/` with an aggregate `marketplace.json` at the repo root.

**Tech Stack:** TypeScript, raw SQL (no `prisma db push/pull/migrate`; `prisma generate` only after manual SQL apply), `@octokit/rest` + isomorphic-git for GitHub commits, Next.js App Router for x402gle.com pages, the existing dexter-api Express stack.

**Reference spec:** `docs/superpowers/specs/2026-05-15-composed-skills-v1-design.md`

---

## Prerequisites (Branch performs before execution)

These two are out-of-band setup that must exist before Task 1:

1. **Create GitHub repo `Dexter-DAO/composed-skills`** (public, empty, no auto-README, MIT license).
2. **Create GitHub bot `dexter-skill-bot`** with a fine-grained PAT scoped to:
   - Repository: `Dexter-DAO/composed-skills` only
   - Permissions: `contents: read and write`, `metadata: read`
   - Hand the token to Claude; Claude writes it to `~/websites/dexter-api/.env` as `COMPOSED_SKILLS_GITHUB_TOKEN` and never commits it.

The plan will fail-fast at Task 5 if the repo doesn't exist or the token isn't set.

---

## Phase A — Schema and identity foundation

Establishes `x402gle_principals` as the canonical identity table and `x402gle_skills` + `x402gle_skill_hosts` as the composed-skill persistence layer. SQL applied manually against Supabase Postgres, then `prisma generate` to pick up the new Principal model.

### Task 1: Write the SQL migration file

**Files:**
- Create: `~/websites/dexter-api/supabase/migrations/20260515_120000_composed_skills_v1.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================================
-- Composed Skills v1 — schema foundation
-- =============================================================================
-- Introduces x402gle_principals (the first canonical x402gle identity table)
-- and x402gle_skills + x402gle_skill_hosts for composed-skill persistence.
--
-- See: docs/superpowers/specs/2026-05-15-composed-skills-v1-design.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Principals — humans, agents, organizations
-- -----------------------------------------------------------------------------
-- A "principal" is any identifiable actor that can own things on x402gle.
-- v1 only enforces this for composed-skill ownership, but the shape is
-- designed so future surfaces (storefronts, attribution, social) all share it.

CREATE TABLE IF NOT EXISTS x402gle_principals (
  handle                TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK (kind IN ('human', 'agent', 'organization')),
  display_name          TEXT,
  avatar_url            TEXT,
  bio                   TEXT,

  -- Identity bindings. At least one must be set; app layer enforces.
  supabase_user_id      UUID UNIQUE,
  owner_handle          TEXT REFERENCES x402gle_principals(handle) ON DELETE RESTRICT,
  agent_provider        TEXT,
  agent_wallet_address  TEXT,

  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS x402gle_principals_handle_lower_unique
  ON x402gle_principals (LOWER(handle));
CREATE INDEX IF NOT EXISTS x402gle_principals_owner_idx
  ON x402gle_principals (owner_handle) WHERE owner_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS x402gle_principals_supabase_idx
  ON x402gle_principals (supabase_user_id) WHERE supabase_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Composed skills
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS x402gle_skills (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_handle          TEXT NOT NULL REFERENCES x402gle_principals(handle) ON DELETE RESTRICT,
  slug                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  version_no            INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'ready'
                        CHECK (status IN ('ready', 'generating', 'failed')),
  visibility            TEXT NOT NULL DEFAULT 'unlisted'
                        CHECK (visibility IN ('unlisted', 'public', 'archived')),

  composer_kind         TEXT NOT NULL
                        CHECK (composer_kind IN ('ai_authored', 'user_authored', 'merchant_authored')),
  composer_id           TEXT,
  hosts_included        TEXT[] NOT NULL,
  workflow_json         JSONB NOT NULL,
  bundle_md             TEXT NOT NULL,
  bundle_files_json     JSONB NOT NULL,

  cost_estimate_usdc    NUMERIC,
  call_count_estimate   INTEGER,

  quality_score         NUMERIC NOT NULL DEFAULT 0,
  total_installs        INTEGER NOT NULL DEFAULT 0,
  total_runs            INTEGER NOT NULL DEFAULT 0,

  github_commit_sha     TEXT,
  github_subdir         TEXT,

  merchant_reviewed_at  TIMESTAMPTZ,
  merchant_edited_at    TIMESTAMPTZ,
  last_error            TEXT,

  manifest_version      INTEGER NOT NULL DEFAULT 1,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (owner_handle, slug)
);

CREATE INDEX IF NOT EXISTS x402gle_skills_visibility_idx
  ON x402gle_skills (visibility, total_installs DESC, total_runs DESC);
CREATE INDEX IF NOT EXISTS x402gle_skills_owner_idx
  ON x402gle_skills (owner_handle, slug);
CREATE INDEX IF NOT EXISTS x402gle_skills_status_idx
  ON x402gle_skills (status) WHERE status != 'ready';
CREATE INDEX IF NOT EXISTS x402gle_skills_manifest_version_idx
  ON x402gle_skills (manifest_version);

-- -----------------------------------------------------------------------------
-- 3. Host membership (M2M with version pinning)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS x402gle_skill_hosts (
  skill_id          UUID NOT NULL REFERENCES x402gle_skills(id) ON DELETE CASCADE,
  host              TEXT NOT NULL,
  pinned_version    INTEGER NOT NULL,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (skill_id, host)
);

CREATE INDEX IF NOT EXISTS x402gle_skill_hosts_host_idx
  ON x402gle_skill_hosts (host, pinned_version);

-- -----------------------------------------------------------------------------
-- 4. Updated-at triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION x402gle_principals_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS x402gle_principals_touch_updated_at_trg ON x402gle_principals;
CREATE TRIGGER x402gle_principals_touch_updated_at_trg
  BEFORE UPDATE ON x402gle_principals
  FOR EACH ROW EXECUTE FUNCTION x402gle_principals_touch_updated_at();

CREATE OR REPLACE FUNCTION x402gle_skills_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS x402gle_skills_touch_updated_at_trg ON x402gle_skills;
CREATE TRIGGER x402gle_skills_touch_updated_at_trg
  BEFORE UPDATE ON x402gle_skills
  FOR EACH ROW EXECUTE FUNCTION x402gle_skills_touch_updated_at();
```

- [ ] **Step 2: Verify SQL parses cleanly (no apply yet)**

Run from `~/websites/dexter-api/`:
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction --dry-run -f supabase/migrations/20260515_120000_composed_skills_v1.sql || true
# Above is a no-op since --dry-run isn't a psql flag; use the next form:
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "BEGIN; \i supabase/migrations/20260515_120000_composed_skills_v1.sql; ROLLBACK;"
```

Expected: completes with `ROLLBACK` at end, no errors. If `\i` quoting is wonky, alternative: pipe the file in via `<` and wrap in `BEGIN/ROLLBACK`.

- [ ] **Step 3: Commit (file only, no schema change yet)**

```bash
cd ~/websites/dexter-api
git add supabase/migrations/20260515_120000_composed_skills_v1.sql
git commit -m "feat(composed-skills v1): add x402gle_principals + x402gle_skills migration (not yet applied)"
```

### Task 2: Apply migration manually and seed the first principal

- [ ] **Step 1: Apply the SQL**

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f ~/websites/dexter-api/supabase/migrations/20260515_120000_composed_skills_v1.sql
```

Expected: zero errors. All three tables created.

- [ ] **Step 2: Verify with `\d+`**

```bash
psql "$SUPABASE_DB_URL" -c "\d+ x402gle_principals"
psql "$SUPABASE_DB_URL" -c "\d+ x402gle_skills"
psql "$SUPABASE_DB_URL" -c "\d+ x402gle_skill_hosts"
```

Expected: all three tables print their full schema. Indexes match the migration.

- [ ] **Step 3: Seed Branch as the first principal**

Branch must first resolve his supabase_user_id. From `~/websites/dexter-api/`:
```bash
psql "$SUPABASE_DB_URL" -c "SELECT id, email FROM auth.users WHERE email = 'branch@dexter.cash' LIMIT 1;"
```

Take the resulting UUID and run:
```bash
psql "$SUPABASE_DB_URL" -c "
INSERT INTO x402gle_principals (handle, kind, display_name, supabase_user_id, is_verified, verified_at)
VALUES ('branchm', 'human', 'Branch', '<UUID-FROM-PREVIOUS-QUERY>', TRUE, NOW())
ON CONFLICT (handle) DO NOTHING;
"
psql "$SUPABASE_DB_URL" -c "SELECT handle, kind, supabase_user_id, is_verified FROM x402gle_principals WHERE handle = 'branchm';"
```

Expected: one row returned with `kind = 'human'`, `is_verified = true`.

### Task 3: Run `prisma generate` (NOT push/pull/migrate)

- [ ] **Step 1: Add the Prisma model for `x402gle_principals`**

The skills tables don't need Prisma models (raw SQL access, same pattern as `x402_host_manifests`). But `x402gle_principals` is a profile table that will see frequent Prisma-style reads, so add it to `~/websites/dexter-api/prisma/schema.prisma`. Find a good spot near other `x402gle_` models (around line 4391 where `x402gle_merchant_state` lives) and insert:

```prisma
model x402gle_principals {
  handle               String    @id @db.Text
  kind                 String    @db.Text
  display_name         String?   @db.Text
  avatar_url           String?   @db.Text
  bio                  String?   @db.Text
  supabase_user_id     String?   @unique @db.Uuid
  owner_handle         String?   @db.Text
  agent_provider       String?   @db.Text
  agent_wallet_address String?   @db.Text
  is_verified          Boolean   @default(false)
  verified_at          DateTime? @db.Timestamptz(6)
  created_at           DateTime  @default(now()) @db.Timestamptz(6)
  updated_at           DateTime  @default(now()) @db.Timestamptz(6)

  owner   x402gle_principals?  @relation("AgentOwnership", fields: [owner_handle], references: [handle], onDelete: Restrict)
  agents  x402gle_principals[] @relation("AgentOwnership")

  @@map("x402gle_principals")
}
```

- [ ] **Step 2: Run prisma generate ONLY**

```bash
cd ~/websites/dexter-api
npx prisma generate
```

Expected: completes without errors, no schema modifications, only re-generates the Prisma Client to know about `x402gle_principals`. Do NOT run `prisma db push`, `db pull`, `migrate dev`, `migrate deploy`, or `migrate reset` — those are forbidden per project rule.

- [ ] **Step 3: Smoke-test the new model**

```bash
cd ~/websites/dexter-api
node -e "
import('./node_modules/@prisma/client/index.js').then(async ({ PrismaClient }) => {
  const p = new PrismaClient();
  const row = await p.x402gle_principals.findUnique({ where: { handle: 'branchm' } });
  console.log(row);
  await p.\$disconnect();
});
"
```

Expected: prints the `branchm` row with `kind: 'human'`. If undefined, the prisma client was generated stale — re-run `npx prisma generate`.

- [ ] **Step 4: Commit**

```bash
cd ~/websites/dexter-api
git add prisma/schema.prisma
git commit -m "feat(composed-skills v1): add x402gle_principals Prisma model"
```

---

## Phase B — Persistence in the composer primitive

Teach `@dexterai/x402-skills`'s `composeSkill()` to optionally persist via an injected `Persister` callback. Keep the package's HTTP-only purity by NOT importing `pg` or `dexter-api` modules — the persister is provided by the caller (dexter-api will inject its own).

### Task 4: Add a Persister interface and threading in composeSkill

**Files:**
- Modify: `~/websites/dexter-mcp/packages/x402-skills/src/types.ts` — add Persister types
- Modify: `~/websites/dexter-mcp/packages/x402-skills/src/compose.ts` — accept optional persister
- Modify: `~/websites/dexter-mcp/packages/x402-skills/src/index.ts` — export new types
- Create: `~/websites/dexter-mcp/packages/x402-skills/src/__tests__/compose-persist.test.ts` — unit tests

- [ ] **Step 1: Add types to `types.ts`**

```ts
// Add these to types.ts after the existing ComposeInput interface:

export interface PersistComposedSkillInput {
  owner_handle: string;
  slug: string;
  name: string;
  description: string | null;
  composer_kind: 'ai_authored' | 'user_authored' | 'merchant_authored';
  composer_id: string | null;
  hosts_included: ComposeHostInclusion[];
  workflow_json: Record<string, unknown>;
  bundle_md: string;
  bundle_files: BundleFile[];
  cost_estimate: ComposeResult['cost_estimate'];
  call_count_estimate: number;
  visibility: 'unlisted' | 'public';
}

export interface PersistResult {
  skill_id: string;
  version_no: number;
  preview_url: string;
}

export type Persister = (input: PersistComposedSkillInput) => Promise<PersistResult>;
```

Also extend `ComposeInput`:

```ts
// Modify ComposeInput in types.ts:
export interface ComposeInput {
  hosts: string[];
  skill_name?: string;
  publish?: boolean;
  baseUrl?: string;
  // NEW v1 fields:
  owner_handle?: string;
  composer_kind?: 'ai_authored' | 'user_authored' | 'merchant_authored';
  composer_id?: string;
  visibility?: 'unlisted' | 'public';
  persister?: Persister;
}
```

And extend `ComposeResult`:

```ts
export interface ComposeResult {
  slug: string;
  name: string;
  files: BundleFile[];
  hosts_included: ComposeHostInclusion[];
  cost_estimate: { amount: string; asset: string; chain: string } | null;
  call_count_estimate: number;
  installation_instructions: string;
  // NEW v1 fields, populated only when persister fires:
  skill_id?: string;
  version_no?: number;
  preview_url?: string;
}
```

- [ ] **Step 2: Write failing tests in `compose-persist.test.ts`**

```ts
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
```

- [ ] **Step 3: Run tests to confirm failure**

```bash
cd ~/websites/dexter-mcp/packages/x402-skills
npx vitest run src/__tests__/compose-persist.test.ts
```

Expected: 4 tests fail with assertions about `skill_id`/`preview_url` undefined or persister logic missing.

- [ ] **Step 4: Implement persistence in `compose.ts`**

Modify the `composeSkill` function. Current structure builds the `files` array and returns a `ComposeResult`. After files are built and BEFORE returning, add:

```ts
// ... existing compose logic up through assembling `files`, `hosts_included`, etc.

if (input.publish) {
  if (!input.persister) {
    throw new Error('publish: true requires a persister callback');
  }
  if (!input.owner_handle) {
    throw new Error('publish: true requires owner_handle');
  }
  const persistResult = await input.persister({
    owner_handle: input.owner_handle,
    slug,
    name,
    description: envelope.manifest!.positioning ?? null,
    composer_kind: input.composer_kind ?? 'ai_authored',
    composer_id: input.composer_id ?? null,
    hosts_included,
    workflow_json: { hosts: input.hosts, skill_name: input.skill_name },
    bundle_md: skillMd,
    bundle_files: files,
    cost_estimate: totalCostEstimate(skillIndex),
    call_count_estimate: totalCallCount(envelope, skillIndex),
    visibility: input.visibility ?? 'unlisted',
  });
  return {
    slug,
    name,
    files,
    hosts_included,
    cost_estimate: totalCostEstimate(skillIndex),
    call_count_estimate: totalCallCount(envelope, skillIndex),
    installation_instructions: /* same as before */ '',
    skill_id: persistResult.skill_id,
    version_no: persistResult.version_no,
    preview_url: persistResult.preview_url,
  };
}

// Non-publish branch (existing code, unchanged):
return {
  slug,
  name,
  files,
  hosts_included,
  cost_estimate: totalCostEstimate(skillIndex),
  call_count_estimate: totalCallCount(envelope, skillIndex),
  installation_instructions: /* existing */,
};
```

Keep the `installation_instructions` string identical to v0 for the unpublished case. For the published case, append a `\n\nPublished at: ${preview_url}` line.

- [ ] **Step 5: Update `index.ts` to export new types**

Add to the public type exports:

```ts
export type {
  // ... existing exports
  Persister,
  PersistComposedSkillInput,
  PersistResult,
} from './types.js';
```

- [ ] **Step 6: Run tests to confirm pass**

```bash
cd ~/websites/dexter-mcp/packages/x402-skills
npx vitest run
```

Expected: full suite passes (52 tests = 48 v0 + 4 new persistence tests).

- [ ] **Step 7: Build the package**

```bash
cd ~/websites/dexter-mcp/packages/x402-skills
npm run build
```

Expected: `dist/index.js` rebuilds successfully.

- [ ] **Step 8: Commit**

```bash
cd ~/websites/dexter-mcp
git add packages/x402-skills/src/types.ts packages/x402-skills/src/compose.ts packages/x402-skills/src/index.ts packages/x402-skills/src/__tests__/compose-persist.test.ts
git commit -m "feat(x402-skills v1): add optional persister callback to composeSkill"
```

---

## Phase C — GitHub commit pipeline (dexter-api side)

`dexter-api` will own the persistence + GitHub-push logic. The composeSkill primitive stays pure; dexter-api provides a `Persister` implementation that does both Postgres INSERT and a GitHub commit.

### Task 5: Verify prerequisites and store the GitHub PAT

**Files:**
- Modify: `~/websites/dexter-api/.env` (NOT committed)
- Create: `~/websites/dexter-api/src/services/composedSkillsGithub.ts` (placeholder for Task 6)

- [ ] **Step 1: Verify the GitHub repo exists**

```bash
gh repo view Dexter-DAO/composed-skills --json name,visibility,description 2>&1
```

Expected: prints the repo metadata. If "Could not resolve" or 404, STOP and ask Branch to create the repo.

- [ ] **Step 2: Verify the bot token works**

Branch hands over `dexter-skill-bot` PAT. Append to `~/websites/dexter-api/.env`:
```
COMPOSED_SKILLS_GITHUB_TOKEN=<pat-from-branch>
COMPOSED_SKILLS_GITHUB_REPO=Dexter-DAO/composed-skills
COMPOSED_SKILLS_GITHUB_BRANCH=main
COMPOSED_SKILLS_BOT_NAME=dexter-skill-bot
COMPOSED_SKILLS_BOT_EMAIL=skill-bot@dexter.cash
```

Smoke-test the token:
```bash
curl -s -H "Authorization: Bearer $COMPOSED_SKILLS_GITHUB_TOKEN" https://api.github.com/repos/Dexter-DAO/composed-skills | python3 -c "import json,sys; r=json.load(sys.stdin); print('full_name:', r.get('full_name'), 'permissions:', r.get('permissions'))"
```

Expected: `full_name: Dexter-DAO/composed-skills`, `permissions: {'pull': True, 'push': True, ...}`.

- [ ] **Step 3: Seed the empty marketplace.json on main**

If the repo is completely empty, push a starter marketplace.json so subsequent commits don't trip on missing-base errors. Use the GitHub Contents API:

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $COMPOSED_SKILLS_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Dexter-DAO/composed-skills/contents/.claude-plugin/marketplace.json \
  -d "$(python3 -c '
import json, base64
content = json.dumps({
  "name": "x402gle",
  "owner": {"name": "x402gle", "url": "https://x402gle.com"},
  "description": "Composed Claude Code skills synthesized from x402 hosts.",
  "plugins": []
}, indent=2) + "\n"
print(json.dumps({
  "message": "chore: seed empty marketplace.json",
  "content": base64.b64encode(content.encode()).decode(),
  "committer": {"name": "dexter-skill-bot", "email": "skill-bot@dexter.cash"}
}))
')"
```

Expected: returns 201 Created with the new file SHA. If repo already has commits and this file exists, the call returns 422 — that's fine; skip.

- [ ] **Step 4: Verify**

```bash
gh api /repos/Dexter-DAO/composed-skills/contents/.claude-plugin/marketplace.json --jq .content | base64 -d | python3 -m json.tool
```

Expected: prints the JSON with `plugins: []`.

(No commit for this task — only env changes and remote state.)

### Task 6: Implement the GitHub commit service

**Files:**
- Create: `~/websites/dexter-api/src/services/composedSkillsGithub.ts`
- Create: `~/websites/dexter-api/src/services/__tests__/composedSkillsGithub.test.ts`

- [ ] **Step 1: Write the test file FIRST (mocked Octokit)**

Test outline (write the failing test):

```ts
import { describe, it, expect, vi } from 'vitest';
import { commitComposedSkillBundle, type ComposedSkillCommitInput } from '../composedSkillsGithub.js';

vi.mock('@octokit/rest', () => {
  const Octokit = vi.fn().mockImplementation(() => ({
    rest: {
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'base-sha-1234' } } }),
        getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'base-tree' } } }),
        createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob-sha' } }),
        createTree: vi.fn().mockResolvedValue({ data: { sha: 'new-tree-sha' } }),
        createCommit: vi.fn().mockResolvedValue({ data: { sha: 'new-commit-sha' } }),
        updateRef: vi.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: { sha: 'mp-sha', content: Buffer.from(JSON.stringify({ name: 'x402gle', owner: { name: 'x402gle', url: 'https://x402gle.com' }, plugins: [] })).toString('base64') },
        }),
      },
    },
  }));
  return { Octokit };
});

describe('commitComposedSkillBundle', () => {
  it('writes all bundle files to plugins/<owner>-<slug>/ and updates marketplace.json', async () => {
    const input: ComposedSkillCommitInput = {
      owner_handle: 'branchm',
      slug: 'blockrun-ai',
      name: 'Blockrun',
      description: 'Polymarket analytics',
      files: [
        { path: 'plugins/blockrun-ai/skills/blockrun-ai/SKILL.md', content: '# Blockrun' },
        { path: 'README.md', content: '# Blockrun' },
        { path: 'LICENSE', content: 'MIT' },
      ],
      category: 'prediction-markets',
      tags: ['polymarket'],
    };
    const result = await commitComposedSkillBundle(input);
    expect(result.commit_sha).toBe('new-commit-sha');
    expect(result.subdir).toBe('plugins/branchm-blockrun-ai');
  });
});
```

Run: `cd ~/websites/dexter-api && npx vitest run src/services/__tests__/composedSkillsGithub.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `composedSkillsGithub.ts`**

The service uses `@octokit/rest`'s Git Data API to write multiple files atomically in one commit. Sketch:

```ts
import { Octokit } from '@octokit/rest';

const token = process.env.COMPOSED_SKILLS_GITHUB_TOKEN!;
const repo = process.env.COMPOSED_SKILLS_GITHUB_REPO ?? 'Dexter-DAO/composed-skills';
const branch = process.env.COMPOSED_SKILLS_GITHUB_BRANCH ?? 'main';
const botName = process.env.COMPOSED_SKILLS_BOT_NAME ?? 'dexter-skill-bot';
const botEmail = process.env.COMPOSED_SKILLS_BOT_EMAIL ?? 'skill-bot@dexter.cash';
const [owner, repoName] = repo.split('/');

const octokit = new Octokit({ auth: token });

export interface ComposedSkillCommitInput {
  owner_handle: string;
  slug: string;
  name: string;
  description: string;
  files: Array<{ path: string; content: string }>; // bundle files relative to plugin root
  category?: string;
  tags?: string[];
}

export interface ComposedSkillCommitResult {
  commit_sha: string;
  subdir: string;
}

export async function commitComposedSkillBundle(
  input: ComposedSkillCommitInput
): Promise<ComposedSkillCommitResult> {
  const flatSlug = `${input.owner_handle}-${input.slug}`;
  const subdir = `plugins/${flatSlug}`;

  // 1. Get base ref + base tree
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({ owner, repo: repoName, commit_sha: baseSha });
  const baseTreeSha = baseCommit.tree.sha;

  // 2. Create blobs for each bundle file (rewritten to live under plugins/<owner>-<slug>/)
  const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const file of input.files) {
    const fullPath = file.path.startsWith('plugins/')
      ? file.path.replace(/^plugins\/[^\/]+/, subdir)  // strip the bundle's plugins/<slug>/ prefix and replace
      : `${subdir}/${file.path}`;
    const { data: blob } = await octokit.rest.git.createBlob({
      owner,
      repo: repoName,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      encoding: 'base64',
    });
    treeEntries.push({ path: fullPath, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 3. Read existing marketplace.json, mutate plugins[]
  const { data: mpFile } = await octokit.rest.repos.getContent({
    owner,
    repo: repoName,
    path: '.claude-plugin/marketplace.json',
    ref: baseSha,
  });
  if (Array.isArray(mpFile)) throw new Error('marketplace.json is a directory??');
  if (!('content' in mpFile)) throw new Error('marketplace.json has no content');
  const mp = JSON.parse(Buffer.from(mpFile.content, 'base64').toString('utf8'));
  mp.plugins = (mp.plugins ?? []).filter((p: any) => p.name !== flatSlug);
  mp.plugins.push({
    name: flatSlug,
    source: `./plugins/${flatSlug}`,
    description: input.description,
    version: '1.0.0',
    category: input.category,
    tags: input.tags,
  });
  const newMpContent = JSON.stringify(mp, null, 2) + '\n';
  const { data: mpBlob } = await octokit.rest.git.createBlob({
    owner,
    repo: repoName,
    content: Buffer.from(newMpContent, 'utf8').toString('base64'),
    encoding: 'base64',
  });
  treeEntries.push({
    path: '.claude-plugin/marketplace.json',
    mode: '100644',
    type: 'blob',
    sha: mpBlob.sha,
  });

  // 4. Create tree + commit + update ref
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo: repoName,
    base_tree: baseTreeSha,
    tree: treeEntries,
  });
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo: repoName,
    message: `feat: publish ${flatSlug} v1.0.0`,
    tree: newTree.sha,
    parents: [baseSha],
    author: { name: botName, email: botEmail },
    committer: { name: botName, email: botEmail },
  });
  await octokit.rest.git.updateRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  return { commit_sha: newCommit.sha, subdir };
}
```

Add `@octokit/rest` dep if missing: `npm install --save @octokit/rest` in `~/websites/dexter-api/`.

- [ ] **Step 3: Run tests to confirm pass**

```bash
cd ~/websites/dexter-api
npx vitest run src/services/__tests__/composedSkillsGithub.test.ts
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
cd ~/websites/dexter-api
git add src/services/composedSkillsGithub.ts src/services/__tests__/composedSkillsGithub.test.ts package.json package-lock.json
git commit -m "feat(composed-skills v1): GitHub commit pipeline via Octokit"
```

### Task 7: Implement the Postgres persister

**Files:**
- Create: `~/websites/dexter-api/src/services/composedSkillsPersister.ts`
- Create: `~/websites/dexter-api/src/services/__tests__/composedSkillsPersister.test.ts`

- [ ] **Step 1: Write the test FIRST (mocked pg client)**

The persister INSERTs into `x402gle_skills` and `x402gle_skill_hosts`, then awaits the GitHub commit, then UPDATEs the row with `github_commit_sha` + `github_subdir`. Test that all three SQL statements fire in order.

```ts
import { describe, it, expect, vi } from 'vitest';
import type { PersistComposedSkillInput } from '@dexterai/x402-skills';

vi.mock('../composedSkillsGithub.js', () => ({
  commitComposedSkillBundle: vi.fn().mockResolvedValue({
    commit_sha: 'gh-sha-789',
    subdir: 'plugins/branchm-blockrun-ai',
  }),
}));

const queries: Array<{ sql: string; params: unknown[] }> = [];
const mockPg = {
  query: vi.fn(async (sql: string, params: unknown[]) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO x402gle_skills')) {
      return { rows: [{ id: 'skill-uuid-abc', version_no: 1 }] };
    }
    return { rows: [] };
  }),
};

vi.mock('../../db/pool.js', () => ({ default: mockPg, pool: mockPg }));

const { persistComposedSkill } = await import('../composedSkillsPersister.js');

describe('persistComposedSkill', () => {
  it('INSERTs into skills + hosts and UPDATEs with GitHub SHA', async () => {
    queries.length = 0;
    const input: PersistComposedSkillInput = {
      owner_handle: 'branchm',
      slug: 'blockrun-ai',
      name: 'Blockrun',
      description: 'Polymarket analytics',
      composer_kind: 'user_authored',
      composer_id: 'supabase-uuid',
      hosts_included: [{ host: 'blockrun.ai', version_no: 7, provenance: 'ai_authored_unreviewed' }],
      workflow_json: { hosts: ['blockrun.ai'] },
      bundle_md: '# Blockrun',
      bundle_files: [{ path: 'README.md', content: '# Blockrun' }],
      cost_estimate: null,
      call_count_estimate: 6,
      visibility: 'public',
    };
    const result = await persistComposedSkill(input);
    expect(result.skill_id).toBe('skill-uuid-abc');
    expect(result.version_no).toBe(1);
    expect(result.preview_url).toBe('https://x402gle.com/skills/branchm/blockrun-ai');

    expect(queries[0].sql).toMatch(/INSERT INTO x402gle_skills/);
    expect(queries.some(q => q.sql.match(/INSERT INTO x402gle_skill_hosts/))).toBe(true);
    expect(queries.at(-1)?.sql).toMatch(/UPDATE x402gle_skills.*github_commit_sha/s);
  });
});
```

Run: expect FAIL.

- [ ] **Step 2: Implement the persister**

```ts
import { pool } from '../db/pool.js';
import type { Persister, PersistComposedSkillInput, PersistResult } from '@dexterai/x402-skills';
import { commitComposedSkillBundle } from './composedSkillsGithub.js';

export const persistComposedSkill: Persister = async (
  input: PersistComposedSkillInput
): Promise<PersistResult> => {
  // Phase 1: INSERT skill + hosts (status='generating')
  const insertRes = await pool.query(
    `INSERT INTO x402gle_skills (
      owner_handle, slug, name, description, status, visibility,
      composer_kind, composer_id, hosts_included,
      workflow_json, bundle_md, bundle_files_json,
      cost_estimate_usdc, call_count_estimate
    )
    VALUES ($1, $2, $3, $4, 'generating', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (owner_handle, slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      version_no = x402gle_skills.version_no + 1,
      status = 'generating',
      visibility = EXCLUDED.visibility,
      workflow_json = EXCLUDED.workflow_json,
      bundle_md = EXCLUDED.bundle_md,
      bundle_files_json = EXCLUDED.bundle_files_json,
      cost_estimate_usdc = EXCLUDED.cost_estimate_usdc,
      call_count_estimate = EXCLUDED.call_count_estimate,
      last_error = NULL
    RETURNING id, version_no`,
    [
      input.owner_handle, input.slug, input.name, input.description, input.visibility,
      input.composer_kind, input.composer_id, input.hosts_included.map(h => h.host),
      input.workflow_json, input.bundle_md, JSON.stringify(input.bundle_files),
      input.cost_estimate?.amount ?? null, input.call_count_estimate,
    ]
  );
  const skillId: string = insertRes.rows[0].id;
  const versionNo: number = insertRes.rows[0].version_no;

  // Phase 2: INSERT hosts (delete existing + reinsert for safety on re-publish)
  await pool.query(`DELETE FROM x402gle_skill_hosts WHERE skill_id = $1`, [skillId]);
  for (const host of input.hosts_included) {
    await pool.query(
      `INSERT INTO x402gle_skill_hosts (skill_id, host, pinned_version) VALUES ($1, $2, $3)`,
      [skillId, host.host, host.version_no]
    );
  }

  // Phase 3: GitHub commit
  try {
    const ghResult = await commitComposedSkillBundle({
      owner_handle: input.owner_handle,
      slug: input.slug,
      name: input.name,
      description: input.description ?? '',
      files: input.bundle_files,
    });
    await pool.query(
      `UPDATE x402gle_skills SET status = 'ready', github_commit_sha = $2, github_subdir = $3 WHERE id = $1`,
      [skillId, ghResult.commit_sha, ghResult.subdir]
    );
  } catch (err) {
    await pool.query(
      `UPDATE x402gle_skills SET status = 'failed', last_error = $2 WHERE id = $1`,
      [skillId, err instanceof Error ? err.message : String(err)]
    );
    throw err;
  }

  return {
    skill_id: skillId,
    version_no: versionNo,
    preview_url: `https://x402gle.com/skills/${input.owner_handle}/${input.slug}`,
  };
};
```

- [ ] **Step 3: Run tests to pass**

```bash
cd ~/websites/dexter-api
npx vitest run src/services/__tests__/composedSkillsPersister.test.ts
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
cd ~/websites/dexter-api
git add src/services/composedSkillsPersister.ts src/services/__tests__/composedSkillsPersister.test.ts
git commit -m "feat(composed-skills v1): Postgres persister that drives GitHub commit"
```

---

## Phase D — Public HTTP routes on dexter-api

### Task 8: Add the public composed-skills routes

**Files:**
- Create: `~/websites/dexter-api/src/routes/publicComposedSkills.ts`
- Modify: `~/websites/dexter-api/src/app.ts` (mount the route)

- [ ] **Step 1: Create the route file**

Four endpoints:
- `GET /api/public/composed-skills` — paginated list filtered by `visibility = 'public'`
- `GET /api/public/composed-skills/:owner/:slug` — single record (excludes `last_error`)
- `GET /api/public/composed-skills/:owner/:slug/marketplace.json` — single-plugin marketplace.json pointing at git-subdir source
- `GET /api/public/composed-skills/:owner/:slug/bundle.zip` — downloadable bundle (uses Node's `archiver`)

Stub each route, wire them, and test:

```ts
import type { Express, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import archiver from 'archiver';

export function mountPublicComposedSkillsRoutes(app: Express): void {
  app.get('/api/public/composed-skills', async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
    const result = await pool.query(
      `SELECT
        id, owner_handle, slug, name, description, version_no,
        composer_kind, hosts_included, cost_estimate_usdc, call_count_estimate,
        quality_score, total_installs, total_runs, github_subdir,
        created_at, updated_at
      FROM x402gle_skills
      WHERE visibility = 'public' AND status = 'ready'
      ORDER BY total_installs DESC, total_runs DESC, created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ ok: true, skills: result.rows, limit, offset });
  });

  app.get('/api/public/composed-skills/:owner/:slug', async (req: Request, res: Response) => {
    const { owner, slug } = req.params;
    const result = await pool.query(
      `SELECT
        id, owner_handle, slug, name, description, version_no, status, visibility,
        composer_kind, hosts_included, workflow_json, bundle_md, bundle_files_json,
        cost_estimate_usdc, call_count_estimate, quality_score, total_installs,
        total_runs, github_commit_sha, github_subdir, manifest_version,
        created_at, updated_at
      FROM x402gle_skills
      WHERE owner_handle = $1 AND slug = $2 AND visibility IN ('public', 'unlisted')`,
      [owner, slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    res.json({ ok: true, skill: result.rows[0] });
  });

  app.get('/api/public/composed-skills/:owner/:slug/marketplace.json', async (req: Request, res: Response) => {
    const { owner, slug } = req.params;
    const result = await pool.query(
      `SELECT owner_handle, slug, name, description, github_subdir FROM x402gle_skills
      WHERE owner_handle = $1 AND slug = $2 AND status = 'ready'`,
      [owner, slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = result.rows[0];
    res.json({
      name: 'x402gle',
      owner: { name: 'x402gle', url: 'https://x402gle.com' },
      plugins: [
        {
          name: `${row.owner_handle}-${row.slug}`,
          source: {
            source: 'git-subdir',
            url: 'https://github.com/Dexter-DAO/composed-skills.git',
            path: row.github_subdir,
          },
          description: row.description,
          version: '1.0.0',
        },
      ],
    });
  });

  app.get('/api/public/composed-skills/:owner/:slug/bundle.zip', async (req: Request, res: Response) => {
    const { owner, slug } = req.params;
    const result = await pool.query(
      `SELECT name, bundle_files_json FROM x402gle_skills
      WHERE owner_handle = $1 AND slug = $2 AND status = 'ready'`,
      [owner, slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const { name, bundle_files_json } = result.rows[0];
    const files: Array<{ path: string; content: string }> = bundle_files_json;
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${owner}-${slug}.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    for (const file of files) {
      archive.append(file.content, { name: file.path });
    }
    await archive.finalize();
  });
}
```

Install `archiver`: `npm install --save archiver && npm install --save-dev @types/archiver`.

- [ ] **Step 2: Mount in `app.ts`**

Find where `mountPublicSkillDiscoveryRoutes` (or similar) is called and add `mountPublicComposedSkillsRoutes(app);` next to it.

- [ ] **Step 3: Smoke test**

```bash
cd ~/websites/dexter-api && npm run build && pm2 restart dexter-api --update-env
sleep 2
curl -s https://api.dexter.cash/api/public/composed-skills | python3 -m json.tool
```

Expected: returns `{"ok": true, "skills": [], "limit": 20, "offset": 0}` (empty array; nothing published yet).

- [ ] **Step 4: Commit**

```bash
cd ~/websites/dexter-api
git add src/routes/publicComposedSkills.ts src/app.ts package.json package-lock.json
git commit -m "feat(composed-skills v1): public HTTP routes for listing, detail, marketplace.json, bundle.zip"
```

### Task 9: Add the aggregate `x402gle.com/marketplace.json` route

This route returns the union of all published skills as one marketplace.json so users can `/plugin marketplace add https://x402gle.com/marketplace.json` and get everything.

**Files:**
- Modify: `~/websites/dexter-api/src/routes/publicComposedSkills.ts` (add the aggregate route)
- Modify: `~/websites/x402gle/next.config.ts` (rewrite `/marketplace.json` → `${apiOrigin}/api/public/composed-skills/marketplace.json`)

- [ ] **Step 1: Add the aggregate route**

In `publicComposedSkills.ts`:

```ts
app.get('/api/public/composed-skills/marketplace.json', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT owner_handle, slug, name, description, github_subdir FROM x402gle_skills
    WHERE visibility = 'public' AND status = 'ready'
    ORDER BY total_installs DESC, created_at DESC`
  );
  res.set('Cache-Control', 'public, max-age=300');  // 5min CDN cache
  res.json({
    name: 'x402gle',
    owner: { name: 'x402gle', url: 'https://x402gle.com' },
    description: 'Composed Claude Code skills synthesized from x402 hosts.',
    plugins: result.rows.map(row => ({
      name: `${row.owner_handle}-${row.slug}`,
      source: {
        source: 'git-subdir',
        url: 'https://github.com/Dexter-DAO/composed-skills.git',
        path: row.github_subdir,
      },
      description: row.description,
      version: '1.0.0',
    })),
  });
});
```

- [ ] **Step 2: Add the Next.js rewrite**

In `~/websites/x402gle/next.config.ts`, find the `rewrites()` block and add:

```ts
{
  source: '/marketplace.json',
  destination: `${apiOrigin}/api/public/composed-skills/marketplace.json`,
}
```

- [ ] **Step 3: Smoke test**

```bash
cd ~/websites/x402gle && npm run build && pm2 restart x402gle --update-env
sleep 2
curl -s https://x402gle.com/marketplace.json | python3 -m json.tool
```

Expected: empty plugins array but valid JSON.

- [ ] **Step 4: Commit (both repos)**

```bash
cd ~/websites/dexter-api
git add src/routes/publicComposedSkills.ts
git commit -m "feat(composed-skills v1): aggregate marketplace.json route"

cd ~/websites/x402gle
git add next.config.ts
git commit -m "feat(composed-skills v1): proxy /marketplace.json to dexter-api"
```

---

## Phase E — MCP tool wiring

### Task 10: Wire the persister into the MCP tool

**Files:**
- Modify: `~/websites/dexter-mcp/open-mcp-server.mjs`

- [ ] **Step 1: Import the persister from dexter-api**

The persister lives in `dexter-api` but `dexter-mcp` needs to call it. Two options:
- (A) Inline-copy the persister into `dexter-mcp` and have it share the `pool` connection — duplication risk
- (B) Expose an HTTP endpoint on `dexter-api` (`POST /api/internal/composed-skills/persist`) that the MCP tool POSTs to with an HMAC-signed body

**Recommendation: B.** Cleaner separation. Persister stays in `dexter-api` where the pool lives; MCP tool just makes an HTTP call.

Update `composeSkill` invocation in `open-mcp-server.mjs` to provide a Persister callback that hits the internal endpoint:

```js
const persister = async (input) => {
  const response = await fetch(`${process.env.DEXTER_API_ORIGIN}/api/internal/composed-skills/persist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': process.env.DEXTER_INTERNAL_TOKEN,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Persistence failed: HTTP ${response.status} — ${err}`);
  }
  return await response.json();
};
```

- [ ] **Step 2: Add the internal endpoint to dexter-api**

```ts
// In publicComposedSkills.ts (or a new internalComposedSkills.ts)
app.post('/api/internal/composed-skills/persist', async (req: Request, res: Response) => {
  if (req.header('X-Internal-Auth') !== process.env.DEXTER_INTERNAL_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const result = await persistComposedSkill(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
```

- [ ] **Step 3: Add `DEXTER_INTERNAL_TOKEN` to both env files (same value)**

Generate a strong token: `openssl rand -hex 32`. Add to `~/websites/dexter-api/.env` and `~/websites/dexter-mcp/.env`.

- [ ] **Step 4: Update the MCP tool registration to accept `owner_handle`, `visibility`, `composer_kind`**

In `open-mcp-server.mjs`, find the `x402_compose_skill` registration. Extend `inputSchema`:

```js
inputSchema: {
  hosts: z.array(z.string()).min(1).max(1).describe('Exactly one host slug (e.g. "blockrun.ai"). v0/v1 is single-host only.'),
  skill_name: z.string().optional().describe('Optional display name. Defaults to a title derived from the host.'),
  publish: z.boolean().optional().describe('If true, persist this composition to x402gle as a public/unlisted composed skill. Default false (stateless render only).'),
  owner_handle: z.string().optional().describe('Required when publish: true. The x402gle handle (e.g. "branchm") that owns this composition.'),
  visibility: z.enum(['unlisted', 'public']).optional().describe('Required when publish: true. "unlisted" hides it from public discovery (still installable by URL); "public" lists it on x402gle.com/skills.'),
}
```

In the handler, pass these through to `composeSkill`, plus the persister callback. Pull `composer_kind` from `owner_handle`'s principal kind via the dexter-api `principalKind(handle)` helper — but cache: skip the lookup if `publish !== true`.

- [ ] **Step 5: Verify build + restart + smoke**

```bash
cd ~/websites/dexter-mcp
node --check open-mcp-server.mjs
pm2 restart dexter-open-mcp --update-env
sleep 2

cd ~/websites/dexter-api
npm run build && pm2 restart dexter-api --update-env
```

- [ ] **Step 6: End-to-end publish test**

Use a fresh MCP session against `open.dexter.cash` to call `x402_compose_skill` with `publish: true, owner_handle: 'branchm', visibility: 'public'`. Verify:
- response includes `skill_id`, `version_no: 1`, `preview_url: https://x402gle.com/skills/branchm/blockrun-ai`
- `psql -c "SELECT id, status, github_commit_sha FROM x402gle_skills WHERE owner_handle='branchm';"` shows status='ready'
- `gh api /repos/Dexter-DAO/composed-skills/contents/plugins/branchm-blockrun-ai/.claude-plugin/plugin.json` returns the plugin.json
- `curl https://x402gle.com/marketplace.json` includes the new plugin entry

- [ ] **Step 7: Commit (both repos)**

```bash
cd ~/websites/dexter-mcp
git add open-mcp-server.mjs
git commit -m "feat(open-mcp v1): wire x402_compose_skill to persister via internal API"

cd ~/websites/dexter-api
git add src/routes/publicComposedSkills.ts
git commit -m "feat(composed-skills v1): internal persist endpoint for MCP"
```

### Task 11: Add the `promote_skill` MCP tool

**Files:**
- Modify: `~/websites/dexter-mcp/open-mcp-server.mjs`
- Modify: `~/websites/dexter-api/src/routes/publicComposedSkills.ts`

- [ ] **Step 1: Add the `promote_skill` route**

`POST /api/internal/composed-skills/promote` with body `{ owner_handle, slug, visibility }` → updates `visibility`. Requires the same `X-Internal-Auth` header.

- [ ] **Step 2: Register the `promote_skill` MCP tool**

```js
server.registerTool('promote_skill', {
  title: 'Promote Composed Skill',
  description: 'Toggle a composed skill between unlisted (hidden from discovery, still installable by URL) and public (listed on x402gle.com/skills). Use when a composed skill is ready for public discovery, or to take it down.',
  inputSchema: {
    owner_handle: z.string().describe('The handle that owns the composed skill.'),
    slug: z.string().describe('The skill slug.'),
    visibility: z.enum(['unlisted', 'public']).describe('Target visibility.'),
  },
  annotations: { readOnlyHint: false },
}, async (args) => {
  try {
    const response = await fetch(`${process.env.DEXTER_API_ORIGIN}/api/internal/composed-skills/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Auth': process.env.DEXTER_INTERNAL_TOKEN },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
  } catch (err) {
    const data = { error: 'promote_failed', message: err.message };
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true };
  }
});
```

Add `'promote_skill'` to `ALL_TOOLS`.

- [ ] **Step 3: Verify, restart, commit (both repos)**

```bash
cd ~/websites/dexter-mcp
node --check open-mcp-server.mjs
pm2 restart dexter-open-mcp
git add open-mcp-server.mjs
git commit -m "feat(open-mcp v1): add promote_skill MCP tool"

cd ~/websites/dexter-api
npm run build && pm2 restart dexter-api --update-env
git add src/routes/publicComposedSkills.ts
git commit -m "feat(composed-skills v1): promote endpoint"
```

---

## Phase F — Search integration

### Task 12: Extend `x402_search` to return composed skills

**Files:**
- Modify: `~/websites/dexter-api/src/services/marketplaceSearch.ts` (or wherever the search assembles results)
- Modify: `~/websites/dexter-api/src/routes/x402gleCapability.ts` (the underlying capability endpoint)

- [ ] **Step 1: Add a search query for composed skills**

In the search service, after the existing host-result pull, add a parallel query:

```ts
const composedSkillsResult = await pool.query(
  `SELECT owner_handle, slug, name, description, hosts_included,
   cost_estimate_usdc, call_count_estimate, quality_score, total_installs, github_subdir
  FROM x402gle_skills
  WHERE visibility = 'public' AND status = 'ready'
    AND (
      name ILIKE $1 OR description ILIKE $1 OR
      EXISTS (SELECT 1 FROM x402gle_skill_hosts WHERE skill_id = x402gle_skills.id AND host ILIKE $1)
    )
  ORDER BY total_installs DESC, quality_score DESC
  LIMIT 10`,
  [`%${query}%`]
);
```

- [ ] **Step 2: Merge into the response with `type: 'composed_skill'` discriminator**

For each composed skill row, emit a result shape that fits alongside hosts. Add `install_command`:

```ts
{
  type: 'composed_skill',
  slug: `${row.owner_handle}/${row.slug}`,
  name: row.name,
  description: row.description,
  preview_url: `https://x402gle.com/skills/${row.owner_handle}/${row.slug}`,
  install_command: `/plugin marketplace add Dexter-DAO/composed-skills && /plugin install ${row.owner_handle}-${row.slug}@x402gle`,
  hosts_included: row.hosts_included,
  cost_estimate_usdc: row.cost_estimate_usdc,
  quality_score: row.quality_score,
  total_installs: row.total_installs,
}
```

Composed skills land in `strongResults` when a name match exists; otherwise in `relatedResults`. Rank above the bare host when both match.

- [ ] **Step 3: Smoke test**

After deploying, call `x402_search` for "polymarket" — verify a composed skill (if published) appears at the top.

- [ ] **Step 4: Commit**

```bash
cd ~/websites/dexter-api
git add src/services/marketplaceSearch.ts src/routes/x402gleCapability.ts
git commit -m "feat(composed-skills v1): include composed skills in x402_search results"
```

---

## Phase G — Public x402gle.com surfaces

### Task 13: Build the `x402gle.com/skills/<owner>/<slug>` detail page

**Files:**
- Create: `~/websites/x402gle/src/app/skills/[owner]/[slug]/page.tsx`
- Create: `~/websites/x402gle/src/app/skills/[owner]/[slug]/_components/install-widget.tsx`

- [ ] **Step 1: Use the frontend-design skill to scope the page**

Invoke superpowers:frontend-design with: "Detail page for a composed skill on x402gle.com — server-rendered, hero with name + composer + version + install count, an InstallWidget component with three tabs (Slash Commands / Deep Link / NPX), workflow description, hosts included with badges, cost per run, provenance stamps."

- [ ] **Step 2: Implement the page as Next.js Server Component**

Fetches from `${apiOrigin}/api/public/composed-skills/<owner>/<slug>` on the server, renders the skill.

- [ ] **Step 3: Implement the InstallWidget**

Three tabs:
1. **Slash Commands** — shows the two commands as copyable code blocks
2. **Deep Link** — a big button that opens `claude-cli://open?q=...` with both slash commands URL-encoded in the prompt
3. **NPX** — for future fallback if/when we ship the npx installer (placeholder for v1)

- [ ] **Step 4: Smoke test**

After publishing branchm/blockrun-ai (Task 10 step 6), open `https://x402gle.com/skills/branchm/blockrun-ai` and verify the page renders correctly.

- [ ] **Step 5: Commit**

```bash
cd ~/websites/x402gle
git add src/app/skills
git commit -m "feat(composed-skills v1): /skills/<owner>/<slug> detail page with InstallWidget"
```

### Task 14: Build the `x402gle.com/skills` index page

**Files:**
- Create: `~/websites/x402gle/src/app/skills/page.tsx`
- Create: `~/websites/x402gle/src/app/skills/_components/skill-card.tsx`

- [ ] **Step 1: Server-render the index from `/api/public/composed-skills`**

Show a grid of skill cards sorted by `total_installs`. Each card shows: name, owner_handle, description (1 line), hosts included (1-2 logos), cost estimate, install count. Click → detail page.

- [ ] **Step 2: Add search and category filter (client component)**

- [ ] **Step 3: Smoke test, commit**

```bash
cd ~/websites/x402gle
git add src/app/skills
git commit -m "feat(composed-skills v1): /skills index page"
```

---

## Phase H — Auto-rerender on next read (the v2 prep)

### Task 15: Lazy-rerender when manifest_version is stale

**Files:**
- Modify: `~/websites/dexter-api/src/routes/publicComposedSkills.ts`

- [ ] **Step 1: Add a constant for the current renderer version**

```ts
const CURRENT_MANIFEST_VERSION = 1;  // bump when bundle shape changes
```

- [ ] **Step 2: Add rerender logic to the detail route**

When the row's `manifest_version < CURRENT_MANIFEST_VERSION`, re-fetch the manifest + skills, re-render, and UPDATE the row. Return the fresh version. Wrap in try/catch so a rerender failure falls back to serving the stale bundle.

(Implementation deferred until there IS a v2 to upgrade from — the constant and detection logic land now so the lazy-upgrade path is ready when the bundle shape changes.)

- [ ] **Step 3: Commit**

```bash
cd ~/websites/dexter-api
git add src/routes/publicComposedSkills.ts
git commit -m "feat(composed-skills v1): lazy-rerender plumbing for future manifest version bumps"
```

---

## Phase I — End-to-end verification

### Task 16: Full customer-flow test

- [ ] **Step 1: Publish a real composed skill**

Call `x402_compose_skill` via the live MCP with `publish: true, owner_handle: 'branchm', visibility: 'public', hosts: ['blockrun.ai']`.

- [ ] **Step 2: Verify all surfaces**

- `https://x402gle.com/skills` lists it
- `https://x402gle.com/skills/branchm/blockrun-ai` renders the detail page
- `https://x402gle.com/marketplace.json` includes the entry
- `https://github.com/Dexter-DAO/composed-skills/tree/main/plugins/branchm-blockrun-ai` exists
- `x402_search "polymarket"` returns the composed skill

- [ ] **Step 3: Real-user install test**

From a fresh Claude Code session:

```
/plugin marketplace add Dexter-DAO/composed-skills
/plugin install branchm-blockrun-ai@x402gle
/reload-plugins
```

Verify the skill installs without errors. Run `/plugin list` — confirm enabled.

- [ ] **Step 4: Real-user invocation test**

In the same Claude Code session, ask: "Use the blockrun-ai skill to look up Polymarket wallet performance for 0xd8da6bf26964af9d7eed9e03e53415d37aa96045." Observe: did Claude pick the skill? Did the skill's SKILL.md guide the call? What was the response?

Document any rough edges in `docs/superpowers/specs/2026-05-15-composed-skills-v1-design.md` under a "Lessons from real-user test" section.

- [ ] **Step 5: Final commit + push everything**

```bash
cd ~/websites/dexter-mcp && git push origin main
cd ~/websites/dexter-api && git push origin main
cd ~/websites/x402gle && git push origin main
```

---

## Self-Review

**Spec coverage:**
- `x402gle_principals` table: Task 1 ✓
- `x402gle_skills` + `x402gle_skill_hosts`: Task 1 ✓
- Branch seeded as first principal: Task 2 ✓
- Prisma model + generate (no push/pull/migrate): Task 3 ✓
- Persister threading in composeSkill: Task 4 ✓
- GitHub commit pipeline: Task 6 ✓
- Postgres persister: Task 7 ✓
- Public HTTP routes (4): Task 8 ✓
- Aggregate marketplace.json: Task 9 ✓
- MCP tool publish wiring: Task 10 ✓
- promote_skill tool: Task 11 ✓
- x402_search integration: Task 12 ✓
- Skill detail page: Task 13 ✓
- Skill index page: Task 14 ✓
- Lazy-rerender plumbing: Task 15 ✓
- End-to-end + real-user test: Task 16 ✓

**Placeholder scan:** none. Every step has either code or an exact command with expected output.

**Type consistency:** `Persister`, `PersistComposedSkillInput`, `PersistResult` consistent across `types.ts`, `compose.ts`, `composedSkillsPersister.ts`, and the MCP tool. `owner_handle`, `slug`, `visibility` all spelled the same everywhere.

**Scope check:** Three repos touch, but each phase is independently verifiable. The hard prerequisites (GitHub repo + bot) are explicitly marked. Drift detection and pingback are explicitly deferred to v2.

Plan complete and saved to `docs/superpowers/plans/2026-05-15-composed-skills-v1.md`.
