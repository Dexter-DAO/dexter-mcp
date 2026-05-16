# AI Spend Visibility Handoff

**Created:** 2026-05-16
**Author:** Claude Opus 4.7 (1M context) + Branch
**Status:** Investigation complete, fix designed, not implemented. Pick this up in a fresh session with full context budget.

---

## The problem

The dexter-api OpenAI bill runs out of quota repeatedly, every day, and there
is no way to see what is consuming it. Branch tops up the OpenAI account, it
drains again, and the spend is unattributable. This handoff is the result of
investigating why, and a designed fix.

This is a real, ongoing operational problem: "every time I open my eyes the
bill is out." Topping up does not fix it. The fix is visibility into where the
spend goes, then a cap.

---

## What was found

### The trigger that started this

The x402gle resource page's test-theater panel ("Watch a real paid call
execute live") showed runs marked **ERROR** even though the API call itself
succeeded with a valid 200 payload. Investigation traced this to the AI
evaluator.

### Root cause of the ERROR runs

`x402_verification_history` final_status distribution (live DB, 2026-05-16):

- `error`: 122,415
- `fail`: 141,271
- `skipped`: 383,455
- `inconclusive`: 28,269
- `pass`: 15,308

There are roughly 8x more `error` runs than `pass` runs. The verifier pays the
resource, calls the API, gets a real `200` response with a valid payload, then
calls OpenAI (`gpt-5.4-mini`) to grade the response. The OpenAI call returns:

```
status: 429
type: "insufficient_quota"
message: "You exceeded your current quota, please check your plan and billing details."
```

Verified by reproducing the exact `evaluateWithAI` call against the live
OpenAI key. So the API works; the AI grader cannot be paid for; the run is
stamped `error` / `skip_reason: ai_error`.

### The retry amplification

`src/tasks/verifier/ai-evaluator.ts` has a retry loop:
`AI_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 15_000]` (5 total attempts).
`isTransientOpenAIError` classifies a `429` as transient, so a quota failure
is retried 5 times with sleeps summing to 32 seconds. Every test-theater
ERROR run takes ~44-52 seconds for this reason. `429 insufficient_quota` is
NOT transient (you do not run out of quota for 32 seconds), so retrying it
wastes 32 seconds and 5 API requests per run. With ~12,800 grader calls on a
busy day, the amplification is large.

### The scale of the AI surface

`grep` for OpenAI / AI-model call sites in `dexter-api/src` returns **64
files**. A non-exhaustive grouping:

- Verification: `tasks/verifier/ai-evaluator.ts`, `smart-input.ts`,
  `input/ai-refiner.ts`, `resourceQualityVerifier.ts`, `resourceAutoNamer.ts`
- Moltbook agent: 8 files under `services/moltbook/`
- Twitter bots: ~10 files under `workers/twitterMentionBot/`,
  `workers/dexterTelegramBot/`, `services/twitter*`
- Tool jobs: `workers/toolJobs/` (codeInterpreter, deepResearch, memeGenerator,
  soraVideo, spacesTranscribe, openai)
- Missions, lab, knowledge, ranking cross-encoder, intent parser, storefront
  synthesizers, gallery moderation, holder analysis, and more.

Verification run volume alone (`x402_verification_history`, last 7 days):
roughly 15,000-17,000 runs per day, of which several thousand to ~12,800 reach
the AI grader. Each grader call is one or more OpenAI requests, multiplied by
the retry loop on failure.

**There is no spend metering and no spend cap anywhere.** Nothing records
which subsystem makes how many AI calls or what they cost. That is why the
bill is unattributable.

---

## The designed fix

### Key fact that makes this tractable

Every one of the 64 call sites obtains its OpenAI client through a single
factory: `getOpenAI(env)` in `src/openaiClient.ts` (28 lines, currently a
trivial singleton wrapper around `new OpenAI({...})`).

One chokepoint. Instrument `getOpenAI()` and every AI call in the codebase is
logged, with zero changes to the 64 callers.

### Approach: a logging fetch wrapper on the OpenAI client

The OpenAI Node SDK accepts a custom `fetch` in its constructor options. Wrap
it: the wrapper calls the real `fetch`, then before returning, inspects the
response.

