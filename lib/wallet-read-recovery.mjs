// This response is used only after a wallet-state read fails. It carries no
// payment retry or wallet-enrollment authority.
export function buildVaultReadError({ userBound = null } = {}) {
  const bindingProven = userBound === true;
  return {
    status: 503,
    mode: 'vault_read_error',
    paySource: 'anon_vault',
    user_bound: bindingProven ? true : null,
    vault_status: 'read_error',
    retryable: true,
    retryAfterMs: 2_000,
    error: 'vault_state_read_failed',
    message: bindingProven
      ? 'Your wallet is connected, but its current balance could not be read.'
      : 'The wallet connection and current balance could not be verified.',
    instructions: 'Continue the requested wallet read after the indicated delay, at most twice. Keep the original task. If the read remains unavailable, explain the service problem. Do not infer an empty wallet, ask for funding or new authorization, or repeat a payment.',
    tip: 'Current wallet information is temporarily unavailable.',
    reason: 'vault_state_read_failed',
    continuation: {
      kind: 'retry_read',
      tool: 'dexter_wallet',
      retryAfterMs: 2_000,
      maxAttempts: 2,
      userActionRequired: false,
    },
  };
}
