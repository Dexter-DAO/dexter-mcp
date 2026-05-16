# Wash Evidence Grading Design

**Created:** 2026-05-16
**Author:** Claude Opus 4.7 (1M context) + Branch
**Status:** Design, pending approval. No code written yet.
**Repos touched:** `dexter-api`, `x402gle`

---

## Why this exists

The x402gle transactions feed shows a small box reading `R` on a large number of
rows, between the Buyer and Tx columns. Hovering it says "Reasons, Unknown
analyzer." Nobody can tell what it means.

Investigation traced the `R` to a bug, and the bug to a deeper problem in how
wash detection presents its findings. This design fixes both: the broken pill,
and the conflation of three very different kinds of wash evidence into one
undifferentiated verdict.

### What the `R` actually is

`x402gle/src/components/live-settlements.tsx` renders an `AnalyzerPill` next to
the buyer address whenever the sender wallet has a wash verdict. With
`variant="compact"` the pill shows the first letter(s) of the analyzer's label.

The route that feeds it, `dexter-api/src/x402gle/routes/transactions.ts`, builds
the analyzer list with `jsonb_object_keys()` over the `signals` JSONB column. It
grabs **every top-level key** and treats each as an analyzer id.

But the `signals` column holds two different record shapes:

- **Self-analyzed.** Keys are real analyzer ids: `{ circular_flow: {...},
  ghost_wallet: {...} }`.
- **Propagated.** Keys are metadata, not analyzers: `{ reasons: ["..."],
  source_payto: "WALLET" }`.

For a propagated row, `jsonb_object_keys()` returns `["reasons","source_payto"]`.
The frontend's `analyzerMeta()` does not recognize `reasons`, so its fallback
title-cases the raw key to `"Reasons"`, the compact pill takes the first letter,
and the result is a meaningless `R` with a tooltip that says "Unknown analyzer."

### The measured scale

Live database, queried 2026-05-16:

- `wash_address_profiles` has **122,534** confirmed/likely sender rows.
- **122,363 of them (99.86%)** are propagated-only. Signals is exactly
  `{reasons, source_payto}` and nothing else. Every one renders an `R` today.
- **161** rows are self-analyzed (real analyzer keys).
- **10** rows are mixed (both shapes merged by an `ON CONFLICT ... signals ||
  EXCLUDED.signals` upsert).

So the `R` is not rare. It is on essentially every washing-sender row.

### The deeper problem the `R` exposed

Once the propagated rows were understood, a second issue surfaced. The wash
system has **three distinct grades of evidence**, and currently collapses all
three into one `wash_label` (`confirmed` / `likely` / `suspicious`) and one wash
percentage:

1. **Curated.** A human investigated the address, wrote it up, published
   evidence. Source: `wash_curated_findings`. The live table has one row, the
   "AISA / POLYGON402 x402 wash operation", verdict `confirmed`, confidence
   `1.0`, evidence at `dexter.cash/research/aisa-x402-wash`. This is hard proof.

2. **Forensic.** An automated analyzer caught the address's own on-chain
   pattern. Sources: `circular_flow`, `ghost_wallet`, `funding_chain`,
   `meta_tx_relayer`, `amount_uniformity`, `sender_concentration`,
   `temporal_pattern`, `at_floor`, `coordinated_timing`. These vary widely in
   strength, from near-proof to a weak hint.

3. **Propagated.** The wallet paid a recipient that is itself flagged. No
   independent evidence on the wallet. This is how the `R` rows were created.
   `classifyAndPersistSenders()` stamps every sender of a dispositively-wash
   recipient as `wash_confirmed` at score 0.95.

A curated, evidence-backed ruling and a "you sent one transaction to a flagged
API" inference currently look identical in the UI. That is the conflation this
design ends.

### Why propagated is dangerous, and how this design contains it

Of the 122,363 propagated wallets:

- **41,407 (34%)** sent exactly **one** transaction to the recipient that
  flagged them.
- The entire 122k traces to just **22 recipient farms**. Two farms account for
  **96.8%** of it: one Solana address tainted 93,240 senders, one EVM address
  tainted 25,173.

