import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyIntentBridge } from '../lib/open-legacy-intent-bridge.mjs';

const IDENTITY = Object.freeze({
  subject: 'user-1',
  surface: 'a'.repeat(64),
  issuer: 'https://dexter.cash',
  audience: 'https://open.dexter.cash/mcp',
});
const OTHER_IDENTITY = Object.freeze({
  ...IDENTITY,
  surface: 'b'.repeat(64),
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

test('same OAuth surface rewrites one exact stale fetch to the opaque intent', () => {
  let clock = Date.parse('2026-08-17T17:00:00.000Z');
  const bridge = createLegacyIntentBridge({ now: () => clock });
  assert.equal(bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() }), true);

  const original = call({ url: URL, method: 'GET', maxAmountAtomic: '50000' });
  const translated = bridge.rewrite(original, {
    identity: { ...IDENTITY },
    sessionId: 'new-mcp-session',
  });
  assert.equal(translated.rewritten, true);
  assert.deepEqual(translated.body.params.arguments, {
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
  });
  assert.equal(bridge.checkedSessionId({
    identity: IDENTITY,
    intentId: 'intent-1',
    sessionId: 'new-mcp-session',
  }), CHECK_SESSION);
  assert.equal(bridge.checkedSessionId({
    identity: OTHER_IDENTITY,
    intentId: 'intent-1',
    sessionId: 'new-mcp-session',
  }), null);
  assert.deepEqual(original.params.arguments, {
    url: URL,
    method: 'GET',
    maxAmountAtomic: '50000',
  });

  // Once claimed, a concurrent/repeated stale call cannot dispatch again.
  assert.equal(bridge.rewrite(original, {
    identity: IDENTITY,
    sessionId: 'new-mcp-session',
  }).rewritten, false);
  clock += 1;
});

test('known pre-dispatch authorization releases only the same claimed intent', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  const original = call({ url: URL, maxAmountAtomic: '50000' });
  const first = bridge.rewrite(original, {
    identity: IDENTITY,
    sessionId: 'session-a',
  });
  assert.equal(first.rewritten, true);
  assert.equal(bridge.complete({
    identity: IDENTITY,
    intentId: 'intent-1',
    sessionId: 'session-a',
    result: {
      status: 'authorization_required',
      authorizationRequired: true,
      retryWithSameIntentOnly: true,
    },
  }), true);
  assert.equal(bridge.rewrite(original, {
    identity: IDENTITY,
    sessionId: 'session-b',
  }).rewritten, true);
});

test('success, error, or uncertainty consumes the bridge record', () => {
  for (const result of [
    { status: 'complete', ok: true },
    { status: 'authorization_required', authorizationRequired: true },
    null,
  ]) {
    const bridge = createLegacyIntentBridge({
      now: () => Date.parse('2026-08-17T17:00:00.000Z'),
    });
    bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
    const original = call({ url: URL, maxAmountAtomic: '50000' });
    assert.equal(bridge.rewrite(original, {
      identity: IDENTITY,
      sessionId: 'session-a',
    }).rewritten, true);
    bridge.complete({ identity: IDENTITY, intentId: 'intent-1', sessionId: 'session-a', result });
    assert.equal(bridge.rewrite(original, {
      identity: IDENTITY,
      sessionId: 'session-b',
    }).rewritten, false);
  }
});

test('identity, exact request bytes, and quoted amount are all hard bindings', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked({ method: 'POST', body: '{"q":"exact"}' }),
  });
  const variants = [
    [OTHER_IDENTITY, { url: URL, method: 'POST', body: '{"q":"exact"}', maxAmountAtomic: '50000' }],
    [IDENTITY, { url: `${URL}&extra=1`, method: 'POST', body: '{"q":"exact"}', maxAmountAtomic: '50000' }],
    [IDENTITY, { url: URL, method: 'PUT', body: '{"q":"exact"}', maxAmountAtomic: '50000' }],
    [IDENTITY, { url: URL, method: 'POST', body: '{"q": "exact"}', maxAmountAtomic: '50000' }],
    [IDENTITY, { url: URL, method: 'POST', body: '{"q":"exact"}', maxAmountAtomic: '50001' }],
    [IDENTITY, { url: URL, method: 'POST', body: '{"q":"exact"}', maxAmountAtomic: '50000', purchase: {} }],
  ];
  for (const [identity, args] of variants) {
    assert.equal(bridge.rewrite(call(args), {
      identity,
      sessionId: 'session-a',
    }).rewritten, false);
  }
  assert.equal(bridge.rewrite(call({
    url: URL,
    method: 'POST',
    body: '{"q":"exact"}',
    maxAmountAtomic: '50000',
  }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).rewritten, true);
});

test('ambiguous, expired, quote-only, or multi-call inputs fail closed', () => {
  let clock = Date.parse('2026-08-17T17:00:00.000Z');
  const bridge = createLegacyIntentBridge({ now: () => clock });
  assert.equal(bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() }), true);
  assert.equal(bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked({ intentId: 'intent-2' }),
  }), false);
  const stale = call({ url: URL, maxAmountAtomic: '50000' });
  assert.equal(bridge.rewrite(stale, {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).rewritten, false);

  const expired = createLegacyIntentBridge({ now: () => clock });
  expired.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  clock = Date.parse('2026-08-17T17:02:00.001Z');
  assert.equal(expired.rewrite(stale, {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).rewritten, false);

  const quoteOnly = checked();
  quoteOnly.quoteOnly = true;
  assert.equal(expired.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: quoteOnly }), false);

  const batch = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  batch.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  const body = [stale, call({ url: URL, maxAmountAtomic: '50000' }, 2)];
  assert.equal(batch.rewrite(body, {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).rewritten, false);

  const invalidSession = createLegacyIntentBridge({ now: () => clock });
  assert.equal(invalidSession.recordCheck({
    identity: IDENTITY,
    sessionId: 'session with spaces',
    modelResult: checked(),
  }), false);
});

test('canonical intent calls are never rewritten or claimed', () => {
  const bridge = createLegacyIntentBridge({
    now: () => Date.parse('2026-08-17T17:00:00.000Z'),
  });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  const canonical = call({ intentId: 'intent-1', maxAmountAtomic: '50000' });
  assert.deepEqual(bridge.rewrite(canonical, {
    identity: IDENTITY,
    sessionId: 'session-a',
  }), { body: canonical, rewritten: false });
  assert.equal(bridge.rewrite(call({ url: URL, maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).rewritten, true);
});
