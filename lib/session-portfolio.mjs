import { createHmac } from 'node:crypto';
import { fetchInternalApi, normalizeInternalApiOrigin } from './internal-api-fetch.mjs';
import { canonicalHash } from './governed-canonical-identity.mjs';

export const SESSION_PORTFOLIO_SIGNATURE_PURPOSE = 'mcp-portfolio-v1';
export const MAX_PORTFOLIO_HOLDINGS = 128;
export const MAX_APPROVED_ACTION_TARGETS = 128;
export const MAX_PORTFOLIO_BYTES = 256 * 1024;

const ACTIONS = [
  'view',
  'receive',
  'send',
  'buy',
  'sell',
  'earn',
  'lend',
  'borrow',
  'pay',
];
const TOKEN_PROGRAMS = new Set(['native', 'spl-token', 'token-2022']);
const ASSET_CLASSES = new Set(['cash', 'yield', 'token', 'stock', 'fund', 'nft', 'rwa']);
const AMOUNT_MODELS = new Set(['raw-decimals', 'scaled-ui-amount', 'unknown']);
const ACCOUNT_STATES = new Set(['initialized', 'frozen', 'unknown']);
const APPROVAL_STATES = new Set(['approved', 'unreviewed', 'blocked']);
const APPROVAL_SOURCES = new Set(['dexter-registry', 'none']);
const ENRICHMENT_STATES = new Set(['complete', 'partial', 'unavailable']);
const GOVERNED_ACTIONS = ['buy', 'sell', 'send'];
const UNAVAILABLE_GOVERNED_ACTION_REASONS = new Set([
  'governed_asset_rail_not_live',
  'governed_asset_action_not_supported',
  'protected_agent_send_sdk_required',
]);
const U64_MAX = 18_446_744_073_709_551_615n;
const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const SIGNED_DECIMAL = /^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const CANONICAL_ASSET_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58].map((character, index) => [character, BigInt(index)]));

const SNAPSHOT_KEYS = [
  'schemaVersion',
  'network',
  'walletAddress',
  'vaultPda',
  'observedAt',
  'contextSlot',
  'holdingsComplete',
  'nextCursor',
  'omittedHoldings',
  'pricedValueUsd',
  'portfolioValueUsd',
  'pricedHoldings',
  'unpricedHoldings',
  'enrichment',
  'holdings',
];
const SNAPSHOT_KEYS_WITH_APPROVED_ACTION_TARGETS = [
  ...SNAPSHOT_KEYS,
  'approvedActionTargets',
];
const APPROVED_ACTION_TARGET_KEYS = [
  'namespace',
  'assetId',
  'symbol',
  'name',
  'network',
  'mint',
  'tokenProgram',
  'decimals',
  'actions',
  'targetDigest',
];
const APPROVED_ACTION_AVAILABILITY_KEYS = [
  'namespace',
  'action',
  'assetId',
  'registryIdentityDigest',
  'runtimeReleaseDigest',
  'available',
  'reason',
  'receiptDigest',
];
const HOLDING_KEYS = [
  'mint',
  'tokenAccount',
  'tokenProgram',
  'assetClass',
  'symbol',
  'name',
  'issuer',
  'amountRaw',
  'decimals',
  'displayAmount',
  'amountModel',
  'displayMultiplier',
  'tokenExtensions',
  'accountState',
  'valueUsd',
  'price',
  'approval',
  'capabilities',
  'graphics',
  'metadataObservedAt',
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function boundedString(value, max, nullable = false) {
  return (
    (nullable && value === null) ||
    (typeof value === 'string' && value.length > 0 && value.length <= max)
  );
}

function boundedTrimmedUtf8String(value, maxBytes) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    Buffer.byteLength(value, 'utf8') <= maxBytes
  );
}

function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function canonicalDecimal(value, signed = false) {
  if (typeof value !== 'string' || value.length > 384) return false;
  const match = (signed ? SIGNED_DECIMAL : UNSIGNED_DECIMAL).exec(value);
  if (!match) return false;
  if (value === '-0') return false;
  if (value.includes('.') && value.endsWith('0')) return false;
  return true;
}

