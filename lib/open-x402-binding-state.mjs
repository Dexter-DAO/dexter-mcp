function checkedRequest({
  url,
  resourceId,
  method = 'GET',
  body,
  bodyProvided = false,
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  return {
    ...(typeof url === 'string' && url.length > 0 ? { url } : {}),
    ...(typeof resourceId === 'string' && resourceId.length > 0
      ? { resourceId }
      : {}),
    method: normalizedMethod,
    body: normalizedMethod === 'GET' ? null : bodyProvided ? body : null,
    requestBound: normalizedMethod === 'GET' || bodyProvided,
  };
}

export async function classifyMcpBindingLookupResponse(response) {
  const body = await response.json().catch(() => null);
  if (response.status === 404) {
    return body?.ok === false && body?.error === 'mcp_binding_not_found'
      ? { ok: true, bound: false }
      : { ok: false, bound: false };
  }
  if (!response.ok) return { ok: false, bound: false };
  const userHandle = typeof body?.user_handle === 'string' && body.user_handle
    ? body.user_handle
    : null;
  return userHandle
    ? { ok: true, bound: true, userHandle }
    : { ok: true, bound: false };
}

/**
 * A failed binding lookup is an outage, not evidence that the caller is
 * anonymous. Keeping those states separate prevents a connected user from
 * being sent through Connect again or receiving an unusable quote-only result.
 */
export function buildX402CheckBindingUnavailable(input) {
  return {
    ok: false,
    statusCode: 503,
    error: 'wallet_connection_temporarily_unavailable',
    reason: 'binding_lookup_failed',
    retryable: true,
    message: 'OpenDexter could not verify your wallet connection just now. Try the same check again in a moment.',
    checkedRequest: checkedRequest(input),
  };
}
