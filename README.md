<p align="center">
  <img src="./public/wordmarks/dexter-wordmark.svg" alt="Dexter wordmark" width="360">
</p>

<p align="center">
  <a href="https://nodejs.org/en/download"><img src="https://img.shields.io/badge/node-20.19%2B%20%7C%2022.12%2B-green.svg" alt="Node 20.19+ or 22.12+"></a>
  <a href="https://mcp.dexter.cash/mcp"><img src="https://img.shields.io/badge/MCP-https%3A%2F%2Fmcp.dexter.cash%2Fmcp-blue.svg" alt="MCP endpoint"></a>
  <a href="https://dexter.cash"><img src="https://img.shields.io/badge/stack-Dexter%20Connectors-purple.svg" alt="Dexter connectors"></a>
</p>

<p align="center">
  <a href="https://github.com/Dexter-DAO/dexter-api">Dexter API</a>
  · <a href="https://github.com/Dexter-DAO/dexter-fe">Dexter FE</a>
  · <strong>Dexter MCP</strong>
  · <a href="https://github.com/Dexter-DAO/dexter-vault">Dexter Vault</a>
  · <a href="https://github.com/Dexter-DAO/dexter-facilitator">Dexter Facilitator</a>
</p>

This repo contains two hosted MCP servers and the shared `@dexterai/x402-core` package:

| Product | Endpoint | Auth | Payment |
|---------|----------|------|---------|
| **Dexter MCP** (authenticated) | `mcp.dexter.cash/mcp` | Dexter OAuth | Managed wallet, automatic |
| **OpenDexter MCP** (hosted) | `open.dexter.cash/mcp` | Mixed per tool: public access or OAuth `scope=vault` | Session-bound passkey wallet; explicit user approval |

