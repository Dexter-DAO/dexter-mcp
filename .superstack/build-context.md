# Build context

```yaml
review:
  reviewed_commit: f83e5cb
  security_score: A-
  quality_score: A
  ready_for_mainnet: false
  findings:
    - severity: resolved-critical
      category: release-activation
      description: The former hosted deployment command rebuilt mutable checkout state and used PM2 startOrReload without an atomic two-service identity proof or exact rollback.
      fix: Commit f83e5cb builds one sealed immutable candidate, deletes and starts the exact two named processes, proves PM2, kernel, health, roster, release, and saved state, and restores the exact prior pair on any mismatch.
    - severity: resolved-high
      category: supply-chain-provenance
      description: Descriptor and dependency evidence previously consumed mutable checkout files and ignored node_modules after attesting only Git identity.
      fix: Materialize from a disposable archive of the reachable canonical Git commit, use the exact lock and reviewed Node/npm build, reject dirty or hidden index state and loader/archive injection, and compare the complete finalized descriptor.
    - severity: resolved-high
      category: restart-and-rollback
      description: Earlier saved-state proof did not bind every protected environment value or durable PM2 restart control and did not prove each prior service was independently restartable.
      fix: Hash the complete declared environment, bind the complete durable PM2 definition, re-read the protected file before deletion and after candidate save, and prove both prior sealed releases, entrypoints, interpreters, environment files, saved definitions, and restored health.
    - severity: operational-blocker
      category: legacy-production-migration
      description: The currently deployed legacy v1 PM2 pair lacks the v3 release and environment evidence required by the new independently-restartable-prior proof.
      fix: Keep activation fail-closed. Under separate release authority, migrate the existing pair to a sealed, provably restorable v3 identity before attempting the new transactional cutover.
    - severity: release-gate
      category: paired-runtime-and-descriptor
      description: Paired API candidate e41d77b is not independently accepted and the final hosted descriptor is deliberately absent.
      fix: Accept the exact paired API contract first, generate and verify the descriptor from immutable source, then perform package, plugin, activation, and ordinary-language novice acceptance as separately authorized release steps.
```

## Scope reviewed

- dedicated governed-money service secret and startup refusal;
- immutable Git-archive descriptor and release construction;
- exact dependency, source, runtime, and installed-graph provenance;
- sealed release identity and full file-manifest verification;
- transactional two-process PM2 activation, saved/live preservation, rollback,
  and direct-autorestart proof; and
- production boundary: no push, publish, install, deployment, PM2 mutation,
  signing, live API call, or money movement.

## Current receipts

- Independent behavioral review: accepted with no remaining P0/P1 objection.
- Independent scope review: accepted with no unrelated bytes or exclusions.
- Release-focused suite: 103 passed, 1 intentional external-source skip,
  0 failed.
- Full MCP suite: 467 passed, 1 intentional skip, 0 failed.
- Strict open-release TypeScript, Node runtime, registry lock, installed graph,
  syntax, and diff gates passed.
- `release/open-tool-descriptors.json` remains absent pending paired API
  acceptance.

## Prior release-graph receipt retained

The earlier Vault 0.43 review established the exact internal dependency-train
pattern and identified inherited transitive advisories. Commit `fd07650` now
removes the unused legacy x402 browser-wallet graph (455 packages removed, none
added), while the remaining Solana/runtime transitive modernization stays a
separate compatibility-qualified task rather than a forced audit rewrite.

Commit `f83e5cb` is a clean source candidate, not a deployment or live-product
claim. The next release step is the separately authorized legacy-to-provable
PM2 migration, followed by paired API acceptance and immutable descriptor/package
proof.
