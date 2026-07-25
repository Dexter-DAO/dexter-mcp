/**
 * UI-side copy of E2's PortfolioSnapshotV1 boundary.
 *
 * The API package is not a dependency of this renderer, so this normalizer
 * deliberately re-checks the wire contract before any portfolio value is
 * shown. A malformed or wallet-mismatched snapshot fails as unavailable; it
 * never becomes an empty inventory or a zero-dollar total.
 *
 * Money arithmetic in this file is string/BigInt only. Portfolio quantities,
 * prices, and totals must never pass through JavaScript floating point.
 */

export const PORTFOLIO_ACTIONS = [
  'view',
  'receive',
  'send',
  'buy',
  'sell',
  'earn',
  'lend',
  'borrow',
  'pay',
] as const;

export type PortfolioAction = (typeof PORTFOLIO_ACTIONS)[number];
export type PortfolioReadStatus = 'available' | 'partial' | 'unavailable';
export type PortfolioEnrichmentStatus = 'complete' | 'partial' | 'unavailable';
export type PortfolioApprovalStatus = 'approved' | 'unreviewed' | 'blocked';
export type PortfolioAccountState = 'initialized' | 'frozen' | 'unknown';

export type PortfolioCapability = {
  action: PortfolioAction;
  available: boolean;
  reason: string | null;
};

export type PortfolioHolding = {
  mint: string;
  tokenAccount: string | null;
  tokenProgram: 'native' | 'spl-token' | 'token-2022';
  assetClass: 'cash' | 'yield' | 'token' | 'stock' | 'fund' | 'nft' | 'rwa';
  symbol: string;
  name: string;
  issuer: string | null;
  amountRaw: string;
  decimals: number;
  displayAmount: string;
  amountModel: 'raw-decimals' | 'scaled-ui-amount' | 'unknown';
  displayMultiplier: string | null;
  tokenExtensions: string[];
  accountState: PortfolioAccountState;
  valueUsd: string | null;
  price: {
    usd: string;
    source: string;
    observedAt: string;
    blockId: number | null;
    change24hPercent: string | null;
  } | null;
  approval: {
    status: PortfolioApprovalStatus;
    assetId: string | null;
    group: string | null;
    source: 'dexter-registry' | 'none';
  };
  capabilities: PortfolioCapability[];
  graphics: {
    canonicalImageUrl: string | null;
    dexScreenerImageUrl: string | null;
    dexScreenerHeaderUrl: string | null;
    openGraphImageUrl: string | null;
  };
  metadataObservedAt: string | null;
};

export type PortfolioSnapshotV1 = {
  schemaVersion: 1;
  network: 'solana-mainnet';
  walletAddress: string;
  vaultPda: string | null;
  observedAt: string;
  contextSlot: number | null;
  holdingsComplete: boolean;
  nextCursor: string | null;
  omittedHoldings: number;
  pricedValueUsd: string;
  portfolioValueUsd: string | null;
  pricedHoldings: number;
  unpricedHoldings: number;
  enrichment: {
    metadata: PortfolioEnrichmentStatus;
    pricing: PortfolioEnrichmentStatus;
    tokenExtensions: PortfolioEnrichmentStatus;
  };
  holdings: PortfolioHolding[];
};

export type PortfolioReadState =
  | {
      status: 'available' | 'partial';
      snapshot: PortfolioSnapshotV1;
      reason: null;
    }
  | {
      status: 'unavailable';
      snapshot: null;
      reason: 'not_provided' | 'wallet_mismatch' | 'invalid_snapshot';
    };

export type PortfolioActionState = {
  available: boolean;
  reason: string | null;
};

export type PortfolioActionReasonGroup = {
  reason: string;
  actions: PortfolioAction[];
};

const U64_MAX = 18_446_744_073_709_551_615n;
const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const SIGNED_DECIMAL = /^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58].map((character, index) => [character, BigInt(index)]));

