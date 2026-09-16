import { createHmac } from 'node:crypto';
import { fetchInternalApi, normalizeInternalApiOrigin } from './internal-api-fetch.mjs';
import { activityPageV4Schema } from './wallet-activity-contract.mjs';

export const SESSION_ACTIVITY_SIGNATURE_PURPOSE = 'mcp-activity-v4';
const MAX_BYTES = 512 * 1024;

export function signedSessionActivityHeaders(sessionId, secret, now = Date.now()) {
  const timestamp = String(now);
  return {
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', secret)
      .update(`${timestamp}.${sessionId}.${SESSION_ACTIVITY_SIGNATURE_PURPOSE}`)
      .digest('hex'),
  };
}

export async function fetchSessionActivity({
  apiBase, sessionId, expectedWalletAddress, secret,
  limit = 25, cursor, fetchImpl = fetch,
}) {
  if (!sessionId || !expectedWalletAddress || !secret) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor.length || cursor.length > 4096)) return null;
  try {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) query.set('cursor', cursor);
    const response = await fetchInternalApi(
      `/api/passkey-anon/mcp-activity/${encodeURIComponent(sessionId)}?${query}`,
      { headers: signedSessionActivityHeaders(sessionId, secret), signal: AbortSignal.timeout(8000) },
      { origin: normalizeInternalApiOrigin(apiBase), fetchImpl },
    );
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return null; }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const parsed = activityPageV4Schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success || parsed.data.walletAddress !== expectedWalletAddress || parsed.data.items.length > limit) return null;
    return parsed.data;
  } catch { return null; }
}
