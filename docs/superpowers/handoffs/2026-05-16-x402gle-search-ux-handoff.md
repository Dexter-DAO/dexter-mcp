# x402gle Search UX Handoff

**Created:** 2026-05-16
**Author:** Claude Opus 4.7 (1M context) + Branch
**Purpose:** Zero-loss handoff for the x402gle search-surface improvements identified after the Composed Skills v1 ship. Four issues were investigated. Two are answered and closed. Two need real implementation. This doc carries every finding, the exact fix spec for the settlement-count issue, and a full design frame for surfacing composed skills in search.

---

## TL;DR for the next agent

Composed Skills v1 shipped end-to-end (see `2026-05-15-composed-skills-v1-handoff.md` and the commits below). After that, a review of the x402gle search experience surfaced four issues. This doc is the result of investigating all four:

| # | Issue | Status |
|---|---|---|
| 1 | Search result rows are a dead end. "Open API" links to the raw 402 endpoint. No resource detail page. | **Needs implementation.** Straightforward once #2's destination is decided. |
| 2 | Composed skills are returned by the search API but never rendered in the search UI | **Needs design plus implementation.** Full design frame below. |
| 3 | Small badge on the transactions list (an "R"-looking chip). What is it. | **Answered, closed.** It is the benign on-chain `settlement_method` tag (`eip3009` and similar). |
| 4 | "N paid calls" on a search result shows a Dexter-only, sometimes-zero number | **Answered, fix spec'd below.** Tier-gated display. |

Do #4 first (it has a complete spec and is contained), then #2 (needs the design pass below), then #1 (trivial once #2 lands). #3 needs nothing.

The OpenAI billing issue that blocked earlier `x402_search` E2E testing is RESOLVED. The full search path works. Brand, typo, and capability queries were all verified live on 2026-05-15.

---

## Read these first

1. **This file** for the full state.
2. `dexter-mcp/docs/superpowers/handoffs/2026-05-15-composed-skills-v1-handoff.md` for the v1 build that this follows.
3. The files named in each section below. Read them before touching anything.

---

## Repo and commit state as of this handoff

All three repos are pushed and live. Relevant recent commits:

### `Dexter-DAO/dexter-api` (origin/main)
- `38a46c0` fix(ranking): floor the activity factor so it boosts but cannot veto
- `0a18ced` fix(capability-search): lexical lane, score brand hits, match typos, rank both tiers
- `3e3e28a` feat(principals): discoverable-credential claim challenge for cross-origin passkey claim
- `f4d844c` feat(capability-search): two-lane hybrid retrieval, lexical brand-match lane alongside semantic
- `6374699` feat(composed-skills v1): x402_search returns composedSkills alongside host results
- `c2a0002` feat(composed-skills v1): lazy-rerender plumbing for future manifest version bumps
- `1be1f97` feat(composed-skills v1): promote endpoint with principal-owned auth
- `2e9e24c` feat(composed-skills v1): internal persist endpoint for MCP publishing
- `d6e8697` and `262556e` Postgres persister
- `e0e6a16` and `24174ad` local-git publishing pipeline
- `d005919` principal-claim flow
- `fe91d60` schema fix for x402_user_domain_headers, x402_ingestion_quota, x402_ingestion_cooldown. Those tables existed in prod but were missing from schema.prisma.

### `Dexter-DAO/x402gle` (origin/main)
- `b603e20` feat: native passkey handle claim via Related Origin Requests
- `af8ef47` feat: native claim page at /skills/claim
- `fa63303` feat: wire Skills into site navigation
- `9948828` feat: proxy /marketplace.json to dexter-api aggregate
- `7de3a80` feat: /skills index and /skills/<owner>/<slug> detail page with InstallWidget
- `80af40b` fix(install-widget): append @x402gle marketplace id to /plugin install command

### `Dexter-DAO/dexter-mcp` (origin/main)
- `6c18716` feat(open-mcp v1): promote_skill MCP tool
- `d4645ed` feat(open-mcp v1): x402_compose_skill resolves principal and publishes via internal API
- `d2ae2e3` chore(x402-skills): bump to 1.1.0 plus add LICENSE for npm publish
- Plus the v0/v1 spec, plan, and handoff docs.

### Untracked WIP: do NOT commit, do NOT revert

