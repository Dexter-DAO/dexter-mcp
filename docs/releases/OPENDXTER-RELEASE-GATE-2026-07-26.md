# OpenDexter release gate — 2026-07-26

Status: **local candidates complete; live paid release blocked by the
cross-obligation conservation P0 described below. Nothing has been merged,
pushed, deployed, restarted, or live-proven.**

This receipt defines one reviewed OpenDexter release train across the facilitator,
API, and hosted MCP. It does not authorize production changes.

## New captain P0 disposition

The provisional A3 packet
`CAPTAIN-PACKET-A3-DEXTER-WALLET-FIRM-AND-CASHFLOW-RECOURSE-2026-07-26.md`
identifies a deployment-matched state in which Line repayment can spend USDC
reserved for a Pending LockedClaim. The inverse race can also consume cash that
Line currently treats as recourse.

Read-only reconciliation against this release found the same unresolved class
on the hosted exact path:

- API exact payment checks a live MCP binding, the per-call ceiling, the daily
  agent cap, and the agent-spending revocation state.
- It does not read or subtract `outstanding_locked_amount`, Line debt/recourse,
  or a protected operating floor before constructing and dispatching payment.
- The facilitator exact builder enforces the agent-spending gate and Swig
  transaction boundary, but it does not enforce a shared claim/Line reserve.

The auth, transport, error, and tool-contract improvements remain valid. The
combined paid release is nevertheless **NO-GO** until A3/Branch ratifies one
priority law and the relevant money paths enforce it. No current debtor or
current harmed user has been established, so this is a clean containment
window—not evidence of a live loss.

## Canonical local candidates

| Layer | Branch | Commit | Current production source baseline |
| --- | --- | --- | --- |
| Facilitator | `codex/opendexter-exact-incident-facilitator-2026-07-26` | `81379747d483bab72c956b004786e5800c10683a` | `fcaba164128e427f12e81a35b59ce3a58a9d71a6` |
| API | `codex/opendexter-release-api-2026-07-26` | `38d23a6446a786b0a031ef5d7d9049569bb22b10` | `5b31b11397ac6f199924ec5124b0f05632a5d432` |
| Hosted MCP (A3 release base) | `codex/opendexter-release-mcp-2026-07-26` | `aa400f5ac41209f0ffd3b979277abcab0dc103e0` | `322425cc5958c825a4bfba289a557862e22e3d10` |

This B3 source reconciliation is based exactly on
`2068e6b96846d8ef3ea793972546cd5495f575a4`, a descendant of the A3 release
base and receipt. Its exact reconciliation commit is recorded in the external
handoff issued after commit creation.

The production-source baselines are rollback source references, not proof of the
exact JavaScript already loaded by PM2. Before a live change, capture PM2
configuration and hashes or archives of the currently running build artifacts.

## Included behavior

### Facilitator

- Canonical x402 v2 exact envelope and memo.
- Exact signer-slot validation.
- Active Swig v2 foreign-sponsor boundary.
- Hard per-vault agent-spending gate before exact construction.
- A retry only for an explicitly pre-payment transient RPC failure.

### API

- Stored-Swig, session-bound portfolio reads with revocable OAuth binding.
- Dynamic approved-asset artwork.
- Standard `scope=vault` token issuance and fail-closed validation.
- Required caller-approved `maxAmountAtomic`.
- Replay ownership claimed before payment work; canonical URL identity prevents
  fragment and alias replay bypass.
- HTTPS-only, DNS/IP-pinned external access with controlled redirects and
  aggregate multipart bounds.
- Definitive settlement evidence; a seller 2xx alone is not payment proof.
- An ambiguous post-dispatch result remains nonretryable and retains replay and
  reserve protection.
- Secret-safe structured logging.

### Hosted MCP

- Mixed per-tool authorization for the stable connector: public
  discovery/inspection paths remain available without a Dexter account,
  while wallet data, portfolio data, and payment use native OAuth
  `scope=vault`.
- Per-request issuer, audience, expiry, scope, subject, and surface validation
  on every vault-protected call.
- Session-bound wallet and portfolio resolution through the stored passkey-vault
  identity. Neither protected tool accepts a caller-supplied wallet address or
  user handle.
- Exact six-tool executable contract, generated manifest, tool-list parity,
  and cards-off surface.
- Required payment ceiling through text and widget paths.
- Correct wallet receive-address semantics.
- Credential scrubbing and private widget metadata.
- Per-widget CSP, public-probe size limits, upload confinement and aggregate
  limits.
