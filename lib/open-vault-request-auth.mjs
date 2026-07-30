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

/**
 * A valid vault Bearer on a public request can seed the session before
 * tools/list or optional-OAuth x402_check runs. Invalid optional credentials
 * remain anonymous rather than turning a public operation into a challenge.
 */
export function shouldAcceptOptionalVaultBearer({
  protectedCall,
  sessionMeta,
  bearerPresent,
}) {
  return !protectedCall
    && bearerPresent === true
    && !isLegacyVaultSession(sessionMeta);
}
