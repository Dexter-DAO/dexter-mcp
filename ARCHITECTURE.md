# Dexter MCP Architecture

## What lives here

This repository contains one codebase for **two independently deployed OAuth
MCP services** and one shared package:

| Component | Entry point | Description |
|-----------|-------------|-------------|
| Dexter MCP (full platform) | `http-server-oauth.mjs` | OAuth-protected, managed wallets, full platform toolsets |
| OpenDexter MCP | `open-mcp-server.mjs` | OAuth-protected Indexter, x402, and session-bound Wallet across supported MCP clients |
| `@dexterai/x402-core` | `packages/x402-core/` | Shared types, formatters, search client used by both servers |

Both servers import from `@dexterai/x402-core` (published npm package).

## What moved

The npm packages `@dexterai/opendexter` and `@dexterai/x402-discovery` (the local stdio MCP server + CLI) moved to [Dexter-DAO/opendexter-ide](https://github.com/Dexter-DAO/opendexter-ide) as of 2026-04-16. See that repo's `packages/mcp/docs/ARCHITECTURE.md` for the full OpenDexter architecture doc.

## Key paths

| What | Path |
|------|------|
| Public OpenDexter server | `open-mcp-server.mjs` |
| Authenticated Dexter MCP | `http-server-oauth.mjs` |
| Shared startup | `common.mjs` |
| Toolsets | `toolsets/` |
| x402-core package | `packages/x402-core/` |
| Widget UI components | `apps-sdk/ui/src/components/x402/` |
| Built widget HTML | `public/apps-sdk/x402-*.html` |

## Toolset architecture

Toolsets are modular bundles registered via `toolsets/index.mjs`. Each toolset exports a `register(server, wallet, opts)` function. The `TOKEN_AI_MCP_PROFILE` env var selects which toolsets load.

| Toolset | Purpose |
|---------|---------|
| `x402-client` | User-facing x402 search and pay (authenticated users) |
| `wallet` | Wallet management and funding |
| `solana` | Solana-specific operations |
| `identity` | Wallet identity and reputation |
| (others) | See `toolsets/` directory |
