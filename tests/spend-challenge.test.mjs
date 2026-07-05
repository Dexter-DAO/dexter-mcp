// Tests for the spend-tool OAuth challenge decision (lib/spend-challenge.mjs).
// Runs on the built-in Node test runner — no framework install needed:
//
//   node --test tests/spend-challenge.test.mjs
//
// The decision is money-perimeter: a wrong `true` OAuth-walls a paying user;
// a wrong `false` silently drops the vault rail advertisement. Every row of
// the decision table from the 2026-07-05 plan is pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEND_TOOL_NAMES,
  hasSpendToolCall,
  shouldChallengeSpend,
} from '../lib/spend-challenge.mjs';

const call = (name, id = 1) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: {} },
});
const rpc = (method, id = 1) => ({ jsonrpc: '2.0', id, method, params: {} });

const UNBOUND = { hasBearer: false, boundInMemory: false, boundDurable: false };

test('spend-class set is exactly the locked trio', () => {
  assert.deepEqual([...SPEND_TOOL_NAMES].sort(), ['dexter_passkey', 'x402_fetch', 'x402_pay']);
});

// ── Challenge fires: unbound, Bearer-less, spend-class tools/call ───────────

for (const name of ['x402_pay', 'x402_fetch', 'dexter_passkey']) {
  test(`challenges ${name} when unbound with no Bearer`, () => {
    assert.equal(shouldChallengeSpend({ messages: call(name), ...UNBOUND }), true);
  });
}

test('challenges when ANY message in a batch is a spend-class tools/call', () => {
  const batch = [rpc('tools/list'), call('x402_fetch'), rpc('resources/list', 3)];
  assert.equal(shouldChallengeSpend({ messages: batch, ...UNBOUND }), true);
});

test('challenges a batch whose only spend call is last', () => {
  const batch = [call('x402_check'), call('x402_search', 2), call('x402_pay', 3)];
  assert.equal(shouldChallengeSpend({ messages: batch, ...UNBOUND }), true);
});

test('tolerates junk entries in a batch alongside a spend call', () => {
  const batch = [null, 42, 'nonsense', call('dexter_passkey')];
  assert.equal(shouldChallengeSpend({ messages: batch, ...UNBOUND }), true);
});

// ── Anonymous stays anonymous: browse-class never challenges ────────────────

for (const name of [
  'x402_search', 'x402_check', 'x402_access', 'x402_wallet',
  'x402_compose_skill', 'promote_skill', 'card_status', 'dexter_passkey_probe',
]) {
  test(`never challenges tools/call ${name}`, () => {
    assert.equal(shouldChallengeSpend({ messages: call(name), ...UNBOUND }), false);
  });
}

for (const method of ['initialize', 'tools/list', 'notifications/initialized', 'resources/list', 'ping']) {
  test(`never challenges method ${method}`, () => {
    assert.equal(shouldChallengeSpend({ messages: rpc(method), ...UNBOUND }), false);
  });
}

test('never challenges an all-anonymous batch', () => {
  const batch = [rpc('initialize'), rpc('tools/list', 2), call('x402_search', 3)];
  assert.equal(shouldChallengeSpend({ messages: batch, ...UNBOUND }), false);
});

// ── Suppression inputs: Bearer presence / in-memory bound / durable bound ───

test('Bearer PRESENCE alone suppresses the challenge (verify decides downstream)', () => {
  assert.equal(
    shouldChallengeSpend({ messages: call('x402_pay'), hasBearer: true, boundInMemory: false, boundDurable: false }),
    false,
  );
});

test('in-memory bound suppresses the challenge', () => {
  assert.equal(
    shouldChallengeSpend({ messages: call('x402_fetch'), hasBearer: false, boundInMemory: true, boundDurable: false }),
    false,
  );
});

test('durable binding suppresses the challenge (restart survivor)', () => {
  assert.equal(
    shouldChallengeSpend({ messages: call('dexter_passkey'), hasBearer: false, boundInMemory: false, boundDurable: true }),
    false,
  );
});

// ── Malformed / hostile bodies never challenge and never throw ──────────────

for (const [label, body] of [
  ['null body', null],
  ['undefined body', undefined],
  ['number body', 42],
  ['string body', 'tools/call'],
  ['empty object', {}],
  ['empty batch', []],
  ['tools/call without params', { jsonrpc: '2.0', id: 1, method: 'tools/call' }],
  ['tools/call with non-object params', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: 'x402_pay' }],
  ['tools/call with no name', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { arguments: {} } }],
  ['spend name under wrong method', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { name: 'x402_pay' } }],
  ['case-mangled name', call('X402_PAY')],
  ['whitespace-padded name', call(' x402_pay ')],
]) {
  test(`no challenge, no throw: ${label}`, () => {
    assert.equal(shouldChallengeSpend({ messages: body, ...UNBOUND }), false);
  });
}

// ── hasSpendToolCall directly ────────────────────────────────────────────────

test('hasSpendToolCall: single spend message', () => {
  assert.equal(hasSpendToolCall(call('x402_pay')), true);
});

test('hasSpendToolCall: single non-spend message', () => {
  assert.equal(hasSpendToolCall(call('x402_search')), false);
});

test('hasSpendToolCall: batch detection', () => {
  assert.equal(hasSpendToolCall([rpc('tools/list'), call('x402_fetch')]), true);
  assert.equal(hasSpendToolCall([rpc('tools/list'), call('x402_check')]), false);
});
