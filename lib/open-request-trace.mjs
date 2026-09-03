const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function headerValue(headers, name) {
  const value = headers?.[name];
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' ? value : '';
}

function hasHeader(headers, name) {
  return headers?.[name] !== undefined;
}

function authorizationBucket(headers) {
  if (!hasHeader(headers, 'authorization')) return 'absent';
  return /^\s*bearer(?:\s|$)/i.test(headerValue(headers, 'authorization'))
    ? 'bearer'
    : 'other';
}

function initializeHeaderBucket(headers) {
  if (!hasHeader(headers, 'mcp-method')) return 'absent';
  return headerValue(headers, 'mcp-method').trim() === 'initialize'
    ? 'initialize'
    : 'other';
}

function contentTypeBucket(headers) {
  if (!hasHeader(headers, 'content-type')) return 'absent';
  const mediaType = headerValue(headers, 'content-type')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return mediaType === 'application/json' ? 'application/json' : 'other';
}

function protocolVersionBucket(headers) {
  if (!hasHeader(headers, 'mcp-protocol-version')) return 'absent';
  return /^\d{4}-\d{2}-\d{2}$/.test(
    headerValue(headers, 'mcp-protocol-version').trim(),
  )
    ? 'date'
    : 'other';
}

function rpcMethodBucket(body) {
  if (Array.isArray(body)) return 'batch';
  if (!body || typeof body !== 'object') return 'invalid';
  if (body.method === 'initialize') return 'initialize';
  return typeof body.method === 'string' ? 'other' : 'invalid';
}

export function isOpenMcpConnectionTraceEnabled(env = process.env) {
  const configured = String(env?.OPEN_MCP_CONNECTION_TRACE || '')
    .trim()
    .toLowerCase();
  if (configured) return ENABLED_VALUES.has(configured);
  return false;
}

export function summarizeFreshMcpRequest(headers, body) {
  const single = Boolean(body && typeof body === 'object' && !Array.isArray(body));
  const params = single && body.params && typeof body.params === 'object'
    ? body.params
    : null;
  const accept = headerValue(headers, 'accept').toLowerCase();

  return Object.freeze({
    httpMethod: 'POST',
    rpcMethod: rpcMethodBucket(body),
    headers: Object.freeze({
      authorization: authorizationBucket(headers),
      mcpSessionId: hasHeader(headers, 'mcp-session-id') ? 'present' : 'absent',
      mcpMethod: initializeHeaderBucket(headers),
      mcpName: hasHeader(headers, 'mcp-name') ? 'present' : 'absent',
      cookie: hasHeader(headers, 'cookie') ? 'present' : 'absent',
      origin: hasHeader(headers, 'origin') ? 'present' : 'absent',
      contentType: contentTypeBucket(headers),
      acceptJson: accept.includes('application/json'),
      acceptSse: accept.includes('text/event-stream'),
      protocolVersion: protocolVersionBucket(headers),
    }),
    body: Object.freeze({
      single,
      hasParams: single && hasOwn(body, 'params'),
      hasClientInfo: Boolean(params && hasOwn(params, 'clientInfo')),
      hasCapabilities: Boolean(params && hasOwn(params, 'capabilities')),
      hasProtocolVersion: Boolean(params && hasOwn(params, 'protocolVersion')),
    }),
  });
}
