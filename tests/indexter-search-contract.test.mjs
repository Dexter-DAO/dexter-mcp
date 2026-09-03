import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const entry = read('apps-sdk/ui/src/entries/indexter-search.tsx');
const brief = read('apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.tsx');
const briefModel = read('apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts');
const quote = read('apps-sdk/ui/src/components/indexter/search/SearchQuotePanel.tsx');
const comparison = read('apps-sdk/ui/src/components/indexter/search/SearchComparisonPanel.tsx');
const drawer = read('apps-sdk/ui/src/components/indexter/search/SearchVerdictDrawer.tsx');
const model = read('apps-sdk/ui/src/components/indexter/search/search-model.ts');
const response = read('packages/x402-core/src/response.ts');
const css = read('apps-sdk/ui/src/styles/widgets/indexter-search.css');
const baseCss = read('apps-sdk/ui/src/styles/base.css');
const continuation = read('apps-sdk/ui/src/components/x402/purchase-review-continuation.ts');
const indexterContinuation = read('apps-sdk/ui/src/components/indexter/search/indexter-continuation.ts');
const actionSources = `${entry}\n${brief}\n${quote}\n${drawer}\n${continuation}\n${indexterContinuation}`;

test('error rendering precedes the genuine-empty branch', () => {
  assert.ok(entry.indexOf('if (searchError)') >= 0);
  assert.ok(entry.indexOf('if (resources.length === 0)') > entry.indexOf('if (searchError)'));
  assert.match(model, /searchMeta\?\.mode === 'error'/);
  assert.match(model, /searchMeta\?\.note\?\.trim\(\)/);
});

test('degraded ranking guidance remains visible when fallback search is empty', () => {
  assert.match(
    entry,
    /if \(resources\.length === 0\)[\s\S]*?<IndexterLockup \/>[\s\S]*?<p>\{searchGuidance \? `\$\{searchGuidance\} \$\{emptyDescription\}` : emptyDescription\}<\/p>/,
  );
});

test('search can only open a safe next step before payment', () => {
  assert.match(entry, /callTool\('x402_check'/);
  assert.match(entry, /buildDirectSearchCheckInput/);
  assert.match(entry, /buildDetailsFollowUpPrompt/);
  assert.doesNotMatch(actionSources, /callTool\(\s*['"]x402_fetch['"]/);
  assert.doesNotMatch(actionSources, /\bx402_pay\b/);
  assert.doesNotMatch(actionSources, /\bonFetch\b/);
  assert.match(briefModel, /Check live terms/);
  assert.match(briefModel, /Provide details in chat/);
  assert.match(briefModel, /SEARCH_CHECK_SUPPORTED_METHODS/);
  assert.match(briefModel, /provider reservation/);
  assert.doesNotMatch(brief, /Use this service/);
  assert.doesNotMatch(drawer, /Use this service/);
  assert.doesNotMatch(actionSources, /Check fresh price/);
  assert.match(entry, /normalizeX402CheckResult/);
  assert.match(entry, /structuredContent/);
  assert.match(entry, /indexterPurchaseContinuationPrompt/);
  assert.match(indexterContinuation, /indexter_result_continuation_v1/);
  assert.match(indexterContinuation, /searchResultOrdinal/);
  assert.match(indexterContinuation, /currentResultCount/);
  assert.match(entry, /modelContextBound = await Promise\.race/);
  assert.match(entry, /updateModelContext\(\{/);
  assert.match(entry, /modelContextBound/);
  assert.match(continuation, /call x402_fetch once/);
  assert.match(continuation, /Never automatically retry x402_fetch/);
  assert.match(continuation, /retryWithSameIntentOnly true/);
  assert.match(indexterContinuation, /returned no executable purchase intent/);
  assert.match(indexterContinuation, /Do not call x402_fetch or ask the user to connect again/);
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
  assert.match(response, /current instruction or delegated policy/);
  assert.match(response, /do not ask twice/);
  assert.doesNotMatch(response, /errorDetail:\s*error/);
});

test('featured ranking and user selection remain separate states', () => {
  assert.match(briefModel, /const recommended = resources\[0\] \?\? null/);
  assert.match(briefModel, /const selected = selectedIndex >= 0 \? resources\[selectedIndex\] : null/);
  assert.match(briefModel, /const actionTarget = selected \?\? recommended/);
  assert.match(entry, /selectedOrdinal/);
  assert.doesNotMatch(entry, /selectedUrl/);
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
  assert.match(model, /SEARCH_WIDGET_BUILD = '2026-09-03\.2'/);
  assert.doesNotMatch(entry, /2026-04-16\.1/);
  assert.match(briefModel, /resource\.why/);
  assert.match(briefModel, /resource\.qualityScore/);
  assert.match(briefModel, /primaryRoute\?\.priceLabel/);
  assert.match(briefModel, /primaryRoute\?\.priceUsdc/);
  assert.match(briefModel, /safetyWarning/);
  assert.match(brief, /dx-search-safety-note/);
  assert.match(comparison, /dx-search-safety-note/);
  assert.match(drawer, /dx-search-safety-note/);
  assert.match(quote, /formatAssetLabel\(route\.asset\)/);
  assert.match(quote, /route\.routeKey/);
  assert.match(drawer, /assetLabel: formatAssetLabel\(chain\.asset\)/);
  assert.match(drawer, /dx-search-drawer__chains-list/);
  assert.match(drawer, /<small>\{route\.assetLabel\}<\/small>/);
  assert.match(comparison, /Compare services/);
  assert.match(css, /\.dxs-root/);
  assert.match(css, /--dxs-page: var\(--dx-canvas\)/);
  assert.match(baseCss, /--color-background-primary/);
  assert.match(css, /\.dx-search-brief/);
  assert.match(css, /\.dx-search-quote/);
  assert.match(css, /\.dx-search-compare/);
  assert.doesNotMatch(css, /\.dx-search-loading/);

  for (const orphan of [
    'apps-sdk/ui/src/components/indexter/search/SearchVerdictRow.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchResultCard.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchResourceDetail.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchScoreBadge.tsx',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, orphan)), false, `${orphan} should be removed`);
  }
});
