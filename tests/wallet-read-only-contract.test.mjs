import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('WalletHome exposes only view and receive controls in the Money action row', async () => {
  const walletHome = await source('apps-sdk/ui/src/components/wallet/WalletHome.tsx');

  assert.match(walletHome, /> Receive\s*</);
  assert.match(walletHome, /> Assets\s*</);
  assert.match(walletHome, /<CreditMark[^>]*\/> Credit/);
  assert.match(walletHome, /> Activity\s*</);
  assert.doesNotMatch(walletHome, /> (?:Pay|Send|Buy|Sell|Earn|Lend|Borrow)\s*</);
  assert.doesNotMatch(walletHome, /x402_(?:fetch|pay)/);
  assert.doesNotMatch(walletHome, /solana-(?:send|swap)|CrossPay/i);
});

test('the read-only card and receive sheets contain no provider mutation or on-ramp handoff', async () => {
  const [card, receive] = await Promise.all([
    source('apps-sdk/ui/src/components/wallet/CardFace.tsx'),
    source('apps-sdk/ui/src/components/wallet/DepositSheet.tsx'),
  ]);

  assert.doesNotMatch(
    card,
    /\$\{CARD_RAIL\}\/freeze|const onFreeze|action:\s*frozen|CARD_SIGNUP_URL/,
  );
  assert.doesNotMatch(
    receive,
    /MoonPayMark|CoinbaseMark|Debit card|Coinbase account|Apple Pay|onOpenExternal|depositUrl/,
  );
  assert.match(receive, /Receive on Solana/);
});

test('asset execution controls are disabled unless the read-only gate supplies a real handler', async () => {
  const [sheet, model] = await Promise.all([
    source('apps-sdk/ui/src/components/wallet/AssetsSheet.tsx'),
    source('apps-sdk/ui/src/components/wallet/portfolioModel.ts'),
  ]);

  assert.match(sheet, /disabled=\{!state\.available\}/);
  assert.match(sheet, /groupPortfolioUnavailableActions/);
  assert.match(sheet, /dxw-asset-reasons/);
  assert.doesNotMatch(sheet, /title=\{state\.reason/);
  assert.match(model, /action === 'receive' && options\.receiveHandlerAvailable/);
  assert.match(model, /action === 'view'/);
  assert.doesNotMatch(sheet, /callTool|x402_(?:fetch|pay)|fetch\s*\(/);
});

test('hosted x402_wallet remains read-only with no caller identity input', async () => {
  const server = await source('open-mcp-server.mjs');
  const registrationStart = server.indexOf("registerOpenTool(server, 'x402_wallet'");
  assert.notEqual(registrationStart, -1, 'x402_wallet registration must exist');
  const registration = server.slice(
    registrationStart,
    server.indexOf("registerOpenTool(server, 'dexter_portfolio'", registrationStart),
  );

  assert.match(registration, /inputSchema:\s*\{\}/);
  assert.match(registration, /readOnlyHint:\s*true/);
  assert.doesNotMatch(registration, /walletAddress|user_handle|userHandle/);
});

test('hosted x402_wallet keeps verified portfolio display data in widget metadata', async () => {
  const [server, entry, payload] = await Promise.all([
    source('open-mcp-server.mjs'),
    source('apps-sdk/ui/src/entries/x402-wallet.tsx'),
    source('apps-sdk/ui/src/components/x402/walletPayload.ts'),
  ]);
  const walletImplementation = server.slice(
    server.indexOf('async function x402Wallet'),
    server.indexOf('// ─── MCP Server Setup', server.indexOf('async function x402Wallet')),
  );
  const registrationStart = server.indexOf("registerOpenTool(server, 'x402_wallet'");
  assert.notEqual(registrationStart, -1, 'x402_wallet registration must exist');
  const registration = server.slice(
    registrationStart,
    server.indexOf("registerOpenTool(server, 'dexter_portfolio'", registrationStart),
  );

  assert.match(walletImplementation, /fetchSessionPortfolio\(\{/);
  assert.match(walletImplementation, /sessionId,/);
  assert.match(walletImplementation, /expectedWalletAddress:\s*receiveAddress/);
  assert.match(walletImplementation, /getVaultReceiveAddress\(state\.vault\)/);
  assert.doesNotMatch(
    walletImplementation,
    /receiveAddress\s*\?\?\s*swigAddress|receiveAddress\s*\|\|\s*swigAddress/,
  );
  assert.match(
    walletImplementation,
    /tip = receiveAddress[\s\S]*Do not send funds to a vault or Swig state address/,
  );
  assert.match(walletImplementation, /secret:\s*INTERNAL_HMAC_SECRET/);
  assert.match(walletImplementation, /_portfolio:\s*portfolio/);
  assert.match(walletImplementation, /portfolioSummary:\s*numericPortfolioSummary\(portfolio\)/);
  assert.match(registration, /projectWalletResultForModel/);
  assert.match(entry, /dexterPortfolio\?: unknown/);
  assert.match(entry, /normalizeWalletPayload\(toolOutput, widgetPortfolio\)/);
  assert.match(payload, /normalizePortfolioRead\(widgetPortfolio, solanaAddress\)/);
  assert.doesNotMatch(payload, /normalizePortfolioRead\(raw\.portfolio/);
});

test('wallet cash, reported credit, and exact-intent readiness remain distinct', async () => {
  const [server, payload, walletHome, headline, creditSheet] = await Promise.all([
    source('open-mcp-server.mjs'),
    source('apps-sdk/ui/src/components/x402/walletPayload.ts'),
    source('apps-sdk/ui/src/components/wallet/WalletHome.tsx'),
    source('apps-sdk/ui/src/components/wallet/SpendHeadline.tsx'),
    source('apps-sdk/ui/src/components/wallet/CreditSheet.tsx'),
  ]);

  assert.match(server, /status: 'credit_capacity_reported'/);
  assert.match(server, /status: 'unknown'/);
  assert.match(server, /do not request a deposit or promise credit execution/i);
  assert.match(server, /mode: paymentReadiness\.status === 'cash_available'/);
  assert.doesNotMatch(server, /mode: usdcAvailable > 0 \? 'vault_ready' : 'vault_funding_required'/);
  assert.match(payload, /accountCapacityUsd/);
  assert.match(payload, /paymentReadinessStatus/);
  assert.match(walletHome, /Cash \+ reported credit/);
  assert.match(headline, /\{label\}/);
  assert.match(creditSheet, /Whether a purchase can use it is[\s\S]*exact checked request/);
  assert.doesNotMatch(creditSheet, /purchases can use this/);
});
