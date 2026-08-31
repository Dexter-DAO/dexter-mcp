export const OPEN_MCP_VAULT_AUDIENCE = 'https://open.dexter.cash/mcp';
export const OPEN_MCP_PRM_URL =
  'https://open.dexter.cash/.well-known/oauth-protected-resource/mcp';
export const OPEN_MCP_AUTHORIZATION_SERVER = 'https://mcp.dexter.cash/mcp';
export const OPEN_MCP_AUTHORIZATION_SERVER_METADATA =
  'https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp';
export const OPEN_MCP_TOKEN_ISSUER = 'https://dexter.cash';
export const OPEN_MCP_PROTECTED_RESOURCE_PATHS = Object.freeze([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]);
export const OPEN_MCP_CHALLENGE_REQUIRED_PARAMETERS = Object.freeze([
  'resource_metadata',
  'scope',
]);

export const OPEN_MCP_PRM = Object.freeze({
  resource: OPEN_MCP_VAULT_AUDIENCE,
  authorization_servers: [OPEN_MCP_AUTHORIZATION_SERVER],
  scopes_supported: ['vault'],
  bearer_methods_supported: ['header'],
});

/**
 * Return OpenDexter's dedicated authorization-server metadata only for the
 * RFC 8414 path-insertion form named by the protected-resource contract.
 *
 * The shared root metadata and the legacy `/mcp/.well-known` discovery rail
 * intentionally remain outside this helper. Keeping the issuer and endpoints
 * fixed prevents request-host or provider-scope configuration from widening
 * OpenDexter's single `vault` grant.
 */
export function buildOpenMcpAuthorizationServerMetadata(pathname) {
  if (pathname !== new URL(OPEN_MCP_AUTHORIZATION_SERVER_METADATA).pathname) {
    return null;
  }

  return {
    issuer: OPEN_MCP_AUTHORIZATION_SERVER,
    authorization_endpoint: `${OPEN_MCP_AUTHORIZATION_SERVER}/authorize`,
    token_endpoint: `${OPEN_MCP_AUTHORIZATION_SERVER}/token`,
    registration_endpoint: `${OPEN_MCP_AUTHORIZATION_SERVER}/register`,
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['vault'],
  };
}

export function isOpenMcpProtectedResourceMetadataPath(pathname) {
  return OPEN_MCP_PROTECTED_RESOURCE_PATHS.includes(pathname);
}

export function openMcpProtectedResourceMetadataForPath(pathname) {
  if (
    pathname === '/.well-known/oauth-protected-resource'
    || pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    return OPEN_MCP_PRM;
  }
  return null;
}

const NOAUTH = Object.freeze({ type: 'noauth' });
const VAULT_OAUTH = Object.freeze({ type: 'oauth2', scopes: Object.freeze(['vault']) });

export const NOAUTH_SECURITY_SCHEMES = Object.freeze([NOAUTH]);
export const VAULT_OAUTH_SECURITY_SCHEMES = Object.freeze([VAULT_OAUTH]);
export const OPTIONAL_VAULT_OAUTH_SECURITY_SCHEMES = Object.freeze([
  NOAUTH,
  VAULT_OAUTH,
]);

/**
 * OpenDexter is intentionally mixed-auth:
 * - public discovery stays anonymous;
 * - pricing and identity-gated classification accept optional vault OAuth;
 * - user wallet data, portfolio data, and money execution require the native
 *   vault OAuth rail.
 */
export const OPEN_TOOL_SECURITY_SCHEMES = Object.freeze({
  x402_search: NOAUTH_SECURITY_SCHEMES,
  x402_check: OPTIONAL_VAULT_OAUTH_SECURITY_SCHEMES,
  x402_fetch: VAULT_OAUTH_SECURITY_SCHEMES,
  x402_status: VAULT_OAUTH_SECURITY_SCHEMES,
  x402_access: OPTIONAL_VAULT_OAUTH_SECURITY_SCHEMES,
  x402_wallet: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_portfolio: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_prepare_asset_action: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_execute_asset_action: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_asset_action_status: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_reconcile_asset_action: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_wallet_history: VAULT_OAUTH_SECURITY_SCHEMES,
});

function authParam(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildVaultWwwAuthenticate({
  error = null,
  errorDescription = null,
} = {}) {
  const parameters = [
    `resource_metadata="${OPEN_MCP_PRM_URL}"`,
    'scope="vault"',
  ];
  if (error) parameters.push(`error="${authParam(error)}"`);
  if (error && errorDescription) {
    parameters.push(`error_description="${authParam(errorDescription)}"`);
  }
  return `Bearer ${parameters.join(', ')}`;
}

export const VAULT_WWW_AUTHENTICATE = buildVaultWwwAuthenticate();

function requiresVaultOAuth(name) {
  const schemes = OPEN_TOOL_SECURITY_SCHEMES[name];
  if (!schemes) return false;
  return schemes.length > 0
    && schemes.every((scheme) => scheme?.type === 'oauth2');
}

export function findVaultProtectedToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  for (const message of list) {
    if (
      !message
      || typeof message !== 'object'
      || message.method !== 'tools/call'
      || typeof message.params?.name !== 'string'
    ) {
      continue;
    }
    const name = message.params.name;
    if (requiresVaultOAuth(name)) {
      return { name, id: message.id ?? null };
    }
  }
  return null;
}

function cloneSecuritySchemes(schemes) {
  return schemes.map((scheme) => {
    if (scheme?.type === 'noauth') return { type: 'noauth' };
    if (
      scheme?.type === 'oauth2'
      && Array.isArray(scheme.scopes)
      && scheme.scopes.every((scope) => typeof scope === 'string' && scope.length > 0)
    ) {
      return { type: 'oauth2', scopes: [...scheme.scopes] };
    }
    throw new Error(`Unsupported or malformed tool security scheme: ${JSON.stringify(scheme)}`);
  });
}

