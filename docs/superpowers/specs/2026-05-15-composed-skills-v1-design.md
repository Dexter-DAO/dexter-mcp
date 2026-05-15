# Composed Skills v1 — Design

**Date:** 2026-05-15
**Status:** Draft for review
**Author:** Branch + Claude
**Builds on:** `2026-05-15-composed-skills-design.md` (v0 spec, locked) and `2026-05-15-composed-skills-v0.md` (v0 plan, shipped)

---

## What this is

v0 shipped `x402_compose_skill` as a stateless render — call it, get an inline 7-file bundle, no persistence. v1 adds **persistence, publishing, and one-paste install** so composed skills become a real product surface that lives at `x402gle.com/skills/<owner>/<slug>` and installs into Claude Code with a single `/plugin marketplace add` paste.

v1 is the bridge between "we have a primitive" and "users actually find and install these things."

## Why v0 alone is not enough

After v0 shipped I tried the real customer flow: install the generated bundle into Claude Code, see what an actual user would experience. Two findings:

1. **The bundle was structurally wrong** in one field (`skills[]` referenced `SKILL.md` instead of the directory). Fixed in `e996490` with a lock-down test. Confirmed the install actually works now.
2. **The install dance is too long.** A user has to:
   - Know `x402_compose_skill` exists
   - Call it via an MCP client
   - Save the 7 returned files to disk somewhere
   - Run `/plugin marketplace add <local-path>`
   - Run `/plugin install <slug>@<marketplace-name>`
   - Probably never do any of this

   Branch's response: "they're never gonna do all that."

v1 fixes the install dance.

## Anthropic plugin install constraints (researched today)

Critical research findings I confirmed against the official docs:

| Constraint | Implication |
|---|---|
| `claude-cli://open` deep links exist but only prefill prompts. **No `claude-cli://install` exists.** | We can't ship a true one-click install button. The closest is "click → Claude Code opens with install commands prefilled." |
| `/plugin marketplace add` accepts a remote URL pointing at a `marketplace.json` | We can host `marketplace.json` on `x402gle.com`. |
| URL-hosted `marketplace.json` **CANNOT serve plugin tarballs from the same domain.** Plugin sources inside must be git or npm. | Every published composed skill must live in a git repo. Cannot live only on x402gle.com. |
| Plugin hint protocol (`<claude-code-hint />` stderr marker) only works for plugins in **Anthropic's official marketplace.** | Not usable for third-party marketplaces; ignore until we ever submit to `claude-plugins-official`. |
| `--plugin-url <zip>` loads a remote zip for one session only, not persistent install | Not a viable install path. |
| Plugin install copies to `~/.claude/plugins/cache` and cannot reference files outside the plugin directory | Bundles must be fully self-contained. |
| Mobile / ChatGPT have no plugin install path | Plugins are Claude Code desktop only. v1 install UX targets desktop. |

Memory file `reference_claude_code_plugin_install_paths.md` captures these for future sessions.

## The user journey v1 unlocks

Today (v0): user calls MCP tool, gets 7 files inline, saves to disk, installs manually. Nobody does this.

After v1:

**Path A — Agent already on OpenDexter:**
1. User: "find me a Polymarket trader API"
2. Agent calls `x402_search` → results include both raw hosts AND composed skills tagged `type: composed_skill`
3. Agent presents the composed skill with an inline install command
4. User pastes the command in Claude Code, hits Enter
5. Skill installed, agent uses it on the next request

**Path B — Found via x402gle.com:**
1. User clicks `x402gle.com/skills/branchm/polymarket-pulse` from a tweet
2. Sees a polished page: positioning, what it does, hosts included, cost per run
3. Clicks "Install" → page copies two slash commands to clipboard
4. User pastes into Claude Code, hits Enter twice
5. Skill installed

**Path C — Deep link:**
1. User clicks the deep-link button on the same page
2. Claude Code opens with the install commands prefilled in the prompt box
3. User hits Enter
4. Skill installed

All three paths are universal (no client-feature dependency beyond Claude Code desktop existing). No `marketplace add` knowledge required from the user — they just paste or click.

---

## Scope

### v1 ships