The npm packages (`@dexterai/opendexter`, `@dexterai/x402-discovery`) live in [Dexter-DAO/opendexter-ide](https://github.com/Dexter-DAO/opendexter-ide).

This OpenDexter source candidate requires the coordinated internal package
train recorded in
[`release/opendexter-dependency-train.json`](./release/opendexter-dependency-train.json).
Its release runtime is Node `^20.19.0 || >=22.12.0`, matching the pinned Vite
toolchain; `npm run verify:release:runtime` checks that boundary before install
or build.
Until those exact versions are published, there is deliberately no registry
lock and `deploy:mcp` fails its lock gate. An isolated local source train and
its installed dependency graph can be checked without deploying:

```bash
OPENDXTER_IDE_SOURCE=/absolute/path/to/opendexter-ide-candidate \
OPENDXTER_RUNTIME_ROOT=/absolute/path/to/disposable-installed-graph \
  npm run verify:release:source
```

The source gate verifies the current Node runtime, package Git provenance,
exact installed versions, source-link destinations, built entrypoints, and npm
peer closure. The release path separately verifies the Node runtime and
registry lock, performs `npm ci`, builds the hosted workspace package, and
rejects any installed graph that differs from the recorded train.

Use `npm run build:apps-sdk:local` for a non-deploying widget build.
`build:apps-sdk` retains its release behavior and copies served assets.
`deploy:mcp` is an ordered install/build/copy/restart command, not atomic
activation, rollback, health, OAuth, or live-render proof; production use still
requires the coordinated release runbook and post-deploy checks below.

---

## OpenDexter: the hosted x402 buyer

OpenDexter is the hosted MCP server behind the OpenDexter connector. Its
anonymous roster contains search, quote-only price inspection,
identity-gated access, and the wallet and portfolio entrypoints. The latter
two return the host-native Connect path rather than private data until the
session has OAuth `scope=vault` and a durable wallet binding.

OAuth promotes `x402_fetch` and `x402_status`, producing this exact seven-tool
connected roster:

1. `x402_search`
2. `x402_check`
3. `x402_fetch`
4. `x402_status`
5. `x402_access`
6. `x402_wallet`
7. `dexter_portfolio`

There are no hosted compatibility aliases, composed-skill, passkey-probe, or
card tools. The anonymous roster is exactly `x402_search`, `x402_check`,
`x402_access`, `x402_wallet`, and `dexter_portfolio`; it does not include fetch
or status.

Search never pays. `x402_check` accepts the endpoint URL, method, and optional
exact raw request-body string. Anonymous checks are quote-only. An
authenticated check asks Dexter to custody the request and seller terms and
returns one opaque `intentId`. `x402_fetch` accepts only that `intentId` and an
explicit user- or policy-approved `maxAmountAtomic` ceiling. It never accepts
URL, body, route, tab, seller, or caller-carried prepared-purchase JSON.
`x402_status` accepts only the same `intentId` and reads state without
redispatching.

If execution authority is missing, the hosted consent handoff must preserve
the same intent. After any ambiguous or post-dispatch result, OpenDexter does
not retry the purchase; it checks status and reconciliation on that intent.
Internal settlement-rail choice remains API-owned and is not a public tool or
mode menu.

The hosted check/fetch/status adapter also requires
`NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET` (32 bytes or longer), configured to the
same value in Dexter API and this MCP service. Every internal request signs its
timestamp, method, exact route, and exact serialized body. Missing or weak
configuration fails closed before the request leaves MCP; the secret is never
part of a tool argument or result.

**How wallet identity works.** OAuth authorizes the stable
`https://open.dexter.cash/mcp` connector. Protected wallet and portfolio calls
resolve the durable wallet binding for that authenticated MCP session and the
stored passkey-vault identity behind it. They do not accept a caller-supplied
wallet address or user handle. `x402_wallet` reads the bound passkey wallet;
`dexter_portfolio` reads its governed asset inventory without changing the
spendable balance.

**How the npm package differs.** `@dexterai/opendexter` is an independently
versioned local stdio package for Codex, Claude Code, and other agents. It uses
a user-controlled local signer instead of the hosted connector's OAuth and
session binding. This hosted source contract does not assert that a published
npm version has adopted the seven-tool opaque-intent boundary. Its package,
install guidance, and seller-side `opendexter audition <url>` command live in
[Dexter-DAO/opendexter-ide](https://github.com/Dexter-DAO/opendexter-ide).

| | OpenDexter MCP | `@dexterai/opendexter` |
|---|---|---|
| Transport | Hosted HTTP MCP | Local stdio MCP |
| Authorization | Mixed per-tool OAuth contract | Local process and signer |
| Wallet identity | Durable passkey wallet bound to the authenticated MCP session | User-controlled local signer |
| Executable roster | Five anonymous entry tools; seven after OAuth promotion | Independently versioned; verify the installed package |
| Seller onboarding | Not exposed as a hosted tool | `opendexter audition <url>` |
| Best for | ChatGPT, Claude, hosted agents | Codex, Claude Code, CLI agents |

Source: `open-mcp-server.mjs` (hosted server). npm package source is in [opendexter-ide/packages/mcp](https://github.com/Dexter-DAO/opendexter-ide/tree/main/packages/mcp).

The opaque-intent boundary and its unverified backend dependencies are
documented in
[`docs/contracts/OPENDXTER-OPAQUE-INTENT-V1.md`](./docs/contracts/OPENDXTER-OPAQUE-INTENT-V1.md).
It is a source candidate, not proof of deployment or end-to-end settlement.

---

## Dexter MCP: the authenticated server

The authenticated server at `mcp.dexter.cash/mcp` exposes the broader Dexter platform surface over OAuth-authenticated HTTPS, reusing the managed Dexter wallet infrastructure for automatic payment. It's what the Dexter brand connector on Claude and ChatGPT talks to.

Source: `http-server-oauth.mjs`.

---

## Access Tiers

| Label | Who can call | Examples |
|-------|--------------|----------|
| `guest` | Shared demo bearer, no login required | `general/search`, `wallet/resolve_wallet` |
| `member` | Authenticated Supabase session / `dexter_mcp_jwt` | `wallet/list_my_wallets`, `wallet/set_session_wallet_override` |
| `pro` | Role-gated (Pro or Super Admin) | `hyperliquid_markets`, `hyperliquid_perp_trade` |
| `dev` | Super Admins only | `codex_start`, `codex_exec` |
| `internal` | Diagnostic tooling, not exposed to end users | `wallet/auth_info` |

Every new Dexter account ships with a managed wallet, so resolver-backed tools immediately report `source:"resolver"`.

---

## Quick Start

```bash
git clone https://github.com/Dexter-DAO/dexter-mcp.git
cd dexter-mcp
npm install
cp .env.example .env

# populate .env with required Supabase/OAuth settings

# HTTPS transport (port 3930)
npm start

# or stdio transport for local tools
node server.mjs --tools=wallet
```

Verify the HTTP transport:

```bash
curl -sS http://localhost:3930/mcp/health | jq
```

With the public proxy in place:

```bash
curl -H "Authorization: Bearer <TOKEN_AI_MCP_TOKEN>" \
     https://mcp.dexter.cash/mcp/health
```

---

## Authentication

| Mode | When to use | How |
|------|-------------|-----|
| **OAuth2 / OIDC** | Claude, ChatGPT, hosted connectors | Set `TOKEN_AI_MCP_OAUTH=true` and supply `TOKEN_AI_OIDC_*` (or Supabase) endpoints. Users sign in via the Dexter IdP; tokens are validated on every session. |
| **Bearer token** | Service-to-service calls, Codex, Cursor | Define `TOKEN_AI_MCP_TOKEN`. Any request presenting the matching `Authorization: Bearer …` header is accepted without hitting the IdP. |
| **Allow-any (demo)** | Local demos only | Set `TOKEN_AI_MCP_OAUTH_ALLOW_ANY=1`. Skips verification. **Never enable in production.** |

Metadata endpoints (for connector discovery):

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/.well-known/openid-configuration`

These routes are proxied on both `dexter.cash` and `mcp.dexter.cash`, so connectors can follow the same issuer regardless of which hostname they use.

---

## Toolsets

Tool bundles live under `toolsets/<name>/index.mjs` and register themselves through the manifest in `toolsets/index.mjs`. Bundles currently shipped:

| Bundle | What it does |
|---|---|
| `x402` | Auto-registered paid resources from dexter-api (slippage sentinel, Jupiter quote, Twitter topic analysis, Solscan trending, Sora/meme jobs, GMGN snapshot, etc). Updates itself whenever `/api/x402/resources` changes. |
| `wallet` | Session-aware helpers (`resolve_wallet`, `list_my_wallets`, `set_session_wallet_override`, `auth_info`) backed by the Supabase resolver. |
| `solana` | Managed Solana trading utilities (`solana_resolve_token`, balance listings, swap preview/execute) proxied through `dexter-api` with entitlement checks. |
| `markets` | `markets_fetch_ohlcv` over Birdeye v3 pair data, auto-selecting the top-liquidity pair when only a mint is supplied. |
| `onchain` | `onchain_activity_overview` and `onchain_entity_insight` for wallet/token analytics. |
| `general` | Tavily-backed web `search` with depth + answer summaries plus a `fetch` helper for realtime research. |
| `hyperliquid` | `hyperliquid_markets`, `hyperliquid_opt_in`, `hyperliquid_perp_trade` for Hyperliquid copy-trading. |
| `codex` | Bridges MCP clients to the Codex CLI via `codex_start`, `codex_reply`, `codex_exec`. |
| `pumpstream` | `pumpstream_live_summary` view of `https://pump.dexter.cash/api/live` with filters, sort, viewer/USD floors. |
| `stream` | DexterVision shout utilities (`stream_public_shout`, `stream_shout_feed`). |

Each tool exposes an `_meta` block so downstream clients can group or gate consistently:

```json
{
  "name": "solana_swap_execute",
  "title": "Execute Solana Swap",
  "_meta": {
    "category": "solana.trading",
    "access": "member",
    "tags": ["swap", "execution"]
  }
}
```

- `category`: high-level grouping for UX (e.g. `wallets`, `analytics`, `solana.trading`)
- `access`: entitlement level (`guest`, `member`, `pro`, `dev`, `internal`)
- `tags`: free-form labels for filtering/badging

Selection options:

| Where | How |
|---|---|
| Environment default | Leave `TOKEN_AI_MCP_TOOLSETS` unset to load every bundle. Set it (comma-separated) to restrict, e.g. `TOKEN_AI_MCP_TOOLSETS=wallet`. |
| Launch profile shortcut | `TOKEN_AI_MCP_PROFILE=opendexter` loads only the x402 surface on the authenticated server. |
| CLI / stdio | `node server.mjs --tools=wallet` or `--profile=opendexter`. |
| HTTP query | `POST /mcp?tools=wallet` or `POST /mcp?profile=opendexter`. |

Legacy Token-AI bundles in `legacy-tools/` remain for reference; they are not registered by default.

---

## Architecture Notes

- `common.mjs`: builds the MCP server, normalizes Zod schemas, wraps tool registration with logging.
- `toolsets/`: declarative manifest of tool bundles plus the wallet toolset implementation. Authoring guide at `toolsets/ADDING_TOOLSETS.md`.
- `server.mjs`: stdio entrypoint (used by local agents and Codex); respects `--tools=` flags.
- `dexter-mcp-stdio-bridge.mjs`: bridges stdio clients to the hosted OAuth HTTP transport (for Codex/Cursor when they only support stdio).
- `http-server-oauth.mjs`: HTTPS transport with OAuth/OIDC, session caching, metadata routes.
- `legacy-tools/`: archived Token-AI tools kept for reference during migration.

Supabase interactions flow through Dexter API helpers for consistent auth enforcement.

---

## Development

For local dev, PM2, harness operations, and Supabase session maintenance, see [`docs/dev/HARNESS.md`](./docs/dev/HARNESS.md).

Dexter Studio uses Claude Agent SDK and Zod 4 in an isolated, non-workspace
tooling profile so it cannot change the hosted MCP's Zod 3 runtime. Run
`npm run studio:setup` once before `npm run studio`.

---

## Dexter Stack

| Repo | Role |
|------|------|
| [`dexter-api`](https://github.com/Dexter-DAO/dexter-api) | OAuth issuer, wallet resolver, OTS buyer-side implementation, x402 billing |
| [`dexter-fe`](https://github.com/Dexter-DAO/dexter-fe) | Web frontend (Claude/ChatGPT connector auth, /wallet dashboard, admin) |
| [`dexter-vault`](https://github.com/Dexter-DAO/dexter-vault) | Open Tabs Standard reference implementation (Anchor program on Solana) |
| [`dexter-facilitator`](https://github.com/Dexter-DAO/dexter-facilitator) | x402 v2 payment facilitator (Solana + EVM) |

---

## License

All rights reserved. This source is public for transparency and reference, not for reuse. You may not copy, modify, redistribute, or use this code in your own projects without written permission from Dexter. The Dexter and OpenDexter names and marks are not licensed for any use.

For licensing inquiries: branch@dexter.cash.