Both dexter-api and x402gle have unrelated uncommitted and untracked files from other workstreams. Lexical-retrieval was already merged. Streaming-demo panels and `.planning/` docs remain dirty. Stage only the exact files each task names. Always run `git status --short` before committing.

---

## Issue 3: the transactions-list badge (ANSWERED, CLOSED)

**The question:** the transactions list (`x402gle.com/transactions`) shows a small chip on some rows that reads like a red "R".

**What it is:** `src/app/transactions/page.tsx` (around line 152) renders `tx.settlementMethod` as a small uppercased chip, but only when `settlementMethod !== 'direct'`. The chip text is the settlement method itself.

The actual `settlement_method` values on `x402gle_transactions` (sampled from the 50k most recent rows):
- `eip3009`, roughly 38k. The EIP-3009 "transfer with authorization" standard, used for gasless USDC payment.
- `unknown`, roughly 11k.
- `eip3009_batch`, roughly 860.
- `custom_contract`, roughly 89.
- `permit2_upto`, 2.

So the badge is a neutral technical on-chain fact: which payment-authorization standard the settlement used. `eip3009` is the dominant gasless-USDC standard. It is NOT a flag, NOT a wash marker, NOT a warning. Separately, `meta_tx_relayer` IS one of the wash-detection analyzers in `src/components/wash/analyzers.ts`, but that is a different surface (relayer-concentration wash analysis), not this settlement-method chip.

If anything is worth a follow-up here it is purely cosmetic. If the chip renders in a red or alarming color it is misleading, because the content is benign. A neutral muted color is correct, and this is not a priority.

---

## Issue 4: "N paid calls" settlement count (ANSWERED, FIX SPEC)

### The problem

A search result row (`src/components/search/search-result-row.tsx`) shows "N paid calls" derived from `r.usage.totalSettlements`. That number comes from the capability-search response, which on the dexter-api side is populated by a `LEFT JOIN LATERAL` against `x402_facilitator_daily` in `capabilitySearch.ts` (both `retrieveCandidates` and `retrieveLexicalCandidates`).

`x402_facilitator_daily` is Dexter's own facilitator settlement log. It only has rows for resources whose x402 payments were settled through Dexter's facilitator, roughly 1,562 resources with non-zero settlements out of about 29,686 indexed (about 5%). So a search result for CoinGecko, for example, shows "0 paid calls" even though CoinGecko has real ecosystem x402 traffic. The UI is quietly presenting a Dexter-centric number as if it were total usage. Showing "0" when the truth is "unknown to this data source" is the actual bug.

### What was investigated. The data is trustworthy; the attribution has known tiers.

There IS ecosystem-wide settlement data. The relevant tables:

- **`x402gle_transactions`** holds on-chain transaction records, ingested via webhook from a chain indexer (`source` is `webhook` on 100% of sampled rows). Columns: `tx_hash, chain, block_timestamp, sender, recipient, facilitator_id, amount_usdc, tx_status, source, raw_data, log_index, hop_type, settlement_method`. This is real on-chain data, not Dexter attribution guesswork. It is large, millions of rows. A bare `count(*)` times out, so always bound queries with `block_timestamp` ranges or sampled subqueries.
- **`x402gle_facilitators`** tracks 15-plus facilitators across the ecosystem: Coinbase (about 80M txns), PayAI (about 36M), Dexter (about 33M), Daydreams, Virtuals Protocol, and others. The indexer sees everyone's settlements, not just Dexter's.
- **`x402gle_host_hourly`** has columns `(hour_bucket, host, chain, txn_count, volume_usdc)`. It is host-level traffic across ALL facilitators. About 393 distinct hosts have data. Roughly 26,768 of 29,686 indexed resources (about 90%) have a host that appears here. Verified spot-check: `blockrun.ai` 53,204 txns, `api.nansen.ai` 3,330, `pro-api.coingecko.com` 355.
- **`x402gle_host_address_daily`** has columns `(day, host, address, role, chain, txn_count, volume_usdc)`. It is the recipient-wallet to host bridge. `role` is `buyer` or `seller`.
- **`x402gle_resource_attribution`** has columns `(resource_id, resource_url, pay_to, host, tier, shared_count, facilitator_id, gaming_flags, claimed, computed_at, wrapper_host, upstream_service)`, about 29,142 rows. This table's `tier` column is the key to the honest fix.

