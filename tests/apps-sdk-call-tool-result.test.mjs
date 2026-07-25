import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCallToolResult } from '../apps-sdk/ui/src/sdk/call-tool-result.ts';

test('preserves the full MCP tool-result envelope', () => {
  const normalized = normalizeCallToolResult({
    structuredContent: {
      requiresPayment: true,
      paymentOptions: [{ price: 0.01, asset: 'USDC' }],
    },
    content: [{ type: 'text', text: 'Fresh price is $0.01.' }],
    _meta: { ui: { resourceUri: 'ui://dexter/x402-pricing' } },
    isError: false,
  });

  assert.deepEqual(normalized.structuredContent, {
    requiresPayment: true,
    paymentOptions: [{ price: 0.01, asset: 'USDC' }],
  });
  assert.deepEqual(normalized._meta, {
    ui: { resourceUri: 'ui://dexter/x402-pricing' },
  });
  assert.equal(normalized.isError, false);
  assert.equal(normalized.result, 'Fresh price is $0.01.');
});

test('derives a legacy result string without discarding structured content', () => {
  const normalized = normalizeCallToolResult({
    structuredContent: { authMode: 'unprotected', free: true },
  });

  assert.equal(
    normalized.result,
    JSON.stringify({ authMode: 'unprotected', free: true }),
  );
  assert.deepEqual(normalized.structuredContent, {
    authMode: 'unprotected',
    free: true,
  });
});

test('keeps an existing legacy result projection', () => {
  const normalized = normalizeCallToolResult({
    result: 'legacy response',
    structuredContent: { status: 'complete' },
  });

  assert.equal(normalized.result, 'legacy response');
  assert.deepEqual(normalized.structuredContent, { status: 'complete' });
});
