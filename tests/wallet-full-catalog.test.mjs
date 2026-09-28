import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { fetchSessionPortfolio, MAX_PORTFOLIO_BYTES, numericPortfolioSummary } from '../lib/session-portfolio.mjs';
import { projectWalletResultForModel } from '../lib/wallet-result-visibility.mjs';
import { completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';
import { expandedApprovedActionTargets } from './fixtures/approved-action-target-fixtures.mjs';

const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const producer = source.slice(source.indexOf('async function x402Wallet('), source.indexOf('function buildPortfolioReadError('));

test('actual wallet handler preserves setup, cash readiness and every holding with 1068 available targets', async () => {
  const snapshot = completePortfolio();
  const catalog = expandedApprovedActionTargets(1068);
  const full = { ...snapshot, approvedActionTargets: catalog };
  assert.ok(Buffer.byteLength(JSON.stringify(full)) > MAX_PORTFOLIO_BYTES);
  const requests = [];
  let state = { status: 'ready', vault: { isActivated: true, vaultPda: snapshot.vaultPda, swigAddress: 'fixture-state' },
    onchain: { usdcAtomic: '2500000' } };
  const context = {
    extractMcpSessionId: () => 'wallet-fixture-session',
    fetchVaultStateBySession: async () => state,
    markSessionVaultBound() {},
    getVaultReceiveAddress: () => snapshot.walletAddress,
    API_BASE_FALLBACK: 'https://api.example.test', INTERNAL_HMAC_SECRET: 'offline-wallet-fixture-secret',
    fetchSessionPortfolio: input => fetchSessionPortfolio({ ...input, fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const omit = new URL(url).searchParams.get('includeActionTargets') === 'false';
      return new Response(JSON.stringify({ ok: true, portfolio: omit ? snapshot : full }));
    } }),
    readCardSummary: async () => ({ status: 'none' }),
    fetchSessionActivity: async () => null,
    numericPortfolioSummary,
    mintWidgetWalletToken: () => 'offline-widget-token',
    SOLANA_MAINNET_CAIP2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  };
  const handler = runInNewContext(`${producer}\nx402Wallet`, context);
  const result = await handler({}, {});
  assert.equal(result.mode, 'vault_ready');
  assert.equal(result.user_bound, true);
  assert.equal(result.paymentReadiness.status, 'cash_available');
  assert.equal(result.paymentReadiness.exactIntentCheckRequired, true);
  assert.equal(result.balances.availableAtomic, '2500000');
  assert.deepEqual(result._portfolio, snapshot);
  assert.deepEqual(result.portfolioSummary, numericPortfolioSummary(snapshot));
  const { publicResult, meta } = projectWalletResultForModel(result, {});
  assert.deepEqual(meta.dexterPortfolio.holdings, snapshot.holdings);
  assert.equal(Object.hasOwn(publicResult, '_portfolio'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(meta.dexterPortfolio)) < MAX_PORTFOLIO_BYTES);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).search, '?includeActionTargets=false');
  assert.match(requests[0].init.headers['x-internal-signature'], /^[0-9a-f]{64}$/);

  state = { ...state, vault: { ...state.vault, isActivated: false } };
  const setup = await handler({}, {});
  assert.equal(setup.mode, 'vault_not_activated');
  assert.equal(setup.activate_url, 'https://dexter.cash/wallet');
  assert.equal(setup.address, snapshot.walletAddress);
  assert.equal(requests.length, 1, 'setup does not load the catalog');
});
