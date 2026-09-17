import { callOpenX402IntentApi } from './open-x402-intent-api.mjs';
import { NATIVE_MCP_PROTOCOL_VERSION, nativeMcpTargetSchema } from './native-mcp-contract.mjs';

/** Provider fields stay inside the normal untrusted-data and secret policy. */
export async function discoverHostedMcpTools(serverUrl, callApi = callOpenX402IntentApi) {
  const { data, httpStatus } = await callApi('mcpTools', { serverUrl });
  if (httpStatus >= 400 || data?.ok !== true) {
    return { ok: false, error: 'native_mcp_discovery_unavailable', httpStatus };
  }
  if (data.serverUrl !== serverUrl || data.protocolVersion !== NATIVE_MCP_PROTOCOL_VERSION
    || !Array.isArray(data.tools) || data.tools.length > 1000) {
    throw new Error('native_mcp_discovery_response_invalid');
  }
  const tools = data.tools.map((tool) => {
    nativeMcpTargetSchema.parse({ version: 1, serverUrl, toolName: tool?.name,
      argumentsJson: '{}', inputSchemaJson: tool?.inputSchemaJson,
      protocolVersion: data.protocolVersion });
    return tool;
  });
  return { ok: true, serverUrl, protocolVersion: data.protocolVersion, tools };
}
