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
  oauthVaultIdentityOf,
  oauthVaultIdentityStatus,
  pinOAuthVaultIdentity,
  vaultAuthModeOf,
} from '../lib/open-session-auth-state.mjs';

const OAUTH_IDENTITY = Object.freeze({
  subject: 'dGVzdC11c2VyLWhhbmRsZQ',
  surface: 'a'.repeat(64),
  issuer: 'https://dexter.cash',
  audience: 'https://open.dexter.cash/mcp',
});

test('account authentication remains separate from vault authorization', () => {
  const meta = markAccountBound(createOpenSessionMeta(1));

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isAnyIdentityBound(meta), true);
  assert.equal(vaultAuthModeOf(meta), null);
});

test('OAuth mode survives binding loss so a session cannot downgrade', () => {
  const meta = markVaultBound(pinOAuthVaultIdentity(
    markAccountBound(createOpenSessionMeta(1)),
    OAUTH_IDENTITY,
  ),
    VAULT_AUTH_MODE_OAUTH,
  );

  assert.equal(isOAuthVaultSession(meta), true);
  assert.deepEqual(oauthVaultIdentityOf(meta), OAUTH_IDENTITY);
  clearVaultBound(meta);

  assert.equal(isAccountBound(meta), true);
  assert.equal(isVaultBound(meta), false);
  assert.equal(isOAuthVaultSession(meta), true);
  assert.equal(isLegacyVaultSession(meta), false);
  assert.deepEqual(oauthVaultIdentityOf(meta), OAUTH_IDENTITY);
});

test('same subject and surface survive token refresh in one OAuth session', () => {
  const meta = pinOAuthVaultIdentity(createOpenSessionMeta(1), OAUTH_IDENTITY);

  assert.equal(oauthVaultIdentityStatus(meta, { ...OAUTH_IDENTITY }), 'match');
  assert.doesNotThrow(() =>
    pinOAuthVaultIdentity(meta, { ...OAUTH_IDENTITY }),
  );
});

test('a different valid subject or surface cannot inherit a bound session', () => {
  const meta = markVaultBound(
    pinOAuthVaultIdentity(createOpenSessionMeta(1), OAUTH_IDENTITY),
    VAULT_AUTH_MODE_OAUTH,
  );
  for (const changed of [
    { ...OAUTH_IDENTITY, subject: 'another-user-handle' },
    { ...OAUTH_IDENTITY, surface: 'b'.repeat(64) },
    { ...OAUTH_IDENTITY, issuer: 'https://other.example' },
    { ...OAUTH_IDENTITY, audience: 'https://other.example/mcp' },
  ]) {
    assert.equal(oauthVaultIdentityStatus(meta, changed), 'mismatch');
    assert.throws(
      () => pinOAuthVaultIdentity(meta, changed),
      /oauth_vault_identity_mismatch/,
    );
  }
  assert.equal(isVaultBound(meta), true);
  assert.deepEqual(oauthVaultIdentityOf(meta), OAUTH_IDENTITY);
});

test('a verified OAuth identity is unpinned before the first seed', () => {
  assert.equal(
    oauthVaultIdentityStatus(createOpenSessionMeta(1), OAUTH_IDENTITY),
    'unpinned',
  );
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
