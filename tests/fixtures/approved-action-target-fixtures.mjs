import { canonicalHash } from '../../lib/governed-canonical-identity.mjs';
import {
  MINTS,
  completePortfolio,
} from './wallet-portfolio-fixtures.mjs';

const REGISTRY_IDENTITY_DIGEST = 'a'.repeat(64);
const RUNTIME_RELEASE_DIGEST = 'b'.repeat(64);

function availability(assetId, action, available, reason, receiptCharacter) {
  return {
    namespace: 'dexter-governed-asset-action-availability/v1',
    action,
    assetId,
    registryIdentityDigest: REGISTRY_IDENTITY_DIGEST,
    runtimeReleaseDigest: RUNTIME_RELEASE_DIGEST,
    available,
    reason,
    receiptDigest: receiptCharacter.repeat(64),
  };
}

export function rehashApprovedActionTarget(value) {
  const { targetDigest: _ignored, ...identity } = value;
  return {
    ...identity,
    targetDigest: canonicalHash(identity),
  };
}

export function approvedActionTarget(overrides = {}) {
  const assetId = overrides.assetId ?? 'backpack-spcx';
  const target = {
    namespace: 'dexter-approved-action-target/v1',
    assetId,
    symbol: overrides.symbol ?? 'SPCX',
    name: overrides.name ?? 'SpaceX',
    network: 'solana-mainnet',
    mint: overrides.mint ?? MINTS.spcx,
    tokenProgram: overrides.tokenProgram ?? 'token-2022',
    decimals: overrides.decimals ?? 6,
    actions: overrides.actions ?? [
      availability(assetId, 'buy', true, null, 'c'),
      availability(assetId, 'sell', true, null, 'd'),
      availability(
        assetId,
        'send',
        false,
        'protected_agent_send_sdk_required',
        'e',
      ),
    ],
  };
  return rehashApprovedActionTarget(target);
}

export function secondApprovedActionTarget() {
  return approvedActionTarget({
    assetId: 'dexter',
    symbol: 'DEXTER',
    name: 'Dexter AI',
    mint: MINTS.dexter,
    tokenProgram: 'spl-token',
  });
}

export function zeroHoldingBuyDiscoveryPortfolio() {
  return {
    ...completePortfolio(),
    pricedValueUsd: '0',
    portfolioValueUsd: '0',
    pricedHoldings: 0,
    unpricedHoldings: 0,
    holdings: [],
    approvedActionTargets: [approvedActionTarget()],
  };
}