- **Database tables** (`x402gle_skills`, `x402gle_skill_hosts`) via raw SQL migration in `dexter-api/supabase/migrations/`
- **Owner handle resolution** — `handle` column added to `x402_seller_profiles` so `x402gle.com/skills/branchm/...` URLs work
- **Persistence in `composeSkill()`** — `publish: true` parameter actually saves to Postgres
- **Public API routes** on `dexter-api`:
  - `GET /api/public/composed-skills` (list, paginated, searchable)
  - `GET /api/public/composed-skills/:owner/:slug` (full record)
  - `GET /api/public/composed-skills/:owner/:slug/marketplace.json` (single-plugin marketplace.json for `/plugin marketplace add`)
  - `GET /api/public/composed-skills/:owner/:slug/bundle.zip` (downloadable bundle)
- **GitHub monorepo backbone** — `Dexter-DAO/composed-skills` repo, one subdirectory per published skill
- **Auto-commit on publish** — when a skill is published, dexter-api commits the bundle to the monorepo and updates `marketplace.json` to reference it via `git-subdir` source
- **`x402gle.com/marketplace.json`** — aggregate marketplace listing every published composed skill (referenced via git-subdir into the monorepo)
- **`x402gle.com/skills/<owner>/<slug>` page** — public skill detail page with install widgets
- **`x402gle.com/skills` index/leaderboard** — browse all published composed skills
- **`x402_search` integration** — search returns composed skills alongside raw hosts, with `type: composed_skill` discriminator
- **Updated `x402_compose_skill` MCP tool** — accepts `publish: true` (now meaningful), `visibility: "unlisted" | "public"`, and returns `preview_url`
- **`promote_skill` MCP tool** — moves an unlisted skill to public listing (admin or composer only)

### v1 explicitly DOES NOT ship (deferred to v2)

- **Drift detection** (background job that flags composed skills when an upstream host manifest version bumps past `pinned_host_version`)
- **Pingback telemetry** (composed skills phoning home when invoked)
- **Capability and workflow input modes** (`capability: "..."` and `workflow: "..."` for `x402_compose_skill`)
- **Multi-host composition** (still single-host only)
- **Admin pending workflow** (composed skills published as `unlisted` skip the admin review path; admin can manually promote anything via SQL or the existing admin page)
- **User authentication for publishing** (v1 publishing is keyed by the wallet that owns the host; merchant-authored composed skills work via existing seller-profile auth)

### v1 explicitly DOES NOT touch

- The v0 `@dexterai/x402-skills` package primitives stay as-is (they just gain new consumers)
- The existing `x402_compose_skill` MCP tool signature stays compatible (additive params only)
- Existing host manifest infrastructure
- The x402gle homepage or any non-skill surface

---

## Architecture

### Data model

```sql
-- 1. Add handle resolution to seller profiles
ALTER TABLE x402_seller_profiles
  ADD COLUMN IF NOT EXISTS handle TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS x402_seller_profiles_handle_unique
  ON x402_seller_profiles (LOWER(handle))
  WHERE handle IS NOT NULL;

-- 2. Composed skills table
CREATE TABLE IF NOT EXISTS x402gle_skills (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_handle          TEXT NOT NULL,
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
  composer_id           TEXT,           -- wallet address, supabase user id, or 'system'

  hosts_included        TEXT[] NOT NULL,
  workflow_json         JSONB NOT NULL, -- input shape (hosts, options, etc.)
  bundle_md             TEXT NOT NULL,  -- pre-rendered SKILL.md
  bundle_files_json     JSONB NOT NULL, -- all rendered bundle files as [{path, content}]

  cost_estimate_usdc    NUMERIC,
  call_count_estimate   INTEGER,

  quality_score         NUMERIC DEFAULT 0,
  total_installs        INTEGER DEFAULT 0,
  total_runs            INTEGER DEFAULT 0,

  github_commit_sha     TEXT,           -- the commit SHA in Dexter-DAO/composed-skills for this version
  github_subdir         TEXT,           -- the subdir path in the monorepo (e.g., "branchm/polymarket-pulse")

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

-- 3. Host membership table (M2M with attribution)
CREATE TABLE IF NOT EXISTS x402gle_skill_hosts (
  skill_id          UUID NOT NULL REFERENCES x402gle_skills(id) ON DELETE CASCADE,
  host              TEXT NOT NULL,
  pinned_version    INTEGER NOT NULL,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (skill_id, host)
);

CREATE INDEX IF NOT EXISTS x402gle_skill_hosts_host_idx
  ON x402gle_skill_hosts (host, pinned_version);

-- 4. Updated-at trigger
CREATE OR REPLACE FUNCTION x402gle_skills_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS x402gle_skills_touch_updated_at_trg ON x402gle_skills;
CREATE TRIGGER x402gle_skills_touch_updated_at_trg
  BEFORE UPDATE ON x402gle_skills
  FOR EACH ROW EXECUTE FUNCTION x402gle_skills_touch_updated_at();
```

