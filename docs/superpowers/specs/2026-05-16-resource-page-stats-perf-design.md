# Resource Page Stats Performance Design

**Created:** 2026-05-16
**Author:** Claude Opus 4.7 (1M context) + Branch
**Status:** Design, pending approval. No code written yet.
**Repo:** `dexter-api`

---

## Why this exists

Loading the resource detail page for a high-traffic resource (Jupiter Quote
Preview, the most-settled resource on x402.dexter.cash) hangs the page and, by
saturating the shared database, makes every Dexter site stop responding. The
problem is intermittent: the same page sometimes loads fast, sometimes hangs.

### The diagnosis, verified against the live database

The resource detail endpoint `GET /api/x402gle/resources/:id` in
`src/x402gle/routes/resources.ts` is timeframe-aware. For long timeframes
(7d, 30d, all-time) it reads pre-aggregated daily rollup tables and is fast.
For short timeframes (1h, 6h, 12h, 24h) `RAW_ROLLING_TIMEFRAMES` flips it to a
raw path that aggregates source tables live, because the daily rollups are
bucketed by day and cannot answer a sub-day window.

The raw path branches on the resource's attribution tier:

- `exact` tier: `getRawChainBreakdown()` and `getRawFacilitatorBreakdown()`
  aggregate `x402_facilitator_events`.
- `unique_payto` tier: the same two functions aggregate `x402gle_transactions`.
- `host_level` and `wrapper_pool` tiers: both functions `return
  Promise.resolve([])`, so there is no raw path at all.

For an `exact`-tier resource the raw query is:

```sql
SELECT e.network AS chain, COUNT(*) AS txns,
       SUM(e.amount_atomic / 10^decimals) AS volume,
       COUNT(DISTINCT e.payer) AS buyers
FROM x402_facilitator_events e
WHERE e.resource_url = $1 AND e.event_type = 'settle' AND e.status = 'ok'
  AND e.occurred_at BETWEEN $2 AND $3
GROUP BY e.network
```

`EXPLAIN` against the live database for Jupiter Quote Preview shows a
`Parallel Bitmap Heap Scan` with `rows=1,060,550`. `resource_url` has only 166
distinct values across a 29-million-row table, so the most-settled resources
each own hundreds of thousands to roughly a million rows. The query bitmap-heap-
scans about a million rows, then sorts them by `(network, payer)` to compute
`COUNT(DISTINCT payer)`. The resource detail handler fires this kind of query
about eight times per page load. Roughly eight parallel million-row scans
saturate the shared database, which is why every Dexter site stalls. When the
rows happen to be in Postgres's page cache the scan is fast, which is why the
hang is intermittent.

### Scope: only `exact` tier is broken

Verified against the live database:

- `exact` tier (1,506 resources): the broken path. Million-row live aggregate.
- `unique_payto` tier (358 resources): already fast. The worst-case
  `unique_payto` resource (16,636 transactions in 30 days) runs its raw 24h
  chain-breakdown query in 102 ms. `EXPLAIN` shows a clean `Index Only Scan` on
  `idx_x402gle_txns_recipient_hop_ts_covering`, estimate 14 rows. `unique_payto`
  reads `x402gle_transactions`, which was VACUUMed during this session (see the
  database-maintenance note below), and even the highest-volume `unique_payto`
  resource has only about 16k transactions, not a million.
- `host_level` (27,637 resources) and `wrapper_pool` (33 resources): no raw
  path, the handler returns an empty breakdown early.

So the fix targets `exact`-tier resources on 1h/6h/12h/24h windows only.
Nothing else is slow, and there is no third hidden slow path: the two
`getRaw*Breakdown` functions have exactly two tier branches and an empty
default.

---

## The fix

`x402_facilitator_hourly` is an existing rollup table, keyed
`(hour_bucket, pay_to, network, asset)`, about 66k rows. It is maintained live:
`src/routes/facilitatorEvents.ts` does an `INSERT ... ON CONFLICT DO UPDATE`
into it on every facilitator event, in the same path that records settlements.
It is not stale; it is current to the last settlement.

