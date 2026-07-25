import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  MAX_PORTFOLIO_BYTES,
  MAX_PORTFOLIO_HOLDINGS,
  SESSION_PORTFOLIO_SIGNATURE_PURPOSE,
  fetchSessionPortfolio,
  numericPortfolioSummary,
  signedSessionPortfolioHeaders,
  validateAndBoundPortfolioSnapshotV1,
} from '../lib/session-portfolio.mjs';
import {
  WALLET_ADDRESS,
  completePortfolio,
} from './fixtures/wallet-portfolio-fixtures.mjs';

const SESSION_ID = '019f97fb-9684-7571-9c0c-9ba39bd54570';
const SECRET = 'test-only-secret-that-is-at-least-thirty-two-bytes';

function responseFor(body, extra = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: true,
    headers: { get: () => String(Buffer.byteLength(text, 'utf8')) },
    text: async () => text,
    ...extra,
  };
}

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

test('validates and returns a bounded exact PortfolioSnapshotV1', async () => {
  let requestUrl = null;
  let requestInit = null;
  const snapshot = completePortfolio();

  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030/',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET_ADDRESS,
    secret: SECRET,
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return responseFor({ ok: true, portfolio: snapshot });
    },
  });

  assert.equal(
    requestUrl,
    `http://127.0.0.1:3030/api/passkey-anon/mcp-portfolio/${SESSION_ID}`,
  );
  assert.doesNotMatch(requestUrl, /user_handle|walletAddress/);
  assert.equal(requestInit.headers['x-internal-signature'].length, 64);
  assert.deepEqual(result, snapshot);
  assert.notEqual(result, snapshot, 'boundary returns a detached canonical copy');
});

test('rejects extra fields, malformed holdings, and returned-wallet mismatches', async () => {
  const extraField = { ...completePortfolio(), modelLeak: 'do not pass' };
  assert.equal(validateAndBoundPortfolioSnapshotV1(extraField), null);

  const malformed = completePortfolio();
  malformed.holdings[0] = {
    ...malformed.holdings[0],
    symbol: 'X'.repeat(33),
  };
  assert.equal(validateAndBoundPortfolioSnapshotV1(malformed), null);

  const mismatched = completePortfolio();
  mismatched.walletAddress = '11111111111111111111111111111111';
  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET_ADDRESS,
    secret: SECRET,
    fetchImpl: async () => responseFor({ portfolio: mismatched }),
  });
  assert.equal(result, null);
});

test('enforces holding-count and serialized-byte bounds before widget delivery', async () => {
  const tooMany = completePortfolio();
  tooMany.holdings = Array.from(
    { length: MAX_PORTFOLIO_HOLDINGS + 1 },
    () => tooMany.holdings[0],
  );
  assert.equal(validateAndBoundPortfolioSnapshotV1(tooMany), null);

  let fetchCalls = 0;
  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET_ADDRESS,
    secret: SECRET,
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        headers: { get: () => String(MAX_PORTFOLIO_BYTES + 1) },
        text: async () => {
          throw new Error('oversized body must not be read');
        },
      };
    },
  });
  assert.equal(fetchCalls, 1);
  assert.equal(result, null);
});

test('stops reading an unframed response as soon as the byte cap is exceeded', async () => {
  let reads = 0;
  let cancelled = false;
  const chunks = [
    new Uint8Array(MAX_PORTFOLIO_BYTES - 16),
    new Uint8Array(17),
  ];

  const result = await fetchSessionPortfolio({
    apiBase: 'http://127.0.0.1:3030',
    sessionId: SESSION_ID,
    expectedWalletAddress: WALLET_ADDRESS,
    secret: SECRET,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: async () => {
            const value = chunks[reads];
            reads += 1;
            return value
              ? { done: false, value }
              : { done: true, value: undefined };
          },
          cancel: async () => {
            cancelled = true;
          },
          releaseLock: () => {},
        }),
      },
      text: async () => {
        throw new Error('stream path must enforce the bound before buffering');
      },
    }),
  });

  assert.equal(result, null);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test('numeric summary contains no holding-controlled display strings', () => {
  const portfolio = validateAndBoundPortfolioSnapshotV1(completePortfolio());
  const summary = numericPortfolioSummary(portfolio);

  assert.deepEqual(summary, {
    holdings: 5,
    pricedHoldings: 5,
    unpricedHoldings: 0,
    holdingsComplete: true,
    pricedValueUsd: '265.33325',
    portfolioValueUsd: '265.33325',
  });
  assert.doesNotMatch(
    JSON.stringify(summary),
    /symbol|name|issuer|http|capabilit|reason|mint/i,
  );
});

test('fails closed when the secret, response, or exact snapshot is unavailable', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: false,
      headers: { get: () => null },
      text: async () => '',
    };
  };

  assert.equal(
    await fetchSessionPortfolio({
      apiBase: 'http://127.0.0.1:3030',
      sessionId: SESSION_ID,
      expectedWalletAddress: WALLET_ADDRESS,
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
      expectedWalletAddress: WALLET_ADDRESS,
      secret: SECRET,
      fetchImpl,
    }),
    null,
  );
  assert.equal(calls, 1);
});
