function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? null;
}

export function getVaultReceiveAddress(vault) {
  return firstString(vault?.receiveAddress, vault?.receive_address);
}

/**
 * Build the public ready state without presenting a state/config PDA as the
 * user's deposit address.
 */
export function buildPasskeyReadyData(vault) {
  const receiveAddress = getVaultReceiveAddress(vault);
  const vaultPda = firstString(vault?.vaultPda, vault?.vault_pda);
  const swigStateAddress = firstString(vault?.swigAddress, vault?.swig_address);

  return {
    vault_status: 'ready',
    // Backward-compatible display field: historically the public wallet
    // address, so it must remain the receive/deposit address.
    vault_address: receiveAddress,
    receive_address: receiveAddress,
    vault_pda: vaultPda,
    swig_address: swigStateAddress,
    swig_state_address: swigStateAddress,
    user_bound: true,
    welcome_name: null,
    error: null,
  };
}