function decimalParts(value) {
  const negative = value.startsWith('-');
  const absolute = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = absolute.split('.');
  return {
    negative,
    units: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function formatDecimal({ negative, units, scale }) {
  let digits = units.toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    const split = digits.length - scale;
    const fraction = digits.slice(split).replace(/0+$/, '');
    digits = fraction ? `${digits.slice(0, split)}.${fraction}` : digits.slice(0, split);
  }
  digits = digits.replace(/^0+(?=[0-9])/, '') || '0';
  return negative && units !== 0n ? `-${digits}` : digits;
}

function addDecimals(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  return formatDecimal({
    negative: false,
    units:
      a.units * 10n ** BigInt(scale - a.scale) +
      b.units * 10n ** BigInt(scale - b.scale),
    scale,
  });
}

function multiplyDecimals(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  return formatDecimal({
    negative: false,
    units: a.units * b.units,
    scale: a.scale + b.scale,
  });
}

function decimalFromRaw(amountRaw, decimals) {
  return formatDecimal({
    negative: false,
    units: BigInt(amountRaw),
    scale: decimals,
  });
}

function isoDate(value) {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function solanaPublicKey(value) {
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

function webUrl(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function validPrice(value, displayAmount, valueUsd) {
  if (value === null) return valueUsd === null;
  if (
    !hasExactKeys(value, ['usd', 'source', 'observedAt', 'blockId', 'change24hPercent']) ||
    !canonicalDecimal(value.usd) ||
    !boundedString(value.source, 64) ||
    !isoDate(value.observedAt) ||
    (value.blockId !== null && !nonNegativeInteger(value.blockId)) ||
    (value.change24hPercent !== null && !canonicalDecimal(value.change24hPercent, true)) ||
    valueUsd === null
  ) {
    return false;
  }
  return multiplyDecimals(displayAmount, value.usd) === valueUsd;
}

function validApproval(value) {
  if (!(
    hasExactKeys(value, ['status', 'assetId', 'group', 'source']) &&
    APPROVAL_STATES.has(value.status) &&
    boundedString(value.assetId, 128, true) &&
    boundedString(value.group, 128, true) &&
    APPROVAL_SOURCES.has(value.source)
  )) {
    return false;
  }
  if (value.status === 'unreviewed') {
    return value.assetId === null
      && value.group === null
      && value.source === 'none';
  }
  return value.source === 'dexter-registry'
    && typeof value.assetId === 'string'
    && CANONICAL_ASSET_ID.test(value.assetId)
    && typeof value.group === 'string';
}

function validCapabilities(value) {
  if (!Array.isArray(value) || value.length !== ACTIONS.length) return false;
  const seen = new Set();
  for (const capability of value) {
    if (
      !hasExactKeys(capability, ['action', 'available', 'reason']) ||
      !ACTIONS.includes(capability.action) ||
      typeof capability.available !== 'boolean' ||
      !boundedString(capability.reason, 128, true) ||
      (capability.available && capability.reason !== null) ||
      (!capability.available && capability.reason === null)
    ) {
      return false;
    }
    seen.add(capability.action);
  }
  return seen.size === ACTIONS.length;
}

function validBlockedHoldingPolicy(value) {
  if (value.approval.status !== 'blocked') return true;
  return (
    value.valueUsd === null &&
    value.price === null &&
    value.approval.source === 'dexter-registry' &&
    boundedString(value.approval.assetId, 128) &&
    boundedString(value.approval.group, 128) &&
    value.capabilities.every((capability) => !capability.available)
  );
}

function validGraphics(value) {
  return (
    hasExactKeys(value, [
      'canonicalImageUrl',
      'dexScreenerImageUrl',
      'dexScreenerHeaderUrl',
      'openGraphImageUrl',
    ]) &&
    webUrl(value.canonicalImageUrl) &&
    webUrl(value.dexScreenerImageUrl) &&
    webUrl(value.dexScreenerHeaderUrl) &&
    webUrl(value.openGraphImageUrl)
  );
}

function validHolding(value) {
  if (!hasExactKeys(value, HOLDING_KEYS)) return false;
  if (
    !TOKEN_PROGRAMS.has(value.tokenProgram) ||
    !ASSET_CLASSES.has(value.assetClass) ||
    !AMOUNT_MODELS.has(value.amountModel) ||
    !ACCOUNT_STATES.has(value.accountState) ||
    !(value.mint === 'native:SOL' || solanaPublicKey(value.mint)) ||
    ((value.tokenProgram === 'native') !== (value.mint === 'native:SOL')) ||
    !(value.tokenAccount === null || solanaPublicKey(value.tokenAccount)) ||
    (value.tokenProgram === 'native' && value.tokenAccount !== null) ||
    (value.tokenProgram !== 'native' && value.tokenAccount === null) ||
    !boundedString(value.symbol, 32) ||
    !boundedString(value.name, 128) ||
    !boundedString(value.issuer, 128, true) ||
    typeof value.amountRaw !== 'string' ||
    value.amountRaw.length > 20 ||
    !/^(0|[1-9][0-9]*)$/.test(value.amountRaw) ||
    BigInt(value.amountRaw) > U64_MAX ||
    !nonNegativeInteger(value.decimals) ||
    value.decimals > 255 ||
    !canonicalDecimal(value.displayAmount) ||
    (value.displayMultiplier !== null && !canonicalDecimal(value.displayMultiplier)) ||
    !Array.isArray(value.tokenExtensions) ||
    value.tokenExtensions.length > 32 ||
    !value.tokenExtensions.every((extension) => boundedString(extension, 64)) ||
    (value.valueUsd !== null && !canonicalDecimal(value.valueUsd)) ||
    !validApproval(value.approval) ||
    !validCapabilities(value.capabilities) ||
    !validBlockedHoldingPolicy(value) ||
    !validGraphics(value.graphics) ||
    (value.metadataObservedAt !== null && !isoDate(value.metadataObservedAt))
  ) {
    return false;
  }

  if (
    (value.amountModel === 'scaled-ui-amount' && value.displayMultiplier === null) ||
    (value.amountModel !== 'scaled-ui-amount' && value.displayMultiplier !== null)
  ) {
    return false;
  }
  const expectedDisplay =
    value.amountModel === 'scaled-ui-amount'
      ? multiplyDecimals(
          decimalFromRaw(value.amountRaw, value.decimals),
          value.displayMultiplier,
        )
      : decimalFromRaw(value.amountRaw, value.decimals);
  return (
    value.displayAmount === expectedDisplay &&
    validPrice(value.price, value.displayAmount, value.valueUsd)
  );
}

function validApprovedActionAvailability(value, assetId, expectedAction) {
  return (
    hasExactKeys(value, APPROVED_ACTION_AVAILABILITY_KEYS) &&
    value.namespace === 'dexter-governed-asset-action-availability/v1' &&
    value.action === expectedAction &&
    value.assetId === assetId &&
    SHA256_HEX.test(value.registryIdentityDigest) &&
    SHA256_HEX.test(value.runtimeReleaseDigest) &&
    typeof value.available === 'boolean' &&
    (
      value.available
        ? value.reason === null
        : UNAVAILABLE_GOVERNED_ACTION_REASONS.has(value.reason)
    ) &&
    SHA256_HEX.test(value.receiptDigest)
  );
}

function validApprovedActionTarget(value) {
  if (
    !hasExactKeys(value, APPROVED_ACTION_TARGET_KEYS) ||
    value.namespace !== 'dexter-approved-action-target/v1' ||
    typeof value.assetId !== 'string' ||
    !CANONICAL_ASSET_ID.test(value.assetId) ||
    !boundedTrimmedUtf8String(value.symbol, 32) ||
    !boundedTrimmedUtf8String(value.name, 128) ||
    value.network !== 'solana-mainnet' ||
    !solanaPublicKey(value.mint) ||
    !['spl-token', 'token-2022'].includes(value.tokenProgram) ||
    !nonNegativeInteger(value.decimals) ||
    value.decimals > 18 ||
    !Array.isArray(value.actions) ||
    value.actions.length !== GOVERNED_ACTIONS.length ||
    !value.actions.every((action, index) =>
      validApprovedActionAvailability(
        action,
        value.assetId,
        GOVERNED_ACTIONS[index],
      )) ||
    !SHA256_HEX.test(value.targetDigest)
  ) {
    return false;
  }

  const { targetDigest, ...targetIdentity } = value;
  return canonicalHash(targetIdentity) === targetDigest;
}

export function approvedActionTargetsAreValid(value) {
  if (
    !Array.isArray(value) ||
    value.length > MAX_APPROVED_ACTION_TARGETS ||
    !value.every(validApprovedActionTarget)
  ) {
    return false;
  }

  const assetIds = value.map(({ assetId }) => assetId);
  const registryIdentities = value.map(({ network, tokenProgram, mint }) =>
    `${network}:${tokenProgram}:${mint}`);
  return (
    new Set(assetIds).size === assetIds.length &&
    new Set(registryIdentities).size === registryIdentities.length &&
    assetIds.every((assetId, index) =>
      index === 0 || assetIds[index - 1] < assetId)
  );
}

export function validateAndBoundPortfolioSnapshotV1(value) {
  try {
    if (
      !(
        hasExactKeys(value, SNAPSHOT_KEYS) ||
        hasExactKeys(value, SNAPSHOT_KEYS_WITH_APPROVED_ACTION_TARGETS)
      ) ||
      value.schemaVersion !== 1 ||
      value.network !== 'solana-mainnet' ||
      !solanaPublicKey(value.walletAddress) ||
      !(value.vaultPda === null || solanaPublicKey(value.vaultPda)) ||
      !isoDate(value.observedAt) ||
      !(value.contextSlot === null || nonNegativeInteger(value.contextSlot)) ||
      typeof value.holdingsComplete !== 'boolean' ||
      !boundedString(value.nextCursor, 256, true) ||
      !nonNegativeInteger(value.omittedHoldings) ||
      !canonicalDecimal(value.pricedValueUsd) ||
      !(value.portfolioValueUsd === null || canonicalDecimal(value.portfolioValueUsd)) ||
      !nonNegativeInteger(value.pricedHoldings) ||
      !nonNegativeInteger(value.unpricedHoldings) ||
      !hasExactKeys(value.enrichment, ['metadata', 'pricing', 'tokenExtensions']) ||
      !ENRICHMENT_STATES.has(value.enrichment.metadata) ||
      !ENRICHMENT_STATES.has(value.enrichment.pricing) ||
      !ENRICHMENT_STATES.has(value.enrichment.tokenExtensions) ||
      !Array.isArray(value.holdings) ||
      value.holdings.length > MAX_PORTFOLIO_HOLDINGS ||
      !value.holdings.every(validHolding) ||
      (
        Object.hasOwn(value, 'approvedActionTargets') &&
        !approvedActionTargetsAreValid(value.approvedActionTargets)
      )
    ) {
      return null;
    }

    const identities = value.holdings.map((holding) =>
      holding.tokenProgram === 'native'
        ? `native:${holding.mint}`
        : `token-account:${holding.tokenAccount}`,
    );
    if (new Set(identities).size !== identities.length) return null;

    const priced = value.holdings.filter((holding) => holding.valueUsd !== null);
    const unpriced = value.holdings.length - priced.length;
    if (
      value.pricedHoldings !== priced.length ||
      value.unpricedHoldings !== unpriced
    ) {
      return null;
    }
    const pricedValueUsd = priced.reduce(
      (sum, holding) => addDecimals(sum, holding.valueUsd),
      '0',
    );
    if (value.pricedValueUsd !== pricedValueUsd) return null;
    const expectedTotal = value.holdingsComplete && unpriced === 0
      ? pricedValueUsd
      : null;
    if (value.portfolioValueUsd !== expectedTotal) return null;
    if (
      value.holdingsComplete &&
      (value.nextCursor !== null || value.omittedHoldings !== 0)
    ) {
      return null;
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PORTFOLIO_BYTES) return null;
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

export function numericPortfolioSummary(portfolio) {
  if (!portfolio) return null;
  return {
    holdings: portfolio.holdings.length,
    pricedHoldings: portfolio.pricedHoldings,
    unpricedHoldings: portfolio.unpricedHoldings,
    holdingsComplete: portfolio.holdingsComplete,
    pricedValueUsd: portfolio.pricedValueUsd,
    portfolioValueUsd: portfolio.portfolioValueUsd,
  };
}

/**
 * Project a verified PortfolioSnapshotV1 into the bounded, model-visible
 * contract used by dexter_wallet_portfolio.
 *
 * Holding names, symbols, issuers, URLs, registry groups, token-extension
 * strings, price-source labels, and capability reasons are deliberately
 * excluded. Approved target names and symbols are retained only as bounded
 * server-registry display data alongside the exact target identity and
 * availability receipts. The canonical assetId is the non-display identity
 * accepted by governed action tools; Prepare remains the authority decision.
 */
export function modelSafePortfolioSnapshot(portfolio) {
  if (!portfolio) return null;
  return {
    contractVersion: 'opendexter.portfolio.v1',
    network: portfolio.network,
    walletAddress: portfolio.walletAddress,
    observedAt: portfolio.observedAt,
    contextSlot: portfolio.contextSlot,
    holdingsComplete: portfolio.holdingsComplete,
    omittedHoldings: portfolio.omittedHoldings,
    pricedValueUsd: portfolio.pricedValueUsd,
    portfolioValueUsd: portfolio.portfolioValueUsd,
    pricedHoldings: portfolio.pricedHoldings,
    unpricedHoldings: portfolio.unpricedHoldings,
    holdings: portfolio.holdings.map((holding) => ({
      assetId: holding.approval.status === 'approved'
        ? holding.approval.assetId
        : null,
      mint: holding.mint,
      tokenAccount: holding.tokenAccount,
      tokenProgram: holding.tokenProgram,
      assetClass: holding.assetClass,
      amountRaw: holding.amountRaw,
      decimals: holding.decimals,
      displayAmount: holding.displayAmount,
      amountModel: holding.amountModel,
      accountState: holding.accountState,
      valueUsd: holding.valueUsd,
      priceUsd: holding.price?.usd ?? null,
      priceObservedAt: holding.price?.observedAt ?? null,
      approvalStatus: holding.approval.status,
      availableActions: holding.capabilities
        .filter((capability) => capability.available)
        .map((capability) => capability.action),
    })),
    ...(Object.hasOwn(portfolio, 'approvedActionTargets')
      ? {
          approvedActionTargets: portfolio.approvedActionTargets.map((target) => ({
            namespace: target.namespace,
            assetId: target.assetId,
            symbol: target.symbol,
            name: target.name,
            network: target.network,
            mint: target.mint,
            tokenProgram: target.tokenProgram,
            decimals: target.decimals,
            actions: target.actions.map((action) => ({
              namespace: action.namespace,
              action: action.action,
              assetId: action.assetId,
              registryIdentityDigest: action.registryIdentityDigest,
              runtimeReleaseDigest: action.runtimeReleaseDigest,
              available: action.available,
              reason: action.reason,
              receiptDigest: action.receiptDigest,
            })),
            targetDigest: target.targetDigest,
          })),
        }
      : {}),
  };
}

export function signedSessionPortfolioHeaders(sessionId, secret, now = Date.now()) {
  if (!secret) return {};
  const timestamp = String(now);
  const signature = createHmac('sha256', secret)
    .update(
      `${timestamp}.${sessionId}.${SESSION_PORTFOLIO_SIGNATURE_PURPOSE}`,
    )
    .digest('hex');
  return {
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signature,
  };
}

async function readBoundedResponseText(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return Buffer.byteLength(text, 'utf8') <= MAX_PORTFOLIO_BYTES
      ? text
      : null;
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) return null;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_PORTFOLIO_BYTES) {
        await reader.cancel('portfolio_response_too_large');
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

export async function fetchSessionPortfolio({
  apiBase,
  sessionId,
  expectedWalletAddress,
  secret,
  fetchImpl = fetch,
  timeoutMs = 2_500,
}) {
  if (!sessionId || !expectedWalletAddress || !secret) return null;

  try {
    const response = await fetchInternalApi(
      `/api/passkey-anon/mcp-portfolio/${encodeURIComponent(sessionId)}`,
      {
        headers: signedSessionPortfolioHeaders(sessionId, secret),
        signal: AbortSignal.timeout(timeoutMs),
      },
      {
        origin: normalizeInternalApiOrigin(apiBase),
        fetchImpl,
      },
    );
    if (!response.ok) return null;

    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_PORTFOLIO_BYTES
    ) {
      return null;
    }
    const text = await readBoundedResponseText(response);
    if (text === null) return null;
    const body = JSON.parse(text);
    const portfolio = validateAndBoundPortfolioSnapshotV1(body?.portfolio);
    if (
      !portfolio ||
      portfolio.walletAddress !== expectedWalletAddress
    ) {
      return null;
    }
    return portfolio;
  } catch {
    return null;
  }
}
