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
The exact internal versions are published and this candidate carries a
registry-resolved lock. Release construction fails closed if either the lock or
installed graph drifts from the recorded train. An isolated local source train
and its installed dependency graph can be checked without deploying:

```bash
OPENDXTER_IDE_SOURCE=/absolute/path/to/opendexter-ide-candidate \
DEXTER_VAULT_SDK_SOURCE=/absolute/path/to/dexter-vault-sdk-candidate \
OPENDXTER_RUNTIME_ROOT=/absolute/path/to/disposable-installed-graph \
  npm run verify:release:source
```

The source gate verifies the current Node runtime, package Git provenance,
exact installed versions, source-link destinations, built entrypoints, and npm
peer closure. Before npm can run, it rejects dirty or unpinned external source
repositories and any pack lifecycle hook outside the exact reviewed contract.
Vault's declared `prepack` command is matched byte-for-byte but never executed:
the gate exports the reviewed SDK commit into a disposable directory, performs
an exact-lock scripts-disabled install and the explicit reviewed build with npm
10.9.3, then requires the packed bytes to match the registry artifact exactly.
It never uses or changes
the source checkout's ignored `dist/` or `node_modules/`. Release construction
separately verifies the Node runtime and registry lock, performs the exact-lock
install and reviewed builds, and rejects any installed graph that differs from
the recorded train. Descriptor generation exports the exact Git commit into a
disposable directory, installs that archive from its lock, runs only the
reviewed workspace build, and executes the archived materializer. Mutable
checkout files and ignored `node_modules` are never descriptor evidence.

Use `npm run build:apps-sdk:local` for a non-deploying widget build.
`build:apps-sdk` retains its release behavior and copies served assets.
After the API and facilitator releases have been accepted in production, freeze
their advertised immutable identities and regenerate the hosted derivatives in
one step:

```bash
npm run prepare:open-accepted-production
```

Preparation reads `https://api.dexter.cash/health` and
`https://x402.dexter.cash/version` exactly once each. It writes the generated
`release/opendexter-accepted-production.json` receipt, derives the existing
public `sourceContracts/v3` projection from that receipt, and regenerates the
hosted descriptor. Release verification, construction, and activation read
only those frozen files; they never resolve mutable production endpoints.
Construct a sealed candidate from the current clean, canonical Git commit into
an explicit trusted release root without activating it:

```bash
npm run build:mcp-release -- --output-root /absolute/protected/release-root
```

The builder refuses a dirty checkout, hidden index flags, replacement refs, a
noncanonical or unreachable origin, a commit the canonical origin does not
advertise, an existing destination, or an unreviewed Node/npm/lock identity.
`deploy:mcp` accepts only a sealed immutable OpenDexter release containing
deterministic provenance, the exact descriptor, and a complete file manifest
that also authenticates the provenance bytes. It replaces only
`dexter-open-mcp`, while proving the separate legacy `dexter-mcp` PID, path,
configuration, and restart counters remain unchanged. It verifies the new
public process's PM2 and kernel paths, health, exact 5/12 roster, and release
identity before `pm2 save`. Any mismatch independently restores and re-verifies
the prior public OpenDexter process without restarting the private service. It
never reloads or updates an existing process in place. This is still activation,
not authorization to deploy or a substitute for OAuth and real-user product
proof.

---

## OpenDexter: the hosted x402 buyer

OpenDexter is the hosted MCP server behind the OpenDexter connector. Before
authorization it lists search, quote-only price inspection, identity-gated
access, wallet, and portfolio. Wallet and portfolio return the host-native
Connect path until the session has OAuth `scope=vault` and a durable wallet
binding. Authorization adds the seven account-bound payment and governed-asset
tools below.

The complete connected roster is:

1. `x402_search`
2. `x402_check`
3. `x402_fetch`
4. `x402_status`
5. `x402_access`
6. `x402_wallet`
7. `dexter_portfolio`
8. `dexter_prepare_asset_action`
9. `dexter_execute_asset_action`
10. `dexter_asset_action_status`
11. `dexter_reconcile_asset_action`
12. `dexter_wallet_history`

The anonymous roster is `x402_search`, `x402_check`, `x402_access`,
`x402_wallet`, and `dexter_portfolio`. OAuth adds `x402_fetch`, `x402_status`,
and the five governed-asset tools. Compatibility aliases, composed-skill,
passkey-probe, and card tools stay outside this hosted roster.

Search never pays. `x402_check` accepts the endpoint URL, method, and optional
exact raw request-body string. Anonymous checks are quote-only. An
authenticated check asks Dexter to custody the request and seller terms and
returns one opaque `intentId`. `x402_fetch` accepts only that `intentId` and an
explicit user- or policy-approved `maxAmountAtomic` ceiling. It never accepts
URL, body, route, tab, seller, or caller-carried prepared-purchase JSON.
`x402_status` accepts only the same `intentId` and reads state without
redispatching.

If execution authority is missing, the hosted consent handoff must preserve
the same intent. Only a returned `dispatch.boundary: "crossed"` permits the
agent to say the merchant request was dispatched. A missing result or
host-disabled invocation never does. After a returned pending, ambiguous, or
post-dispatch result, OpenDexter does not retry the purchase; it checks status
on that same intent.
Internal settlement-rail choice remains API-owned and is not a public tool or
mode menu.