### The attribution model (from `src/x402gle/resource-attribution.ts`)

The attribution engine is a four-tier resolver connecting on-chain transactions to resources:

| Tier value | How a tx is matched to a resource | Confidence |
|---|---|---|
| `exact` | Joined on `tx_hash` to Dexter's facilitator_events | 100%, direct and unambiguous |
| `unique_payto` | The resource's advertised `pay_to` wallet maps to exactly ONE resource | High, unambiguous |
| `host_level` | `pay_to` is SHARED across multiple resources, so stats are aggregated at the server/host level, NOT the resource | Lower, known ambiguity, host-level only |
| `wrapper_pool` | Wrapped resources (such as `api.paysponge.com` fronting Apollo or Gemini) sharing a pooled `pay_to` | Lower, host-level only |
| Tier 4 (unresolved) | `pay_to` not in the resource registry | NOT stored in the attribution table. Absence of a row IS Tier 4. |

The critical insight: the system already knows when it cannot pin a settlement to a single resource. At `host_level` and `wrapper_pool` it deliberately keeps the number at the host level. At Tier 4 there is no row at all.

### The fix spec

Show "N paid calls" gated on attribution tier. Present the number only at the confidence the system actually computed:

1. **`exact` or `unique_payto`:** show "N paid calls" or "N settlements" on the resource. The attribution is unambiguous, so the number is earned at the resource level.
2. **`host_level` or `wrapper_pool`:** show the number at the host level with host framing ("blockrun.ai, about 53k x402 settlements"), NEVER as a per-resource count. The system itself did not resolve it to a resource, so the UI must not imply it did.
3. **No attribution row (Tier 4), or no data:** show nothing. Do NOT show "0". "0 paid calls" is a factual lie. It means "this data source has no information," not "this resource has had zero settlements." The current UI's `hasSettlements = r.usage.totalSettlements > 0` check already hides the zero case in the collapsed row, but the underlying number is still Dexter-only, and the framing elsewhere still implies totality.

### Implementation notes for #4

- **dexter-api side, `capabilitySearch.ts`:** the candidate-retrieval queries currently `LEFT JOIN LATERAL x402_facilitator_daily`. To do this properly the response needs to carry two things. First, the settlement count from a trustworthy ecosystem source. Second, the attribution `tier` so the UI can frame it. Options to weigh:
  - Join `x402gle_resource_attribution` to get `tier` per resource, and join `x402gle_host_hourly` (host-level) for the ecosystem count. Surface both `tier` and the count in the `CapabilitySearchResult` shape (the `usage` block).
  - The `CapabilityResult` interface in `x402gle/src/lib/api.ts` (line 1129) and the dexter-api `CapabilitySearchResult` both need a new field for `tier`, or a derived `settlementScope` of `'resource' | 'host' | 'unknown'`.
- **x402gle side, `search-result-row.tsx`:** `buildSummary()` and the meta row both reference `r.usage.totalSettlements`. Update both to respect the tier or scope. Use resource-level phrasing for `exact` and `unique_payto`, host-level phrasing for `host_level` and `wrapper_pool`, and omit entirely for unknown.
- **Do NOT** feed ecosystem traffic into ranking. That decision was made deliberately and is final for now. See the "Ranking: decided, do not reopen" section below. #4 is a DISPLAY fix only.
- **Wash caveat:** `x402gle_host_hourly` is raw traffic and includes wash. If a settlement count is shown, it is showing washed plus real combined. This is acceptable for a v1 display fix, since it is still real on-chain settlement activity, but note it. A wash-discounted number is NOT trivially `host_hourly.txn_count` minus `server_wash_daily.wash_txns`. See the wash section below.

---

## Issue 1: search results are a dead end (NEEDS IMPLEMENTATION)

### The problem

`src/components/search/search-result-row.tsx`. The expanded drawer has an "Open API" button, and the collapsed row has a host link. Both point at `r.resourceUrl`, the raw paid x402 endpoint. A human clicking either gets a `402 Payment Required` JSON blob or an error in their browser. There is no link from a search result to any resource detail page.

### The fix

x402gle already has resource and server detail routes. Confirmed routes that exist:
- `/servers/[host]`, the host detail page.
- `/resources/[id]`, the resource detail page (referenced in the codebase).