For non-streaming responses (the common case for `responses.parse` /
`chat.completions.create`), the JSON body carries a `usage` object with
`input_tokens` / `output_tokens` (or `prompt_tokens` / `completion_tokens`).
The wrapper reads `model` from the request body and `usage` from the response
body, and writes one row per call to a new `ai_call_log` table.

Cost is derived from token counts using a small per-model price map (the
verifier's `constants.ts` already documents `gpt-5.4-mini` at $0.75 / $4.50
per 1M input/output tokens, so the pattern for a price map exists).

### Caller attribution

To know *which* of the 64 subsystems made a call, the cleanest path without
touching 64 files: capture a short stack trace at call time inside the
wrapper and extract the first `src/...` frame outside `openaiClient.ts` and
the SDK. That yields the calling file. It is approximate but good enough to
answer "which subsystem is burning the money." A more precise alternative is
an `AsyncLocalStorage` context tag set by each subsystem, but that does touch
callers. Defer it; the stack-frame approach is enough for a first cut.

### The `ai_call_log` table (hand-written SQL, no Prisma migrate)

Columns, roughly: `id`, `created_at`, `model`, `endpoint` (e.g.
`responses` / `chat.completions`), `input_tokens`, `output_tokens`,
`cost_usd` (derived), `caller` (the stack-derived `src/...` frame),
`status` (`ok` / the HTTP error code), `duration_ms`. Index on
`(created_at)` and `(caller, created_at)`.

This is the same hand-written-SQL pattern the rest of dexter-api uses (no
`prisma migrate`; apply SQL manually, then `prisma generate` if the table
needs a Prisma model. For an append-only log queried via raw SQL, a Prisma
model is optional).

### Streaming caveat

Streaming responses (used by tool jobs, chat) do not carry `usage` in a
single body. The SDK can be asked to include usage in the final stream chunk
(`stream_options: { include_usage: true }`), but the callers would need that
option set, which touches callers. For a first cut: log streaming calls with
`model` + `status` + `duration_ms` and a null token count, and note the gap.
Most of the verifier and agent volume is non-streaming, so the first cut
still captures the bulk of the spend.

### Once logging exists: the cap

With `ai_call_log` populated, a daily or hourly rollup answers "which caller
spent what." Then a spend cap is a follow-up: a cheap pre-call check in
`getOpenAI()`'s wrapper that reads the day's `cost_usd` sum and refuses (or
warns) past a threshold. Design that after the logging has produced real
data. Do not guess the threshold.

---

## Quick win, separate and small

Independent of the logging work: fix `isTransientOpenAIError` in
`src/tasks/verifier/ai-evaluator.ts` so `429 insufficient_quota` is treated as
**permanent**, not transient. A plain `429` rate-limit stays transient and
retryable; `insufficient_quota` should fail fast with no retry. This stops
every quota failure from wasting 32 seconds and 5 API requests. About 5 lines
in one function. It does not fix the bill; it stops the retry loop from
amplifying the waste. Branch deprioritized this in favor of the logging, but
it is cheap and correct whenever someone is in that file.

---

## What to do, in order

1. Build the `ai_call_log` table (hand-written SQL against the live DB).
2. Wrap the OpenAI client's `fetch` in `getOpenAI()` to log every call:
   model, token usage, derived cost, stack-derived caller, status, duration.
3. Add the per-model price map (extend the pattern from
   `tasks/verifier/constants.ts`).
4. Let it run a day. Query `ai_call_log` grouped by `caller` and by `model`.
   Now the spend is attributable.
5. From real data, design and add a spend cap in the wrapper.
6. Optionally, the `insufficient_quota` retry fix.

This is a clean, well-scoped project for a fresh session. The chokepoint
(`getOpenAI`) makes it small despite the 64 call sites.

---

## Files

- Modify: `src/openaiClient.ts`, wrap the client with a logging `fetch`.
- New: hand-written SQL for the `ai_call_log` table.
- New: a per-model price map (small module, or extend
  `tasks/verifier/constants.ts`).
- Later: `src/tasks/verifier/ai-evaluator.ts`, the `insufficient_quota`
  retry fix.

---

## Note on the OpenAI account itself

The immediate `429 insufficient_quota` will keep stamping verification runs
`error` until the OpenAI account behind `OPENAI_API_KEY` has credit. Topping
up restores grading instantly, no deploy. But topping up is not the fix.
The spend will drain again. The logging work above is what makes the next
top-up the last emergency one.