Governed Buy and Sell, plus the preserved fail-closed Send contract, use one
API-owned intent through five public tools. `dexter_prepare_asset_action`
accepts one stable `operationId` plus the
exact action fields and persists/evaluates the request without signing or
submitting it. Send and non-stock Buy/Sell use the canonical `assetId` returned
by `dexter_portfolio` from an approved holding or an `approvedActionTarget`
whose matching action is available, never a symbol or mint. Natural-language
stock Buy/Sell instead use the exact human `companyQuery`; the API normalizes
that query and selects and pins the current catalog product. A caller must
never replace a stock query with a remembered static `assetId`, symbol, or
mint. Stock Buy supports either an `amountAtomic` USDC budget (6 decimals) or
a human decimal `shareQuantity` minimum-receive target, optionally bounded by
`maximumSpendAtomic`. Stock Sell supports `companyQuery` plus direct token
`amountAtomic`; it does not accept `shareQuantity`. For non-stock Sell and
Send, `amountAtomic` is the selected asset amount using the server-certified
decimals. Send does not expose a memo.

A prepared stock result exposes the immutable release in top-level
`stockRuntime` and its frozen catalog pin in `preview.stockSelection`.
Execute exposes top-level `tradeSummary`; Status exposes top-level
`stockSelection`, `tradeSummary`, and `stockV2Identity`; History carries the
same Status shape in `items`; Reconcile carries it in `statusAfter`. Stock
success requires a canonical 64-byte Solana signature, confirmed or finalized
commitment, `executionSucceeded: true`, and exact public-identity binding.

`dexter_execute_asset_action` accepts only `operationId` and the prepared
`intentId`; the API request body is exactly `{}` and the operation ID becomes
its Idempotency-Key. It accepts no action, attempt, plan, plan hash, approval,
wallet, agent, or grant selector. `dexter_asset_action_status` reads durable
receipt and finality evidence, `dexter_reconcile_asset_action` asks for the
same-intent reconciliation result without automatic retry, and
`dexter_wallet_history` reads cursor-paginated canonical status records.
Tool/schema presence is not runtime capability: the exact Prepare response is
authoritative. A covered Buy or Sell may execute autonomously under the
reusable bounded mandate. In the current integrated release, Send is preserved
in the public contract but Prepare refuses it with
`protected_agent_send_sdk_required` before capacity reservation or intent
creation. Do not call Execute or Reconcile for that refusal. No mandate,
insufficient scope, or an unavailable signer otherwise fails closed for
enrollment, extension, or owner escalation. Those ceremonies remain separately
authenticated and are not model-callable OpenDexter tools.

The MCP-to-API governed-action bridge uses
`GOVERNED_AGENT_ACTIONS_HMAC_SECRET` (32 bytes or longer), configured to the
same value in Dexter API and this MCP service, and signs the timestamp,
authenticated MCP session, method, exact mounted URL including query,
Idempotency-Key (or empty), and canonical request-body hash. It does not use
the Dextercard/session or x402 service secrets and has no legacy fallback.

The hosted check/fetch/status adapter also requires
`NATIVE_EXACT_MCP_SERVICE_HMAC_SECRET` (32 bytes or longer), configured to the
same value in Dexter API and this MCP service. Every internal request signs its
timestamp, method, exact route, and exact serialized body. Missing or weak
configuration fails closed before the request leaves MCP; the secret is never
part of a tool argument or result.

This release's production activation runs only `dexter-open-mcp` from
`ecosystem.production.cjs` and leaves the distinct legacy `dexter-mcp` process
untouched. Set
`DEXTER_MCP_ENV_FILE` to one absolute, service-owned mode-0600 regular file
before asking PM2 to load that config. The launcher rejects symlinks, hard
links, foreign ownership, permissive modes, and inherited Node loader controls;
the immutable release itself contains no credential file.

**How wallet identity works.** OAuth authorizes the stable
`https://open.dexter.cash/mcp` connector. Protected wallet and portfolio calls
resolve the durable wallet binding for that authenticated MCP session and the
stored passkey-vault identity behind it. They do not accept a caller-supplied
wallet address or user handle. `x402_wallet` reads the bound passkey wallet;
`dexter_portfolio` reads its governed asset inventory without changing the
spendable balance. Its optional `approvedActionTargets` are a separate,
complete list of server-approved governed assets, including assets the wallet
does not hold. They enable first-time Buy discovery but never create a holding,
quantity, balance, or portfolio value; the matching action must be available
and the exact Prepare response remains authoritative.

**How the npm package differs.** `@dexterai/opendexter` is an independently
versioned local stdio package for Codex, Claude Code, and other agents. It uses
a user-controlled local signer instead of the hosted connector's OAuth and
session binding. This hosted source contract does not assert that a published
npm version has adopted the twelve-tool hosted boundary. Its package,
install guidance, and seller-side `opendexter audition <url>` command live in
[Dexter-DAO/opendexter-ide](https://github.com/Dexter-DAO/opendexter-ide).

| | OpenDexter MCP | `@dexterai/opendexter` |
|---|---|---|
| Transport | Hosted HTTP MCP | Local stdio MCP |
| Authorization | Mixed per-tool OAuth contract | Local process and signer |
| Wallet identity | Durable passkey wallet bound to the authenticated MCP session | User-controlled local signer |
| Executable roster | Twelve discoverable tools; protected calls require OAuth | Independently versioned; verify the installed package |
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
