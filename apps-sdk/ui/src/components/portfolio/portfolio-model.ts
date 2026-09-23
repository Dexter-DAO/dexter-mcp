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
export type GovernedAction = 'buy' | 'sell' | 'send';
export type PortfolioAvailabilityReason =
  | 'governed_asset_rail_not_live'
  | 'governed_asset_action_not_supported'
  | 'protected_agent_send_sdk_required'
  | 'stock_approval_required'
  | 'stock_connection_unavailable'
  | 'stock_authority_unavailable'
  | 'stock_activation_unavailable'
  | 'stock_eligibility_required'
  | 'stock_eligibility_unavailable'
  | 'stock_direction_not_permitted';

export type HoldingCapabilityReason = PortfolioAvailabilityReason
  | 'asset_not_approved' | 'token_program_mismatch' | 'account_state_unverified' | 'unknown';
export type HoldingCapability = {
  action: PortfolioAction;
  available: boolean;
  reasonCode: HoldingCapabilityReason | null;
};
export type PortfolioMarketContext = {
  source: 'jupiter-tokens-v2';
  mint: string;
  observedAt: string;
  liquidityUsd: string | null;
  holderCount: number | null;
  activity24h: { traderCount: number | null };
};
export type PortfolioRegistryIdentity = {
  source: 'dexter-registry';
  providerName: string | null;
  legalIssuerName: string | null;
};
type EnrichmentStatus = 'complete' | 'partial' | 'unavailable';
export type PortfolioEnrichment = {
  metadata: EnrichmentStatus;
  pricing: EnrichmentStatus;
  tokenExtensions: EnrichmentStatus;
};

export type PortfolioHolding = {
  assetId: string | null;
  mint: string;
  tokenAccount: string | null;
  tokenProgram: 'native' | 'spl-token' | 'token-2022';
  assetClass: 'cash' | 'yield' | 'token' | 'stock' | 'fund' | 'nft' | 'rwa';
  symbol: string | null;
  name: string | null;
  amountRaw: string;
  decimals: number;
  displayAmount: string;
  amountModel: 'raw-decimals' | 'scaled-ui-amount' | 'unknown';
  displayMultiplier: string | null;
  accountState: 'initialized' | 'frozen' | 'unknown';
  valueUsd: string | null;
  priceUsd: string | null;
  priceObservedAt: string | null;
  change24hPercent: string | null;
  priceSource: 'jupiter-price-v3' | 'jupiter-exact-in-quote' | 'unknown' | null;
  priceBlockId: number | null;
  metadataObservedAt: string | null;
  marketContext: PortfolioMarketContext | null;
  registryIdentity: PortfolioRegistryIdentity | null;
  capabilities: HoldingCapability[];
  approvalStatus: 'approved' | 'unreviewed' | 'blocked';
  availableActions: PortfolioAction[];
};

export type ApprovedActionAvailability = {
  action: GovernedAction;
  available: boolean;
  reason: PortfolioAvailabilityReason | null;
};

export type ApprovedActionTarget = {
  assetId: string;
  symbol: string;
  name: string;
  network: 'solana-mainnet';
  mint: string;
  tokenProgram: 'spl-token' | 'token-2022';
  decimals: number;
  actions: ApprovedActionAvailability[];
};

export type PortfolioSnapshot = {
  contractVersion: 'opendexter.portfolio.v1';
  network: 'solana-mainnet';
  walletAddress: string;
  observedAt: string;
  contextSlot: number | null;
  holdingsComplete: boolean;
  omittedHoldings: number;
  pricedValueUsd: string;
  portfolioValueUsd: string | null;
  pricedHoldings: number;
  unpricedHoldings: number;
  enrichment: PortfolioEnrichment | null;
  holdings: PortfolioHolding[];
  approvedActionTargets: ApprovedActionTarget[];
};

export type PortfolioSummary = {
  label: 'Portfolio value' | 'Priced subtotal' | 'Portfolio value unavailable';
  value: string | null;
  exact: boolean;
};

export type PortfolioReadView = 'summary' | 'holdings' | 'detail' | 'targets';
export type CompactPortfolioHolding = Pick<PortfolioHolding,
  'assetId' | 'mint' | 'tokenAccount' | 'symbol' | 'name' | 'displayAmount'
  | 'amountModel' | 'valueUsd' | 'change24hPercent'>;
export type CompactPortfolioTarget = Pick<ApprovedActionTarget,
  'assetId' | 'mint' | 'tokenProgram' | 'symbol' | 'name' | 'actions'>;
export type PortfolioSourceSummary = Pick<PortfolioSnapshot,
  'pricedHoldings' | 'unpricedHoldings' | 'holdingsComplete' | 'omittedHoldings'
  | 'pricedValueUsd' | 'portfolioValueUsd'> & {
    holdingCount: number;
    targetCount: number | null;
    enrichment: PortfolioEnrichment;
  };
export type PortfolioSelection = {
  view: PortfolioReadView;
  query: string | null;
  mint: string | null;
  tokenAccount: string | null;
  limit: number;
  offset: number;
  matchedCount: number | null;
  returnedCount: number;
  omittedCount: number | null;
  nextCursor: string | null;
  match: 'matched' | 'none' | 'ambiguous' | 'unavailable';
};
export type SelectedPortfolioRead = {
  contractVersion: 'opendexter.portfolio.v2';
  network: 'solana-mainnet';
  walletAddress: string;
  observedAt: string;
  contextSlot: number | null;
  snapshotId: string;
  expiresAt: string;
  sourceSummary: PortfolioSourceSummary;
  selection: PortfolioSelection;
  holdings: CompactPortfolioHolding[];
  targets: CompactPortfolioTarget[];
  richHoldings: PortfolioHolding[];
};

export type PortfolioReadCollection = {
  read: SelectedPortfolioRead;
  holdings: Array<{ holding: CompactPortfolioHolding; rich: PortfolioHolding | null }>;
  targets: CompactPortfolioTarget[];
  /** Actual page rows already consumed; summary previews are excluded. */
  consumedHoldingIdentities: string[];
};

export type PortfolioViewModel =
  | { state: 'loading' }
  | {
      state: 'authentication_required';
      title: string;
      body: string;
    }
  | {
      state: 'read_error' | 'invalid';
      title: string;
      body: string;
      expired?: boolean;
    }
  | {
      state: 'ready';
      snapshot: PortfolioSnapshot;
      summary: PortfolioSummary;
      isEmpty: boolean;
      isPartial: boolean;
      coverage: string | null;
    }
  | {
      state: 'selected';
      read: SelectedPortfolioRead;
      summary: PortfolioSummary;
      coverage: string | null;
    };

type UnknownRecord = Record<string, unknown>;

