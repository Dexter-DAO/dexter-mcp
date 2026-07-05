// Tests for the rail-tab offer response builder (lib/rail-tab-offer.mjs) — T4-5b.
// Runs on the built-in Node test runner — no framework install needed:
//
//   node --test tests/rail-tab-offer.test.mjs
//
// The load-bearing safety property is the MODE-GATE: the relay deploys BEFORE
// the dexter-api side ships railTabOffer, so an absent/unknown/malformed offer
// MUST produce byte-identical current behavior. Fixture 4 pins that with
// reference equality + frozen-input + JSON byte equality.
//
// The copy rules are hard product law (plan Global Constraints "Copy"):
// user-visible strings speak outcomes; voucher/scheme/session/counterparty/
// cumulative/crystalliz*/x402 never appear in them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRailTabOffer,
  RAIL_TAB_HEADLINE,
} from '../lib/rail-tab-offer.mjs';
import {
  CONTRACT_HEADLINE,
  CONSENT_LINK,
  SELLER_PAY_TO,
  dualRail200WithOffer,
  tabOnly402ConsentRequired,
  tabPending402,
  legacy402NoOffer,
  unknownMode402,
} from './fixtures/rail-tab-offer.fixtures.mjs';

const CALL = { url: 'https://tab-demo.dexter.cash/tick', method: 'GET', body: null };

// Replicates EXACTLY how open-mcp-server.mjs builds the JSON-branch success
// response today (the "legacy" literal the wire site constructs before the
// offer gate runs). Any drift between this and the server literal is a test
// maintenance task, not a behavior change.
function buildLegacySuccess(anonBody, roundtripMs = 1234) {
  return {
    status: anonBody.status ?? 200,
    mode: anonBody.paid ? 'vault_ready' : 'vault_no_payment_required',
    data: anonBody.data,
    payment: anonBody.payment?.settlement
      ? { settled: true, details: { ...anonBody.payment.settlement, roundtripMs } }
      : { settled: Boolean(anonBody.paid) },
    vault: anonBody.vault,
    paySource: 'anon_vault',
  };
}

// Replicates the JSON-branch error relay literal (open-mcp-server.mjs ~:762-769).
function buildLegacyError(httpStatus, anonBody) {
  return {
    status: httpStatus || 500,
    mode: 'vault_error',
    error: anonBody?.error || 'anon_fetch_failed',
    message: anonBody?.message,
    requirements: anonBody?.requirements ?? null,
    paySource: 'anon_vault',
  };
}

const BANNED_COPY = [
  /voucher/i,
  /scheme/i,
  /\bsession\b/i,
  /counterparty/i,
  /cumulativ/i,
  /crystalliz/i,
  /x402/i,
];

// Collect every human-relayable string from a built response. `message` and
// `tip` are relayed verbatim to humans (buildVaultRequired convention);
// `instructions` are model-directed but audited too, minus tool names.
function userVisibleStrings(res) {
  const out = [];
  for (const node of [res, res.tabOffer]) {
    if (!node || typeof node !== 'object') continue;
    for (const key of ['message', 'tip']) {
      if (typeof node[key] === 'string') out.push(node[key]);
    }
    if (typeof node.instructions === 'string') {
      // Tool names in model-directed instructions are the established funnel
      // convention (buildVaultRequired says "re-run this exact x402_fetch").
      out.push(node.instructions.replaceAll('x402_fetch', 'the same tool call'));
    }
  }
  return out;
}

function assertCleanCopy(res, label) {
  for (const text of userVisibleStrings(res)) {
    for (const banned of BANNED_COPY) {
      assert.ok(!banned.test(text), `${label}: banned pattern ${banned} in copy: "${text}"`);
    }
  }
}

// ── Fixture 1: dual-rail 200 — paid data delivered AS TODAY, offer appended ──

test('dual-rail 200: legacy success payload survives untouched, offer appended', () => {
  const legacy = buildLegacySuccess(dualRail200WithOffer);
  const expectedLegacy = JSON.parse(JSON.stringify(legacy));
  const res = applyRailTabOffer({
    legacy, anonBody: dualRail200WithOffer, tabEnabled: true, succeeded: true, call: CALL,
  });

  // Offer must NEVER degrade a successful paid call: every legacy field intact.
  for (const [key, value] of Object.entries(expectedLegacy)) {
    assert.deepEqual(res[key], value, `legacy field "${key}" changed`);
  }
  assert.equal(res.mode, 'vault_ready', 'success mode must stay vault_ready');
  assert.deepEqual(res.data, dualRail200WithOffer.data);

  // Appended block: mode, one tap action, headline copy, structured mechanics.
  assert.ok(res.tabOffer, 'tabOffer block appended');
  assert.equal(res.tabOffer.mode, 'tab_available');
  assert.equal(res.tabOffer.consent_url, CONSENT_LINK);
  assert.equal(res.tabOffer.seller, SELLER_PAY_TO);
  assert.equal(res.tabOffer.perUnitAtomic, '10000');
  assert.equal(res.tabOffer.message, CONTRACT_HEADLINE);
  assertCleanCopy(res, 'dual-rail 200');
});

