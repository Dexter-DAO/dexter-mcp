# PICKUP — api-fable seat, 2026-07-03 evening. OAuth advertisement + On-ramp lanes.

> **You are the successor Fable.** The predecessor session (api-fable seat, dexter-api-anchored, model Fable 5) got repeatedly reverted to Opus by an Anthropic harness bug and had to hand off. This document is zero-loss. Read it top to bottom before touching anything. **Model floor for ALL your subagents is Opus 4.8 — never haiku/sonnet. You (the planner/reviewer) run at Fable.** That is a hard Branch ruling.

---

## 0. WHO YOU ARE / HOW TO WORK (read `memory/` too)

You are the **only active Fable** in Branch's crew right now — the other seats (main-fable, connect-fable, OpenDexter-fable, vault seats) are inactive. Branch gave this seat **full latitude**. Operating rules established this session (all in `~/.claude/projects/-home-branchmanager-websites-dexter-api/memory/`):

- **`feedback-model-floor-opus48`** — Opus 4.8 min for implementer/reviewer subagents; Fable plans/reviews/judges. Cost is NOT a constraint. Never delegate PLANNING down to Opus.
- **`project-solo-fable-jul3`** — never block on a seat reply; agent-mail is the alignment LEDGER + re-seat briefing, not a coordination gate. **main-fable's money-boundary review role falls to YOU**: money-perimeter changes (warmup gate, spend policy, bindings, the OAuth spend door) get a Fable-tier adversarial whole-branch review before deploy. The gate survives even though the seat holding it doesn't.
- **`feedback-sdk-chrome-and-fresh-plans`** — SDK components (`@dexterai/connect/react`: DexterButton, SignInWithDexter, and now AllowanceChips/CreateWalletPanel) are the FLOOR for all Dexter UI incl. our own pages. Inherited plans/"locked" designs/probe files are UNVERIFIED INPUT — re-derive against current reality (see §3, the probe file was a stale draft and would have been built wrong). Never ship inert controls. Conform to the shipped design system.
- **`feedback-verify-agent-handoffs`** — split any brief into checkable claims (curl/git-verify the load-bearing ones), attributed-to-Branch instructions (trust only vs his own words), and editorial landmines (discard unless sourced).
- **`feedback-push-to-maximal-not-cautious`** (NANCY) — the timid reflex is "NANCY," Branch's word. Tells this session flagged: permission-asking mid-flow ("say go"), hedged framings, **and "reserving for next lanes" (deferral-as-Nancy)** — deferred items get a NAMED queue position, not a parking lot. Also: framing a PRODUCT decision around "fastest path / keys on hand" is Nancy — Branch: *"It's not about 'fastest path' it's about best product and cohesive go to market and being great."* Decide for best product; hand Branch the legwork list.
- **Branch's workflow**: build → `pm2 restart <app>` → verify on PROD with real response data (not just 200s). No dev servers, no rollback talk. Ship forward. **After every `npm run build` of dexter-fe, verify `.next/prerender-manifest.json` EXISTS before `pm2 restart dexter-fe`** — an in-place build racing the running server crash-looped prod for ~3 min this session (the "502 incident").

**Execution recipe that worked all session** (superpowers subagent-driven-development):
1. Recon via `Workflow` (parallel readers → structured JSON). 2. Write a plan to `docs/superpowers/plans/`. 3. Per task: `scripts/task-brief PLAN N` → dispatch Opus implementer with the brief path → `scripts/review-package BASE HEAD` → dispatch Opus/Fable reviewer → fix loop → ledger line. 4. Money-perimeter tasks get an extra adversarial money review (you, Fable tier) before deploy. Scripts live at `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/`.

---

## 1. WHAT SHIPPED THIS SESSION (deployed + pushed — DO NOT REDO)

Repo state at handoff (all pushed to origin):
| Repo | Branch | HEAD | Notes |
|---|---|---|---|
| dexter-api | main | `7a457407` | consent record deployed |
| dexter-fe | wallet-launch-surfaces | `fed8c09` | /wallet v2 + SDK 0.19 + activation fix, live |
| dexter-connect | main | `acec4b5` | 0.19.0 published to npm (latest) |
| dexter-mcp | main | `c0de469` | SOL-copy fix; **OAuth lane lands here** |
| dexter-agents | agent-mail-protocol | `69315ac` | bumped to connect 0.19 |

