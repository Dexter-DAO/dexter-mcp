import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenSessionResolver } from '../lib/open-session-resolution.mjs';

function resolver() {
  return createOpenSessionResolver({
    dexterApi: 'https://x402.dexter.cash',
    apiBaseFallback: 'http://127.0.0.1:3030',
    openSessionHintTtlMs: 60_000,
    normalizeSessionFunding: (value) => value,
  });
}

test('caller-controlled tool metadata is never a protected session identity', () => {
  const { extractMcpSessionId } = resolver();
  assert.equal(
    extractMcpSessionId({
      _meta: { 'openai/session': 'attacker-controlled-session' },
    }),
    null,
  );
});

test('server-owned SDK context and transport headers remain valid session sources', () => {
  const { extractMcpSessionId } = resolver();
  assert.equal(
    extractMcpSessionId({ sessionId: 'server-owned-session' }),
    'server-owned-session',
  );
  assert.equal(
    extractMcpSessionId({
      requestInfo: {
        headers: { 'mcp-session-id': 'transport-session' },
      },
    }),
    'transport-session',
  );
});
