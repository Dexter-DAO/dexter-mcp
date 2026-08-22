import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('stock-trade widget is a read-only receipt and never initiates execution', async () => {
  const [component, model, server] = await Promise.all([
    source('apps-sdk/ui/src/components/stock-trade/StockTradeCard.tsx'),
    source('apps-sdk/ui/src/components/stock-trade/stock-trade-model.ts'),
    source('open-mcp-server.mjs'),
  ]);

  assert.doesNotMatch(component, /useCallTool|callTool\s*\(/);
  assert.doesNotMatch(component, /sendFollowUpMessage|useAdaptiveSendFollowUp/);
  assert.match(component, /useAdaptiveOpenExternal/);
  assert.match(component, /View on Solscan/);
  assert.match(component, /data-evidence="commitment"/);
  assert.match(component, /data-evidence="execution"/);
  assert.match(component, /Provider: \$\{provider\}/);
  assert.match(component, /aria-label="Provider: xStocks"/);
  assert.match(component, /xstocks-symbol-gradient\.svg/);
  assert.match(component, /XSTOCKS_LEGAL_ISSUER/);
  assert.doesNotMatch(component, /product\.symbol\s*===\s*['"]SPCX/);
  assert.doesNotMatch(component, /productName\(model\)\s*===\s*['"]SpaceX/);
  assert.match(component, /<dt>Legal issuer<\/dt>/);
  assert.match(component, /model\.isShareQuantityOrder/);
  assert.match(component, /token units/);
  assert.doesNotMatch(component, /Issued by/);
  assert.match(server, /'openai\/widgetAccessible': false/);
  assert.match(server, /GOVERNED_ASSET_WIDGET_URIS\.stockTrade/);

  assert.match(model, /input\.signature !== null/);
  assert.match(model, /input\.commitment !== null/);
  assert.match(model, /input\.executionSucceeded === true/);
  assert.match(model, /Finalization is optional evidence, never a gate/);
  assert.doesNotMatch(model, /accountDeltaMatchesExpected[^\n]*=== true[\s\S]{0,120}stage/);
});

test('xStocks provider visual uses the unmodified official gradient symbol', async () => {
  const symbol = await source(
    'apps-sdk/ui/src/assets/xstocks-symbol-gradient.svg',
  );
  assert.match(symbol, /viewBox="0 0 800 801"/);
  assert.match(symbol, /stop-color="#6EC7E2"/);
  assert.match(symbol, /stop-color="#1FD59A"/);
  assert.match(symbol, /M800 6\.00637C800 2\.78947/);
});

test('built stock-trade HTML has one current, fully materialized asset closure', async () => {
  const html = await source('public/apps-sdk/stock-trade.html');
  const references = Array.from(
    html.matchAll(/(?:src|href)="\.\/([^"]+)"/g),
    (match) => match[1],
  );
  assert.ok(references.length > 0);
  for (const reference of references) {
    await access(new URL(`public/apps-sdk/${reference}`, ROOT));
  }

  const stockScript = references.find((reference) =>
    /^assets\/stock-trade-[A-Za-z0-9_-]+\.js$/.test(reference));
  assert.ok(stockScript, 'built HTML must reference one hashed stock script');
  const assets = await readdir(new URL('public/apps-sdk/assets/', ROOT));
  assert.deepEqual(
    assets.filter((name) => /^stock-trade-[A-Za-z0-9_-]+\.js$/.test(name)),
    [stockScript.replace('assets/', '')],
    'no stale stock JavaScript bundle may survive the build',
  );

  const script = await source(`public/apps-sdk/${stockScript}`);
  const imports = Array.from(
    script.matchAll(/from "\.\/([^"]+)"/g),
    (match) => match[1],
  );
  assert.ok(imports.length > 0);
  for (const dependency of imports) {
    await access(new URL(`public/apps-sdk/assets/${dependency}`, ROOT));
  }
});