// ── Skew guard: success is the CALLER's branch knowledge, not anonBody.ok ────
// The wire sites sit inside `if (anonBody?.ok)` (truthy). A paid body whose
// `ok` is truthy-but-not-boolean-true must still be treated as the delivered
// success it is: offer APPENDS, never replaces the paid data with a
// consent-402.

test('success branch with ok:1 (truthy non-true): offer appends, paid data never degraded', () => {
  const body = { ...dualRail200WithOffer, ok: 1 };
  const legacy = buildLegacySuccess(body);
  const expectedLegacy = JSON.parse(JSON.stringify(legacy));
  const res = applyRailTabOffer({
    legacy, anonBody: body, tabEnabled: true, succeeded: true, call: CALL,
  });

  // The paid result was already delivered — every legacy field must survive.
  for (const [key, value] of Object.entries(expectedLegacy)) {
    assert.deepEqual(res[key], value, `legacy field "${key}" changed`);
  }
  assert.equal(res.mode, 'vault_ready', 'delivered result must not become a consent-402');
  assert.notEqual(res.reason, 'tab_consent_required', 'must not degrade to offer-as-response');
  assert.ok(res.tabOffer, 'offer appended to the delivered result');
  assert.equal(res.tabOffer.mode, 'tab_available');
  assert.equal(res.tabOffer.consent_url, CONSENT_LINK);
  assertCleanCopy(res, 'ok:1 success append');
});

// ── Fixture 2: tab-only 402 — offer-as-response with the consent tap ─────────

test('tab-only 402: offer becomes the response, consent link is the action', () => {
  const legacy = buildLegacyError(tabOnly402ConsentRequired.httpStatus, tabOnly402ConsentRequired.body);
  const res = applyRailTabOffer({
    legacy, anonBody: tabOnly402ConsentRequired.body, tabEnabled: true, succeeded: false, call: CALL,
  });

  assert.notEqual(res, legacy, 'must replace the bare error relay');
  assert.equal(res.status, 402);
  assert.equal(res.mode, 'tab_available');
  assert.equal(res.paySource, 'anon_vault');
  assert.equal(res.consent_url, CONSENT_LINK);
  assert.equal(res.seller, SELLER_PAY_TO);
  assert.equal(res.perUnitAtomic, '10000');
  assert.equal(res.reason, 'tab_consent_required');
  // Retry preserves the exact call so the agent resumes after approval.
  assert.deepEqual(res.retry, { tool: 'x402_fetch', url: CALL.url, method: 'GET', body: null });
  // Headline copy per Global Constraints, relayable verbatim.
  assert.ok(res.message.includes(RAIL_TAB_HEADLINE), 'message carries the headline');
  assert.ok(res.instructions.includes('consent_url'), 'instructions point at the tap action');
  assertCleanCopy(res, 'tab-only 402');
});

// ── Fixture 3: tab_pending — honesty state, NO consent re-prompt ─────────────

test('tab_pending 402: almost-ready honesty, no consent link anywhere', () => {
  const legacy = buildLegacyError(tabPending402.httpStatus, tabPending402.body);
  const res = applyRailTabOffer({
    legacy, anonBody: tabPending402.body, tabEnabled: true, succeeded: false, call: CALL,
  });

  assert.notEqual(res, legacy);
  assert.equal(res.mode, 'tab_pending');
  assert.equal(res.status, 402);
  assert.equal(res.retryable, true);
  assert.ok(/almost ready/.test(res.message), 'pending copy speaks the almost-ready outcome');
  assert.ok(/approval detected/.test(res.message), 'pending copy confirms the approval was seen');
  // No re-prompt: the consent link must not appear in ANY field.
  assert.ok(!JSON.stringify(res).includes('tabs/new'), 'no consent link re-prompt');
  assert.equal(res.consent_url, undefined);
  assert.deepEqual(res.retry, { tool: 'x402_fetch', url: CALL.url, method: 'GET', body: null });
  assertCleanCopy(res, 'tab_pending 402');
});

// ── Fixture 4: MODE-GATE REGRESSION — no offer ⇒ byte-identical behavior ─────

