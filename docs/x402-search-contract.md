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

## Sort Is Not Mode

The following are sort strategies, not search execution modes:

- `marketplace`
- `relevance`
- `quality_score`
- `settlements`
- `volume`
- `recent`

Keep these conceptually separate in prompts, logs, and UI.