type DecimalParts = { units: bigint; scale: number; negative: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseDecimal(value: string, signed = false): DecimalParts | null {
  if (!(signed ? SIGNED_DECIMAL : UNSIGNED_DECIMAL).test(value)) return null;
  const negative = value.startsWith('-');
  const absolute = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = absolute.split('.');
  return {
    units: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
    negative,
  };
}

function formatDecimalParts(parts: DecimalParts): string {
  const negative = parts.negative && parts.units !== 0n;
  let digits = parts.units.toString();
  if (parts.scale > 0) {
    digits = digits.padStart(parts.scale + 1, '0');
    const split = digits.length - parts.scale;
    const fraction = digits.slice(split).replace(/0+$/, '');
    digits = fraction ? `${digits.slice(0, split)}.${fraction}` : digits.slice(0, split);
  }
  digits = digits.replace(/^0+(?=[0-9])/, '') || '0';
  return negative ? `-${digits}` : digits;
}

function isCanonicalDecimal(value: unknown, signed = false): value is string {
  if (typeof value !== 'string') return false;
  const parts = parseDecimal(value, signed);
  return parts !== null && formatDecimalParts(parts) === value;
}

function addDecimals(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) throw new Error('invalid_decimal');
  const scale = Math.max(a.scale, b.scale);
  return formatDecimalParts({
    negative: false,
    units:
      a.units * 10n ** BigInt(scale - a.scale) +
      b.units * 10n ** BigInt(scale - b.scale),
    scale,
  });
}

function multiplyDecimals(left: string, right: string): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) throw new Error('invalid_decimal');
  return formatDecimalParts({
    negative: false,
    units: a.units * b.units,
    scale: a.scale + b.scale,
  });
}

function decimalFromRaw(amountRaw: string, decimals: number): string {
  return formatDecimalParts({
    negative: false,
    units: BigInt(amountRaw),
    scale: decimals,
  });
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSolanaPublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  let numeric = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) return false;
    numeric = numeric * 58n + digit;
  }

  let decodedLength = 0;
  while (numeric > 0n) {
    decodedLength += 1;
    numeric >>= 8n;
  }
  for (const character of value) {
    if (character !== '1') break;
    decodedLength += 1;
  }
  return decodedLength === 32;
}

function parseNullableUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isWebUrl(value) ? value : undefined;
}

function parseCapability(value: unknown): PortfolioCapability | null {
  if (!isRecord(value)) return null;
  if (!PORTFOLIO_ACTIONS.includes(value.action as PortfolioAction)) return null;
  if (typeof value.available !== 'boolean') return null;
  if (value.available ? value.reason !== null : !isNonEmptyString(value.reason)) return null;
  return {
    action: value.action as PortfolioAction,
    available: value.available,
    reason: value.reason as string | null,
  };
}

