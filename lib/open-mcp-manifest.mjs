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

// 0.5.0 adds governed Buy/Sell and the preserved fail-closed Send contract
// through prepare, execute, status, reconcile, and history without exposing
// owner ceremonies. Runtime capability is certified only by Prepare.
export const OPEN_MCP_VERSION = '0.5.0';

export function buildOpenMcpManifest() {
  return {
    name: 'OpenDexter',
    namespace: 'opendexter',
    url: OPEN_MCP_VAULT_AUDIENCE,
    description:
      'OpenDexter explores Indexter providers, finds services for concrete jobs, and buys x402 APIs. It also reads the bound Dexter Wallet and portfolio, then prepares, executes, checks, reconciles, and lists governed asset intents under reusable bounded mandates. The current integrated runtime supports autonomous governed Buy and Sell; the preserved Send input fails closed at Prepare until its protected executor and recovery are integrated. Tool presence is not capability: the exact Prepare response is authoritative. Approved assets are selected only by canonical server registry ID; enrollment, extension, and owner escalation remain outside model-callable tools, and provider output never authorizes spend.',
    version: OPEN_MCP_VERSION,
    auth: {
      mode: 'required',
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
