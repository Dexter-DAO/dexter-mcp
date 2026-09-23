# Portfolio reads

`dexter_wallet_portfolio` reads the Solana wallet attached to the current authorized connection. An empty input requests a summary. The same tool serves holding details, additional holdings and approved asset targets.

| View | Input example | Response |
| --- | --- | --- |
| Summary | `{}` | Whole-source totals and coverage, with up to five holdings. |
| Holdings | `{"view":"holdings","snapshotId":"<returned handle>","limit":32}` | A bounded page of observed holdings. |
| Detail | `{"view":"detail","snapshotId":"<returned handle>","mint":"native:SOL"}` | One rich holding, or compact choices when several accounts match. |
| Targets | `{"view":"targets","snapshotId":"<returned handle>"}` | Approved asset targets and action availability. |
| Continue | `{"cursor":"<returned nextCursor>"}` | The next matching page from the same observation. |

Detail and filtered holdings/targets accept a trimmed literal `query` of at most 128 UTF-8 bytes, or an exact `mint`. A token account can disambiguate detail for a token mint. Native SOL uses `native:SOL`; wrapped SOL uses its mint. Inputs may also specify `network: "solana-mainnet"`. Other networks are rejected by this version. Identity and permissions come from the connection.

Each successful result has `portfolio_status: "ready"`, `mode: "portfolio_ready"`, `user_bound: true`, and a portfolio with `contractVersion: "opendexter.portfolio.v2"`. `sourceSummary` retains whole-source counts, priced subtotal, total when known, and enrichment coverage. `selection` reports the chosen view, filters, match state, row counts, offset and continuation. An unavailable target source has null counts; an observed empty source has zero counts. A negative name search is limited by source and metadata coverage.

Compact holdings contain the canonical asset ID when approved, mint, token account, name, symbol, displayed quantity, amount model, USD value and 24-hour price change. A unique detail response includes raw amount, decimals, display multiplier, price observation/source, available market context, registry identity and capability reasons. Market context records liquidity in USD, holder count and the provider's `stats24h.numTraders`. Those observations retain their sources and times. Missing observations remain null. Prepare evaluates the requested action's current authority.

Selected rich rows also reach the card in `_meta.portfolioCard`; they match the model rows' identity, order and values. This metadata contains selected rows only. The card's explicit read controls call this tool using the same snapshot. The model receives a short content sentence alongside its structured result.

## Continuation and size

The API owns the snapshot and cursor. It checks the connection's current binding on every page. Reads using a snapshot keep its observation time, totals and expiry. Snapshots expire after five minutes; cache eviction or process restart can make a handle unavailable sooner. An unavailable handle returns `portfolio_snapshot_expired`. A fresh summary creates a new observation.

Pages request 1 to 32 rows; byte limits can return fewer whole rows. The full model result is limited to 2,048 UTF-8 JSON bytes for summary, 6,144 for holdings or targets, and 8,192 for detail. The content sentence is at most 384 bytes. Selected API transfer, including card rows, is capped at 512 KiB. These are byte limits; model token usage depends on the tokenizer.

`selection.omittedCount` counts all observed source rows absent from this response, including rows on other pages and rows excluded by the filter. `matchedCount` counts matches in the observed source. `nextCursor` continues those matches. Summary has no cursor: request holdings with the same snapshot to start its first page. Counts and read coverage always stay separate from market freshness.

## Failure and saved results

Defined selected-read errors are `portfolio_query_invalid`, `portfolio_snapshot_expired`, `portfolio_snapshot_too_large`, `portfolio_result_budget_exceeded`, and `portfolio_read_unavailable`. MCP preserves these in `readError`; unknown transport or malformed responses become unavailable. An expired snapshot requires an explicit fresh summary. The transport performs one read without automatic retries. Temporary unavailability retains the existing guidance for up to two read attempts after a two-second wait; query, expiry and size errors require the stated correction.

Legacy v1 output remains valid. Stored results and digests remain unchanged. A compact historical replay keeps the original observation and reports unavailable continuation when no usable snapshot exists. Historical full results do not gain a synthetic cursor or a promise of detail retrieval. Request a fresh summary when a current observation is needed.

The legacy API request without `view` or `cursor` retains its full response. Either key selects v2; other selection-only keys without either are rejected. Cursor-only reads let the API resolve the signed view. Explicit parameters must agree with the cursor.
