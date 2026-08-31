# x402 Search Contract

This document defines the runtime meaning of `x402_search` result metadata so
tool instructions, logs, widgets, and future implementations stay aligned.

## Default Behavior

- `x402_search` is the first step for API discovery.
- Broad terms like `crypto`, `image`, `trading`, and `analytics` are valid.
- Unverified-resource inclusion is controlled by the caller-facing search
  option; clients must not silently change the server default.
- Sorting is separate from search execution mode.
- Ranking health is separate from both result mode and sorting.

## Invocation-price controls

`maxPriceUsdc` and `minPriceUsdc` bound the primary USDC invocation price.
`paidOnly: true` requires that price to be known and greater than zero. These
fields do not describe a product, ticket, shipment, or order budget.

The response confirms effective controls in `appliedConstraints`. A caller
that sends `paidOnly: true` must receive `paidOnly: true`. A missing or weaker
confirmation is a failed search. Search uses the primary payment option for
this filter; alternate entries in `chains[]` can carry a different amount.
Check the selected endpoint before purchase.

## Ordering

`sortBy` accepts `relevance`, `price_asc`, or `price_desc`. The API confirms
the effective value in `appliedOrdering.sortBy`. A typed value must be echoed
exactly.

Ordering applies independently to `strongResults` and `relatedResults`.
Related results never move ahead of strong results. Price ties retain their
prior relevance order.

## `searchMeta.mode`

### `direct`

The marketplace returned exact or strong matches directly from the initial
search query.

Use when:
- The original query produced usable results immediately.

Model guidance:
- Present the results as normal search results.

### `related_only`

The marketplace returned related results but no strong results.

Use when:
- The user’s term is valid, but only adjacent matches cleared the relevance
  threshold.

Model guidance:
- Describe the results as related or closest available matches, not exact
  matches.

### `empty`

Neither strong nor related matches were returned.

Use when:
- The query could not be matched meaningfully.

Model guidance:
- Say no exact or close matches were found.
- Suggest broader or adjacent search terms, categories, or networks.

### `error`

The marketplace request failed. This is not an empty-result state.

Use when:
- Search could not produce a valid catalog response.

Model guidance:
- Explain that search failed and can be retried.
- Do not claim that the marketplace contains no matches.

## `rankingMode`

`rankingMode` reports the health of semantic ranking, independently of
`searchMeta.mode`:

- `full` means the normal semantic-ranking path ran.
- `degraded` means a fallback ranking path ran. A non-empty
  `degradedMessage` must accompany it so clients can disclose reduced search
  precision.

Clients must preserve both top-level fields and their copies under
`searchMeta`. Missing ranking health is a contract failure because it makes a
degraded response indistinguishable from a full one.

## Sort is separate from mode

The following are search ordering strategies:

- `relevance`
- `price_asc`
- `price_desc`

Keep these conceptually separate in prompts, logs, and UI.
