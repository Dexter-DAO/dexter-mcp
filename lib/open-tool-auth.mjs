export const OPEN_MCP_VAULT_AUDIENCE = 'https://open.dexter.cash/mcp';
export const OPEN_MCP_PRM_URL =
  'https://open.dexter.cash/.well-known/oauth-protected-resource/mcp';
export const OPEN_MCP_AUTHORIZATION_SERVER = 'https://mcp.dexter.cash/mcp';

export const OPEN_MCP_PRM = Object.freeze({
  resource: OPEN_MCP_VAULT_AUDIENCE,
  authorization_servers: [OPEN_MCP_AUTHORIZATION_SERVER],
  scopes_supported: ['vault'],
});

export function isOpenMcpProtectedResourceMetadataPath(pathname) {
  return pathname === '/.well-known/oauth-protected-resource'
    || pathname === '/.well-known/oauth-protected-resource/mcp';
}

const NOAUTH = Object.freeze({ type: 'noauth' });
const VAULT_OAUTH = Object.freeze({ type: 'oauth2', scopes: Object.freeze(['vault']) });

export const NOAUTH_SECURITY_SCHEMES = Object.freeze([NOAUTH]);
export const VAULT_OAUTH_SECURITY_SCHEMES = Object.freeze([VAULT_OAUTH]);
export const OPTIONAL_VAULT_SECURITY_SCHEMES = Object.freeze([NOAUTH, VAULT_OAUTH]);

/**
 * OpenDexter is intentionally mixed-auth:
 * - public discovery and diagnostic reads stay anonymous;
 * - user wallet data and money execution require the native vault OAuth rail;
 * - skill composition is anonymous until publish=true needs a linked owner.
 */
export const OPEN_TOOL_SECURITY_SCHEMES = Object.freeze({
  x402_search: NOAUTH_SECURITY_SCHEMES,
  x402_pay: VAULT_OAUTH_SECURITY_SCHEMES,
  x402_fetch: VAULT_OAUTH_SECURITY_SCHEMES,
  x402_check: NOAUTH_SECURITY_SCHEMES,
  x402_access: NOAUTH_SECURITY_SCHEMES,
  x402_wallet: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_portfolio: VAULT_OAUTH_SECURITY_SCHEMES,
  x402_compose_skill: OPTIONAL_VAULT_SECURITY_SCHEMES,
  promote_skill: VAULT_OAUTH_SECURITY_SCHEMES,
  dexter_passkey_probe: NOAUTH_SECURITY_SCHEMES,
  dexter_passkey: VAULT_OAUTH_SECURITY_SCHEMES,
});

function authParam(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildVaultWwwAuthenticate({
  error = 'insufficient_scope',
  errorDescription = 'Connect your Dexter passkey wallet to continue',
} = {}) {
  return (
    `Bearer resource_metadata="${OPEN_MCP_PRM_URL}", scope="vault", ` +
    `error="${authParam(error)}", ` +
    `error_description="${authParam(errorDescription)}"`
  );
}

export const VAULT_WWW_AUTHENTICATE = buildVaultWwwAuthenticate();

function requiresVaultOAuth(name, args) {
  const schemes = OPEN_TOOL_SECURITY_SCHEMES[name];
  if (!schemes) return false;
  const hasOAuth = schemes.some((scheme) => scheme?.type === 'oauth2');
  const hasNoAuth = schemes.some((scheme) => scheme?.type === 'noauth');
  if (!hasOAuth) return false;
  if (!hasNoAuth) return true;
  // x402_compose_skill is intentionally anonymous for local composition, but
  // publish=true persists under an owner and therefore crosses the auth line.
  return name === 'x402_compose_skill' && args?.publish === true;
}

export function findVaultProtectedToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  let legacyAccountCall = null;
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
    if (requiresVaultOAuth(name, message.params?.arguments)) {
      const call = { name, id: message.id ?? null };
      // A batch containing an account-compatible skill action and a strict
      // wallet/payment action must be governed by the strict action. Returning
      // the first protected call would let the account JWT on the first item
      // suppress vault verification for a later money call.
      if (!supportsLegacyAccountAuthorization(name)) return call;
      if (!legacyAccountCall) legacyAccountCall = call;
    }
  }
  return legacyAccountCall;
}

export function supportsLegacyAccountAuthorization(toolName) {
  return toolName === 'x402_compose_skill' || toolName === 'promote_skill';
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
      `After authorization succeeds, retry ${tool || 'the original tool call'}.`,
    reason,
    requirements,
    merchantSettlement,
  };
}

export function isVaultAuthenticationRequired(data) {
  return data?.mode === 'authentication_required'
    && data?.vault_status === 'authentication_required'
    && data?.user_bound === false;
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
