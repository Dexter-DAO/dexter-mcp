import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOpenMcpConnectionTraceEnabled,
  summarizeFreshMcpRequest,
} from '../lib/open-request-trace.mjs';

test('connection trace is on in production and explicitly controllable elsewhere', () => {
  assert.equal(isOpenMcpConnectionTraceEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(
    isOpenMcpConnectionTraceEnabled({
      NODE_ENV: 'production',
      OPEN_MCP_CONNECTION_TRACE: '0',
    }),
    false,
  );
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(
      isOpenMcpConnectionTraceEnabled({ OPEN_MCP_CONNECTION_TRACE: value }),
      true,
      value,
    );
  }
  for (const value of ['', '0', 'false', 'disabled', undefined]) {
    assert.equal(
      isOpenMcpConnectionTraceEnabled({
        NODE_ENV: 'test',
        OPEN_MCP_CONNECTION_TRACE: value,
      }),
      false,
      String(value),
    );
  }
});

test('fresh initialize summary contains only allowlisted shape and header buckets', () => {
  const summary = summarizeFreshMcpRequest({
    accept: 'application/json, text/event-stream',
    authorization: 'Bearer do-not-log-this-token',
    'content-type': 'application/json; charset=utf-8',
    cookie: 'session=do-not-log-this-cookie',
    'mcp-method': 'initialize',
    'mcp-name': 'do-not-log-this-name',
    'mcp-protocol-version': '2025-06-18',
    'mcp-session-id': 'do-not-log-this-session-id',
    origin: 'https://private-origin.example/path',
    'user-agent': 'do-not-log-this-user-agent',
    'x-forwarded-for': '192.0.2.10',
  }, {
    jsonrpc: '2.0',
    id: 'do-not-log-this-request-id',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: { secretCapability: 'do-not-log-this-capability' },
      clientInfo: {
        name: 'do-not-log-this-client-name',
        version: 'do-not-log-this-client-version',
      },
      prompt: 'do-not-log-this-prompt',
      arguments: { secret: 'do-not-log-this-argument' },
    },
  });

  assert.deepEqual(summary, {
    httpMethod: 'POST',
    rpcMethod: 'initialize',
    headers: {
      authorization: 'bearer',
      mcpSessionId: 'present',
      mcpMethod: 'initialize',
      mcpName: 'present',
      cookie: 'present',
      origin: 'present',
      contentType: 'application/json',
      acceptJson: true,
      acceptSse: true,
      protocolVersion: 'date',
    },
    body: {
      single: true,
      hasParams: true,
      hasClientInfo: true,
      hasCapabilities: true,
      hasProtocolVersion: true,
    },
  });

  const serialized = JSON.stringify(summary);
  for (const secret of [
    'do-not-log',
    '192.0.2.10',
    'private-origin.example',
    '2025-06-18',
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('unknown values collapse to other and batches expose no message details', () => {
  const summary = summarizeFreshMcpRequest({
    authorization: 'Private sensitive-value',
    'content-type': 'application/private+json',
    'mcp-method': 'secret/method',
    'mcp-protocol-version': 'secret-version',
  }, [
    { method: 'initialize', params: { clientInfo: { name: 'secret-client' } } },
    { method: 'tools/call', params: { name: 'secret-tool', arguments: { secret: true } } },
  ]);

  assert.deepEqual(summary, {
    httpMethod: 'POST',
    rpcMethod: 'batch',
    headers: {
      authorization: 'other',
      mcpSessionId: 'absent',
      mcpMethod: 'other',
      mcpName: 'absent',
      cookie: 'absent',
      origin: 'absent',
      contentType: 'other',
      acceptJson: false,
      acceptSse: false,
      protocolVersion: 'other',
    },
    body: {
      single: false,
      hasParams: false,
      hasClientInfo: false,
      hasCapabilities: false,
      hasProtocolVersion: false,
    },
  });

  const serialized = JSON.stringify(summary);
  for (const secret of ['sensitive-value', 'secret-client', 'secret-tool', 'secret/method']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});
