export function createOpenSessionMeta(lastActivity = Date.now()) {
  return {
    lastActivity,
    accountBound: false,
    vaultBound: false,
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

export function markVaultBound(meta) {
  const next = meta || createOpenSessionMeta();
  next.vaultBound = true;
  return next;
}

export function clearVaultBound(meta) {
  const next = meta || createOpenSessionMeta();
  next.vaultBound = false;
  return next;
}

export function isAccountBound(meta) {
  return meta?.accountBound === true;
}

export function isVaultBound(meta) {
  return meta?.vaultBound === true;
}

export function isAnyIdentityBound(meta) {
  return isAccountBound(meta) || isVaultBound(meta);
}

export function shouldSeedVaultOAuth(meta) {
  return !isVaultBound(meta);
}
