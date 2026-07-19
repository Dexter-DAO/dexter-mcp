export function formatCalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function shortenHash(hash: string, head = 8, tail = 6): string {
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}

export function shortenAddress(addr: string): string {
  return shortenHash(addr, 6, 4);
}

export function formatUsdc(atomic: string | number, decimals = 6): string {
  const n = Number(atomic) / Math.pow(10, decimals);
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatUsdcFloat(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function getExplorerUrl(tx: string, network?: string): string {
  if (network?.includes('1187947933')) return `https://skale-base-explorer.skalenodes.com/tx/${tx}`;
  if (network?.includes('8453')) return `https://basescan.org/tx/${tx}`;
  if (network?.includes('137')) return `https://polygonscan.com/tx/${tx}`;
  if (network?.includes('42161')) return `https://arbiscan.io/tx/${tx}`;
  if (network?.includes('43114')) return `https://snowtrace.io/tx/${tx}`;
  if (network?.includes('4663')) return `https://robinhoodchain.blockscout.com/tx/${tx}`;
  if (network?.includes('480')) return `https://worldscan.org/tx/${tx}`;
  if (network?.includes('143')) return `https://monadvision.com/tx/${tx}`;
  if (network?.includes('56')) return `https://bscscan.com/tx/${tx}`;
  if (network?.includes('10') && network?.includes('eip155')) return `https://optimistic.etherscan.io/tx/${tx}`;
  return `https://solscan.io/tx/${tx}`;
}
