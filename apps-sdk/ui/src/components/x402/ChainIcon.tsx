const CHAIN_MAP: Record<string, { name: string; slug: string }> = {
  solana: { name: 'Solana', slug: 'solana' },
  'solana:mainnet': { name: 'Solana', slug: 'solana' },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { name: 'Solana', slug: 'solana' },
  base: { name: 'Base', slug: 'base' },
  'eip155:8453': { name: 'Base', slug: 'base' },
  polygon: { name: 'Polygon', slug: 'polygon' },
  'eip155:137': { name: 'Polygon', slug: 'polygon' },
  'eip155:42161': { name: 'Arbitrum', slug: 'arbitrum' },
  arbitrum: { name: 'Arbitrum', slug: 'arbitrum' },
  'eip155:10': { name: 'Optimism', slug: 'optimism' },
  optimism: { name: 'Optimism', slug: 'optimism' },
  'eip155:43114': { name: 'Avalanche', slug: 'avalanche' },
  avalanche: { name: 'Avalanche', slug: 'avalanche' },
  'eip155:2046399126': { name: 'SKALE', slug: 'skale' },
  skale: { name: 'SKALE', slug: 'skale' },
};

const ASSET_BASE = 'https://dexter.cash/assets/chains';

const LOGO_FILES: Record<string, string> = {
  solana: 'solana.svg',
  base: 'base.svg',
  polygon: 'polygon.svg',
  arbitrum: 'arbitrum.svg',
  optimism: 'optimism.svg',
  avalanche: 'avalanche.svg',
  skale: 'skale.svg',
  usdc: 'usdc.svg',
};

export function getChain(network: string | null) {
  if (!network) return { name: '', slug: '' };
  return CHAIN_MAP[network] ?? { name: network, slug: 'default' };
}

export function ChainIcon({ network, size = 16 }: { network: string | null; size?: number }) {
  const { slug } = getChain(network);
  if (!slug) return null;

  const file = LOGO_FILES[slug];
  if (!file) {
    return <span className={`x4-chain-icon x4-chain-icon--${slug}`} aria-hidden="true" />;
  }

  return (
    <img
      src={`${ASSET_BASE}/${file}`}
      alt={slug}
      width={size}
      height={size}
      className="x4-chain-logo"
      aria-hidden="true"
    />
  );
}

export function UsdcIcon({ size = 16 }: { size?: number }) {
  return (
    <img
      src={`${ASSET_BASE}/usdc.svg`}
      alt="USDC"
      width={size}
      height={size}
      className="x4-chain-logo"
      aria-hidden="true"
    />
  );
}