The search result row should link to a real destination, most likely `/resources/<resourceId>` (the row already has `r.resourceId`) or `/servers/<host>`. "Open API" (the raw endpoint) can stay as a secondary action for users who actually want to hit the endpoint, but the primary click target, the row itself and the name, should go to a detail page.

This is small and mechanical, but the destination choice (`/resources/[id]` versus `/servers/[host]`) should be settled alongside #2's design, because composed-skill results will need their own destination (`/skills/<owner>/<slug>`) and all three result types should behave consistently.

---

## Issue 2: composed skills not surfaced in search (NEEDS DESIGN, IMPLEMENTATION)

### The problem, verified

Composed Skills v1 (Phase F, Task 12) added a `composedSkills` array to the capability-search response. dexter-api `capabilitySearch.ts` returns it. The x402gle search page never renders it. Two hard facts:

1. `x402gle/src/lib/api.ts`. The `CapabilitySearchResponse` interface (line 1172) has `strongResults` and `relatedResults` but no `composedSkills` field at all. The type does not even know about it.
2. `x402gle/src/app/search/page.tsx`. Line 94 renders `[...data.strongResults, ...data.relatedResults]` as one flat list of `SearchResultRow`. A `grep` for `composedSkills` on the page returns nothing.

So the feature is wired end-to-end on the backend and completely invisible on the frontend. Branch flagged this as a big one and explicitly said it must NOT be a jumble. Composed skills cannot just be dumped into the same flat result list as host resources.

### What a composed skill result carries

The dexter-api response's `composedSkills[]` entries have this shape (from `capabilitySearch.ts`, `ComposedSkillSearchResult`):

```
type: 'composed_skill'
ownerHandle: string
slug: string
qualifiedSlug: string            // "<owner>/<slug>"
name: string
description: string | null
hostsIncluded: string[]
costEstimateUsdc: number | null
callCountEstimate: number
qualityScore: number
totalInstalls: number
totalRuns: number
previewUrl: string               // https://x402gle.com/skills/<owner>/<slug>
marketplaceJsonUrl: string       // https://api.dexter.cash/api/public/composed-skills/<owner>/<slug>/marketplace.json
installCommand: string           // /plugin marketplace add https://x402gle.com/marketplace.json
githubSubdir: string | null
```

A composed skill is a fundamentally different artifact from a host resource. A host resource is one paid API endpoint. A composed skill is a curated Claude Code plugin that orchestrates one or more hosts into a workflow. They answer the same query (think "polymarket analytics") but are different things the user does: call an endpoint, versus install a skill.

### Design frame for #2 (a starting frame, not a locked spec, needs a proper design pass)

The core design question: how does a composed skill appear in a search results page without being jumbled into the host-resource list?

Three candidate approaches, with the trade-offs:

**Approach A, a distinct section above the resource list.**
When a query has composed-skill matches, render a separate, visually distinct band at the top of the results. Something like "Composed skills for this" or "Ready-to-install skills". Avoid condescending labels. Branch dislikes "Strong match"-style badges, so the framing should be matter-of-fact. Below it, the normal host-resource list. The composed-skill cards are visually different from `SearchResultRow`. They show the install affordance (the InstallWidget pattern already exists at `/skills/<owner>/<slug>/_components/install-widget.tsx`), hosts-included, and install count.
- Pro: clean separation. The two artifact types never visually compete. The skill's "install" CTA is honest and distinct from a resource's "open API".
- Pro: composed skills are the higher-intent result (a packaged workflow), so putting them on top is defensible.
- Con: a second result-type section adds page complexity. If there are zero composed-skill matches the section must cleanly not render.

**Approach B, inline but visually marked.**
Composed skills appear in the same list but as a distinctly styled card (different border, background, icon, an "installable skill" treatment), interleaved by relevance.
- Pro: one list, relevance-ordered.
- Con: this is the jumble Branch explicitly warned against. Two different artifact types in one list invites confusion about what clicking does. This approach is not recommended.

**Approach C, a results tab or filter.**
"APIs" and "Skills" as a toggle on the search page.
- Pro: total separation.
- Con: hides composed skills behind a click. A user who would want a skill never sees it if they do not toggle, which is a real discovery cost. Probably wrong for a corpus where composed skills are rare and valuable. They should be seen.

