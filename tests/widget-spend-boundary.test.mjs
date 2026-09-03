import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
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
    fetchResult.indexOf('<ReturnedResult data={result}')
      < fetchResult.indexOf('<LifecycleSummary'),
    'returned payload must render before lifecycle proof',
  );
  assert.doesNotMatch(fetchResult, /ReceiptHeader|DebugPanel|__eyebrow/);
  assert.doesNotMatch(styles, /gradient|dashed|box-shadow|border-left|border-inline-start/i);
  assert.doesNotMatch(
    lifecycleSources,
    /purchaseReceipt|normalizePurchaseReceipt|toolOutput\.mode|direct_exact|native_tab/,
  );
});

test('funding widget requests a fresh approval in chat instead of retrying payment', async () => {
  const funding = await source('apps-sdk/ui/src/components/receipt/SessionFunding.tsx');
  assert.doesNotMatch(funding, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.doesNotMatch(funding, /useCallToolFn/);
  assert.match(funding, /useAdaptiveSendFollowUp/);
  assert.match(funding, /ask for fresh approval before any payment/);
  assert.match(funding, /continue in chat/);
});