A wallet that made a single $0.01 API call is being labelled a confirmed wash
operator at 0.95. Propagation, left unchecked, is a virus: it spreads a verdict
from a flagged recipient to everyone who ever paid it.

This design's core principle: **propagation spreads information, never blame.**
A propagated signal is reframed as a fact about the *counterparty* ("the wallet
you paid is flagged"), never a verdict about the buyer. It is not a wash grade.
It is not counted as wash in aggregates. It is never styled as an accusation.

---

## Scope

In scope:

1. Fix the broken `R` pill on the transactions feed.
2. Fix the same bug in `WashEvidenceSection` on the transaction detail page.
3. Introduce honest, plain-English evidence grading, computed once and shared
   by every surface.
4. Peel propagated-only volume out of the wash aggregates into a separate,
   honestly-labelled statistic ("3b").

Out of scope:

- A redesign of the `/wash` dashboard layout. It is touched only insofar as it
  consumes the shared, corrected components and types and must not visibly
  break.
- A wash drill-down surface (break wash down by farm / facilitator with
  provenance). Noted as a worthwhile future project; not designed here.
- Any change to the wash detection analyzers themselves, or to how
  `classifyAndPersistSenders` decides whom to propagate to. The propagation
  logic stays; only its *presentation and aggregation* change.

---

## The model

### Grades: verdicts about the wallet's own behavior or a human ruling on it

A ladder of certainty. Each phrase is what the **user sees**. The internal
identifier is never shown.

| User sees | Internal grade | Meaning |
|---|---|---|
| **Confirmed wash** (with a link to the investigation) | `curated` | A human investigated it; published evidence exists. |
| **Strong wash signal** | `forensic`, strength `dispositive` | Near-proof. Funds traced in a loop, a relayer fleet covering settlements, etc. |
| **Possible wash signal** | `forensic`, strength `strong` or `medium` | The wallet's own pattern looks off (uniform amounts, 24/7 rhythm). |
| **Weak wash signal** | `forensic`, strength `weak` | A soft hint (payments sit at the protocol floor price). |

### Counterparty note: NOT a grade, NOT a verdict about the buyer

| User sees | Internal grade | Meaning |
|---|---|---|
| **Paid a flagged wallet** | `propagated` | A fact about the *recipient*. The buyer is accused of nothing. |

`Paid a flagged wallet` is styled neutrally, never the red/alarm treatment a
wash grade gets. It states the buyer's action and points at the counterparty.

### Analyzer strengths (from the analyzer source files)

The forensic split reads the `strength` field each analyzer already declares in
`dexter-api/src/x402gle/wash-detection/analyzers/*`:

| Analyzer | Strength | Forensic phrase |
|---|---|---|
| `circular_flow` | dispositive | Strong |
| `meta_tx_relayer` | dispositive | Strong |
| `curated_findings` | dispositive | (curated grade, not forensic) |
| `funding_chain` | strong | Possible |
| `ghost_wallet` | strong | Possible |
| `amount_uniformity` | strong | Possible |
| `sender_concentration` | medium | Possible |
| `coordinated_timing` | medium | Possible |
| `temporal_pattern` | medium | Possible |
| `at_floor` | weak | Weak |

For a wallet with multiple forensic signals, the strongest one decides the
phrase.

### Grade precedence

A row can carry signals of more than one grade (the 10 mixed rows). Precedence:

```
curated  >  forensic  >  propagated
```

A wallet that is both forensically caught and propagated resolves to
`forensic`. The stronger evidence about the wallet itself wins. Curated
outranks everything.

### The aggregate rule (3b)

A wallet whose **only** signal is `propagated` (no `curated_findings` key, no
real analyzer key) does **not** count as wash in any aggregate percentage. Its
volume is reported as a separate, clearly-labelled statistic ("paid flagged
counterparties"). Wash counts and wash volume are curated + forensic only.

### What does NOT change

`wash_label` (`confirmed` / `likely` / `suspicious`) is untouched in the
database and keeps its current meaning as a severity axis. `evidenceGrade` is a
new, separate provenance axis, **derived at read time**, never stored. No schema
change. No backfill. No re-scoring. No change to any writer.

---

## dexter-api changes

All changes are in the `dexter-api` repo. The repo is ESM, so relative imports
use `.js` extensions. Database access is Prisma raw SQL (`$queryRaw` /
`$queryRawUnsafe`), default import `prisma` from `../../prisma.js`. No
`prisma migrate` / `db push` / `db pull`: this design needs none of them
because nothing in the schema changes.

### `resolveWashEvidence`: one function, one source of truth

A new pure function, the single place that classifies a wash signal. The `R`
bug existed because three surfaces each ran their own `jsonb_object_keys()`.
After this, there is exactly one classifier.

Input: the `signals` JSONB object for one side of one transaction, plus the
raw `wash_label` and `wash_score`.

It:

- Filters `reasons` and `source_payto` out of the analyzer-id list.
- Picks the grade: `curated` if a `curated_findings` key is present; else
  `forensic` if any real analyzer key is present; else `propagated` if
  `source_payto` is present; else none.
- For `forensic`, finds the strongest analyzer strength via a strength map
  **derived from the registered analyzer definitions** (each `WashAnalyzer`
  already declares `strength`, so no new hand-maintained file).
- Returns a UI-ready shape:

```
{
  label: string;                       // raw wash_label, unchanged (severity axis)
  score: number | null;
  confidence: 'confirmed' | 'strong' | 'possible' | 'weak' | 'counterparty';
  headline: string;                    // "Strong wash signal", "Paid a flagged wallet", ...
  signals: string[];                   // analyzer ids, junk-filtered, may be empty
  sourcePayTo: string | null;          // propagated only: the flagged recipient
  reason: string | null;               // propagated only: reasons[0], the human sentence
  evidenceUrl: string | null;          // curated only: the published investigation
}
```

The `confidence` and `headline` are resolved here. Code identifiers never leave
the API.

### `transactions.ts`, the list endpoint

`GET /api/x402gle/transactions`, feeds the live feed.

- The four `jsonb_object_keys()` blocks (the sender and recipient signal-name
  extraction, in both the per-payTo query and the main paged query) gain
  `WHERE k NOT IN ('reasons','source_payto')`. A propagated row's analyzer list
  becomes empty.
- The same queries also select the raw `signals` JSONB (or the specific derived
  values: the grade-determining keys, `source_payto`, `reasons->>0`) per side,
  so `buildWashReason` can call `resolveWashEvidence`.
- `buildWashReason` is updated to return the new shape (above) per side, by
  delegating to `resolveWashEvidence`. The old flat `signals: string[]` is
  replaced by the richer object.

### `transactions.ts`, the detail endpoint

`GET /api/x402gle/transactions/:hash`. Already selects full `signals` JSONB for
both sides. It gets the same `resolveWashEvidence` treatment so the detail
response carries `confidence` / `headline` / `sourcePayTo` / `reason` /
`evidenceUrl`, and a junk-free `signals` map, for `WashEvidenceSection` to
render.

### Aggregate queries (3b)

The volume-breakdown and dashboard math currently treat any flagged sender as
wash.

- `tagger.ts` `computeVolumeBreakdown` splits a payTo's transactions into
  clean vs wash volume. It gains a third bucket. A transaction whose sender's
  grade is `propagated` (sender `signals` has only `source_payto`/`reasons`,
  no real analyzer key, no `curated_findings`) goes into a `counterparty`
  bucket, not `wash`.
- The `/wash` dashboard queries behind `fetchWashServers`,
  `fetchWashFacilitators`, and `fetchWashSummary` get the same treatment. Wash
  numerators become curated + forensic only; the counterparty figure is
  returned as its own field.
- This is done with the same `CASE`-over-JSONB grade logic, applied in the
  aggregate SQL. No stored row changes. The number is derived differently at
  read time. If it is ever wrong it is a query edit to fix, not a corrupted
  table.

### Ranking gaming factor (3b)

If the ranking `gaming` factor (`dexter-api/src/services/ranking/`) reads wash
signals to penalize a resource, a `propagated`-only signal must not feed it. A
buyer is not gaming search by paying an API once. This is a read-side filter on
whatever wash input the gaming factor already consumes. If the gaming factor
does not currently read these wash tables at all, this item is a no-op and the
plan records that finding.

---

## x402gle changes

All changes are in the `x402gle` repo. Next.js App Router. Build is
`npm run build`.

### The transaction row pill, `live-settlements.tsx`

The buyer-side `AnalyzerPill` (currently `variant="compact"`, the lone-letter
pill) is replaced by a small **text tag** showing the API's `headline`,
abbreviated to fit the column but always legible, never a single letter. It is
color-keyed to the grade: wash grades get the grade color, and `Paid a flagged
wallet` (counterparty) gets a neutral, non-alarm treatment.

The whole row already links to `/transactions/[hash]`, so "more information" is
a click on the row. No hover-only dead end.

The `variant="compact"` single-letter mode of `AnalyzerPill` is **deleted**. It
exists only to produce this bug.

### The detail page, `WashEvidenceSection`

This component (`x402gle/src/components/wash/wash-evidence-section.tsx`,
rendered on `/transactions/[hash]`) already does the right thing: a per-signal
breakdown with plain-English `evidence` strings and expandable raw data. It has
the **same bug**. `Object.keys(role.signals)` grabs junk keys,
`analyzerMeta("reasons")` returns "Unknown analyzer", `Tier 1 · weak` renders
for junk, and `identifiedAs` shows a raw code identifier.

Fixes:

- It consumes the API's already-junk-filtered `signals` and the new
  `confidence` / `headline`.
- A proper top-line verdict from `headline` / `confidence`, for example
  "Strong wash signal", replacing the raw `wash_label` display.
- For a **curated** verdict, a real evidence block: the finding name, summary,
  and a "Read the investigation" link to `evidenceUrl`. First-class, not a fake
  analyzer card.
- For a **propagated** verdict, a plain counterparty block: "This wallet paid
  `<sourcePayTo>`, which is flagged" plus the `reason` sentence. Framed as a
  counterparty fact, not rendered as analyzer evidence.
- Raw code identifiers (`Tier N · strength`, raw `identifiedAs`) are removed
  from display, or translated to plain words. No code identifiers on screen.

### Shared display helper

One module maps `confidence -> { headline, colorClass }` so the row pill and
the detail section cannot drift. `analyzerMeta()`'s fallback is fixed: an
unrecognized analyzer id renders **nothing**, never a fabricated "Unknown
analyzer" pill. That fallback is what disguised the bug as legitimate output.

### Types in `lib/api.ts`

The transaction and transaction-detail wash shapes gain `confidence`,
`headline`, `sourcePayTo`, `reason`, `evidenceUrl`. `signals` stays but is
junk-free. The `/wash` dashboard fetch types gain the separate counterparty
field.

---

## Data flow

```
wash_*.signals  (JSONB, untouched in the database)
        |
        v
  resolveWashEvidence(signals, wash_label, wash_score)   <- dexter-api, ONE pure function
        |   - filters reasons / source_payto out of the analyzer list
        |   - picks grade: curated > forensic > propagated
        |   - forensic strength via the derived analyzer-strength map
        |   - returns { confidence, headline, signals[], sourcePayTo, reason, evidenceUrl }
        v
  +------------------+----------------------+-----------------------+
  | list endpoint    | detail endpoint      | aggregate queries     |
  | (row pills)      | (WashEvidenceSection)| (volume / dashboard)  |
  +------------------+----------------------+-----------------------+
        |                    |                      |
        v                    v                      v
  text tag, graded     full graded evidence    wash = curated+forensic;
  + row links to       section, curated link,  propagated-only -> separate
  /transactions/[hash] propagated note         counterparty stat
```

Every surface routes through the same `resolveWashEvidence`. One classifier,
no divergence.

---

## Error handling

Degrade honestly, and never fabricate.

- An unrecognized analyzer id that reaches the frontend renders **nothing**,
  never a fabricated "Unknown analyzer" pill. This is the root-cause fix: the
  old fallback invented legitimacy for bad data.
- `signals` JSONB null or empty: no wash UI, no pill. Absence shows as absence.
- A row has a `wash_label` but zero usable signals after filtering: show the
  top-line verdict from `wash_label`, no per-signal cards, an honest "no
  analyzer detail recorded" line.
- A curated finding with `verdict='clean'` is already a no-op in
  `curated-findings.ts`. `resolveWashEvidence` respects it, so a clean curated
  ruling is never rendered as wash.

---

## Testing

### dexter-api

- **Unit tests for `resolveWashEvidence`.** This is the module that did not
  exist, so the bug shipped. Fixtures for every case: curated; each forensic
  strength (dispositive, strong, medium, weak); propagated-only; the mixed case
  (forensic + propagated must resolve `forensic`); empty / null signals. This
  is where the `R` regression is locked out permanently.
- **Aggregate test.** A synthetic recipient with N forensic senders and M
  propagated-only senders: wash count resolves to N, counterparty count to M.
  Proves 3b does not miscount.

### x402gle

- Following the existing `combiner.test.ts` pattern: a render test that a
  propagated row shows "Paid a flagged wallet" in neutral styling, never a bare
  letter, never the red wash treatment.

### Manual verification (real data, not "got a 200")

- After deploy, pull a known propagated transaction and a known forensic
  transaction through both the list and detail endpoints. Confirm the JSON
  carries the correct `confidence` / `headline` / `sourcePayTo`.
- Open `/transactions/<hash>` for a transaction touching the AISA operation. It
  must show "Confirmed wash" and a working link to
  `dexter.cash/research/aisa-x402-wash`.
- For 3b: record a sample server's wash percentage before the change. After,
  confirm it moved in the expected direction (propagated-only volume peeled
  out) and that curated + forensic wash volume did not change.

### PM2

After each build, restart the process. Neither change is live until restart:

```
pm2 restart dexter-api --update-env
pm2 restart x402gle --update-env
```

---

## Files

### dexter-api

- Create: `src/x402gle/wash-detection/wash-evidence.ts`, holding
  `resolveWashEvidence` and the derived analyzer-strength map.
- Create: `src/x402gle/wash-detection/__tests__/wash-evidence.test.ts`.
- Modify: `src/x402gle/routes/transactions.ts`, for the junk-key filter in the
  four `jsonb_object_keys()` blocks, `buildWashReason` delegating to
  `resolveWashEvidence`, and the detail endpoint using it too.
- Modify: `src/x402gle/wash-detection/tagger.ts`, where
  `computeVolumeBreakdown` gains the `counterparty` bucket.
- Modify: the `/wash` dashboard queries (the handlers behind `fetchWashSummary`,
  `fetchWashServers`, `fetchWashFacilitators`), where wash numerators become
  curated + forensic and counterparty is returned separately.
- Investigate, then modify if needed: `src/services/ranking/`, to ensure a
  propagated-only signal does not feed the gaming factor.

### x402gle

- Modify: `src/components/live-settlements.tsx`, where the buyer-side pill
  becomes a graded text tag.
- Modify: `src/components/wash/analyzer-pill.tsx`, to delete `variant="compact"`.
- Modify: `src/components/wash/analyzers.ts`, to fix the `analyzerMeta` fallback
  so it renders nothing for unknown ids, and add the shared
  `confidence -> display` helper (or a sibling module).
- Modify: `src/components/wash/wash-evidence-section.tsx`, to consume the graded
  shape, render the curated evidence block and propagated counterparty block,
  and remove raw code identifiers.
- Modify: `src/lib/api.ts`, to extend the transaction, transaction-detail, and
  `/wash` fetch types with the new fields.
- Possibly modify: `src/components/wash/wash-dashboard.tsx` and the `/wash`
  page, to display the separate counterparty statistic without a redesign.

---

## The principle this encodes

The wash system is genuinely advanced. That depth is worthless if the surface
cannot convey it: a one-letter `R` is the proof of that. This design keeps the
system advanced internally and makes the surface speak plain human language.
And it draws one hard line. Propagation, the one mechanism that spreads a
verdict from wallet to wallet, is allowed to spread information and never blame.
"Paid a flagged wallet" accuses no one, and wash percentages count only
evidence about the wallet itself.
