# Composed Skills — Design

**Date:** 2026-05-15
**Status:** Approved for v0 implementation
**Author:** Branch + Claude (brainstormed in OpenDexter MCP session)

---

## What this is

A new artifact type and tool surface for OpenDexter: **composed skills**. A composed skill is a Claude Code skill bundle — full plugin/marketplace tree — generated from one or more x402gle host manifests. v0 is single-host and stateless. v3 (the eventual state we are designing toward from day one) is public, first-class objects on x402gle.com with their own discovery, ranking, provenance, and recommendation surface.

The composer primitive lives in a new workspace package `@dexterai/x402-skills`. The MCP-facing tool is `x402_compose_skill`, registered on `dexter-open-mcp`.

## Why now

Three forces converged this week:

1. **Pay.sh launched** (Solana Foundation + Google Cloud) using x402 + MPP. The agent-payment category is now funded and branded — positioning matters more than feature parity.
2. **AgentCash 0.14.4 shipped** with mppx support but a frozen agent-facing tool surface. Their `instructions.md` is prescriptive; ours is descriptive. We have richer manifest data but worse agent ergonomics.
3. **Must-be-Ash/flow shipped** (Coinbase DevRel, May 15) — a visual canvas that exports Claude Code skill bundles from x402 service nodes. Proves that **skill bundles are the composability primitive that wins**, because they are universal across MCP clients (ChatGPT, Claude Desktop, Cursor, Codex). Dynamic tool registration (`mount_host`-style) requires `notifications/tools/list_changed`, which most clients cache at connect and never refresh.

The structural insight: **the agent surface is the product, not the tools**. Composed skills are how x402gle's synthesized manifests reach every MCP client without us having to ship a client-compatibility matrix.

## What competitors structurally cannot do

- **Flow** is a single-user canvas. Compositions exist on user disks. No marketplace, no discovery, no attribution, no ranking.
- **AgentCash** is a wallet client backed by `@agentcash/discovery`. They scrape `/.well-known/x402` for raw schemas. They do not synthesize, cluster, or attribute capabilities cross-host.
- **Pay.sh** is Solana-only with a CI-gated provider catalog (~30 providers). Curated walled garden.

x402gle has the synthesized manifests (48K corpus / 2K public working set, capability clustering, workflows, provenance stamps, version history), the facilitator rail, and the data attribution Merit cannot match. Composed skills weaponize all of it into one shareable artifact.

---

## Scope

### v0 (this spec)

- `@dexterai/x402-skills@1.0.0` package with `composeSkill()` primitive
- `x402_compose_skill` MCP tool on `dexter-open-mcp`
- Single-host mode only (`hosts: [one_host]`)
- `publish: false` only — returns inline files, persists nothing
- Bundle envelope matches Anthropic Claude Code plugin spec (so `/skill install` works natively)
- Bundle content rendered from the host's existing synthesized manifest (positioning, workflows, capability clusters)
- Manifest fetched via public HTTP (`x402gle.com/api/public/skills/:host/manifest`) — no DB coupling

### v1 (next spec)

- `capability` input mode (semantic search across cluster summaries → top-N hosts → compose)
- `workflow` input mode (English → LLM decomposition → host selection → compose)
- Multi-host compositions with `references/playbooks.md` for branching
- Persisting composed skills to Postgres (`x402gle_skills` table), still unpublished

### v3 (the eventual state, schema-locked today)

- Public x402gle objects at `x402gle.com/skills/<owner>/<slug>`
- Scoped slug ownership (`branchm/research-and-narrate`)
- Unlisted by default → `promote_skill` action moves to public listing (admin pending workflow TBD — separate spec)
- Pin + notify drift policy (composed skills pin to a host manifest version; flagged when upstream changes)
- Pingback telemetry via existing `x402.dexter.cash/api/x402/telemetry` sink
- Discovery surface: `x402gle.com/skills` leaderboard + extended `x402_search` results
- Composer kinds: `ai_authored`, `user_authored`, `merchant_authored` with reputation-weighted ranking
- No minimum host count (a merchant-only composition of 4 of their own endpoints is allowed; quality_score and run count sort it)

### Out of scope (forever, or until otherwise decided)

- Dynamic mid-session tool registration (`mount_host`). Universal client compatibility wins.
- Compose-time payment execution. Skills *describe* paid calls; the consuming agent executes them via their own x402 stack.
- Editing composed skills from outside x402gle's admin UI. Only the composer (or x402gle admin) can edit.

---

## Architecture

### Package layout

