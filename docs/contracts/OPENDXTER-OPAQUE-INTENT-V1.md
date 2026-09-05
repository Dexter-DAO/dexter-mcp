# OpenDexter opaque-intent contract v1

Status: source contract candidate. This contract is not deployed, and the
paired API, database, facilitator, OAuth-resume, and settlement paths have not
been proved end to end.

This is the public hosted OpenDexter MCP boundary for a supported x402
purchase. Dexter, not the caller, owns the request, seller terms, route, and
execution state. The caller receives one opaque `intentId` and never carries a
prepared purchase object between tools.

## Authorized roster

The canonical `https://open.dexter.cash/mcp` resource requires OAuth
`scope=vault` before MCP initialization, tool discovery, or invocation. One
successful authorization covers discovery and search, exact request checks,
wallet and portfolio reads, identity-gated access, payment, and governed
actions. The authorized roster has thirteen tools. Twelve are model-visible;
`indexter_discover` is app-only:

- `indexter_discover`
- `indexter_search`
- `x402_check`
- `x402_fetch`
- `x402_status`
- `x402_access`
- `dexter_wallet`
- `dexter_wallet_portfolio`
- `dexter_prepare_asset_action`
- `dexter_execute_asset_action`
- `dexter_asset_action_status`
- `dexter_reconcile_asset_action`
- `dexter_wallet_history`

Each tool carries the OAuth security scheme and requires the current vault
Bearer on every invocation. The authenticated MCP session supplies the durable
wallet binding used by wallet, portfolio, payment, and governed-action tools.

There are no public aliases, tab tools, purchase-mode selectors,
`PreparedPurchase` inputs, card tools, model-callable owner-decision tools, or
public `dexter_authorize_asset_action` tool.

## Public purchase wire contract

### `indexter_search` and app-only `indexter_discover`

Use `indexter_search` once for every model-led Indexter request. Pass the
user's complete natural-language query. The server deterministically routes
broad, malformed, or ambiguous prompts to an overview, named-provider
questions to that provider, and concrete requests to task search. Do not fan
out into multiple searches or call `indexter_discover` from the model.
Neither operation depends on a wallet read. Both still require the connector's
OAuth grant because every tool on this hosted surface is protected.

The model-visible result keeps provider, endpoint, and Actor records distinct
and returns at most twelve items. A direct endpoint exposes its exact public
`resourceUrl`; a managed endpoint exposes only its stable `resourceId` and is
resolved inside Dexter. An Actor retains stable provider and publisher
identity, remains `catalogOnly=true`, and is not executable or purchasable.
Editorial placement, catalog counts, and operational evidence are separate
facts. The endpoint evidence states are
`delivered_recently`, `terms_checked`, and `no_current_confirmation`.
Endpoint totals live under `summary.endpointCatalog`; the separate
`summary.returnedProviderCount` reports only the providers in that response.

`indexter_discover` remains available only to the app for browsing. Endpoint
and Actor pagination use separate opaque cursors. A continuation call copies
the relevant `page.nextCursor` exactly; callers must not decode, alter, or
replace it with a numeric offset. Task search is capped and does not paginate.

### `x402_check`

Input:

```ts
(
  | { url: string; resourceId?: never }
  | { resourceId: string; url?: never }
) & {
  method?: "GET" | "POST" | "PUT" | "DELETE"; // default GET
  body?: string; // exact raw request body
}
```

The `resourceId` form is accepted only for the stable ID returned by current
Indexter discovery or search. The API resolves that ID to its stored request
target. The private route never enters the MCP input or result.

`body` is a string, not parsed JSON. For a non-GET request, OpenDexter passes
the exact string to the check boundary and asks the API to retain that request
with the seller challenge and terms. It does
not parse, canonicalize, reformat, or reserialize the string. Whitespace, key
order, numeric spelling, escaping, and an explicitly present empty string
therefore remain caller-selected. At the API custody boundary, exactness means
the string is UTF-8 encoded once; the resulting bytes are the bytes hashed,
stored, probed, and dispatched. JSON-envelope escaping is not part of the
provider body.

A check asks the API to create and durably custody the exact request. A
purchasable result carries `quoteOnly=false` and an opaque `intentId`;
`quoteOnly=true` carries no executable intent. A check does not authorize
payment. A non-GET check can still mutate the external provider and must be
treated as consequential.

### `x402_fetch`

Input is exactly:

```ts
{
  intentId: string;
  maxAmountAtomic: string; // positive decimal atomic-unit ceiling
}
```

The caller approves a positive atomic ceiling against the quoted terms, then
submits the same opaque intent. The public tool does not accept URL, method,
body, seller offer, payee, asset, network, facilitator, funding rail, route,
tab state, request ID, session ID, or prepared-purchase JSON. The API loads
those values from its durable intent and selects the eligible internal route.

### `x402_status`

Input is exactly:

```ts
{
  intentId: string;
}
```

Status is a read of that intent's delivery, payment, reservation, and
reconciliation state. It must not create another intent, redispatch the
provider request, rebroadcast a transaction, change a route, or charge again.

