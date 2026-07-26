import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VAULT_AUTH_MODE_LINK_TOKEN,
  VAULT_AUTH_MODE_OAUTH,
  createOpenSessionMeta,
  markVaultBound,
} from '../lib/open-session-auth-state.mjs';
import { shouldVerifyVaultBearer } from '../lib/open-vault-request-auth.mjs';

const protectedCall = (name = 'x402_wallet') => ({ name, id: 1 });
const anonymous = createOpenSessionMeta(1);
const oauth = markVaultBound(createOpenSessionMeta(1), VAULT_AUTH_MODE_OAUTH);
const link = markVaultBound(createOpenSessionMeta(1), VAULT_AUTH_MODE_LINK_TOKEN);

test('OAuth sessions verify every protected invocation, including a missing Bearer', () => {
  for (const bearerPresent of [false, true]) {
    assert.equal(shouldVerifyVaultBearer({
      protectedCall: protectedCall(),
      sessionMeta: oauth,
      bearerPresent,
      hasValidAccountBinding: false,
    }), true);
  }
});

test('an unclassified session verifies any presented Bearer before trusting it', () => {
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: protectedCall('x402_pay'),
    sessionMeta: anonymous,
    bearerPresent: true,
    hasValidAccountBinding: false,
  }), true);
});

test('an unbound Bearer-less call reaches the normal host challenge path', () => {
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: protectedCall(),
    sessionMeta: anonymous,
    bearerPresent: false,
    hasValidAccountBinding: false,
  }), false);
});

test('explicit personal-link sessions preserve the legacy connector rail', () => {
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: protectedCall('x402_fetch'),
    sessionMeta: link,
    bearerPresent: false,
    hasValidAccountBinding: false,
  }), false);
});

test('account JWT compatibility is limited to owner-scoped skill actions', () => {
  for (const name of ['x402_compose_skill', 'promote_skill']) {
    assert.equal(shouldVerifyVaultBearer({
      protectedCall: protectedCall(name),
      sessionMeta: anonymous,
      bearerPresent: true,
      hasValidAccountBinding: true,
    }), false);
  }
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: protectedCall('x402_pay'),
    sessionMeta: anonymous,
    bearerPresent: true,
    hasValidAccountBinding: true,
  }), true);
});

test('a stale cached account binding cannot authorize a later Bearer-less call', () => {
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: protectedCall('promote_skill'),
    sessionMeta: anonymous,
    bearerPresent: false,
    hasValidAccountBinding: false,
  }), true);
});

test('public calls never trigger vault Bearer verification', () => {
  assert.equal(shouldVerifyVaultBearer({
    protectedCall: null,
    sessionMeta: oauth,
    bearerPresent: true,
    hasValidAccountBinding: false,
  }), false);
});
