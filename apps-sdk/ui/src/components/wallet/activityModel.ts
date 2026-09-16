import { activityPageV4Schema } from '../../../../../lib/wallet-activity-contract.mjs';

export type ActivityAmount = { atomic: string; decimals: number; symbol: string; mint: string; network: string; displayAmount?: string };
export type WalletActivityItem = {
  id: string;
  occurredAt: string;
  kind: 'payment' | 'deposit' | 'withdrawal' | 'yield_started' | 'yield_stopped' | 'trade' | 'send' | 'refund';
  title: string;
  subtitle: string | null;
  status: 'proposed' | 'pending' | 'confirmed' | 'finalized' | 'failed' | 'refused' | 'refunded' | 'unknown';
  amount: ActivityAmount | null;
  amounts: { role: 'paid' | 'received' | 'fee' | 'refunded' | 'requested'; amount: ActivityAmount }[];
  actor: { kind: 'owner' | 'agent' | 'system' | 'external' | 'unknown'; name: string | null; agentId: string | null };
  asset?: { assetId: string; mint: string; symbol: string; name: string; companyName: string | null; description: string | null; logoUrl: string | null; websiteUrl: string | null } | null;
  service: { name: string; provider: string | null; resourceId: string | null; providerSlug: string | null; url: string | null; logoUrl: string | null; publicUrl?: string | null; description?: string | null } | null;
  details: { label: string; value: string }[];
  links: { label: string; url: string; kind: 'transaction' | 'service' | 'provider' }[];
  relatedActivityId: string | null;
};
export type ActivityPage = {
  schemaVersion: 4;
  namespace: 'dexter-wallet-activity/v4';
  walletAddress: string;
  observedAt: string;
  items: WalletActivityItem[];
  nextCursor: string | null;
  coverage: { state: 'complete' | 'partial'; sources: { category: string; state: 'available' | 'partial' | 'unavailable'; reason: string | null }[] };
};

export function normalizeActivityPage(value: unknown, walletAddress?: string): ActivityPage | null {
  const parsed = activityPageV4Schema.safeParse(value);
  if (!parsed.success || !walletAddress || parsed.data.walletAddress !== walletAddress) return null;
  return parsed.data as ActivityPage;
}

/** Keep exact atomic precision without converting balances to floating point. */
export function formatActivityAmount(amount: ActivityAmount | null): string {
  if (!amount) return 'Amount unavailable';
  if (amount.displayAmount !== undefined) {
    const [whole, fraction] = amount.displayAmount.replace(/^-/, '').split('.');
    const trimmed = fraction?.replace(/0+$/, '');
    return `${amount.displayAmount.startsWith('-') ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${trimmed ? `.${trimmed}` : ''} ${amount.symbol}`;
  }
  const negative = amount.atomic.startsWith('-');
  const digits = (negative ? amount.atomic.slice(1) : amount.atomic).padStart(amount.decimals + 1, '0');
  const whole = amount.decimals ? digits.slice(0, -amount.decimals) : digits;
  const fraction = amount.decimals ? digits.slice(-amount.decimals).replace(/0+$/, '') : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${grouped}${fraction ? `.${fraction}` : ''} ${amount.symbol}`;
}

export function activityCashDirection(amount: ActivityAmount | null): 'incoming' | 'outgoing' | null {
  if (!amount || amount.symbol !== 'USDC') return null;
  const value = amount.displayAmount ?? amount.atomic;
  if (!/[1-9]/.test(value)) return null;
  return value.startsWith('-') ? 'outgoing' : 'incoming';
}

/** USDC cash uses dollars; the exact token quantity remains available on hover. */
export function formatActivityValue(amount: ActivityAmount | null): string {
  const exact = formatActivityAmount(amount);
  if (!amount || amount.symbol !== 'USDC') return exact;
  const direction = activityCashDirection(amount);
  return `${direction === 'outgoing' ? '−' : direction === 'incoming' ? '+' : ''}$${exact.replace(/^−/, '').replace(/ USDC$/, '')}`;
}

export function activitySubtitle(item: WalletActivityItem): string {
  const name = item.actor.name;
  const internalName = name && (/^[a-z][a-z\d+.-]*:\/\//i.test(name) || /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/i.test(name));
  const actor = (internalName ? null : name) ?? (item.actor.kind === 'agent' ? 'Agent' : null);
  const status = { proposed: 'Proposed', pending: 'Pending', failed: 'Failed', refused: 'Declined', refunded: 'Refunded', unknown: 'Status unavailable', confirmed: null, finalized: null }[item.status];
  const subtitle = item.subtitle === 'CrossPay' ? null : item.subtitle;
  return [...new Set([subtitle, actor, status].filter(Boolean))].join(' · ');
}

export function activityTitle(item: WalletActivityItem): string {
  return item.kind === 'deposit' ? 'Received' : item.kind === 'withdrawal' ? 'Sent' : item.title;
}

export function activityDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function activityReceiptFacts(item: WalletActivityItem): string[] {
  const http = item.details.find((detail) => detail.label === 'Seller response')?.value;
  const delivery = item.details.find((detail) => detail.label === 'Delivery')?.value;
  const facts = item.details.flatMap(({ label, value }) => {
    if (['Asset', 'Provider', 'Seller response', 'Delivery'].includes(label)) return [];
    if (label === 'Recipient') return [`To ${value}`];
    if (label === 'Shares requested') return [`${value} shares requested`];
    if (label === 'Filled amounts') return [`Filled amounts ${value[0].toLowerCase()}${value.slice(1)}`];
    return [value];
  });
  if (delivery && delivery !== 'Response received') facts.push(`${delivery}${http ? ` (HTTP ${http})` : ''}`);
  else if (http && !/^2\d\d$/.test(http)) facts.push(`Provider returned HTTP ${http}`);
  return facts;
}

export function activityChainName(url: string): string {
  const host = new URL(url).hostname;
  return host === 'solscan.io' ? 'Solana' : host === 'basescan.org' ? 'Base' : host;
}

export function activityServiceUrl(item: WalletActivityItem): string | null {
  const value = item.service?.publicUrl ?? item.links.find((link) => link.kind === 'service')?.url;
  if (!value || !activityLinkAllowed(value)) return null;
  const url = new URL(value);
  return url.hostname === 'indexter.cash' && url.pathname.startsWith('/services/') ? value : null;
}

export function activityLinkAllowed(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
