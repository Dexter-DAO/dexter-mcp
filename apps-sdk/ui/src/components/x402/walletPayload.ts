import {
  normalizePortfolioRead,
  type PortfolioReadState,
} from '../wallet/portfolioModel';

export type WalletChainBalance = {
  available: string;
  name: string;
  tier: 'first' | 'second';
};

export type WalletActivityItem = {
  /** ISO timestamp of the event. */
  at: string;
  kind: 'payment' | 'earn_start' | 'earn_stop' | 'deposit' | 'withdrawal';
  /** Signed USDC delta from the wallet's perspective (payments/withdrawals negative). */
  amountUsd: number;
  /** Human label — the seller host for a payment, else the money verb. */
  label: string;
  /** Solana tx signature, when present. */
  sig?: string;
};

export type WalletMoney = {
  /** Total spendable = cash + open credit (the dexter.cash wallet headline). */
  spendableUsd: number;
  /** Cash the user actually holds, in USDC. */
  cashUsd: number;
  /** Open (undrawn) credit available, in USDC. 0 when no line. */
  creditAvailableUsd: number;
  /** Position currently earning yield, in USDC. 0 when idle. */
  atWorkUsd: number;
  /** Whether the earning position is live. */
  isEarning: boolean;
  /**
   * Live attested earning rate in percent (server-gated to a fresh
   * attestation). null = don't show a number — never render a stale rate.
   */
  earnRatePct: number | null;
  /** Whether a credit line is open at all (cap > 0) — drives the open-a-line invite. */
  hasCreditLine: boolean;
  /** The line's total size in USD (0 when no line). */
  creditCapUsd: number;
  /** Currently drawn (owed) against the line, in USD. */
  creditDrawnUsd: number;
};

export type WalletCard = {
  /** Read-only card summary from the server; 'none' when no card is linked. */
  status: 'none' | 'active' | 'frozen';
  last4: string | null;
  expiry: string | null;
};

export type CanonicalWalletPayload = {
  address?: string;
  solanaAddress?: string;
  evmAddress?: string | null;
  network?: string;
  networkName?: string;
  chainBalances: Record<string, WalletChainBalance>;
  balances: {
    usdc: number;
    fundedAtomic?: string;
    spentAtomic?: string;
    availableAtomic?: string;
  };
  /** Non-custodial money composition (server emits spendingPower/credit/earning). */
  money?: WalletMoney;
  /** Dextercard summary (reveal/freeze ride the widget-only token, not tools). */
  card?: WalletCard;
  /** On-chain World ID weld state — drives the verified mark / verify invite. */
  personhood?: { verified: boolean };
  /** True when open agent tabs gate withdrawal. */
  withdrawalBlocked?: boolean;
  /** Count of open agent tabs against the wallet. */
  pendingVoucherCount?: number;
  /** Whether the wallet's USDC account is activated on-chain. */
  activated?: boolean;
  /** Recent recorded money events, newest first (real data from /activity). */
  activity?: WalletActivityItem[];
  /**
   * Portfolio inventory is independent from cash/credit. It is always present
   * as an explicit read state, and never participates in spendable arithmetic.
   */
  portfolio: PortfolioReadState;
  supportedNetworks?: string[];
  tip?: string;
  error?: string;
  state?: string;
  sessionId?: string;
  sessionToken?: string;
  sessionFunding?: Record<string, unknown>;
  mode?: string;
  userBound?: boolean;
  enrollUrl?: string;
  activateUrl?: string;
  expiresAt?: string | null;
  message?: string;
  hint?: string;
  sessionResolution?: {
    mode?: string;
    reason?: string;
  };
};

const CHAIN_META: Record<string, { name: string; tier: 'first' | 'second' }> = {
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': { name: 'Solana', tier: 'first' },
  'eip155:8453': { name: 'Base', tier: 'first' },
  'eip155:137': { name: 'Polygon', tier: 'second' },
  'eip155:42161': { name: 'Arbitrum', tier: 'second' },
  'eip155:10': { name: 'Optimism', tier: 'second' },
  'eip155:43114': { name: 'Avalanche', tier: 'second' },
  'eip155:56': { name: 'BSC', tier: 'second' },
  'eip155:1187947933': { name: 'SKALE', tier: 'second' },
  'eip155:480': { name: 'World Chain', tier: 'second' },
  'eip155:143': { name: 'Monad', tier: 'second' },
  'eip155:4663': { name: 'Robinhood', tier: 'second' },
};

function toAtomicString(usdc: number): string {
  return String(Math.max(0, Math.round(usdc * 1e6)));
}

