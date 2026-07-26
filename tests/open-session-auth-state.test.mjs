import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VAULT_AUTH_MODE_LEGACY_BINDING,
  VAULT_AUTH_MODE_LINK_TOKEN,
  VAULT_AUTH_MODE_OAUTH,
  clearVaultBound,
  createOpenSessionMeta,
  isAccountBound,
  isAnyIdentityBound,
  isLegacyVaultSession,
  isOAuthVaultSession,
  isVaultBound,
  markAccountBound,
  markVaultAuthMode,
  markVaultBound,
  vaultAuthModeOf,
} from '../lib/open-session-auth-state.mjs';

test('account authentication remains separate from vault authorization', () => {
  const meta = markAccountBound(createOpenSessionMeta(1));

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), true);
  assert.equal(vaultAuthModeOf(meta), null);
});

test('OAuth mode survives binding loss so a session cannot downgrade', () => {
  const meta = markVaultBound(
    markAccountBound(createOpenSessionMeta(1)),
    VAULT_AUTH_MODE_OAUTH,
  );

  assert.equal(isOAuthVaultSession(meta), true);
  clearVaultBound(meta);

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isOAuthVaultSession(meta), true);
  assert.equal(isLegacyVaultSession(meta), false);
});

test('explicit durable-link sessions are distinguishable from OAuth sessions', () => {
  const meta = markVaultBound(createOpenSessionMeta(1), VAULT_AUTH_MODE_LINK_TOKEN);

  assert.equal(isVaultBound(meta), true);
  assert.equal(isLegacyVaultSession(meta), true);
  assert.equal(isOAuthVaultSession(meta), false);
  assert.equal(vaultAuthModeOf(meta), VAULT_AUTH_MODE_LINK_TOKEN);
});

test('a binding discovered without provenance gets the legacy compatibility mode', () => {
  const meta = markVaultBound(createOpenSessionMeta(1));

  assert.equal(vaultAuthModeOf(meta), VAULT_AUTH_MODE_LEGACY_BINDING);
  assert.equal(isLegacyVaultSession(meta), true);
});

test('generic binding discovery never overwrites a known OAuth mode', () => {
  const meta = markVaultAuthMode(createOpenSessionMeta(1), VAULT_AUTH_MODE_OAUTH);
  markVaultBound(meta);

  assert.equal(isVaultBound(meta), true);
  assert.equal(vaultAuthModeOf(meta), VAULT_AUTH_MODE_OAUTH);
});

test('unknown vault auth modes fail closed', () => {
  assert.throws(
    () => markVaultAuthMode(createOpenSessionMeta(1), 'magic_cookie'),
    /Unsupported vault auth mode/,
  );
});

test('anonymous sessions have neither identity nor auth mode', () => {
  const meta = createOpenSessionMeta(1);

  assert.equal(isAccountBound(meta), false);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), false);
  assert.equal(vaultAuthModeOf(meta), null);
});