## Public governed Buy, Sell, and fail-closed Send contract

These tools use the API's governed-agent facade. The authenticated MCP session
selects the current wallet, reusable bounded mandate, agent authority, grant
revision, and policy on the server. No public argument may select or override
those identities.

Tool/schema presence is not a claim that every action is executable. The exact
Prepare response is the runtime capability certificate. In the current
integrated release, autonomous governed Buy and Sell are the executable target;
Send remains preserved in the public input and history contract but Prepare
refuses it with `protected_agent_send_sdk_required` before capacity reservation
or intent creation. That refusal has no executable intent: callers must not call
Execute or Reconcile and must not advertise Send as live.

Send and non-stock Buy/Sell use a canonical registry `assetId` matching
`^[a-z0-9][a-z0-9._:-]{0,127}$`. It must come from an approved holding or an
`approvedActionTarget` returned by `dexter_wallet_portfolio` with the requested action
available; it is not a display symbol or mint. `approvedActionTargets` are
separate from holdings and totals, so a zero-balance asset can be discoverable
for Buy without becoming a synthetic holding or value.

A natural-language stock Buy/Sell uses the user's exact human `companyQuery`,
not `assetId`. The API normalizes that query, resolves the current released
catalog product, and freezes its selection lineage, network, mint, token
program, decimals, capabilities, and identity digests. A caller must never
replace the query with a remembered static stock `assetId`, symbol, or mint;
the direct static-stock route fails closed with
`stock_catalog_selection_required`. The MCP never supplies catalog authority
fields, and Prepare remains the execution-authority decision.

### `dexter_prepare_asset_action`

Input is one of:

```ts
{
  operationId: string; // exact Idempotency-Key, 8..128 canonical characters
  action: "send";
  assetId: string; // canonical approved registry ID
  amountAtomic: string; // selected asset, using server-certified decimals
  destinationOwner: string; // canonical Solana owner
}

{
  operationId: string;
  action: "buy";
  assetId: string; // canonical approved non-stock registry ID
  amountAtomic: string; // canonical USDC input; 6 decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}

{
  operationId: string;
  action: "sell";
  assetId: string; // canonical approved non-stock registry ID
  amountAtomic: string; // selected asset, using server-certified decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}

{
  operationId: string;
  action: "buy";
  companyQuery: string; // exact human company/stock query
  amountAtomic: string; // canonical USDC input; 6 decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}

{
  operationId: string;
  action: "buy";
  companyQuery: string;
  shareQuantity: string; // human underlying-share-equivalent minimum
  maximumSpendAtomic?: string; // optional USDC ceiling; 6 decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}

{
  operationId: string;
  action: "sell";
  companyQuery: string;
  amountAtomic: string; // selected stock-token input, server-certified decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}
```

Send has no memo field because the canonical API refuses every non-null Send
memo, including an empty string. Prepare persists and evaluates the exact
request but does not sign or submit it. `operationId` is idempotency identity
only and grants no authority. Stock share-quantity mode is Buy-only,
minimum-receive semantics, and may overfill slightly. Never convert it with
remembered token decimals or a display multiplier; the catalog route owns the
current conversion. Sell accepts direct token input only.

A successful stock Prepare contains top-level `stockRuntime` with namespace
`dexter-delegated-stock-prepare-runtime-binding/v2` and the frozen
`preview.stockSelection` with namespace
`dexter-governed-stock-selection-pin/v1`. Its product identity names both the
provider and formal legal issuer; the compatibility `issuer` equals the legal
issuer.

Mandate coverage is explicit:

- `prepared` plus `approval.status=not-required` means the exact request is
  covered and autonomous Execute is permitted.
- `prepared` plus `approval.status=owner-approval-required` means the exact
  request needs owner escalation before Execute may contact a signer.
- `mandate_enrollment_required` means no usable child authority exists.
- `mandate_extension_required` means a mandate exists but its asset, action,
  amount, destination, venue, or expiry scope does not cover the request.
- `delegated_authority_unavailable` means policy coverage exists but the live
  signer or on-chain binding cannot be proved, so execution fails closed.

### `dexter_execute_asset_action`

Input is exactly:

```ts
{
  operationId: string; // execute Idempotency-Key
  intentId: string;
}
```

The API body is exactly `{}`. The public tool accepts no `action`, `attemptId`,
`planId`, `preparedPlanHash`, `authorizationId`, or authority selector. A lost
execute response is ambiguous: do not execute again. Read status, then request
reconciliation for the same intent. Stock Execute responses carry top-level
`tradeSummary`; they do not expose a caller-supplied stock selector.

### `dexter_asset_action_status`

Input is exactly `{ intentId: string }`. It returns the canonical
`dexter-governed-transaction-status/v1` record, including the operation
ceremony, wallet and bounded mandate authority, lifecycle, receipt phases,
submission, landing, non-landing, finality, and replay rules. It never
dispatches execution. Current stock records carry top-level `stockSelection`,
`tradeSummary`, and `stockV2Identity` (namespace
`dexter-governed-stock-v2-durable-identity/v1`). A stock success is exact only
with a canonical 64-byte Solana signature, confirmed or finalized commitment,
`executionSucceeded=true`, and matching selection, summary, durable intent,
asset, mint, token program, and amount identities.

