import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('governed-action family is read-only and covers action plus history states', async () => {
  const [component, history, model, compatibility, styles] = await Promise.all([
    source('apps-sdk/ui/src/components/governed-action/GovernedActionView.tsx'),
    source('apps-sdk/ui/src/components/governed-action/GovernedHistoryView.tsx'),
    source('apps-sdk/ui/src/components/governed-action/governed-action-model.ts'),
    source('apps-sdk/ui/src/components/stock-trade/StockTradeCard.tsx'),
    source('apps-sdk/ui/src/styles/widgets/stock-trade.css'),
  ]);

  assert.doesNotMatch(component, /useCallTool|callTool\s*\(/);
  assert.doesNotMatch(component, /sendFollowUpMessage|useAdaptiveSendFollowUp/);
  assert.doesNotMatch(history, /useCallTool|callTool\s*\(/);
  assert.doesNotMatch(history, /sendFollowUpMessage|useAdaptiveSendFollowUp/);
  assert.match(component, /useAdaptiveOpenExternal/);
  assert.match(component, /View on Solscan/);
  assert.match(component, /data-evidence="commitment"/);
  assert.match(component, /data-evidence="execution"/);
  assert.match(component, /xstocks-symbol-gradient\.svg/);
  assert.match(component, /XSTOCKS_LEGAL_ISSUER/);
  assert.doesNotMatch(component, /product\.symbol\s*===\s*['"]SPCX/);
  assert.doesNotMatch(component, /productName\(model\)\s*===\s*['"]SpaceX/);
  assert.match(component, /label: 'Legal issuer'/);
  assert.match(component, /model\.action === 'send'/);
  assert.match(component, /Owner approval/);
  assert.match(component, /Approval belongs in Dexter Wallet/);
  assert.match(component, /This view cannot grant it or execute the action/);
  assert.match(component, /label: 'Operation'/);
  assert.match(component, /label: 'Status read', value: 'Read-only'/);
  assert.match(component, /label: 'Execute from status', value: 'Forbidden'/);
  assert.match(history, /<button/);
  assert.match(history, /GovernedActionDetail/);
  assert.match(history, /More history is available on the next page/);
  assert.match(compatibility, /GovernedActionView as StockTradeCard/);
  assert.doesNotMatch(component, /WidgetHeader|WidgetSection/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|box-shadow/);
  assert.doesNotMatch(styles, /border-left|border-top|border-right|border-bottom/);
  assert.match(styles, /background: transparent/);
  assert.match(model, /input\.signature !== null/);
  assert.match(model, /input\.commitment !== null/);
  assert.match(model, /input\.executionSucceeded === true/);
  assert.match(model, /Finalization is optional evidence, never a gate/);
  assert.doesNotMatch(model, /accountDeltaMatchesExpected[^\n]*=== true[\s\S]{0,120}stage/);
  assert.match(model, /Do not execute again\. Reconcile this same intent and attempt only\./);
  assert.match(model, /normalizeGovernedHistory/);
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
