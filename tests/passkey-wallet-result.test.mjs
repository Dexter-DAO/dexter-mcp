import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPasskeyReadyData,
  getVaultReceiveAddress,
} from '../lib/passkey-wallet-result.mjs';

test('ready result uses the receive address as the public wallet address', () => {
  const result = buildPasskeyReadyData({
    receiveAddress: 'Receive111111111111111111111111111111111',
    vaultPda: 'VaultState1111111111111111111111111111111',
    swigAddress: 'SwigState11111111111111111111111111111111',
  });
  assert.equal(result.vault_address, 'Receive111111111111111111111111111111111');
  assert.equal(result.receive_address, result.vault_address);
  assert.equal(result.vault_pda, 'VaultState1111111111111111111111111111111');
  assert.equal(result.swig_state_address, result.swig_address);
});

test('state/config addresses never substitute for a missing receive address', () => {
  const vault = {
    vaultPda: 'VaultState1111111111111111111111111111111',
    swigAddress: 'SwigState11111111111111111111111111111111',
  };
  const result = buildPasskeyReadyData(vault);
  assert.equal(getVaultReceiveAddress(vault), null);
  assert.equal(result.vault_address, null);
  assert.equal(result.receive_address, null);
  assert.notEqual(result.vault_address, result.vault_pda);
  assert.notEqual(result.vault_address, result.swig_state_address);
});