- Self-contained hosted instructions and skills using native Connect; no
  retired pairing URL or enroll-link relay.
- Truthful free, merchant-rejected, build/discovery-failed, and
  ambiguous-settlement results.

## Deliberate live tool roster

1. `x402_search`
2. `x402_check`
3. `x402_fetch`
4. `x402_access`
5. `x402_wallet`
6. `dexter_portfolio`

The six Dextercard tools in the older sixteen-tool package are not part of this
release. Sensitive card controls remain on the secure Dexter Wallet web surface.

## Reconciled and deferred lineages

- B3 auth source `183609b9c840abfa7ba6672b8496e72799924d60`
  is included as `c427930`, then tightened by `f4eca83`.
- Portfolio/artwork head `023f7fd527173c9e0dca8c82f97f2f73f83fdd6f`
  is included.
- B3 purchasing-parity and governed-asset work is included from `fdcbb16`
  through `2068e6b`. It preserves the selected mode, offer, route, ceiling, and
  prepared identity; rejects post-dispatch fallback; and exposes
  `dexter_portfolio` as a strict read-only, session-bound contract. The shared
  API remains the sole producer/executor—this MCP lineage does not add another
  money or portfolio backend.
- Hosted runtime pins `@dexterai/mcp-instructions@2.4.0`, sourced from
  `opendexter-ide` release-candidate commit
  `49805e9cd7894e982d8e6227af1e98e0ccd1d05e`. Local validation consumes that
  exact built package. The coordinated source train is
  `@dexterai/x402-core@1.5.0`, `@dexterai/mcp-instructions@2.4.0`, and
  `@dexterai/x402-mcp-tools@0.8.0`. The integrated source proof pins MCP SDK
  `1.29.0`, MCP Apps extension `1.6.0`, and Zod `3.25.76`. The prior npm lock
  claimed unpublished package versions without registry integrity and locked
  an SDK below `@modelcontextprotocol/ext-apps`' peer floor, so it was removed
  rather than blessed as release evidence.
  `release/opendexter-dependency-train.json` and
  `scripts/verify-open-release-dependencies.mjs` now verify Git subtree
  provenance, source-link destinations, a workspace-aware registry lock, exact
  installed versions, built entrypoints, and npm peer closure. The
  Studio-only Claude SDK and Zod 4 dependency are isolated under
  `scripts/studio-runtime`; they are not part of the hosted MCP graph.
  Deployment fails closed until publication, a real npm lock, `npm ci`, and
  installed-runtime verification are complete.
- MCP productization head
  `24530fa23bf1b8acac410d48d3acc41923c52d82` was not merged wholesale.
  Payment ceilings, network boundaries, upload bounds, redaction, runtime
  contracts, CSP, and skill parity were selectively reconciled. Its legacy
  pairing path and sixteen-tool/card assumptions are superseded for hosted MCP.
- API productization head
  `229157a8cf90c73b1e0125c95852960c61d6bc7f` was not merged wholesale.
  Relevant exact-payment protections were reimplemented on current main
  lineage without replacing the current CrossPay route.
- C3 CrossPay health commit
  `264941a0ca00159964760e8aec5b22d9ccfad181` is not included. CrossPay and
  auto-refill remain dark. Its conservation work needs a later hand merge after
  the approved ceiling and before float, RPC, reserve, or broadcast work.
- `opendexter-ide` main
  `bba74199ccdc530e074cefc8a272f4b72b022d2b` and productization head
  `a2afb48f53eff39c7f55e4c3f7c0b1b9115d85ae` are not release inputs.
  Codex and Claude plugin packaging, clean-install discovery, distribution, and
  authentication proof remain a separate follow-up.

## Semantic resolutions

- Connector/resource identity remains `https://open.dexter.cash/mcp`.
- OAuth authorization-server identity remains `https://mcp.dexter.cash/mcp`.
- Token issuer remains `https://dexter.cash`.
- A Dexter agent session key is an authority inside Swig; it is not the owner of
  the vault USDC token account. External facilitators must validate the Swig
  invocation rather than treating the session key as a plain token owner.
- Missing `smartWalletSupported` metadata means unknown, not unsupported.
  Explicit false may fail before dispatch; absence cannot block a payment.
- User-approved maximum amount is required for every consequential pay/fetch
  path.
- No automatic retry is allowed after a payment may have been dispatched.
- A generated cache or plugin bundle does not define the live hosted roster.

