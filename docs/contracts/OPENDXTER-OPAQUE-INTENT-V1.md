# OpenDexter opaque-intent contract v1

Status: source contract candidate. This contract is not deployed, and the
paired API, database, facilitator, OAuth-resume, and settlement paths have not
been proved end to end.

This is the public hosted OpenDexter MCP boundary for a supported x402
purchase. Dexter, not the caller, owns the request, seller terms, route, and
execution state. The caller receives one opaque `intentId` and never carries a
prepared purchase object between tools.

## Public rosters

The anonymous roster is exactly:

1. `x402_search`
2. `x402_check`
3. `x402_access`
4. `x402_wallet`
5. `dexter_portfolio`

`x402_wallet` and `dexter_portfolio` do not disclose user data anonymously.
They surface the host-native Connect/OAuth path until the MCP session has
`scope=vault` and a durable wallet binding.

OAuth promotes exactly seven tools:

1. `x402_fetch`
2. `x402_status`
3. `dexter_prepare_asset_action`
4. `dexter_execute_asset_action`
5. `dexter_asset_action_status`
6. `dexter_reconcile_asset_action`
7. `dexter_wallet_history`

The connected roster is therefore exactly twelve tools:

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

There are no public aliases, tab tools, purchase-mode selectors,
`PreparedPurchase` inputs, card tools, model-callable owner-decision tools, or
public `dexter_authorize_asset_action` tool.

## Public purchase wire contract

### `x402_check`

Input:

```ts
{
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE"; // default GET
  body?: string; // exact raw request body
}
```

`body` is a string, not parsed JSON. For a non-GET request, OpenDexter passes
the exact string to the check boundary and, for an authenticated check, asks
the API to retain that request with the seller challenge and terms. It does
not parse, canonicalize, reformat, or reserialize the string. Whitespace, key
order, numeric spelling, escaping, and an explicitly present empty string
therefore remain caller-selected. At the API custody boundary, exactness means
the string is UTF-8 encoded once; the resulting bytes are the bytes hashed,
stored, probed, and dispatched. JSON-envelope escaping is not part of the
provider body.

An anonymous check is quote-only. It may return current pricing and schema
information, but returns no executable intent. The caller connects OpenDexter
and repeats the check to create one.

An authenticated check asks the API to create and durably custody the exact
request. Its executable result contains an opaque `intentId`. A check does not
authorize payment. A non-GET check can still mutate the external provider and
must be treated as consequential.

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

## Public governed Send, Buy, and Sell contract

These tools use the API's governed-agent facade. The authenticated MCP session
selects the current wallet, reusable bounded mandate, agent authority, grant
revision, and policy on the server. No public argument may select or override
those identities.

The public asset selector is a canonical registry ID matching
`^[a-z0-9][a-z0-9._:-]{0,127}$`. It must come from an approved holding returned
by `dexter_portfolio`; it is not a display symbol or mint. The API resolves the
ID through its authoritative approved registry and freezes the exact network,
mint, token program, decimals, capabilities, and identity digest in the intent
and grant. The MCP never supplies those authority fields.

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
  assetId: string; // canonical approved registry ID for the asset being bought
  amountAtomic: string; // canonical USDC input; 6 decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}

{
  operationId: string;
  action: "sell";
  assetId: string; // canonical approved registry ID
  amountAtomic: string; // selected asset, using server-certified decimals
  memo?: string | null;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}
```

Send has no memo field because the canonical API refuses every non-null Send
memo, including an empty string. Prepare persists and evaluates the exact
request but does not sign or submit it. `operationId` is idempotency identity
only and grants no authority.

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
reconciliation for the same intent.

### `dexter_asset_action_status`

Input is exactly `{ intentId: string }`. It returns the canonical
`dexter-governed-transaction-status/v1` record, including the operation
ceremony, wallet and bounded mandate authority, lifecycle, receipt phases,
submission, landing, non-landing, finality, and replay rules. It never
dispatches execution.

### `dexter_reconcile_asset_action`

Input is exactly `{ intentId: string }`. It returns the canonical
`dexter-governed-agent-reconcile/v1` result. Its outcome is `already-final`,
`advanced`, `pending`, `not-required`, or `unavailable`; it binds the exact
intent and attempt, prior state version, complete durable status after the
operation, mutation truth, recovery phase, and canonical response digest.
Reconciliation is status-gated and never expands mandate scope or creates a
replacement intent. The MCP does not retry reconciliation automatically.

### `dexter_wallet_history`

Input is `{ limit?: 1..100, cursor?: string }`. It returns
`dexter-governed-transaction-history/v1`, whose `items` are the same canonical
status records and whose `nextCursor` is opaque. The caller cannot construct a
wallet or authority filter.

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
ID. These route names are deliberately centralized because the paired API
contract is not release-final. They are not public MCP arguments.

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
