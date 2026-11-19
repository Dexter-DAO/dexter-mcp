# Dexter MCP Agents

> **STATUS:** content below the divider is likely outdated. New guidance lives above it as we refresh the MCP architecture notes.

## Current MCP Architecture (WIP)
- **How MCP tools show up:**
  1. `dexter-api/src/payments/x402Config.ts` defines every paid route (method + path, price, asset, `discoverable` flag, schemas). When a route is marked discoverable, it is meant for public cataloging.
  2. `registerX402Routes()` wraps those routes with the x402 payment middleware. Any 402 response automatically calls `upsertX402ResourceSnapshot`, which persists the raw `accepts[]` payload and metadata into `x402_resources`.
  3. The API exposes that catalog via `GET /api/x402/resources`. Third parties can also POST new entries to `/api/x402/resources/register` if they need to seed the table manually.
  4. Dexter MCP’s `registry/x402` module polls `/api/x402/resources` (respecting `TOKEN_AI_MCP_TOKEN` when provided), normalizes the records, and builds MCP tool definitions on the fly. Every discoverable resource therefore turns into an MCP tool without editing this repo; the cache refreshes every `X402_CATALOG_TTL_MS` (default 60s).
  5. Connector runtimes (ChatGPT, Claude, Dexter Voice, etc.) receive the refreshed toolset as soon as the MCP server reloads the catalog, so newly-added paid routes become available everywhere after their first 402 challenge.

- **Prompt persona + tool descriptions:**
  1. All instruction/tool blurbs live in `dexter-api`’s `prompt_modules` table (see `PROMPT_PROFILES_OVERVIEW.md`). Each slug (e.g., `agent.concierge.instructions`, `agent.concierge.tool.twitter_search`) stores the actual text plus version metadata.
  2. `dexter-api/src/promptProfiles.ts` stitches those slugs together via `resolveConciergeProfile()` and serves them through `GET /prompt-profiles/active`. Every transport (ChatGPT MCP, Claude, voice, Twitter bots, etc.) hits this endpoint during startup.
  3. When a slug changes in `prompt_modules`, the new text automatically propagates to MCP runs—no edits in `dexter-mcp` are needed. The Apps SDK prompt we pass to OpenAI is literally the `/prompt-profiles/active` payload, so keeping `prompt_modules` up to date keeps MCP persona/tool instructions in sync.
  4. If we ever add MCP-specific guardrails, write the draft in `prompt_modules` and let `/prompt-profiles` deliver it; this repo should stay logic-only (no inline instructions).

_Next additions:_ flesh out the specific MCP packaging steps (tool naming, auth hints) and any manual overrides we still support.

## Apps SDK Build & Deploy

Widget UI components live in `apps-sdk/ui/` and are served to ChatGPT via MCP `resources/read`.

### Build Commands
```bash
npm run build:apps-sdk   # Build + auto-deploy to production path
npm run deploy:apps-sdk  # Deploy only (if already built)
npm run deploy:mcp       # Build + deploy + restart MCP server
```

### Architecture
```
apps-sdk/ui/src/          # Widget source (React/TSX)
        ↓ vite build
public/apps-sdk/          # Local build output (HTML + hashed JS/CSS)
        ↓ rsync (automatic)
dexter-fe/public/mcp/app-assets/   # Production path (nginx-served)
```

**Why two locations?** Nginx serves `/mcp/app-assets/` from `dexter-fe`, not `dexter-mcp`. The deploy script syncs automatically after each build.

### How Widget Loading Works
1. ChatGPT calls MCP `resources/read` → `register.mjs` reads HTML from `public/apps-sdk/`
2. `register.mjs` injects bootstrap script and rewrites asset URLs to `https://dexter.cash/mcp/app-assets/`
3. ChatGPT iframe renders HTML, fetches JS/CSS from nginx-served `dexter-fe` path

### Common Issues
- **Blank widgets:** Usually means assets weren't deployed (file hash mismatch). Run `npm run build:apps-sdk`.
- **CSP errors:** Check `bootstrap.js` for any dynamic DOM manipulation that ChatGPT's sandbox blocks.
- **Widget not updating:** ChatGPT may cache widget HTML. Start a new conversation to force refresh.

---

