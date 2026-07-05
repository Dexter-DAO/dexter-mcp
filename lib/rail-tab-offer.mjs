// Rail-tab offer rendering for the open-mcp relay (T4-5b).
//
// When dexter-api starts emitting `railTabOffer` objects on the anon pay
// routes (contract FIXED in dexter-fe/docs/superpowers/plans/
// 2026-07-05-t4-rail-custodied-tabs.md), the relay renders an in-band offer
// in the same funnel family as buildVaultRequired: human outcome copy, one
// tap action, honest pending state.
//
// MODE-GATE (the load-bearing safety property): this module deploys BEFORE
// the dexter-api side ships. An absent, unknown-mode, or malformed offer MUST
// return the caller's `legacy` response object UNTOUCHED — same reference,
// byte-identical output. `applyRailTabOffer` never mutates `legacy`.
//
// COPY LAW (plan Global Constraints "Copy" — iPhone, not Android): the
// `message` fields below are relayed verbatim to humans. They speak outcomes.
// The words voucher/scheme/session/counterparty/cumulative/crystalliz*/x402
// never appear in them; mechanics stay in the structured fields. Tool names
// inside model-directed `instructions` follow the existing buildVaultRequired
// convention ("re-run this exact x402_fetch").

// Reference headline from the fixed contract — used when dexter-api's offer
// omits its own message.
export const RAIL_TAB_HEADLINE =
  'This seller supports a running tab: approve once, then payments stream without per-call approvals.';

export const RAIL_TAB_PENDING_MESSAGE =
  'Your tab with this seller is almost ready — approval detected, finishing setup. Try this call again in a moment.';

const KNOWN_MODES = new Set(['tab_available', 'tab_pending']);

/**
 * Pull a *renderable* offer out of a dexter-api response body. Anything that
 * is not exactly one of the contract shapes returns null — that is the mode
 * gate. Unknown future modes deliberately fall through to today's behavior.
 */
export function extractRailTabOffer(anonBody) {
  if (!anonBody || typeof anonBody !== 'object') return null;
  const offer = anonBody.railTabOffer;
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
  if (!KNOWN_MODES.has(offer.mode)) return null;
  return offer;
}

function consentUrlOf(offer) {
  return typeof offer.consentLink === 'string' && offer.consentLink.length > 0
    ? offer.consentLink
    : null;
}

function headlineOf(offer) {
  return typeof offer.message === 'string' && offer.message.length > 0
    ? offer.message
    : RAIL_TAB_HEADLINE;
}

function buildRetry(call) {
  const retry = {
    tool: 'x402_fetch',
    url: call.url,
    method: call.method || 'GET',
    body: call.body ?? null,
  };
  if (call.multipart) retry.multipart = call.multipart;
  return retry;
}

// Offer block appended to a SUCCESSFUL paid response. Purely additive — the
// paid data was already delivered; this is the optional faster lane.
function buildOfferBlock(offer) {
  if (offer.mode === 'tab_pending') {
    return {
      mode: 'tab_pending',
      seller: offer.seller ?? null,
      message:
        'Your tab with this seller is almost ready — approval detected, finishing setup. ' +
        'Once ready, payments to this seller go through without approval taps.',
      instructions:
        'This call succeeded and is already paid — nothing more is needed for it. ' +
        'The user already approved their tab with this seller; do NOT show another approval link. Setup finishes on our side.',
    };
  }
  return {
    mode: 'tab_available',
    consent_url: consentUrlOf(offer),
    seller: offer.seller ?? null,
    perUnitAtomic: offer.perUnitAtomic ?? null,
    message: headlineOf(offer),
    instructions:
      'This call succeeded and is already paid — nothing more is needed for it. ' +
      'Optional, only if the user wants it: approving the running tab at consent_url means future calls to this seller ' +
      'go through without approval taps.',
  };
}

// Offer-AS-response for a call that could not be paid (tab-only seller, no
// active tab): the consent link is the one tap action, and `retry` preserves
// the exact call so the agent resumes after approval.
function buildTabAvailableResponse({ legacy, offer, consentUrl, call }) {
  return {
    status: legacy?.status ?? 402,
    mode: 'tab_available',
    paySource: 'anon_vault',
    next_action: 'show_consent_link',
    consent_url: consentUrl,
    seller: offer.seller ?? null,
    perUnitAtomic: offer.perUnitAtomic ?? null,
    retry: buildRetry(call),
    message:
      headlineOf(offer) +
      " Approve it from the link below and I'll complete this call automatically.",
    instructions:
      'Show the user consent_url and ask them to approve the running tab with this seller (one tap). ' +
      'Once they approve, re-run this exact x402_fetch (see retry) — it completes without another approval.',
    reason: 'tab_consent_required',
    requirements: legacy?.requirements ?? null,
  };
}

// Honesty state: the approval happened, activation is still verifying. No
// consent link here — re-prompting an already-approved user is a lie.
function buildTabPendingResponse({ legacy, offer, call }) {
  return {
    status: legacy?.status ?? 402,
    mode: 'tab_pending',
    paySource: 'anon_vault',
    retryable: true,
    seller: offer.seller ?? null,
    retry: buildRetry(call),
    message: RAIL_TAB_PENDING_MESSAGE,
    instructions:
      'The user already approved their tab with this seller — do NOT show another approval link. ' +
      'Setup is finishing on our side; re-run this exact x402_fetch (see retry) in a few seconds.',
    reason: 'tab_pending',
  };
}

/**
 * The single seam the relay calls at every dexter-api response site.
 *
 * @param {object}  legacy      The response the relay would return TODAY,
 *                              fully built. Returned untouched (same
 *                              reference) whenever the gate stays closed.
 * @param {object}  anonBody    Parsed dexter-api JSON body (may be null).
 * @param {boolean} tabEnabled  The tool's `tab` param; `false` suppresses ALL
 *                              offer rendering (parity with x402-mcp-tools).
 * @param {boolean} succeeded   The CALLER's branch knowledge: true at the
 *                              success wire sites (inside `if (anonBody?.ok)`),
 *                              false at the error sites. Never re-derived here
 *                              — a truthy-but-not-true `ok` on a paid body must
 *                              still append, never replace, the delivered data.
 * @param {object}  call        { url, method, body, multipart? } — the
 *                              original coordinates, for `retry`.
 */
export function applyRailTabOffer({ legacy, anonBody, tabEnabled = true, succeeded, call = {} }) {
  if (tabEnabled === false) return legacy;
  const offer = extractRailTabOffer(anonBody);
  if (!offer) return legacy;

  if (succeeded) {
    // Successful paid call: deliver the data AS TODAY, append the offer.
    // The offer must never degrade the success — and an available-offer with
    // no tap action is a dangling upsell, so it is skipped entirely.
    if (offer.mode === 'tab_available' && !consentUrlOf(offer)) return legacy;
    return { ...legacy, tabOffer: buildOfferBlock(offer) };
  }

  if (offer.mode === 'tab_pending') {
    return buildTabPendingResponse({ legacy, offer, call });
  }

  const consentUrl = consentUrlOf(offer);
  if (!consentUrl) return legacy; // never render an offer with a dead tap
  return buildTabAvailableResponse({ legacy, offer, consentUrl, call });
}
