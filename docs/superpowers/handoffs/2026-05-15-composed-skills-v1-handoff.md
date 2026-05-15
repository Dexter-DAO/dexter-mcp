# Composed Skills v1 — Mid-Execution Handoff

**Created:** 2026-05-15 ~10:00 UTC
**Author:** Claude Opus 4.7 (1M context) + Branch
**Purpose:** Zero-loss handoff after Phase A. Next session resumes at Phase B without losing momentum.

---

## TL;DR for the next agent

You are mid-execution on the Composed Skills v1 plan. Phase A (database schema) is **shipped and verified**. Pick up at **Phase B** of `dexter-mcp/docs/superpowers/plans/2026-05-15-composed-skills-v1.md`.

The user is Branch. Don't ask clarifying questions on anything in this doc — every decision is locked. Just keep building.

## Read these files first (in order)

1. **This file** — full state of the world
2. `dexter-mcp/docs/superpowers/specs/2026-05-15-composed-skills-v1-design.md` — v1 design spec (the WHAT)
3. `dexter-mcp/docs/superpowers/plans/2026-05-15-composed-skills-v1.md` — task-by-task plan (the HOW). Phases B-I are the remaining work.
4. `~/.claude/projects/-home-branchmanager-websites-dexter-mcp/memory/reference_claude_code_plugin_install_paths.md` — Anthropic plugin install constraints discovered during research

You do NOT need to re-read v0 docs unless you have time. v0 is shipped and works.

---

## Current state of the world

### v0 status: SHIPPED on production

- `@dexterai/x402-skills@1.0.0` workspace package in `dexter-mcp/packages/x402-skills/`
- `x402_compose_skill` MCP tool live on `https://open.dexter.cash/mcp`
- 48 unit tests passing in the package
- End-to-end verified: plugin installs cleanly into Claude Code (after the `skills[]` directory bug fix in commit `e996490`)
- `Dexter-DAO/composed-skills` GitHub repo created, public, seeded with README + LICENSE + empty `marketplace.json`

### v1 Phase A status: SHIPPED on production (dexter-api commit `d60219d`)

- Migration `dexter-api/supabase/migrations/20260515_120000_composed_skills_v1.sql` written + applied to Supabase Postgres
- Three tables created:
  - `x402gle_principals` (canonical identity: human/agent/organization)
  - `x402gle_skills` (composed skill persistence)
  - `x402gle_skill_hosts` (M2M with `pinned_version`)
- Triggers created for `updated_at` on both new tables
- Prisma model for `x402gle_principals` added to `prisma/schema.prisma` (skills tables accessed via raw SQL like `x402_host_manifests`)
- `npx prisma generate` ran clean — **NO `db push`, `db pull`, `migrate dev`, `migrate deploy`, or `migrate reset` was used. NEVER use those.** Rule from Branch.
- First principal seeded: `branchm` (kind=human, verified, supabase_user_id `870d18de-f8ff-4ecb-bf69-82e3a89eb40f`, derived from `branch@branch.bet`)

### Publishing pipeline auth: RESOLVED (no PAT needed)

Original plan called for a `dexter-skill-bot` GitHub PAT. After ~90 minutes of trying, we discovered fine-grained PATs are gated by an org-level policy in `Dexter-DAO` with no REST API to toggle. Switched to **local-git shellout from the dexter-api host** against a persistent clone at `$COMPOSED_SKILLS_REPO_CLONE_PATH`.

Verified end-to-end: probe commit cloned → committed → pushed → confirmed on remote → cleaned up. **The host's existing git credentials handle auth. No bot account, no PAT, no org policy dependency.**

Env vars added to `~/websites/dexter-api/.env` (no secrets):
```
COMPOSED_SKILLS_REPO_URL=https://github.com/Dexter-DAO/composed-skills.git
COMPOSED_SKILLS_REPO_CLONE_PATH=/home/branchmanager/composed-skills-publish
COMPOSED_SKILLS_GITHUB_BRANCH=main
COMPOSED_SKILLS_COMMIT_AUTHOR_NAME=Branch Manager
COMPOSED_SKILLS_COMMIT_AUTHOR_EMAIL=branch@dexter.cash
```

The clone at `/home/branchmanager/composed-skills-publish` **does not yet exist** — Phase C Task 5 creates it.

