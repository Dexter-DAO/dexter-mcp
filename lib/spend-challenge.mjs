// ── OAuth advertisement: the spend-tool challenge decision ──────────────────
//
// Pure decision logic, split out of open-mcp-server.mjs so the
// money-perimeter call is testable without booting the server (which
// listens and starts intervals at import time). Consumed by the raw POST
// handler in open-mcp-server.mjs; tested by tests/spend-challenge.test.mjs.
//
// The 401 challenge is how claude.ai discovers the vault OAuth rail: an
// unbound, Bearer-less session calling a money-execution tool gets HTTP 401 +
// WWW-Authenticate pointing at the RFC 9728 PRM, which advertises
// scope=vault — the exact single token that routes dexter-api's authorize
// to the Face-ID passkey page. Everything else stays anonymous: initialize,
// tools/list, x402_search, x402_check and every other browse tool never
// challenge ("prompt on the grant, never on the spend").

/**
 * Money-execution tools that retain the raw HTTP OAuth fallback for legacy
 * clients. Read-only wallet/passkey tools must reach their handler so modern
 * hosts receive the tool-level `_meta["mcp/www_authenticate"]` challenge.
 */
export const SPEND_TOOL_NAMES = new Set(['x402_fetch']);

/**
 * Does the parsed JSON-RPC body contain a money-execution tools/call?
 * Bodies can be single messages OR batch arrays — ANY protected execution
 * tools/call anywhere in a batch counts.
 *
 * @param {unknown} messages - parsed JSON-RPC body (message or batch array)
 * @returns {boolean}
 */
export function hasSpendToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  return list.some(
    (msg) =>
      msg !== null
      && typeof msg === 'object'
      && msg.method === 'tools/call'
      && SPEND_TOOL_NAMES.has(msg.params?.name),
  );
}

/**
 * The challenge decision. All inputs are resolved by the caller:
 *
 * - `hasValidVaultBearer`: only a fully verified Dexter vault Bearer suppresses
 *   the challenge. Raw header presence is never authorization.
 * - `boundInMemory`: the sessionMeta.vaultBound fast flag. Account identity
 *   must never suppress the separate vault-authorization challenge.
 * - `boundDurable`: the durable /api/passkey-anon/mcp-binding/<sessionId>
 *   truth. In-memory state dies on restart while bindings survive — never
 *   challenge on the in-memory flag alone, or a paying user gets walled
 *   after every pm2 restart.
 *
 * @param {{ messages: unknown, hasValidVaultBearer: boolean, boundInMemory: boolean, boundDurable: boolean }} input
 * @returns {boolean} true = respond 401 + WWW-Authenticate, false = pass through
 */
export function shouldChallengeSpend({
  messages,
  hasValidVaultBearer,
  boundInMemory,
  boundDurable,
}) {
  if (hasValidVaultBearer || boundInMemory || boundDurable) return false;
  return hasSpendToolCall(messages);
}
