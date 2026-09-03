# Dexter MCP connector setup

Dexter ships three MCP connection models:

1. **Dexter** (`user-Dexter`) is the hosted MCP for a managed Dexter account.
   It uses Dexter OAuth.
2. **OpenDexter** (`user-OpenDexter`) is the hosted MCP for a session-bound
   Dexter Wallet. Its canonical URL requires OAuth before tool discovery or
   use. One authorization covers search, wallet, portfolio, access, payment,
   and governed actions.
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

Complete the host-native OAuth flow for both hosted connectors. OpenDexter uses
only `https://open.dexter.cash/mcp`; the authorized connection exposes its
twelve product tools. `dexter-x402` creates or reuses a local wallet, usually
at `~/.dexterai-mcp/wallet.json`.

## Hosted connector UIs

Use these endpoints when ChatGPT, Claude, or another hosted MCP client asks for
a server URL:

- **Dexter:** `https://mcp.dexter.cash/mcp`
- **OpenDexter:** `https://open.dexter.cash/mcp`

The local `dexter-x402` command belongs in clients that can run local MCP
processes, such as Cursor, Codex, or Claude Code.

## First-use proof

Use the flow for the connector being tested. The managed Dexter connector has
its own roster; confirm its discovered tool names instead of substituting either
sequence below.

### Hosted OpenDexter

1. Finish connector authorization and confirm the tool list loads.
2. Search the Indexter marketplace for `"nansen"` with `indexter_search`.
3. Call `dexter_wallet` and confirm its wallet and funding context.
4. Call `x402_check` on a selected low-cost x402 endpoint. A purchasable result
   carries `quoteOnly=false`; keep its opaque `intentId`. Stop if
   `quoteOnly=true`, because that result has no executable intent.
5. When the exact seller, request, and `maxAmountAtomic` ceiling are covered by
   the user's instruction or bounded policy, call `x402_fetch` once with that
   `intentId`.
6. If dispatch or settlement is uncertain, call `x402_status` with the same
   `intentId`. Never submit a second fetch for that intent.

The same authorized OpenDexter connection handles discovery, the wallet and
portfolio, identity-gated access, paid requests, and governed actions. Payment
still follows the checked intent and exact spending ceiling.

### Local dexter-x402

1. Start the local command and confirm `x402_search`, `x402_wallet`,
   `x402_check`, and `x402_fetch` load.
2. Search the Indexter marketplace for the Nansen capability with
   `x402_search`.
3. Call the local wallet tool, `x402_wallet`, and confirm that its wallet has
   the asset and network needed by the selected quote.
4. Call `x402_check` with the selected endpoint's URL and method.
5. After the user or bounded policy authorizes that exact request, call
   `x402_fetch` once with the checked URL, method, parameters, and headers.

The local connector uses its own wallet and signer. It does not accept an
OpenDexter `intentId` or expose `x402_status`. If a paid call has an uncertain
outcome, do not assume that retrying it is safe.

## Short setup script

"Add Dexter at `https://mcp.dexter.cash/mcp`, OpenDexter at
`https://open.dexter.cash/mcp`, and the local
`npx -y @dexterai/x402-discovery@latest` connector. Authorize the hosted
connectors. For OpenDexter, search with `indexter_search`, inspect
`dexter_wallet`, and use the checked `intentId` for one `x402_fetch`. For the
local connector, use `x402_search` and `x402_wallet`, then pass the checked
request directly to `x402_fetch`."

## Troubleshooting

- If hosted authorization never starts, confirm the exact server URL and that
  the client supports remote MCP OAuth. Clear the incomplete connector record,
  add the same canonical endpoint again, and finish the host-native flow.
- If OpenDexter authorizes but its tools remain unavailable, treat setup as
  incomplete. Capture the authorization and tool-list errors before retrying.
- If OpenDexter's `dexter_wallet` reports missing binding or funding, use its
  returned state and `receiveAddress`; do not infer a deposit address from
  another wallet field.
- If payment returns an ambiguous or post-dispatch state, inspect the same
  intent with `x402_status`. Preserve its identity and avoid another fetch.
- The three connectors use different account and signer models, so compare
  their returned wallet context before comparing payment behavior.