```
dexter-mcp/
├── packages/
│   ├── x402-core/              ← existing: capabilitySearch, checkEndpointPricing
│   └── x402-skills/            ← NEW
│       ├── package.json        (name: "@dexterai/x402-skills", version: "1.0.0")
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts        (public exports)
│       │   ├── compose.ts      (composeSkill primitive)
│       │   ├── fetch.ts        (fetchHostManifest via HTTP)
│       │   ├── render/
│       │   │   ├── skill-md.ts       (SKILL.md from manifest)
│       │   │   ├── endpoints.ts      (references/endpoints.md)
│       │   │   ├── output.ts         (assets/output-template.md)
│       │   │   ├── plugin.ts         (plugins/<slug>/.claude-plugin/plugin.json)
│       │   │   └── marketplace.ts    (.claude-plugin/marketplace.json)
│       │   └── types.ts        (ComposedSkill, BundleFile, ComposerInput, etc.)
│       └── README.md
```

**Why a separate package** (not folded into `x402-core`): the composed-skills schema will evolve fast over the next 1–3 months (provenance, publishing rules, drift detection, pingback wire format). `x402-core` is stable and should not be dragged through major bumps. Plan: once `x402-skills` schema stabilizes, fold it into `x402-core@2.0.0` as a subpath export (`@dexterai/x402-core/skills`). Two-phase rollout, not indecision.

### Data flow (v0)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Agent calls x402_compose_skill({ hosts: ["blockrun.ai"] })      │
  │  on dexter-open-mcp                                              │
  └──────────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  open-mcp-server.mjs handler                                     │
  │    → composeSkill(input) from @dexterai/x402-skills              │
  └──────────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  fetchHostManifest("blockrun.ai")                                │
  │    GET https://x402gle.com/api/public/skills/blockrun.ai/manifest│
  │  (Returns cached manifest regardless of synthesis status — the   │
  │   bug fix from 2026-05-14)                                       │
  └──────────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  renderBundle(manifest, options) → BundleFile[]                  │
  │    plugins/<slug>/.claude-plugin/plugin.json                     │
  │    plugins/<slug>/skills/<slug>/SKILL.md                         │
  │    plugins/<slug>/skills/<slug>/references/endpoints.md          │
  │    plugins/<slug>/skills/<slug>/assets/output-template.md        │
  │    .claude-plugin/marketplace.json                               │
  │    README.md, LICENSE                                            │
  └──────────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  Tool response: { slug, files: [{path, content}], cost_estimate, │
  │                   hosts_included, installation_instructions }    │
  │  Returned as inline text — universal across MCP clients          │
  └──────────────────────────────────────────────────────────────────┘
```

### Tool surface

```ts
x402_compose_skill({
  hosts: string[];                    // v0: exactly one host
  skill_name?: string;                // defaults to derived from host name
  publish?: boolean;                  // v0: always false (ignored if true)
}) → {
  slug: string;
  name: string;
  files: { path: string, content: string }[];
  hosts_included: {
    host: string;
    version_no: number;
    provenance: "merchant_reviewed" | "merchant_edited" | "ai_authored";
  }[];
  cost_estimate: { amount: string, asset: string, chain: string } | null;
  call_count_estimate: number;
  installation_instructions: string;
}
```

The MCP tool description should be **prescriptive** (per the Pay.sh `instructions.md` lesson):

> "Use this tool when the user wants to install an x402gle host's capabilities as a reusable Claude Code skill. The output is a complete skill bundle that the user saves to disk and installs via `/skill install`. Do not use this to call a host directly — for that, use `x402_fetch`. Always inspect `hosts_included` provenance before recommending installation; prefer merchant-reviewed bundles when available."

### Bundle envelope (Anthropic-spec)

Matches Must-be-Ash/flow's reference structure verbatim because the spec is Anthropic's, not Ash's:

```
<skill-name>/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/<slug>/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── README.md
│   └── skills/<slug>/
│       ├── SKILL.md
│       ├── references/
│       │   └── endpoints.md
│       └── assets/
│           └── output-template.md
├── README.md
└── LICENSE         (MIT)
```

### Bundle content (ours)

The `SKILL.md` is rendered directly from the host manifest's synthesized fields:

```yaml
---
name: <skill_name>
version: 1.0.0
description: <manifest.positioning>
authored_by: x402gle
authored_at: 2026-05-15T...
pinned_host_version: <manifest.version_no>
host_provenance: <ai_authored | merchant_reviewed | merchant_edited>
---

# <skill_name>

## What this skill does
<manifest.host_overview>

## When to use it
<manifest.routing_guidance>

## Cost
Per run: <sum of capability_clusters[].price>
Asset: USDC
Chain: <chain>

## Workflow

<for each workflow in manifest.workflows>
### <workflow.name>
<workflow.description>

Steps:
<numbered list from workflow.steps>
</for>

## Capabilities

<for each cluster in manifest.capability_clusters>
- **<cluster.name>** — <cluster.description>
  Endpoints: <cluster.endpoints.length>
  Price: <cluster.price>
</for>

