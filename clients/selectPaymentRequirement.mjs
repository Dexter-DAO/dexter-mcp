/*
 * The legacy `x402/client` package supplied only this selection helper here,
 * but installed its entire wagmi/Base/Reown wallet graph in the hosted MCP
 * runtime. Keep the observed selection contract locally so a server-side
 * requirements choice does not pull browser-wallet connectors into production.
 */

const LEGACY_USDC_BY_NETWORK = new Map([
  ['base-sepolia', '0x036cbd53842c5426634e7929541ec2318f3dcf7e'],
  ['base', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
  ['avalanche-fuji', '0x5425890298aed601595a70ab815c96711a31bc65'],
  ['avalanche', '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'],
  ['iotex', '0xcdf79194c6c285077a58da47641d4dbe51f63542'],
  ['solana-devnet', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'],
  ['solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
  ['sei-testnet', '0x4fcf1784b31630811181f670aea7a7bef803eaed'],
  ['sei', '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392'],
  ['polygon', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'],
  ['polygon-amoy', '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'],
  ['peaq', '0xbba60da06c2c5424f03f7434542280fcad453d10'],
]);

const CAIP_USDC_BY_NETWORK = new Map([
  ['eip155:8453', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
  ['eip155:137', '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'],
  ['eip155:42161', '0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
  ['eip155:10', '0x0b2c639c533813f4aa9d7837caf62653d097ff85'],
  ['eip155:43114', '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'],
  [
    'solana:5eykt4usfv8p8njdtrepy1vzqkqzkvdp',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  ],
]);

function expectedUsdcAsset(network) {
  const normalized = typeof network === 'string' ? network.toLowerCase() : '';
  return CAIP_USDC_BY_NETWORK.get(normalized)
    ?? LEGACY_USDC_BY_NETWORK.get(normalized)
    ?? null;
}

function isSolanaNetwork(network) {
  return typeof network === 'string'
    && (network === 'solana' || network === 'solana-devnet' || network.startsWith('solana:'));
}

function networkMatches(network, expected) {
  if (!expected) return true;
  if (Array.isArray(expected)) return expected.includes(network);
  // Preserve the legacy selector's intentionally loose string comparison.
  return expected == network;
}

/**
 * Select one exact requirement without importing browser-wallet dependencies.
 *
 * Compatibility contract:
 * - do not mutate the merchant's accepts array;
 * - preserve the legacy preference for the short-name `base` network;
 * - preserve scheme/network filtering and USDC-first selection;
 * - accept current CAIP-2 network identifiers instead of throwing on them.
 */
export function selectPaymentRequirement(
  paymentRequirements,
  network,
  scheme,
) {
  if (!Array.isArray(paymentRequirements) || paymentRequirements.length === 0) {
    return undefined;
  }

  const ordered = [...paymentRequirements].sort((left, right) => {
    if (left?.network === 'base' && right?.network !== 'base') return -1;
    if (left?.network !== 'base' && right?.network === 'base') return 1;
    return 0;
  });

  const broadlyAccepted = ordered.filter((requirement) => {
    const expectedScheme = !scheme || requirement?.scheme === scheme;
    const expectedNetwork = networkMatches(requirement?.network, network);
    return expectedScheme && expectedNetwork;
  });

  const usdc = broadlyAccepted.find((requirement) => {
    const expectedAsset = expectedUsdcAsset(requirement?.network);
    if (expectedAsset === null || typeof requirement?.asset !== 'string') {
      return false;
    }
    return isSolanaNetwork(requirement.network)
      ? requirement.asset === expectedAsset
      : requirement.asset.toLowerCase() === expectedAsset;
  });

  return usdc ?? broadlyAccepted[0] ?? ordered[0];
}
