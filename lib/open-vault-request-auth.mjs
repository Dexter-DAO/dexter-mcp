import {
  isLegacyVaultSession,
  isOAuthVaultSession,
} from './open-session-auth-state.mjs';

/**
 * Decide whether the HTTP resource boundary must validate a vault Bearer for
 * the protected call in this request.
 *
 * A durable personal-link session is a separate, pre-OAuth authentication
 * rail and stays compatible. Every OAuth-mode protected invocation is
 * re-verified, including requests whose Bearer is missing or stale.
 */
export function shouldVerifyVaultBearer({
  protectedCall,
  sessionMeta,
  bearerPresent,
}) {
  if (!protectedCall) return false;
  if (isLegacyVaultSession(sessionMeta)) return false;
  return isOAuthVaultSession(sessionMeta) || bearerPresent;
}