### `dexter_reconcile_asset_action`

Input is exactly `{ intentId: string }`. It returns the canonical
`dexter-governed-agent-reconcile/v1` result. Its outcome is `already-final`,
`advanced`, `pending`, `not-required`, or `unavailable`; it binds the exact
intent and attempt, prior state version, complete durable status after the
operation, mutation truth, recovery phase, and canonical response digest.
Reconciliation is status-gated and never expands mandate scope or creates a
replacement intent. The MCP does not retry reconciliation automatically.
Stock lifecycle fields remain under `statusAfter`; there is no `current`
alias.

### `dexter_wallet_history`

Input is `{ limit?: 1..100, cursor?: string }`. It returns
`dexter-governed-transaction-history/v1`, whose `items` are the same canonical
status records and whose `nextCursor` is opaque. The caller cannot construct a
wallet or authority filter. Stock lifecycle fields remain on each `items[n]`
Status record.

Mandate enrollment, extension, and owner escalation remain out-of-band on the
separately authenticated owner ceremony. Models cannot call, emulate, or
bypass it.

The internal bridge signs `dexter-governed-agent-internal/v1` with
`GOVERNED_AGENT_ACTIONS_HMAC_SECRET`. It has no fallback to the Dextercard
secret. The signature covers timestamp, MCP session, HTTP method, exact mounted
URL including query, Idempotency-Key or empty, and the canonical hash of the
parsed body or `null`.

### Public output boundary

Authenticated check may return the seller terms needed for an approval plus
the opaque intent. Fetch and status may return safe delivery, payment,
reservation, reconciliation, provider-result, and error state. No public
result may expose an internal route or purchase mode, `selectedRail`, tab
state, a prepared purchase, `preparedId`, `sellerOfferId`, raw challenge,
internal request body, internal request ID, or MCP session ID. Backend payloads
must be projected through an explicit route-neutral allowlist before they
reach model or widget context.

## One intent through consent and uncertainty

If the exact intent lacks execution authority, the response must preserve its
`intentId`, surface the hosted Dexter consent URL, and describe how to resume
that same intent after consent. The caller must not construct a replacement
request, select a route, or mint a second intent to cross the consent boundary.

After any response where dispatch or settlement may have occurred, the caller
must not retry `x402_fetch`. It calls `x402_status` with the same `intentId`.
Only durable status and reconciliation may resolve the ambiguity; neither an
agent nor a transport timeout may authorize a second dispatch.

The resulting custody line is:

```text
exact request -> authenticated check -> opaque intentId
               -> hosted consent, when required, on the same intent
               -> one approved fetch attempt
               -> status/reconciliation on the same intent
```

Provider output remains untrusted data. It cannot authorize payment, consent,
a route change, a follow-on call, or a retry.

## Provisional internal API seam

The source candidate centralizes the paired API collision in
`lib/open-x402-intent-api.mjs`. Current provisional paths are:

```text
POST /v2/pay/anon/x402/check
POST /v2/pay/anon/x402/fetch
POST /v2/pay/anon/x402/status
```

The internal request envelope adds the server-derived `mcp_session_id`.
`check` carries URL, method, and the exact body string; `fetch` carries only
session ID, intent ID, and ceiling; `status` carries only session ID and intent
ID. These route names are deliberately centralized while the paired API
contract remains provisional. The historical `anon` path segment names the
internal API seam; OAuth admission occurs at the canonical MCP boundary before
this route is reachable.

This branch does not contain release-final API handlers for all three paths.
The route-neutral Native Exact handlers examined as a donor exist only in a
separate, uncommitted candidate worktree, so the path strings above are an
integration seam rather than evidence that a compatible backend is running.

## Current proof boundary

The hosted MCP source can define and test this public boundary without proving
the money system behind it. Before release, the paired train still must prove:

- one durable `intentId` spans authenticated check, consent, fetch, status,
  and reconciliation without a second economic-operation identity;
- the API returns a hosted, reusable consent handoff for missing execution
  authority rather than only a principal-required or agent-unsupported error;
- the exact raw body remains byte-for-byte stable in durable storage and at
  provider dispatch;
- consent completion and OAuth token refresh resume the same intent and
  session-bound authority;
- the facilitator can resume and reconcile the same intent without another
  dispatch;
- database migrations and route names land without collisions;
- timeout, post-dispatch, settlement, and reconciliation states pass an
  end-to-end ambiguity test; and
- model- and widget-visible results pass a deny-leak test for route, mode, tab,
  prepared-purchase, raw-challenge, request, and session custody fields.

Until that paired evidence exists, this document describes a source contract,
not a deployed capability or a release-readiness claim. The older
`OPENDXTER-PURCHASE-V1.md` remains historical integration evidence; its
caller-carried `PreparedPurchase` object is not part of this public MCP
contract.