## Local verification

- API: 15 suites / 172 tests; strict TypeScript; prebuild anonymous-session
  invariant; diff check; independent integration review found no blocker.
- Facilitator: 28 focused tests; full build; diff check.
- Hosted MCP release candidate: 314/314 Node tests in the exact disposable
  source graph; focused strict TypeScript; x402 core build; source-provenance,
  installed-version, and targeted npm-closure gates; direct non-deploying Vite
  7.1.12 build of 2,029 modules; diff check.
- The release runtime is pinned to Node `^20.19.0 || >=22.12.0`, matching the
  Vite 7.1.12 engine contract, and is checked before install or build.
- The source graph pins MCP SDK 1.29.0, MCP Apps extension 1.6.0, and Zod
  3.25.76. The raw checkout deliberately has no release lock or installed
  graph, so ambient parent `node_modules` is not accepted as release evidence.

These are local results, not live compatibility proof.

## Known external exact-payment issue

CoinGecko advertises a Coinbase-facilitated Solana exact requirement. A
Dexter-built proof reached Coinbase verification and was rejected before
settlement as `preflight_validation_failed`. The transaction invokes active
Swig v2 (`swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB`); it does not invoke
the Dexter Vault program. Adding Dexter Vault to an allow-list would therefore
not fix this exact path.

Upstream x402 added optional smart-wallet verification in
[PR 1527](https://github.com/x402-foundation/x402/pull/1527), followed by active
Swig v2 support in
[PR 2509](https://github.com/x402-foundation/x402/pull/2509). The remaining
evidence points to Coinbase's hosted configuration/version or another opaque
verifier preflight. This release makes the rejection truthful and nonretryable;
it does not claim to make Coinbase accept Swig. SYRAA is the control path
because it uses Dexter's facilitator and has settled from the same vault
architecture.

## Live release gates

Before production:

1. Ratify the LockedClaim/Line/agent-spend priority and conservation law.
2. Enforce and test that law on every relevant outflow; at minimum, hosted
   x402 spending must fail closed when the requested amount exceeds
   reservation-aware available cash.
3. Preserve the dirty production checkouts and capture exact running artifact
   hashes plus PM2 configuration.
4. Resolve the API checkout collision without overwriting the uncommitted
   wallet-transfer activity work.
5. Run `npm run verify:release:runtime`, publish the exact internal package
   train, generate a workspace-aware, registry-resolved npm lock with
   integrity, run `npm ci`, build the hosted workspace package, and pass
   `npm run verify:release:installed`.
6. Approve a short OpenDexter payment maintenance window.
7. Make the payment surface unavailable, then deploy in this order:
   facilitator, API, hosted MCP. The repository command is not an atomic
   multi-service activation or health proof; retain the captured rollback
   artifacts until every post-deploy check passes.
8. Verify both protected-resource metadata paths advertise
   `https://mcp.dexter.cash/mcp`; verify the linked authorization-server
   metadata advertises issuer `https://mcp.dexter.cash/mcp`; separately verify
   issued vault JWTs carry `iss=https://dexter.cash` and are accepted under
   that token contract.
9. Prove fresh ChatGPT Connect/DCR, existing-wallet binding, new-wallet
   enrollment, token refresh, same-session OAuth seeding, and wallet-ready
   rendering.
10. Regress the currently working Claude existing-wallet path.
11. After a fresh price check and explicit amount approval, run one tiny SYRAA
   payment with an exact `maxAmountAtomic`.
12. After its own fresh price check and explicit amount approval, run one tiny
    Coinbase/CoinGecko attempt with exact `maxAmountAtomic`. Verify either a
    truthful nonretryable pre-dispatch rejection with no funds moved or
    definitive settlement evidence if external support has changed.
13. Verify ChatGPT and MCP Apps render both successful and rejected receipts.
14. Confirm the live tool list is exactly the six tools above and contains no
    card tools.

Do not reopen the payment surface if any gate fails.

## Rollback

Keep the payment surface unavailable. Roll back in reverse application order:
hosted MCP to `322425cc`, API to `5b31b113`, then facilitator to `fcaba164`.
Restore the captured pre-release build artifacts and PM2 definitions, restart
only those three services, and repeat the read-only OAuth/tool-list/wallet
checks. Do not reopen the old exact stack merely because the processes are
online; the previous stack retains the payment-boundary defects this release
is intended to close.
