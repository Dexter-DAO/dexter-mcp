# Wallet activity

`dexter_wallet` returns the shared Wallet Activity V4 page in `activityPage`. Pass `activityLimit` (1–100, default 25) and then the returned `activityPage.nextCursor` as `activityCursor` to read older entries. `activityReadStatus` reports complete, partial, or unavailable. Empty results and failed reads remain distinguishable.

The server reads `GET /api/passkey-anon/mcp-activity/:sessionId`, signed with the `mcp-activity-v4` purpose and the existing internal HMAC secret. The API resolves the session's current wallet and read scope. MCP checks that the response wallet address equals the verified receive address. The API release must provide this endpoint before the MCP release activates the new read.

The wallet widget uses its existing private refresh token to read `/widget/wallet/activity`. Opening Activity refreshes the newest page. Refresh and Load older activity preserve the shared cursor and show read failures. Rows show service or asset artwork, the action, and any pending or failed status. Service names open their Indexter page; amounts and timestamps open the transaction. Expand a row for exact trade quantities, descriptions, and receipt facts. Atomic amounts and transaction display quantities remain strings through display, including subcent payments and large token quantities.

`dexter_wallet_history` keeps its governed Send, Buy, and Sell history contract. Its intent status and reconciliation tools retain their existing meaning. Activity names, provider descriptions, and receipt text are historical display data; spending decisions use the appropriate authorization and execution tools.

Validation:

```sh
node --test tests/wallet-activity.test.mjs tests/wallet-read-only-contract.test.mjs
node --test tests/wallet-activity.e2e.mjs
```

The browser test writes desktop and mobile screenshots under `output/playwright/`. Tool descriptors require the repository's coordinated source and release verification process when the API and MCP changes are integrated.

For account-specific review, `node scripts/capture-wallet-activity.mjs <pages.json> <status.json> <portfolio.json>` renders captured responses through the full wallet entry and production styling. It validates that all three inputs belong to the same receive wallet. Keep those inputs and screenshots private; the script performs local reads and mocks widget requests.