---

## Locked decisions (DO NOT re-litigate)

| # | Decision | Locked answer |
|---|---|---|
| 1 | Identity table | `x402gle_principals` (humans + agents + orgs in one table) |
| 2 | Slug ownership | Scoped (`<owner_handle>/<slug>`) |
| 3 | AI-authored publishing | Unlisted by default; `promote_skill` MCP tool moves to public |
| 4 | Host drift policy | Pin + notify (v2 implements the notify; v1 just captures `pinned_version`) |
| 5 | Pingback telemetry | Deferred to v2 |
| 6 | Min host count | No minimum (single-host merchant compositions are fine) |
| 7 | v2 bundle upgrades | Auto-rerender on next read (transparent to users) |
| 8 | Publishing auth | Local-git shellout, no PAT/bot |
| 9 | Schema migrations | Hand-written SQL applied manually; `prisma generate` only |
| 10 | Branch's handle | `branchm` |

---

## What ships in v1 (and what doesn't)

### Phases remaining

- **Phase B** — Add optional `Persister` callback to `composeSkill()` in `@dexterai/x402-skills`. Tasks 4.
- **Phase C** — dexter-api: local-git publishing service + Postgres persister. Tasks 5, 6, 7.
- **Phase D** — Public HTTP routes (list, detail, marketplace.json, bundle.zip, aggregate). Tasks 8, 9.
- **Phase E** — MCP tool wiring (`x402_compose_skill` accepts `publish: true`, new `promote_skill` tool). Tasks 10, 11.
- **Phase F** — `x402_search` returns composed skills alongside hosts with `type: 'composed_skill'`. Task 12.
- **Phase G** — x402gle.com `/skills` index + `/skills/<owner>/<slug>` detail page with InstallWidget. Tasks 13, 14.
- **Phase H** — Lazy-rerender plumbing for v2 manifest-version upgrades. Task 15.
- **Phase I** — End-to-end + real-user install+invocation test. Task 16.

### Deferred to v2 (do NOT do in v1)

- Drift detection (background job that flags composed skills when upstream host version changes)
- Pingback telemetry (composed skill phoning home when invoked)
- `capability: "..."` and `workflow: "english"` input modes for `x402_compose_skill`
- Multi-host composition
- Admin pending workflow (composed skills publish as `unlisted` by default, bypassing review)
- User authentication for publishing (uses existing wallet-owner-of-host auth, no new flow)

---

## Critical gotchas the next agent must know

1. **Database migrations: SQL by hand, `prisma generate` only.** Never `db push`, `db pull`, `migrate dev`, `migrate deploy`, `migrate reset`. Branch's hard rule.

2. **The MCP tool publishing flow uses an internal HTTP endpoint, not direct DB access from `dexter-mcp`.** `open-mcp-server.mjs` calls `POST /api/internal/composed-skills/persist` on dexter-api. This keeps `dexter-mcp` HTTP-only and stops it from needing the pg pool. The internal endpoint is auth'd via `X-Internal-Auth` header = `DEXTER_INTERNAL_TOKEN`. Both repos need the same secret in their `.env`. **Not yet set** — Phase E Task 10 creates it via `openssl rand -hex 32`.

3. **Anthropic plugin install reality:**
   - No `claude-cli://install` URL exists. The closest is `claude-cli://open?q=<prefilled-prompt>` which opens Claude Code with text in the prompt box.
   - URL-hosted `marketplace.json` files can ONLY reference plugins via git/npm sources — no remote tarball support, no relative-path support.
   - Plugin hint protocol (`<claude-code-hint />` stderr marker) ONLY works for plugins in `claude-plugins-official`. Useless for third-party.
   - The v1 install UX is: copy two slash commands to clipboard + a `claude-cli://open?q=<commands>` deep-link button as a sweetener. Detailed in the spec.