test('regression: legacy no_exact_scheme_accept relays byte-identical (same reference)', () => {
  const legacy = buildLegacyError(legacy402NoOffer.httpStatus, legacy402NoOffer.body);
  const expected = buildLegacyError(legacy402NoOffer.httpStatus, legacy402NoOffer.body);
  Object.freeze(legacy); // any mutation throws under ESM strict mode

  const res = applyRailTabOffer({
    legacy, anonBody: legacy402NoOffer.body, tabEnabled: true, succeeded: false, call: CALL,
  });

  assert.equal(res, legacy, 'must return the exact same object reference');
  assert.deepEqual(res, expected, 'deep-equal to today\'s relay output');
  assert.equal(JSON.stringify(res), JSON.stringify(expected), 'byte-identical JSON');
});

test('regression: unknown offer mode renders as today\'s fallback', () => {
  const legacy = buildLegacyError(unknownMode402.httpStatus, unknownMode402.body);
  Object.freeze(legacy);
  const res = applyRailTabOffer({
    legacy, anonBody: unknownMode402.body, tabEnabled: true, succeeded: false, call: CALL,
  });
  assert.equal(res, legacy);
});

test('regression: malformed offer (non-object) renders as today\'s fallback', () => {
  const body = { ok: false, error: 'tab_consent_required', railTabOffer: 'yes please' };
  const legacy = buildLegacyError(402, body);
  Object.freeze(legacy);
  assert.equal(applyRailTabOffer({ legacy, anonBody: body, tabEnabled: true, succeeded: false, call: CALL }), legacy);
});

test('regression: tab_available with no consent link never renders a dead tap', () => {
  const body = { ok: false, error: 'tab_consent_required', railTabOffer: { mode: 'tab_available' } };
  const legacy = buildLegacyError(402, body);
  Object.freeze(legacy);
  assert.equal(applyRailTabOffer({ legacy, anonBody: body, tabEnabled: true, succeeded: false, call: CALL }), legacy);
});

// ── Fixture 5: tab:false suppresses ALL offer rendering ──────────────────────

test('tab:false suppresses the 402 offer (raw relay, same reference)', () => {
  const legacy = buildLegacyError(tabOnly402ConsentRequired.httpStatus, tabOnly402ConsentRequired.body);
  Object.freeze(legacy);
  const res = applyRailTabOffer({
    legacy, anonBody: tabOnly402ConsentRequired.body, tabEnabled: false, succeeded: false, call: CALL,
  });
  assert.equal(res, legacy);
  assert.ok(!JSON.stringify(res).includes('tabOffer'));
});

test('tab:false suppresses the 200 append (paid data only, same reference)', () => {
  const legacy = buildLegacySuccess(dualRail200WithOffer);
  Object.freeze(legacy);
  const res = applyRailTabOffer({
    legacy, anonBody: dualRail200WithOffer, tabEnabled: false, succeeded: true, call: CALL,
  });
  assert.equal(res, legacy);
  assert.equal(res.tabOffer, undefined);
});

// ── Pending offer attached to a SUCCESS (dual-rail, consent in flight) ───────

test('tab_pending on a 200: paid data intact, pending block appended, no link', () => {
  const body = {
    ...dualRail200WithOffer,
    railTabOffer: { mode: 'tab_pending', seller: SELLER_PAY_TO },
  };
  const legacy = buildLegacySuccess(body);
  const expectedLegacy = JSON.parse(JSON.stringify(legacy));
  const res = applyRailTabOffer({ legacy, anonBody: body, tabEnabled: true, succeeded: true, call: CALL });

  for (const [key, value] of Object.entries(expectedLegacy)) {
    assert.deepEqual(res[key], value, `legacy field "${key}" changed`);
  }
  assert.equal(res.tabOffer.mode, 'tab_pending');
  assert.ok(/almost ready/.test(res.tabOffer.message));
  assert.ok(!JSON.stringify(res).includes('tabs/new'), 'no consent link re-prompt');
  assertCleanCopy(res, 'tab_pending 200');
});

// ── Copy law: the banned strings never appear in ANY rendered mode ───────────

test('copy audit: every rendered mode is free of banned strings', () => {
  const rendered = [
    applyRailTabOffer({
      legacy: buildLegacySuccess(dualRail200WithOffer),
      anonBody: dualRail200WithOffer, tabEnabled: true, succeeded: true, call: CALL,
    }),
    applyRailTabOffer({
      legacy: buildLegacyError(402, tabOnly402ConsentRequired.body),
      anonBody: tabOnly402ConsentRequired.body, tabEnabled: true, succeeded: false, call: CALL,
    }),
    applyRailTabOffer({
      legacy: buildLegacyError(402, tabPending402.body),
      anonBody: tabPending402.body, tabEnabled: true, succeeded: false, call: CALL,
    }),
  ];
  for (const res of rendered) assertCleanCopy(res, `mode=${res.mode}`);
});
