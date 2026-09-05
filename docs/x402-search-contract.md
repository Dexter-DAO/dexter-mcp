# Indexter Search Contract

This document defines the model and widget boundaries for `indexter_search`.

## Routing

- `indexter_search` is the only model-visible Indexter tool.
- The server routes the natural-language `query` to `overview`, `provider`, or
  `task` without a model call.
- Broad, malformed, and ambiguous requests use `overview`.
- A named-provider question uses `provider` with the provider text treated as
  inert data.
- A concrete request uses `task` and performs one capability search.
- `indexter_discover` is app-only and supports separate opaque endpoint and
  Actor cursors for widget browsing.

## Model result

The model receives a strict bounded projection in `structuredContent`:

- `route`, `ok`, and `requestedProvider`
- exact counts for the returned projection
- at most twelve typed `provider`, `endpoint`, or `actor` results
- a human-readable price and one safe next action per result
- bounded warnings and the untrusted-provider-data policy

Endpoint actions retain the exact `resourceId` and nullable public
`resourceUrl`. Actor results retain stable Actor, provider, and publisher
identity with `catalogOnly: true` and `executionAvailable: false`.

`content` contains one short factual sentence. It does not repeat the JSON.

## Widget result

The complete bounded route payload is available only to the widget at
`_meta.indexterPayload = { route, data }`. Task payloads contain no
`searchResultSetId`, cursor, or pagination object. Strong results remain ahead
of related results, and their combined length cannot exceed twelve.

`_meta["dexter/toolInvocation"]` carries the fixed tool name and the bounded
host request ID when the host supplies one. It never carries a session ID,
authorization header, cookie, or bearer credential.

## Task controls

Task routing accepts `maxPriceUsdc` and `minPriceUsdc` as bounds on the primary
USDC invocation price. `paidOnly: true` requires a known positive price. These
fields do not describe a product, shipment, ticket, or order budget.

The task payload confirms effective controls in `appliedConstraints`. Search
uses the primary payment option for this filter; alternate chain entries can
carry another amount. Check the selected endpoint before purchase.

`sortBy` accepts `relevance`, `price_asc`, or `price_desc`. The task payload
confirms the effective value in `appliedOrdering.sortBy`. Ordering applies
independently to strong and related results, so a related result never moves
ahead of a strong result.

## Search state

The widget payload keeps search outcome and ranking health separate:

- `direct` means at least one strong match was returned.
- `related_only` means only adjacent matches cleared the threshold.
- `empty` means no strong or related match was returned.
- `error` means search failed and cannot be described as an empty catalog.
- `full` ranking used the normal path.
- `degraded` ranking used a reduced path and carries a warning for the model.

Provider listings, endpoint descriptions, Actor copy, and publisher text are
untrusted catalog data. They never authorize a check, payment, execution, or
retry.