4. **L2 skill index dedup issue (v0 carry-over, v1 doesn't fix).** Real blockrun.ai skill index has duplicate `skill_name` entries (e.g., 4× `fetch-polymarket-wallet-analytics` for different wallet addresses). The renderer keys by `skill_name` and silently drops duplicates. This is an upstream `dexter-api` issue; tracked but not fixed in v1.

5. **Plugin.json `skills[]` must point at the DIRECTORY containing SKILL.md, NOT the SKILL.md file itself.** Fixed in v0 commit `e996490`. There's a lock-down test in `packages/x402-skills/src/render/__tests__/plugin-json.test.ts` that prevents regression.

6. **Use the `superpowers:subagent-driven-development` skill for execution.** Each task gets a fresh subagent with the full task text passed in the prompt. After the implementer reports DONE, dispatch a spec compliance reviewer, then a code quality reviewer. Templates live at `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/subagent-driven-development/`.

7. **Branch's communication style:** terse, direct, low patience for repeated mistakes. He'll curse — that's normal, not a stop signal. Keep moving. He hates condescension and unnecessary clarifying questions when info already exists in the codebase. When you don't know something, look first, ask second.

8. **The `dexter-anti-slop-prose` skill** is mandatory before any external-facing prose ships. Always run `bash ~/.claude/skills/dexter-anti-slop-prose/scripts/check.sh <file>` before claiming any README/doc/email/announcement is done.

---

## Resume command (copy-paste this to start fresh session)

```
Continue the Composed Skills v1 build. Phase A is shipped; pick up at Phase B Task 4.

Read in order:
1. dexter-mcp/docs/superpowers/handoffs/2026-05-15-composed-skills-v1-handoff.md (full state)
2. dexter-mcp/docs/superpowers/plans/2026-05-15-composed-skills-v1.md (Phase B onward)
3. dexter-mcp/docs/superpowers/specs/2026-05-15-composed-skills-v1-design.md (only if you need WHY context)

Then use superpowers:subagent-driven-development to execute task-by-task. First subagent = Phase B Task 4 (add Persister callback to composeSkill in @dexterai/x402-skills).

Don't ask clarifying questions on anything covered in the handoff or the plan. Decisions are locked. Build.
```

---

## All commits across the three repos as of handoff

### `Dexter-DAO/dexter-mcp` (origin/main)
- `7dc5d52` docs(composed-skills v1 plan): swap Task 5/6/7 to local-git pipeline
- `b5bf8b4` docs(composed-skills v1): drop bot/PAT path
- `b0d8867` docs(composed-skills v1): swap user_profiles → principals
- `45c94e1` docs(composed-skills v1): 16-task implementation plan
- `267c92c` docs(composed-skills v1): persistence + publishing spec
- `e996490` fix(x402-skills): plugin.json skills[] points at directory
- `675b5de` test(x402-skills): smoke script for live blockrun.ai compose
- `cefdecd` feat(open-mcp): register x402_compose_skill tool
- `f087b65` feat(x402-skills): composeSkill orchestrator (v0)
- ...older v0 commits

### `Dexter-DAO/dexter-api` (origin/main)
- `d60219d` feat(composed-skills v1): Phase A — x402gle_principals + x402gle_skills schema
- ...older pre-v1 commits

### `Dexter-DAO/composed-skills` (origin/main) — NEW REPO
- `b30c592` chore: cleanup probe
- `f8c5eb4` chore: seed repo with README + empty marketplace.json
- `39a3fe2` Initial commit (auto from `gh repo create --license MIT`)

---

## Outstanding minor follow-ups (NOT blocking v1)

1. `_meta: COMPOSE_SKILL_META` field on `x402_compose_skill` tool responses for telemetry parity with other MCP tools
2. Add a `LICENSE` file to `packages/x402-skills/` (referenced in package.json `files` but doesn't exist on disk yet)
3. v0 design doc `2026-05-15-composed-skills-design.md` still references `x402gle.com/api/public/skills/...` as the manifest base URL when the actual URL is `api.dexter.cash/...`. Code is correct; only the doc lags.

---

## Where the user (Branch) expects you to land

Branch wants v1 complete end-to-end with a real demo-able install flow on x402gle.com/skills. He's explicitly said he doesn't want to be done — he wants it done right. Don't shortcut. Don't skip subagent reviews. Don't leave broken pieces.

Phase I (Task 16) is the proof of life: real user (Branch himself or anyone) installs a published composed skill via the slash commands flow, and Claude actually uses it to answer a real question. That's the success criterion.

When Phase I succeeds: write a final email summary like the v0 one, ship it to branch@branch.bet + nrsander@gmail.com, push everything, and stop.

Good luck. Don't whine about context. Just build.
