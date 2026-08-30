import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('pricing widget continues in chat instead of invoking a money tool', async () => {
  const [pricing, action, pricingTypes] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-pricing.tsx'),
    source('apps-sdk/ui/src/components/pricing/FetchAction.tsx'),
    source('apps-sdk/ui/src/components/pricing/types.ts'),
  ]);
  assert.doesNotMatch(pricing, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.match(pricing, /useAdaptiveSendFollowUp/);
  assert.match(pricing, /Exact request:/);
  assert.match(pricing, /maxAmountAtomic/);
  assert.match(pricing, /call x402_fetch once with only intentId/);
  assert.match(pricing, /Connect OpenDexter, then repeat x402_check/);
  assert.match(pricing, /pass body as the exact raw string/);
  assert.doesNotMatch(
    pricing,
    /call x402_fetch once with (?:url|method|body)/i,
  );
  assert.doesNotMatch(
    pricing,
    /preparedPurchase|purchaseOptions|purchase mode|omit purchase/i,
  );
  assert.match(action, /Review payment/);
  assert.match(action, /Connect & re-check/);
  assert.match(pricingTypes, /body\?: string/);
  assert.doesNotMatch(pricingTypes, /sampleInputBody/);
});

test('fetch result reports one intent lifecycle and never interprets rail modes', async () => {
  const [fetchResult, lifecycleModel, loading, server] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-fetch-result.tsx'),
    source('apps-sdk/ui/src/components/x402/fetch-result-model.ts'),
    source('apps-sdk/ui/src/components/receipt/ReceiptLoading.tsx'),
    source('open-mcp-server.mjs'),
  ]);
  const lifecycleSources = `${fetchResult}\n${lifecycleModel}`;
  assert.match(fetchResult, /normalizeIntentLifecycle/);
  assert.match(lifecycleSources, /x402_status/);
  assert.match(lifecycleSources, /Delivery/);
  assert.match(lifecycleSources, /Payment/);
  assert.match(lifecycleSources, /Reconciliation/);
  assert.match(lifecycleSources, /Reservation/);
  assert.match(fetchResult, /Open Dexter consent/);
  assert.match(fetchResult, /toolOutput\.dispatch/);
  assert.match(loading, /MISSING_TOOL_RESULT_TIMEOUT_SECONDS/);
  assert.match(loading, /dx-receipt-error/);
  assert.doesNotMatch(
    loading,
    /Submitting payment|Awaiting settlement|Payment cleared|settlement landed|seller is taking longer/i,
  );
  assert.match(server, /'Waiting for OpenDexter…', 'OpenDexter result received'/);
  assert.doesNotMatch(server, /X402_WIDGET_URIS\.fetch, 'Calling API/);
  assert.match(fetchResult, /startsWith\('https:\/\/dexter\.cash\/'\)/);
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
