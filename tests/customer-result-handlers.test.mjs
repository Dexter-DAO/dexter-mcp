import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { z } from 'zod';
import { purchaseResultText, portfolioResultText } from '../lib/customer-result-presentation.mjs';
import { sanitizeOpenX402IntentResult, OPEN_X402_INTENT_ID_RE } from '../lib/open-x402-intent-api.mjs';
import { modelSafePortfolioSnapshot, validateAndBoundPortfolioSnapshotV1 } from '../lib/session-portfolio.mjs';
import { buildVaultReadError } from '../lib/wallet-read-recovery.mjs';
import { buildHostedCheckStatusModelResult } from '../lib/open-check-result.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { completePortfolio, partialUnpricedPortfolio, partialOmittedPortfolio, governancePortfolio } from './fixtures/wallet-portfolio-fixtures.mjs';
import { zeroHoldingBuyDiscoveryPortfolio } from './fixtures/approved-action-target-fixtures.mjs';

const source = await readFile(new URL('../open-mcp-server.mjs', import.meta.url), 'utf8');
const savedPurchase = JSON.parse(await readFile(new URL('./fixtures/native-purchase-completion-20260917.json', import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const registration = (name, next) => source.slice(source.indexOf(`  registerOpenTool(server, '${name}'`), source.indexOf(next, source.indexOf(`  registerOpenTool(server, '${name}'`)));
const purchaseRegistrations = registration('x402_fetch', "  registerOpenTool(server, 'x402_mcp_tools'");
const portfolioRegistration = registration('dexter_wallet_portfolio', '  for (const operation of');
const portfolioProducer = source.slice(source.indexOf('function buildPortfolioReadError('), source.indexOf('async function governedAssetAction('));

async function purchaseHandler(tool, result, args) {
  const handlers = new Map();
  let reads = 0;
  const invoke = async () => { reads++; if (result instanceof Error) throw result; return result; };
  runInNewContext(purchaseRegistrations, {
    server: {}, z, FETCH_META: {}, STATUS_META: {}, OPEN_X402_INTENT_ID_RE,
    MAX_AMOUNT_ATOMIC_RE: /^[1-9]\d{0,19}$/,
    purchaseResultText, buildHostedCheckStatusModelResult, x402IntentFetch: invoke, x402IntentStatus: invoke,
    registerOpenTool: (_server, name, _descriptor, handler) => handlers.set(name, handler),
    isVaultAuthenticationRequired: () => false,
    console: { warn() {} }, safeErrorLabel: () => 'fixture', logRef: (value) => value,
  });
  const envelope = await handlers.get(tool)(args, {});
  return { envelope, summary: JSON.parse(envelope.content[0].text), reads };
}

for (const tool of ['x402_fetch', 'x402_status']) {
  test(`${tool} shows saved native output and exact charge, preserving every structured receipt field`, async () => {
    const result = sanitizeOpenX402IntentResult({ ...savedPurchase.savedResponse,
      payment: { ...savedPurchase.savedResponse.payment, ...savedPurchase.storedPayment } });
    const original = clone(result);
    const { envelope, summary, reads } = await purchaseHandler(tool, result, { intentId: result.intentId, maxAmountAtomic: '10000' });
    assert.equal(envelope.structuredContent, result);
    assert.deepEqual(result, original);
    assert.deepEqual(summary.providerResult, {
      content: result.delivery.result.content, structuredContent: result.delivery.result.structuredContent,
    });
    assert.equal(summary.charge.displayAmount, '0.01');
    assert.equal(summary.charge.basis, 'confirmed_payment');
    assert.equal(summary.outcome.commitment, 'finalized');
    assert.equal(summary.intentId, result.intentId);
    assert.equal(Object.hasOwn(summary.providerResult, '_meta'), false);
    assert.ok(envelope.structuredContent.delivery.result._meta['x402/payment-response']);
    assert.ok(envelope.content[0].text.length < JSON.stringify(result).length);
    assert.equal(reads, 1);
    assert.equal(OPEN_TOOL_CONTRACTS[tool].outputSchema.safeParse(result).success, true);
  });
}

test('delivered native output remains usable while payment observation is pending', async () => {
  const result = sanitizeOpenX402IntentResult({ ...savedPurchase.savedResponse, retryAfterMs: 750,
    payment: { ...savedPurchase.storedPayment, state: 'pending', confirmed: false, commitment: null } });
  const { summary, envelope } = await purchaseHandler('x402_fetch', result, { intentId: result.intentId, maxAmountAtomic: '10000' });
  assert.deepEqual(summary.providerResult.structuredContent, result.delivery.result.structuredContent);
  assert.equal(summary.outcome.resultAvailable, true);
  assert.equal(summary.outcome.payment, 'pending');
  assert.equal(summary.charge.basis, 'requested_payment');
  assert.equal(summary.continuation.action, 'deliver_result_and_observe');
  assert.deepEqual(summary.continuation.arguments, { intentId: result.intentId });
  assert.equal(summary.continuation.retryAfterMs, 750);
  assert.equal(envelope.structuredContent, result);
});

test('tiny charges remain exact and unknown precision is never guessed', async () => {
  const base = { ...savedPurchase.savedResponse, payment: { ...savedPurchase.storedPayment, state: 'confirmed', confirmed: true, amountAtomic: '1' } };
  const tiny = sanitizeOpenX402IntentResult(base);
  const { summary } = await purchaseHandler('x402_status', tiny, { intentId: tiny.intentId });
  assert.equal(summary.charge.displayAmount, '0.000001');
  const unknown = sanitizeOpenX402IntentResult({ ...base, payment: { ...base.payment, asset: 'unknown-mint' } });
  const unknownSummary = (await purchaseHandler('x402_status', unknown, { intentId: unknown.intentId })).summary;
  assert.equal(unknownSummary.charge.displayAmount, null);
  assert.equal(unknownSummary.charge.amountAtomic, '1');
  assert.equal(Object.hasOwn(unknownSummary.charge, 'symbol'), false);
});

test('ambiguous dispatch and temporary status failure retain exact recovery handles without another call', async () => {
  const id = savedPurchase.savedResponse.intentId;
  const ambiguous = sanitizeOpenX402IntentResult({ intentId: id, status: 'delivery_outcome_unknown', error: 'delivery_outcome_unknown',
    retryAfterMs: 900, retryable: false, retryWithSameIntentOnly: true, replacementAllowed: false,
    delivery: { state: 'unknown' } });
  const { summary, reads } = await purchaseHandler('x402_fetch', ambiguous, { intentId: id, maxAmountAtomic: '10000' });
  assert.equal(summary.intentId, id);
  assert.equal(summary.error, ambiguous.error);
  assert.equal(summary.dispatch.boundary, 'unknown');
  assert.equal(summary.continuation.tool, 'x402_status');
  assert.equal(summary.continuation.retryAfterMs, 900);
  assert.equal(summary.replacementAllowed, false);
  assert.equal(reads, 1);
  const failed = await purchaseHandler('x402_status', new Error('fixture transport failure'), { checkRequestId: 'original-check' });
  assert.equal(failed.summary.checkRequestId, 'original-check');
  assert.equal(failed.summary.error, 'purchase_check_status_unavailable');
  assert.deepEqual(failed.summary.recovery.arguments, { checkRequestId: 'original-check' });
  assert.equal(failed.summary.executionGuidance.reprobeAllowed, false);
  assert.equal(failed.summary.replacementAllowed, false);
  assert.equal(failed.reads, 1);
});

test('recovered paid check retains its exact executable ceiling and quote expiration', async () => {
  const result = buildHostedCheckStatusModelResult({
    checkRequestId: 'saved-check',
    checkResult: { ok: true, paymentRequired: true, intentId: savedPurchase.savedResponse.intentId,
      ...savedPurchase.storedPayment, amountAtomic: '25', expiresAtUnixMs: 1789623999000 },
  });
  const { summary } = await purchaseHandler('x402_status', result, { checkRequestId: 'saved-check' });
  assert.equal(summary.paymentOptions[0].amountAtomic, '25');
  assert.equal(summary.paymentOptions[0].priceFormatted, '0.000025 USDC');
  assert.equal(summary.paymentOptions[0].expiresAt, new Date(1789623999000).toISOString());
  assert.equal(summary.executionGuidance.readyForFetch, true);
  assert.equal(summary.intentId, savedPurchase.savedResponse.intentId);
});

async function portfolioHandler(snapshot) {
  let handler;
  const validated = snapshot instanceof Error ? snapshot : validateAndBoundPortfolioSnapshotV1(snapshot);
  if (!(validated instanceof Error)) assert.ok(validated);
  runInNewContext(`${portfolioProducer}\n${portfolioRegistration}`, {
    server: {}, PORTFOLIO_META: {}, modelSafePortfolioSnapshot, portfolioResultText,
    API_BASE_FALLBACK: 'https://unused.example', INTERNAL_HMAC_SECRET: 'test',
    extractMcpSessionId: () => 'existing-session',
    fetchVaultStateBySession: async () => ({ status: 'ready', vault: {} }),
    getVaultReceiveAddress: () => snapshot instanceof Error ? completePortfolio().walletAddress : snapshot.walletAddress,
    fetchSessionPortfolio: async () => { if (validated instanceof Error) throw validated; return validated; },
    markSessionVaultBound() {}, isVaultAuthenticationRequired: () => false,
    registerOpenTool: (_server, _name, _descriptor, fn) => { handler = fn; },
  });
  const envelope = await handler({}, {});
  const result = clone(envelope.structuredContent);
  const parsed = OPEN_TOOL_CONTRACTS.dexter_wallet_portfolio.outputSchema.safeParse(result);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  return { envelope, result, summary: JSON.parse(envelope.content[0].text) };
}

test('actual portfolio producer and handler preserve validated amounts, scaling, identities and available actions', async () => {
  const snapshot = completePortfolio();
  const { result, summary } = await portfolioHandler(snapshot);
  const stock = summary.holdings[4];
  assert.equal(stock.name, 'SpaceX');
  assert.equal(stock.symbol, 'SPCX');
  assert.equal(stock.assetId, 'backpack-spcx');
  assert.equal(stock.displayAmount, snapshot.holdings[4].displayAmount);
  assert.equal(stock.displayMultiplier, '1.25');
  assert.equal(stock.amountModel, 'scaled-ui-amount');
  assert.deepEqual(stock.availableActions, ['view', 'receive']);
  assert.equal(Object.hasOwn(stock, 'amountRaw'), false);
  assert.equal(result.portfolio.holdings[4].amountRaw, snapshot.holdings[4].amountRaw);
  assert.equal(result.portfolio.holdings[4].mint, snapshot.holdings[4].mint);
});

test('partial portfolio totals, unknown amount model, omitted holdings and blocked assets remain explicit', async () => {
  const { summary } = await portfolioHandler(partialUnpricedPortfolio());
  assert.equal(summary.portfolioValueUsd, null);
  assert.equal(summary.holdings[4].valueUsd, null);
  assert.equal(summary.holdings[4].amountModel, 'unknown');
  assert.equal(summary.holdings[4].displayMultiplier, null);
  assert.equal(summary.holdings[4].displayAmount, '0.004426');
  const omitted = (await portfolioHandler(partialOmittedPortfolio())).summary;
  assert.equal(omitted.holdingsComplete, false);
  assert.equal(omitted.omittedHoldings, 2);
  assert.equal(omitted.portfolioValueUsd, null);
  const blocked = (await portfolioHandler(governancePortfolio())).summary;
  assert.equal(blocked.holdings[2].assetId, null);
  assert.deepEqual(blocked.holdings[2].availableActions, []);
  const targets = (await portfolioHandler(zeroHoldingBuyDiscoveryPortfolio())).summary;
  assert.equal(targets.holdings.length, 0);
  assert.equal(targets.portfolioValueUsd, '0');
  assert.equal(targets.approvedActionTargets[0].assetId, 'backpack-spcx');
});

test('portfolio and wallet outer catches return bounded read continuation without inventing balances or connection state', async () => {
  const { result, summary } = await portfolioHandler(new Error('unavailable'));
  assert.equal(result.user_bound, null);
  assert.equal(Object.hasOwn(result, 'portfolio'), false);
  assert.deepEqual(summary.continuation, { tool: 'dexter_wallet_portfolio', retryAfterMs: 2000, maxAttempts: 2, userActionRequired: false });
  let handler;
  runInNewContext(registration('dexter_wallet', "  registerOpenTool(server, 'dexter_wallet_portfolio'"), {
    server: {}, z, WALLET_META: {}, buildVaultReadError,
    x402Wallet: async () => { throw new Error('unavailable'); },
    registerOpenTool: (_server, _name, _descriptor, fn) => { handler = fn; },
    console: { warn() {} }, safeErrorLabel: () => 'fixture',
  });
  const wallet = clone(await handler({}, {}));
  assert.equal(wallet.structuredContent.user_bound, null);
  assert.equal(wallet.structuredContent.continuation.maxAttempts, 2);
  assert.equal(wallet.structuredContent.continuation.tool, 'dexter_wallet');
  assert.equal(Object.hasOwn(wallet.structuredContent, 'balances'), false);
});
