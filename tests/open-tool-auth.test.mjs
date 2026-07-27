import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_PRM,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
  OPEN_TOOL_SECURITY_SCHEMES,
  VAULT_WWW_AUTHENTICATE,
  assertOpenToolAuthPolicyCoverage,
  buildVaultAuthenticationRequired,
  buildVaultWwwAuthenticate,
  findVaultProtectedToolCall,
  installCanonicalSecuritySchemeProjection,
  isOpenMcpProtectedResourceMetadataPath,
  isVaultAuthenticationRequired,
  projectCanonicalSecuritySchemes,
  projectCanonicalSecuritySchemesOnMessage,
  registerOpenTool,
  supportsLegacyAccountAuthorization,
  vaultAuthenticationResult,
  withOpenToolAuth,
} from '../lib/open-tool-auth.mjs';

const TOOL_ROSTER = [
  'x402_search',
  'x402_pay',
  'x402_fetch',
  'x402_check',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
  'x402_compose_skill',
  'promote_skill',
  'dexter_passkey_probe',
  'dexter_passkey',
];

test('mixed auth policy covers the exact hosted roster', () => {
  assert.doesNotThrow(() => assertOpenToolAuthPolicyCoverage(TOOL_ROSTER));
  assert.throws(
    () => assertOpenToolAuthPolicyCoverage(TOOL_ROSTER.slice(1)),
    /auth policy drift/,
  );
});

test('public, wallet, payment, and optionally linked tools have exact schemes', () => {
  assert.deepEqual(OPEN_TOOL_SECURITY_SCHEMES.x402_search, [{ type: 'noauth' }]);
  assert.deepEqual(OPEN_TOOL_SECURITY_SCHEMES.x402_check, [{ type: 'noauth' }]);
  assert.deepEqual(
    OPEN_TOOL_SECURITY_SCHEMES.x402_wallet,
    [{ type: 'oauth2', scopes: ['vault'] }],
  );
  assert.deepEqual(
    OPEN_TOOL_SECURITY_SCHEMES.dexter_portfolio,
    [{ type: 'oauth2', scopes: ['vault'] }],
  );
  assert.deepEqual(
    OPEN_TOOL_SECURITY_SCHEMES.x402_fetch,
    [{ type: 'oauth2', scopes: ['vault'] }],
  );
  assert.deepEqual(
    OPEN_TOOL_SECURITY_SCHEMES.x402_compose_skill,
    [{ type: 'noauth' }, { type: 'oauth2', scopes: ['vault'] }],
  );
});

