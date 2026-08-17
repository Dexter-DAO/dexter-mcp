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

test('same OAuth surface reserves and begins one exact stale fetch', () => {
  const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
  assert.equal(bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() }), true);
  const original = call({ url: URL, method: 'GET', maxAmountAtomic: '50000' });
  const reserved = bridge.reserve(original, { identity: { ...IDENTITY }, sessionId: 'fetch-session' });
  assert.equal(reserved.rewritten, true);
  assert.equal(reserved.reserved, true);
  assert.deepEqual(reserved.body.params.arguments, { intentId: 'intent-1', maxAmountAtomic: '50000' });
  assert.deepEqual(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'fetch-session',
  }), { matched: true, acquired: true, checkedSessionId: CHECK_SESSION });
  assert.equal(bridge.reserve(original, {
    identity: IDENTITY,
    sessionId: 'fetch-session',
  }).reserved, false);
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'fetch-session',
  }).acquired, false);
});

test('canonical fetch reserves after a session change and begins exactly once', () => {
  const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  const canonical = call({ intentId: 'intent-1', maxAmountAtomic: '50000' });
  const reserved = bridge.reserve(canonical, { identity: IDENTITY, sessionId: 'fetch-session' });
  assert.deepEqual(reserved, {
    body: canonical,
    matched: true,
    reserved: true,
    rewritten: false,
    intentId: 'intent-1',
  });
  assert.deepEqual(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'fetch-session',
  }), { matched: true, acquired: true, checkedSessionId: CHECK_SESSION });
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'fetch-session',
  }).acquired, false);
});

test('identity, intent, amount, reservation session, and request bytes are hard bindings', () => {
  const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
  bridge.recordCheck({
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
    modelResult: checked({ method: 'POST', body: '{"q":"exact"}' }),
  });
  const canonical = call({ intentId: 'intent-1', maxAmountAtomic: '50000' });
  for (const identity of [
    OTHER_IDENTITY,
    { ...IDENTITY, subject: 'user-2' },
    { ...IDENTITY, issuer: 'https://issuer.example' },
    { ...IDENTITY, audience: 'https://resource.example/mcp' },
  ]) {
    assert.equal(bridge.reserve(canonical, { identity, sessionId: 'session-a' }).matched, false);
  }
  assert.equal(bridge.reserve(call({ intentId: 'intent-x', maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).matched, false);
  assert.deepEqual(bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50001' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }), {
    body: call({ intentId: 'intent-1', maxAmountAtomic: '50001' }),
    matched: true,
    reserved: false,
    rewritten: false,
    intentId: 'intent-1',
  });
  const exact = call({ url: URL, method: 'POST', body: '{"q":"exact"}', maxAmountAtomic: '50000' });
  assert.equal(bridge.reserve(exact, { identity: IDENTITY, sessionId: 'session-a' }).reserved, true);
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'session-b',
  }).acquired, false);
});

test('ambiguous, expired, quote-only, malformed, and batch inputs fail closed', () => {
  let clock = Date.parse('2026-08-17T17:00:00.000Z');
  const bridge = createLegacyIntentBridge({ now: () => clock });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  bridge.recordCheck({ identity: IDENTITY, sessionId: 'check-2', modelResult: checked({ intentId: 'intent-2' }) });
  assert.equal(bridge.reserve(call({ url: URL, maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).reserved, false);
  assert.equal(bridge.reserve(call({ intentId: 'intent-2', maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).reserved, true);

  const expired = createLegacyIntentBridge({ now: () => clock });
  expired.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  clock = Date.parse('2026-08-17T17:02:00.001Z');
  assert.equal(expired.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).matched, false);

  const quoteOnly = checked();
  quoteOnly.quoteOnly = true;
  assert.equal(expired.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: quoteOnly }), false);
  const batch = [
    call({ intentId: 'intent-1', maxAmountAtomic: '50000' }),
    call({ intentId: 'intent-1', maxAmountAtomic: '50000' }, 2),
  ];
  assert.equal(bridge.reserve(batch, { identity: IDENTITY, sessionId: 'batch-session' }).reserved, false);
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'batch-session',
  }).acquired, false);
  assert.equal(bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000', url: URL }), {
    identity: IDENTITY,
    sessionId: 'session-a',
  }).matched, false);
});

test('canonical and legacy callers race to one reservation and one acquire', () => {
  const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  assert.equal(bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'canonical-session',
  }).reserved, true);
  assert.equal(bridge.reserve(call({ url: URL, maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: 'legacy-session',
  }).reserved, false);
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'canonical-session',
  }).acquired, true);
  assert.equal(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: 'legacy-session',
  }).acquired, false);
});

test('canonical fetch also reserves when Codex preserves the checked session', () => {
  const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
  bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
  assert.equal(bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000' }), {
    identity: IDENTITY,
    sessionId: CHECK_SESSION,
  }).reserved, true);
  assert.deepEqual(bridge.beginFetch({
    identity: IDENTITY,
    intentId: 'intent-1',
    maxAmountAtomic: '50000',
    sessionId: CHECK_SESSION,
  }), { matched: true, acquired: true, checkedSessionId: CHECK_SESSION });
});

test('typed authorization reopens; success, error, and uncertainty consume', () => {
  const outcomes = [
    [{ status: 'authorization_required', authorizationRequired: true, retryWithSameIntentOnly: true }, true],
    [{ status: 'complete', ok: true }, false],
    [{ status: 'authorization_required', authorizationRequired: true }, false],
    [null, false],
  ];
  for (const [result, reopens] of outcomes) {
    const bridge = createLegacyIntentBridge({ now: () => Date.parse('2026-08-17T17:00:00.000Z') });
    bridge.recordCheck({ identity: IDENTITY, sessionId: CHECK_SESSION, modelResult: checked() });
    bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000' }), {
      identity: IDENTITY,
      sessionId: 'session-a',
    });
    bridge.beginFetch({
      identity: IDENTITY,
      intentId: 'intent-1',
      maxAmountAtomic: '50000',
      sessionId: 'session-a',
    });
    assert.equal(bridge.complete({
      identity: IDENTITY,
      intentId: 'intent-1',
      sessionId: 'session-a',
      result,
    }), true);
    assert.equal(bridge.reserve(call({ intentId: 'intent-1', maxAmountAtomic: '50000' }), {
      identity: IDENTITY,
      sessionId: 'session-b',
    }).reserved, reopens);
  }
});
