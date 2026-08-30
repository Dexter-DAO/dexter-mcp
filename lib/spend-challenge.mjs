import {
  REGISTERED_GOVERNED_ASSET_TOOL_NAMES,
} from './governed-asset-contract.mjs';

// ── OAuth advertisement: protected-tool challenge decision ─────────────────
//
// Pure decision logic, split out of open-mcp-server.mjs so the
// vault-boundary call is testable without booting the server (which
// listens and starts intervals at import time). Consumed by the raw POST
// handler in open-mcp-server.mjs; tested by tests/spend-challenge.test.mjs.
//
// The 401 challenge is how OAuth-capable hosts discover the vault rail: an
// unbound, Bearer-less session calling a protected entry-point tool gets HTTP 401 +
// WWW-Authenticate pointing at the RFC 9728 PRM, which advertises
// scope=vault, the exact single token that routes dexter-api's authorize
// to the passkey page. Initialization, tool discovery, marketplace search,
// checking, and access classification stay anonymous.

/**
 * Protected tools that emit a raw HTTP OAuth challenge for clients that only
 * begin authorization from transport status. Wallet and portfolio are setup
 * entry points. Handlers keep their nested
 * `_meta["mcp/www_authenticate"]` fallback for hosts that support tool-result
 * challenges.
 */
export const RAW_VAULT_CHALLENGE_TOOL_NAMES = new Set([
  'x402_wallet',
  'dexter_portfolio',
  'x402_fetch',
  ...REGISTERED_GOVERNED_ASSET_TOOL_NAMES,
]);

/**
 * Does the parsed JSON-RPC body contain a raw-challenge tools/call?
 * Bodies can be single messages OR batch arrays — ANY protected
 * tools/call anywhere in a batch counts.
 *
 * @param {unknown} messages - parsed JSON-RPC body (message or batch array)
 * @returns {boolean}
 */
export function hasRawVaultChallengeToolCall(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  return list.some(
    (msg) =>
      msg !== null
      && typeof msg === 'object'
      && msg.method === 'tools/call'
      && RAW_VAULT_CHALLENGE_TOOL_NAMES.has(msg.params?.name),
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
export function shouldChallengeVaultAccess({
  messages,
  hasValidVaultBearer,
  boundInMemory,
  boundDurable,
}) {
  if (hasValidVaultBearer || boundInMemory || boundDurable) return false;
  return hasRawVaultChallengeToolCall(messages);
}