It carries exactly the measures the slow query computes by hand:
`settle_ok_count`, `settle_error_count`, `amount_atomic`, and `unique_payers`.

The fix replaces the `exact`-tier raw path with this rollup. Three changes,
all confined to the `exact`-tier branch of the 1h-24h path. The 7d/30d/all-time
path, the `unique_payto` path, and the frontend do not change.

### Change 1: chain breakdown from the hourly rollup

For an `exact`-tier resource on a 1h-24h window, the chain breakdown reads:

```sql
SELECT split_part(network, ':', 1) AS chain,
       SUM(settle_ok_count)::text   AS txns,
       SUM(amount_atomic / 1e6)::float AS volume
FROM x402_facilitator_hourly
WHERE pay_to = $1
  AND hour_bucket >= $2          -- window start, truncated to the hour
GROUP BY 1
ORDER BY volume DESC
```

`network` in `x402_facilitator_hourly` is a chain identifier such as
`solana:5eyk...`; `split_part(network, ':', 1)` maps it to the short chain name
(`solana`) the frontend expects. USDC has 6 decimals, so `amount_atomic / 1e6`
is the USDC volume.

Verified: summing `settle_ok_count` over the last 24h for Jupiter Quote Preview
returns 311, which matches a raw `COUNT(*)` over `x402_facilitator_events` for
the same window exactly. `x402_facilitator_hourly` has about 66k rows total and
an index on its key, so this query is effectively instant.

### Change 2: facilitator breakdown from the hourly rollup

`exact`-tier resources are settled only by the Dexter facilitator. Verified:
for Jupiter Quote Preview, `x402gle_transactions` shows `facilitator=dexter`
and no other facilitator across 30 days, and the existing 7d/30d facilitator
rollup `x402gle_recipient_facilitator_daily` likewise shows only `dexter`.

So the facilitator breakdown for an `exact`-tier resource is a single row:
facilitator `dexter`, with `SUM(settle_ok_count)` and `SUM(amount_atomic)` from
`x402_facilitator_hourly` for the window, joined to `x402gle_facilitators` for
the display name, logo, and color. Same table, same window as Change 1.

### Change 3: buyer count from a bounded raw query

`x402_facilitator_hourly.unique_payers` cannot be used. It is computed
incorrectly at the source. `facilitatorEvents.ts` writes each batch's distinct-
payer count and the `ON CONFLICT` clause does
`unique_payers = GREATEST(existing, EXCLUDED)`. `GREATEST` cannot accumulate a
distinct count across batches: if hour 14:00 receives a batch with 10 distinct
payers and then a batch with 8 distinct payers, the stored value stays 10 and
the 8 are discarded, even if all 8 were new payers. The column means "the
largest single batch's payer count," not "unique payers this hour."

Verified: for Jupiter Quote Preview over 24h, the true distinct buyer count
from raw events is 172. Summing `x402_facilitator_hourly.unique_payers` over
the same window gives 15; taking the max gives 3. The column is unusable, and
distinct counts cannot be summed across hours regardless.

So the buyer count comes from a separate, small, bounded raw query against
`x402_facilitator_events`:

```sql
SELECT split_part(network, ':', 1) AS chain,
       COUNT(DISTINCT payer)::int   AS buyers
FROM x402_facilitator_events
WHERE pay_to = $1
  AND event_type = 'settle' AND status = 'ok'
  AND occurred_at >= $2          -- window start
GROUP BY 1
```

This query filters by `pay_to` and a 1h-24h `occurred_at` bound. That is a far
smaller scan than the current slow query, which is effectively unbounded over a
resource's entire roughly-million-row history. Verified: this bounded query
returned 311 transactions and 172 buyers for Jupiter Quote Preview instantly.
The slow query is the unbounded one; bounding it to 24h makes it small.

