// Contract fixtures for T4-5b — rail-tab offer rendering in the open-mcp relay.
//
// Shapes are VERBATIM from the fixed Response contract in
// dexter-fe/docs/superpowers/plans/2026-07-05-t4-rail-custodied-tabs.md
// ("Response contract (fixed NOW so T4-5b can build against fixtures)").
// dexter-api does not emit these yet — the relay ships first behind a
// mode-gate, so these fixtures ARE the contract until the api side lands.

export const CONTRACT_HEADLINE =
  'This seller supports a running tab: approve once, then payments stream without per-call approvals.';

export const CONSENT_LINK =
  'https://dexter.cash/tabs/new?req=eyJhcHAiOiJEZXh0ZXIiLCJjYXAiOiI1MDAwMDAwIn0&rid=0f1e2d3c-4b5a-4978-8695-a4b3c2d1e0f9';

export const SELLER_PAY_TO = '7sELLerPayToXk9qwWmVYzGnR4uJcD2fHbA1tN8pQe5M';

// ── 1. Dual-rail seller, no active rail tab: exact paid AND offer attached (200)
export const dualRail200WithOffer = {
  ok: true,
  paid: true,
  status: 200,
  data: { tick: 42, at: '2026-07-05T18:00:00Z' },
  payment: {
    settlement: {
      signature: '5KtP9nQvWxYzR3mJcD2fHbA1tN8pQe5M7sELLerPayToXk9qwWmVYzGnR4uJ',
      amountAtomic: '10000',
    },
  },
  vault: { vaultPda: 'Vau1tPdaXk9qwWmVYzGnR4uJcD2fHbA1tN8pQe5M7sEL' },
  railTabOffer: {
    mode: 'tab_available',
    consentLink: CONSENT_LINK,
    seller: SELLER_PAY_TO,
    perUnitAtomic: '10000',
    message: CONTRACT_HEADLINE,
  },
};

// ── 2. Tab-only seller, no active rail tab (402): offer replaces the bare
//      no_exact_scheme_accept relay ONLY because a tab-scheme accept exists.
export const tabOnly402ConsentRequired = {
  httpStatus: 402,
  body: {
    ok: false,
    error: 'tab_consent_required',
    railTabOffer: {
      mode: 'tab_available',
      consentLink: CONSENT_LINK,
      seller: SELLER_PAY_TO,
      perUnitAtomic: '10000',
      message: CONTRACT_HEADLINE,
    },
  },
};

// ── 3. Pending consent (approved-but-unverified): honesty state, no re-prompt.
export const tabPending402 = {
  httpStatus: 402,
  body: {
    ok: false,
    error: 'tab_consent_required',
    railTabOffer: {
      mode: 'tab_pending',
      seller: SELLER_PAY_TO,
    },
  },
};

// ── 4. TODAY'S behavior, no offer object (regression: byte-identical relay).
//      This is the live failure shape from tab-demo 2026-07-05 (dexter-api
//      2638b41c): tab-only seller, api still on the pre-T4 code path.
export const legacy402NoOffer = {
  httpStatus: 402,
  body: {
    ok: false,
    error: 'no_exact_scheme_accept',
    message: 'No Solana accept with scheme exact on this endpoint.',
    requirements: {
      accepts: [
        {
          scheme: 'tab',
          network: 'solana',
          payTo: SELLER_PAY_TO,
          maxAmountRequired: '10000',
        },
      ],
      x402Version: 2,
    },
  },
};

// ── 5. Unknown future mode: must render as today's fallback (mode-gate).
export const unknownMode402 = {
  httpStatus: 402,
  body: {
    ok: false,
    error: 'tab_consent_required',
    railTabOffer: {
      mode: 'tab_supersonic',
      consentLink: CONSENT_LINK,
    },
  },
};
