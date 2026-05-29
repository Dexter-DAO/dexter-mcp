# Harness Operations

The Playwright harness lives in `../dexter-agents/scripts/runHarness.js` with CLI entry `scripts/dexchat.js` (npm script `dexchat`). Append `--guest` to skip stored auth and exercise the anonymous path; the API leg still rides on the shared demo bearer (`TOKEN_AI_MCP_TOKEN`).

Core commands:

```bash
# Standard run (UI + API with 15s wait)
npm run dexchat -- --prompt "<prompt>" --wait 15000

# Pumpstream harness from this repo (UI + API)
npm run test:pumpstream -- --mode both --prompt "List pump streams"

# Targeted API-only regression run
npm run test:pumpstream -- --mode api --page-size 10 --json --no-artifact
```

Pass harness flags (`--prompt`, `--url`, `--wait`, `--headful`, `--no-artifact`, `--json`, `--mode`, `--page-size`) directly; they forward to the underlying runners. `.env` is auto-loaded so long-lived values such as `HARNESS_COOKIE`, `HARNESS_AUTHORIZATION`, and `HARNESS_MCP_TOKEN` can live there instead of the shell. Artifacts land in `dexter-agents/harness-results/` unless you opt into `--no-artifact`.

Monitor the console for schema warnings (for example, Zod `.optional()` used without `.nullable()`). Treat any warning as a regression that must be cleared before release. Harness artifacts are the source of truth for recent behavioural checks; house longer-form analysis elsewhere so this document stays operational.

For production, PM2 is managed through `dexter-ops/ops/ecosystem.config.cjs`. The config already forwards `TOKEN_AI_MCP_OAUTH=true` and supporting variables; restart via:

```bash
pm2 restart dexter-mcp
pm2 logs dexter-mcp
```

## Session Maintenance Cheatsheet

```
Turnstile + Supabase login (desktop helper)
           │  generates encoded cookie + state.json
           ▼
HARNESS_COOKIE in repos (.env)
           │  injected into Playwright runs
           ▼
Dexchat / pumpstream harness executions
```

| Situation | Run this | Result |
|-----------|----------|--------|
| Have a new encoded cookie string | `dexchat refresh` (in `dexter-agents`) | Updates both repos' `.env` files and rewrites `~/websites/dexter-mcp/state.json` through a local Playwright run. |
| Want a scripted variant | `npm run dexchat:refresh -- --cookie $(cat cookie.txt)` | Same as above without the interactive prompt. |
| Supabase session has expired / cookie immediately fails | `refresh-supabase-session.ps1` (desktop helper) | Spins up SOCKS proxy + Chrome for Turnstile + Supabase login, prints the cookie, and can refresh storage automatically. Afterwards run `dexchat refresh` with the new value. |
| Validate guest behaviour | `npm run dexchat -- --prompt "..." --guest` (or add `--guest` to `npm run pumpstream:harness ...`) | Runs the UI anonymously while the API leg reuses the shared demo bearer (`TOKEN_AI_MCP_TOKEN`). |

Storage state only changes when the harness runs with `--storage` (the refresh helper toggles it automatically). If the cookie helper warns that the pasted value is missing `sb-…-refresh-token`, per-user MCP tokens cannot be minted; re-run the desktop helper to capture a full credential set.

The desktop helper is rare (weeks between runs). `dexchat refresh` is the lightweight, local option you'll use most often. Additional command details live in `dexter-agents/scripts/README.md`.
