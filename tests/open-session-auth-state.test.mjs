import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearVaultBound,
  createOpenSessionMeta,
  isAccountBound,
  isAnyIdentityBound,
  isVaultBound,
  markAccountBound,
  markVaultBound,
  shouldSeedVaultOAuth,
} from '../lib/open-session-auth-state.mjs';

test('account authentication never suppresses a vault OAuth upgrade', () => {
  const meta = markAccountBound(createOpenSessionMeta(1));

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), true);
  assert.equal(shouldSeedVaultOAuth(meta), true);

  markVaultBound(meta);
  assert.equal(isVaultBound(meta), true);
  assert.equal(shouldSeedVaultOAuth(meta), false);
});

test('loss of a durable vault binding allows the same session to reseed', () => {
  const meta = markVaultBound(markAccountBound(createOpenSessionMeta(1)));

  clearVaultBound(meta);

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), true);
  assert.equal(shouldSeedVaultOAuth(meta), true);
});

test('anonymous sessions have neither identity and remain short-lived', () => {
  const meta = createOpenSessionMeta(1);

  assert.equal(isAccountBound(meta), false);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), false);
  assert.equal(shouldSeedVaultOAuth(meta), true);
});
