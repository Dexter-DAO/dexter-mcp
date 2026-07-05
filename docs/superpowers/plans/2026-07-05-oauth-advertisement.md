# OAuth Advertisement on open.dexter.cash — Implementation Plan (Workstream 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> Source spec: `docs/superpowers/plans/2026-07-03-PICKUP-fable-oauth-onramp.md` §3 (the recon
> is exact; line numbers are 2-day-old ANCHORS — re-derive against HEAD `3517d89` before editing).
> Recon detail: `docs/superpowers/plans/2026-07-03-RECON-oauth-advertisement.json`.

**Goal:** claude.ai (and any RFC-9728-aware client) connecting `open.dexter.cash/mcp` discovers the
vault OAuth rail and runs the Face-ID dance on the first spend attempt — instead of dropping to the
legacy email connector. Two files, no build step, deploy = pm2 restart.

**The decisive fact:** clients copy the PRM's `scopes_supported` verbatim into their authorize
request. `scope=vault` (exact token) is what routes dexter-api's authorize to the passkey page.
Advertise `["vault"]` and the Face-ID page appears; the entire rail behind it is deployed and proven.

## Global Constraints (verbatim from the spec — violations are ship-blockers)

- 401 must be emitted PRE-transport in the raw POST handler (a tool callback cannot emit it).
- Never challenge on `sessionMeta.bound` alone — run the durable `/api/passkey-anon/mcp-binding/<sessionId>`
  lookup first (in-memory state dies on restart; bindings survive; otherwise you wall a paying user).
- `seedOAuthVaultBinding` await stays BEFORE the challenge; Bearer PRESENCE alone suppresses the 401
  (verification decides downstream — a slow token must not loop).
- A 401 must NOT tear down the session (no transport/sessionMeta mutation on the challenge path).
- Do not reorder the 404-on-unknown-session block (load-bearing for claude.ai's proxy).
- GET/SSE + DELETE paths untouched. JSON-RPC bodies can be BATCH ARRAYS — inspect every message.
- After parsing the body for inspection you MUST pass it as the 3rd arg:
  `await transport.handleRequest(req, res, parsedBody)` — or the SDK hangs on the drained stream.
- ROUTING (money rule): binding writes go ONLY through `/oauth-seed`; `/bind-mcp-session` stays
  orphaned (NULL link_token_hash = revoke silently no-ops). This plan ADDS NO binding writes at all.
- anonymous stays anonymous: initialize / tools/list / browse / x402_check / x402_search never challenge.
  Spend-class = `x402_pay`, `x402_fetch`, `dexter_passkey`.
- Fable-tier adversarial money review BEFORE deploy (controller runs the deploy, not the implementer).

### Task 1: PRM + AS scope consistency + honesty fixes (dexter-mcp)

**Files:** Modify `open-mcp-server.mjs` (PRM endpoint before the 404 catch-all; `/.well-known/mcp.json`
+ `health` honesty), `http-server-oauth.mjs` (add `vault` to `scopes_supported` on the AS metadata).

- [ ] PRM served at BOTH `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`:
  `{"resource":"https://open.dexter.cash/mcp","authorization_servers":["https://mcp.dexter.cash/mcp"],"scopes_supported":["vault"]}`
  — CHECK the `authorization_servers` value against what claude.ai actually fetches (recon: it fetched
  the ROOT AS metadata form; the exact `/mcp`-prefixed path 302s to Supabase — spec gotcha. If the root
  form is the working one, point at `https://mcp.dexter.cash` and verify which form serves real JSON).
- [ ] `http-server-oauth.mjs`: `scopes_supported` gains `vault` (keep existing tokens).
- [ ] `/.well-known/mcp.json`: stop claiming "no authentication required"; list the real tool set.
  `health`: fix `auth:false`.
- [ ] No pm2 restart in this task.

### Task 2: 401 challenge on spend tools (open-mcp-server.mjs)

- [ ] In the POST existing-session branch, AFTER the awaited `seedOAuthVaultBinding`, BEFORE
  `transport.handleRequest`: parse body (single message OR batch); if any message is `tools/call`
  with a spend-class name AND no Bearer present AND `sessionMeta.bound` false AND the durable
  mcp-binding lookup misses → respond 401, JSON-RPC error -32001 body, header
  `WWW-Authenticate: Bearer resource_metadata="https://open.dexter.cash/.well-known/oauth-protected-resource/mcp", scope="vault"`
  — copy the exact `unauthorized()` shape from `http-server-oauth.mjs` (~:579-644).
- [ ] All non-challenge paths: `transport.handleRequest(req, res, parsedBody)` with the parsed body.
- [ ] New-session (initialize) path: untouched, anonymous.

### Task 3: money review (controller-dispatched, Fable) → deploy → live verification

- [ ] Adversarial review against the Global Constraints (each one a named check).
- [ ] Deploy: `pm2 restart dexter-open-mcp` + `pm2 restart dexter-mcp`.
- [ ] Live matrix (report actual bodies):
  - `curl https://open.dexter.cash/.well-known/oauth-protected-resource/mcp` → 200, exact JSON (+ root form).
  - `curl https://mcp.dexter.cash/.well-known/oauth-authorization-server | jq .scopes_supported` → includes `vault`.
  - Anonymous initialize → 200, session id; tools/list on it → 200, NO challenge.
  - `tools/call x402_check` anonymous → 200 (never challenged).
  - `tools/call x402_fetch` anonymous, no Bearer, unbound → **401 + WWW-Authenticate** with the exact header.
  - Same call WITH a garbage Bearer → NOT the pre-transport 401 (downstream verify handles it).
  - Session survives the 401: tools/list on the same session id afterward → 200.
- [ ] Hand Branch the acceptance test: connect `open.dexter.cash/mcp` in claude.ai on his phone →
  ask to pay for something → Face-ID passkey page (NOT email) → approve → the spend lands.