The handler runs Change 1 and Change 3 and stitches their results in
JavaScript by chain. The existing 7d/30d rollup branch already does exactly
this stitch (a `txns` CTE joined to a `uniques` CTE), so the pattern is
established.

### Change 4: backfill `x402_facilitator_hourly`

`x402_facilitator_hourly` currently holds only about 8 hours of history. It is
incremented going forward on every settlement, but it was never backfilled. A
24h view today would under-report, seeing only the hours that exist.

A one-time backfill aggregates `x402_facilitator_events` into
`x402_facilitator_hourly` for the missing window:

```sql
INSERT INTO x402_facilitator_hourly (
  hour_bucket, pay_to, network, asset,
  settle_ok_count, settle_error_count, amount_atomic,
  fee_sponsored_lamports, fee_sponsored_wei, unique_payers
)
SELECT date_trunc('hour', occurred_at), pay_to, network, asset,
       count(*) FILTER (WHERE status = 'ok'),
       count(*) FILTER (WHERE status <> 'ok'),
       COALESCE(sum(amount_atomic) FILTER (WHERE status = 'ok'), 0),
       COALESCE(sum(fee_sponsored_lamports) FILTER (WHERE status = 'ok'), 0),
       COALESCE(sum(fee_sponsored_wei) FILTER (WHERE status = 'ok'), 0),
       count(DISTINCT payer) FILTER (WHERE status = 'ok')
FROM x402_facilitator_events
WHERE event_type = 'settle'
  AND occurred_at >= now() - interval '30 days'
  AND occurred_at < (SELECT COALESCE(min(hour_bucket), now()) FROM x402_facilitator_hourly)
GROUP BY 1, 2, 3, 4
ON CONFLICT (hour_bucket, pay_to, network, asset) DO NOTHING
```

`ON CONFLICT DO NOTHING` ensures the backfill never overwrites a live-
maintained recent bucket. The `occurred_at < min(hour_bucket)` bound restricts
it to hours the live writer has not already produced. The backfill's
`unique_payers` value is per-hour and therefore correct for a single hour (the
`GREATEST` bug only corrupts multi-batch accumulation); it still must not be
summed across hours, and the buyer count never reads it. `occurred_at` is
indexed, so this is a bounded, minutes-scale job. It is run once, manually,
against the live database.

---

## What is NOT in scope

- **Fixing `x402_facilitator_hourly.unique_payers`.** The `GREATEST` bug is
  real, but the fix routes around it (the buyer count comes from the bounded
  raw query). A correct cumulative hourly distinct count needs either a
  payer-level sub-rollup or a HyperLogLog sketch, which is a separate project.
  This spec documents the bug so nothing else trusts that column.
- **The `unique_payto`, `host_level`, `wrapper_pool` tiers.** Verified not
  slow.
- **The 7d/30d/all-time path.** Already fast.
- **The other route files** (`facilitators.ts`, `chains.ts`, `protocols.ts`,
  `servers.ts`, `stats.ts`) each have their own `RAW_ROLLING_TIMEFRAMES`
  short-window path. They are not confirmed slow. The implementation plan
  should include a read-only check of whether their raw paths aggregate
  comparably large row sets, and list findings. Fixing them is out of
  scope for this spec unless that check proves a real problem.
- **The frontend.** No change. The endpoint returns the same response shape.

---

## Data flow

```
Resource detail page  ->  GET /api/x402gle/resources/:id

  timeframe in {7d, 30d, all-time}            timeframe in {1h, 6h, 12h, 24h}
            |                                            |
            v                                            v
  existing daily-rollup path                   tier branch
  (unchanged, already fast)                      |
                                  +--------------+--------------+
                                  |              |              |
                              exact tier   unique_payto    host_level /
                                  |         (unchanged,    wrapper_pool
                                  |          already fast)  (empty, unchanged)
                                  v
                  chain + facilitator breakdown:
                    txns, volume  <- x402_facilitator_hourly  (SUM, fast)
                    buyers        <- x402_facilitator_events   (bounded
                                     COUNT(DISTINCT), fast)
                    stitched by chain in JS
```