After running the SQL by hand against the Supabase Postgres, run `prisma generate` (NOT `prisma db push` / `pull` / `migrate`) so the generated client picks up the new `handle` column on `x402_seller_profiles`. The composed-skills tables themselves are accessed via raw SQL through the existing pool — they don't need a Prisma model (same pattern as `x402_host_manifests`).

### Publishing flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ x402_compose_skill({ hosts: ["blockrun.ai"], publish: true,             │
│                       visibility: "public", owner_handle: "branchm" })   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Resolve owner_handle to seller profile (auth check)                  │
│ 2. composeSkill() — same v0 primitive, returns 7 files inline           │
│ 3. INSERT INTO x402gle_skills (status='generating')                     │
│ 4. INSERT INTO x402gle_skill_hosts                                      │
│ 5. Commit bundle to Dexter-DAO/composed-skills under branchm/blockrun-ai│
│ 6. UPDATE x402gle_skills SET status='ready', github_commit_sha=...      │
│ 7. Return { slug, preview_url: "x402gle.com/skills/branchm/blockrun-ai" │
│                                                                        }│
└─────────────────────────────────────────────────────────────────────────┘
```

The GitHub commit step uses a dedicated bot account and a personal access token in `dexter-api`'s env (`COMPOSED_SKILLS_GITHUB_TOKEN`). Push happens via direct Git over HTTPS using `@octokit/rest` for marketplace.json updates and a simple `git clone --depth 1 + add + commit + push` shell call for the bundle write.

### Marketplace structure (the install backbone)

**Monorepo: `Dexter-DAO/composed-skills`** (new repo).

```
composed-skills/
├── .claude-plugin/
│   └── marketplace.json     ← aggregates all composed skills (this IS the install index)
├── README.md
├── LICENSE
└── plugins/
    ├── branchm-blockrun-ai/
    │   ├── .claude-plugin/
    │   │   └── plugin.json
    │   ├── README.md
    │   ├── LICENSE
    │   └── skills/
    │       └── blockrun-ai/
    │           ├── SKILL.md
    │           ├── references/endpoints.md
    │           └── assets/output-template.md
    ├── alice-stripe-pricing/
    │   └── ...
    └── (more)
```

Naming flatness: monorepo subdirs are `<owner>-<slug>/` (flat) to keep `marketplace.json` entries simple. The URL surface stays `x402gle.com/skills/<owner>/<slug>` (visually scoped).

**`marketplace.json` schema:**

```json
{
  "name": "x402gle",
  "owner": {
    "name": "x402gle",
    "url": "https://x402gle.com"
  },
  "description": "Composed Claude Code skills synthesized from x402 hosts.",
  "plugins": [
    {
      "name": "branchm-blockrun-ai",
      "source": "./plugins/branchm-blockrun-ai",
      "description": "blockrun.ai prediction-market analytics composed by branchm",
      "version": "1.0.0",
      "category": "prediction-markets",
      "tags": ["polymarket", "kalshi", "wallet-analytics"]
    }
    // ... one entry per published composed skill
  ]
}
```

Why relative paths inside this marketplace.json instead of git-subdir per plugin: when a user runs `/plugin marketplace add Dexter-DAO/composed-skills`, the entire repo is cloned. Relative paths resolve correctly. This is the GitHub-as-marketplace-source path Anthropic explicitly supports.

**Alternative URL surface:** `x402gle.com/marketplace.json` (a server-rendered copy of the monorepo's marketplace.json, but with each plugin's `source` rewritten to `git-subdir` so URL-hosted-marketplace consumers also work). This is the "users who already have a different marketplace.json setup but want to point at x402gle by URL" path. Both surfaces stay in sync because both render from the same `x402gle_skills` rows.

### Install paths exposed to the user (three flavors)

**1. GitHub-cloned marketplace (shortest):**

```
/plugin marketplace add Dexter-DAO/composed-skills
/plugin install branchm-blockrun-ai@x402gle
```

Two slash commands. Both copy to clipboard with one click.

**2. URL-hosted marketplace (for users who don't want to add the monorepo):**

```
/plugin marketplace add https://x402gle.com/marketplace.json
/plugin install branchm-blockrun-ai@x402gle
```

Same UX, different source. URL-hosted variant uses git-subdir sources internally.

**3. `claude-cli://` deep link (button):**

The button on `x402gle.com/skills/<owner>/<slug>` generates this URL:

