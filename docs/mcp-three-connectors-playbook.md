# Dexter MCP connector setup

Dexter ships three MCP connection models:

1. **Dexter** (`user-Dexter`) is the hosted MCP for a managed Dexter account.
   It uses Dexter OAuth.
2. **OpenDexter** (`user-OpenDexter`) is the hosted MCP for a session-bound
   Dexter Wallet. Its canonical URL supports public marketplace search. Native
   OAuth begins when a wallet-bound tool is invoked and then covers checks,
   wallet, portfolio, access, payment, status, and governed actions.
3. **dexter-x402** (`user-dexter-x402`) is a local command MCP. It uses a local
   wallet and key for direct x402 payments.

## Cursor configuration

Add the three servers to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Dexter": {
      "url": "https://mcp.dexter.cash/mcp"
    },
    "OpenDexter": {
      "url": "https://open.dexter.cash/mcp"
    },
    "dexter-x402": {
      "command": "npx",
      "args": ["-y", "@dexterai/x402-discovery@latest"]
    }
  }
}
```

Complete the host-native OAuth flow for Dexter. OpenDexter uses only
`https://open.dexter.cash/mcp`; it exposes twelve product tools immediately,
keeps search public, and starts OAuth when another tool is invoked.
`dexter-x402` creates or reuses a local wallet, usually at
`~/.dexterai-mcp/wallet.json`.

## Hosted connector UIs

Use these endpoints when ChatGPT, Claude, or another hosted MCP client asks for
a server URL:

- **Dexter:** `https://mcp.dexter.cash/mcp`
- **OpenDexter:** `https://open.dexter.cash/mcp`

The local `dexter-x402` command belongs in clients that can run local MCP
processes, such as Cursor, Codex, or Claude Code.

## First-use proof

Run this flow on each connector that exposes the named tool:

1. Confirm the tool list loads.
2. Search the marketplace for `"nansen"` with `x402_search`. OpenDexter does
   this before sign-in.
3. Call `x402_wallet`, complete native authorization when prompted, and confirm
   its wallet and funding context.
4. Call `x402_check` on a selected low-cost x402 endpoint. A purchasable result
   carries `quoteOnly=false`; keep its opaque `intentId`. Stop if
   `quoteOnly=true`, because that result has no executable intent.
5. When the exact seller, request, and `maxAmountAtomic` ceiling are covered by
   the user's instruction or bounded policy, call `x402_fetch` once with that
   `intentId`.
6. If dispatch or settlement is uncertain, call `x402_status` with the same
   `intentId`. Never submit a second fetch for that intent.

For OpenDexter, search remains public while the same connection handles native
authorization for the wallet and portfolio, identity-gated access, paid
requests, and governed actions. Payment still follows the checked intent and
exact spending ceiling.

The local connector uses its own wallet and signer. Confirm that its wallet has
the asset and network required by the selected quote before fetching.

## Short setup script

"Add Dexter at `https://mcp.dexter.cash/mcp`, OpenDexter at
`https://open.dexter.cash/mcp`, and the local
`npx -y @dexterai/x402-discovery@latest` connector. Search OpenDexter for
`nansen`, authorize when the first wallet-bound tool asks, inspect the wallet,
check a cheap endpoint, and fetch it once with the approved ceiling."

## Troubleshooting

- If hosted authorization never starts, confirm the exact server URL and that
  the client supports remote MCP OAuth. Clear the incomplete connector record,
  add the same canonical endpoint again, and finish the host-native flow.
- If OpenDexter authorizes but its tools remain unavailable, treat setup as
  incomplete. Capture the authorization and tool-list errors before retrying.
- If `x402_wallet` reports missing binding or funding, use its returned state
  and `receiveAddress`; do not infer a deposit address from another wallet
  field.
- If payment returns an ambiguous or post-dispatch state, inspect the same
  intent with `x402_status`. Preserve its identity and avoid another fetch.
- The three connectors use different account and signer models, so compare
  their returned wallet context before comparing payment behavior.
