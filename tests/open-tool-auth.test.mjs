import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
  OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS,
  OPEN_MCP_PRM,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_PROTECTED_RESOURCE_PATHS,
  OPEN_MCP_TOKEN_ISSUER,
  OPEN_MCP_VAULT_AUDIENCE,
  OPEN_TOOL_SECURITY_SCHEMES,
  VAULT_WWW_AUTHENTICATE,
  assertOpenToolAuthPolicyCoverage,
  buildOpenMcpAuthorizationServerMetadata,
  buildVaultAuthenticationRequired,
  buildVaultWwwAuthenticate,
  findVaultProtectedToolCall,
  installCanonicalSecuritySchemeProjection,
  isOpenMcpProtectedResourceMetadataPath,
  isVaultAuthenticationRequired,
  projectCanonicalSecuritySchemes,
  projectCanonicalSecuritySchemesOnMessage,
  registerOpenTool,
  vaultAuthenticationReason,
  vaultAuthenticationResult,
  withOpenToolAuth,
} from '../lib/open-tool-auth.mjs';

const TOOL_ROSTER = [
  'indexter_discover',
  'indexter_search',
  'x402_check',
  'x402_fetch',
  'x402_status',
  'x402_access',
  'dexter_wallet',
  'dexter_wallet_portfolio',
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

test('required auth policy covers the exact hosted roster', () => {
  assert.doesNotThrow(() => assertOpenToolAuthPolicyCoverage(TOOL_ROSTER));
  assert.throws(
    () => assertOpenToolAuthPolicyCoverage(TOOL_ROSTER.slice(1)),
    /auth policy drift/,
  );
});

test('every hosted tool requires the exact vault OAuth scheme', () => {
  for (const name of TOOL_ROSTER) {
    assert.deepEqual(
      OPEN_TOOL_SECURITY_SCHEMES[name],
      [{ type: 'oauth2', scopes: ['vault'] }],
      name,
    );
  }
  assert.equal(
    OPEN_TOOL_SECURITY_SCHEMES.dexter_authorize_asset_action,
    undefined,
  );
});

test('protected-call classification follows the per-tool auth declaration', () => {
  const call = (name, args = {}) => ({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  assert.deepEqual(findVaultProtectedToolCall(call('dexter_wallet')), {
    name: 'dexter_wallet',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('dexter_wallet_portfolio')), {
    name: 'dexter_wallet_portfolio',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall([
    call('indexter_search'),
    { ...call('x402_fetch'), id: 2 },
  ]), { name: 'indexter_search', id: 1 });
  assert.deepEqual(findVaultProtectedToolCall(call('x402_status')), {
    name: 'x402_status',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('dexter_execute_asset_action')), {
    name: 'dexter_execute_asset_action',
    id: 1,
  });
  assert.equal(
    findVaultProtectedToolCall(call('dexter_authorize_asset_action')),
    null,
  );
  assert.deepEqual(findVaultProtectedToolCall(call('x402_check')), {
    name: 'x402_check',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('x402_access')), {
    name: 'x402_access',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('indexter_search')), {
    name: 'indexter_search',
    id: 1,
  });
  assert.deepEqual(findVaultProtectedToolCall(call('indexter_discover')), {
    name: 'indexter_discover',
    id: 1,
  });
  assert.equal(findVaultProtectedToolCall(call('x402_pay')), null);
  assert.equal(findVaultProtectedToolCall(call('x402_compose_skill')), null);
});

test('registration config carries canonical and mirrored schemes', () => {
  const config = withOpenToolAuth('dexter_wallet', {
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
  registerOpenTool(server, 'indexter_search', { inputSchema: {} }, async () => ({
    content: [{ type: 'text', text: 'ok' }],
  }));
  registerOpenTool(server, 'dexter_wallet', {
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
      wireList.result.tools.find((tool) => tool.name === 'indexter_search').securitySchemes,
      [{ type: 'oauth2', scopes: ['vault'] }],
    );
    assert.deepEqual(
      wireList.result.tools.find((tool) => tool.name === 'dexter_wallet').securitySchemes,
      [{ type: 'oauth2', scopes: ['vault'] }],
    );
    // MCP SDK 1.x's Client response schema strips the canonical extension but
    // preserves the documented compatibility mirror.
    assert.deepEqual(
      listed.tools.find((tool) => tool.name === 'dexter_wallet')._meta.securitySchemes,
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
  assert.equal(
    OPEN_MCP_AUTHORIZATION_SERVER_METADATA,
    'https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp',
  );
  assert.equal(OPEN_MCP_TOKEN_ISSUER, 'https://dexter.cash');
  assert.deepEqual(OPEN_MCP_PROTECTED_RESOURCE_PATHS, [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ]);
  assert.deepEqual(OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS, [
    'resource_metadata',
    'scope',
  ]);
  assert.deepEqual(OPEN_MCP_PRM.scopes_supported, ['vault']);
  assert.deepEqual(OPEN_MCP_PRM.bearer_methods_supported, ['header']);
});

test('path-inserted OpenDexter authorization metadata is fixed and vault-only', () => {
  assert.deepEqual(
    buildOpenMcpAuthorizationServerMetadata(
      '/.well-known/oauth-authorization-server/mcp',
    ),
    {
      issuer: 'https://mcp.dexter.cash/mcp',
      authorization_endpoint: 'https://mcp.dexter.cash/mcp/authorize',
      token_endpoint: 'https://mcp.dexter.cash/mcp/token',
      registration_endpoint: 'https://mcp.dexter.cash/mcp/register',
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_post',
        'client_secret_basic',
      ],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['vault'],
    },
  );
});

test('OpenDexter authorization metadata helper excludes both legacy discovery rails', () => {
  assert.equal(
    buildOpenMcpAuthorizationServerMetadata(
      '/.well-known/oauth-authorization-server',
    ),
    null,
  );
  assert.equal(
    buildOpenMcpAuthorizationServerMetadata(
      '/mcp/.well-known/oauth-authorization-server',
    ),
    null,
  );
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
    tool: 'dexter_wallet',
  });
  assert.equal(isVaultAuthenticationRequired(data), true);
  assert.equal(data.next_action, 'connect_opendexter');
  assert.equal(data.user_bound, false);
  assert.equal(data.reason, 'vault_oauth_required');
  assert.equal('next_tool' in data, false);
  assert.equal('enroll_url' in data, false);
  assert.equal('pairing_url' in data, false);

  const result = vaultAuthenticationResult(data, { ui: { resourceUri: 'ui://wallet' } });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, data);
  assert.deepEqual(result._meta['mcp/www_authenticate'], [VAULT_WWW_AUTHENTICATE]);
  assert.match(VAULT_WWW_AUTHENTICATE, new RegExp(`resource_metadata="${OPEN_MCP_PRM_URL}"`));
  assert.match(VAULT_WWW_AUTHENTICATE, /scope="vault"/);
  assert.doesNotMatch(VAULT_WWW_AUTHENTICATE, /error=/);
  assert.doesNotMatch(VAULT_WWW_AUTHENTICATE, /error_description=/);
});

test('unbound state cannot turn a synthetic not_enrolled lookup into wallet truth', () => {
  assert.equal(
    vaultAuthenticationReason({
      bindingConfirmed: false,
      vaultStatus: 'not_enrolled',
    }),
    'vault_oauth_required',
  );
  assert.equal(
    vaultAuthenticationReason({
      bindingConfirmed: true,
      vaultStatus: 'not_enrolled',
    }),
    'not_enrolled',
  );
});

test('wallet and portfolio emit the same raw SDK OAuth challenge without enrollment claims', async () => {
  const server = new McpServer({ name: 'auth-result-test', version: '1.0.0' });
  for (const tool of ['dexter_wallet', 'dexter_wallet_portfolio']) {
    registerOpenTool(server, tool, { inputSchema: {} }, async () => {
      const reason = vaultAuthenticationReason({
        bindingConfirmed: false,
        vaultStatus: 'not_enrolled',
      });
      return vaultAuthenticationResult(
        buildVaultAuthenticationRequired({ tool, reason }),
      );
    });
  }

  const client = new Client({ name: 'auth-result-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    for (const tool of ['dexter_wallet', 'dexter_wallet_portfolio']) {
      const result = await client.callTool({ name: tool, arguments: {} });
      assert.equal(result.isError, true, tool);
      assert.equal(result.structuredContent.mode, 'authentication_required', tool);
      assert.equal(result.structuredContent.reason, 'vault_oauth_required', tool);
      assert.equal(result.structuredContent.user_bound, false, tool);
      assert.deepEqual(
        result._meta['mcp/www_authenticate'],
        [VAULT_WWW_AUTHENTICATE],
        tool,
      );
      const text = JSON.parse(result.content[0].text);
      assert.equal(text.reason, 'vault_oauth_required', tool);
      assert.doesNotMatch(JSON.stringify(result), /not_enrolled/, tool);
    }
  } finally {
    await client.close();
    await server.close();
  }
});

test('wallet and portfolio handlers require durable binding evidence before preserving enrollment state', async () => {
  const source = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  const wallet = source.slice(
    source.indexOf('async function x402Wallet'),
    source.indexOf('function buildPortfolioReadError'),
  );
  const portfolio = source.slice(
    source.indexOf('async function dexterPortfolio'),
    source.indexOf('// ─── MCP Server Setup'),
  );

  for (const [tool, implementation] of [
    ['dexter_wallet', wallet],
    ['dexter_wallet_portfolio', portfolio],
  ]) {
    assert.match(implementation, /checkSessionVaultBinding\(sessionId\)/, tool);
    assert.match(implementation, /vaultAuthenticationReason\(\{/, tool);
    assert.match(implementation, /bindingConfirmed:/, tool);
    assert.doesNotMatch(
      implementation,
      /reason:\s*state\?\.status\s*\|\|\s*['"]not_enrolled['"]/,
      tool,
    );
  }
});

test('opaque-intent authentication challenges without confusing hosted consent', () => {
  assert.equal(isVaultAuthenticationRequired({
    status: 'authentication_required',
    authorizationRequired: true,
    error: 'authentication_required',
    intentId: 'intent-1',
  }), true);
  assert.equal(isVaultAuthenticationRequired({
    status: 'authorization_required',
    authorizationRequired: true,
    error: 'hosted_consent_unavailable',
    intentId: 'intent-1',
  }), false);
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

  const data = buildVaultAuthenticationRequired({ tool: 'dexter_wallet' });
  assert.match(data.instructions, /host only says Connected/);
  assert.match(data.instructions, /plugin or integration settings/);
  assert.match(data.instructions, /Authorize or Authenticate/);
  assert.match(data.instructions, /successful protected tool retry proves it/);
  const result = vaultAuthenticationResult(data, {}, challenge);
  assert.deepEqual(result._meta['mcp/www_authenticate'], [challenge]);
});
