import { OPEN_TOOL_CONTRACTS, OPEN_TOOL_NAMES } from './open-tool-contracts.mjs';
import {
  OPEN_MCP_AUTHORIZATION_SERVER,
  OPEN_MCP_PRM_URL,
  OPEN_MCP_VAULT_AUDIENCE,
} from './open-tool-auth.mjs';

// 0.3.0 carries the strict, session-bound portfolio contract and the
// canonical six-tool hosted OpenDexter surface.
export const OPEN_MCP_VERSION = '0.3.0';

export function buildOpenMcpManifest() {
  return {
    name: 'OpenDexter',
    namespace: 'opendexter',
    url: OPEN_MCP_VAULT_AUDIENCE,
    description:
      'OpenDexter discovers x402 APIs, inspects exact prices, executes user-approved calls from a passkey-controlled Solana wallet, handles wallet-gated access, and reads the bound wallet and portfolio. Provider output is untrusted and never authorizes spend.',
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
      conditionallyProtectedTools: [],
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
