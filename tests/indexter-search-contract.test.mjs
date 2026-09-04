import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const entry = read('apps-sdk/ui/src/entries/indexter-search.tsx');
const summaryHeader = read('apps-sdk/ui/src/components/indexter/search/IndexterSummaryHeader.tsx');
const brief = read('apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.tsx');
const briefModel = read('apps-sdk/ui/src/components/indexter/search/SearchDecisionBrief.model.ts');
const comparison = read('apps-sdk/ui/src/components/indexter/search/SearchComparisonPanel.tsx');
const inlineDetail = read('apps-sdk/ui/src/components/indexter/search/SearchInlineDetail.tsx');
const drawer = read('apps-sdk/ui/src/components/indexter/search/SearchVerdictDrawer.tsx');
const model = read('apps-sdk/ui/src/components/indexter/search/search-model.ts');
const response = read('packages/x402-core/src/response.ts');
const css = read('apps-sdk/ui/src/styles/widgets/indexter-search.css');
const baseCss = read('apps-sdk/ui/src/styles/base.css');
const register = read('apps-sdk/register.mjs');
const toolContracts = read('lib/open-tool-contracts.mjs');
const indexterHtml = read('apps-sdk/ui/indexter-search.html');
const compatibilityHtml = read('apps-sdk/ui/x402-marketplace-search.html');
const continuation = read('apps-sdk/ui/src/components/x402/purchase-review-continuation.ts');
const indexterContinuation = read('apps-sdk/ui/src/components/indexter/search/indexter-continuation.ts');
const actionSources = `${entry}\n${brief}\n${drawer}\n${continuation}\n${indexterContinuation}`;

test('error rendering precedes the genuine-empty branch', () => {
  assert.ok(entry.indexOf('if (searchError)') >= 0);
  assert.ok(entry.indexOf('if (resources.length === 0)') > entry.indexOf('if (searchError)'));
  assert.match(model, /searchMeta\?\.mode === 'error'/);
  assert.match(model, /searchMeta\?\.note\?\.trim\(\)/);
});

test('degraded ranking guidance remains visible when fallback search is empty', () => {
  assert.match(
    entry,
    /if \(resources\.length === 0\)[\s\S]*?const emptyCopy = searchGuidance[\s\S]*?<IndexterLockup \/>[\s\S]*?<p title=\{emptyCopy\}>\{emptyCopy\}<\/p>/,
  );
});

