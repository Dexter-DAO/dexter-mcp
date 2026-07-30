import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const entry = read('apps-sdk/ui/src/entries/x402-marketplace-search.tsx');
const brief = read('apps-sdk/ui/src/components/x402/search/SearchDecisionBrief.tsx');
const briefModel = read('apps-sdk/ui/src/components/x402/search/SearchDecisionBrief.model.ts');
const quote = read('apps-sdk/ui/src/components/x402/search/SearchQuotePanel.tsx');
const comparison = read('apps-sdk/ui/src/components/x402/search/SearchComparisonPanel.tsx');
const drawer = read('apps-sdk/ui/src/components/x402/search/SearchVerdictDrawer.tsx');
const model = read('apps-sdk/ui/src/components/x402/search/search-model.ts');
const response = read('packages/x402-core/src/response.ts');
const css = read('apps-sdk/ui/src/styles/widgets/x402-search.css');
const actionSources = `${entry}\n${brief}\n${quote}\n${drawer}`;

test('error rendering precedes the genuine-empty branch', () => {
  assert.ok(entry.indexOf('if (searchError)') >= 0);
  assert.ok(entry.indexOf('if (resources.length === 0)') > entry.indexOf('if (searchError)'));
  assert.match(model, /searchMeta\?\.mode === 'error'/);
  assert.match(model, /searchMeta\?\.note\?\.trim\(\)/);
});

test('search can only open a fresh pricing check', () => {
  assert.match(entry, /callTool\('x402_check'/);
  assert.doesNotMatch(actionSources, /callTool\(\s*['"]x402_fetch['"]/);
  assert.doesNotMatch(actionSources, /\bx402_pay\b/);
  assert.doesNotMatch(actionSources, /\bonFetch\b/);
  assert.match(brief, /Use this service/);
  assert.match(drawer, /Use this service/);
  assert.doesNotMatch(actionSources, /Check fresh price/);
  assert.match(entry, /normalizeX402CheckResult/);
  assert.match(entry, /structuredContent/);
  assert.match(entry, /call x402_fetch once with only intentId/);
  assert.match(entry, /Connect OpenDexter, then repeat x402_check/);
  assert.doesNotMatch(
    entry,
    /call x402_fetch once with (?:url|method|body)/i,
  );
  assert.doesNotMatch(
    actionSources,
    /preparedPurchase|purchaseOptions|purchase mode|omit purchase/i,
  );
  assert.match(quote, /Nothing has been charged/);
  assert.doesNotMatch(response, /Use x402_fetch/);
  assert.match(response, /run x402_check/);
  assert.match(response, /explicitly approves the checked terms/);
});

test('featured ranking and user selection remain separate states', () => {
  assert.match(briefModel, /const recommended = resources\[0\] \?\? null/);
  assert.match(briefModel, /const selected =\s+resources\.find/);
  assert.match(briefModel, /const actionTarget = selected \?\? recommended/);
  assert.doesNotMatch(entry, /resources\[0\]\?\.url/);
  assert.doesNotMatch(model, /resources\[0\]/);
});

test('dual-host adapters and capability-driven fullscreen are wired locally', () => {
  assert.match(entry, /useAdaptiveCallToolFn/);
  assert.match(entry, /useToolInput as useAdaptiveToolInput/);
  assert.match(entry, /useAdaptiveHostCapabilities/);
  assert.match(entry, /useAdaptiveDisplayMode/);
  assert.match(entry, /useAdaptiveRequestDisplayMode/);
  assert.match(entry, /availableDisplayModes\.includes\('fullscreen'\)/);
  assert.doesNotMatch(entry, /isChatGpt/);
  assert.doesNotMatch(entry, /window\.openai/);
});

test('current build stamp, result evidence, tokens, and dead-code removals are pinned', () => {
  assert.match(model, /SEARCH_WIDGET_BUILD = '2026-07-25\.3'/);
  assert.doesNotMatch(entry, /2026-04-16\.1/);
  assert.match(briefModel, /resource\.why/);
  assert.match(briefModel, /resource\.qualityScore/);
  assert.match(briefModel, /primaryRoute\?\.priceLabel/);
  assert.match(briefModel, /primaryRoute\?\.priceUsdc/);
  assert.match(quote, /formatAssetLabel\(route\.asset\)/);
  assert.match(quote, /route\.routeKey/);
  assert.match(drawer, /assetLabel: formatAssetLabel\(chain\.asset\)/);
  assert.match(drawer, /dx-search-drawer__chain-asset/);
  assert.match(comparison, /Compare services/);
  assert.match(css, /\.dxs-root/);
  assert.match(css, /--color-background-primary/);
  assert.match(css, /\.dx-search-brief/);
  assert.match(css, /\.dx-search-quote/);
  assert.match(css, /\.dx-search-compare/);
  assert.doesNotMatch(css, /\.dx-search-loading/);

  for (const orphan of [
    'apps-sdk/ui/src/components/x402/search/SearchVerdictRow.tsx',
    'apps-sdk/ui/src/components/x402/search/SearchResultCard.tsx',
    'apps-sdk/ui/src/components/x402/search/SearchResourceDetail.tsx',
    'apps-sdk/ui/src/components/x402/search/SearchScoreBadge.tsx',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, orphan)), false, `${orphan} should be removed`);
  }
});
