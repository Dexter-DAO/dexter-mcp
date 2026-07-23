# Wallet widget — chosen design direction (board #95 / #71)

`wallet-widget-B-calm-home-sheets.html` is the **approved visual spec** for the
rebuilt x402_wallet renderer. Branch chose it Jul 23 2026 ("B looks really good…
as long as the finished product looks just like that I will be very happy"),
from three rendered directions (Billfold / Calm Home + Sheets / Console).

**Direction B — Calm Home + Sheets:** a serene home (one "You can spend" number,
the card, four quiet verbs — Deposit / Card / Agents / Activity, one recent line),
where every capability lives one gesture below it in a single-purpose bottom sheet
that rises over the dimmed home. Only one sheet up at a time = full power, calm
surface. Fonts: Inter Display + Inter + JetBrains Mono (tabular money). Non-custodial
truth in the masthead ("Held by your passkey").

## This is the target the build must match

The finished renderer must look like the .png. Treat the mockup as the spec.

## Build-time fixes (mockup is a static reference, not production)

- **Money math**: the mockup headline ("You can spend $661.44") does not reconcile
  with its own breakdown (Yours $1,034.50). The real renderer wires spendable from
  the server's actual spendingPower/credit/earning fields (already emitted — see the
  autopsy AUTOPSY-wallet-renderer-2026-07-23.json). Get the arithmetic honest.
- **Deposit sheet**: cash onboarding is first-class — MoonPay (debit/Apple Pay) +
  Coinbase, then receive-crypto (address + QR). Activation is invisible / Dexter pays
  the network fee — never a dead-end (the fe activate button is a buried dead-end; see
  board #95 deposit reality check).
- **Card face**: the three real themes (cardThemes.ts orange/obsidian/moonagents),
  masked PAN, Freeze on-card, tap-to-reveal fetches real numbers into the frame via a
  single-use URL — never model-visible, no card tool.
- **Mark**: the Dexter Wallet lockup (assets/brand/dexter-wallet/), NOT the fingerprint
  VaultMark.
- Inherit the proven pipeline (Vite multi-entry, content-hash ui:// URIs, dual-runtime
  ChatGPT + MCP-Apps bridge) — this is a presentation-layer rebuild only.

## Constraints that bind the build

Full registry: dexter-thesis/AUTOPSY-wallet-renderer-2026-07-23.json (constraints
section) + board #95/#71/#94. Highlights: CSP must be final before the OpenAI
submission scan; mobile renders in a native WebView; both widget formats (openai/* +
ui.*) stay on the descriptor; must not preclude tap-to-pay v2; anti-slop visual
kill-list (no eyebrow labels, no gradient text, no dashed dividers, no single-side
accent stripes, 0-2 design moves per view).