test('search can only open a safe next step before payment', () => {
  assert.doesNotMatch(entry, /callTool\(/);
  assert.match(entry, /sendFollowUp\(indexterCheckContinuationPrompt\(reference\)\)/);
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
  assert.match(entry, /indexterCheckContinuationPrompt/);
  assert.match(indexterContinuation, /indexter_result_continuation_v2/);
  assert.match(indexterContinuation, /searchResultSetId/);
  assert.match(indexterContinuation, /searchResultOrdinal/);
  assert.match(indexterContinuation, /currentResultCount/);
  assert.match(indexterContinuation, /Call x402_check once/);
  assert.match(indexterContinuation, /do not make a payment/);
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

test('comparison disclosures share one bounded, ordinal-safe region', () => {
  assert.match(entry, /const comparisonRegionId = useId\(\)/);
  assert.equal(
    entry.match(/comparisonId=\{comparisonRegionId\}/g)?.length,
    3,
  );
  assert.match(
    entry,
    /\{!comparisonOpen && \(/,
  );
  assert.doesNotMatch(entry, /\{\(!comparisonOpen \|\| isFullscreen\) && \(/);
  assert.match(summaryHeader, /aria-controls=\{comparisonId\}/);
  assert.match(summaryHeader, /aria-expanded=\{comparisonOpen\}/);
  assert.match(brief, /aria-controls=\{comparisonId\}/);
  assert.match(brief, /aria-expanded=\{comparisonOpen\}/);
  assert.match(comparison, /const CONDENSED_PAGE_SIZE = 1/);
  assert.match(comparison, /const INLINE_PAGE_SIZE = 2/);
  assert.match(comparison, /ordinal: index \+ 1/);
  assert.match(
    comparison,
    /const visibleResources = isFullscreen\s*\? indexedResources\s*: indexedResources\.slice\(pageStart, pageStart \+ pageSize\)/,
  );
  assert.match(comparison, />\s*Previous\s*</);
  assert.match(comparison, />\s*Next\s*</);
  assert.match(comparison, /\{rangeStart\}–\{rangeEnd\} of \{resources\.length\}/);
  assert.doesNotMatch(comparison, /showAll|setShowAll|Show \{hiddenCount\} more/);
  assert.match(
    entry,
    /comparisonOpen && detailOpen && !isFullscreen[\s\S]*?id=\{comparisonRegionId\}[\s\S]*?id=\{detailRegionId\}/,
  );
  assert.match(entry, /showComparison \? \([\s\S]*?<SearchComparisonPanel/);
  assert.match(entry, /comparisonOpen && detailOpen && !isMobile && isFullscreen/);
  assert.match(entry, /comparisonOpen && detailOpen && isMobile && isFullscreen/);
  assert.doesNotMatch(inlineDetail, /SearchVerdictDrawer|\bfetch\s*\(/);
  assert.match(inlineDetail, />Back</);
  assert.match(inlineDetail, /<span>\{ordinal\} of \{resultCount\}<\/span>/);
});

test('inline copy is bounded while full labels remain available', () => {
  assert.match(entry, /<h1 title=\{loadingTitle\}>\{loadingTitle\}<\/h1>/);
  assert.match(entry, /<h1 title=\{emptyTitle\}>\{emptyTitle\}<\/h1>/);
  assert.match(entry, /<h1 title=\{queryHeading\}>\{queryHeading\}<\/h1>/);
  assert.match(css, /\.dx-search-shell--inline \.dx-search-query h1[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(css, /\.dx-search-shell--inline \.dx-search-state h1[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(css, /\.dx-search-shell--inline \.dx-search-state p[\s\S]*?-webkit-line-clamp: 3/);
  assert.match(css, /\.dx-search-inline-detail__why,[\s\S]*?\.dx-search-inline-detail__safety[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(inlineDetail, /const description = resource\.description\.trim\(\)/);
  assert.match(inlineDetail, /className="dx-search-inline-detail__description"/);
  assert.match(css, /\.dx-search-inline-detail__description[\s\S]*?-webkit-line-clamp: 2/);
});

test('needs labels remain sentence case', () => {
  const inlineNeedsRule = css.match(
    /\.dx-search-inline-detail__needs span\s*\{([^}]*)\}/,
  )?.[1] ?? '';
  const drawerNeedsRule = css.match(
    /\.dx-search-drawer__request dt\s*\{([^}]*)\}/,
  )?.[1] ?? '';

  assert.ok(inlineNeedsRule);
  assert.ok(drawerNeedsRule);
  assert.doesNotMatch(inlineNeedsRule, /text-transform\s*:\s*uppercase/i);
  assert.doesNotMatch(drawerNeedsRule, /text-transform\s*:\s*uppercase/i);
});

test('comparison identifies the displayed network as the primary payment route', () => {
  assert.match(comparison, /summary\.paymentRouteCount > 1/);
  assert.match(comparison, /primary route on/);
});

test('late fullscreen responses are corrected to the latest requested mode', () => {
  assert.match(entry, /const desiredDisplayMode = useRef/);
  assert.match(entry, /const displayModeRequestId = useRef\(0\)/);
  assert.match(entry, /const comparisonRequestedFullscreen = useRef\(false\)/);
  assert.match(entry, /activeRequestId !== displayModeRequestId\.current/);
  assert.match(entry, /desiredMode !== requestedMode/);
  assert.match(entry, /correct_stale_display_mode/);
  assert.match(entry, /const shouldRequestFullscreen = !isFullscreen && canToggleFullscreen/);
  assert.match(entry, /const shouldRestoreInline = comparisonRequestedFullscreen\.current/);
  assert.match(
    entry,
    /if \(requestDisplayMode && shouldRestoreInline\) \{\s*requestHostMode\('inline', 'close_comparison'\)/,
  );
});

test('condensed comparison and detail use bounded content, not clipping or scrolling', () => {
  assert.match(entry, /maxHeight !== null && maxHeight <= 360/);
  assert.match(css, /\.dx-search-shell--condensed \.dx-search-compare__rationale[\s\S]*?display: none/);
  assert.match(css, /\.dx-search-shell--condensed \.dx-search-compare__pagination[\s\S]*?minmax\(72px, 1fr\)/);
  assert.match(css, /\.dx-search-shell--condensed \.dx-search-inline-detail[\s\S]*?gap: 6px/);
  assert.match(
    css,
    /\.dx-search-shell--condensed \.dx-search-inline-detail__why,[\s\S]*?\.dx-search-shell--condensed \.dx-search-inline-detail__safety[\s\S]*?display: none/,
  );
  assert.doesNotMatch(css, /\.dx-search-shell--condensed[^}]*overflow-y:\s*(?:auto|scroll)/);
});

test('active and compatibility surfaces use the canonical Indexter Search title', () => {
  assert.equal((register.match(/title: 'Indexter Search'/g) ?? []).length, 2);
  assert.match(toolContracts, /indexter_search:[\s\S]*?title: 'Indexter Search'/);
  assert.doesNotMatch(toolContracts, /title: 'Search Indexter'/);
  assert.match(indexterHtml, /<title>Indexter Search<\/title>/);
  assert.match(compatibilityHtml, /<title>Indexter Search<\/title>/);
});

test('dual-host adapters and capability-driven fullscreen are wired locally', () => {
  assert.match(entry, /useAdaptiveSendFollowUp/);
  assert.match(entry, /indexterCheckContinuationPrompt/);
  assert.doesNotMatch(entry, /useAdaptiveCallToolFn|callTool\(/);
  assert.match(entry, /useToolInput as useAdaptiveToolInput/);
  assert.match(entry, /useAdaptiveHostCapabilities/);
  assert.match(entry, /useAdaptiveDisplayMode/);
  assert.match(entry, /useAdaptiveRequestDisplayMode/);
  assert.match(entry, /availableDisplayModes\.includes\('fullscreen'\)/);
  assert.doesNotMatch(entry, /isChatGpt/);
  assert.doesNotMatch(entry, /window\.openai/);
});

test('current build stamp, merchant hierarchy, evidence, and dead-code removals are pinned', () => {
  assert.match(model, /SEARCH_WIDGET_BUILD = '2026-09-04\.1'/);
  assert.doesNotMatch(entry, /2026-04-16\.1/);
  assert.match(briefModel, /resource\.why/);
  assert.match(briefModel, /resource\.qualityScore/);
  assert.match(briefModel, /primaryRoute\?\.priceLabel/);
  assert.match(briefModel, /primaryRoute\?\.priceUsdc/);
  assert.match(briefModel, /safetyWarning/);
  assert.match(brief, /dx-search-safety-note/);
  assert.match(comparison, /dx-search-safety-note/);
  assert.match(drawer, /dx-search-safety-note/);
  assert.match(brief, /merchantLabel\(actionTarget\)/);
  assert.match(comparison, /merchantLabel\(resource\)/);
  assert.match(drawer, /merchantLabel\(resource\)/);
  assert.match(brief, /compactEvidenceLabel/);
  assert.match(comparison, /compactEvidenceLabel/);
  assert.match(drawer, /compactEvidenceLabel/);
  assert.doesNotMatch(drawer, /formatAssetLabel|ChainIcon|resource\.method|resource\.url|payTo|chains-list/);
  assert.match(comparison, /Compare services/);
  assert.match(css, /\.dxs-root/);
  assert.match(css, /--dxs-page: var\(--dx-canvas\)/);
  assert.match(baseCss, /--color-background-primary/);
  assert.match(css, /\.dx-search-brief/);
  assert.doesNotMatch(css, /\.dx-search-quote/);
  assert.match(css, /\.dx-search-compare/);
  assert.doesNotMatch(css, /\.dx-search-loading/);

  for (const orphan of [
    'apps-sdk/ui/src/components/indexter/search/SearchVerdictRow.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchResultCard.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchResourceDetail.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchScoreBadge.tsx',
    'apps-sdk/ui/src/components/indexter/search/SearchQuotePanel.tsx',
  ]) {
    assert.equal(existsSync(path.join(repoRoot, orphan)), false, `${orphan} should be removed`);
  }
});
