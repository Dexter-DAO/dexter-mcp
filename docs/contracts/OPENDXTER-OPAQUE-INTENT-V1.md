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

OAuth promotes exactly two tools:

1. `x402_fetch`
2. `x402_status`

The connected roster is therefore exactly seven tools:

1. `x402_search`
2. `x402_check`
3. `x402_fetch`
4. `x402_status`
5. `x402_access`
6. `x402_wallet`
7. `dexter_portfolio`

There are no public aliases, tab tools, purchase-mode selectors,
`PreparedPurchase` inputs, card tools, or internal reconciliation tools.

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
