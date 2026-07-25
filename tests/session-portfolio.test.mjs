import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  SESSION_PORTFOLIO_SIGNATURE_PURPOSE,
  fetchSessionPortfolio,
  signedSessionPortfolioHeaders,
} from '../lib/session-portfolio.mjs';

const SESSION_ID = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const WALLET = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SECRET = 'test-only-secret-that-is-at-least-thirty-two-bytes';

test('portfolio signatures are purpose-separated from legacy binding signatures', () => {
  const now = 1_785_002_400_000;
  const headers = signedSessionPortfolioHeaders(SESSION_ID, SECRET, now);
  const expected = createHmac('sha256', SECRET)
    .update(`${now}.${SESSION_ID}.${SESSION_PORTFOLIO_SIGNATURE_PURPOSE}`)
    .digest('hex');
  const legacy = createHmac('sha256', SECRET)
    .update(`${now}.${SESSION_ID}`)
    .digest('hex');

  assert.equal(headers['x-internal-timestamp'], String(now));
  assert.equal(headers['x-internal-signature'], expected);
  assert.notEqual(headers['x-internal-signature'], legacy);
});

test('fetches through the session-only endpoint and returns the matching stored-wallet snapshot', async () => {
  let requestUrl = null;
  let requestInit = null;
  const snapshot = {
    schemaVersion: 1,
    walletAddress: WALLET,
    portfolioValueUsd: '12.34',
    holdings: [],
  };

  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030/',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET,
    secret: SECRET,
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        json: async () => ({ ok: true, portfolio: snapshot }),
      };
    },
  });

  assert.equal(
    requestUrl,
    `http://127.0.0.1:3030/api/passkey-anon/mcp-portfolio/${SESSION_ID}`,
  );
  assert.doesNotMatch(requestUrl, /user_handle|walletAddress/);
  assert.equal(
    requestInit.headers['x-internal-signature'].length,
    64,
  );
  assert.deepEqual(result, snapshot);
});

test('fails closed on a returned wallet mismatch', async () => {
  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET,
    secret: SECRET,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        portfolio: {
          schemaVersion: 1,
          walletAddress: '11111111111111111111111111111112',
          holdings: [],
        },
      }),
    }),
  });

  assert.equal(result, null);
});

test('fails closed when the HMAC secret, binding response, or snapshot is unavailable', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, json: async () => ({}) };
  };

  assert.equal(
    await fetchSessionPortfolio({
      apiBase: 'http://127.0.0.1:3030',
      sessionId: SESSION_ID,
      expectedWalletAddress: WALLET,
      secret: '',
      fetchImpl,
    }),
    null,
  );
  assert.equal(calls, 0);

  assert.equal(
    await fetchSessionPortfolio({
      apiBase: 'http://127.0.0.1:3030',
      sessionId: SESSION_ID,
      expectedWalletAddress: WALLET,
      secret: SECRET,
      fetchImpl,
    }),
    null,
  );
  assert.equal(calls, 1);
});