## Provenance
This skill was synthesized by x402gle from <host>'s manifest at v<version_no>.
Current host manifest: https://x402gle.com/servers/<host>
```

`references/endpoints.md` flattens every paid call referenced by the workflow: URL, method, input schema, price, auth.

`assets/output-template.md` shows what success looks like — pulled from manifest's example responses if present, otherwise a generic "the skill returns the response shape from the final endpoint."

`plugin.json` and `marketplace.json` are mechanical Anthropic-spec boilerplate.

`README.md` is the human-readable summary: what it does, what hosts it uses, how to install (`/skill install <path>` or drop into `~/.claude/skills/`), how much it costs to run.

---

## v3 schema (locked today even though we don't ship it in v0)

This is the persisted shape composed skills take when publishing lands. Schema is designed now so v0 → v1 → v3 needs zero migrations.

```sql
CREATE TABLE x402gle_skills (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_handle          text NOT NULL,                -- "branchm" (scoped slug owner)
  slug                  text NOT NULL,                -- "research-and-narrate"
  name                  text NOT NULL,
  description           text,
  version_no            int  NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'ready', -- ready | generating | failed
  visibility            text NOT NULL DEFAULT 'unlisted', -- unlisted | public

  composer_kind         text NOT NULL,                -- ai_authored | user_authored | merchant_authored
  composer_id           text,                         -- wallet, supabase user id, or 'system'
  hosts_included        text[] NOT NULL,
  workflow_json         jsonb NOT NULL,               -- ComposedSkill shape (compose input + render output)
  bundle_md             text NOT NULL,                -- pre-rendered SKILL.md
  bundle_files_json     jsonb NOT NULL,               -- all rendered bundle files as { path, content }

  cost_estimate_usdc    numeric,
  call_count_estimate   int,

  quality_score         numeric DEFAULT 0,
  total_installs        int     DEFAULT 0,
  total_runs            int     DEFAULT 0,

  merchant_reviewed_at  timestamptz,
  merchant_edited_at    timestamptz,
  last_error            text,                          -- scrubbed from public payloads (same rule as host manifests)

  manifest_version      int NOT NULL DEFAULT 1,        -- schema version for forward compat

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (owner_handle, slug)
);

CREATE TABLE x402gle_skill_hosts (
  skill_id          uuid REFERENCES x402gle_skills(id) ON DELETE CASCADE,
  host              text NOT NULL,                     -- references x402gle_host_manifests.host
  pinned_version    int  NOT NULL,                     -- host manifest version_no at compose time
  step_position     int  NOT NULL,
  step_kind         text NOT NULL,                     -- service | instruction | decision
  drift_flagged     boolean DEFAULT false,             -- set true when upstream host advances past pinned_version
  drift_flagged_at  timestamptz,
  added_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_id, host, step_position)
);
```

### v3 public routes (mirror the host routes contract)

| Host route (existing) | Skill route (v3) |
|---|---|
| `GET /api/public/skills/:host/manifest` | `GET /api/public/composed-skills/:owner/:slug/manifest` |
| `GET /api/public/skills/:host/SKILL.md` | `GET /api/public/composed-skills/:owner/:slug/SKILL.md` |
| `GET /api/public/skills/:host/skills.json` | `GET /api/public/composed-skills/:owner/:slug/bundle.zip` |
| `GET /api/public/skills/:host/manifest.sse` | `GET /api/public/composed-skills/:owner/:slug/manifest.sse` |

Same contract as the host routes: cached content wins, status tells truth, `last_error` scrubbed from public payloads, owner-authed mirror endpoint for editing.

---

## Decisions locked (with reasoning)

| Decision | Choice | Reasoning |
|---|---|---|
| Package location | New `@dexterai/x402-skills@1.0.0` workspace under `dexter-mcp/packages/` | Schema is volatile; isolate fast-evolving package from stable `x402-core`. Existing repo already uses multi-package strategy. |
| Bundle structure | Anthropic Claude Code spec (matches Ash exactly for envelope) | Spec is Anthropic's, not Ash's. `/skill install` needs it. Bundle content (SKILL.md inner shape) is ours. |
| Manifest fetch | Public HTTP via `x402gle.com/api/public/skills/:host/manifest` | Decouples package from `dexter-api` internals. Reuses the cached-content-wins fix from 2026-05-14. Consumable from any context (npm `@dexterai/opendexter`, `opendexter-ide`, third parties). |
| v0 scope | Single-host, stateless, `publish: false` only | Smallest shippable proof. Validates the rendering primitive before adding capability/workflow modes or persistence. |
| Slug ownership (v3) | Scoped (`owner_handle/slug`) | Cheaper to manage than global namespace. No first-mover land grab. GitHub model. |
| AI-authored publishing (v3) | Unlisted by default; separate `promote_skill` action; admin pending workflow exists but designed separately | Avoids registry flood. Admin review surface uses existing x402gle admin page. |
| Host drift policy (v3) | Pin + notify | Skills pin to manifest `version_no` at compose time. Upstream host advances → `drift_flagged` set. Composer sees a notify badge and can regenerate at v(n+1). |
| Pingback for run counts (v3) | Yes, via existing `x402.dexter.cash/api/x402/telemetry` | Reuses existing telemetry sink. Opt-in via env var. No new infrastructure. |
| Minimum host count (v3) | No minimum | A merchant composing 4 of their own endpoints into "the recommended onboarding flow" is valid. Quality is decided by `quality_score`, `total_installs`, `total_runs` — not by gating. Same philosophy as the marketplace itself. |

---

## Risks and edge cases

**Host with no synthesized manifest yet.** v0 path: return a friendly error (`SKILL_NOT_COMPOSABLE: host has no synthesized manifest. Trigger synthesis at https://x402gle.com/servers/<host>`). Do not silently produce a thin bundle.