function normalizeChainBalances(input: unknown): Record<string, WalletChainBalance> {
  if (!input || typeof input !== 'object') return {};

  const obj = input as Record<string, unknown>;
  const normalized: Record<string, WalletChainBalance> = {};

  for (const [caip2, raw] of Object.entries(obj)) {
    const meta = CHAIN_META[caip2];
    if (!raw || typeof raw !== 'object') continue;

    const record = raw as Record<string, unknown>;
    const explicitAvailable = record.available;
    const usdcFloat = typeof record.usdc === 'number' ? record.usdc : Number(record.usdc ?? 0);

    normalized[caip2] = {
      // The widget historically consumed `chainBalances[caip2].available` as atomic USDC.
      // Keep that contract stable even while producers migrate from older or ad-hoc shapes.
      available:
        explicitAvailable != null
          ? String(explicitAvailable)
          : toAtomicString(Number.isFinite(usdcFloat) ? usdcFloat : 0),
      name: typeof record.name === 'string' ? record.name : meta?.name ?? caip2,
      tier:
        record.tier === 'first' || record.tier === 'second'
          ? record.tier
          : meta?.tier ?? 'second',
    };
  }

  return normalized;
}

export function normalizeWalletPayload(toolOutput: unknown): CanonicalWalletPayload {
  const raw = (toolOutput && typeof toolOutput === 'object'
    ? (toolOutput as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const chainBalances = normalizeChainBalances(raw.chainBalances ?? raw.chains);
  const totalUsdcFromChains =
    Object.values(chainBalances).reduce((sum, balance) => sum + Number(balance.available || 0), 0) / 1e6;
  const explicitUsdc =
    typeof raw.balances === 'object' && raw.balances && typeof (raw.balances as Record<string, unknown>).usdc === 'number'
      ? ((raw.balances as Record<string, unknown>).usdc as number)
      : typeof raw.totalUsdc === 'number'
        ? raw.totalUsdc
        : totalUsdcFromChains;

  const balancesRecord =
    typeof raw.balances === 'object' && raw.balances ? (raw.balances as Record<string, unknown>) : {};

  // Non-custodial money composition. The server emits spendingPower (cash +
  // open credit), credit{availableAtomic}, and earning{isEarning, baseAtomic}.
  const atomicToUsd = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v ?? 0);
    return Number.isFinite(n) ? n / 1e6 : 0;
  };
  const sp = raw.spendingPower && typeof raw.spendingPower === 'object'
    ? (raw.spendingPower as Record<string, unknown>) : null;
  const cr = raw.credit && typeof raw.credit === 'object'
    ? (raw.credit as Record<string, unknown>) : null;
  const ea = raw.earning && typeof raw.earning === 'object'
    ? (raw.earning as Record<string, unknown>) : null;
  const cashUsd = sp ? atomicToUsd(sp.cashAtomic) : (typeof explicitUsdc === 'number' ? explicitUsdc : 0);
  const creditAvailableUsd = cr ? atomicToUsd(cr.availableAtomic) : (sp ? atomicToUsd(sp.creditAvailableAtomic) : 0);
  const spendableUsd = sp && typeof sp.totalUsd === 'number' ? sp.totalUsd : cashUsd + creditAvailableUsd;
  const isEarning = ea ? Boolean(ea.isEarning) : false;
  const atWorkUsd = ea ? atomicToUsd(ea.baseAtomic) : 0;
  const earnRatePct = ea && typeof ea.ratePct === 'number' && Number.isFinite(ea.ratePct) ? ea.ratePct : null;
  const money: CanonicalWalletPayload['money'] = (sp || cr || ea)
    ? {
        spendableUsd, cashUsd, creditAvailableUsd, atWorkUsd, isEarning, earnRatePct,
        hasCreditLine: Boolean(cr),
        creditCapUsd: cr ? atomicToUsd(cr.capAtomic) : 0,
        creditDrawnUsd: cr ? atomicToUsd(cr.borrowedAtomic) : 0,
      }
    : undefined;

  const ph = raw.personhood && typeof raw.personhood === 'object' ? (raw.personhood as Record<string, unknown>) : null;
  const personhood: CanonicalWalletPayload['personhood'] = ph ? { verified: Boolean(ph.verified) } : undefined;

  // Dextercard summary. Anything malformed reads as "no card" — the widget
  // never renders a card state it can't back with server data.
  const cardRaw = raw.card && typeof raw.card === 'object' ? (raw.card as Record<string, unknown>) : null;
  const cardStatus = cardRaw?.status === 'active' || cardRaw?.status === 'frozen' ? cardRaw.status : 'none';
  const card: CanonicalWalletPayload['card'] = cardRaw
    ? {
        status: cardStatus,
        last4: typeof cardRaw.last4 === 'string' && cardRaw.last4 ? cardRaw.last4 : null,
        expiry: typeof cardRaw.expiry === 'string' && cardRaw.expiry ? cardRaw.expiry : null,
      }
    : undefined;

  // Recent activity — the server emits { at, kind, amountAtomic, host, sig }.
  const activity: WalletActivityItem[] | undefined = Array.isArray(raw.activity)
    ? (raw.activity as Record<string, unknown>[])
        .map((it): WalletActivityItem | null => {
          const at = typeof it.at === 'string' ? it.at : null;
          const kind =
            it.kind === 'payment' || it.kind === 'earn_start' || it.kind === 'earn_stop' ||
            it.kind === 'deposit' || it.kind === 'withdrawal'
              ? it.kind
              : null;
          if (!at || !kind) return null;
          const amountUsd = atomicToUsd(it.amountAtomic);
          const host = typeof it.host === 'string' ? it.host : null;
          const label =
            kind === 'payment' ? (host ?? 'Paid API call')
            : kind === 'earn_start' ? 'Started earning'
            : kind === 'earn_stop' ? 'Stopped earning'
            : kind === 'deposit' ? 'Deposit received'
            : 'Withdrawal';
          return { at, kind, amountUsd, label, sig: typeof it.sig === 'string' ? it.sig : undefined };
        })
        .filter((x): x is WalletActivityItem => x !== null)
    : undefined;

  const address = typeof raw.address === 'string' ? raw.address : undefined;
  const solanaAddress =
    typeof raw.solanaAddress === 'string'
      ? raw.solanaAddress
      : address;
  const portfolio = normalizePortfolioRead(raw.portfolio, solanaAddress);
  const vaultRecord =
    raw.vault && typeof raw.vault === 'object'
      ? (raw.vault as Record<string, unknown>)
      : null;

  return {
    address,
    solanaAddress,
    evmAddress: typeof raw.evmAddress === 'string' ? raw.evmAddress : null,
    network: typeof raw.network === 'string' ? raw.network : undefined,
    networkName: typeof raw.networkName === 'string' ? raw.networkName : undefined,
    chainBalances,
    balances: {
      usdc: Number.isFinite(explicitUsdc) ? explicitUsdc : 0,
      fundedAtomic: typeof balancesRecord.fundedAtomic === 'string' ? balancesRecord.fundedAtomic : undefined,
      spentAtomic: typeof balancesRecord.spentAtomic === 'string' ? balancesRecord.spentAtomic : undefined,
      availableAtomic:
        typeof balancesRecord.availableAtomic === 'string'
          ? balancesRecord.availableAtomic
          : toAtomicString(Number.isFinite(explicitUsdc) ? explicitUsdc : 0),
    },
    money,
    card,
    personhood,
    withdrawalBlocked:
      typeof raw.withdrawalBlocked === 'boolean'
        ? raw.withdrawalBlocked
        : typeof vaultRecord?.withdrawalBlocked === 'boolean'
          ? vaultRecord.withdrawalBlocked
          : undefined,
    pendingVoucherCount:
      typeof raw.pendingVoucherCount === 'number'
        ? raw.pendingVoucherCount
        : typeof vaultRecord?.pendingVoucherCount === 'number'
          ? vaultRecord.pendingVoucherCount
          : undefined,
    activated:
      raw.vault && typeof raw.vault === 'object' && typeof (raw.vault as Record<string, unknown>).isActivated === 'boolean'
        ? (raw.vault as Record<string, unknown>).isActivated as boolean
        : raw.mode === 'vault_ready' ? true : undefined,
    activity,
    portfolio,
    supportedNetworks: Array.isArray(raw.supportedNetworks)
      ? raw.supportedNetworks.filter((v): v is string => typeof v === 'string')
      : undefined,
    tip: typeof raw.tip === 'string' ? raw.tip : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    state: typeof raw.state === 'string' ? raw.state : undefined,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    sessionToken: typeof raw.sessionToken === 'string' ? raw.sessionToken : undefined,
    sessionFunding:
      raw.sessionFunding && typeof raw.sessionFunding === 'object'
        ? (raw.sessionFunding as Record<string, unknown>)
        : undefined,
    mode: typeof raw.mode === 'string' ? raw.mode : undefined,
    userBound: typeof raw.user_bound === 'boolean' ? raw.user_bound : undefined,
    enrollUrl:
      typeof raw.enroll_url === 'string'
        ? raw.enroll_url
        : typeof raw.pairing_url === 'string'
          ? raw.pairing_url
          : undefined,
    activateUrl: typeof raw.activate_url === 'string' ? raw.activate_url : undefined,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    hint: typeof raw.hint === 'string' ? raw.hint : undefined,
    sessionResolution:
      raw.sessionResolution && typeof raw.sessionResolution === 'object'
        ? {
            mode: typeof (raw.sessionResolution as Record<string, unknown>).mode === 'string'
              ? (raw.sessionResolution as Record<string, unknown>).mode as string
              : undefined,
            reason: typeof (raw.sessionResolution as Record<string, unknown>).reason === 'string'
              ? (raw.sessionResolution as Record<string, unknown>).reason as string
              : undefined,
          }
        : undefined,
  };
}
