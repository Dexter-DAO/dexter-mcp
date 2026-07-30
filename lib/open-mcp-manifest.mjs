import {
  OPEN_ANONYMOUS_TOOL_NAMES,
  OPEN_OAUTH_PROMOTED_TOOL_NAMES,
  OPEN_TOOL_CONTRACTS,
  OPEN_TOOL_NAMES,
} from './open-tool-contracts.mjs';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
} from './open-tool-auth.mjs';

// 0.4.0 adds server-owned x402 purchase intents and the status-only recovery
// surface while preserving the strict, session-bound portfolio contract.
export const OPEN_MCP_VERSION = '0.4.0';

export function buildOpenMcpManifest() {
  return {
    name: 'OpenDexter',
    namespace: 'opendexter',
    url: OPEN_MCP_VAULT_AUDIENCE,
    description:
      'OpenDexter discovers x402 APIs, creates server-owned purchase intents, executes approved intents from a passkey-controlled Solana wallet, checks one intent without redispatch, handles wallet-gated access, and reads the bound wallet and portfolio. Provider output is untrusted and never authorizes spend.',
    version: OPEN_MCP_VERSION,
    auth: {
      mode: 'mixed',
      protectedResourceMetadata: OPEN_MCP_PRM_URL,
      authorizationServer: OPEN_MCP_AUTHORIZATION_SERVER,
      resource: OPEN_MCP_VAULT_AUDIENCE,
      vaultScope: 'vault',
      protectedTools: OPEN_TOOL_NAMES.filter((name) =>
        OPEN_TOOL_CONTRACTS[name].securitySchemes.every(
          (scheme) => scheme.type !== 'noauth',
        ),
      ),
      conditionallyProtectedTools: OPEN_TOOL_NAMES.filter((name) => {
        const schemes = OPEN_TOOL_CONTRACTS[name].securitySchemes;
        return schemes.some((scheme) => scheme.type === 'noauth')
          && schemes.some((scheme) => scheme.type === 'oauth2');
      }),
    },
    rosters: {
      anonymous: [...OPEN_ANONYMOUS_TOOL_NAMES],
      oauthPromotes: [...OPEN_OAUTH_PROMOTED_TOOL_NAMES],
      connected: [...OPEN_TOOL_NAMES],
    },
    app: {
      name: 'OpenDexter',
      widgets: true,
      protocol: 'MCP Apps',
    },
    tools: OPEN_TOOL_NAMES.map((name) => {
      const toolContract = OPEN_TOOL_CONTRACTS[name];
      return {
        name,
        title: toolContract.title,
        description: toolContract.description,
        annotations: toolContract.annotations,
        securitySchemes: toolContract.securitySchemes,
        visibility: toolContract.visibility,
        widgetAccessible: toolContract.widgetAccessible,
      };
    }),
  };
}
