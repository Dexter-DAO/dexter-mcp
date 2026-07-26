export const VAULT_AUTH_MODE_OAUTH = 'oauth';
export const VAULT_AUTH_MODE_LINK_TOKEN = 'link_token';
export const VAULT_AUTH_MODE_LEGACY_BINDING = 'legacy_binding';

const VAULT_AUTH_MODES = new Set([
  VAULT_AUTH_MODE_OAUTH,
  VAULT_AUTH_MODE_LINK_TOKEN,
  VAULT_AUTH_MODE_LEGACY_BINDING,
]);

export function createOpenSessionMeta(lastActivity = Date.now()) {
  return {
    lastActivity,
    accountBound: false,
    vaultBound: false,
    vaultAuthMode: null,
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

export function isLegacyVaultSession(meta) {
  const mode = vaultAuthModeOf(meta);
  return mode === VAULT_AUTH_MODE_LINK_TOKEN || mode === VAULT_AUTH_MODE_LEGACY_BINDING;
}

export function isAnyIdentityBound(meta) {
  return isAccountBound(meta) || isVaultBound(meta);
}
