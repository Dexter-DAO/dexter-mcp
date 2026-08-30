import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyIntentBridge } from '../lib/open-legacy-intent-bridge.mjs';

const IDENTITY = Object.freeze({
  subject: 'user-1',
  surface: 'a'.repeat(64),
  issuer: 'https://dexter.cash',
  audience: 'https://open.dexter.cash/mcp',
});
const URL = 'https://api.example.test/paid?q=exact';
const CHECK_SESSION = 'checked-mcp-session';

function checked({
  intentId = 'intent-1',
  url = URL,
  method = 'GET',
  body = null,
  amountAtomic = '50000',
  expiresAt = '2026-08-17T17:02:00.000Z',
} = {}) {
  return {
    intentId,
    quoteOnly: false,
    paymentOptions: [{ amountAtomic, expiresAt }],
    checkedRequest: {
      url,
      method,
      body,
      requestBound: true,
    },
    executionGuidance: {
      supportedPath: 'fetch_by_intent',
      readyForFetch: true,
    },
  };
}

function call(args, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'x402_fetch', arguments: args },
  };
}

test('retired URL-shaped fetch is translated without owning canonical execution', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked(),
  }), true);

  const legacy = call({ url: URL, method: 'GET', maxAmountAtomic: '50000' });
  const expected = call({ intentId: 'intent-1', maxAmountAtomic: '50000' });
  assert.deepEqual(bridge.rewriteLegacy(legacy, {
    identity: { ...IDENTITY },
    sessionId: 'current-session',
  }), {
    body: expected,
    matched: true,
    rewritten: true,
    intentId: 'intent-1',
  });

  // The API owns idempotency. Local compatibility translation is repeatable,
  // and a canonical request never depends on this process-local map.
  assert.deepEqual(bridge.rewriteLegacy(legacy, {
    identity: IDENTITY,
    sessionId: 'another-session',
  }).body, expected);
  const canonical = call({ intentId: 'intent-1', maxAmountAtomic: '50000' });
  assert.deepEqual(bridge.rewriteLegacy(canonical, {
    identity: IDENTITY,
    sessionId: 'current-session',
  }), {
    body: canonical,
    matched: false,
    rewritten: false,
  });
});

test('identity, amount, and exact request bytes remain hard translation bindings', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked({ method: 'POST', body: '{"q":"exact"}' }),
  });
  const exact = call({
    url: URL,
    method: 'POST',
    body: '{"q":"exact"}',
    maxAmountAtomic: '50000',
  });
  assert.equal(bridge.rewriteLegacy(exact, {
    identity: IDENTITY,
    sessionId: 'current-session',
  }).rewritten, true);

  for (const [identity, args] of [
    [{ ...IDENTITY, surface: 'b'.repeat(64) }, exact.params.arguments],
    [{ ...IDENTITY, subject: 'user-2' }, exact.params.arguments],
    [IDENTITY, { ...exact.params.arguments, maxAmountAtomic: '50001' }],
    [IDENTITY, { ...exact.params.arguments, body: '{"q":"different"}' }],
  ]) {
    assert.equal(bridge.rewriteLegacy(call(args), {
      identity,
      sessionId: 'current-session',
    }).rewritten, false);
  }
});

test('ambiguous and expired checks never translate', () => {
  let clock = Date.parse('2026-08-17T17:00:00.000Z');
  const bridge = createLegacyIntentBridge({ now: () => clock });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: 'second-check',
    modelResult: checked({ intentId: 'intent-2' }),
  }), false);
  assert.equal(bridge.rewriteLegacy(
    call({ url: URL, maxAmountAtomic: '50000' }),
    { identity: IDENTITY, sessionId: 'current-session' },
  ).rewritten, false);

  const expired = createLegacyIntentBridge({ now: () => clock });
  expired.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  clock = Date.parse('2026-08-17T17:02:00.001Z');
  assert.equal(expired.rewriteLegacy(
    call({ url: URL, maxAmountAtomic: '50000' }),
    { identity: IDENTITY, sessionId: 'current-session' },
  ).matched, false);
});

test('quote-only, malformed, batch, and over-capacity inputs fail closed', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
    maxEntries: 1,
  });
  const quoteOnly = checked();
  quoteOnly.quoteOnly = true;
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: quoteOnly,
  }), false);
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked(),
  }), true);
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked({
      intentId: 'intent-2',
      url: 'https://api.example.test/other',
    }),
  }), false);

  const batch = [
    call({ url: URL, maxAmountAtomic: '50000' }),
    call({ url: URL, maxAmountAtomic: '50000' }, 2),
  ];
  assert.equal(bridge.rewriteLegacy(batch, {
    identity: IDENTITY,
    sessionId: 'current-session',
  }).rewritten, false);
  assert.equal(bridge.rewriteLegacy(
    call({ url: URL, maxAmountAtomic: '0' }),
    { identity: IDENTITY, sessionId: 'current-session' },
  ).rewritten, false);
  assert.equal(bridge.rewriteLegacy(
    call({ url: URL, intentId: 'caller-owned', maxAmountAtomic: '50000' }),
    { identity: IDENTITY, sessionId: 'current-session' },
  ).rewritten, false);
});
