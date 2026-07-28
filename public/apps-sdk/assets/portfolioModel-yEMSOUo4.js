const PORTFOLIO_ACTIONS = [
  "view",
  "receive",
  "send",
  "buy",
  "sell",
  "earn",
  "lend",
  "borrow",
  "pay"
];
const U64_MAX = 18446744073709551615n;
const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const SIGNED_DECIMAL = /^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58].map((character, index) => [character, BigInt(index)]));
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function isNullableString(value) {
  return value === null || isNonEmptyString(value);
}
function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function parseDecimal(value, signed = false) {
  if (!(signed ? SIGNED_DECIMAL : UNSIGNED_DECIMAL).test(value)) return null;
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = absolute.split(".");
  return {
    units: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
    negative
  };
}
function formatDecimalParts(parts) {
  const negative = parts.negative && parts.units !== 0n;
  let digits = parts.units.toString();
  if (parts.scale > 0) {
    digits = digits.padStart(parts.scale + 1, "0");
    const split = digits.length - parts.scale;
    const fraction = digits.slice(split).replace(/0+$/, "");
    digits = fraction ? `${digits.slice(0, split)}.${fraction}` : digits.slice(0, split);
  }
  digits = digits.replace(/^0+(?=[0-9])/, "") || "0";
  return negative ? `-${digits}` : digits;
}
function isCanonicalDecimal(value, signed = false) {
  if (typeof value !== "string") return false;
  const parts = parseDecimal(value, signed);
  return parts !== null && formatDecimalParts(parts) === value;
}
function addDecimals(left, right) {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) throw new Error("invalid_decimal");
  const scale = Math.max(a.scale, b.scale);
  return formatDecimalParts({
    negative: false,
    units: a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale),
    scale
  });
}
function multiplyDecimals(left, right) {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) throw new Error("invalid_decimal");
  return formatDecimalParts({
    negative: false,
    units: a.units * b.units,
    scale: a.scale + b.scale
  });
}
function decimalFromRaw(amountRaw, decimals) {
  return formatDecimalParts({
    negative: false,
    units: BigInt(amountRaw),
    scale: decimals
  });
}
function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function isWebUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function isSolanaPublicKey(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  let numeric = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === void 0) return false;
    numeric = numeric * 58n + digit;
  }
  let decodedLength = 0;
  while (numeric > 0n) {
    decodedLength += 1;
    numeric >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    decodedLength += 1;
  }
  return decodedLength === 32;
}
function parseNullableUrl(value) {
  if (value === null) return null;
  return isWebUrl(value) ? value : void 0;
}
function parseCapability(value) {
  if (!isRecord(value)) return null;
  if (!PORTFOLIO_ACTIONS.includes(value.action)) return null;
  if (typeof value.available !== "boolean") return null;
  if (value.available ? value.reason !== null : !isNonEmptyString(value.reason)) return null;
  return {
    action: value.action,
    available: value.available,
    reason: value.reason
  };
}
function parseHolding(value) {
  if (!isRecord(value)) return null;
  const tokenProgram = value.tokenProgram === "native" || value.tokenProgram === "spl-token" || value.tokenProgram === "token-2022" ? value.tokenProgram : null;
  const assetClass = value.assetClass === "cash" || value.assetClass === "yield" || value.assetClass === "token" || value.assetClass === "stock" || value.assetClass === "fund" || value.assetClass === "nft" || value.assetClass === "rwa" ? value.assetClass : null;
  const amountModel = value.amountModel === "raw-decimals" || value.amountModel === "scaled-ui-amount" || value.amountModel === "unknown" ? value.amountModel : null;
  const accountState = value.accountState === "initialized" || value.accountState === "frozen" || value.accountState === "unknown" ? value.accountState : null;
  if (!tokenProgram || !assetClass || !amountModel || !accountState || !isNonEmptyString(value.mint) || value.mint !== "native:SOL" && !isSolanaPublicKey(value.mint) || tokenProgram === "native" !== (value.mint === "native:SOL") || value.tokenAccount !== null && !isSolanaPublicKey(value.tokenAccount) || tokenProgram === "native" && value.tokenAccount !== null || tokenProgram !== "native" && value.tokenAccount === null || !isNonEmptyString(value.symbol) || !isNonEmptyString(value.name) || !isNullableString(value.issuer) || typeof value.amountRaw !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.amountRaw) || BigInt(value.amountRaw) > U64_MAX || !isNonNegativeInteger(value.decimals) || value.decimals > 255 || !isCanonicalDecimal(value.displayAmount) || value.displayMultiplier !== null && !isCanonicalDecimal(value.displayMultiplier) || !Array.isArray(value.tokenExtensions) || !value.tokenExtensions.every(isNonEmptyString) || value.valueUsd !== null && !isCanonicalDecimal(value.valueUsd) || !isRecord(value.approval) || !Array.isArray(value.capabilities) || !isRecord(value.graphics) || value.metadataObservedAt !== null && !isIsoDate(value.metadataObservedAt)) {
    return null;
  }
  if (amountModel === "scaled-ui-amount" && value.displayMultiplier === null || amountModel !== "scaled-ui-amount" && value.displayMultiplier !== null) {
    return null;
  }
  const expectedDisplay = amountModel === "scaled-ui-amount" ? multiplyDecimals(
    decimalFromRaw(value.amountRaw, value.decimals),
    value.displayMultiplier
  ) : decimalFromRaw(value.amountRaw, value.decimals);
  if (value.displayAmount !== expectedDisplay) return null;
  let price = null;
  if (value.price !== null) {
    if (!isRecord(value.price) || !isCanonicalDecimal(value.price.usd) || !isNonEmptyString(value.price.source) || !isIsoDate(value.price.observedAt) || value.price.blockId !== null && !isNonNegativeInteger(value.price.blockId) || value.price.change24hPercent !== null && !isCanonicalDecimal(value.price.change24hPercent, true)) {
      return null;
    }
    price = {
      usd: value.price.usd,
      source: value.price.source,
      observedAt: value.price.observedAt,
      blockId: value.price.blockId,
      change24hPercent: value.price.change24hPercent
    };
  }
  if (price === null !== (value.valueUsd === null)) return null;
  if (price && value.valueUsd !== multiplyDecimals(value.displayAmount, price.usd)) return null;
  const approvalStatus = value.approval.status === "approved" || value.approval.status === "unreviewed" || value.approval.status === "blocked" ? value.approval.status : null;
  const approvalSource = value.approval.source === "dexter-registry" || value.approval.source === "none" ? value.approval.source : null;
  if (!approvalStatus || !approvalSource || !isNullableString(value.approval.assetId) || !isNullableString(value.approval.group)) {
    return null;
  }
  const capabilities = value.capabilities.map(parseCapability);
  if (capabilities.some((capability) => capability === null)) return null;
  const capabilityActions = capabilities.map((capability) => capability.action);
  if (capabilityActions.length !== PORTFOLIO_ACTIONS.length || new Set(capabilityActions).size !== PORTFOLIO_ACTIONS.length || PORTFOLIO_ACTIONS.some((action) => !capabilityActions.includes(action))) {
    return null;
  }
  if (approvalStatus === "blocked" && capabilities.some((capability) => capability.available)) {
    return null;
  }
  const capabilityByAction = new Map(
    capabilities.map((capability) => [
      capability.action,
      capability
    ])
  );
  if (approvalStatus === "blocked") {
    if (value.valueUsd !== null || price !== null || approvalSource !== "dexter-registry" || !isNonEmptyString(value.approval.assetId) || !isNonEmptyString(value.approval.group) || PORTFOLIO_ACTIONS.some((action) => {
      const capability = capabilityByAction.get(action);
      return capability?.available !== false || !isNonEmptyString(capability.reason);
    })) {
      return null;
    }
  } else if (approvalStatus === "approved") {
    const viewCapability = capabilityByAction.get("view");
    if (approvalSource !== "dexter-registry" || !isNonEmptyString(value.approval.assetId) || !isNonEmptyString(value.approval.group) || viewCapability?.available !== true || viewCapability.reason !== null) {
      return null;
    }
  } else if (approvalSource !== "none" || value.approval.assetId !== null || value.approval.group !== null || PORTFOLIO_ACTIONS.some((action) => {
    const capability = capabilityByAction.get(action);
    const expectedAvailable = action === "view";
    return capability?.available !== expectedAvailable || capability.reason !== (expectedAvailable ? null : "asset_not_approved");
  })) {
    return null;
  }
  const canonicalImageUrl = parseNullableUrl(value.graphics.canonicalImageUrl);
  const dexScreenerImageUrl = parseNullableUrl(value.graphics.dexScreenerImageUrl);
  const dexScreenerHeaderUrl = parseNullableUrl(value.graphics.dexScreenerHeaderUrl);
  const openGraphImageUrl = parseNullableUrl(value.graphics.openGraphImageUrl);
  if (canonicalImageUrl === void 0 || dexScreenerImageUrl === void 0 || dexScreenerHeaderUrl === void 0 || openGraphImageUrl === void 0) {
    return null;
  }
  return {
    mint: value.mint,
    tokenAccount: value.tokenAccount,
    tokenProgram,
    assetClass,
    symbol: value.symbol,
    name: value.name,
    issuer: value.issuer,
    amountRaw: value.amountRaw,
    decimals: value.decimals,
    displayAmount: value.displayAmount,
    amountModel,
    displayMultiplier: value.displayMultiplier,
    tokenExtensions: [...value.tokenExtensions],
    accountState,
    valueUsd: value.valueUsd,
    price,
    approval: {
      status: approvalStatus,
      assetId: value.approval.assetId,
      group: value.approval.group,
      source: approvalSource
    },
    capabilities,
    graphics: {
      canonicalImageUrl,
      dexScreenerImageUrl,
      dexScreenerHeaderUrl,
      openGraphImageUrl
    },
    metadataObservedAt: value.metadataObservedAt
  };
}
function parseEnrichment(value) {
  if (!isRecord(value)) return null;
  const valid = (status) => status === "complete" || status === "partial" || status === "unavailable";
  if (!valid(value.metadata) || !valid(value.pricing) || !valid(value.tokenExtensions)) {
    return null;
  }
  return {
    metadata: value.metadata,
    pricing: value.pricing,
    tokenExtensions: value.tokenExtensions
  };
}
function parseSnapshot(value) {
  if (!isRecord(value)) return null;
  const enrichment = parseEnrichment(value.enrichment);
  if (value.schemaVersion !== 1 || value.network !== "solana-mainnet" || !isSolanaPublicKey(value.walletAddress) || value.vaultPda !== null && !isSolanaPublicKey(value.vaultPda) || !isIsoDate(value.observedAt) || value.contextSlot !== null && !isNonNegativeInteger(value.contextSlot) || typeof value.holdingsComplete !== "boolean" || value.nextCursor !== null && !isNonEmptyString(value.nextCursor) || !isNonNegativeInteger(value.omittedHoldings) || !isCanonicalDecimal(value.pricedValueUsd) || value.portfolioValueUsd !== null && !isCanonicalDecimal(value.portfolioValueUsd) || !isNonNegativeInteger(value.pricedHoldings) || !isNonNegativeInteger(value.unpricedHoldings) || !enrichment || !Array.isArray(value.holdings)) {
    return null;
  }
  const holdings = value.holdings.map(parseHolding);
  if (holdings.some((holding) => holding === null)) return null;
  const validHoldings = holdings;
  const holdingIdentities = validHoldings.map(
    (holding) => holding.tokenProgram === "native" ? `native:${holding.mint}` : `token-account:${holding.tokenAccount}`
  );
  if (new Set(holdingIdentities).size !== holdingIdentities.length) return null;
  const priced = validHoldings.filter((holding) => holding.valueUsd !== null);
  const unpriced = validHoldings.length - priced.length;
  if (value.pricedHoldings !== priced.length || value.unpricedHoldings !== unpriced) {
    return null;
  }
  const pricedValueUsd = priced.reduce(
    (sum, holding) => addDecimals(sum, holding.valueUsd),
    "0"
  );
  if (value.pricedValueUsd !== pricedValueUsd) return null;
  const expectedTotal = value.holdingsComplete && unpriced === 0 ? pricedValueUsd : null;
  if (value.portfolioValueUsd !== expectedTotal) return null;
  if (value.holdingsComplete && (value.nextCursor !== null || value.omittedHoldings !== 0)) {
    return null;
  }
  return {
    schemaVersion: 1,
    network: "solana-mainnet",
    walletAddress: value.walletAddress,
    vaultPda: value.vaultPda,
    observedAt: value.observedAt,
    contextSlot: value.contextSlot,
    holdingsComplete: value.holdingsComplete,
    nextCursor: value.nextCursor,
    omittedHoldings: value.omittedHoldings,
    pricedValueUsd,
    portfolioValueUsd: value.portfolioValueUsd,
    pricedHoldings: value.pricedHoldings,
    unpricedHoldings: value.unpricedHoldings,
    enrichment,
    holdings: validHoldings
  };
}
function normalizePortfolioRead(value, expectedWalletAddress) {
  if (value === void 0 || value === null) {
    return { status: "unavailable", snapshot: null, reason: "not_provided" };
  }
  const snapshot = parseSnapshot(value);
  if (!snapshot) {
    return { status: "unavailable", snapshot: null, reason: "invalid_snapshot" };
  }
  if (expectedWalletAddress && snapshot.walletAddress !== expectedWalletAddress) {
    return { status: "unavailable", snapshot: null, reason: "wallet_mismatch" };
  }
  const partial = !snapshot.holdingsComplete || snapshot.nextCursor !== null || snapshot.omittedHoldings > 0 || snapshot.unpricedHoldings > 0 || Object.values(snapshot.enrichment).some((status) => status !== "complete") || snapshot.holdings.some((holding) => holding.amountModel === "unknown");
  return {
    status: partial ? "partial" : "available",
    snapshot,
    reason: null
  };
}
function getPortfolioActionState(holding, action, options = {}) {
  const capability = holding.capabilities.find((entry) => entry.action === action);
  if (!capability) return { available: false, reason: "Capability unavailable" };
  if (!capability.available) {
    return { available: false, reason: capabilityReason(capability.reason) };
  }
  if (action === "view") return { available: true, reason: null };
  if (holding.accountState === "frozen") {
    return { available: false, reason: "This token account is frozen" };
  }
  if (holding.accountState === "unknown") {
    return { available: false, reason: "Account state could not be verified" };
  }
  if (action === "receive" && options.receiveHandlerAvailable) {
    return { available: true, reason: null };
  }
  if (action === "receive") {
    return { available: false, reason: "Receive is not available in this view" };
  }
  return {
    available: false,
    reason: capabilityReason(capability.reason) || "A prepared action is required"
  };
}
function groupPortfolioUnavailableActions(holding, actions, options = {}) {
  const grouped = /* @__PURE__ */ new Map();
  for (const action of actions) {
    const state = getPortfolioActionState(holding, action, options);
    if (state.available) continue;
    const reason = state.reason || "Unavailable";
    const existing = grouped.get(reason);
    if (existing) existing.push(action);
    else grouped.set(reason, [action]);
  }
  return [...grouped].map(([reason, groupedActions]) => ({
    reason,
    actions: groupedActions
  }));
}
function capabilityReason(reason) {
  switch (reason) {
    case "governed_asset_rail_not_live":
      return "Not available yet";
    case "asset_not_approved":
      return "Asset not reviewed";
    case "token_program_mismatch":
      return "Token program does not match";
    default:
      return reason ? reason.replaceAll("_", " ") : "";
  }
}
function roundDecimalString(value, fractionDigits) {
  const parsed = parseDecimal(value);
  if (!parsed) return value;
  if (parsed.scale <= fractionDigits) {
    return formatDecimalParts({
      ...parsed,
      scale: fractionDigits,
      units: parsed.units * 10n ** BigInt(fractionDigits - parsed.scale)
    });
  }
  const discarded = parsed.scale - fractionDigits;
  const divisor = 10n ** BigInt(discarded);
  const quotient = parsed.units / divisor;
  const remainder = parsed.units % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return formatDecimalParts({ negative: false, units: rounded, scale: fractionDigits });
}
function groupWholeDigits(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function formatPortfolioUsd(value) {
  const rounded = roundDecimalString(value, 2);
  const [whole, fraction = ""] = rounded.split(".");
  return `$${groupWholeDigits(whole)}.${fraction.padEnd(2, "0")}`;
}
function formatPortfolioAmount(value, maxFractionDigits = 8) {
  const [whole, fraction = ""] = value.split(".");
  if (!fraction) return groupWholeDigits(whole);
  if (fraction.length <= maxFractionDigits) {
    return `${groupWholeDigits(whole)}.${fraction}`;
  }
  return `${groupWholeDigits(whole)}.${fraction.slice(0, maxFractionDigits)}…`;
}
export {
  PORTFOLIO_ACTIONS as P,
  formatPortfolioUsd as a,
  groupPortfolioUnavailableActions as b,
  formatPortfolioAmount as f,
  getPortfolioActionState as g,
  normalizePortfolioRead as n
};
