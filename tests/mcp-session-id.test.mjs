import assert from 'node:assert/strict';
import test from 'node:test';

import { extractMcpSessionId } from '../lib/mcp-session-id.mjs';

test('reads the MCP session id without loading legacy wallet-session code', () => {
  assert.equal(extractMcpSessionId({ sessionId: 'direct-session' }), 'direct-session');
  assert.equal(extractMcpSessionId({
    requestInfo: { headers: { 'mcp-session-id': ' header-session ' } },
  }), 'header-session');
  assert.equal(extractMcpSessionId({}), null);
});
