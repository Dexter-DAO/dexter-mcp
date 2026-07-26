import {
  isLegacyVaultSession,
  isOAuthVaultSession,
} from './open-session-auth-state.mjs';
import { supportsLegacyAccountAuthorization } from './open-tool-auth.mjs';

/**
 * Decide whether the HTTP resource boundary must validate a vault Bearer for
 * the protected call in this request.
 *
 * A durable personal-link session is a separate, pre-OAuth authentication
 * rail and stays compatible. The legacy account JWT is narrower still: it can
 * authorize the two account-owned skill actions, never wallet reads or money
 * execution. Every OAuth-mode protected invocation is re-verified, including
 * requests whose Bearer is missing or stale.
 */
export function shouldVerifyVaultBearer({
  protectedCall,
  sessionMeta,
  bearerPresent,
  hasValidAccountBinding,
}) {
  if (!protectedCall) return false;
  if (isLegacyVaultSession(sessionMeta)) return false;
  if (supportsLegacyAccountAuthorization(protectedCall.name)) {
    // Account compatibility is request-scoped, not a sticky-session bypass:
    // the HS256 account Bearer must validate again on this invocation.
    return !hasValidAccountBinding;
  }
  return isOAuthVaultSession(sessionMeta) || bearerPresent;
}