function parseHolding(value: unknown): PortfolioHolding | null {
  if (!isRecord(value)) return null;
  const tokenProgram =
    value.tokenProgram === 'native' ||
    value.tokenProgram === 'spl-token' ||
    value.tokenProgram === 'token-2022'
      ? value.tokenProgram
      : null;
  const assetClass =
    value.assetClass === 'cash' ||
    value.assetClass === 'yield' ||
    value.assetClass === 'token' ||
    value.assetClass === 'stock' ||
    value.assetClass === 'fund' ||
    value.assetClass === 'nft' ||
    value.assetClass === 'rwa'
      ? value.assetClass
      : null;
  const amountModel =
    value.amountModel === 'raw-decimals' ||
    value.amountModel === 'scaled-ui-amount' ||
    value.amountModel === 'unknown'
      ? value.amountModel
      : null;
  const accountState =
    value.accountState === 'initialized' ||
    value.accountState === 'frozen' ||
    value.accountState === 'unknown'
      ? value.accountState
      : null;

  if (
    !tokenProgram ||
    !assetClass ||
    !amountModel ||
    !accountState ||
    !isNonEmptyString(value.mint) ||
    (value.mint !== 'native:SOL' && !isSolanaPublicKey(value.mint)) ||
    ((tokenProgram === 'native') !== (value.mint === 'native:SOL')) ||
    (value.tokenAccount !== null && !isSolanaPublicKey(value.tokenAccount)) ||
    (tokenProgram === 'native' && value.tokenAccount !== null) ||
    (tokenProgram !== 'native' && value.tokenAccount === null) ||
    !isNonEmptyString(value.symbol) ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.issuer) ||
    typeof value.amountRaw !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value.amountRaw) ||
    BigInt(value.amountRaw) > U64_MAX ||
    !isNonNegativeInteger(value.decimals) ||
    value.decimals > 255 ||
    !isCanonicalDecimal(value.displayAmount) ||
    (value.displayMultiplier !== null && !isCanonicalDecimal(value.displayMultiplier)) ||
    !Array.isArray(value.tokenExtensions) ||
    !value.tokenExtensions.every(isNonEmptyString) ||
    (value.valueUsd !== null && !isCanonicalDecimal(value.valueUsd)) ||
    !isRecord(value.approval) ||
    !Array.isArray(value.capabilities) ||
    !isRecord(value.graphics) ||
    (value.metadataObservedAt !== null && !isIsoDate(value.metadataObservedAt))
  ) {
    return null;
  }

  if (
    (amountModel === 'scaled-ui-amount' && value.displayMultiplier === null) ||
    (amountModel !== 'scaled-ui-amount' && value.displayMultiplier !== null)
  ) {
    return null;
  }

  const expectedDisplay =
    amountModel === 'scaled-ui-amount'
      ? multiplyDecimals(
          decimalFromRaw(value.amountRaw, value.decimals),
          value.displayMultiplier as string,
        )
      : decimalFromRaw(value.amountRaw, value.decimals);
  if (value.displayAmount !== expectedDisplay) return null;

  let price: PortfolioHolding['price'] = null;
  if (value.price !== null) {
    if (
      !isRecord(value.price) ||
      !isCanonicalDecimal(value.price.usd) ||
      !isNonEmptyString(value.price.source) ||
      !isIsoDate(value.price.observedAt) ||
      (value.price.blockId !== null && !isNonNegativeInteger(value.price.blockId)) ||
      (value.price.change24hPercent !== null &&
        !isCanonicalDecimal(value.price.change24hPercent, true))
    ) {
      return null;
    }
    price = {
      usd: value.price.usd,
      source: value.price.source,
      observedAt: value.price.observedAt,
      blockId: value.price.blockId as number | null,
      change24hPercent: value.price.change24hPercent as string | null,
    };
  }
  if ((price === null) !== (value.valueUsd === null)) return null;
  if (price && value.valueUsd !== multiplyDecimals(value.displayAmount, price.usd)) return null;

  const approvalStatus =
    value.approval.status === 'approved' ||
    value.approval.status === 'unreviewed' ||
    value.approval.status === 'blocked'
      ? value.approval.status
      : null;
  const approvalSource =
    value.approval.source === 'dexter-registry' || value.approval.source === 'none'
      ? value.approval.source
      : null;
  if (
    !approvalStatus ||
    !approvalSource ||
    !isNullableString(value.approval.assetId) ||
    !isNullableString(value.approval.group)
  ) {
    return null;
  }

  const capabilities = value.capabilities.map(parseCapability);
  if (capabilities.some((capability) => capability === null)) return null;
  const capabilityActions = capabilities.map((capability) => capability!.action);
  if (
    capabilityActions.length !== PORTFOLIO_ACTIONS.length ||
    new Set(capabilityActions).size !== PORTFOLIO_ACTIONS.length ||
    PORTFOLIO_ACTIONS.some((action) => !capabilityActions.includes(action))
  ) {
    return null;
  }
  if (
    approvalStatus === 'blocked' &&
    capabilities.some((capability) => capability!.available)
  ) {
    return null;
  }

  const capabilityByAction = new Map(
    (capabilities as PortfolioCapability[]).map((capability) => [
      capability.action,
      capability,
    ]),
  );
  if (approvalStatus === 'blocked') {
    if (
      value.valueUsd !== null ||
      price !== null ||
      approvalSource !== 'dexter-registry' ||
      !isNonEmptyString(value.approval.assetId) ||
      !isNonEmptyString(value.approval.group) ||
      PORTFOLIO_ACTIONS.some((action) => {
        const capability = capabilityByAction.get(action);
        return capability?.available !== false || !isNonEmptyString(capability.reason);
      })
    ) {
      return null;
    }
  } else if (approvalStatus === 'approved') {
    const viewCapability = capabilityByAction.get('view');
    if (
      approvalSource !== 'dexter-registry' ||
      !isNonEmptyString(value.approval.assetId) ||
      !isNonEmptyString(value.approval.group) ||
      viewCapability?.available !== true ||
      viewCapability.reason !== null
    ) {
      return null;
    }
  } else if (
    approvalSource !== 'none' ||
    value.approval.assetId !== null ||
    value.approval.group !== null ||
    PORTFOLIO_ACTIONS.some((action) => {
      const capability = capabilityByAction.get(action);
      const expectedAvailable = action === 'view';
      return (
        capability?.available !== expectedAvailable ||
        capability.reason !== (expectedAvailable ? null : 'asset_not_approved')
      );
    })
  ) {
    return null;
  }

  const canonicalImageUrl = parseNullableUrl(value.graphics.canonicalImageUrl);
  const dexScreenerImageUrl = parseNullableUrl(value.graphics.dexScreenerImageUrl);
  const dexScreenerHeaderUrl = parseNullableUrl(value.graphics.dexScreenerHeaderUrl);
  const openGraphImageUrl = parseNullableUrl(value.graphics.openGraphImageUrl);
  if (
    canonicalImageUrl === undefined ||
    dexScreenerImageUrl === undefined ||
    dexScreenerHeaderUrl === undefined ||
    openGraphImageUrl === undefined
  ) {
    return null;
  }

  return {
    mint: value.mint,
    tokenAccount: value.tokenAccount as string | null,
    tokenProgram,
    assetClass,
    symbol: value.symbol,
    name: value.name,
    issuer: value.issuer as string | null,
    amountRaw: value.amountRaw,
    decimals: value.decimals,
    displayAmount: value.displayAmount,
    amountModel,
    displayMultiplier: value.displayMultiplier as string | null,
    tokenExtensions: [...value.tokenExtensions],
    accountState,
    valueUsd: value.valueUsd as string | null,
    price,
    approval: {
      status: approvalStatus,
      assetId: value.approval.assetId as string | null,
      group: value.approval.group as string | null,
      source: approvalSource,
    },
    capabilities: capabilities as PortfolioCapability[],
    graphics: {
      canonicalImageUrl,
      dexScreenerImageUrl,
      dexScreenerHeaderUrl,
      openGraphImageUrl,
    },
    metadataObservedAt: value.metadataObservedAt as string | null,
  };
}