**Host manifest in `failed` state with no cached content.** Same as above — error out. The bug fix from 2026-05-14 means this only happens when the host has never successfully synthesized; cached content wins all other cases.

**Host has 1000+ endpoints.** v0 only renders endpoints referenced by the workflow, not the whole capability surface. `references/endpoints.md` flattens only what's needed. (Branch flagged this concern; rendering scope is controlled by workflow membership, not manifest size.)

**Slug collisions in v0.** Stateless mode doesn't persist anywhere; collision is a non-issue. v3 addresses it via `UNIQUE (owner_handle, slug)`.

**Bundle content drifts from Anthropic spec.** Track Anthropic's Claude Code plugin spec actively; bundle renderer treats `plugin.json` and `marketplace.json` as boilerplate templates that can be regenerated from a config. Spec changes → template change → resynth.

**Slug derivation.** When `skill_name` isn't provided, the slug is derived from the host: lowercase, ASCII-only, replace non-alphanumeric runs with `-`, strip leading/trailing `-`, truncate to 64 chars. Example: `blockrun.ai` → `blockrunai`; `defi-shield-hazel.vercel.app` → `defi-shield-hazel-vercel-app`. When `skill_name` is provided, the same normalization applies to that string.

**License choice.** Composed skill bundles ship MIT. The bundle is our rendered output, not the merchant's IP — the merchant retains everything about their endpoint. The bundle license covers only the synthesized SKILL.md text and the boilerplate plugin/marketplace JSON. Endpoint authors' terms apply to the actual API calls the skill makes; that's noted in the README boilerplate.

**Cost estimate accuracy.** v0 uses the sum of `capability_clusters[].price` for clusters referenced by workflow steps. This is an upper bound; actual runs may invoke fewer endpoints. The bundle should label it "estimated max cost per run."

---

## Testing approach (v0)

Three layers:

1. **Renderer unit tests.** Feed a fixture manifest into each render function (`renderSkillMd`, `renderEndpointsMd`, `renderPluginJson`, etc.). Snapshot the output. Tests live in `packages/x402-skills/src/render/__tests__/`.

2. **Compose integration test.** Run `composeSkill({ hosts: ["blockrun.ai"] })` against the live `x402gle.com/api/public/skills/blockrun.ai/manifest` route. Assert that the returned bundle:
   - Has all required files at expected paths
   - SKILL.md has valid YAML frontmatter
   - SKILL.md mentions `blockrun.ai` and at least one capability cluster name
   - `hosts_included[0]` matches expected provenance

3. **End-to-end install test.** Save a generated bundle to a temp dir, run `claude /skill install <path>`, verify the skill appears in `claude --skills`. (Manual for v0; can be scripted later.)

---

## Implementation plan (v0)

Will be written as a separate plan document via `writing-plans` skill after this design is approved. Rough phases:

1. Scaffold `packages/x402-skills/` workspace (package.json, tsconfig, src skeleton)
2. Implement `fetchHostManifest()` HTTP client
3. Implement render functions (`skill-md`, `endpoints`, `plugin`, `marketplace`, `output-template`, `readme`)
4. Implement `composeSkill()` orchestrator
5. Register `x402_compose_skill` tool on `dexter-open-mcp`
6. Tests (unit + integration)
7. End-to-end install of a real bundle (`blockrun.ai`)
8. Commit and PM2 restart

---

## What this unlocks downstream

Even at v0 (single-host, stateless), this changes the agent surface immediately:

- Every host on x402gle becomes a one-call install target for any agent
- The marketplace is no longer just "hosts you can pay" — it's "hosts you can adopt as skills"
- The bundle is a portable artifact: shareable on disk, in a tweet, in a repo, in a Discord
- The bundle name on disk becomes a billboard: `x402gle-research-and-narrate/` is a discovery surface every time someone screenshots their `~/.claude/skills/` directory

v1 (multi-host) and v3 (publishing) compound those effects.