const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CANONICAL_SIGNED_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const ASSET_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_MAX = 18_446_744_073_709_551_615n;
const GOVERNED_ACTIONS: GovernedAction[] = ['buy', 'sell', 'send'];
const GOVERNED_UNAVAILABLE_REASONS = new Set<PortfolioAvailabilityReason>([
  'governed_asset_rail_not_live',
  'governed_asset_action_not_supported',
  'protected_agent_send_sdk_required',
  'stock_approval_required',
  'stock_connection_unavailable',
  'stock_authority_unavailable',
  'stock_activation_unavailable',
  'stock_eligibility_required',
  'stock_eligibility_unavailable',
  'stock_direction_not_permitted',
]);
const HOLDING_UNAVAILABLE_REASONS = new Set<HoldingCapabilityReason>([
  ...GOVERNED_UNAVAILABLE_REASONS,
  'asset_not_approved', 'token_program_mismatch', 'account_state_unverified', 'unknown',
]);
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function exactKeys(value: UnknownRecord, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value: unknown, maxLength = Number.POSITIVE_INFINITY): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null;
  return value;
}

function safeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function nullableCount(value: unknown): number | null | undefined {
  return value === null ? null : safeCount(value) ?? undefined;
}

function decimal(value: unknown): string | null {
  return typeof value === 'string' && DECIMAL.test(value) ? value : null;
}

function nullableDecimal(value: unknown): string | null | undefined {
  if (value === null) return null;
  return decimal(value) ?? undefined;
}

function optionalHoldingLabel(source: UnknownRecord, key: string, maxLength: number): string | null | undefined {
  if (!Object.hasOwn(source, key)) return null;
  const value = nonEmptyString(source[key], maxLength);
  return value && value.trim().length > 0 ? value : undefined;
}

function optionalHoldingDecimal(source: UnknownRecord, key: string, signed = false): string | null | undefined {
  if (!Object.hasOwn(source, key) || source[key] === null) return null;
  const value = source[key];
  return typeof value === 'string' && value.length <= 384
    && CANONICAL_SIGNED_DECIMAL.test(value) && value !== '-0'
    && (signed || !value.startsWith('-'))
    ? value : undefined;
}

function isoDate(value: unknown): string | null {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    return null;
  }
  return value;
}

function nullableIsoDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isoDate(value) ?? undefined;
}

function parseMarketContext(value: unknown, holdingMint: string): PortfolioMarketContext | null | undefined {
  if (value === null) return null;
  const source = record(value);
  const activity = record(source?.activity24h);
  if (!source || !exactKeys(source, ['source', 'mint', 'observedAt', 'liquidityUsd', 'holderCount', 'activity24h'])
    || source.source !== 'jupiter-tokens-v2'
    || source.mint !== (holdingMint === 'native:SOL' ? WRAPPED_SOL_MINT : holdingMint)
    || !activity || !exactKeys(activity, ['traderCount'])) return undefined;
  const observedAt = isoDate(source.observedAt);
  const liquidityUsd = optionalHoldingDecimal(source, 'liquidityUsd');
  const holderCount = nullableCount(source.holderCount);
  const traderCount = nullableCount(activity.traderCount);
  if (!observedAt || liquidityUsd === undefined || holderCount === undefined || traderCount === undefined) return undefined;
  return { source: 'jupiter-tokens-v2', mint: source.mint as string, observedAt, liquidityUsd, holderCount,
    activity24h: { traderCount } };
}

function registryLabel(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && new TextEncoder().encode(value).length <= 128 ? value : undefined;
}

function parseRegistryIdentity(value: unknown): PortfolioRegistryIdentity | null | undefined {
  if (value === null) return null;
  const source = record(value);
  if (!source || !exactKeys(source, ['source', 'providerName', 'legalIssuerName'])
    || source.source !== 'dexter-registry') return undefined;
  const providerName = registryLabel(source.providerName);
  const legalIssuerName = registryLabel(source.legalIssuerName);
  if (providerName === undefined || legalIssuerName === undefined) return undefined;
  return { source: 'dexter-registry', providerName, legalIssuerName };
}

function parseHoldingCapabilities(value: unknown): HoldingCapability[] | undefined {
  if (!Array.isArray(value) || value.length !== PORTFOLIO_ACTIONS.length) return undefined;
  const capabilities: HoldingCapability[] = [];
  for (const item of value) {
    const source = record(item);
    if (!source || !exactKeys(source, ['action', 'available', 'reasonCode'])
      || !PORTFOLIO_ACTIONS.includes(source.action as PortfolioAction)
      || typeof source.available !== 'boolean'
      || (source.available ? source.reasonCode !== null
        : !HOLDING_UNAVAILABLE_REASONS.has(source.reasonCode as HoldingCapabilityReason))
      || capabilities.some(({ action }) => action === source.action)) return undefined;
    capabilities.push({ action: source.action as PortfolioAction, available: source.available,
      reasonCode: source.reasonCode as HoldingCapabilityReason | null });
  }
  return capabilities;
}

function parseEnrichment(value: unknown): PortfolioEnrichment | undefined {
  const source = record(value);
  const keys = ['metadata', 'pricing', 'tokenExtensions'];
  if (!source || !exactKeys(source, keys)
    || !keys.every((key) => ['complete', 'partial', 'unavailable'].includes(source[key] as string))) return undefined;
  return { metadata: source.metadata as EnrichmentStatus, pricing: source.pricing as EnrichmentStatus,
    tokenExtensions: source.tokenExtensions as EnrichmentStatus };
}

