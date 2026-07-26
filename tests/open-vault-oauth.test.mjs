import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair } from 'jose';

import {
  VAULT_OAUTH_ISSUER,
  oauthChallengeForVerification,
  verifyOpenVaultBearer,
} from '../lib/open-vault-oauth.mjs';
import {
  createOpenSessionMeta,
  oauthVaultIdentityStatus,
  pinOAuthVaultIdentity,
} from '../lib/open-session-auth-state.mjs';

const AUDIENCE = 'https://open.dexter.cash/mcp';
const SUBJECT = 'dGVzdC11c2VyLWhhbmRsZQ';
const SURFACE = 'a'.repeat(64);
const now = () => Math.floor(Date.now() / 1000);
const { privateKey, publicKey } = await generateKeyPair('ES256');

async function token({
  issuer = VAULT_OAUTH_ISSUER,
  audience = AUDIENCE,
  scope = 'vault',
  subject = SUBJECT,
  surface = SURFACE,
  expiresIn = 300,
  notBefore = null,
} = {}) {
  const payload = {
    ...(scope === null ? {} : { scope }),
    ...(surface === null ? {} : { dexter_surface: surface }),
  };
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'JWT' })
    .setIssuer(issuer)
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt(now());
  if (expiresIn !== null) jwt = jwt.setExpirationTime(now() + expiresIn);
  if (notBefore !== null) jwt = jwt.setNotBefore(notBefore);
  return jwt.sign(privateKey);
}

async function verify(candidate) {
  return verifyOpenVaultBearer(candidate, {
    verificationKey: publicKey,
    audience: AUDIENCE,
  });
}

test('accepts a current ES256 token with issuer, audience, vault scope, subject, and surface', async () => {
  const result = await verify(await token());
  assert.equal(result.ok, true);
  assert.equal(result.payload.sub, SUBJECT);
  assert.equal(result.payload.scope, 'vault');
  assert.equal(result.payload.dexter_surface, SURFACE);
  assert.deepEqual(result.identity, {
    subject: SUBJECT,
    surface: SURFACE,
    issuer: VAULT_OAUTH_ISSUER,
    audience: AUDIENCE,
  });
});

test('accepts vault among multiple space-delimited scopes', async () => {
  assert.equal((await verify(await token({ scope: 'openid vault profile' }))).ok, true);
});

test('token refresh keeps one session identity while other valid Bearers mismatch', async () => {
  const first = await verify(await token());
  const meta = pinOAuthVaultIdentity(
    createOpenSessionMeta(1),
    first.identity,
  );

  const refreshed = await verify(await token());
  assert.equal(refreshed.ok, true);
  assert.equal(oauthVaultIdentityStatus(meta, refreshed.identity), 'match');

  const otherSubject = await verify(await token({ subject: 'another-valid-user' }));
  const otherSurface = await verify(await token({ surface: 'b'.repeat(64) }));
  assert.equal(otherSubject.ok, true);
  assert.equal(otherSurface.ok, true);
  assert.equal(oauthVaultIdentityStatus(meta, otherSubject.identity), 'mismatch');
  assert.equal(oauthVaultIdentityStatus(meta, otherSurface.identity), 'mismatch');
});

for (const [label, options, reason] of [
  ['missing scope', { scope: null }, 'insufficient_scope'],
  ['wrong scope', { scope: 'openid profile' }, 'insufficient_scope'],
  ['non-standard array scope', { scope: ['vault'] }, 'insufficient_scope'],
  ['wrong issuer', { issuer: 'https://evil.example' }, 'invalid_token'],
  ['wrong audience', { audience: 'https://other.example/mcp' }, 'invalid_token'],
  ['missing expiration', { expiresIn: null }, 'invalid_token'],
  ['expired token', { expiresIn: -30 }, 'token_expired'],
  ['future token', { notBefore: now() + 300 }, 'token_not_active'],
  ['missing subject', { subject: '' }, 'invalid_token'],
  ['missing surface', { surface: null }, 'invalid_token'],
  ['malformed surface', { surface: 'ABC123' }, 'invalid_token'],
]) {
  test(`rejects ${label}`, async () => {
    const result = await verify(await token(options));
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
  });
}

test('rejects a tampered signature', async () => {
  const signed = await token();
  const [header, payload, signature] = signed.split('.');
  const first = signature[0];
  const tampered = `${header}.${payload}.${first === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.deepEqual(await verify(tampered), { ok: false, reason: 'invalid_token' });
});

test('rejects a missing token instead of treating session state as authorization', async () => {
  assert.deepEqual(await verify(undefined), { ok: false, reason: 'missing_token' });
});

test('maps scope and stale-token failures to precise re-challenges', () => {
  assert.deepEqual(
    oauthChallengeForVerification({ reason: 'insufficient_scope' }),
    {
      error: 'insufficient_scope',
      errorDescription: 'Authorize OpenDexter with the vault scope to continue',
    },
  );
  assert.deepEqual(
    oauthChallengeForVerification({ reason: 'token_expired' }),
    {
      error: 'invalid_token',
      errorDescription: 'Your OpenDexter authorization is stale; connect again to continue',
    },
  );
});
