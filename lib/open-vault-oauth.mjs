import { jwtVerify } from 'jose';

export const VAULT_OAUTH_ISSUER = 'https://dexter.cash';
export const VAULT_OAUTH_SCOPE = 'vault';

const SURFACE_HASH_RE = /^[0-9a-f]{64}$/;

export function oauthScopesFromPayload(payload) {
  if (typeof payload?.scope !== 'string') return [];
  return payload.scope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

export function hasRequiredVaultScope(payload) {
  return oauthScopesFromPayload(payload).includes(VAULT_OAUTH_SCOPE);
}

function invalid(reason, detail = null) {
  return {
    ok: false,
    reason,
    ...(detail ? { detail } : {}),
  };
}

/**
 * Verify a Dexter vault access token at the MCP resource boundary.
 *
 * This intentionally performs the complete resource-server check on every
 * protected invocation. Session binding is routing state, not a substitute for
 * OAuth authorization. The signed token must prove issuer, audience, lifetime,
 * scope=vault, and a revocable OAuth surface.
 */
export async function verifyOpenVaultBearer(
  token,
  {
    verificationKey,
    audience,
    issuer = VAULT_OAUTH_ISSUER,
    verify = jwtVerify,
  } = {},
) {
  if (typeof token !== 'string' || !token.trim()) {
    return invalid('missing_token');
  }
  if (!verificationKey || !audience) {
    throw new Error('verifyOpenVaultBearer requires verificationKey and audience');
  }

  let payload;
  try {
    ({ payload } = await verify(token.trim(), verificationKey, {
      issuer,
      audience,
      algorithms: ['ES256'],
    }));
  } catch (error) {
    if (error?.code === 'ERR_JWT_EXPIRED') return invalid('token_expired');
    if (error?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && error?.claim === 'nbf') {
      return invalid('token_not_active');
    }
    return invalid('invalid_token');
  }

  // `jose` accepts an audience array when any entry matches. OpenDexter binds
  // each access token to one exact MCP resource, so multi-audience tokens must
  // fail even when this resource appears in the array.
  if (payload?.aud !== audience) {
    return invalid('invalid_token', 'audience_must_be_one_exact_resource');
  }

  if (!hasRequiredVaultScope(payload)) {
    return invalid('insufficient_scope');
  }
  if (typeof payload?.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return invalid('invalid_token', 'missing_or_invalid_expiration');
  }
  if (typeof payload?.sub !== 'string' || !payload.sub) {
    return invalid('invalid_token', 'missing_subject');
  }
  if (
    typeof payload?.dexter_surface !== 'string'
    || !SURFACE_HASH_RE.test(payload.dexter_surface)
  ) {
    return invalid('invalid_token', 'missing_or_invalid_surface');
  }

  return {
    ok: true,
    payload,
    identity: Object.freeze({
      subject: payload.sub,
      surface: payload.dexter_surface,
      issuer,
      audience,
    }),
  };
}

export function oauthChallengeForVerification(result) {
  // RFC 6750 section 3.1: a request with no authentication information gets
  // a bare Bearer challenge. `invalid_token` is reserved for a supplied token
  // that is expired, revoked, malformed, or otherwise unacceptable.
  if (result?.reason === 'missing_token') return {};
  if (result?.reason === 'insufficient_scope') {
    return {
      error: 'insufficient_scope',
      errorDescription: 'Authorize OpenDexter with the vault scope to continue',
    };
  }
  if (result?.reason === 'token_expired' || result?.reason === 'token_not_active') {
    return {
      error: 'invalid_token',
      errorDescription: 'Your OpenDexter authorization is stale; connect again to continue',
    };
  }
  return {
    error: 'invalid_token',
    errorDescription: 'Connect OpenDexter with a valid vault authorization to continue',
  };
}