function parseEnrichment(value: unknown): PortfolioSnapshotV1['enrichment'] | null {
  if (!isRecord(value)) return null;
  const valid = (status: unknown): status is PortfolioEnrichmentStatus =>
    status === 'complete' || status === 'partial' || status === 'unavailable';
  if (!valid(value.metadata) || !valid(value.pricing) || !valid(value.tokenExtensions)) {
    return null;
  }
  return {
    metadata: value.metadata,
    pricing: value.pricing,
    tokenExtensions: value.tokenExtensions,
  };
}

function parseSnapshot(value: unknown): PortfolioSnapshotV1 | null {
  if (!isRecord(value)) return null;
  const enrichment = parseEnrichment(value.enrichment);
  if (
    value.schemaVersion !== 1 ||
    value.network !== 'solana-mainnet' ||
    !isSolanaPublicKey(value.walletAddress) ||
    (value.vaultPda !== null && !isSolanaPublicKey(value.vaultPda)) ||
    !isIsoDate(value.observedAt) ||
    (value.contextSlot !== null && !isNonNegativeInteger(value.contextSlot)) ||
    typeof value.holdingsComplete !== 'boolean' ||
    (value.nextCursor !== null && !isNonEmptyString(value.nextCursor)) ||
    !isNonNegativeInteger(value.omittedHoldings) ||
    !isCanonicalDecimal(value.pricedValueUsd) ||
    (value.portfolioValueUsd !== null && !isCanonicalDecimal(value.portfolioValueUsd)) ||
    !isNonNegativeInteger(value.pricedHoldings) ||
    !isNonNegativeInteger(value.unpricedHoldings) ||
    !enrichment ||
    !Array.isArray(value.holdings)
  ) {
    return null;
  }

  const holdings = value.holdings.map(parseHolding);
  if (holdings.some((holding) => holding === null)) return null;
  const validHoldings = holdings as PortfolioHolding[];
  const holdingIdentities = validHoldings.map((holding) =>
    holding.tokenProgram === 'native'
      ? `native:${holding.mint}`
      : `token-account:${holding.tokenAccount}`,
  );
  if (new Set(holdingIdentities).size !== holdingIdentities.length) return null;
  const priced = validHoldings.filter((holding) => holding.valueUsd !== null);
  const unpriced = validHoldings.length - priced.length;
  if (value.pricedHoldings !== priced.length || value.unpricedHoldings !== unpriced) {
    return null;
  }
  const pricedValueUsd = priced.reduce(
    (sum, holding) => addDecimals(sum, holding.valueUsd as string),
    '0',
  );
  if (value.pricedValueUsd !== pricedValueUsd) return null;

  const expectedTotal = value.holdingsComplete && unpriced === 0 ? pricedValueUsd : null;
  if (value.portfolioValueUsd !== expectedTotal) return null;
  if (
    value.holdingsComplete &&
    (value.nextCursor !== null || value.omittedHoldings !== 0)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    network: 'solana-mainnet',
    walletAddress: value.walletAddress,
    vaultPda: value.vaultPda as string | null,
    observedAt: value.observedAt,
    contextSlot: value.contextSlot as number | null,
    holdingsComplete: value.holdingsComplete,
    nextCursor: value.nextCursor as string | null,
    omittedHoldings: value.omittedHoldings,
    pricedValueUsd,
    portfolioValueUsd: value.portfolioValueUsd as string | null,
    pricedHoldings: value.pricedHoldings,
    unpricedHoldings: value.unpricedHoldings,
    enrichment,
    holdings: validHoldings,
  };
}

