/**
 * Server-to-server helpers for the OpenDexter MCP pairing flow.
 *
 * The open MCP doesn't go through OAuth itself — when a card tool is
 * called and the current MCP session is not yet bound to a Dexter user,
 * we mint a connector OAuth `request_id` via dexter-api and hand the
 * resulting login URL to the agent so it can show the user where to
 * sign in. After the user signs in, dexter-api stores the result; the
 * open MCP polls /api/connector/oauth/result?request_id=... to discover
 * completion and bind the user.
 */
import { createHmac } from 'node:crypto';

const DEXTER_API = (process.env.DEXTER_API_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');
const SECRET = (process.env.INTERNAL_DEXTERCARD_HMAC_SECRET || '').trim();
const CLIENT_ID = (process.env.CONNECTOR_OPEN_MCP_CLIENT_ID || 'cid_opendexter_open_mcp').trim();
const REDIRECT_URI = (process.env.CONNECTOR_OPEN_MCP_REDIRECT_URI || 'https://dexter.cash/connector/auth/done').trim();

/**
 * Mint a fresh connector pairing request_id by calling
 * /api/connector/oauth/authorize?response_mode=json. Returns the
 * absolute URL the user should visit to sign in, plus the request_id
 * we'll later poll on completion. No HMAC needed — /authorize is a
 * public endpoint (the request_id itself is the capability).
 */
export async function mintPairingRequest(scope = 'dextercard') {
  const url = new URL(`${DEXTER_API}/api/connector/oauth/authorize`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', scope);
  url.searchParams.set('response_mode', 'json');

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pair_mint_failed status=${res.status} body=${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json?.ok || !json?.request_id || !json?.login_url) {
    throw new Error('pair_mint_invalid_response');
  }
  return {
    requestId: String(json.request_id),
    loginUrl: String(json.login_url),
  };
}

/**
 * Poll the result of a previously-minted pairing request_id. Gated by
 * HMAC (same scheme as /internal/dextercard/*) since this returns a
 * Dexter MCP JWT for the signed-in user.
 *
 * Returns one of:
 *   { status: 'pending' }
 *   { status: 'completed', supabaseUserId, supabaseEmail, dexterMcpJwt,
 *                          supabaseAccessToken, supabaseRefreshToken, expiresIn }
 *   { status: 'expired' | 'not_found' }
 *
 * supabaseAccessToken / supabaseRefreshToken are needed when a tool wants
 * to call user-scoped dexter-api routes (e.g. /api/passkey-vault/*) that
 * only accept Supabase Bearer auth. Read-only use only — never mutate
 * user state from the MCP without the user physically present.
 */
export async function pollPairingResult(requestId) {
  if (!SECRET) throw new Error('INTERNAL_DEXTERCARD_HMAC_SECRET missing');
  if (!requestId) throw new Error('requestId required');
  const ts = String(Date.now());
  const sig = createHmac('sha256', SECRET).update(`${ts}.${requestId}`).digest('hex');

  const url = `${DEXTER_API}/api/connector/oauth/result?request_id=${encodeURIComponent(requestId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Internal-Timestamp': ts,
      'X-Internal-Signature': sig,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`pair_poll_failed status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Passkey VAULT pairing (durable request_id bridge, no Supabase) ──────────
const VAULT_CLIENT_ID = (process.env.CONNECTOR_OPEN_MCP_VAULT_CLIENT_ID || 'cid_opendexter_vault').trim();
const VAULT_REDIRECT_URI = (
  process.env.CONNECTOR_OPEN_MCP_VAULT_REDIRECT_URI || 'https://dexter.cash/connector/auth/done'
).trim();

/**
 * Mint a durable vault-pairing request_id via
 * /api/passkey-vault/pair/authorize. The returned login_url is the
 * setup-passkey page carrying ?request_id=... — the user opens it, enrolls
 * (or, if already enrolled, instantly), and the page calls /pair/complete.
 * The request_id is a persisted DB row, so it survives dexter-api restarts
 * and does NOT depend on the (unstable) MCP session id.
 */
export async function mintVaultPairingRequest(mcpSessionId = null) {
  const url = new URL(`${DEXTER_API}/api/passkey-vault/pair/authorize`);
  url.searchParams.set('client_id', VAULT_CLIENT_ID);
  url.searchParams.set('redirect_uri', VAULT_REDIRECT_URI);
  url.searchParams.set('scope', 'vault');
  url.searchParams.set('response_mode', 'json');
  // Pass the MCP session id so /pair/complete can also populate the
  // mcp_vault_bindings row the x402 payment tools resolve against.
  if (mcpSessionId) url.searchParams.set('mcp_session_id', mcpSessionId);

  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vault_pair_mint_failed status=${res.status} body=${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json?.ok || !json?.request_id || !json?.login_url) {
    throw new Error('vault_pair_mint_invalid_response');
  }
  return { requestId: String(json.request_id), loginUrl: String(json.login_url) };
}

/**
 * Poll a vault pairing request_id. HMAC-gated (same scheme as above).
 * Returns one of:
 *   { status: 'pending' }
 *   { status: 'completed', user_handle, vault: { vaultPda, swigAddress, ... } | null }
 *   { status: 'expired' | 'not_found' }
 */
export async function pollVaultPairingResult(requestId) {
  if (!SECRET) throw new Error('INTERNAL_DEXTERCARD_HMAC_SECRET missing');
  if (!requestId) throw new Error('requestId required');
  const ts = String(Date.now());
  const sig = createHmac('sha256', SECRET).update(`${ts}.${requestId}`).digest('hex');

  const url = `${DEXTER_API}/api/passkey-vault/pair/result?request_id=${encodeURIComponent(requestId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Internal-Timestamp': ts, 'X-Internal-Signature': sig },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vault_pair_poll_failed status=${res.status} body=${text.slice(0, 200)}`);
  }
  return res.json();
}

// Durable vault-state read by MCP session id (replaces the in-memory Map +
// requestId polling). HMAC-gated, same scheme as pollVaultPairingResult.
export async function fetchVaultStateBySession(mcpSessionId) {
  if (!SECRET) throw new Error('INTERNAL_DEXTERCARD_HMAC_SECRET missing');
  const ts = String(Date.now());
  const sig = createHmac('sha256', SECRET).update(`${ts}.${mcpSessionId}`).digest('hex');
  const url = `${DEXTER_API}/api/passkey-vault/state?mcp_session_id=${encodeURIComponent(mcpSessionId)}`;
  const res = await fetch(url, {
    headers: { 'x-internal-timestamp': ts, 'x-internal-signature': sig },
  });
  if (!res.ok) throw new Error(`/state ${res.status}`);
  return res.json(); // { status, vault, ... }
}

// Vault-state read by user_handle — for clients that bind via the
// x-dexter-user-handle HTTP header (dexter-phone voice agent) rather than
// the legacy mcp_session_id pairing path. Calls the unauthenticated
// /api/passkey-vault-anon/status endpoint. No auth needed — the user_handle
// itself is the capability (16 random bytes; only the owner knows it).
//
// The /passkey-vault-anon/status response uses { enrolled, hasVault, vault,
// onchain, ... } but `fetchVaultStateBySession` callers expect a top-level
// `status` field. We normalize here so both helpers return the same shape.
export async function fetchVaultStateByUserHandle(userHandleBase64) {
  // The endpoint expects base64url; we may receive standard base64 from the
  // header. Convert: +→-, /→_, strip trailing =.
  const b64url = String(userHandleBase64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = `${DEXTER_API}/api/passkey-vault-anon/status?user_handle=${encodeURIComponent(b64url)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`/passkey-vault-anon/status ${res.status}`);
  const body = await res.json();

  // Normalize to { status, vault, onchain, ... } so callers don't care which
  // lookup path produced it. Map the anon endpoint's enrolled/hasVault flags
  // to the durable-state vocabulary.
  let status;
  if (body?.enrolled && body?.hasVault && body?.vault?.vaultPda) status = 'ready';
  else if (body?.enrolled && !body?.hasVault) status = 'provisioning';
  else if (!body?.enrolled && body?.credentialId) status = 'awaiting_ceremony';
  else status = 'not_enrolled';

  return {
    status,
    vault: body?.vault || null,
    onchain: body?.onchain || null,
    credentialId: body?.credentialId || null,
    deviceLabel: body?.deviceLabel || null,
    enrolledAt: body?.enrolledAt || null,
    claimedBySupabaseUser: Boolean(body?.claimedBySupabaseUser),
  };
}
