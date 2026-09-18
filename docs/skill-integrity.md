# Skill capability integrity

dexter-mcp ships five agent-facing skills (`skills/<slug>/SKILL.md`) plus the
repo-level `AGENTS.md` conventions file. Today one mechanism tracks them:

- **`skills-lock.json`** — records *where* a skill came from (`source`,
  `sourceType`) plus a one-time content hash. It covers one of the five skills
  (`pay`), and nothing regenerates or verifies it.

So a skill edited **after** admission — an added exfiltration endpoint, a new
credentialed call — passes every existing check silently. For a payments MCP
server, that post-admission edit is the classic supply-chain **rug pull**, and
the blast radius is an agent that authorizes money movement.

`ci-skill-integrity` closes that gap with [eyebrow](https://github.com/alexverify/eyebrow),
a content-addressed integrity engine — and does it **without** becoming a gate
that fires on every edit.

## What it gates on (and what it deliberately doesn't)

`eyebrowlock.json` fingerprints every skill in the catalog — including the
symlinked `skills/pay` (single source at `.agents/skills/pay`, also exposed at
`.claude/skills/pay`) and `AGENTS.md`: a canonical content hash over the whole
skill directory (references included) **and** its declared egress — the set of
hosts the skill reaches from a network-call line (`curl`, `wget`, `WebFetch`).
On every PR that touches a skill, the
[`ci-skill-integrity`](../.github/workflows/ci-skill-integrity.yml) workflow
re-derives that fingerprint and, per [`eyebrow.policy.json`](../eyebrow.policy.json),
fails the build **only** when an artifact:

- **gains a new egress host** vs the lockfile (`failOnCapabilityExpansion`), or
- introduces a **new critical finding** (`failOnSeverity: critical`).

It **does not** fail on a skill's wording changing (`allowContentDrift: true`).
Prose edits, refactors, and doc updates that keep the same reach are *reported*
but pass. This is deliberate: these skills are edited routinely, and a gate
that fired on every byte would be forced off within a week.

One property specific to this catalog makes the gate unusually sharp: **every
skill's egress set is currently empty** — the skills instruct agents to call
MCP tools, not raw endpoints. So *any* first URL appearing on a call line in
any skill trips the gate. There is no allowlist to hide inside.

**Scope, honestly:** the egress parser is line-based and host-granular. It
catches the common rug-pull shape — a new endpoint appearing on a call line.
It does **not** catch a URL split across lines, one assembled from shell
variables, or a new *path* on an already-listed host; those remain reviewer
territory. Treat this gate as defense-in-depth, not a bash parser.

This **complements** `skills-lock.json` — provenance (where a skill came from)
stays there; integrity (whether it changed, and whether its reach grew) lives
in `eyebrowlock.json`, regenerated and enforced on every relevant PR.

## Recorded baseline findings

`eyebrow scan` also runs static analysis, and the lockfile records the current
findings as the accepted baseline — the gate fails only on **new** critical
findings, so these do not fail builds:

- `skills/opendexter/SKILL.md` — three high-severity pattern matches
  (PROMPT-INJECTION ×2, WALLET-THEFT ×1). All three match **protective**
  text: the skill's own rules forbidding exposure of bearer tokens, private
  keys, and seed phrases, and its instruction-confirmation policy. The
  patterns flag the vocabulary, not misbehavior — the same false-positive
  shape eyebrow documents for guardrail passages.
- `AGENTS.md` — one high-severity SENSITIVE-PATH-READ match, again on a
  protective classification passage.

If a future edit introduces a *new* critical finding, the gate fails; anything
below stays advisory and visible in the eyebrow output.

## Refreshing the lockfile

When a skill legitimately changes its reach, regenerate the fingerprint in the
**same PR**:

```bash
# one-time: install eyebrow (see github.com/alexverify/eyebrow/releases)
eyebrow scan --path . --lockfile eyebrowlock.json
git add eyebrowlock.json
```

The diff on `eyebrowlock.json` shows exactly which skill's reach changed,
reviewed alongside the skill change itself. A skill that adds a new egress
host with no matching lockfile update is what the gate rejects. A skill added
without any lockfile entry is rejected by the coverage step before eyebrow
even runs.

## Scope

v1 fingerprints the first-party skill catalog and `AGENTS.md`: content hash +
network egress. Exec and filesystem capabilities, lockfile signing, and a
findings threshold below critical can be layered on later purely in
`eyebrow.policy.json`, without changing this workflow.
