/**
 * Helper for OpenDexter MCP tools that need to call user-scoped dexter-api
 * routes (Bearer-only, e.g. /api/passkey-vault/*).
 *
 * The MCP session must already be bound to a Supabase user — i.e. the
 * pairing flow completed and userBindings.get(sessionId) returned an
 * entry with supabaseAccessToken set.
 *
 * Usage:
 *
 *   const res = await userScopedDexterFetch({
 *     binding,                             // userBindings.get(sessionId)
 *     path: '/api/passkey-vault/status',
 *     method: 'GET',
 *     onRefreshed: (newAccess, newRefresh) => {
 *       // Persist refreshed tokens back into the binding so future
 *       // calls don't re-refresh.
 *       binding.supabaseAccessToken = newAccess;
 *       binding.supabaseRefreshToken = newRefresh ?? binding.supabaseRefreshToken;
 *     },
 *   });
 *
 * On 401, the helper exchanges the refresh token via Supabase, updates
 * the binding via onRefreshed, and retries the request once. If the
 * refresh fails, the helper throws — caller should treat as "user must
 * re-pair."
 */

import { safeErrorLabel } from './safe-log-fields.mjs';

const DEXTER_API = (process.env.DEXTER_API_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Fetch from dexter-api on behalf of a paired user. Handles 401 by
 * refreshing the Supabase session and retrying once.
 *
 * @param {object} args
 * @param {object} args.binding - userBindings entry with supabaseAccessToken + supabaseRefreshToken
 * @param {string} args.path - dexter-api path (e.g. '/api/passkey-vault/status')
 * @param {string} [args.method='GET']
 * @param {object} [args.body] - JSON body, will be stringified
 * @param {object} [args.headers] - Extra headers
 * @param {function} [args.onRefreshed] - Called with (newAccessToken, newRefreshToken) after a successful refresh
 * @returns {Promise<Response>}
 */
export async function userScopedDexterFetch({
  binding,
  path,
  method = 'GET',
  body = undefined,
  headers = {},
  onRefreshed,
}) {
  if (!binding) throw new Error('user_not_paired');
  if (!binding.supabaseAccessToken) {
    throw new Error('user_paired_but_no_access_token');
  }

  const doFetch = (token) =>
    fetch(`${DEXTER_API}${path}`, {
      method,
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  // First attempt with the cached token.
  let res = await doFetch(binding.supabaseAccessToken);
  if (res.status !== 401) return res;

  // 401 — try to refresh once.
  if (!binding.supabaseRefreshToken) {
    return res; // can't refresh; let caller see the 401
  }

  const refreshed = await refreshSupabaseSession(binding.supabaseRefreshToken);
  if (!refreshed) {
    return res; // refresh failed; let caller see the 401
  }

  // Persist new tokens via the caller's onRefreshed hook.
  if (typeof onRefreshed === 'function') {
    try {
      onRefreshed(refreshed.access_token, refreshed.refresh_token);
    } catch (err) {
      console.warn(`[user-scoped-fetch] onRefreshed threw (${safeErrorLabel(err)})`);
    }
  }

  // Retry once with the new token.
  res = await doFetch(refreshed.access_token);
  return res;
}

/**
 * Exchange a refresh token for a new Supabase session via the
 * /auth/v1/token?grant_type=refresh_token endpoint. Returns null on
 * failure so callers can fall back to "user must re-pair."
 */
async function refreshSupabaseSession(refreshToken) {
  if (!SUPABASE_URL) {
    console.warn('[user-scoped-fetch] SUPABASE_URL missing — cannot refresh');
    return null;
  }
  if (!SUPABASE_ANON_KEY) {
    console.warn('[user-scoped-fetch] SUPABASE_ANON_KEY missing — cannot refresh');
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      console.warn(`[user-scoped-fetch] refresh failed status=${res.status}`);
      return null;
    }
    const json = await res.json();
    if (!json?.access_token) return null;
    return {
      access_token: String(json.access_token),
      refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    };
  } catch (err) {
    console.warn(`[user-scoped-fetch] refresh threw (${safeErrorLabel(err)})`);
    return null;
  }
}
