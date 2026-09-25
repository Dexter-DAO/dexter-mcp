# Portfolio v3 consumer qualification

Source begins at MCP `ba3459b275a724296407f9823104bfc484e85bc8`. The shared API wire is `WIRE-SOURCE.v2.json`, SHA256 `322939e52e18554353d8de664516b355704c3a287fc3cfbf9407d3dae7f07ca0`, and the contract source is `3cdbd465e3deca3c8957c49b9ab477f6c923f1cea8820e5462c8c65f7d4521f1`. The six API-authored literals are copied byte for byte into `tests/fixtures/portfolio-selected-v3-api.json` (SHA256 `88018dfabaabc9d14e52a0d1e04fe8d25dbfb2dc02a2a88a06fca66244d96438`). They are authored source examples, not captured running API responses.

This source qualification and measurement plan has not run. Tests, compiler, browser and native reads require the coordinated execution assignment. Current production remains the separately accepted PR113 release.

## Version and observation boundaries

Fresh tool input defaults to v3. A saved unversioned `snapshotId` or `cursor` continues on v2. Every v3 card continuation explicitly sends `readVersion: 3`. Only v3 sends the internal version header; the query never contains `readVersion`. Wrong-version responses refuse after one request. There is no downgrade or hidden fresh summary.

Holdings keep their priced source, identity evidence, totals, selection, timestamps and expiry. `tradingAvailability.state` remains `not_evaluated`. Recognized or retired identity is not action permission. Prices and quantities survive an unavailable registry identity; unknown prices remain null. Native SOL market metadata still names wrapped SOL explicitly.

Targets have a separate observation and expiry. A linked fresh targets request names `holdingSnapshotId` and requires explicit v3. Its response must name that exact parent. A standalone targets response has a null parent and cannot establish whether an asset is held. Subsequent target pages use the target handle. Back retains the original holdings view and its expiry. Neither observation extends the other.

The existing model budgets remain 2,048 bytes for summary, 6,144 for holdings, 8,192 for detail and 6,144 for targets; selected HTTP transfer remains 512 KiB, pages at most 32 rows. Validation refuses oversized or inconsistent evidence instead of trimming fields to fit.

## Bounded regression batch

Run once against frozen source and the recorded dependency identity after assignment. Stop on the first failed step and preserve its output. Source corrections and reruns require a new frozen readiness record; no unrecorded repair inside the batch.

1. Execute the v3 contract and transport/handler tests alongside the affected v2 selected-read and safe-diagnostic tests. V3 contract cases bind all six shared literals, canonical identity digests, quantity arithmetic, nulls, selection invariants and model/card correspondence. Transport cases use the actual selected-read function with mocked HTTP; handler cases extract the actual existing producer and registration, preserving state/authorization checks. The SDK case traverses `McpServer`, `Client` and `InMemoryTransport`, then checks the complete model output and private card separately.
2. Run the affected UI model tests and focused compiler using the existing corrected declaration/JavaScript input pattern. Include v2 saved continuations, v3 parent-linked targets and target pagination, retirement with a retained price, identity failure with a retained value, unknown versus zero, scope mismatch, local Back and both expiries. Preserve independent snapshots and prevent a targets result from replacing holdings totals.
3. Render only changed v3 component flows at desktop and mobile sizes using existing fixture/host infrastructure. No external requests. Inspect actual captures for amount hierarchy, disclosure, actionable errors, identity copy, navigation, target scope and expiry. Existing v2 screenshots may be reused only where source and behavior remain unaffected. A passing command does not supply visual acceptance.

The source batch will include the exact argv, source/dependency hashes, deadlines, expected outputs and owned cleanup in its execution readiness record. There is no package install, descriptor generation, release build or production operation in this batch.

## Primary compatibility

The model-safe result remains `{portfolio_status, mode, user_bound, portfolio}`. Primary must select the strict v3 parser for `opendexter.portfolio.v3`, preserve the `source` union and carry explicit version 3 on continuations. It must not reconstruct holdings action permissions or a target count from absent fields. The card remains in `_meta.portfolioCard`; the model facts are complete in `structuredContent` even when a host does not expose card metadata.

Primary normalization and saved-result replay belong to the shared API author. Their qualification must consume the actual candidate MCP envelopes produced from the six literal API inputs, rather than independently approximated fixtures. Compare all quantities, provenance, source/selection counts, snapshot identities, nulls and version tags. Preserve durable historical v1/v2 bytes and digests. An expired historical observation does not become a new v3 observation or acquire an invented continuation.

## End-to-end measurement

The delivery target is p95 at or below 3,000 ms for the complete initial portfolio answer. The start is the ordinary request entering the selected customer interface; the finish is the complete useful initial answer becoming available there. Tool-only timing and time to first token are reported separately. A fast cached continuation cannot satisfy the initial-answer target.

After the matching API/MCP/Primary release is accepted, the coordinated measurement assignment selects one interface and fixes its version/model/config identities. Keep native shared-tool timing and Phone/Primary answer timing as separate cohorts. Use the ordinary current connection, authorization and state path; no copied credentials or direct provider probes.

Proposed first bounded run: up to 20 cold and 20 warm fresh-summary attempts per selected interface, serialized and separately assigned. Each attempt omits saved handles and creates a fresh holdings observation. Classify cold/warm from recorded process/cache facts supplied by the API owner. Do not clear production caches or restart services for a cold label. If cold state cannot be established, mark that sample unclassified and report the missing cohort instead of claiming cold performance. Warm means the relevant process/identity cache is warm; it still measures a fresh summary, not a snapshot page.

For each attempt retain outer elapsed time, complete-answer elapsed time, tool elapsed time and existing safe MCP/API stage timings when available. Record sample number, cohort basis, bounded correlation ID, exact source/config identities, holding count, priced/unpriced counts, byte size, outcome/error and any advertised retry separately. A retry cannot replace its failed first attempt. Capture no credentials or wallet contents in aggregate measurement logs; private account-bound receipts remain in their existing restricted evidence location.

Report attempted/successful/failed counts, deadline failures, p50/p95/max and counts above 3,000 ms for each cohort. Compute percentiles with the stated nearest-rank method and include the sample size; do not extrapolate a small batch into sustained reliability. An empty or failed cohort has no passing percentile. Keep a successful-call latency distribution separate from the all-attempt failure rate and target-breach count.

A successful initial answer must have exact source totals, truthful coverage, unknown-versus-zero semantics, useful requested facts and a usable detail continuation. No target preparation should occur on the initial holdings path. A separately assigned same-snapshot detail/page check can verify continued access, but its latency is not part of the fresh-summary cohort. Target preparation has its own measurements and never substitutes for an initial overview result.