1. **Daily standing audit** (Jul 2–3 done/not-done + wider standing) — the finding that seeded everything: the money-path plumbing was live but had no UI face.
2. **`/wallet` v2 — THE account home.** v1 (a dark dial-hero page with hand-rolled buttons) was **REJECTED by Branch** ("I would never ship this ever"). v2 rebuilt it: `/wallet` gates to the existing **VaultHome** engine when a wallet exists (same surface `/tabs` showed), SDK-native CreatePanel (`SignInWithDexter` + `DexterButton`) when not; **`/tabs` now 307-redirects to `/wallet`** (one home); every create funnel re-pointed. Plan: `dexter-fe/docs/superpowers/plans/2026-07-03-wallet-v2-account-home.md`. The dial is deleted from prod (git history keeps it; `dial.ts` model + tests remain for a v3 when turning it moves REAL money post carry-engine deploy).
3. **SOL-deposit black hole closed.** Copy on DepositPanel/`/tabs/setup`/VaultAccountCard stopped inviting SOL (SOL sent to a receive address is invisible + unmovable — full-pop sweep found ZERO user losses, only rent floor). Fixed dexter-mcp widget desc too. Program note: SOL at a receive address is recoverable via a role-0 ops sweep, NOT user-recoverable today (see recon if needed).
4. **Consent-at-birth SDK lane — the big one.** `@dexterai/connect@0.19.0` published: `createWallet` takes `spendPolicy`; new `AllowanceChips` + `CreateWalletPanel` (`./react`); new `authoredPolicy`/`usdToAtomic`/`SESSION_TTL_30D` (`.`); **and the handle-persistence bug fixed** (passkeyLogin/continueWithDexter/popup creates now call setActiveHandle). Server (dexter-api): `user_vaults.birth_spend_limit_atomic` + `birth_policy_authored_at`, written **create-branch-only** (write-once, structurally — closed a plant-onto-existing-vault attack a money review caught), served on `/status`, consumed by `/warmup` (body wins, else stored fallback, else 400 — fail-closed, mutation-verified; TTL normalized server-side to 2592000). Consumers migrated: dexter-fe (chips on all 3 create doors, local birthPolicy deleted), dexter-agents (off the 7-stale pin), dexter-mcp (stray dep removed). Plan: `dexter-connect/docs/superpowers/plans/2026-07-03-consent-at-birth-sdk.md`. **Live-verified**: chips gate on prod (no chip = Create disabled; $20 = enabled).
5. **Activation fix (last thing before handoff, `fed8c09`).** Bug Branch hit live: created a wallet, set $100 custom at creation (recorded fine — `birth_spend_limit_atomic=100000000`), funded $2.50, then withdraw/activate threw "set your spend limit / open a tab" because the CLIENT (`firstUse.ts warmupIfNeeded`) never read the stored number and pre-threw before hitting the server. Fixed: `VaultStatus.vault.birthSpendLimitAtomic` typed in `client.ts`; `warmupIfNeeded` falls back to it when the caller authored no fresh policy (fails closed only if BOTH absent, never invents). **Deployed.**

---

## 2. OPEN ISSUES (not yours unless noted)

- **Finalize error 6070 `DebtTransferMismatch`** — Branch hit this AFTER the activation fix (activation succeeded, swig deployed, then FinalizeWithdrawal simulation failed at `dexter-vault/programs/dexter-vault/src/verify/swig_transfer.rs:165`). **Branch started a SEPARATE Fable on this — DO NOT touch it.** Context for them: `decode_following_swig_transfer` requires the next instruction be a swig SignV2 wrapping exactly one SPL TransferChecked, and the booked debt must reconcile with that transfer amount. Fired on a *first-activation finalize* (swig freshly deployed via the allowance fix, so the debt-booking path is exercised fresh). Likely suspect: withdraw amount vs the $0.50 fee vs booked debt on an activate-and-withdraw-in-one-shot. Builder: `dexter-api/src/vault/finalizeWithdrawBuilder.ts`.
- **`/wallet` dead-ends unconnected users** (YOUR queue, right behind OAuth). A fresh funded-but-unconnected wallet is told to "open a tab" — which is NOT a browser action (a tab is an agent spend-authorization; see §5 THE MODEL). The page should instead guide them to CONNECT their wallet to their agent tool. This is the UX bridge that makes OAuth's payoff legible.

---

## 3. LANE 1 — OAuth ADVERTISEMENT on open-mcp (HIGHEST PRIORITY — Branch's acceptance test)

**Goal:** make claude.ai run the Face-ID OAuth dance when a user connects `open.dexter.cash` and asks to spend — instead of dropping to the old email connector. This is the front door that gets a wallet INTO an agent tool. Branch tested it live on his iPhone weeks ago and got the EMAIL page; he ruled OAuth-native connect the build ("prompt on the grant, never on the spend" is his law).

