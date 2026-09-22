import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OAUTH_SEED_TIMEOUT_MS,
  MAX_OAUTH_SEED_TIMEOUT_MS,
  readOAuthSeedTimeoutMs,
} from '../lib/open-oauth-seed-budget.mjs';

test('OAuth seed budget keeps a finite default and accepts explicit bounded milliseconds', () => {
  assert.equal(DEFAULT_OAUTH_SEED_TIMEOUT_MS, 5_000);
  assert.equal(MAX_OAUTH_SEED_TIMEOUT_MS, 10_000);
  assert.equal(readOAuthSeedTimeoutMs({}), DEFAULT_OAUTH_SEED_TIMEOUT_MS);
  assert.equal(readOAuthSeedTimeoutMs({ OPEN_MCP_OAUTH_SEED_TIMEOUT_MS: '' }), DEFAULT_OAUTH_SEED_TIMEOUT_MS);
  for (const timeoutMs of [1, 200, 2_500, 5_000, MAX_OAUTH_SEED_TIMEOUT_MS]) {
    assert.equal(readOAuthSeedTimeoutMs({ OPEN_MCP_OAUTH_SEED_TIMEOUT_MS: String(timeoutMs) }), timeoutMs);
  }
});

test('OAuth seed budget refuses malformed and unbounded configuration without coercion', () => {
  for (const value of ['0', '-1', '2500.5', ' 2500', '2500 ', '2.5e3', '02500', 'NaN', 'Infinity', null, 2500, String(MAX_OAUTH_SEED_TIMEOUT_MS + 1), '999999999999999999999']) {
    assert.throws(() => readOAuthSeedTimeoutMs({ OPEN_MCP_OAUTH_SEED_TIMEOUT_MS: value }), /invalid_oauth_seed_timeout_ms/);
  }
});
