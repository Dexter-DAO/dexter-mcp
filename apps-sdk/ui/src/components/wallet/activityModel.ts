import { activityPageV4Schema } from '../../../../../lib/wallet-activity-contract.mjs';

export type ActivityAmount = { atomic: string; decimals: number; symbol: string; mint: string; network: string };
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
  service: { name: string; provider: string | null; resourceId: string | null; providerSlug: string | null; url: string | null; logoUrl: string | null } | null;
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
  const negative = amount.atomic.startsWith('-');
  const digits = (negative ? amount.atomic.slice(1) : amount.atomic).padStart(amount.decimals + 1, '0');
  const whole = amount.decimals ? digits.slice(0, -amount.decimals) : digits;
  const fraction = amount.decimals ? digits.slice(-amount.decimals).replace(/0+$/, '') : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${grouped}${fraction ? `.${fraction}` : ''} ${amount.symbol}`;
}

export function activitySubtitle(item: WalletActivityItem): string {
  const actor = item.actor.name ?? (item.actor.kind === 'agent' ? 'Agent' : item.actor.kind === 'owner' ? 'You' : null);
  return [item.subtitle, actor, item.status === 'unknown' ? 'Status unavailable' : item.status].filter(Boolean).join(' · ');
}

export function activityLinkAllowed(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