export function assertOpenToolAuthPolicyCoverage(toolNames) {
  const expected = [...toolNames].sort();
  const actual = Object.keys(OPEN_TOOL_SECURITY_SCHEMES).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `OpenDexter tool auth policy drift: roster=${expected.join(',')} policies=${actual.join(',')}`,
    );
  }
}

/**
 * The current MCP TypeScript SDK drops the non-standard top-level
 * securitySchemes field while serializing tools/list. Keep the canonical
 * config field for SDK-forward compatibility and mirror it in _meta for
 * current ChatGPT clients.
 */
export function withOpenToolAuth(name, config) {
  const schemes = OPEN_TOOL_SECURITY_SCHEMES[name];
  if (!schemes) throw new Error(`Missing auth policy for OpenDexter tool: ${name}`);
  const canonical = cloneSecuritySchemes(schemes);
  return {
    ...config,
    securitySchemes: canonical,
    _meta: {
      ...(config._meta || {}),
      securitySchemes: cloneSecuritySchemes(schemes),
    },
  };
}

export function registerOpenTool(server, name, config, handler) {
  return server.registerTool(name, withOpenToolAuth(name, config), handler);
}

export function projectCanonicalSecuritySchemes(result) {
  if (!result || !Array.isArray(result.tools)) {
    throw new Error('Invalid tools/list result while projecting security schemes');
  }
  return {
    ...result,
    tools: result.tools.map((tool) => {
      const mirrored = tool?._meta?.securitySchemes;
      if (!Array.isArray(mirrored) || mirrored.length === 0) {
        throw new Error(`Tool ${tool?.name || '<unknown>'} is missing _meta.securitySchemes`);
      }
      return {
        ...tool,
        securitySchemes: cloneSecuritySchemes(mirrored),
      };
    }),
  };
}

export function projectCanonicalSecuritySchemesOnMessage(message) {
  if (!message?.result || !Array.isArray(message.result.tools)) return message;
  return {
    ...message,
    result: projectCanonicalSecuritySchemes(message.result),
  };
}

const projectedTransports = new WeakSet();

/**
 * Add canonical top-level securitySchemes at the transport boundary.
 *
 * @modelcontextprotocol/sdk@1.x drops that documented Apps SDK extension
 * while serializing tools/list, but preserves the _meta compatibility mirror.
 * StreamableHTTPServerTransport.send is public; wrapping that one method avoids
 * depending on the SDK's private tool registry or request-handler map.
 */
export function installCanonicalSecuritySchemeProjection(transport) {
  if (!transport || typeof transport.send !== 'function') {
    throw new Error('MCP transport.send unavailable for auth projection');
  }
  if (projectedTransports.has(transport)) return transport;
  const originalSend = transport.send.bind(transport);
  transport.send = (message, options) => (
    originalSend(projectCanonicalSecuritySchemesOnMessage(message), options)
  );
  projectedTransports.add(transport);
  return transport;
}

export function buildVaultAuthenticationRequired({
  tool,
  reason = 'vault_oauth_required',
  retry = null,
  requirements = null,
  merchantSettlement = null,
} = {}) {
  return {
    status: 401,
    mode: 'authentication_required',
    paySource: 'anon_vault',
    next_action: 'connect_opendexter',
    vault_status: 'authentication_required',
    user_bound: false,
    retry,
    message: 'Connect OpenDexter with your Dexter passkey wallet to continue.',
    instructions:
      `Use the host's Connect action to authorize OpenDexter. ` +
      `If the host only says Connected and does not open wallet authorization, ` +
      `open the host's OpenDexter plugin or integration settings and choose ` +
      `Authorize or Authenticate. ` +
      `Do not say authorization completed or that a confirmation card appeared ` +
      `until a successful protected tool retry proves it. ` +
      `After authorization succeeds, retry ${tool || 'the original tool call'}.`,
    reason,
    requirements,
    merchantSettlement,
  };
}

const BOUND_VAULT_NOT_READY_REASONS = new Set([
  'not_enrolled',
  'awaiting_ceremony',
  'provisioning',
]);

/**
 * Keep connector/session authorization separate from wallet enrollment.
 *
 * The vault state endpoint resolves by MCP session id. For an anonymous
 * session it necessarily returns `not_enrolled`, because no wallet identity is
 * available to inspect; that value is not enrollment evidence. Only preserve
 * a wallet-readiness status after the independent durable-binding lookup has
 * proven that this session resolves to a user handle.
 */
export function vaultAuthenticationReason({
  bindingConfirmed = false,
  vaultStatus = null,
} = {}) {
  if (!bindingConfirmed) return 'vault_oauth_required';
  return BOUND_VAULT_NOT_READY_REASONS.has(vaultStatus)
    ? vaultStatus
    : 'vault_not_ready';
}

export function isVaultAuthenticationRequired(data) {
  const legacyShape = data?.mode === 'authentication_required'
    && data?.vault_status === 'authentication_required'
    && data?.user_bound === false;
  const opaqueIntentShape = data?.status === 'authentication_required'
    && data?.authorizationRequired === true
    && data?.error === 'authentication_required';
  return legacyShape || opaqueIntentShape;
}

export function vaultAuthenticationResult(
  data,
  baseMeta = {},
  challenge = VAULT_WWW_AUTHENTICATE,
) {
  if (!isVaultAuthenticationRequired(data)) {
    throw new Error('Refusing to emit an OAuth challenge for a non-authentication result');
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: true,
    _meta: {
      ...baseMeta,
      'mcp/www_authenticate': [challenge],
    },
  };
}