test('protected-call classification follows the per-tool auth declaration', () => {
  const call = (name, args = {}) => ({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  assert.deepEqual(findVaultProtectedToolCall(call('x402_wallet')), {
    name: 'x402_wallet',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('dexter_portfolio')), {
    name: 'dexter_portfolio',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall([
    call('x402_search'),
    { ...call('x402_pay'), id: 2 },
  ]), { name: 'x402_pay', id: 2 });
  assert.deepEqual(findVaultProtectedToolCall([
    call('x402_compose_skill', { publish: true }),
    { ...call('x402_pay'), id: 2 },
  ]), { name: 'x402_pay', id: 2 });
  assert.equal(findVaultProtectedToolCall(call('x402_search')), null);
  assert.equal(findVaultProtectedToolCall(call('x402_compose_skill')), null);
  assert.deepEqual(
    findVaultProtectedToolCall(call('x402_compose_skill', { publish: true })),
    { name: 'x402_compose_skill', id: 1 },
  );
});

test('legacy account authorization is deliberately narrow', () => {
  assert.equal(supportsLegacyAccountAuthorization('x402_compose_skill'), true);
  assert.equal(supportsLegacyAccountAuthorization('promote_skill'), true);
  assert.equal(supportsLegacyAccountAuthorization('x402_wallet'), false);
  assert.equal(supportsLegacyAccountAuthorization('dexter_portfolio'), false);
  assert.equal(supportsLegacyAccountAuthorization('x402_pay'), false);
});

test('registration config carries canonical and mirrored schemes', () => {
  const config = withOpenToolAuth('x402_wallet', {
    title: 'Wallet',
    inputSchema: {},
    _meta: { ui: { resourceUri: 'ui://wallet' } },
  });
  assert.deepEqual(config.securitySchemes, [{ type: 'oauth2', scopes: ['vault'] }]);
  assert.deepEqual(config._meta.securitySchemes, config.securitySchemes);
  assert.deepEqual(config._meta.ui, { resourceUri: 'ui://wallet' });
  assert.notEqual(config._meta.securitySchemes, config.securitySchemes);
});

test('real SDK tools/list carries canonical and mirrored auth schemes', async () => {
  const server = new McpServer({ name: 'auth-test', version: '1.0.0' });
  registerOpenTool(server, 'x402_search', { inputSchema: {} }, async () => ({
    content: [{ type: 'text', text: 'ok' }],
  }));
  registerOpenTool(server, 'x402_wallet', {
    inputSchema: {},
    _meta: { ui: { resourceUri: 'ui://wallet' } },
  }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));

  const client = new Client({ name: 'auth-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const wireMessages = [];
  const rawSend = serverTransport.send.bind(serverTransport);
  serverTransport.send = (message, options) => {
    wireMessages.push(message);
    return rawSend(message, options);
  };
  installCanonicalSecuritySchemeProjection(serverTransport);
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 2);
    const wireList = wireMessages.find((message) => Array.isArray(message?.result?.tools));
    assert.ok(wireList, 'expected a tools/list response on the transport');
    for (const tool of wireList.result.tools) {
      assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
    }
    assert.deepEqual(
      wireList.result.tools.find((tool) => tool.name === 'x402_search').securitySchemes,
      [{ type: 'noauth' }],
    );
    assert.deepEqual(
      wireList.result.tools.find((tool) => tool.name === 'x402_wallet').securitySchemes,
      [{ type: 'oauth2', scopes: ['vault'] }],
    );
    // MCP SDK 1.x's Client response schema strips the canonical extension but
    // preserves the documented compatibility mirror.
    assert.deepEqual(
      listed.tools.find((tool) => tool.name === 'x402_wallet')._meta.securitySchemes,
      [{ type: 'oauth2', scopes: ['vault'] }],
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test('transport projection leaves non-tools/list messages unchanged', () => {
  const message = { jsonrpc: '2.0', id: 2, result: { content: [] } };
  assert.equal(projectCanonicalSecuritySchemesOnMessage(message), message);
});

test('projection fails closed when any descriptor omits its auth policy', () => {
  assert.throws(
    () => projectCanonicalSecuritySchemes({
      tools: [{ name: 'unsafe_tool', inputSchema: { type: 'object' }, _meta: {} }],
    }),
    /missing _meta\.securitySchemes/,
  );
  assert.throws(
    () => projectCanonicalSecuritySchemes({
      tools: [{
        name: 'unsafe_tool',
        inputSchema: { type: 'object' },
        _meta: { securitySchemes: [{ type: 'bogus' }] },
      }],
    }),
    /Unsupported or malformed/,
  );
});

test('resource metadata names the actual authorization-server issuer', () => {
  assert.equal(OPEN_MCP_PRM.resource, OPEN_MCP_VAULT_AUDIENCE);
  assert.deepEqual(OPEN_MCP_PRM.authorization_servers, [OPEN_MCP_AUTHORIZATION_SERVER]);
  assert.equal(OPEN_MCP_AUTHORIZATION_SERVER, 'https://mcp.dexter.cash/mcp');
  assert.deepEqual(OPEN_MCP_PRM.scopes_supported, ['vault']);
});

test('both protected-resource metadata routes serve the same corrected issuer', () => {
  for (const pathname of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ]) {
    assert.equal(isOpenMcpProtectedResourceMetadataPath(pathname), true);
    assert.deepEqual(OPEN_MCP_PRM.authorization_servers, ['https://mcp.dexter.cash/mcp']);
  }
  assert.equal(
    isOpenMcpProtectedResourceMetadataPath('/mcp/.well-known/oauth-protected-resource'),
    false,
  );
});

test('runtime challenge is host-native and contains no legacy pairing path', () => {
  const data = buildVaultAuthenticationRequired({
    tool: 'x402_wallet',
    reason: 'not_enrolled',
  });
  assert.equal(isVaultAuthenticationRequired(data), true);
  assert.equal(data.next_action, 'connect_opendexter');
  assert.equal(data.user_bound, false);
  assert.equal('next_tool' in data, false);
  assert.equal('enroll_url' in data, false);
  assert.equal('pairing_url' in data, false);

  const result = vaultAuthenticationResult(data, { ui: { resourceUri: 'ui://wallet' } });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, data);
  assert.deepEqual(result._meta['mcp/www_authenticate'], [VAULT_WWW_AUTHENTICATE]);
  assert.match(VAULT_WWW_AUTHENTICATE, new RegExp(`resource_metadata="${OPEN_MCP_PRM_URL}"`));
  assert.match(VAULT_WWW_AUTHENTICATE, /scope="vault"/);
  assert.match(VAULT_WWW_AUTHENTICATE, /error="insufficient_scope"/);
  assert.match(VAULT_WWW_AUTHENTICATE, /error_description="[^"]+"/);
});

test('runtime challenges preserve precise OAuth errors and escape header input', () => {
  const challenge = buildVaultWwwAuthenticate({
    error: 'invalid_token',
    errorDescription: 'stale "token"\\retry\r\nnow',
  });
  assert.match(challenge, /error="invalid_token"/);
  assert.match(challenge, /error_description="stale \\"token\\"\\\\retry  now"/);
  assert.equal(challenge.includes('\r'), false);
  assert.equal(challenge.includes('\n'), false);

  const data = buildVaultAuthenticationRequired({ tool: 'x402_wallet' });
  const result = vaultAuthenticationResult(data, {}, challenge);
  assert.deepEqual(result._meta['mcp/www_authenticate'], [challenge]);
});
