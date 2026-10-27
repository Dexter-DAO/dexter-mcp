import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

function cssRule(sourceText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sourceText.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('pricing widget continues in chat instead of invoking a money tool', async () => {
  const [pricing, continuation, action, pricingTypes] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-pricing.tsx'),
    source('apps-sdk/ui/src/components/x402/purchase-review-continuation.ts'),
    source('apps-sdk/ui/src/components/pricing/FetchAction.tsx'),
    source('apps-sdk/ui/src/components/pricing/types.ts'),
  ]);
  assert.doesNotMatch(pricing, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.match(pricing, /useAdaptiveSendFollowUp/);
  assert.match(pricing, /purchaseReviewContinuationPrompt/);
  assert.match(continuation, /maxAmountAtomic/);
  assert.match(continuation, /call x402_fetch once/);
  assert.match(continuation, /Never automatically retry x402_fetch/);
  assert.match(continuation, /retryWithSameIntentOnly true/);
  assert.match(pricing, /returned no executable purchase intent/);
  assert.match(pricing, /Do not call x402_fetch or ask the user to connect again/);
  assert.match(pricing, /state\.classification === 'free'/);
  assert.match(pricing, /Object\.prototype\.hasOwnProperty\.call\(toolOutput, 'data'\)/);
  assert.match(pricing, /data=\{returnedResult\}/);
  assert.doesNotMatch(pricing, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(
    `${pricing}\n${continuation}`,
    /call x402_fetch once with (?:url|method|body)/i,
  );
  assert.doesNotMatch(
    pricing,
    /preparedPurchase|purchaseOptions|purchase mode|omit purchase/i,
  );
  assert.match(action, /Review payment/);
  assert.match(action, /Complete request/);
  assert.match(pricingTypes, /body\?: string/);
  assert.doesNotMatch(pricingTypes, /sampleInputBody/);
});

test('fetch result reports one intent lifecycle and never interprets rail modes', async () => {
  const [fetchResult, lifecycleModel, loading, server, styles] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-fetch-result.tsx'),
    source('apps-sdk/ui/src/components/x402/fetch-result-model.ts'),
    source('apps-sdk/ui/src/components/receipt/ReceiptLoading.tsx'),
    source('open-mcp-server.mjs'),
    source('apps-sdk/ui/src/styles/widgets/x402-fetch-result.css'),
  ]);
  const lifecycleSources = `${fetchResult}\n${lifecycleModel}`;
  assert.match(fetchResult, /normalizeIntentLifecycle/);
  assert.match(lifecycleSources, /x402_status/);
  assert.match(lifecycleSources, /Delivery/);
  assert.match(lifecycleSources, /Payment/);
  assert.match(lifecycleSources, /Reconciliation/);
  assert.match(lifecycleSources, /Reservation/);
  assert.match(fetchResult, /Review in Dexter/);
  assert.match(lifecycleModel, /dispatchBoundary\(payload\.dispatch\)/);
  assert.match(loading, /MISSING_TOOL_RESULT_TIMEOUT_SECONDS/);
  assert.match(loading, /dx-receipt-error/);
  assert.doesNotMatch(
    loading,
    /Submitting payment|Awaiting settlement|Payment cleared|settlement landed|seller is taking longer/i,
  );
  assert.match(server, /'Waiting for OpenDexter…', 'OpenDexter result received'/);
  assert.doesNotMatch(server, /X402_WIDGET_URIS\.fetch, 'Calling API/);
  assert.match(fetchResult, /startsWith\('https:\/\/dexter\.cash\/'\)/);
  assert.match(
    server,
    /const STATUS_META = readOnlyResultWidgetMeta\(\s*X402_WIDGET_URIS\.fetch/,
  );
  assert.ok(
    fetchResult.indexOf('<LifecycleSummary')
      < fetchResult.indexOf('<ReturnedResult'),
    'verified lifecycle evidence must render before the provider response',
  );
  assert.match(fetchResult, /Provider response/);
  assert.match(fetchResult, /data-image-density=\{compactImage \? 'compact' : 'regular'\}/);
  assert.match(styles, /data-image-density='compact'[\s\S]*max-height:\s*220px/);
  assert.match(styles, /dx-fetch-result-frame--fullscreen[\s\S]*max-height:\s*1200px/);
  assert.doesNotMatch(fetchResult, /ReceiptHeader|DebugPanel|__eyebrow/);
  assert.doesNotMatch(styles, /gradient|dashed|box-shadow|border-left|border-inline-start/i);
  assert.doesNotMatch(
    lifecycleSources,
    /purchaseReceipt|normalizePurchaseReceipt|toolOutput\.mode|direct_exact|native_tab/,
  );
});

test('x402 protocol renderers leave framing and height to the host', async () => {
  const [
    pricing,
    pricingStyles,
    paymentRoutes,
    fetchResult,
    fetchStyles,
    returnedResult,
    returnedResultStyles,
  ] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-pricing.tsx'),
    source('apps-sdk/ui/src/styles/widgets/x402-pricing.css'),
    source('apps-sdk/ui/src/components/pricing/PaymentRoutes.tsx'),
    source('apps-sdk/ui/src/entries/x402-fetch-result.tsx'),
    source('apps-sdk/ui/src/styles/widgets/x402-fetch-result.css'),
    source('apps-sdk/ui/src/components/x402/ReturnedResult.tsx'),
    source('apps-sdk/ui/src/styles/widgets/returned-result.css'),
  ]);
  const pricingRoot = cssRule(pricingStyles, '.dx-pricing');
  const resultFrame = cssRule(fetchStyles, '.dx-fetch-result-frame');
  const resultRoot = cssRule(fetchStyles, '.dx-result');

  for (const entry of [pricing, fetchResult]) {
    assert.match(entry, /useIntrinsicHeight/);
    assert.match(entry, /data-host-max-height/);
    assert.doesNotMatch(entry, /style=\{\{[^}]*maxHeight/);
    assert.match(entry, /Ask in chat for the full result/);
    assert.doesNotMatch(entry, /isFullscreen \|\| !canToggleFullscreen \? null/);
  }
  assert.match(pricing, /maxLines=\{returnedResultLineLimit\}/);
  assert.match(fetchResult, /maxLines=\{resultPreviewLines\}/);
  for (const rootRule of [pricingRoot, resultFrame, resultRoot]) {
    assert.match(rootRule, /background:\s*transparent/);
    assert.doesNotMatch(rootRule, /\bmax-height\s*:/);
    assert.doesNotMatch(rootRule, /\boverflow(?:-y)?\s*:\s*auto/);
    assert.doesNotMatch(rootRule, /\bborder-radius\s*:|\bbox-shadow\s*:/);
  }
  assert.match(resultFrame, /overflow:\s*visible/);
  assert.doesNotMatch(returnedResultStyles, /overflow(?:-y)?\s*:\s*(?:auto|scroll)/);
  assert.match(
    cssRule(returnedResultStyles, '.dx-result-payload--image img'),
    /max-height:\s*480px/,
  );
  assert.doesNotMatch(
    cssRule(returnedResultStyles, '.dx-result-payload--json'),
    /max-height\s*:/,
  );
  assert.ok(returnedResult.includes("value.split('\\n').length > maxLines"));
  assert.doesNotMatch(paymentRoutes, /shortRecipient/);
  assert.doesNotMatch(paymentRoutes, />\s*Recipient\s*<|\{route\.payTo\}|base units/i);
  assert.match(paymentRoutes, /routePresentationKey/);
  assert.doesNotMatch(fetchResult, /displayIntent/);
  assert.match(fetchResult, /<dd>\{lifecycle\.intentId\}<\/dd>/);
});