export function normalizePortfolioRead(
  value: unknown,
  expectedWalletAddress?: string,
): PortfolioReadState {
  if (value === undefined || value === null) {
    return { status: 'unavailable', snapshot: null, reason: 'not_provided' };
  }
  const snapshot = parseSnapshot(value);
  if (!snapshot) {
    return { status: 'unavailable', snapshot: null, reason: 'invalid_snapshot' };
  }
  if (expectedWalletAddress && snapshot.walletAddress !== expectedWalletAddress) {
    return { status: 'unavailable', snapshot: null, reason: 'wallet_mismatch' };
  }

  const partial =
    !snapshot.holdingsComplete ||
    snapshot.nextCursor !== null ||
    snapshot.omittedHoldings > 0 ||
    snapshot.unpricedHoldings > 0 ||
    Object.values(snapshot.enrichment).some((status) => status !== 'complete') ||
    snapshot.holdings.some((holding) => holding.amountModel === 'unknown');
  return {
    status: partial ? 'partial' : 'available',
    snapshot,
    reason: null,
  };
}

/**
 * Final UI gate for the read-only slice. The producer's capability must be
 * exact, the account must be initialized, and B3 must have a real handler.
 * Buy/sell/send/earn/lend/borrow/pay cannot become live in this slice even if
 * a future producer accidentally marks them available.
 */
export function getPortfolioActionState(
  holding: PortfolioHolding,
  action: PortfolioAction,
  options: { receiveHandlerAvailable?: boolean } = {},
): PortfolioActionState {
  const capability = holding.capabilities.find((entry) => entry.action === action);
  if (!capability) return { available: false, reason: 'Capability unavailable' };
  if (!capability.available) {
    return { available: false, reason: capabilityReason(capability.reason) };
  }
  if (action === 'view') return { available: true, reason: null };
  if (holding.accountState === 'frozen') {
    return { available: false, reason: 'This token account is frozen' };
  }
  if (holding.accountState === 'unknown') {
    return { available: false, reason: 'Account state could not be verified' };
  }
  if (action === 'receive' && options.receiveHandlerAvailable) {
    return { available: true, reason: null };
  }
  if (action === 'receive') {
    return { available: false, reason: 'Receive is not available in this view' };
  }
  return {
    available: false,
    reason: capabilityReason(capability.reason) || 'A prepared action is required',
  };
}

export function groupPortfolioUnavailableActions(
  holding: PortfolioHolding,
  actions: readonly PortfolioAction[],
  options: { receiveHandlerAvailable?: boolean } = {},
): PortfolioActionReasonGroup[] {
  const grouped = new Map<string, PortfolioAction[]>();
  for (const action of actions) {
    const state = getPortfolioActionState(holding, action, options);
    if (state.available) continue;
    const reason = state.reason || 'Unavailable';
    const existing = grouped.get(reason);
    if (existing) existing.push(action);
    else grouped.set(reason, [action]);
  }
  return [...grouped].map(([reason, groupedActions]) => ({
    reason,
    actions: groupedActions,
  }));
}

export function capabilityReason(reason: string | null): string {
  switch (reason) {
    case 'governed_asset_rail_not_live':
      return 'Not available yet';
    case 'asset_not_approved':
      return 'Asset not reviewed';
    case 'token_program_mismatch':
      return 'Token program does not match';
    default:
      return reason ? reason.replaceAll('_', ' ') : '';
  }
}

function roundDecimalString(value: string, fractionDigits: number): string {
  const parsed = parseDecimal(value);
  if (!parsed) return value;
  if (parsed.scale <= fractionDigits) {
    return formatDecimalParts({
      ...parsed,
      scale: fractionDigits,
      units: parsed.units * 10n ** BigInt(fractionDigits - parsed.scale),
    });
  }
  const discarded = parsed.scale - fractionDigits;
  const divisor = 10n ** BigInt(discarded);
  const quotient = parsed.units / divisor;
  const remainder = parsed.units % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return formatDecimalParts({ negative: false, units: rounded, scale: fractionDigits });
}

function groupWholeDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatPortfolioUsd(value: string): string {
  const rounded = roundDecimalString(value, 2);
  const [whole, fraction = ''] = rounded.split('.');
  return `$${groupWholeDigits(whole)}.${fraction.padEnd(2, '0')}`;
}

export function formatPortfolioAmount(value: string, maxFractionDigits = 8): string {
  const [whole, fraction = ''] = value.split('.');
  if (!fraction) return groupWholeDigits(whole);
  if (fraction.length <= maxFractionDigits) {
    return `${groupWholeDigits(whole)}.${fraction}`;
  }
  return `${groupWholeDigits(whole)}.${fraction.slice(0, maxFractionDigits)}…`;
}
