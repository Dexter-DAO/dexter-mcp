export function extractMcpSessionId(extra) {
  if (extra?.sessionId) return extra.sessionId;
  const headerSources = [
    extra?.requestInfo?.headers,
    extra?.httpRequest?.headers,
    extra?.request?.headers,
  ].filter(Boolean);
  for (const headers of headerSources) {
    const value = headers?.['mcp-session-id']
      || headers?.['Mcp-Session-Id']
      || headers?.['MCP-SESSION-ID'];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