test('presentation metadata helpers do not grant renderer tool authority', async () => {
  const server = await source('open-mcp-server.mjs');
  const start = server.indexOf('function widgetMeta(');
  const end = server.indexOf('const DISCOVERY_META_BASE =');
  assert.ok(start >= 0 && end > start);
  const presentationHelpers = server.slice(start, end);
  assert.doesNotMatch(presentationHelpers, /\bvisibility\s*:/);
  assert.doesNotMatch(presentationHelpers, /openai\/widgetAccessible/);
});

test('Indexter opens x402_check through chat instead of direct widget authority', async () => {
  const [entry, continuation, { OPEN_TOOL_CONTRACTS }] = await Promise.all([
    source('apps-sdk/ui/src/entries/indexter-search.tsx'),
    source('apps-sdk/ui/src/components/indexter/search/indexter-continuation.ts'),
    import(new URL('../lib/open-tool-contracts.mjs', import.meta.url)),
  ]);
  assert.doesNotMatch(entry, /callTool\(/);
  assert.match(entry, /sendFollowUp\(indexterCheckContinuationPrompt\(reference\)\)/);
  assert.match(continuation, /Call x402_check once/);
  assert.match(continuation, /do not make a payment/);
  assert.deepEqual([...OPEN_TOOL_CONTRACTS.indexter_discover.visibility], ['model', 'app']);
  assert.equal(OPEN_TOOL_CONTRACTS.indexter_discover.widgetAccessible, true);
  for (const name of ['indexter_search', 'x402_check', 'x402_fetch']) {
    assert.deepEqual([...OPEN_TOOL_CONTRACTS[name].visibility], ['model']);
    assert.equal(OPEN_TOOL_CONTRACTS[name].widgetAccessible, false);
  }
});

test('funding widget requests a fresh approval in chat instead of retrying payment', async () => {
  const funding = await source('apps-sdk/ui/src/components/receipt/SessionFunding.tsx');
  assert.doesNotMatch(funding, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.doesNotMatch(funding, /useCallToolFn/);
  assert.doesNotMatch(funding, /api\.qrserver\.com/);
  assert.match(funding, /createLocalQrGraphic/);
  assert.match(funding, /useAdaptiveSendFollowUp/);
  assert.match(funding, /ask for fresh approval before any payment/);
  assert.match(funding, /continue in chat/);
});