```
claude-cli://open?q=%2Fplugin%20marketplace%20add%20Dexter-DAO%2Fcomposed-skills%0A%2Fplugin%20install%20<owner>-<slug>%40x402gle
```

URL-encoded prompt = `/plugin marketplace add Dexter-DAO/composed-skills\n/plugin install <owner>-<slug>@x402gle`. User clicks → Claude Code opens with both commands prefilled → user hits Enter.

### `x402_search` integration

When `x402_search` returns results, it currently only returns raw x402 hosts (`type: "host"` implicit). v1 adds composed skills to the result mix:

```ts
{
  strongResults: [
    {
      type: "composed_skill",
      slug: "branchm/blockrun-ai",
      name: "Blockrun",
      preview_url: "https://x402gle.com/skills/branchm/blockrun-ai",
      install_command: "/plugin marketplace add Dexter-DAO/composed-skills && /plugin install branchm-blockrun-ai@x402gle",
      description: "Polymarket and Kalshi prediction market analytics",
      hosts_included: ["blockrun.ai"],
      quality_score: 88,
      total_installs: 14,
      // ...
    },
    {
      type: "host",
      // existing host shape
    }
  ]
}
```

Composed skills are ranked alongside hosts using `quality_score`, `total_installs`, and `total_runs` (when those start populating). When a composed skill exists that wraps a host the user is searching for, it should rank ABOVE the bare host because it's the higher-leverage path (install once, use forever).

### Public x402gle.com surfaces

**`/skills` (index page):**
- Top of page: search box + tag filter
- Grid: composed skill cards (name, composer, hosts included, install count, "Install" button)
- Footer: "Compose your own" CTA pointing at docs

**`/skills/<owner>/<slug>` (detail page):**
- Hero: name, composer with badge, version, last-updated, install count
- One big Install button → reveals the three install paths (Path 1, 2, 3 above)
- Workflow diagram (rendered from the manifest)
- Hosts included (linked to their `/servers/<host>` pages)
- Cost per run estimate
- "Open in Claude Code" deep-link button (Path 3)
- Provenance stamp (composer + per-host stamps)

Both pages are server-rendered Next.js pages that query `api.dexter.cash/api/public/composed-skills/...`. Existing dexter-fe / x402gle Next.js patterns apply.

---

## Decisions locked for v1

| # | Decision | Choice | Reasoning |
|---|---|---|---|
| 1 | Owner handle storage | New `handle` column on `x402_seller_profiles` | Existing table; no new table needed; reuses wallet-based auth. |
| 2 | Handle uniqueness | Case-insensitive unique index | `BranchM` and `branchm` collide. Prevents impersonation. |
| 3 | Monorepo location | `Dexter-DAO/composed-skills` (new public repo) | Public so anyone can `/plugin marketplace add Dexter-DAO/composed-skills` without auth. Subdirectory per skill. |
| 4 | Bundle storage | Both Postgres (`bundle_files_json`) AND GitHub | Postgres = fast read for API; GitHub = the install backbone. Two writes; we eat the cost. |
| 5 | Publishing auth | Wallet owner of one of the hosts in the bundle, OR x402gle admin | Same model as host manifests. No new auth flow. |
| 6 | Visibility default | `unlisted` | Composer must explicitly promote to `public`. Prevents registry flood. |
| 7 | Promotion path | Composer self-service via `promote_skill` MCP tool | Manual admin review deferred to v2. Trust quality_score + ranking instead. |
| 8 | Drift detection | Deferred to v2 | `pinned_version` is captured; flagging logic comes later. |
| 9 | Pingback telemetry | Deferred to v2 | Existing `x402.dexter.cash/api/x402/telemetry` is ready; the bundle code that emits the pingback is the v2 work. |
| 10 | Search ranking | Composed skills rank ABOVE the host they wrap when both match a query | Higher-leverage path; install once, use forever. |
| 11 | Cross-marketplace compat | Both `Dexter-DAO/composed-skills` AND `x402gle.com/marketplace.json` are supported install sources | Cover users on either Anthropic install pattern. |
| 12 | Deep-link install button | Generates `claude-cli://open?q=...` with the slash commands prefilled | The closest thing to one-click that actually exists in Claude Code today. |

## What competitors structurally still cannot do

After v1 ships, the moat hardens:

- **Flow** can't follow because they're a UI for *local* compositions. They have no marketplace, no GitHub commit pipeline, no public surface, no ranking. Their users compose; ours publish.
- **AgentCash** can't follow because their `/.well-known/x402` discovery returns raw schemas, not synthesized clusters. They have nothing to compose from.
- **Pay.sh** can't follow because their CI-gated catalog is human-curated. They could in theory add this feature, but they don't have the synthesized manifest pipeline that makes composition automatic.

