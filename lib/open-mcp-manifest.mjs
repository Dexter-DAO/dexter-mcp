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

// 0.5.0 adds governed Send/Buy/Sell prepare, execute, status, reconcile, and
// history under reusable bounded mandates without exposing owner ceremonies.
export const OPEN_MCP_VERSION = '0.5.0';

export function buildOpenMcpManifest() {
  return {
    name: 'OpenDexter',
    namespace: 'opendexter',
    url: OPEN_MCP_VAULT_AUDIENCE,
    description:
      'OpenDexter discovers and buys x402 APIs, reads the bound Dexter wallet and portfolio, and prepares, executes, checks, reconciles, and lists server-governed Send, Buy, and Sell intents under reusable bounded mandates. Approved assets are selected only by canonical server registry ID; enrollment, extension, and owner escalation remain outside model-callable tools, and provider output never authorizes spend.',
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