**Recommended starting point: Approach A.** A distinct top section. Reasons: it respects "no jumble", it surfaces composed skills rather than hiding them behind a tab, and the install action genuinely differs from a resource action so they belong in visually separate components. The next agent should still do a proper design pass, possibly with the brainstorming skill and visual companion, but A is the frame to start from.

### Implementation outline for #2 (once design is locked)

1. **`x402gle/src/lib/api.ts`:** add a `ComposedSkillSearchResult` interface and a `composedSkills: ComposedSkillSearchResult[]` field to `CapabilitySearchResponse`. Mirror the dexter-api shape above.
2. **New component:** a composed-skill search card. Reuse patterns from `src/app/skills/[owner]/[slug]/_components/install-widget.tsx` and `skill-card.tsx` (the `/skills` index card). It should link to `/skills/<owner>/<slug>` (the detail page already exists from v1) and show install count, hosts-included, and cost.
3. **`src/app/search/page.tsx`:** render the composed-skills section (Approach A) above the resource list, conditionally, only when `data.composedSkills?.length`.
4. **Consistency with #1:** once composed-skill cards link to `/skills/<owner>/<slug>`, host-resource rows should likewise link to a real detail page (`/resources/[id]` or `/servers/[host]`). Decide all result-type destinations together.

### Verification for #2

After implementing, a live search for `polymarket` (or `blockrun`) on `x402gle.com/search` should show the published composed skill `branchm/blockrun-ai` in its section, with a working link to `/skills/branchm/blockrun-ai`. The composed skill is real and live (published during v1 Phase I, `skill_id b68ecf20-a5e0-49cd-aad8-67227e7a2b9a`).

---

## Ranking: decided, do not reopen

During the investigation that produced this handoff, the capability-search ranking formula was examined in depth. The decisions reached, so the next agent does NOT relitigate them:

- **The ranking score is `similarity * trust * activityContribution * (1 - gaming)`.** It is multiplicative, in `src/services/ranking/combiner.ts`.
- **The `activity` factor was fixed (commit `38a46c0`, "Option C").** It used to multiply in raw `[0,1]`, so a zero-traffic resource was vetoed to about 0.10. It now maps into `[base, 1]` with `base` of 0.5, so activity can boost but never veto. A perfect verified brand match went from score 0.096 to 0.53. This is shipped and correct. `combiner.test.ts` (8 tests) was added. The ranking module previously had zero test coverage.
- **Activity is deliberately kept WEAK and is NOT fed ecosystem-wide traffic.** It was considered and rejected. Feeding `x402gle_host_hourly` traffic into ranking creates a rich-get-richer incumbent-bias loop and rewards wash. The real levers for "good new resources surface" are `similarity` and `trust`, which post-C carry the score. Do not turn activity into a strong factor. Do not re-source it for ranking purposes. Issue #4 above is a DISPLAY fix and is entirely separate from ranking.
- **The lexical lane was fixed (commit `0a18ced`).** Two-lane hybrid retrieval (semantic plus pg_trgm lexical brand-match) had three bugs: lexical hits scoring 0, typos not matching (concat-similarity dilution), and tier mis-ordering. All fixed. Brand, typo, and capability queries verified live.
- The capability-search score is an internal sort key. The search UI correctly does not display it. `search-result-row.tsx` shows verification status, quality score (`/100`, a real AI-evaluator grade), price, and a prose summary, never the raw multiplicative score. This was already correct in the first-draft UI. No fix needed there.

### The wash subtraction trap (documented so nobody rebuilds it)

If a future task wants a wash-discounted traffic number, note this. `x402gle_host_hourly.txn_count` minus `x402gle_server_wash_daily.wash_txns` does NOT work. Tested on real data, it produces negative "clean" traffic. `wash_txns` exceeds `total_txns` by up to 161% for the worst hosts. Reasons:
1. The two tables have different date windows. `host_hourly` starts 2026-04-30, `server_wash_daily` starts 2026-04-15.
2. Even same-day same-chain the numbers are incoherent. `wash_txns` for some host-days exactly equals total traffic, which means `wash_txns` is a detection-scoring artifact with a different unit, not a clean per-transaction wash classification.

