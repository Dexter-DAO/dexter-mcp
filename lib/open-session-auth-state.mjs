export const VAULT_AUTH_MODE_OAUTH = 'oauth';
export const VAULT_AUTH_MODE_LINK_TOKEN = 'link_token';
export const VAULT_AUTH_MODE_LEGACY_BINDING = 'legacy_binding';

const VAULT_AUTH_MODES = new Set([
  VAULT_AUTH_MODE_OAUTH,
  VAULT_AUTH_MODE_LINK_TOKEN,
  VAULT_AUTH_MODE_LEGACY_BINDING,
]);
const SURFACE_HASH_RE = /^[0-9a-f]{64}$/;

function normalizeOAuthVaultIdentity(identity) {
  if (
    !identity
    || typeof identity !== 'object'
    || typeof identity.subject !== 'string'
    || identity.subject.length === 0
    || identity.subject.length > 512
    || typeof identity.surface !== 'string'
    || !SURFACE_HASH_RE.test(identity.surface)
    || typeof identity.issuer !== 'string'
    || identity.issuer.length === 0
    || identity.issuer.length > 512
    || typeof identity.audience !== 'string'
    || identity.audience.length === 0
    || identity.audience.length > 512
  ) {
    throw new TypeError('invalid_oauth_vault_identity');
  }
  return Object.freeze({
    subject: identity.subject,
    surface: identity.surface,
    issuer: identity.issuer,
    audience: identity.audience,
  });
}

function sameOAuthVaultIdentity(left, right) {
  return left?.subject === right.subject
    && left?.surface === right.surface
    && left?.issuer === right.issuer
    && left?.audience === right.audience;
}

export function createOpenSessionMeta(lastActivity = Date.now()) {
  return {
    lastActivity,
    mcpResource: null,
    accountBound: false,
    vaultBound: false,
    vaultAuthMode: null,
    vaultOAuthIdentity: null,
  };
}

export function touchOpenSessionMeta(meta, lastActivity = Date.now()) {
  const next = meta || createOpenSessionMeta(lastActivity);
  next.lastActivity = lastActivity;
  return next;
}

export function markAccountBound(meta) {
  const next = meta || createOpenSessionMeta();
  next.accountBound = true;
  return next;
}

export function openSessionResourceStatus(meta, resource) {
  if (typeof resource !== 'string' || resource.length === 0) {
    throw new TypeError('invalid_open_session_resource');
  }
  if (!meta?.mcpResource) return 'unpinned';
  return meta.mcpResource === resource ? 'match' : 'mismatch';
}

export function pinOpenSessionResource(meta, resource) {
  const next = meta || createOpenSessionMeta();
  const status = openSessionResourceStatus(next, resource);
  if (status === 'mismatch') {
    throw new Error('open_session_resource_mismatch');
  }
  next.mcpResource = resource;
  return next;
}

export function openSessionResourceOf(meta) {
  return typeof meta?.mcpResource === 'string' && meta.mcpResource.length > 0
    ? meta.mcpResource
    : null;
}

export function markVaultAuthMode(meta, authMode) {
  if (!VAULT_AUTH_MODES.has(authMode)) {
    throw new Error(`Unsupported vault auth mode: ${String(authMode)}`);
  }
  const next = meta || createOpenSessionMeta();
  next.vaultAuthMode = authMode;
  return next;
}

export function markVaultBound(meta, authMode = null) {
  const next = authMode
    ? markVaultAuthMode(meta, authMode)
    : (meta || createOpenSessionMeta());
  next.vaultBound = true;
  // Old personal connector and phone bindings can be discovered by a state
  // lookup before this process sees the raw link token. Preserve those
  // sessions as legacy-compatible, but never overwrite a known OAuth mode.
  if (!next.vaultAuthMode) next.vaultAuthMode = VAULT_AUTH_MODE_LEGACY_BINDING;
  return next;
}

export function clearVaultBound(meta) {
  const next = meta || createOpenSessionMeta();
  next.vaultBound = false;
  // Keep the mode. An OAuth binding can disappear after surface revocation or
  // a transient seed failure; the same MCP session must still require a fresh
  // valid Bearer instead of silently downgrading to legacy session auth.
  return next;
}

export function isAccountBound(meta) {
  return meta?.accountBound === true;
}

export function isVaultBound(meta) {
  return meta?.vaultBound === true;
}

export function vaultAuthModeOf(meta) {
  return VAULT_AUTH_MODES.has(meta?.vaultAuthMode) ? meta.vaultAuthMode : null;
}

export function isOAuthVaultSession(meta) {
  return vaultAuthModeOf(meta) === VAULT_AUTH_MODE_OAUTH;
}

export function oauthVaultIdentityStatus(meta, identity) {
  const normalized = normalizeOAuthVaultIdentity(identity);
  if (!meta?.vaultOAuthIdentity) return 'unpinned';
  return sameOAuthVaultIdentity(meta.vaultOAuthIdentity, normalized)
    ? 'match'
    : 'mismatch';
}

export function pinOAuthVaultIdentity(meta, identity) {
  const next = meta || createOpenSessionMeta();
  const normalized = normalizeOAuthVaultIdentity(identity);
  if (
    next.vaultOAuthIdentity
    && !sameOAuthVaultIdentity(next.vaultOAuthIdentity, normalized)
  ) {
    throw new Error('oauth_vault_identity_mismatch');
  }
  next.vaultOAuthIdentity = normalized;
  next.vaultAuthMode = VAULT_AUTH_MODE_OAUTH;
  return next;
}

export function oauthVaultIdentityOf(meta) {
  return meta?.vaultOAuthIdentity || null;
}

export function isLegacyVaultSession(meta) {
  const mode = vaultAuthModeOf(meta);
  return mode === VAULT_AUTH_MODE_LINK_TOKEN || mode === VAULT_AUTH_MODE_LEGACY_BINDING;
}

export function isAnyIdentityBound(meta) {
  return isAccountBound(meta) || isVaultBound(meta);
}