**Full recon JSON preserved at:** `dexter-mcp/docs/superpowers/plans/2026-07-03-RECON-oauth-advertisement.json` (read `.result.probe/.server/.as/.contracts`). Distilled below.

### THE decisive insight (this is the whole fix for "WHAT ABOUT THE PASSKEY PAGE")
The step-0 probe PROVED claude.ai runs the full discovery dance, but it advertised `scopes_supported:["wallet.read"]`. claude.ai **copies the PRM scope verbatim** → requested `scope=wallet.read` → routed to the OLD Supabase EMAIL connector. That is EXACTLY the email screen Branch saw. The vault/passkey rail (dexter-api `51bbe519`) fires ONLY on `scope=vault` (single exact token), which 302s to `dexter.cash/tabs/setup` = the Face-ID page. **So: advertise `scopes_supported:["vault"]` and the passkey page appears.** The plumbing behind it (`d192047` verify+seed) is deployed and proven 6/6.

### LANDMINE: the on-disk probe file is a STALE DRAFT — do not build from it
`dexter-mcp/probe/oauth-timing-probe.mjs` is a truncated 97-line draft (wrong ports 3941, wrong paths `/mcp-probe-a`). The probe that ACTUALLY ran was `probe-oauth-server.mjs` (repo root, never committed, deleted at teardown) — its real wiring was recovered from transcript `dc060fc9` and is in the recon JSON. Trust the recon, not the file.

### What to BUILD (the "one hard gap": open.dexter.cash serves no PRM, no 401)
Live-verified today: `open.dexter.cash/.well-known/oauth-protected-resource/mcp` → 404; unauth POST /mcp init → 200 with no WWW-Authenticate. Server is `dexter-mcp/open-mcp-server.mjs` (PM2 `dexter-open-mcp`, :3931, **no build step — edit + `pm2 restart dexter-open-mcp` is the whole deploy**; in-memory sessions drop on restart but bound ones self-heal via mcp-binding/Bearer).

**Insertion point A — PRM endpoint** (`open-mcp-server.mjs` between line 2708 and the 404 catch-all at 2711): serve RFC 9728 at BOTH `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`:
```json
{"resource":"https://open.dexter.cash/mcp","authorization_servers":["https://mcp.dexter.cash/mcp"],"scopes_supported":["vault"]}
```
nginx needs NO change (`location /` already proxies to :3931).

**Insertion point B — spend-tool 401 challenge** (`open-mcp-server.mjs` inside the POST existing-session branch ~2760–2777, AFTER the awaited `seedOAuthVaultBinding` at 2756-2758, BEFORE `transport.handleRequest`): parse the body, and for `tools/call` on a SPEND-class tool name — `x402_pay` (1263), `x402_fetch` (1293), `dexter_passkey` (1691) — challenge with 401 + `WWW-Authenticate: Bearer resource_metadata="https://open.dexter.cash/.well-known/oauth-protected-resource/mcp", scope="vault"` ONLY when: no Bearer present (`extractBearer` 2558) AND not `sessionMeta.bound` AND the durable `/api/passkey-anon/mcp-binding/<sessionId>` lookup (501-507) misses. Then `await transport.handleRequest(req, res, parsedBody)` — **you MUST pass the parsed body as the 3rd arg or the SDK hangs on the drained stream**. Copy the exact `unauthorized()` shape from `mcp.dexter.cash`'s `http-server-oauth.mjs:579-644` (JSON-RPC -32001 body + resource_metadata append). initialize/tools/list/browse/x402_check stay anonymous (challenge placement ruled: mid-session on the grant, empirically proven vs Branch's real claude.ai).