## Toolset Overview
- **general** – `search` performs realtime web queries via Tavily (supports `max_results`, depth, answer summaries); `fetch` extracts full page content for a given URL. Requires `TAVILY_API_KEY` (`toolsets/general/index.mjs`).
- **pumpstream** – `pumpstream_live_summary` queries `https://pump.dexter.cash/api/live` and returns a condensed, paged stream snapshot. Schema supports `pageSize`/`offset`/`page`, search, symbol & mint filters, sort, status, min viewer / USD market-cap thresholds, plus optional spotlight data.
- **wallet** – Session-aware wallet helpers (`resolve_wallet`, `list_my_wallets`, `set_session_wallet_override`, `auth_info`) backed by `/api/wallets/resolver`. Session overrides are stored in-memory and keyed by the MCP session header.
- **solana** – Managed Solana trading utilities (`solana_resolve_token`, balance listings, swap preview/execute) proxied through Dexter API.
- **markets** – `markets_fetch_ohlcv` uses Birdeye’s v3 pair endpoint; provide a pair address or let it auto-pick the top-liquidity pair for a mint (`toolsets/markets/index.mjs`).
- **codex** – Conversational (`codex_start`, `codex_reply`) and exec-mode (`codex_exec`) bridges to the Codex CLI. Exec mode supports optional JSON schemas for structured output. Off by default: registered only when `DEXTER_MCP_ENABLE_CODEX_TOOLS=1` (`toolsets/index.mjs`).
- **stream** – Public shout utilities only (`stream_public_shout`, `stream_shout_feed`) so MCP concierge sessions can read/write overlay shouts once authenticated. Scene management now lives outside the MCP toolset.
- **onchain** – Token/wallet analytics (`onchain_activity_overview`, `onchain_entity_insight`) proxied through Dexter API with Supabase auth passthrough.
- **Outbound requests** – Any URL a caller, a catalog entry, a seller's response or a redirect can influence goes through the guard in `packages/x402-core/src/public-url.ts` (`fetchPublicExternalUrl`): public addresses only, connection pinned to the checked address, every redirect hop checked again. `clients/x402Client.mjs` uses it when called with `publicResource: true`. `DEXTER_OUTBOUND_BLOCKED_ADDRESSES` adds this server's own public address (`lib/outbound-defaults.mjs`). Do not call `fetch` directly on such a URL.
- **x402** – Auto-registered paid resources from dexter-api (`slippage_sentinel`, `jupiter_quote_preview`, `twitter_topic_analysis`, `solscan_trending_tokens`, `gmgn_snapshot_access`, etc.). Catalog updates automatically feed new tools as soon as the API advertises them.
- **hyperliquid** – `hyperliquid_markets`, `hyperliquid_opt_in`, and `hyperliquid_perp_trade` expose the managed Hyperliquid copy-trading helpers.

All toolsets register through `toolsets/index.mjs`. If `TOKEN_AI_MCP_TOOLSETS` is unset, every registered group loads; set the variable (comma-separated keys or `all`) to control selection.

## Harness Operations
- **Location** – `../dexter-agents/scripts/runHarness.js` with CLI entry `scripts/dexchat.js` (npm script `dexchat`). Append `--guest` to skip stored auth and test the anonymous path—the API leg still uses the shared demo bearer (`TOKEN_AI_MCP_TOKEN`).
- **Standard run** –
  ```bash
  npm run dexchat -- --prompt "<prompt>" --wait 15000
  ```
- **From this repo** – `npm run test:pumpstream -- --mode both --prompt "List pump streams"` (UI + API). Use `--mode ui` or `--mode api` for single-path runs.
- **Artifacts** – Saved under `dexter-agents/harness-results/` unless `--no-artifact` is provided. Each JSON artifact records prompt, console logs, rendered transcript bubbles, and the structured event payloads from the app.
- **Monitoring** – Review console output for schema warnings (e.g., Zod `.optional()` without `.nullable()`) and treat them as regressions to be cleared before release.

### Session Maintenance

```
Turnstile + Supabase login (desktop helper)
           │  generates encoded cookie + state.json
           ▼
HARNESS_COOKIE in repos (.env)
           │  injected into Playwright runs
           ▼
Dexchat / pumpstream harness executions
```

## Operating Notes
- Keep this document evergreen: update tool descriptions when schemas, endpoints, or behaviors change.
