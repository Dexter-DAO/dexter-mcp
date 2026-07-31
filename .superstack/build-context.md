# Build context

```yaml
review:
  security_score: B
  quality_score: A
  ready_for_mainnet: false
  findings:
    - severity: resolved-critical
      category: release-graph-integrity
      description: The prior release receipt claimed Vault 0.43.0, but package.json and the registry lock still selected Vault 0.37.3.
      fix: Pin the root dependency and release manifest to exact Vault 0.43.0, regenerate the npm lock from the published registry artifact, and require the lock and installed-runtime gates to prove that exact graph.
    - severity: inherited-high
      category: supply-chain
      description: npm currently reports inherited advisories across the existing x402, Solana, wallet-connect, Apps SDK UI, and MCP SDK dependency trees; the Vault path includes bigint-buffer and Solana Web3 advisories.
      fix: Keep this exact lock for the coordinated release, then separately upgrade MCP SDK to a compatible patched line and qualify newer x402, Solana, and wallet-connect dependency closures under the full money-path suite. Do not apply npm audit fix force to this release candidate.
    - severity: release-gate
      category: production-activation
      description: Local source and installed closure do not prove immutable PM2 activation or live OAuth and payment health.
      fix: The captain must install the exact committed lock into the immutable release, start it with the external owner-only env contract, verify both local health endpoints and exact process command lines, then save PM2 only after post-start checks.
```

## Scope reviewed

- exact root and transitive closure for `@dexterai/vault@0.43.0`;
- workspace-aware registry lock and installed dependency closure;
- release manifest parity and fail-closed verifier regression;
- hosted Node tests, workspace tests, strict release typecheck, runtime build,
  and non-deploying Apps SDK build; and
- production boundary: no publish, deployment, PM2 mutation, signing, or money
  movement.

## Current receipts

- OpenDexter runtime, registry-lock, and installed-runtime gates passed.
- Hosted Node suite: 350 tests, 349 passed, 1 skipped, 0 failed.
- x402 skills: 9 files and 52 tests passed.
- x402 core: 16 Vitest tests and 3 Node tests passed.
- Strict open-release TypeScript check passed.
- x402-core ESM/declaration build and local Apps SDK production build passed.
- Installed closure deduplicates root and x402 peer use to exact Vault 0.43.0.

The corrected MCP candidate is locally coherent. It is not a production-state
claim; publication is unnecessary because this repository is private, and
immutable deployment remains owned by the captain.