A wash signal must be used as a confidence multiplier or ratio (think "X% of this host's days are flagged"), never an arithmetic subtraction, and only after reading the wash-detection code (`src/x402gle/wash-detection/`, `src/components/wash/analyzers.ts`) to understand the detector's semantics. This is a real future project, not a quick join.

### "Enhanced class" idea: parked, Branch's call

Branch noted that resources which send Dexter's facilitator real traffic are an enhanced class. He said he wants to do something special for them in x402gle, a badge or boost or section for Dexter-facilitated resources. This is a separate future feature, deliberately not folded into any of the four issues above. Do not build it as a side effect. It is Branch's to scope when he wants it.

---

## Critical gotchas for the next agent

1. **Both dexter-api and x402gle have unrelated dirty and untracked files.** Stage only the exact files each task touches. Run `git status --short` before every commit. Never `git add -A`.
2. **`x402gle_transactions` is huge.** A bare `count(*)` times out. Always bound queries. Use `WHERE block_timestamp > ...`, or `SELECT ... FROM (SELECT ... ORDER BY block_timestamp DESC LIMIT N) s`.
3. **dexter-api is ESM.** Relative imports need `.js` extensions. Build is `npm run build` (tsc). The repo has pre-existing tsc errors in other files. Only worry about errors in files you touched.
4. **dexter-api uses Prisma raw SQL** (`$queryRaw` and `$queryRawUnsafe`), not a raw `pg.Pool`. The composed-skills tables and the x402gle analytics tables are accessed via raw SQL. Use `import prisma from '../prisma.js'`, the default import.
5. **No `prisma db push`, `db pull`, or `migrate dev|deploy|reset`.** Hand-written SQL applied manually plus `prisma generate` only. Branch's hard rule.
6. **PM2 restart after any dexter-api or x402gle build.** Run `pm2 restart dexter-api --update-env` or `pm2 restart x402gle --update-env`. Changes are not live until restart.
7. **Verify, do not assert.** This whole handoff exists because earlier in the session a "settlement data is sparse" claim was made from reading a handful of result strings instead of querying the tables. When a number looks wrong, query the source table. The settlement-attribution finding (#4) only became correct after actually reading `resource-attribution.ts` and the `tier` model.
8. **The composed skill `branchm/blockrun-ai` is live** at `x402gle.com/skills/branchm/blockrun-ai`, `skill_id b68ecf20-a5e0-49cd-aad8-67227e7a2b9a`. Use it as the test fixture for #2.
9. **OpenAI billing is resolved.** The `x402_search` full HTTP path works. If a capability-search HTTP call returns a 502 with `stage: intent_parse` and an OpenAI quota error, that is a NEW billing lapse, not a code bug.

---

## Suggested execution order

1. **Issue 4, the settlement-count display fix.** Self-contained, full spec above. dexter-api change (carry `tier` plus an honest ecosystem count in the search response) plus x402gle change (`search-result-row.tsx` tier-aware framing). Verify on a real query.
2. **Issue 2, composed skills in search.** Do the design pass first. Approach A is the frame. Consider the brainstorming skill. Then extend `api.ts` types, build the composed-skill search card, and render the section in `search/page.tsx`. Verify `branchm/blockrun-ai` appears for a `polymarket` or `blockrun` search.
3. **Issue 1, fix the dead-end links.** Decide all three result-type destinations together. Resource goes to `/resources/[id]` or `/servers/[host]`. Composed skill goes to `/skills/<owner>/<slug>`. The change is mechanical once those destinations are decided.
4. **Issue 3, nothing required.** Optionally, if the `settlement_method` chip renders in an alarming color, make it neutral. Cosmetic, low priority.

Each of 1, 2, and 3 is independently shippable. None depends on the others, except that #1 and #2 should agree on link destinations.

---

## Where Branch expects this to land

The search experience on x402gle.com should stop being a first draft. A search result should be a doorway that links to real detail pages. Composed skills should be visible to someone searching, not a wired-but-hidden feature. Any number shown to a user should be honest about its provenance and confidence. Branch is explicitly open to enhancements and improvements beyond the literal four issues. The search surface is acknowledged as a first draft, and a thoughtful redesign is welcome. But the four issues above are the concrete, identified work. Do not jumble composed skills into the resource list. Do not show users numbers the data cannot back. Do not turn activity into a ranking driver.