**CRITICAL GOTCHAS (from recon `.server.gotchas` + `.as.gotchas`):**
- CANNOT emit 401 from inside a tool callback (transport already committed) — must be pre-transport in the raw handler.
- Do NOT challenge on `sessionMeta.bound` alone (dies on restart while `mcp_vault_bindings` rows survive) — always run the durable mcp-binding lookup first, or you wall a paying user after every restart.
- Keep the `seedOAuthVaultBinding` await BEFORE the challenge (a post-OAuth retry carries the Bearer; seed must land/mark-bound first or the first retry re-challenges). Bearer PRESENCE alone should suppress the 401 (let verify decide) so a slow token doesn't loop.
- A 401 must NOT tear down the session (don't touch transports/sessionMeta on the challenge path). Don't reorder the 404-on-unknown-session at 2781-2796 (load-bearing for the claude.ai proxy). GET/SSE + DELETE paths untouched. Bodies can be JSON-RPC batch arrays — check every message.
- **Scope-consistency check before shipping:** the live AS metadata at `mcp.dexter.cash/.well-known/oauth-authorization-server` advertises `scopes_supported:[wallet.read,wallet.trade,openid]` — NOT vault. The probe proved claude.ai copies scope from the PRM (it requested wallet.read which was in the probe PRM), so PRM `["vault"]` SHOULD drive `scope=vault`. **But** if claude.ai intersects with AS metadata, "vault" isn't there. SAFEST: also add `vault` to that AS's `scopes_supported` in `dexter-mcp`'s `http-server-oauth.mjs` (:3930 = mcp.dexter.cash) for consistency. Verify against Branch's live app.
- **Supabase-redirect trap:** the EXACT path `mcp.dexter.cash/mcp/.well-known/oauth-authorization-server` 302s to Supabase OIDC (`http-server-oauth.mjs:1134`, "Track 1 for Claude"). Root and path-insertion forms return the real AS JSON (verified: `/.well-known/oauth-authorization-server/mcp` → 200). The probe showed claude.ai fetched the ROOT form and got the real AS. Confirm which form your PRM's `authorization_servers` drives claude.ai to; kill the /mcp-prefixed redirect if it interferes.
- Also update the stale `/.well-known/mcp.json` ("no authentication required", lists 6 of 16 tools) and the `health` `auth:false` claim.

### The AS side is ALREADY LIVE (don't rebuild it)
dexter-api IS the AS: `GET /api/connector/oauth/authorize` scope=vault → 302 `dexter.cash/tabs/setup?request_id=vpair_...` (redirect allowlist includes `https://claude.ai/api/mcp/auth_callback`); passkey approve → `vac_` code → `POST /api/connector/oauth/token` → ES256 Bearer. **Token shape open-mcp verifies (byte-exact):** alg ES256, kid `dx-2026-07-a`, iss `https://dexter.cash`, aud **`https://open.dexter.cash/mcp`** (no trailing slash, fail-closed), sub=b64url(16-byte handle), `dexter:{ver:1,vault,userHandle,agentGrant:null}`, top-level `dexter_surface`=sha256(dlt_). JWKS `https://dexter.cash/.well-known/jwks.json`. Metadata+DCR are served by `dexter-mcp`'s `http-server-oauth.mjs` (:3930 = mcp.dexter.cash), proxying authorize/token/register into dexter-api.

### ROUTING CONSTRAINT (main-fable's hard money rule — the "one bug that reopens the hole")
OAuth sessions seed the binding ONLY via `POST /api/passkey-vault/pair/oauth-seed` — **NEVER `/bind-mcp-session`** (writes NULL link_token_hash → spend gate treats it as always-live → silently no-ops per-surface revoke). `/oauth-seed` structurally can't write NULL (derives hash from `dexter_surface`; missing → 400). `/bind-mcp-session` has ZERO live callers — leave it orphaned. `d192047`'s `seedOAuthVaultBinding` already does this correctly; don't add any new path that reaches bind-mcp-session.

### ACCEPTANCE (only Branch can run): connect `open.dexter.cash` in claude.ai on his phone, ask to see wallet / pay → gets the **Face-ID passkey page** (not email) → approves → agent can spend. This is money-perimeter: **Fable-tier adversarial review before deploy.** There may be a live-iteration loop with claude.ai's actual scope behavior (the token-exchange leg was never proven E2E — Branch cancelled at the email screen last time).

---

## 4. LANE 2 — ON-RAMP (embedded fiat → USDC-on-Solana). DECISION MADE.

**Full recon JSON:** `dexter-mcp/docs/superpowers/plans/2026-07-03-RECON-onramp.json` (`.result.assets/.mounts/.providers`; the `.trail` reader returned a dud — ignore it, `.assets` covers the history).

### THE DECISION (best product, per Branch — NOT fastest path)
**Coinbase Onramp first; MoonPay disqualified for buys; one Dexter-owned surface.**
- **MoonPay OUT for small buys**: $3.99 min fee ⇒ ~20% on a $20 buy, + doc/selfie KYC on first purchase = worst version of the moment that matters most. (The MoonPay PARTNER relationship stays where it belongs — the Dextercard carrier; named contact "Carson", green-lit, `dexter-api/src/routes/dextercard.ts`.)
- **Coinbase WINS**: dexter-api ALREADY holds a live `CDP_API_KEY` (`.env:226`) with working Ed25519-JWT auth code (`facilitatorCapabilities.ts:2,177`; `coinbase-cdp-call` skill). Coinbase-account holders (largest US crypto base) buy with ZERO new KYC, ACH 0.5% (0% USDC promo). GTM cohesion: fund your Dexter Wallet with the issuer of the dollar it holds.
- **Apple Pay is the through-line** (Branch lit up on this): the wallet's pitch is "No app. Just your face." Face ID creates → Face ID authors the allowance → Apple Pay (Face ID) funds. Three face scans, nothing typed. **Coinbase killed hosted guest-checkout June 30, 2026** — the no-account Apple Pay flow now needs their **Headless Onramp API** (an application; WE build the payment UI). That's the best-product path: the Apple Pay sheet pops inside OUR ember surface, Dexter-branded end-to-end — the SDK-chips pattern applied to money-in.

### BUILD SHAPE (two phases, one surface)
- **Phase 1 (ships now, no waiting):** a session-token endpoint in dexter-api (existing CDP key + JWT covers it) minting a Coinbase session token for the user's Solana address; a "Buy USDC" CTA on the deposit surfaces. **LANDMINE:** a fresh vault's receive address (swig PDA, off-curve) has NO USDC ATA until first deposit — an on-ramp delivering to an ATA-less address FAILS. There's an idempotent, treasury-funded `provisionUsdcAta` (`dexter-fe/app/lib/vault/client.ts:258` → dexter-api `POST /api/passkey-vault/provision`) but only on the AUTHED rail — guests can't pre-provision (close that gap or gate the CTA behind sign-in). Sequence the click: `if authToken && !usdcAtaExists → await provisionUsdcAta` BEFORE opening Coinbase. **Sleeper win:** `buildOpenFunding()` (`dexter-api/src/routes/x402Pay.ts:292-312`) feeds EVERY "not funded" error across ~12 MCP/x402 surfaces — add an `onrampUrl` field there and every agent hitting an unfunded wallet gets a buy link too.
- **Phase 2:** guest Apple Pay via Headless Onramp inside our chrome, once the app clears. Transak = pocket fallback rail for non-Coinbase users if Phase-1 data shows a need (Transak needs a backend session-mint + KYB).

### MOUNT POINTS (`.mounts`)
Deposit surfaces are address+QR only: `DepositPanel.tsx` (mounted at `/tabs/deposit`) and VaultHome's deposit row (at `/wallet`). First CTA: inside DepositPanel beside "Copy address" (`DepositPanel.tsx:76-82` — it already has authToken+vaultPda+usdcAtaExists). CSP lives in nginx (`next.config.js` has none); it already whitelists Crossmint (retired) — a redirect/URL handoff needs NO CSP change; an embedded widget other than Crossmint needs a one-line nginx `$csp_val` edit. Second mount: VaultHome deposit row (`VaultHome.tsx:256-265`).

### BRANCH'S LEGWORK (hand him this; he WILL do it — never optimize around asking):
1. ~5 min in the CDP portal: enable the **Onramp** product on the existing project (key's already ours).
2. Submit the **Headless Onramp** application when at a desk — that's the Phase-2 Apple-Pay-guest gate; sooner = sooner native sheet.

---

## 5. THE PRODUCT MODEL (Branch asked "how does anyone actually open a tab?" — the answer that ties both lanes together)
- **A tab is NOT a browser button — it's an agent action** (a spend authorization for a specific agent/session against the vault). There is correctly no "open a tab" button.
- **`/wallet` is the bank app** (fund, monitor, toggle agent-spend, revoke, see tabs/credit). **The agent is the point of sale.**
- **The bridge — "get my wallet into my software tool" — is the CONNECT flow** = LANE 1 (OAuth). Connect open.dexter.cash in claude.ai/CLI → vault binds to the agent session → the agent opens tabs & pays via x402; the FIRST spend activates the swig using the birth-authored allowance (LANE 1 + the activation fix). pay.sh is a future integration; OpenDexter is live now.
- So the two lanes ARE the answer to Branch's confusion: OAuth = the door, the activation fix = the first spend just works. The `/wallet` "connect to your agent" CTA (§2) is the missing signpost.

---

## 6. START HERE
1. Read the two RECON JSONs + this doc + the memory files named in §0.
2. Write the OAuth plan to `dexter-mcp/docs/superpowers/plans/2026-07-03-oauth-advertisement.md` (I had NOT written it yet — recon is done, insertion points in §3 are exact). Build it subagent-driven (Opus implementers), Fable money-review before deploy, then hand Branch the claude.ai acceptance test.
3. Then the on-ramp Phase-1 plan (§4) + the `/wallet` connect-CTA.
4. Keep agent-mail current as the ledger (send to `connect-fable` inbox for connect-repo work — it's the re-seat briefing, not a blocker). Verify delivered mail bodies (backticks in `--body` get eaten; use the temp-file form).
