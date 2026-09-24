import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { registerOpenTool, buildVaultAuthenticationRequired, isVaultAuthenticationRequired,
  vaultAuthenticationReason, vaultAuthenticationResult } from '../lib/open-tool-auth.mjs';
import { installOpenToolContracts, finalizeOpenToolContracts, OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import { buildAnonVaultToolResult } from '../lib/anon-vault-response.mjs';
import { projectWalletResultForModel } from '../lib/wallet-result-visibility.mjs';
import { getVaultReceiveAddress } from '../lib/passkey-wallet-result.mjs';
import { buildVaultReadError } from '../lib/wallet-read-recovery.mjs';
import { numericPortfolioSummary } from '../lib/session-portfolio.mjs';
import { completePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';

const source = readFileSync(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const slice = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
};
const cashSource = slice('function readWalletCash(', '\n/**');
const walletSource = slice('async function x402Wallet(', '\nfunction buildPortfolioReadError(');
const walletRegistration = slice("  registerOpenTool(server, 'dexter_wallet'", "  registerOpenTool(server, 'dexter_wallet_portfolio'");
const refreshSource = slice("  if (pathname === '/widget/wallet/refresh'", "  if (pathname === '/widget/card/reveal-image')");
const clone = value => JSON.parse(JSON.stringify(value));
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const portfolio = completePortfolio();
const credit = { creditReadStatus: 'available', creditCapAtomic: '50000000',
  creditAvailableAtomic: '25000000', creditBorrowedAtomic: '0', earnBaseAtomic: '0',
  isEarning: false };
const unknownCash = [undefined, null, '', ' ', false, true, '-1', '1.5', 'NaN',
  'Infinity', '18446744073709551616', Number.NaN, Number.POSITIVE_INFINITY];

function fixture(cash, { active = true, money = credit } = {}) {
  return { status: 'ready', vault: { isActivated: active,
    receiveAddress: portfolio.walletAddress, vaultPda: 'fixture-vault', swigAddress: 'fixture-state' },
  onchain: cash === undefined ? {} : { usdcAtomic: cash, usdcAtaExists: true }, money };
}

function handler(state, sessionId = 'fixture-session') {
  const reads = [];
  const context = {
    SOLANA_MAINNET_CAIP2: SOLANA, API_BASE_FALLBACK: 'https://unused.invalid', INTERNAL_HMAC_SECRET: 'fixture',
    extractMcpSessionId: () => sessionId, getVaultReceiveAddress, numericPortfolioSummary,
    buildVaultAuthenticationRequired, vaultAuthenticationReason, buildVaultReadError,
    checkSessionVaultBinding: async () => { reads.push('binding'); return { ok: true, bound: true }; },
    markSessionVaultBound() {}, clearSessionVaultBinding() {},
    fetchVaultStateBySession: async (id, options) => {
      assert.equal(id, sessionId); assert.deepEqual(clone(options), { money: true });
      reads.push('state'); if (state instanceof Error) throw state; return state;
    },
    fetchSessionPortfolio: async () => { reads.push('portfolio'); return portfolio; },
    fetchSessionActivity: async () => { reads.push('activity'); return null; },
    readCardSummary: async () => { reads.push('card'); return { status: 'none' }; },
    readEarningRatePct: async () => { reads.push('rate'); return null; },
    mintWidgetWalletToken: () => 'widget-only-fixture', mintWidgetCardToken: () => 'card-only-fixture',
    console: { warn() {} }, safeErrorLabel: () => 'fixture',
  };
  const fn = runInNewContext(`${cashSource}\n${walletSource}\nx402Wallet`, context);
  return { invoke: () => fn({}, {}), reads };
}

for (const [index, value] of unknownCash.entries()) {
  for (const active of [true, false]) {
    test(`actual wallet handler preserves unknown cash case ${index}, activated=${active}`, async () => {
      const { invoke, reads } = handler(fixture(value, { active }));
      const result = clone(await invoke());
      assert.equal(result.balances.usdc, null);
      assert.equal(result.balances.availableAtomic, null);
      assert.equal(result.balances.fundedAtomic, null);
      assert.equal(result.address, portfolio.walletAddress);
      assert.doesNotMatch(result.tip, /\$0\.00|send USDC|cash is empty/i);
      assert.equal(OPEN_TOOL_CONTRACTS.dexter_wallet.outputSchema.safeParse(result).success, true);
      if (active) {
        assert.deepEqual(result.chainBalances, {});
        assert.equal(result.spendingPower, null);
        assert.equal(result.paymentReadiness.status, 'unknown');
        assert.equal(result.paymentReadiness.cashAvailable, null);
        assert.equal(result.paymentReadiness.creditCapacityReported, true);
        assert.equal(result.credit.availableAtomic, '25000000');
        assert.equal(result.portfolioSummary.holdings, portfolio.holdings.length);
        assert.deepEqual(reads, ['state', 'portfolio', 'card', 'activity', 'rate']);
      } else {
        assert.equal(result.mode, 'vault_not_activated');
        assert.match(result.message, /balance could not be read/);
        assert.deepEqual(reads, ['state']);
      }
    });
  }
}

test('measured zero and positive cash retain their meaning; unobserved chains remain absent', async () => {
  for (const [atomic, usd] of [['0', 0], [0, 0], ['1250000', 1.25], ['18446744073709551615', 18446744073709.55]]) {
    const result = clone(await handler(fixture(atomic)).invoke());
    assert.equal(result.balances.usdc, usd);
    assert.equal(result.balances.availableAtomic, String(atomic));
    assert.deepEqual(Object.keys(result.chainBalances), [SOLANA]);
    assert.equal(result.chainBalances[SOLANA].available, String(atomic));
    assert.equal(result.paymentReadiness.cashAvailable, usd > 0);
    assert.equal(result.spendingPower.totalUsd, Number((usd + 25).toFixed(6)));
  }
});

test('unknown cash never becomes a funding instruction when credit is unavailable or absent', async () => {
  for (const money of [null, { creditReadStatus: 'unavailable' }, { creditReadStatus: 'not_open' }]) {
    const result = clone(await handler(fixture(null, { money })).invoke());
    assert.equal(result.mode, 'vault_readiness_unknown');
    assert.equal(result.spendingPower, null);
    assert.equal(result.paymentReadiness.cashAvailable, null);
    assert.equal(result.paymentReadiness.exactIntentCheckRequired, true);
  }
});

test('existing wallet authentication and failed-state recovery still avoid invented balances', async () => {
  const unbound = handler(null, null);
  assert.equal((await unbound.invoke()).mode, 'authentication_required');
  assert.deepEqual(unbound.reads, []);
  const unavailable = handler(new Error('offline state failure'));
  const result = await unavailable.invoke();
  assert.equal(result.mode, 'vault_read_error');
  assert.equal(Object.hasOwn(result, 'balances'), false);
  assert.deepEqual(unavailable.reads, ['state', 'binding']);
});

test('SDK tools/list and actual wallet registration accept null cash and preserve widget-only evidence', async t => {
  const server = new McpServer({ name: 'wallet-balance-test', version: '1' });
  installOpenToolContracts(server);
  const wallet = handler(fixture(null));
  runInNewContext(walletRegistration, { server, z, WALLET_META: {}, registerOpenTool,
    x402Wallet: wallet.invoke, projectWalletResultForModel, isVaultAuthenticationRequired,
    vaultAuthenticationResult, buildAnonVaultToolResult, buildVaultReadError,
    console: { warn() {} }, safeErrorLabel: () => 'fixture' });
  for (const name of OPEN_TOOL_NAMES.filter(name => name !== 'dexter_wallet')) {
    registerOpenTool(server, name, { inputSchema: {} }, () => { throw new Error('unexpected tool'); });
  }
  finalizeOpenToolContracts(server);
  const client = new Client({ name: 'wallet-balance-client', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await Promise.all([server.connect(b), client.connect(a)]);
  const listed = (await client.listTools()).tools.find(tool => tool.name === 'dexter_wallet');
  const result = await client.callTool({ name: 'dexter_wallet', arguments: {} });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.balances.usdc, null);
  assert.equal(result.structuredContent.paymentReadiness.cashAvailable, null);
  assert.equal(new AjvJsonSchemaValidator().getValidator(listed.outputSchema)(result.structuredContent).valid, true);
  assert.deepEqual(result._meta.dexterPortfolio, portfolio);
  assert.equal(result._meta.dexterWalletToken, 'widget-only-fixture');
  assert.equal(Object.hasOwn(result.structuredContent, '_portfolio'), false);
});

async function refresh(state, token = 'valid-fixture') {
  let body; let status; let reads = 0;
  const listeners = {};
  const route = runInNewContext(`${cashSource}\n(async (req, res) => {${refreshSource}})`, {
    pathname: '/widget/wallet/refresh', Buffer,
    redeemWidgetWalletToken: value => value === 'valid-fixture' ? 'fixture-session' : null,
    fetchVaultStateBySession: async () => { reads++; return state; },
  });
  await route({ method: 'POST', on: (event, fn) => { listeners[event] = fn; }, destroy() { throw new Error('oversized request'); } },
    { writeHead: code => { status = code; }, end: value => { body = JSON.parse(value); } });
  listeners.data(JSON.stringify({ token }));
  await listeners.end();
  return { body, status, reads };
}

test('actual widget refresh refuses unknown cash and recovers to an explicitly measured zero', async () => {
  for (const value of unknownCash) {
    assert.deepEqual(await refresh(fixture(value)), { status: 502,
      body: { ok: false, error: 'balance_unavailable' }, reads: 1 });
  }
  assert.deepEqual(await refresh(fixture('0')), { status: 200,
    body: { ok: true, usdcAtomic: '0', isActivated: true }, reads: 1 });
  assert.deepEqual(await refresh(fixture('0'), 'expired-fixture'), { status: 401,
    body: { ok: false, error: 'bad_token' }, reads: 0 });
});