---

## Error handling

- A resource with no settlements in the window: every query returns zero rows;
  the handler returns an empty breakdown, exactly as the raw path does today.
- `x402_facilitator_hourly` missing a recent hour (writer lag): the rollup is
  incremented synchronously on settlement, so lag is sub-second; an absent hour
  contributes zero, which is correct.
- The buyer query is bounded to at most 24h of one resource's events. If a
  resource ever has an extreme 24h burst, this query is still far smaller than
  today's unbounded query and degrades gracefully rather than hanging the
  database.

---

## Testing

- **Correctness:** For a sample `exact`-tier resource, compare the new
  rollup-based txns and volume against a raw `COUNT(*)` / `SUM` over
  `x402_facilitator_events` for the same window. They must match (verified for
  Jupiter Quote Preview: 311 = 311). Compare the bounded buyer query against a
  raw `COUNT(DISTINCT payer)`. They are the same query shape, so they match by
  construction.
- **Performance:** `EXPLAIN ANALYZE` the new chain-breakdown query against
  `x402_facilitator_hourly` for the highest-volume `exact`-tier resource;
  confirm an index scan over the small rollup, sub-100 ms. Confirm the bounded
  buyer query is sub-second.
- **Manual:** After deploy, load the Jupiter Quote Preview resource page with
  the 24h timeframe in a browser. The "Latest Settlements" / chain / facilitator
  panels must populate quickly, and other Dexter sites must stay responsive
  while it loads. Then load the 7d view and confirm it is unchanged.
- **PM2:** `pm2 restart dexter-api --update-env` after the build.

---

## Files

- Modify: `src/x402gle/routes/resources.ts`. In `getRawChainBreakdown` and
  `getRawFacilitatorBreakdown`, the `exact`-tier branches only: read
  `x402_facilitator_hourly` for txns/volume, run the bounded buyer query
  against `x402_facilitator_events`, stitch by chain.
- New: a one-time backfill script for `x402_facilitator_hourly`, following the
  pattern of the existing wash-overlay backfill script. Run once, manually.
- Investigate, then report (no change unless confirmed slow):
  `facilitators.ts`, `chains.ts`, `protocols.ts`, `servers.ts`, `stats.ts`,
  specifically whether their `RAW_ROLLING_TIMEFRAMES` paths aggregate
  comparably large row sets.

---

## Database-maintenance note (done during this session, outside this spec)

While diagnosing this issue, two live-database maintenance operations were
performed. They are recorded here because they have no git or migration trail.

1. `VACUUM (ANALYZE) x402gle_transactions`. The 183-million-row table had not
   been autovacuumed since 2026-04-18. Tens of millions of rows were absent
   from the visibility map, degrading index-only scans into heap-fetch storms.
   The VACUUM repaired the visibility map and refreshed planner statistics.
2. `VACUUM (ANALYZE) x402_facilitator_events`. This table had never been
   analyzed; its `n_live_tup` estimate was 14x too low (reported 2.1M, actual
   ~29M), so the planner chose poor plans.
3. Per-table autovacuum overrides set on both tables so they stay current:
   `autovacuum_vacuum_scale_factor = 0` with absolute thresholds
   (`x402gle_transactions`: vacuum at 2,000,000 / analyze at 1,000,000;
   `x402_facilitator_events`: vacuum at 50,000 / analyze at 25,000).

These were genuine fixes for neglected tables and improve planner behavior
database-wide. They were not the root cause of the resource-page hang (the
root cause is the query design addressed by this spec), but they were
worth doing and should be kept.

---

## The principle this encodes

A resource page must never aggregate an unbounded slice of a multi-million-row
table on a live request. Sub-day stats come from the hourly rollup that
already exists for sums, and from a tightly time-bounded query for the one
measure (distinct buyers) that cannot be pre-summed. The fast 7d/30d path
already follows this principle; this spec extends it to the sub-day window
that was left scanning raw.
