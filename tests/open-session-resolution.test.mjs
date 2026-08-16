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

test('access sessions are created once and reused only through server-owned MCP context', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(options.body)),
    });
    return new Response(JSON.stringify({
      ok: true,
      sessionId: 'internal-access-session',
      sessionToken: 'open_server_owned_secret',
      expiresAt: '2026-08-16T02:00:00.000Z',
      funding: { mode: 'not_required' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const { resolveOrCreateSessionForWallet } = resolver();
  const extra = { sessionId: 'server-owned-mcp-session' };
  const first = await resolveOrCreateSessionForWallet(extra);
  const second = await resolveOrCreateSessionForWallet(extra);

  assert.equal(first.error, null);
  assert.equal(first.sessionResolution.mode, 'created_new');
  assert.equal(second.error, null);
  assert.equal(second.sessionResolution.mode, 'resumed_from_context');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.sessionKey, 'server-owned-mcp-session');
  assert.equal(Object.hasOwn(requests[0].body, 'sessionToken'), false);
});
