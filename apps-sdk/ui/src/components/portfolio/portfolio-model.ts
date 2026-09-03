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
  | 'protected_agent_send_sdk_required';

export type PortfolioHolding = {
  assetId: string | null;
  mint: string;
  tokenAccount: string | null;
  tokenProgram: 'native' | 'spl-token' | 'token-2022';
  assetClass: 'cash' | 'yield' | 'token' | 'stock' | 'fund' | 'nft' | 'rwa';
  amountRaw: string;
  decimals: number;
  displayAmount: string;
  amountModel: 'raw-decimals' | 'scaled-ui-amount' | 'unknown';
  accountState: 'initialized' | 'frozen' | 'unknown';
  valueUsd: string | null;
  priceUsd: string | null;
  priceObservedAt: string | null;
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
  holdings: PortfolioHolding[];
  approvedActionTargets: ApprovedActionTarget[];
};

export type PortfolioSummary = {
  label: 'Portfolio value' | 'Priced subtotal' | 'Portfolio value unavailable';
  value: string | null;
  exact: boolean;
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
    }
  | {
      state: 'ready';
      snapshot: PortfolioSnapshot;
      summary: PortfolioSummary;
      isEmpty: boolean;
      isPartial: boolean;
      coverage: string | null;
    };

type UnknownRecord = Record<string, unknown>;

const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const ASSET_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_MAX = 18_446_744_073_709_551_615n;
const GOVERNED_ACTIONS: GovernedAction[] = ['buy', 'sell', 'send'];
const GOVERNED_UNAVAILABLE_REASONS = new Set<PortfolioAvailabilityReason>([
  'governed_asset_rail_not_live',
  'governed_asset_action_not_supported',
  'protected_agent_send_sdk_required',
]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
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

function decimal(value: unknown): string | null {
  return typeof value === 'string' && DECIMAL.test(value) ? value : null;
}

function nullableDecimal(value: unknown): string | null | undefined {
  if (value === null) return null;
  return decimal(value) ?? undefined;
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
  const displayAmount = decimal(source.displayAmount);
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
    || !displayAmount
    || !amountModel
    || !accountState
    || ((tokenProgram === 'native') !== (mint === 'native:SOL'))
    || (tokenProgram === 'native' && tokenAccount !== null)
    || (tokenProgram !== 'native' && tokenAccount === null)
    || valueUsd === undefined
    || priceUsd === undefined
    || priceObservedAt === undefined
    || !approvalStatus
    || !actions
    || !actions.every((action) => PORTFOLIO_ACTIONS.includes(action as PortfolioAction))
    || new Set(actions).size !== actions.length
    || (approvalStatus === 'approved' && assetId === null)
    || (approvalStatus !== 'approved' && assetId !== null)
    || (amountModel !== 'scaled-ui-amount' && displayAmount !== rawDecimal(amountRaw, decimals))
  ) {
    return null;
  }

  return {
    assetId,
    mint,
    tokenAccount,
    tokenProgram,
    assetClass,
    amountRaw,
    decimals,
    displayAmount,
    amountModel,
    accountState,
    valueUsd,
    priceUsd,
    priceObservedAt,
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
    holdings: parsedHoldings,
    approvedActionTargets: parsedTargets,
  };
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

export function summarizePortfolio(snapshot: PortfolioSnapshot): PortfolioSummary {
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

export function portfolioCoverage(snapshot: PortfolioSnapshot): string | null {
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
  if (reason === 'protected_agent_send_sdk_required') return 'Send requires the protected agent SDK.';
  if (reason === 'governed_asset_action_not_supported') return 'This action is unavailable for the asset.';
  if (reason === 'governed_asset_rail_not_live') return 'The governed asset rail is unavailable.';
  return 'Available';
}

export function normalizeDexterPortfolio(value: unknown): PortfolioViewModel {
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
    return {
      state: 'read_error',
      title: 'Portfolio unavailable',
      body: safeMessage(source.message)
        ?? 'Dexter could not complete the portfolio read. Retry the same request in a moment.',
    };
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
