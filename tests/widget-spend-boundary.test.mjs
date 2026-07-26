import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('pricing widget continues in chat instead of invoking a money tool', async () => {
  const [pricing, action] = await Promise.all([
    source('apps-sdk/ui/src/entries/x402-pricing.tsx'),
    source('apps-sdk/ui/src/components/pricing/FetchAction.tsx'),
  ]);
  assert.doesNotMatch(pricing, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.match(pricing, /useAdaptiveSendFollowUp/);
  assert.match(pricing, /ask for my confirmation before paying/);
  assert.match(action, /Continue in chat/);
});

test('funding widget requests a fresh approval in chat instead of retrying payment', async () => {
  const funding = await source('apps-sdk/ui/src/components/receipt/SessionFunding.tsx');
  assert.doesNotMatch(funding, /callTool\(\s*['"]x402_(?:fetch|pay)['"]/);
  assert.doesNotMatch(funding, /useCallToolFn/);
  assert.match(funding, /useAdaptiveSendFollowUp/);
  assert.match(funding, /ask for fresh approval before any payment/);
  assert.match(funding, /continue in chat/);
});