function addDecimals(left: string, right: string): string {
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = right.split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftUnits = BigInt(`${leftWhole}${leftFraction.padEnd(scale, '0')}`);
  const rightUnits = BigInt(`${rightWhole}${rightFraction.padEnd(scale, '0')}`);
  const digits = (leftUnits + rightUnits).toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const split = digits.length - scale;
  const fraction = digits.slice(split).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, split)}.${fraction}` : digits.slice(0, split);
}

function rawDecimal(amountRaw: string, decimals: number): string {
  if (decimals === 0) return amountRaw;
  const padded = amountRaw.padStart(decimals + 1, '0');
  const split = padded.length - decimals;
  const fraction = padded.slice(split).replace(/0+$/, '');
  return fraction ? `${padded.slice(0, split)}.${fraction}` : padded.slice(0, split);
}

function multiplyDecimals(left: string, right: string): string {
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = right.split('.');
  return rawDecimal(
    (BigInt(`${leftWhole}${leftFraction}`) * BigInt(`${rightWhole}${rightFraction}`)).toString(),
    leftFraction.length + rightFraction.length,
  );
}

function parseHolding(value: unknown): PortfolioHolding | null {
  const source = record(value);
  if (!source) return null;

  const assetId = source.assetId === null
    ? null
    : typeof source.assetId === 'string' && ASSET_ID.test(source.assetId)
      ? source.assetId
      : undefined;
  const mint = nonEmptyString(source.mint, 128);
  const tokenAccount = source.tokenAccount === null
    ? null
    : nonEmptyString(source.tokenAccount, 128) ?? undefined;
  const tokenProgram = source.tokenProgram === 'native'
    || source.tokenProgram === 'spl-token'
    || source.tokenProgram === 'token-2022'
    ? source.tokenProgram
    : null;
  const assetClass = source.assetClass === 'cash'
    || source.assetClass === 'yield'
    || source.assetClass === 'token'
    || source.assetClass === 'stock'
    || source.assetClass === 'fund'
    || source.assetClass === 'nft'
    || source.assetClass === 'rwa'
    ? source.assetClass
    : null;
  const amountRaw = typeof source.amountRaw === 'string' && INTEGER.test(source.amountRaw)
    ? source.amountRaw
    : null;
  const decimals = safeCount(source.decimals);
  const symbol = optionalHoldingLabel(source, 'symbol', 32);
  const name = optionalHoldingLabel(source, 'name', 128);
  const displayAmount = decimal(source.displayAmount);
  const displayMultiplier = optionalHoldingDecimal(source, 'displayMultiplier');
  const amountModel = source.amountModel === 'raw-decimals'
    || source.amountModel === 'scaled-ui-amount'
    || source.amountModel === 'unknown'
    ? source.amountModel
    : null;
  const accountState = source.accountState === 'initialized'
    || source.accountState === 'frozen'
    || source.accountState === 'unknown'
    ? source.accountState
    : null;
  const valueUsd = nullableDecimal(source.valueUsd);
  const priceUsd = nullableDecimal(source.priceUsd);
  const priceObservedAt = nullableIsoDate(source.priceObservedAt);
  const change24hPercent = optionalHoldingDecimal(source, 'change24hPercent', true);
  const priceSource = !Object.hasOwn(source, 'priceSource') || source.priceSource === null ? null
    : source.priceSource === 'jupiter-price-v3' || source.priceSource === 'jupiter-exact-in-quote'
      || source.priceSource === 'unknown' ? source.priceSource : undefined;
  const priceBlockId = Object.hasOwn(source, 'priceBlockId') ? nullableCount(source.priceBlockId) : null;
  const metadataObservedAt = Object.hasOwn(source, 'metadataObservedAt') ? nullableIsoDate(source.metadataObservedAt) : null;
  const marketContext = Object.hasOwn(source, 'marketContext') ? parseMarketContext(source.marketContext, mint ?? '') : null;
  const registryIdentity = Object.hasOwn(source, 'registryIdentity') ? parseRegistryIdentity(source.registryIdentity) : null;
  const capabilities = Object.hasOwn(source, 'capabilities') ? parseHoldingCapabilities(source.capabilities) : [];
  const approvalStatus = source.approvalStatus === 'approved'
    || source.approvalStatus === 'unreviewed'
    || source.approvalStatus === 'blocked'
    ? source.approvalStatus
    : null;
  const actions = Array.isArray(source.availableActions)
    ? source.availableActions
    : null;

  if (
    assetId === undefined
    || !mint
    || tokenAccount === undefined
    || !tokenProgram
    || !assetClass
    || !amountRaw
    || BigInt(amountRaw) > U64_MAX
    || decimals === null
    || decimals > 255
    || symbol === undefined
    || name === undefined
    || !displayAmount
    || displayMultiplier === undefined
    || !amountModel
    || !accountState
    || ((tokenProgram === 'native') !== (mint === 'native:SOL'))
    || (tokenProgram === 'native' && tokenAccount !== null)
    || (tokenProgram !== 'native' && tokenAccount === null)
    || valueUsd === undefined
    || priceUsd === undefined
    || priceObservedAt === undefined
    || change24hPercent === undefined
    || priceSource === undefined
    || priceBlockId === undefined
    || metadataObservedAt === undefined
    || marketContext === undefined
    || registryIdentity === undefined
    || capabilities === undefined
    || !approvalStatus
    || (registryIdentity !== null && approvalStatus !== 'approved')
    || !actions
    || !actions.every((action) => PORTFOLIO_ACTIONS.includes(action as PortfolioAction))
    || new Set(actions).size !== actions.length
    || (Object.hasOwn(source, 'capabilities') && (
      capabilities.filter(({ available }) => available).length !== actions.length
      || capabilities.some(({ action, available }) => available !== actions.includes(action))
    ))
    || (approvalStatus === 'approved' && assetId === null)
    || (approvalStatus !== 'approved' && assetId !== null)
    || (amountModel !== 'scaled-ui-amount' && displayAmount !== rawDecimal(amountRaw, decimals))
    || (Object.hasOwn(source, 'displayMultiplier') && (
      amountModel === 'scaled-ui-amount'
        ? displayMultiplier === null || displayMultiplier === '0'
          || displayAmount !== multiplyDecimals(rawDecimal(amountRaw, decimals), displayMultiplier)
        : displayMultiplier !== null
    ))
  ) {
    return null;
  }

  return {
    assetId,
    mint,
    tokenAccount,
    tokenProgram,
    assetClass,
    symbol,
    name,
    amountRaw,
    decimals,
    displayAmount,
    amountModel,
    displayMultiplier,
    accountState,
    valueUsd,
    priceUsd,
    priceObservedAt,
    change24hPercent,
    priceSource,
    priceBlockId,
    metadataObservedAt,
    marketContext,
    registryIdentity,
    capabilities,
    approvalStatus,
    availableActions: actions as PortfolioAction[],
  };
}

function parseApprovedAction(value: unknown, assetId: string, index: number): ApprovedActionAvailability | null {
  const source = record(value);
  const expectedAction = GOVERNED_ACTIONS[index];
  if (
    !source
    || source.namespace !== 'dexter-governed-asset-action-availability/v1'
    || source.action !== expectedAction
    || source.assetId !== assetId
    || typeof source.registryIdentityDigest !== 'string'
    || !SHA256_HEX.test(source.registryIdentityDigest)
    || typeof source.runtimeReleaseDigest !== 'string'
    || !SHA256_HEX.test(source.runtimeReleaseDigest)
    || typeof source.available !== 'boolean'
    || typeof source.receiptDigest !== 'string'
    || !SHA256_HEX.test(source.receiptDigest)
  ) {
    return null;
  }

  const reason = source.reason;
  if (
    (source.available && reason !== null)
    || (!source.available && !GOVERNED_UNAVAILABLE_REASONS.has(reason as PortfolioAvailabilityReason))
  ) {
    return null;
  }

  return {
    action: expectedAction,
    available: source.available,
    reason: reason as PortfolioAvailabilityReason | null,
  };
}

function parseApprovedTarget(value: unknown): ApprovedActionTarget | null {
  const source = record(value);
  const assetId = typeof source?.assetId === 'string' && ASSET_ID.test(source.assetId)
    ? source.assetId
    : null;
  const symbol = nonEmptyString(source?.symbol, 32);
  const name = nonEmptyString(source?.name, 128);
  const mint = typeof source?.mint === 'string' && SOLANA_ADDRESS.test(source.mint)
    ? source.mint
    : null;
  const tokenProgram = source?.tokenProgram === 'spl-token' || source?.tokenProgram === 'token-2022'
    ? source.tokenProgram
    : null;
  const decimals = safeCount(source?.decimals);
  const actions = Array.isArray(source?.actions) && assetId
    ? source.actions.map((action, index) => parseApprovedAction(action, assetId, index))
    : null;

  if (
    !source
    || source.namespace !== 'dexter-approved-action-target/v1'
    || !assetId
    || !symbol
    || !name
    || source.network !== 'solana-mainnet'
    || !mint
    || !tokenProgram
    || decimals === null
    || decimals > 18
    || !actions
    || actions.length !== GOVERNED_ACTIONS.length
    || actions.some((action) => action === null)
    || typeof source.targetDigest !== 'string'
    || !SHA256_HEX.test(source.targetDigest)
  ) {
    return null;
  }

  return {
    assetId,
    symbol,
    name,
    network: 'solana-mainnet',
    mint,
    tokenProgram,
    decimals,
    actions: actions as ApprovedActionAvailability[],
  };
}

function parseSnapshot(value: unknown): PortfolioSnapshot | null {
  const source = record(value);
  if (!source) return null;

  const walletAddress = nonEmptyString(source.walletAddress, 128);
  const observedAt = isoDate(source.observedAt);
  const contextSlot = source.contextSlot === null ? null : safeCount(source.contextSlot);
  const omittedHoldings = safeCount(source.omittedHoldings);
  const pricedValueUsd = decimal(source.pricedValueUsd);
  const portfolioValueUsd = nullableDecimal(source.portfolioValueUsd);
  const pricedHoldings = safeCount(source.pricedHoldings);
  const unpricedHoldings = safeCount(source.unpricedHoldings);
  const enrichment = Object.hasOwn(source, 'enrichment') ? parseEnrichment(source.enrichment) : null;
  const holdings = Array.isArray(source.holdings)
    ? source.holdings.map(parseHolding)
    : null;
  const targets = source.approvedActionTargets === undefined
    ? []
    : Array.isArray(source.approvedActionTargets)
      ? source.approvedActionTargets.map(parseApprovedTarget)
      : null;

  if (
    source.contractVersion !== 'opendexter.portfolio.v1'
    || source.network !== 'solana-mainnet'
    || !walletAddress
    || !observedAt
    || (source.contextSlot !== null && contextSlot === null)
    || typeof source.holdingsComplete !== 'boolean'
    || omittedHoldings === null
    || !pricedValueUsd
    || portfolioValueUsd === undefined
    || pricedHoldings === null
    || unpricedHoldings === null
    || enrichment === undefined
    || !holdings
    || holdings.some((holding) => holding === null)
    || !targets
    || targets.some((target) => target === null)
  ) {
    return null;
  }

  const parsedHoldings = holdings as PortfolioHolding[];
  const parsedTargets = targets as ApprovedActionTarget[];
  const calculatedPriced = parsedHoldings.filter((holding) => holding.valueUsd !== null);
  const calculatedUnpriced = parsedHoldings.length - calculatedPriced.length;
  const calculatedValue = calculatedPriced.reduce(
    (sum, holding) => addDecimals(sum, holding.valueUsd as string),
    '0',
  );
  const targetAssetIds = parsedTargets.map((target) => target.assetId);
  const targetMints = parsedTargets.map((target) => `${target.tokenProgram}:${target.mint}`);

  if (
    pricedHoldings !== calculatedPriced.length
    || unpricedHoldings !== calculatedUnpriced
    || pricedValueUsd !== calculatedValue
    || (source.holdingsComplete && omittedHoldings !== 0)
    || (
      source.holdingsComplete && calculatedUnpriced === 0
        ? portfolioValueUsd !== pricedValueUsd
        : portfolioValueUsd !== null
    )
    || new Set(targetAssetIds).size !== targetAssetIds.length
    || new Set(targetMints).size !== targetMints.length
    || targetAssetIds.some((assetId, index) => index > 0 && targetAssetIds[index - 1] >= assetId)
  ) {
    return null;
  }

  return {
    contractVersion: 'opendexter.portfolio.v1',
    network: 'solana-mainnet',
    walletAddress,
    observedAt,
    contextSlot,
    holdingsComplete: source.holdingsComplete,
    omittedHoldings,
    pricedValueUsd,
    portfolioValueUsd,
    pricedHoldings,
    unpricedHoldings,
    enrichment,
    holdings: parsedHoldings,
    approvedActionTargets: parsedTargets,
  };
}

const COMPACT_HOLDING_KEYS = [
  'assetId', 'mint', 'tokenAccount', 'symbol', 'name', 'displayAmount',
  'amountModel', 'valueUsd', 'change24hPercent',
] as const;
const RICH_HOLDING_KEYS = new Set([
  ...COMPACT_HOLDING_KEYS, 'tokenProgram', 'assetClass', 'amountRaw', 'decimals',
  'displayMultiplier', 'accountState', 'priceUsd', 'priceObservedAt', 'priceSource',
  'priceBlockId', 'metadataObservedAt', 'marketContext', 'registryIdentity',
  'capabilities', 'approvalStatus', 'availableActions',
]);

function opaque(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    && /^[\x21-\x7e]+$/.test(value);
}

function holdingMint(value: unknown): value is string {
  return value === 'native:SOL' || typeof value === 'string' && SOLANA_ADDRESS.test(value);
}

function compactHolding(value: unknown): CompactPortfolioHolding | null {
  const source = record(value);
  if (!source || !exactKeys(source, [...COMPACT_HOLDING_KEYS])) return null;
  const label = (key: string, max: number) => source[key] === null
    || typeof source[key] === 'string' && source[key].length <= max && source[key].trim().length > 0;
  if (!(source.assetId === null || typeof source.assetId === 'string' && ASSET_ID.test(source.assetId))
    || !holdingMint(source.mint)
    || !(source.tokenAccount === null || typeof source.tokenAccount === 'string' && SOLANA_ADDRESS.test(source.tokenAccount))
    || ((source.mint === 'native:SOL') !== (source.tokenAccount === null))
    || !label('symbol', 32) || !label('name', 128)
    || typeof source.displayAmount !== 'string' || source.displayAmount.length > 384 || !decimal(source.displayAmount)
    || !['raw-decimals', 'scaled-ui-amount', 'unknown'].includes(String(source.amountModel))
    || nullableDecimal(source.valueUsd) === undefined
    || typeof source.valueUsd === 'string' && source.valueUsd.length > 384
    || optionalHoldingDecimal(source, 'change24hPercent', true) === undefined) return null;
  return source as CompactPortfolioHolding;
}

function selectedRichHolding(value: unknown): PortfolioHolding | null {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => !RICH_HOLDING_KEYS.has(key))) return null;
  const parsed = parseHolding(source);
  if (!parsed || !holdingMint(parsed.mint)
    || parsed.tokenAccount !== null && !SOLANA_ADDRESS.test(parsed.tokenAccount)
    || parsed.priceUsd === null && (parsed.priceSource !== null || parsed.priceBlockId !== null)) return null;
  return parsed;
}

function compactProjection(holding: PortfolioHolding): CompactPortfolioHolding {
  return Object.fromEntries(COMPACT_HOLDING_KEYS.map((key) => [key, holding[key]])) as CompactPortfolioHolding;
}

function sameCompactHolding(left: CompactPortfolioHolding, right: CompactPortfolioHolding): boolean {
  return COMPACT_HOLDING_KEYS.every((key) => left[key] === right[key]);
}

function compactTarget(value: unknown): CompactPortfolioTarget | null {
  const source = record(value);
  if (!source || !exactKeys(source, ['assetId', 'mint', 'tokenProgram', 'symbol', 'name', 'actions'])
    || typeof source.assetId !== 'string' || !ASSET_ID.test(source.assetId)
    || typeof source.mint !== 'string' || !SOLANA_ADDRESS.test(source.mint)
    || !['spl-token', 'token-2022'].includes(String(source.tokenProgram))
    || !nonEmptyString(source.symbol, 32) || !nonEmptyString(source.name, 128)
    || !Array.isArray(source.actions) || source.actions.length !== GOVERNED_ACTIONS.length) return null;
  const actions: ApprovedActionAvailability[] = [];
  for (const [index, value] of source.actions.entries()) {
    const action = record(value);
    if (!action || !exactKeys(action, ['action', 'available', 'reason'])
      || action.action !== GOVERNED_ACTIONS[index] || typeof action.available !== 'boolean'
      || (action.available ? action.reason !== null : !GOVERNED_UNAVAILABLE_REASONS.has(action.reason as PortfolioAvailabilityReason))) return null;
    actions.push(action as ApprovedActionAvailability);
  }
  return { assetId: source.assetId, mint: source.mint, tokenProgram: source.tokenProgram as CompactPortfolioTarget['tokenProgram'],
    symbol: source.symbol as string, name: source.name as string, actions };
}

function parseSelectedRead(value: unknown, cardValue: unknown): SelectedPortfolioRead | null {
  const source = record(value);
  const summary = record(source?.sourceSummary);
  const selection = record(source?.selection);
  if (!source || !exactKeys(source, ['contractVersion', 'network', 'walletAddress', 'observedAt', 'contextSlot',
    'snapshotId', 'expiresAt', 'sourceSummary', 'selection', 'holdings', 'targets'])
    || source.contractVersion !== 'opendexter.portfolio.v2' || source.network !== 'solana-mainnet'
    || typeof source.walletAddress !== 'string' || !SOLANA_ADDRESS.test(source.walletAddress)
    || !isoDate(source.observedAt) || !isoDate(source.expiresAt)
    || Date.parse(source.expiresAt as string) <= Date.parse(source.observedAt as string)
    || nullableCount(source.contextSlot) === undefined || !opaque(source.snapshotId, 128)
    || !summary || !exactKeys(summary, ['holdingCount', 'pricedHoldings', 'unpricedHoldings', 'holdingsComplete',
      'omittedHoldings', 'pricedValueUsd', 'portfolioValueUsd', 'enrichment', 'targetCount'])
    || !selection || !exactKeys(selection, ['view', 'query', 'mint', 'tokenAccount', 'limit', 'offset',
      'matchedCount', 'returnedCount', 'omittedCount', 'nextCursor', 'match'])) return null;

  for (const key of ['holdingCount', 'pricedHoldings', 'unpricedHoldings', 'omittedHoldings']) {
    if (safeCount(summary[key]) === null) return null;
  }
  const total = summary.holdingCount as number;
  const priced = summary.pricedHoldings as number;
  const unpriced = summary.unpricedHoldings as number;
  const targetCount = nullableCount(summary.targetCount);
  const enrichment = parseEnrichment(summary.enrichment);
  if (targetCount === undefined || !enrichment || total !== priced + unpriced
    || typeof summary.holdingsComplete !== 'boolean'
    || summary.holdingsComplete && summary.omittedHoldings !== 0
    || !decimal(summary.pricedValueUsd) || nullableDecimal(summary.portfolioValueUsd) === undefined
    || (summary.holdingsComplete && unpriced === 0
      ? summary.portfolioValueUsd !== summary.pricedValueUsd : summary.portfolioValueUsd !== null)
    || priced === 0 && summary.pricedValueUsd !== '0') return null;

  const view = selection.view;
  if (!['summary', 'holdings', 'detail', 'targets'].includes(String(view))) return null;
  const limit = safeCount(selection.limit);
  const offset = safeCount(selection.offset);
  const returned = safeCount(selection.returnedCount);
  const matched = nullableCount(selection.matchedCount);
  const omitted = nullableCount(selection.omittedCount);
  const query = selection.query;
  if (limit === null || limit < 1 || limit > (view === 'summary' ? 5 : 32)
    || view === 'summary' && limit !== 5
    || offset === null || returned === null || returned > limit || matched === undefined || omitted === undefined
    || !(query === null || typeof query === 'string' && query.trim() === query && query.length > 0
      && new TextEncoder().encode(query).length <= 128)
    || !(selection.mint === null || holdingMint(selection.mint))
    || !(selection.tokenAccount === null || typeof selection.tokenAccount === 'string' && SOLANA_ADDRESS.test(selection.tokenAccount))
    || query !== null && selection.mint !== null
    || selection.tokenAccount !== null && (view !== 'detail' || selection.mint === null)
    || selection.mint === 'native:SOL' && selection.tokenAccount !== null
    || !(selection.nextCursor === null || opaque(selection.nextCursor, 1024))
    || view === 'summary' && (query !== null || selection.mint !== null || selection.tokenAccount !== null || offset !== 0 || selection.nextCursor !== null)
    || view === 'detail' && query === null && selection.mint === null
    || !Array.isArray(source.holdings) || !Array.isArray(source.targets)
    || source.holdings.length + source.targets.length !== returned
    || (view === 'targets' ? source.holdings.length !== 0 : source.targets.length !== 0)) return null;

  const sourceCount = view === 'targets' ? targetCount : total;
  if (sourceCount === null) {
    if (matched !== null || omitted !== null || returned !== 0 || offset !== 0
      || selection.nextCursor !== null || selection.match !== 'unavailable') return null;
  } else {
    if (matched === null || omitted !== sourceCount - returned || matched > sourceCount
      || offset + returned > matched || (matched > 0 && returned === 0)
      || selection.match !== (matched === 0 ? 'none' : view === 'detail' && matched > 1 ? 'ambiguous' : 'matched')
      || view === 'summary' && matched !== total
      || view !== 'summary' && (selection.nextCursor !== null) !== (offset + returned < matched)) return null;
  }

  const richDetail = view === 'detail' && matched === 1;
  const parsedRich = richDetail ? source.holdings.map(selectedRichHolding) : [];
  if (parsedRich.some((holding) => holding === null)) return null;
  const holdings = richDetail ? (parsedRich as PortfolioHolding[]).map(compactProjection) : source.holdings.map(compactHolding);
  const targets = source.targets.map(compactTarget);
  if (holdings.some((holding) => holding === null) || targets.some((target) => target === null)) return null;
  const selectedHoldings = holdings as CompactPortfolioHolding[];
  const selectedTargets = targets as CompactPortfolioTarget[];
  const identities = selectedHoldings.map((holding) => `${holding.mint}:${holding.tokenAccount ?? ''}`);
  if (new Set(identities).size !== identities.length
    || new Set(selectedTargets.map((target) => target.assetId)).size !== selectedTargets.length
    || new Set(selectedTargets.map((target) => `${target.tokenProgram}:${target.mint}`)).size !== selectedTargets.length
    || selectedHoldings.some((holding) => selection.mint !== null && holding.mint !== selection.mint
      || selection.tokenAccount !== null && holding.tokenAccount !== selection.tokenAccount)
    || selectedTargets.some((target) => selection.mint !== null && target.mint !== selection.mint)) return null;

  let richHoldings = parsedRich as PortfolioHolding[];
  if (cardValue !== undefined) {
    const card = record(cardValue);
    if (!card || !exactKeys(card, ['contractVersion', 'snapshotId', 'holdings', 'approvedActionTargets'])
      || card.contractVersion !== 'opendexter.portfolio-card.v2' || card.snapshotId !== source.snapshotId
      || !Array.isArray(card.holdings) || card.holdings.length !== selectedHoldings.length
      || !Array.isArray(card.approvedActionTargets) || card.approvedActionTargets.length !== selectedTargets.length) return null;
    const rich = card.holdings.map(selectedRichHolding);
    const approved = card.approvedActionTargets.map(parseApprovedTarget);
    if (rich.some((holding, index) => !holding || !sameCompactHolding(compactProjection(holding), selectedHoldings[index])
      || richDetail && JSON.stringify(holding) !== JSON.stringify(parsedRich[index]))
      || approved.some((target, index) => !target || ['assetId', 'mint', 'tokenProgram', 'symbol', 'name'].some(
        (key) => target[key as keyof ApprovedActionTarget] !== selectedTargets[index][key as keyof CompactPortfolioTarget],
      ) || JSON.stringify(target.actions) !== JSON.stringify(selectedTargets[index].actions))) return null;
    richHoldings = rich as PortfolioHolding[];
  }
  return {
    contractVersion: 'opendexter.portfolio.v2', network: 'solana-mainnet', walletAddress: source.walletAddress,
    observedAt: source.observedAt as string, contextSlot: source.contextSlot as number | null,
    snapshotId: source.snapshotId, expiresAt: source.expiresAt as string,
    sourceSummary: { ...summary, enrichment } as PortfolioSourceSummary,
    selection: selection as PortfolioSelection, holdings: selectedHoldings, targets: selectedTargets, richHoldings,
  };
}

export function portfolioReadRequest(read: SelectedPortfolioRead, view: PortfolioReadView | 'next', holding?: CompactPortfolioHolding): Record<string, unknown> {
  const common = { network: read.network, snapshotId: read.snapshotId };
  if (view === 'next') return { ...common, cursor: read.selection.nextCursor };
  if (view === 'detail' && holding) return { ...common, view, mint: holding.mint,
    ...(holding.tokenAccount === null ? {} : { tokenAccount: holding.tokenAccount }) };
  return { ...common, view };
}

export function samePortfolioObservation(left: SelectedPortfolioRead, right: SelectedPortfolioRead): boolean {
  return left.snapshotId === right.snapshotId && left.walletAddress === right.walletAddress
    && left.network === right.network && left.observedAt === right.observedAt && left.expiresAt === right.expiresAt
    && left.contextSlot === right.contextSlot
    && Object.keys(left.sourceSummary).every((key) => key === 'enrichment'
      ? ['metadata', 'pricing', 'tokenExtensions'].every((field) =>
        left.sourceSummary.enrichment[field as keyof PortfolioEnrichment] === right.sourceSummary.enrichment[field as keyof PortfolioEnrichment])
      : left.sourceSummary[key as keyof PortfolioSourceSummary] === right.sourceSummary[key as keyof PortfolioSourceSummary]);
}

export function portfolioReadMatchesRequest(previous: SelectedPortfolioRead, next: SelectedPortfolioRead, request: Record<string, unknown>): boolean {
  if (!samePortfolioObservation(previous, next)) return false;
  const selection = next.selection;
  if (request.cursor !== undefined) {
    return request.cursor === previous.selection.nextCursor
      && selection.offset === previous.selection.offset + previous.selection.returnedCount
      && ['view', 'query', 'mint', 'tokenAccount', 'limit', 'matchedCount'].every((key) =>
        selection[key as keyof PortfolioSelection] === previous.selection[key as keyof PortfolioSelection]);
  }
  return selection.view === request.view && selection.offset === 0
    && selection.query === (request.query ?? null) && selection.mint === (request.mint ?? null)
    && selection.tokenAccount === (request.tokenAccount ?? null);
}

function samePortfolioFacts(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => samePortfolioFacts(value, right[index]));
  }
  const leftRecord = record(left);
  const rightRecord = record(right);
  return leftRecord !== null && rightRecord !== null
    && Object.keys(leftRecord).length === Object.keys(rightRecord).length
    && Object.keys(leftRecord).every((key) => Object.hasOwn(rightRecord, key)
      && samePortfolioFacts(leftRecord[key], rightRecord[key]));
}

/** Collect normalized pages without changing the latest response or its counts. */
export function accumulatePortfolioRows(
  previous: PortfolioReadCollection | null,
  next: SelectedPortfolioRead,
): PortfolioReadCollection | null {
  if (previous) {
    if (!samePortfolioObservation(previous.read, next)) return null;
    const lastSelection = previous.read.selection;
    const selection = next.selection;
    const summaryToHoldings = lastSelection.view === 'summary' && selection.view === 'holdings'
      && selection.offset === 0 && selection.query === null && selection.mint === null
      && selection.tokenAccount === null && selection.matchedCount === lastSelection.matchedCount;
    const continuation = lastSelection.nextCursor !== null
      && selection.offset === lastSelection.offset + lastSelection.returnedCount
      && ['view', 'query', 'mint', 'tokenAccount', 'limit', 'matchedCount'].every((key) =>
        selection[key as keyof PortfolioSelection] === lastSelection[key as keyof PortfolioSelection]);
    if (!summaryToHoldings && !continuation) return null;
  }

  const identity = (holding: CompactPortfolioHolding) => `${holding.mint}:${holding.tokenAccount ?? ''}`;
  const holdings = previous ? [...previous.holdings] : [];
  const consumedHoldingIdentities = new Set(previous ? previous.consumedHoldingIdentities : []);
  const holdingIndexes = new Map(holdings.map((row, index) => [identity(row.holding), index]));
  const richByIdentity = new Map(next.richHoldings.map((holding) => [identity(holding), holding]));
  for (const holding of next.holdings) {
    const key = identity(holding);
    if (next.selection.view !== 'summary') {
      if (consumedHoldingIdentities.has(key)) return null;
      consumedHoldingIdentities.add(key);
    }
    const rich = richByIdentity.get(key) ?? null;
    const index = holdingIndexes.get(key);
    if (index === undefined) {
      holdingIndexes.set(key, holdings.length);
      holdings.push({ holding, rich });
    } else {
      const retained = holdings[index];
      if (!sameCompactHolding(retained.holding, holding)
        || retained.rich && rich && !samePortfolioFacts(retained.rich, rich)) return null;
      if (retained.rich === null && rich !== null) holdings[index] = { holding: retained.holding, rich };
    }
  }

  const targets = previous ? [...previous.targets] : [];
  const targetsByAsset = new Map(targets.map((target) => [target.assetId, target]));
  const targetsByMint = new Map(targets.map((target) => [target.mint, target]));
  for (const target of next.targets) {
    if (targetsByAsset.has(target.assetId) || targetsByMint.has(target.mint)) return null;
    targets.push(target);
    targetsByAsset.set(target.assetId, target);
    targetsByMint.set(target.mint, target);
  }
  return { read: next, holdings, targets, consumedHoldingIdentities: [...consumedHoldingIdentities] };
}

function safeMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 240
    ? value.trim()
    : null;
}

function unwrapOutput(value: unknown): unknown {
  const envelope = record(value);
  return envelope && record(envelope.structuredContent)
    ? envelope.structuredContent
    : value;
}

export function formatExactDecimal(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function formatExactUsd(value: string): string {
  return `$${formatExactDecimal(value)}`;
}

export function formatPriceChangePercent(value: string): string {
  return `${value === '0' || value.startsWith('-') ? '' : '+'}${formatExactDecimal(value)}%`;
}

/**
 * Human-facing USD display without converting the source decimal to Number.
 * Portfolio evidence remains exact in the model; the resting UI rounds money
 * to cents so a high-precision quote can never become a page-sized headline.
 */
export function formatDisplayUsd(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const cents = fraction.padEnd(2, '0').slice(0, 2);
  const roundDigit = fraction[2] ?? '0';
  let atomicCents = (BigInt(whole) * 100n) + BigInt(cents);
  if (roundDigit >= '5') atomicCents += 1n;

  const roundedWhole = (atomicCents / 100n).toString();
  const roundedCents = (atomicCents % 100n).toString().padStart(2, '0');
  return `$${formatExactDecimal(roundedWhole)}.${roundedCents}`;
}

function roundPortfolioDecimal(value: string, places: number): { rounded: bigint; changed: boolean } {
  const [whole, fraction = ''] = value.split('.');
  const digits = BigInt(whole + fraction);
  const removedPlaces = fraction.length - places;
  if (removedPlaces <= 0) return { rounded: digits * 10n ** BigInt(-removedPlaces), changed: false };
  const divisor = 10n ** BigInt(removedPlaces);
  const remainder = digits % divisor;
  return { rounded: digits / divisor + (remainder * 2n >= divisor ? 1n : 0n), changed: remainder !== 0n };
}

function portfolioDecimalDigits(value: bigint, places: number): string {
  if (places === 0) return value.toString();
  const digits = value.toString().padStart(places + 1, '0');
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '');
}

function portfolioScientific(value: string, significantDigits: number): { text: string; changed: boolean } {
  const [whole, fraction = ''] = value.split('.');
  let exponent = whole !== '0' ? whole.length - 1 : -fraction.search(/[1-9]/) - 1;
  let result = roundPortfolioDecimal(value, significantDigits - 1 - exponent);
  if (result.rounded >= 10n ** BigInt(significantDigits)) {
    exponent += 1;
    result = roundPortfolioDecimal(value, significantDigits - 1 - exponent);
  }
  return { text: `${portfolioDecimalDigits(result.rounded, significantDigits - 1)}e${exponent}`, changed: result.changed };
}

function portfolioAbbreviation(value: string): { text: string; changed: boolean } {
  const whole = value.split('.')[0];
  if (whole.length > 15) return portfolioScientific(value, 3);
  let exponent = Math.floor((whole.length - 1) / 3) * 3;
  let result = roundPortfolioDecimal(value, 2 - exponent);
  if (result.rounded >= 100_000n) {
    exponent += 3;
    if (exponent > 12) return portfolioScientific(value, 3);
    result = roundPortfolioDecimal(value, 2 - exponent);
  }
  const suffix = ({ 3: 'K', 6: 'M', 9: 'B', 12: 'T' } as Record<number, string>)[exponent];
  return { text: `${portfolioDecimalDigits(result.rounded, 2)}${suffix}`, changed: result.changed };
}

export function formatPortfolioMoney(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  if (whole === '0' && !/[1-9]/.test(fraction)) return '$0.00';
  if (whole === '0' && !/[1-9]/.test(fraction.slice(0, 2))) return '<$0.01';
  if (whole.length < 7) return formatDisplayUsd(value);
  const result = portfolioAbbreviation(value);
  return `${result.changed ? '~' : ''}$${result.text}`;
}

export function formatPortfolioQuantity(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  if (whole === '0' && !/[1-9]/.test(fraction)) return '0';
  if (whole.length > 3) {
    const result = portfolioAbbreviation(value);
    return `${result.changed ? '~' : ''}${result.text}`;
  }
  const firstDigit = fraction.search(/[1-9]/);
  if (whole === '0' && firstDigit >= 12) {
    const result = portfolioScientific(value, 6);
    return `${result.changed ? '~' : ''}${result.text}`;
  }
  const places = whole === '0' ? firstDigit + 6 : 6;
  const result = roundPortfolioDecimal(value, places);
  return `${result.changed ? '~' : ''}${portfolioDecimalDigits(result.rounded, places)}`;
}

export function formatPortfolioPrice(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  if (whole === '0' && !/[1-9]/.test(fraction)) return '$0.00';
  if (whole.length > 6) return formatPortfolioMoney(value);
  const firstDigit = fraction.search(/[1-9]/);
  if (whole === '0' && firstDigit >= 12) {
    const result = portfolioScientific(value, 4);
    return `${result.changed ? '~' : ''}$${result.text}`;
  }
  const places = whole === '0' ? Math.max(2, firstDigit + 4) : 6;
  const result = roundPortfolioDecimal(value, places);
  return `${result.changed ? '~' : ''}$${formatExactDecimal(portfolioDecimalDigits(result.rounded, places))}`;
}

export function summarizePortfolio(snapshot: Pick<PortfolioSnapshot, 'portfolioValueUsd' | 'pricedHoldings' | 'pricedValueUsd'>): PortfolioSummary {
  if (snapshot.portfolioValueUsd !== null) {
    return {
      label: 'Portfolio value',
      value: formatExactUsd(snapshot.portfolioValueUsd),
      exact: true,
    };
  }
  if (snapshot.pricedHoldings > 0) {
    return {
      label: 'Priced subtotal',
      value: formatExactUsd(snapshot.pricedValueUsd),
      exact: false,
    };
  }
  return {
    label: 'Portfolio value unavailable',
    value: null,
    exact: false,
  };
}

export function portfolioCoverage(snapshot: Pick<PortfolioSnapshot, 'omittedHoldings' | 'unpricedHoldings' | 'holdingsComplete' | 'portfolioValueUsd'>): string | null {
  const details: string[] = [];
  if (snapshot.omittedHoldings > 0) {
    details.push(`${snapshot.omittedHoldings} ${snapshot.omittedHoldings === 1 ? 'holding was' : 'holdings were'} omitted`);
  }
  if (snapshot.unpricedHoldings > 0) {
    details.push(`${snapshot.unpricedHoldings} ${snapshot.unpricedHoldings === 1 ? 'holding has' : 'holdings have'} no current price`);
  }
  if (snapshot.holdingsComplete && details.length === 0 && snapshot.portfolioValueUsd !== null) {
    return null;
  }

  const joinedDetails = details.length < 2
    ? details[0] ?? null
    : `${details.slice(0, -1).join(', ')}, and ${details[details.length - 1]}`;
  const readState = !snapshot.holdingsComplete
    ? joinedDetails
      ? `The holdings read is incomplete: ${joinedDetails}.`
      : 'The holdings read is incomplete.'
    : joinedDetails
      ? `${joinedDetails.slice(0, 1).toUpperCase()}${joinedDetails.slice(1)}.`
      : '';
  const valueState = snapshot.portfolioValueUsd === null
    ? 'The total value is unknown.'
    : '';
  return `${readState} ${valueState}`.trim() || null;
}

export function governedActionReason(reason: PortfolioAvailabilityReason | null): string {
  if (reason === 'protected_agent_send_sdk_required') return 'Sending is unavailable through this connection.';
  if (reason === 'governed_asset_action_not_supported') return 'This action is unavailable for the asset.';
  if (reason === 'governed_asset_rail_not_live') return 'This action is currently unavailable for this asset.';
  if (reason === "stock_approval_required") return "This agent needs approval to trade stocks.";
  if (reason === "stock_connection_unavailable") return "This agent's wallet connection could not be verified.";
  if (reason === "stock_authority_unavailable") return "Stock trading permission could not be checked.";
  if (reason === "stock_activation_unavailable") return "This stock is not enabled for trading.";
  if (reason === "stock_eligibility_required") return "Stock eligibility approval is required.";
  if (reason === "stock_eligibility_unavailable") return "Stock eligibility could not be checked.";
  if (reason === "stock_direction_not_permitted") return "This stock permission does not allow this action.";
  return 'Available';
}

export function holdingCapabilityReason(reason: HoldingCapabilityReason): string {
  if (reason === 'asset_not_approved') return 'Dexter has not approved this asset for the action.';
  if (reason === 'token_program_mismatch') return 'The token program does not match the approved asset.';
  if (reason === 'account_state_unverified') return 'The account state could not be verified.';
  if (reason === 'unknown') return 'The reason is unavailable.';
  return governedActionReason(reason);
}

export function normalizeDexterPortfolio(value: unknown, metadata?: unknown): PortfolioViewModel {
  if (value === null || value === undefined) return { state: 'loading' };
  const source = record(unwrapOutput(value));
  if (!source) {
    return {
      state: 'invalid',
      title: 'Portfolio data unavailable',
      body: 'OpenDexter did not return a portfolio that this view can verify.',
    };
  }

  if (
    source.mode === 'authentication_required'
    || source.status === 401
    || source.vault_status === 'authentication_required'
  ) {
    return {
      state: 'authentication_required',
      title: 'Connect OpenDexter',
      body: 'Authorize this session with your passkey, then ask for the portfolio again.',
    };
  }

  if (source.mode === 'portfolio_read_error' || source.portfolio_status === 'read_error') {
    const expired = source.readError === 'portfolio_snapshot_expired';
    return {
      state: 'read_error',
      title: expired ? 'Portfolio read expired' : 'Portfolio unavailable',
      expired,
      body: expired ? 'Request a fresh summary for a new observation.' : safeMessage(source.message)
        ?? 'Dexter could not complete the portfolio read. Retry the same request in a moment.',
    };
  }

  if (record(source.portfolio)?.contractVersion === 'opendexter.portfolio.v2') {
    const meta = record(metadata ?? record(value)?._meta);
    const read = parseSelectedRead(source.portfolio, meta?.portfolioCard);
    if (source.mode !== 'portfolio_ready' || source.portfolio_status !== 'ready' || source.user_bound !== true || !read
      || !exactKeys(source, ['portfolio_status', 'mode', 'user_bound', 'portfolio'])
      || new TextEncoder().encode(JSON.stringify(source)).length > (read.selection.view === 'summary' ? 2048 : read.selection.view === 'detail' ? 8192 : 6144)
      || meta?.portfolioCard !== undefined && new TextEncoder().encode(JSON.stringify(meta.portfolioCard)).length > 512 * 1024) {
      return { state: 'invalid', title: 'Portfolio data unavailable',
        body: 'OpenDexter did not return a portfolio that this view can verify.' };
    }
    return { state: 'selected', read, summary: summarizePortfolio(read.sourceSummary), coverage: portfolioCoverage(read.sourceSummary) };
  }

  const snapshot = parseSnapshot(source.portfolio);
  if (
    source.mode !== 'portfolio_ready'
    || source.portfolio_status !== 'ready'
    || source.user_bound !== true
    || !snapshot
  ) {
    return {
      state: 'invalid',
      title: 'Portfolio data unavailable',
      body: 'OpenDexter did not return a portfolio that this view can verify.',
    };
  }

  return {
    state: 'ready',
    snapshot,
    summary: summarizePortfolio(snapshot),
    isEmpty: snapshot.holdingsComplete && snapshot.holdings.length === 0,
    isPartial: !snapshot.holdingsComplete
      || snapshot.omittedHoldings > 0
      || snapshot.unpricedHoldings > 0,
    coverage: portfolioCoverage(snapshot),
  };
}