Composed skills as public x402gle objects with a GitHub-backed install path is something only x402gle can ship, because only x402gle has the manifests + the facilitator-attribution data + the agent-facing MCP server to surface them through.

## Risks and known sharp edges

**GitHub rate limits.** A public repo with high commit frequency may bump into GitHub's API limits. v1 mitigates via:
- Bot account with its own quota
- Batch commits (one commit per push, even when multiple publishes queue up within a short window — debounce 10s like the aggregates flush)
- Fallback: 503 on `publish: true` if rate-limited, with a Retry-After hint

**Bundle staleness in GitHub.** A composed skill published at host v3 will sit in the monorepo even when the host moves to v4. v1 explicitly does not auto-update; v2 adds drift detection. Acceptable because the bundle is pinned-by-design.

**marketplace.json bloat.** Every published composed skill adds an entry. At 10K skills the file is large but still JSON-streamable. v2 may split by category if it becomes a problem.

**Spam / abuse.** Anyone with a wallet that owns a host can publish skills for that host. Mitigations:
- `unlisted` by default
- Admin can `UPDATE x402gle_skills SET visibility = 'archived'` to hide bad ones
- `quality_score` + `total_installs` drown spam in ranking
- v2 adds proper admin review

**`x402gle.com/marketplace.json` size.** As above. Cache aggressively (5-minute CDN TTL), regenerate on every publish.

**Mobile users still locked out.** Plugins are Claude Code desktop only. v1 page shows mobile users an "install on desktop" affordance with a link to send themselves the URL.

---

## Testing approach

- **Unit tests:** the new SQL helpers (`upsertComposedSkill`, `loadComposedSkill`, `listComposedSkills`) get unit tests against a test schema
- **Integration tests:** mock the GitHub commit step, verify that publishing produces the right rows + bundle_files_json
- **End-to-end smoke:** publish a composed skill, fetch the marketplace.json, run `/plugin marketplace add` + `/plugin install` against the real Dexter-DAO/composed-skills repo, confirm the plugin loads
- **Real user test:** Branch installs a composed skill himself via the URL flow and uses it for a real prediction-market question

---

## What v0 already did that this builds on

- `@dexterai/x402-skills@1.0.0` workspace package: composer primitive + 7 renderers + `fetchHostManifest` + `fetchHostSkills`
- `x402_compose_skill` MCP tool on `dexter-open-mcp`
- Plugin bundle structure that installs cleanly into Claude Code (verified end-to-end after the `skills[]` directory fix)
- 48 unit tests passing

v1 reuses every line of that. The composer primitive doesn't change; only its consumers do.

## Open questions to lock before plan-writing

1. **Repo creation timing.** Create `Dexter-DAO/composed-skills` empty (with just `marketplace.json` skeleton) BEFORE the v1 plan executes, or as the first step of execution? **Recommendation: before**, manually, so the plan can assume the repo exists.

2. **Handle assignment for existing sellers.** When the `handle` column lands, existing seller profiles get `handle = NULL`. They need handles before they can publish. Options: (a) auto-generate from `display_name`, (b) leave NULL and require self-set via a future profile page, (c) admin assigns. **Recommendation: a + b** — auto-generate a best-guess from display_name; let sellers override later.

3. **Bot account.** Need a GitHub bot account for the commit pipeline. Naming and PAT scopes need to be set up before execution. **Recommendation: `dexter-skill-bot` with `repo` scope on `Dexter-DAO/composed-skills` only.**

4. **First handle for branchm.** When the handle migration runs and Branch is the first user, what's his handle? **Recommendation: `branchm`** (matches his X handle).

5. **Schema-bump policy.** `manifest_version` is set to `1` for v1. When v2 changes the bundle shape, do old rows auto-rerender or stay frozen? **Recommendation: stay frozen, with a `regenerate_skill` MCP tool added in v2 for one-off rerenders.**

If any of these decisions need pushback before plan-writing, surface them now.

---

## Next steps after this spec is locked

1. `gsd:plan-phase` style implementation plan (separate doc at `docs/superpowers/plans/2026-05-15-composed-skills-v1.md`)
2. Subagent-driven execution per task
3. SQL migrations applied manually + `prisma generate` (per Branch's rule: no `db push`, no `db pull`, no `migrate dev/deploy/reset`)
4. GitHub bot account + repo created before code execution starts
