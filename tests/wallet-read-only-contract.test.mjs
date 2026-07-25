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
  const registration = server.slice(
    server.indexOf("server.registerTool('x402_wallet'"),
    server.indexOf("// ─── dexter_passkey_probe", server.indexOf("server.registerTool('x402_wallet'")),
  );

  assert.match(registration, /inputSchema:\s*\{\}/);
  assert.match(registration, /readOnlyHint:\s*true/);
  assert.doesNotMatch(registration, /walletAddress|user_handle|userHandle/);
});

test('hosted x402_wallet wires portfolio through its transport session and verified receive address', async () => {
  const server = await source('open-mcp-server.mjs');
  const walletImplementation = server.slice(
    server.indexOf('async function x402Wallet'),
    server.indexOf('// ─── MCP Server Setup', server.indexOf('async function x402Wallet')),
  );

  assert.match(walletImplementation, /fetchSessionPortfolio\(\{/);
  assert.match(walletImplementation, /sessionId,/);
  assert.match(walletImplementation, /expectedWalletAddress:\s*receiveAddress/);
  assert.match(walletImplementation, /secret:\s*INTERNAL_HMAC_SECRET/);
  assert.match(walletImplementation, /portfolio,/);
});
