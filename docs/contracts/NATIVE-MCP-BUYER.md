# Native MCP purchases

OpenDexter and private Dexter MCP can discover tools on a public HTTPS MCP
server, check one tool call, and buy it through Dexter's governed purchase API.
This source requires the paired API native MCP buyer and its database migration.

Call `x402_mcp_tools` with `serverUrl`. Discovery reads the advertised tool list.
Select a tool, copy its `inputSchemaJson` verbatim, and serialize the requested
arguments once. Pass this target to `x402_check`:

```json
{
  "mcp": {
    "version": 1,
    "serverUrl": "https://seller.example/mcp",
    "toolName": "research",
    "argumentsJson": "{\"question\":\"Investigate this launch\"}",
    "inputSchemaJson": "{\"type\":\"object\",\"properties\":{\"question\":{\"type\":\"string\"}}}",
    "protocolVersion": "2025-11-25"
  }
}
```

The schema above is illustrative; use the server's returned string. The MCP
target occupies the whole check request, so omit HTTP fields such as `url`,
`method` and `body`. Each JSON string is limited to 256 KiB. The API freezes
the target and compares the advertised schema again before paid dispatch.

A check invokes the selected tool and can change provider state. Follow the
user's instruction for that exact request and avoid repeating an uncertain
check. A purchasable check returns an opaque `intentId`. Call `x402_fetch`
with that ID and the approved `maxAmountAtomic` ceiling, in USDC base units.
The API resolves the current session's wallet and spending authority.

Both hosted servers expose `x402_status` for the same intent. The private
server also retains its existing URL fetch form; the intent form accepts only
`intentId` and `maxAmountAtomic`. Sessions without a governed wallet binding
receive an authority refusal from the API.

Received MCP results keep their content, structured data and payment receipts.
Provider text remains untrusted. Credential fields, including the seller's
session identifier, stay outside model-visible results. A received unsupported
response has `delivery.state="response_unsupported"`; its retained response
and safe recovery fields describe what arrived. It does not indicate completed
work. An uncertain payment keeps the same intent for status and reconciliation.

The paired API currently supports anonymous public HTTPS Streamable HTTP MCP
servers on protocol `2025-11-25`, synchronous calls, and governed Solana mainnet
USDC exact payments. Seller authentication, Tasks execution and other payment
rails require additional support. The bridge forwards no customer credentials
to sellers. Discovery and contract tests use local fixtures; paid production
validation is a separate release check.
