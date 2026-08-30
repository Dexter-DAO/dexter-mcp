# Dexter MCP: Add & Try All 3 Connectors

## What You Are Adding

You are adding three separate MCP servers:

1. **Dexter** (`user-Dexter`)  
   Hosted MCP with OAuth authentication and full managed Dexter context.
2. **OpenDexter** (`user-OpenDexter`)  
   Hosted MCP with no user login requirement (open/public flow).
3. **dexter-x402** (`user-dexter-x402`)  
   Local command-based MCP (`@dexterai/x402-discovery`) using a local wallet/key for direct x402 payments.

---

## 1) Add in Cursor (recommended config)

Edit `~/.cursor/mcp.json` and add:

```json
{
  "mcpServers": {
    "Dexter": {
      "url": "https://mcp.dexter.cash/mcp"
    },
    "OpenDexter": {
      "url": "https://open.dexter.cash/mcp/vault"
    },
    "dexter-x402": {
      "command": "npx",
      "args": ["-y", "@dexterai/x402-discovery@latest"]
    }
  }
}
```

### Notes

- For `Dexter`, complete OAuth/login when prompted.
- `OpenDexter` opens wallet authorization before connecting. Use
  `https://open.dexter.cash/mcp` instead when anonymous search must be available
  before wallet authorization.
- `dexter-x402` creates/uses a local wallet (typically `~/.dexterai-mcp/wallet.json`).

---

## 2) Add in ChatGPT Connectors (hosted endpoints)

If adding through a hosted MCP connector UI:

- **Dexter URL:** `https://mcp.dexter.cash/mcp`  
- **OpenDexter URL:** `https://open.dexter.cash/mcp/vault`
- **OpenDexter public-search URL:** `https://open.dexter.cash/mcp`

The local command MCP (`dexter-x402`) is generally added in local MCP-capable clients (Cursor/Codex/Claude Code), not as a hosted URL connector.

---

## 3) First-Time Smoke Test (Run Per Connector)

Use this exact 3-tool flow on each connector:

1. `x402_wallet`  
   Confirms signer/wallet context for that connector.
2. `x402_search` with query `"nansen"`  
   Confirms marketplace discovery.
3. `x402_fetch` on a low-cost known x402 URL  
   Confirms canonical paid execution path.

---

## Expected Behavior by Connector

### Dexter (authenticated hosted)

- Uses authenticated Dexter context.
- `x402_fetch` should settle canonically when wallet/funds are available.

### OpenDexter (hosted)

- `/mcp/vault` authorizes the passkey wallet before the MCP session starts.
- `/mcp` keeps anonymous search available and asks for wallet authorization when
  a protected tool is called.
- After authorization and funding, `x402_fetch` proceeds through canonical x402 settlement.

### dexter-x402 (local command MCP)

- Uses local wallet/private key on your machine.
- `x402_fetch` settles directly if wallet has funds for required network/asset.

---

## Simple Explain-It-to-Anyone Script

"Add these three MCPs:  
1) `https://mcp.dexter.cash/mcp` (Dexter, login required),  
2) `https://open.dexter.cash/mcp/vault` (OpenDexter, wallet authorization),
3) local `npx -y @dexterai/x402-discovery@latest` (dexter-x402).  
Then run `x402_wallet`, `x402_search` for `nansen`, and `x402_fetch` on a cheap endpoint in each one."

---

## Troubleshooting in 30 Seconds

- **OAuth prompt never appears for Dexter:** remove/re-add connector, confirm URL is exactly `https://mcp.dexter.cash/mcp`.
- **OpenDexter never opens authorization:** use the exact
  `https://open.dexter.cash/mcp/vault` URL, remove the old connection, and add it again.
- **dexter-x402 cannot settle:** fund local wallet and ensure chain/network match the quote requirements.
- **Same tool names, different behavior:** expected; signer/account model differs across the three connectors.
