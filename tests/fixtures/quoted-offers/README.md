# Saved quote producer fixtures

`api-producer.json` contains outputs from the API public purchase coordinator. Synthetic seller, authority and payment adapters supply the test state. Each case includes fresh Check, recovered Check, Check after selection, Fetch and Status output.

The API base is `90ebaad5f3ccb29d943a7f1b097e3186b0477248`. The source hashes used for this capture are:

| File | SHA-256 |
| --- | --- |
| `src/services/x402/opaquePurchaseCoordinator.ts` | `10d355e61a376dbaa25ecd151e6a2798ac89384a12cbc7fc016ae6597ff08565` |
| `src/services/x402/opaqueQuotedOffers.ts` | `d282a5b5dfc040cffea9bcc2c72a4a9b05c651afcaea0377000f328b966eb54a` |
| `src/services/x402/__tests__/opaquePurchaseCoordinator.test.ts` | `87ba45f114b3481710b15c53ffb194ece5e7be15d3b40004223eb11d0b88b195` |

Capture with `DEXTER_QUOTED_OFFERS_CAPTURE=/absolute/output.json NODE_ENV=test npx vitest run src/services/x402/__tests__/opaquePurchaseCoordinator.test.ts` in the API source tree. Copy the resulting file here after the test passes.

The cases cover unknown, supported and unsupported Solana smart-wallet declarations; a Solana-only seller; a required payment identifier; an excluded higher-priced Base offer; and a Tab alongside Exact offers. The MCP test calls the registered Check and Status handlers through SDK 1.30.0 with all HTTP requests intercepted. Payment finality in these fixtures comes from the synthetic adapters.
