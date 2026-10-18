import { u as useToolOutput, a as useToolResponseMetadata, b as useAdaptiveTheme, c as useAdaptiveMaxHeight, d as useAdaptiveDisplayMode, e as useAdaptiveHostContext, f as useAdaptiveHostCapabilities, g as useAdaptiveRequestDisplayMode, r as reactExports, j as jsxRuntimeExports, h as useAdaptiveCallToolFn } from "./adapter--q2j4xTS.js";
/* empty css             */
import { c as clientExports } from "./client-DNLwMlQg.js";
import { L as Lockup } from "./Lockup-BfrKFTvI.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-Dv3mveW-.js";
import { n as number, s as string, d as dateTime, u as union, l as literal, _ as _enum, o as object, a as array, b as boolean, c as uuidString } from "./zod-contract-primitives-BL_kr6tN.js";
import { Z as ZodIssueCode, s as sha256 } from "./sha256-c6WszRQG.js";
const bytes$1 = (value) => Buffer.byteLength(value, "utf8");
const count$1 = number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const decimal$2 = string().max(384).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const signedDecimal$1 = string().max(384).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).refine((v) => v !== "-0");
dateTime({ offset: false }).max(40).refine((v) => Number.isFinite(Date.parse(v)));
const opaque$2 = (max) => string().min(1).max(max).regex(/^[\x21-\x7e]+$/);
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function isPortfolioPublicKey(value) {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let number2 = 0n;
  for (const char of value) number2 = number2 * 58n + BigInt(alphabet.indexOf(char));
  let length = 0;
  while (number2 > 0n) {
    length++;
    number2 >>= 8n;
  }
  return length + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
const address$1 = string().refine(isPortfolioPublicKey, "Expected a canonical Solana address");
const mint$1 = union([literal("native:SOL"), address$1]);
const query = string().min(1).refine((v) => v === v.trim() && bytes$1(v) <= 128, "Use a trimmed search of at most 128 UTF-8 bytes");
const view = _enum(["summary", "holdings", "detail", "targets"]);
const identity = string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._:-]*$/);
const label = (max) => string().min(1).max(max).refine((v) => v.trim().length > 0);
const reason = _enum([
  "governed_asset_rail_not_live",
  "governed_asset_action_not_supported",
  "protected_agent_send_sdk_required",
  "stock_approval_required",
  "stock_connection_unavailable",
  "stock_authority_unavailable",
  "stock_activation_unavailable",
  "stock_eligibility_required",
  "stock_eligibility_unavailable",
  "stock_direction_not_permitted"
]);
const PORTFOLIO_READ_INPUT_SHAPE = Object.freeze({
  readVersion: union([literal(2), literal(3)]).optional(),
  view: view.optional(),
  network: literal("solana-mainnet").optional(),
  query: query.optional(),
  mint: mint$1.optional(),
  tokenAccount: address$1.optional(),
  snapshotId: opaque$2(128).optional(),
  holdingSnapshotId: opaque$2(128).optional(),
  cursor: opaque$2(1024).optional(),
  limit: number().int().min(1).max(32).optional()
});
object(PORTFOLIO_READ_INPUT_SHAPE).strict().superRefine((input, ctx) => {
  const fail = (message) => ctx.addIssue({ code: ZodIssueCode.custom, message });
  const effectiveView = input.view ?? (input.cursor ? null : "summary");
  if (input.query !== void 0 && input.mint !== void 0) fail("Choose query or mint");
  if (input.tokenAccount !== void 0 && (effectiveView !== "detail" && effectiveView !== null || !input.mint || input.mint === "native:SOL")) fail("Token account requires a token-mint detail request");
  if (effectiveView === "detail" && !input.cursor && !input.query && !input.mint) fail("Detail requires a query or mint");
  if (effectiveView === "summary" && ["query", "mint", "tokenAccount", "limit", "cursor"].some((k) => input[k] !== void 0)) fail("Summary has no filter, cursor or page limit");
  if (effectiveView === "targets" && input.tokenAccount !== void 0) fail("Targets do not select token accounts");
  if (input.holdingSnapshotId !== void 0 && (input.readVersion !== 3 || input.view !== "targets" || input.snapshotId !== void 0 || input.cursor !== void 0)) fail("Holding parent requires a fresh version 3 targets read");
});
object({
  assetId: identity.nullable(),
  mint: mint$1,
  tokenAccount: address$1.nullable(),
  symbol: label(32).nullable(),
  name: label(128).nullable(),
  displayAmount: decimal$2,
  amountModel: _enum(["raw-decimals", "scaled-ui-amount", "unknown"]),
  valueUsd: decimal$2.nullable(),
  change24hPercent: signedDecimal$1.nullable()
}).strict().refine((h) => h.mint === "native:SOL" === (h.tokenAccount === null), "Native and token account identities must agree");
const compactAction = object({ action: _enum(["buy", "sell", "send"]), available: boolean(), reason: reason.nullable() }).strict().refine((v) => v.available === (v.reason === null));
object({
  assetId: identity,
  mint: address$1,
  tokenProgram: _enum(["spl-token", "token-2022"]),
  symbol: label(32),
  name: label(128),
  actions: array(compactAction).length(3)
}).strict().refine((t) => t.actions.every((a, i) => a.action === ["buy", "sell", "send"][i]));
object({
  view,
  query: query.nullable(),
  mint: mint$1.nullable(),
  tokenAccount: address$1.nullable(),
  limit: number().int().min(1).max(32),
  offset: count$1,
  matchedCount: count$1.nullable(),
  returnedCount: count$1,
  omittedCount: count$1.nullable(),
  nextCursor: opaque$2(1024).nullable(),
  match: _enum(["matched", "none", "ambiguous", "unavailable"])
}).strict();
object({
  holdingCount: count$1,
  pricedHoldings: count$1,
  unpricedHoldings: count$1,
  holdingsComplete: boolean(),
  omittedHoldings: count$1,
  pricedValueUsd: decimal$2,
  portfolioValueUsd: decimal$2.nullable(),
  enrichment: object({
    metadata: _enum(["complete", "partial", "unavailable"]),
    pricing: _enum(["complete", "partial", "unavailable"]),
    tokenExtensions: _enum(["complete", "partial", "unavailable"])
  }).strict(),
  targetCount: count$1.nullable()
}).strict();
const bytes = (value) => new TextEncoder().encode(value).length;
const count = number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const decimal$1 = string().max(384).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const signedDecimal = string().max(384).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).refine((v) => v !== "-0");
const observed = dateTime().max(40).refine((v) => Number.isFinite(Date.parse(v)));
function isPortfolioObservedAtV3(value) {
  return observed.safeParse(value).success;
}
const opaque$1 = (max) => string().min(1).max(max).regex(/^[\x21-\x7e]+$/);
const address = string().refine(isPortfolioPublicKey);
const mint = union([literal("native:SOL"), address]);
const assetId = string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/);
const assetClass = _enum(["cash", "yield", "token", "stock", "fund", "nft", "rwa"]);
string().min(1).refine((v) => v === v.trim() && bytes(v) <= 128);
_enum(["summary", "holdings", "detail", "targets"]);
const hex = string().regex(/^[0-9a-f]{64}$/);
const uuid = uuidString().refine((v) => v === v.toLowerCase());
const U64_MAX$1 = 18446744073709551615n;
function canonicalPortfolioRegistryJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("invalid registry identity number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPortfolioRegistryJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new TypeError("invalid registry identity value");
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalPortfolioRegistryJson(item)}`).join(",")}}`;
}
function registryHash(value) {
  return Array.from(
    sha256(new TextEncoder().encode(canonicalPortfolioRegistryJson(value))),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}
function canonicalText(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && value.normalize("NFKC") === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function registryMaterialMatches(value) {
  if (!/^(?:[a-z0-9][a-z0-9._:-]{0,127}|solana-token:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value.assetId) || !canonicalText(value.symbol, 64) || !canonicalText(value.name, 256) || value.issuer !== null && !canonicalText(value.issuer, 256)) return false;
  const fields = {
    namespace: value.namespace,
    network: value.network,
    assetId: value.assetId,
    assetClass: value.assetClass,
    symbol: value.symbol,
    name: value.name,
    issuer: value.issuer,
    mint: value.mint,
    tokenProgram: value.tokenProgram,
    decimals: value.decimals
  };
  if (value.assetClass === "stock") {
    if (!canonicalText(value.providerName, 256) || !canonicalText(value.legalIssuerName, 256) || value.issuer !== value.legalIssuerName) return false;
    fields.providerName = value.providerName;
    fields.legalIssuerName = value.legalIssuerName;
  } else if (Object.hasOwn(value, "providerName") || Object.hasOwn(value, "legalIssuerName")) return false;
  return value.registryIdentityDigest === registryHash(fields);
}
const portfolioRegistryMaterialV3Schema = object({
  namespace: literal("dexter-governed-asset-registry-identity/v1"),
  network: literal("solana-mainnet"),
  assetId: string(),
  assetClass,
  symbol: string(),
  name: string(),
  issuer: string().nullable(),
  providerName: string().nullable().optional(),
  legalIssuerName: string().nullable().optional(),
  mint: address,
  tokenProgram: _enum(["spl-token", "token-2022"]),
  decimals: number().int().min(0).max(18),
  registryIdentityDigest: hex
}).strict().refine(registryMaterialMatches, "Registry identity mismatch");
const portfolioReleasedIdentityProvenanceV3Schema = object({
  variantId: uuid,
  variantDigest: hex,
  profileId: uuid,
  profileDigest: hex,
  releaseId: uuid,
  releaseDigest: hex,
  productId: uuid,
  productDigest: hex,
  issuerId: uuid,
  issuerDigest: hex,
  onchainId: uuid,
  onchainDigest: hex
}).strict();
const portfolioHoldingIdentityV3Schema = union([
  object({ state: literal("native"), source: literal("solana") }).strict(),
  object({
    state: literal("recognized"),
    source: literal("static_registry"),
    registryState: literal("not_observed"),
    material: portfolioRegistryMaterialV3Schema
  }).strict().refine((v) => v.material.assetClass !== "stock"),
  object({
    state: literal("recognized"),
    source: literal("released_catalog"),
    registryState: _enum(["approved", "retired"]),
    observedAt: observed,
    material: portfolioRegistryMaterialV3Schema,
    provenance: portfolioReleasedIdentityProvenanceV3Schema
  }).strict().refine((v) => v.material.assetClass === "stock"),
  object({ state: literal("unreviewed"), source: literal("none") }).strict(),
  object({ state: literal("unavailable"), source: literal("none"), reason: _enum([
    "source_unavailable",
    "read_inconsistent",
    "token_identity_mismatch",
    "release_missing",
    "lineage_invalid",
    "conflicting_material",
    "registry_digest_mismatch"
  ]) }).strict()
]);
const portfolioIdentityStatusV3Schema = _enum(["native", "recognized", "retired", "unreviewed", "unavailable"]);
const compactPortfolioHoldingV3Schema = object({
  assetId: assetId.nullable(),
  mint,
  tokenAccount: address.nullable(),
  symbol: string().min(1).max(32).nullable(),
  name: string().min(1).max(128).nullable(),
  displayAmount: decimal$1,
  amountModel: _enum(["raw-decimals", "scaled-ui-amount", "unknown"]),
  valueUsd: decimal$1.nullable(),
  change24hPercent: signedDecimal.nullable(),
  identityStatus: portfolioIdentityStatusV3Schema
}).strict().refine((v) => ["native", "recognized", "retired"].includes(v.identityStatus) ? v.assetId !== null : v.assetId === null);
const equal = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
function decimalParts(value) {
  if (!decimal$1.safeParse(value).success) throw new TypeError("invalid holding decimal");
  const [whole, fraction = ""] = value.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
function formatDecimal(units, scale) {
  const digits = units.toString().padStart(scale + 1, "0");
  if (scale === 0) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : "");
}
function multiplyDecimals$1(a, b) {
  const left = decimalParts(a), right = decimalParts(b);
  return formatDecimal(left.units * right.units, left.scale + right.scale);
}
function portfolioHoldingV3IsValid(value) {
  try {
    if (!portfolioHoldingIdentityV3Schema.safeParse(value.identity).success) return false;
    if (value.tokenProgram === "native" ? value.mint !== "native:SOL" || value.tokenAccount !== null : value.mint === "native:SOL" || !isPortfolioPublicKey(value.mint) || !isPortfolioPublicKey(value.tokenAccount)) return false;
    if (value.priceUsd === null !== (value.valueUsd === null) || value.priceUsd === null !== (value.priceObservedAt === null)) return false;
    if (value.priceUsd === null && (value.priceSource != null || value.priceBlockId != null || value.change24hPercent != null)) return false;
    if (value.marketContext && value.marketContext.mint !== (value.mint === "native:SOL" ? "So11111111111111111111111111111111111111112" : value.mint)) return false;
    if (typeof value.amountRaw !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.amountRaw) || BigInt(value.amountRaw) > U64_MAX$1 || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 255) return false;
    if (value.amountModel === "scaled-ui-amount" && (value.tokenProgram !== "token-2022" || value.displayMultiplier == null || value.displayMultiplier === "0")) return false;
    const raw = formatDecimal(BigInt(value.amountRaw), value.decimals);
    const expected = value.amountModel === "scaled-ui-amount" ? multiplyDecimals$1(raw, value.displayMultiplier) : raw;
    if (expected !== value.displayAmount || value.amountModel !== "scaled-ui-amount" && value.displayMultiplier != null) return false;
    if (value.priceUsd !== null && multiplyDecimals$1(value.displayAmount, value.priceUsd) !== value.valueUsd) return false;
    const identity2 = value.identity;
    if (identity2.state === "native") {
      return value.tokenProgram === "native" && value.mint === "native:SOL" && value.decimals === 9 && value.assetId === "solana" && value.assetClass === "cash" && value.symbol === "SOL" && value.name === "Solana" && value.registryIdentity == null;
    }
    if (identity2.state === "recognized") {
      const material = identity2.material;
      if (["mint", "tokenProgram", "decimals", "assetId", "assetClass", "symbol", "name"].some((key) => material[key] !== value[key])) return false;
      const names = material.assetClass === "stock" ? {
        source: "dexter-registry",
        providerName: material.providerName ?? null,
        legalIssuerName: material.legalIssuerName ?? null
      } : null;
      return equal(value.registryIdentity ?? null, names);
    }
    return value.assetId === null && value.registryIdentity == null && value.assetClass === "token" && value.tokenProgram !== "native";
  } catch {
    return false;
  }
}
const holdingsSource = object({
  kind: literal("holdings"),
  holdingCount: count,
  pricedHoldings: count,
  unpricedHoldings: count,
  holdingsComplete: boolean(),
  omittedHoldings: count,
  pricedValueUsd: decimal$1,
  portfolioValueUsd: decimal$1.nullable(),
  enrichment: object({
    metadata: _enum(["complete", "partial", "unavailable"]),
    pricing: _enum(["complete", "partial", "unavailable"]),
    tokenExtensions: _enum(["complete", "partial", "unavailable"])
  }).strict(),
  identityCoverage: object({ recognized: count, unreviewed: count, unavailable: count }).strict(),
  tradingAvailability: object({ state: literal("not_evaluated") }).strict()
}).strict().refine((s) => s.holdingCount === s.pricedHoldings + s.unpricedHoldings && (s.pricedHoldings !== 0 || s.pricedValueUsd === "0") && s.holdingCount === s.identityCoverage.recognized + s.identityCoverage.unreviewed + s.identityCoverage.unavailable && s.portfolioValueUsd === (s.holdingsComplete && s.unpricedHoldings === 0 ? s.pricedValueUsd : null) && (!s.holdingsComplete || s.omittedHoldings === 0), "Holdings source coverage mismatch");
const portfolioSourceV3Schema = union([holdingsSource, object({
  kind: literal("action_targets"),
  targetCount: count.nullable(),
  holdingSnapshotId: opaque$1(128).nullable()
}).strict()]);
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
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CANONICAL_SIGNED_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const ASSET_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_MAX = 18446744073709551615n;
const GOVERNED_ACTIONS = ["buy", "sell", "send"];
const GOVERNED_UNAVAILABLE_REASONS = /* @__PURE__ */ new Set([
  "governed_asset_rail_not_live",
  "governed_asset_action_not_supported",
  "protected_agent_send_sdk_required",
  "stock_approval_required",
  "stock_connection_unavailable",
  "stock_authority_unavailable",
  "stock_activation_unavailable",
  "stock_eligibility_required",
  "stock_eligibility_unavailable",
  "stock_direction_not_permitted"
]);
const HOLDING_UNAVAILABLE_REASONS = /* @__PURE__ */ new Set([
  ...GOVERNED_UNAVAILABLE_REASONS,
  "asset_not_approved",
  "token_program_mismatch",
  "account_state_unverified",
  "unknown"
]);
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function nonEmptyString(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  return value;
}
function safeCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function nullableCount(value) {
  return value === null ? null : safeCount(value) ?? void 0;
}
function decimal(value) {
  return typeof value === "string" && DECIMAL.test(value) ? value : null;
}
function nullableDecimal(value) {
  if (value === null) return null;
  return decimal(value) ?? void 0;
}
function optionalHoldingLabel(source, key, maxLength) {
  if (!Object.hasOwn(source, key)) return null;
  const value = nonEmptyString(source[key], maxLength);
  return value && value.trim().length > 0 ? value : void 0;
}
function optionalHoldingDecimal(source, key, signed = false) {
  if (!Object.hasOwn(source, key) || source[key] === null) return null;
  const value = source[key];
  return typeof value === "string" && value.length <= 384 && CANONICAL_SIGNED_DECIMAL.test(value) && value !== "-0" && (signed || !value.startsWith("-")) ? value : void 0;
}
function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return value;
}
function nullableIsoDate(value) {
  if (value === null) return null;
  return isoDate(value) ?? void 0;
}
function parseMarketContext(value, holdingMint2, parseObservedAt = isoDate) {
  if (value === null) return null;
  const source = record(value);
  const activity = record(source?.activity24h);
  if (!source || !exactKeys(source, ["source", "mint", "observedAt", "liquidityUsd", "holderCount", "activity24h"]) || source.source !== "jupiter-tokens-v2" || source.mint !== (holdingMint2 === "native:SOL" ? WRAPPED_SOL_MINT : holdingMint2) || !activity || !exactKeys(activity, ["traderCount"])) return void 0;
  const observedAt = parseObservedAt(source.observedAt);
  const liquidityUsd = optionalHoldingDecimal(source, "liquidityUsd");
  const holderCount = nullableCount(source.holderCount);
  const traderCount = nullableCount(activity.traderCount);
  if (!observedAt || liquidityUsd === void 0 || holderCount === void 0 || traderCount === void 0) return void 0;
  return {
    source: "jupiter-tokens-v2",
    mint: source.mint,
    observedAt,
    liquidityUsd,
    holderCount,
    activity24h: { traderCount }
  };
}
function registryLabel(value) {
  if (value === null) return null;
  return typeof value === "string" && value.length > 0 && value.trim() === value && new TextEncoder().encode(value).length <= 128 ? value : void 0;
}
function parseRegistryIdentity(value) {
  if (value === null) return null;
  const source = record(value);
  if (!source || !exactKeys(source, ["source", "providerName", "legalIssuerName"]) || source.source !== "dexter-registry") return void 0;
  const providerName = registryLabel(source.providerName);
  const legalIssuerName = registryLabel(source.legalIssuerName);
  if (providerName === void 0 || legalIssuerName === void 0) return void 0;
  return { source: "dexter-registry", providerName, legalIssuerName };
}
function parseHoldingCapabilities(value) {
  if (!Array.isArray(value) || value.length !== PORTFOLIO_ACTIONS.length) return void 0;
  const capabilities = [];
  for (const item of value) {
    const source = record(item);
    if (!source || !exactKeys(source, ["action", "available", "reasonCode"]) || !PORTFOLIO_ACTIONS.includes(source.action) || typeof source.available !== "boolean" || (source.available ? source.reasonCode !== null : !HOLDING_UNAVAILABLE_REASONS.has(source.reasonCode)) || capabilities.some(({ action }) => action === source.action)) return void 0;
    capabilities.push({
      action: source.action,
      available: source.available,
      reasonCode: source.reasonCode
    });
  }
  return capabilities;
}
function parseEnrichment(value) {
  const source = record(value);
  const keys = ["metadata", "pricing", "tokenExtensions"];
  if (!source || !exactKeys(source, keys) || !keys.every((key) => ["complete", "partial", "unavailable"].includes(source[key]))) return void 0;
  return {
    metadata: source.metadata,
    pricing: source.pricing,
    tokenExtensions: source.tokenExtensions
  };
}
function addDecimals(left, right) {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftUnits = BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`);
  const rightUnits = BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  const digits = (leftUnits + rightUnits).toString().padStart(scale + 1, "0");
  if (scale === 0) return digits;
  const split = digits.length - scale;
  const fraction = digits.slice(split).replace(/0+$/, "");
  return fraction ? `${digits.slice(0, split)}.${fraction}` : digits.slice(0, split);
}
function rawDecimal(amountRaw, decimals) {
  if (decimals === 0) return amountRaw;
  const padded = amountRaw.padStart(decimals + 1, "0");
  const split = padded.length - decimals;
  const fraction = padded.slice(split).replace(/0+$/, "");
  return fraction ? `${padded.slice(0, split)}.${fraction}` : padded.slice(0, split);
}
function multiplyDecimals(left, right) {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  return rawDecimal(
    (BigInt(`${leftWhole}${leftFraction}`) * BigInt(`${rightWhole}${rightFraction}`)).toString(),
    leftFraction.length + rightFraction.length
  );
}
function parseHolding(value) {
  const source = record(value);
  if (!source) return null;
  const assetId2 = source.assetId === null ? null : typeof source.assetId === "string" && ASSET_ID.test(source.assetId) ? source.assetId : void 0;
  const mint2 = nonEmptyString(source.mint, 128);
  const tokenAccount = source.tokenAccount === null ? null : nonEmptyString(source.tokenAccount, 128) ?? void 0;
  const tokenProgram = source.tokenProgram === "native" || source.tokenProgram === "spl-token" || source.tokenProgram === "token-2022" ? source.tokenProgram : null;
  const assetClass2 = source.assetClass === "cash" || source.assetClass === "yield" || source.assetClass === "token" || source.assetClass === "stock" || source.assetClass === "fund" || source.assetClass === "nft" || source.assetClass === "rwa" ? source.assetClass : null;
  const amountRaw = typeof source.amountRaw === "string" && INTEGER.test(source.amountRaw) ? source.amountRaw : null;
  const decimals = safeCount(source.decimals);
  const symbol = optionalHoldingLabel(source, "symbol", 32);
  const name = optionalHoldingLabel(source, "name", 128);
  const displayAmount = decimal(source.displayAmount);
  const displayMultiplier = optionalHoldingDecimal(source, "displayMultiplier");
  const amountModel = source.amountModel === "raw-decimals" || source.amountModel === "scaled-ui-amount" || source.amountModel === "unknown" ? source.amountModel : null;
  const accountState = source.accountState === "initialized" || source.accountState === "frozen" || source.accountState === "unknown" ? source.accountState : null;
  const valueUsd = nullableDecimal(source.valueUsd);
  const priceUsd = nullableDecimal(source.priceUsd);
  const priceObservedAt = nullableIsoDate(source.priceObservedAt);
  const change24hPercent = optionalHoldingDecimal(source, "change24hPercent", true);
  const priceSource = !Object.hasOwn(source, "priceSource") || source.priceSource === null ? null : source.priceSource === "jupiter-price-v3" || source.priceSource === "jupiter-exact-in-quote" || source.priceSource === "unknown" ? source.priceSource : void 0;
  const priceBlockId = Object.hasOwn(source, "priceBlockId") ? nullableCount(source.priceBlockId) : null;
  const metadataObservedAt = Object.hasOwn(source, "metadataObservedAt") ? nullableIsoDate(source.metadataObservedAt) : null;
  const marketContext = Object.hasOwn(source, "marketContext") ? parseMarketContext(source.marketContext, mint2 ?? "") : null;
  const registryIdentity = Object.hasOwn(source, "registryIdentity") ? parseRegistryIdentity(source.registryIdentity) : null;
  const capabilities = Object.hasOwn(source, "capabilities") ? parseHoldingCapabilities(source.capabilities) : [];
  const approvalStatus = source.approvalStatus === "approved" || source.approvalStatus === "unreviewed" || source.approvalStatus === "blocked" ? source.approvalStatus : null;
  const actions = Array.isArray(source.availableActions) ? source.availableActions : null;
  if (assetId2 === void 0 || !mint2 || tokenAccount === void 0 || !tokenProgram || !assetClass2 || !amountRaw || BigInt(amountRaw) > U64_MAX || decimals === null || decimals > 255 || symbol === void 0 || name === void 0 || !displayAmount || displayMultiplier === void 0 || !amountModel || !accountState || tokenProgram === "native" !== (mint2 === "native:SOL") || tokenProgram === "native" && tokenAccount !== null || tokenProgram !== "native" && tokenAccount === null || valueUsd === void 0 || priceUsd === void 0 || priceObservedAt === void 0 || change24hPercent === void 0 || priceSource === void 0 || priceBlockId === void 0 || metadataObservedAt === void 0 || marketContext === void 0 || registryIdentity === void 0 || capabilities === void 0 || !approvalStatus || registryIdentity !== null && approvalStatus !== "approved" || !actions || !actions.every((action) => PORTFOLIO_ACTIONS.includes(action)) || new Set(actions).size !== actions.length || Object.hasOwn(source, "capabilities") && (capabilities.filter(({ available }) => available).length !== actions.length || capabilities.some(({ action, available }) => available !== actions.includes(action))) || approvalStatus === "approved" && assetId2 === null || approvalStatus !== "approved" && assetId2 !== null || amountModel !== "scaled-ui-amount" && displayAmount !== rawDecimal(amountRaw, decimals) || Object.hasOwn(source, "displayMultiplier") && (amountModel === "scaled-ui-amount" ? displayMultiplier === null || displayMultiplier === "0" || displayAmount !== multiplyDecimals(rawDecimal(amountRaw, decimals), displayMultiplier) : displayMultiplier !== null)) {
    return null;
  }
  return {
    assetId: assetId2,
    mint: mint2,
    tokenAccount,
    tokenProgram,
    assetClass: assetClass2,
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
    availableActions: actions
  };
}
function parseApprovedAction(value, assetId2, index) {
  const source = record(value);
  const expectedAction = GOVERNED_ACTIONS[index];
  if (!source || source.namespace !== "dexter-governed-asset-action-availability/v1" || source.action !== expectedAction || source.assetId !== assetId2 || typeof source.registryIdentityDigest !== "string" || !SHA256_HEX.test(source.registryIdentityDigest) || typeof source.runtimeReleaseDigest !== "string" || !SHA256_HEX.test(source.runtimeReleaseDigest) || typeof source.available !== "boolean" || typeof source.receiptDigest !== "string" || !SHA256_HEX.test(source.receiptDigest)) {
    return null;
  }
  const reason2 = source.reason;
  if (source.available && reason2 !== null || !source.available && !GOVERNED_UNAVAILABLE_REASONS.has(reason2)) {
    return null;
  }
  return {
    action: expectedAction,
    available: source.available,
    reason: reason2
  };
}
function parseApprovedTarget(value) {
  const source = record(value);
  const assetId2 = typeof source?.assetId === "string" && ASSET_ID.test(source.assetId) ? source.assetId : null;
  const symbol = nonEmptyString(source?.symbol, 32);
  const name = nonEmptyString(source?.name, 128);
  const mint2 = typeof source?.mint === "string" && SOLANA_ADDRESS.test(source.mint) ? source.mint : null;
  const tokenProgram = source?.tokenProgram === "spl-token" || source?.tokenProgram === "token-2022" ? source.tokenProgram : null;
  const decimals = safeCount(source?.decimals);
  const actions = Array.isArray(source?.actions) && assetId2 ? source.actions.map((action, index) => parseApprovedAction(action, assetId2, index)) : null;
  if (!source || source.namespace !== "dexter-approved-action-target/v1" || !assetId2 || !symbol || !name || source.network !== "solana-mainnet" || !mint2 || !tokenProgram || decimals === null || decimals > 18 || !actions || actions.length !== GOVERNED_ACTIONS.length || actions.some((action) => action === null) || typeof source.targetDigest !== "string" || !SHA256_HEX.test(source.targetDigest)) {
    return null;
  }
  return {
    assetId: assetId2,
    symbol,
    name,
    network: "solana-mainnet",
    mint: mint2,
    tokenProgram,
    decimals,
    actions
  };
}
function parseSnapshot(value) {
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
  const enrichment = Object.hasOwn(source, "enrichment") ? parseEnrichment(source.enrichment) : null;
  const holdings = Array.isArray(source.holdings) ? source.holdings.map(parseHolding) : null;
  const targets = source.approvedActionTargets === void 0 ? [] : Array.isArray(source.approvedActionTargets) ? source.approvedActionTargets.map(parseApprovedTarget) : null;
  if (source.contractVersion !== "opendexter.portfolio.v1" || source.network !== "solana-mainnet" || !walletAddress || !observedAt || source.contextSlot !== null && contextSlot === null || typeof source.holdingsComplete !== "boolean" || omittedHoldings === null || !pricedValueUsd || portfolioValueUsd === void 0 || pricedHoldings === null || unpricedHoldings === null || enrichment === void 0 || !holdings || holdings.some((holding) => holding === null) || !targets || targets.some((target) => target === null)) {
    return null;
  }
  const parsedHoldings = holdings;
  const parsedTargets = targets;
  const calculatedPriced = parsedHoldings.filter((holding) => holding.valueUsd !== null);
  const calculatedUnpriced = parsedHoldings.length - calculatedPriced.length;
  const calculatedValue = calculatedPriced.reduce(
    (sum, holding) => addDecimals(sum, holding.valueUsd),
    "0"
  );
  const targetAssetIds = parsedTargets.map((target) => target.assetId);
  const targetMints = parsedTargets.map((target) => `${target.tokenProgram}:${target.mint}`);
  if (pricedHoldings !== calculatedPriced.length || unpricedHoldings !== calculatedUnpriced || pricedValueUsd !== calculatedValue || source.holdingsComplete && omittedHoldings !== 0 || (source.holdingsComplete && calculatedUnpriced === 0 ? portfolioValueUsd !== pricedValueUsd : portfolioValueUsd !== null) || new Set(targetAssetIds).size !== targetAssetIds.length || new Set(targetMints).size !== targetMints.length || targetAssetIds.some((assetId2, index) => index > 0 && targetAssetIds[index - 1] >= assetId2)) {
    return null;
  }
  return {
    contractVersion: "opendexter.portfolio.v1",
    network: "solana-mainnet",
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
    approvedActionTargets: parsedTargets
  };
}
const COMPACT_HOLDING_KEYS = [
  "assetId",
  "mint",
  "tokenAccount",
  "symbol",
  "name",
  "displayAmount",
  "amountModel",
  "valueUsd",
  "change24hPercent"
];
const RICH_HOLDING_KEYS = /* @__PURE__ */ new Set([
  ...COMPACT_HOLDING_KEYS,
  "tokenProgram",
  "assetClass",
  "amountRaw",
  "decimals",
  "displayMultiplier",
  "accountState",
  "priceUsd",
  "priceObservedAt",
  "priceSource",
  "priceBlockId",
  "metadataObservedAt",
  "marketContext",
  "registryIdentity",
  "capabilities",
  "approvalStatus",
  "availableActions"
]);
function opaque(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[\x21-\x7e]+$/.test(value);
}
function holdingMint(value) {
  return value === "native:SOL" || typeof value === "string" && SOLANA_ADDRESS.test(value);
}
function compactHolding(value) {
  const source = record(value);
  if (!source || !exactKeys(source, [...COMPACT_HOLDING_KEYS])) return null;
  const label2 = (key, max) => source[key] === null || typeof source[key] === "string" && source[key].length <= max && source[key].trim().length > 0;
  if (!(source.assetId === null || typeof source.assetId === "string" && ASSET_ID.test(source.assetId)) || !holdingMint(source.mint) || !(source.tokenAccount === null || typeof source.tokenAccount === "string" && SOLANA_ADDRESS.test(source.tokenAccount)) || source.mint === "native:SOL" !== (source.tokenAccount === null) || !label2("symbol", 32) || !label2("name", 128) || typeof source.displayAmount !== "string" || source.displayAmount.length > 384 || !decimal(source.displayAmount) || !["raw-decimals", "scaled-ui-amount", "unknown"].includes(String(source.amountModel)) || nullableDecimal(source.valueUsd) === void 0 || typeof source.valueUsd === "string" && source.valueUsd.length > 384 || optionalHoldingDecimal(source, "change24hPercent", true) === void 0) return null;
  return source;
}
function selectedRichHolding(value) {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => !RICH_HOLDING_KEYS.has(key))) return null;
  const parsed = parseHolding(source);
  if (!parsed || !holdingMint(parsed.mint) || parsed.tokenAccount !== null && !SOLANA_ADDRESS.test(parsed.tokenAccount) || parsed.priceUsd === null && (parsed.priceSource !== null || parsed.priceBlockId !== null)) return null;
  return parsed;
}
function compactProjection(holding) {
  return Object.fromEntries(COMPACT_HOLDING_KEYS.map((key) => [key, holding[key]]));
}
function sameCompactHolding(left, right) {
  return COMPACT_HOLDING_KEYS.every((key) => left[key] === right[key]);
}
function compactTarget(value) {
  const source = record(value);
  if (!source || !exactKeys(source, ["assetId", "mint", "tokenProgram", "symbol", "name", "actions"]) || typeof source.assetId !== "string" || !ASSET_ID.test(source.assetId) || typeof source.mint !== "string" || !SOLANA_ADDRESS.test(source.mint) || !["spl-token", "token-2022"].includes(String(source.tokenProgram)) || !nonEmptyString(source.symbol, 32) || !nonEmptyString(source.name, 128) || !Array.isArray(source.actions) || source.actions.length !== GOVERNED_ACTIONS.length) return null;
  const actions = [];
  for (const [index, value2] of source.actions.entries()) {
    const action = record(value2);
    if (!action || !exactKeys(action, ["action", "available", "reason"]) || action.action !== GOVERNED_ACTIONS[index] || typeof action.available !== "boolean" || (action.available ? action.reason !== null : !GOVERNED_UNAVAILABLE_REASONS.has(action.reason))) return null;
    actions.push(action);
  }
  return {
    assetId: source.assetId,
    mint: source.mint,
    tokenProgram: source.tokenProgram,
    symbol: source.symbol,
    name: source.name,
    actions
  };
}
function parseSelectedRead(value, cardValue) {
  const source = record(value);
  const summary = record(source?.sourceSummary);
  const selection = record(source?.selection);
  if (!source || !exactKeys(source, [
    "contractVersion",
    "network",
    "walletAddress",
    "observedAt",
    "contextSlot",
    "snapshotId",
    "expiresAt",
    "sourceSummary",
    "selection",
    "holdings",
    "targets"
  ]) || source.contractVersion !== "opendexter.portfolio.v2" || source.network !== "solana-mainnet" || typeof source.walletAddress !== "string" || !SOLANA_ADDRESS.test(source.walletAddress) || !isoDate(source.observedAt) || !isoDate(source.expiresAt) || Date.parse(source.expiresAt) <= Date.parse(source.observedAt) || nullableCount(source.contextSlot) === void 0 || !opaque(source.snapshotId, 128) || !summary || !exactKeys(summary, [
    "holdingCount",
    "pricedHoldings",
    "unpricedHoldings",
    "holdingsComplete",
    "omittedHoldings",
    "pricedValueUsd",
    "portfolioValueUsd",
    "enrichment",
    "targetCount"
  ]) || !selection || !exactKeys(selection, [
    "view",
    "query",
    "mint",
    "tokenAccount",
    "limit",
    "offset",
    "matchedCount",
    "returnedCount",
    "omittedCount",
    "nextCursor",
    "match"
  ])) return null;
  for (const key of ["holdingCount", "pricedHoldings", "unpricedHoldings", "omittedHoldings"]) {
    if (safeCount(summary[key]) === null) return null;
  }
  const total = summary.holdingCount;
  const priced = summary.pricedHoldings;
  const unpriced = summary.unpricedHoldings;
  const targetCount = nullableCount(summary.targetCount);
  const enrichment = parseEnrichment(summary.enrichment);
  if (targetCount === void 0 || !enrichment || total !== priced + unpriced || typeof summary.holdingsComplete !== "boolean" || summary.holdingsComplete && summary.omittedHoldings !== 0 || !decimal(summary.pricedValueUsd) || nullableDecimal(summary.portfolioValueUsd) === void 0 || (summary.holdingsComplete && unpriced === 0 ? summary.portfolioValueUsd !== summary.pricedValueUsd : summary.portfolioValueUsd !== null) || priced === 0 && summary.pricedValueUsd !== "0") return null;
  const view2 = selection.view;
  if (!["summary", "holdings", "detail", "targets"].includes(String(view2))) return null;
  const limit = safeCount(selection.limit);
  const offset = safeCount(selection.offset);
  const returned = safeCount(selection.returnedCount);
  const matched = nullableCount(selection.matchedCount);
  const omitted = nullableCount(selection.omittedCount);
  const query2 = selection.query;
  if (limit === null || limit < 1 || limit > (view2 === "summary" ? 5 : 32) || view2 === "summary" && limit !== 5 || offset === null || returned === null || returned > limit || matched === void 0 || omitted === void 0 || !(query2 === null || typeof query2 === "string" && query2.trim() === query2 && query2.length > 0 && new TextEncoder().encode(query2).length <= 128) || !(selection.mint === null || holdingMint(selection.mint)) || !(selection.tokenAccount === null || typeof selection.tokenAccount === "string" && SOLANA_ADDRESS.test(selection.tokenAccount)) || query2 !== null && selection.mint !== null || selection.tokenAccount !== null && (view2 !== "detail" || selection.mint === null) || selection.mint === "native:SOL" && selection.tokenAccount !== null || !(selection.nextCursor === null || opaque(selection.nextCursor, 1024)) || view2 === "summary" && (query2 !== null || selection.mint !== null || selection.tokenAccount !== null || offset !== 0 || selection.nextCursor !== null) || view2 === "detail" && query2 === null && selection.mint === null || !Array.isArray(source.holdings) || !Array.isArray(source.targets) || source.holdings.length + source.targets.length !== returned || (view2 === "targets" ? source.holdings.length !== 0 : source.targets.length !== 0)) return null;
  const sourceCount = view2 === "targets" ? targetCount : total;
  if (sourceCount === null) {
    if (matched !== null || omitted !== null || returned !== 0 || offset !== 0 || selection.nextCursor !== null || selection.match !== "unavailable") return null;
  } else {
    if (matched === null || omitted !== sourceCount - returned || matched > sourceCount || offset + returned > matched || matched > 0 && returned === 0 || selection.match !== (matched === 0 ? "none" : view2 === "detail" && matched > 1 ? "ambiguous" : "matched") || view2 === "summary" && matched !== total || view2 !== "summary" && selection.nextCursor !== null !== offset + returned < matched) return null;
  }
  const richDetail = view2 === "detail" && matched === 1;
  const parsedRich = richDetail ? source.holdings.map(selectedRichHolding) : [];
  if (parsedRich.some((holding) => holding === null)) return null;
  const holdings = richDetail ? parsedRich.map(compactProjection) : source.holdings.map(compactHolding);
  const targets = source.targets.map(compactTarget);
  if (holdings.some((holding) => holding === null) || targets.some((target) => target === null)) return null;
  const selectedHoldings = holdings;
  const selectedTargets = targets;
  const identities = selectedHoldings.map((holding) => `${holding.mint}:${holding.tokenAccount ?? ""}`);
  if (new Set(identities).size !== identities.length || new Set(selectedTargets.map((target) => target.assetId)).size !== selectedTargets.length || new Set(selectedTargets.map((target) => `${target.tokenProgram}:${target.mint}`)).size !== selectedTargets.length || selectedHoldings.some((holding) => selection.mint !== null && holding.mint !== selection.mint || selection.tokenAccount !== null && holding.tokenAccount !== selection.tokenAccount) || selectedTargets.some((target) => selection.mint !== null && target.mint !== selection.mint)) return null;
  let richHoldings = parsedRich;
  if (cardValue !== void 0) {
    const card = record(cardValue);
    if (!card || !exactKeys(card, ["contractVersion", "snapshotId", "holdings", "approvedActionTargets"]) || card.contractVersion !== "opendexter.portfolio-card.v2" || card.snapshotId !== source.snapshotId || !Array.isArray(card.holdings) || card.holdings.length !== selectedHoldings.length || !Array.isArray(card.approvedActionTargets) || card.approvedActionTargets.length !== selectedTargets.length) return null;
    const rich = card.holdings.map(selectedRichHolding);
    const approved = card.approvedActionTargets.map(parseApprovedTarget);
    if (rich.some((holding, index) => !holding || !sameCompactHolding(compactProjection(holding), selectedHoldings[index]) || richDetail && JSON.stringify(holding) !== JSON.stringify(parsedRich[index])) || approved.some((target, index) => !target || ["assetId", "mint", "tokenProgram", "symbol", "name"].some(
      (key) => target[key] !== selectedTargets[index][key]
    ) || JSON.stringify(target.actions) !== JSON.stringify(selectedTargets[index].actions))) return null;
    richHoldings = rich;
  }
  return {
    contractVersion: "opendexter.portfolio.v2",
    network: "solana-mainnet",
    walletAddress: source.walletAddress,
    observedAt: source.observedAt,
    contextSlot: source.contextSlot,
    snapshotId: source.snapshotId,
    expiresAt: source.expiresAt,
    sourceSummary: { ...summary, enrichment },
    selection,
    holdings: selectedHoldings,
    targets: selectedTargets,
    richHoldings
  };
}
const V3_RICH_KEYS = new Set([...RICH_HOLDING_KEYS].filter((key) => !["approvalStatus", "capabilities", "availableActions"].includes(key)).concat("identity"));
const V3_REQUIRED_RICH_KEYS = [
  "assetId",
  "mint",
  "tokenAccount",
  "tokenProgram",
  "assetClass",
  "amountRaw",
  "decimals",
  "displayAmount",
  "amountModel",
  "accountState",
  "valueUsd",
  "priceUsd",
  "priceObservedAt",
  "identity"
];
function canonicalDecimal(value) {
  return typeof value === "string" && value.length <= 384 && CANONICAL_SIGNED_DECIMAL.test(value) && !value.startsWith("-");
}
function observedAtV3(value) {
  return isPortfolioObservedAtV3(value) ? value : null;
}
function nullableObservedAtV3(value) {
  return value === null ? null : observedAtV3(value) ?? void 0;
}
function selectedRichHoldingV3(value) {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => !V3_RICH_KEYS.has(key)) || V3_REQUIRED_RICH_KEYS.some((key) => !Object.hasOwn(source, key)) || !(source.assetId === null || typeof source.assetId === "string" && ASSET_ID.test(source.assetId)) || !(source.mint === "native:SOL" || isPortfolioPublicKey(source.mint)) || !(source.tokenAccount === null || isPortfolioPublicKey(source.tokenAccount)) || !["native", "spl-token", "token-2022"].includes(String(source.tokenProgram)) || !["cash", "yield", "token", "stock", "fund", "nft", "rwa"].includes(String(source.assetClass)) || typeof source.amountRaw !== "string" || source.amountRaw.length > 20 || !INTEGER.test(source.amountRaw) || safeCount(source.decimals) === null || source.decimals > 255 || !canonicalDecimal(source.displayAmount) || !["raw-decimals", "scaled-ui-amount", "unknown"].includes(String(source.amountModel)) || !["initialized", "frozen", "unknown"].includes(String(source.accountState)) || !(source.valueUsd === null || canonicalDecimal(source.valueUsd)) || !(source.priceUsd === null || canonicalDecimal(source.priceUsd)) || nullableObservedAtV3(source.priceObservedAt) === void 0) return null;
  const symbol = optionalHoldingLabel(source, "symbol", 32), name = optionalHoldingLabel(source, "name", 128);
  const displayMultiplier = optionalHoldingDecimal(source, "displayMultiplier");
  const change24hPercent = optionalHoldingDecimal(source, "change24hPercent", true);
  const priceSource = source.priceSource == null ? null : ["jupiter-price-v3", "jupiter-exact-in-quote", "unknown"].includes(String(source.priceSource)) ? source.priceSource : void 0;
  const priceBlockId = Object.hasOwn(source, "priceBlockId") ? nullableCount(source.priceBlockId) : null;
  const metadataObservedAt = Object.hasOwn(source, "metadataObservedAt") ? nullableObservedAtV3(source.metadataObservedAt) : null;
  const marketContext = Object.hasOwn(source, "marketContext") ? parseMarketContext(source.marketContext, source.mint, observedAtV3) : null;
  const registryIdentity = Object.hasOwn(source, "registryIdentity") ? parseRegistryIdentity(source.registryIdentity) : null;
  const identity2 = portfolioHoldingIdentityV3Schema.safeParse(source.identity);
  if ([symbol, name, displayMultiplier, change24hPercent, priceSource, priceBlockId, metadataObservedAt, marketContext, registryIdentity].some((item) => item === void 0) || !identity2.success) return null;
  const holding = {
    ...source,
    symbol,
    name,
    displayMultiplier,
    change24hPercent,
    priceSource,
    priceBlockId,
    metadataObservedAt,
    marketContext,
    registryIdentity,
    identity: identity2.data
  };
  return portfolioHoldingV3IsValid(holding) ? holding : null;
}
function identityStatus(holding) {
  return holding.identity.state === "recognized" && holding.identity.registryState === "retired" ? "retired" : holding.identity.state;
}
function compactProjectionV3(holding) {
  return { ...Object.fromEntries(COMPACT_HOLDING_KEYS.map((key) => [key, holding[key]])), identityStatus: identityStatus(holding) };
}
function compactHoldingV3(value) {
  const parsed = compactPortfolioHoldingV3Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function parseSourceV3(value) {
  const parsed = portfolioSourceV3Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function parseSelectedReadV3(value, cardValue) {
  const raw = record(value), source = parseSourceV3(raw?.source), s = record(raw?.selection);
  if (!raw || !exactKeys(raw, ["contractVersion", "network", "walletAddress", "observedAt", "contextSlot", "snapshotId", "expiresAt", "source", "selection", "holdings", "targets"]) || raw.contractVersion !== "opendexter.portfolio.v3" || raw.network !== "solana-mainnet" || !isPortfolioPublicKey(raw.walletAddress) || !isPortfolioObservedAtV3(raw.observedAt) || !isPortfolioObservedAtV3(raw.expiresAt) || Date.parse(raw.expiresAt) <= Date.parse(raw.observedAt) || nullableCount(raw.contextSlot) === void 0 || !opaque(raw.snapshotId, 128) || !source || !s || !exactKeys(s, ["view", "query", "mint", "tokenAccount", "limit", "offset", "matchedCount", "returnedCount", "omittedCount", "nextCursor", "match"]) || !Array.isArray(raw.holdings) || !Array.isArray(raw.targets)) return null;
  const target = source.kind === "action_targets", count2 = target ? source.targetCount : source.holdingCount;
  const limit = safeCount(s.limit), offset = safeCount(s.offset), returned = safeCount(s.returnedCount);
  const matched = nullableCount(s.matchedCount), omitted = nullableCount(s.omittedCount);
  if (!["summary", "holdings", "detail", "targets"].includes(String(s.view)) || target !== (s.view === "targets") || target && (raw.contextSlot !== null || source.holdingSnapshotId === raw.snapshotId) || limit === null || limit < 1 || limit > 32 || offset === null || returned === null || returned > limit || matched === void 0 || omitted === void 0 || !(s.query === null || typeof s.query === "string" && s.query.trim() === s.query && s.query.length > 0 && new TextEncoder().encode(s.query).length <= 128) || !(s.mint === null || s.mint === "native:SOL" || isPortfolioPublicKey(s.mint)) || !(s.tokenAccount === null || isPortfolioPublicKey(s.tokenAccount)) || s.query !== null && s.mint !== null || s.tokenAccount !== null && (s.view !== "detail" || s.mint === null || s.mint === "native:SOL") || s.view === "detail" && s.query === null && s.mint === null || !(s.nextCursor === null || opaque(s.nextCursor, 1024)) || s.view === "summary" && (limit !== 5 || offset !== 0 || s.nextCursor !== null || s.query !== null || s.mint !== null || s.tokenAccount !== null) || raw.holdings.length + raw.targets.length !== returned || (target ? raw.holdings.length !== 0 : raw.targets.length !== 0)) return null;
  if (count2 === null) {
    if (matched !== null || omitted !== null || returned !== 0 || offset !== 0 || s.nextCursor !== null || s.match !== "unavailable") return null;
  } else if (matched === null || matched > count2 || offset + returned > matched || omitted !== count2 - returned || s.query === null && s.mint === null && matched !== count2 || s.match !== (matched === 0 ? "none" : s.view === "detail" && matched > 1 ? "ambiguous" : "matched") || s.view !== "summary" && s.nextCursor !== null !== offset + returned < matched || s.nextCursor !== null && returned === 0) return null;
  const richDetail = s.view === "detail" && matched === 1;
  if (richDetail && returned !== 1) return null;
  const rawHoldings = raw.holdings;
  const details = richDetail ? rawHoldings.map(selectedRichHoldingV3) : [];
  if (details.some((item) => item === null)) return null;
  const holdings = richDetail ? details.map(compactProjectionV3) : raw.holdings.map(compactHoldingV3);
  const targets = raw.targets.map(compactTarget);
  if (holdings.some((item) => item === null) || targets.some((item) => item === null || !isPortfolioPublicKey(item.mint))) return null;
  const h = holdings, t = targets;
  const rows = target ? t : h;
  if (new Set(h.map((item) => `${item.mint}:${item.tokenAccount ?? ""}`)).size !== h.length || new Set(t.map((item) => item.assetId)).size !== t.length || new Set(t.map((item) => item.mint)).size !== t.length || rows.some((row) => s.mint !== null && row.mint !== s.mint || s.tokenAccount !== null && (!("tokenAccount" in row) || row.tokenAccount !== s.tokenAccount) || s.query !== null && ![row.assetId, row.symbol, row.name].some((field) => typeof field === "string" && field.toLowerCase().includes(s.query.toLowerCase())))) return null;
  let richHoldings = details;
  if (cardValue !== void 0) {
    const card = record(cardValue);
    if (!card || !exactKeys(card, ["contractVersion", "snapshotId", "sourceKind", "holdings", "approvedActionTargets"]) || card.contractVersion !== "opendexter.portfolio-card.v3" || card.snapshotId !== raw.snapshotId || card.sourceKind !== source.kind || !Array.isArray(card.holdings) || card.holdings.length !== h.length || !Array.isArray(card.approvedActionTargets) || card.approvedActionTargets.length !== t.length || new TextEncoder().encode(JSON.stringify({ ok: true, portfolio: value, card })).length > 512 * 1024) return null;
    const cardHoldings = card.holdings;
    const rich = cardHoldings.map(selectedRichHoldingV3), approved = card.approvedActionTargets.map(parseApprovedTarget);
    if (rich.some((item, i) => !item || !samePortfolioFacts(compactProjectionV3(item), h[i]) || richDetail && !samePortfolioFacts(cardHoldings[i], rawHoldings[i])) || approved.some((item, i) => !item || !samePortfolioFacts({
      assetId: item.assetId,
      mint: item.mint,
      tokenProgram: item.tokenProgram,
      symbol: item.symbol,
      name: item.name,
      actions: item.actions
    }, t[i]))) return null;
    richHoldings = rich;
  }
  if (source.kind === "holdings") {
    const selected = { recognized: 0, unreviewed: 0, unavailable: 0 };
    for (const holding of h) selected[holding.identityStatus === "unreviewed" || holding.identityStatus === "unavailable" ? holding.identityStatus : "recognized"]++;
    if (Object.keys(selected).some((key) => selected[key] > source.identityCoverage[key])) return null;
  }
  return {
    contractVersion: "opendexter.portfolio.v3",
    network: "solana-mainnet",
    walletAddress: raw.walletAddress,
    observedAt: raw.observedAt,
    contextSlot: raw.contextSlot,
    snapshotId: raw.snapshotId,
    expiresAt: raw.expiresAt,
    source,
    selection: s,
    holdings: h,
    targets: t,
    richHoldings
  };
}
function portfolioHoldingsSource(read) {
  return read.contractVersion === "opendexter.portfolio.v2" ? read.sourceSummary : read.source.kind === "holdings" ? read.source : null;
}
function portfolioReadRequest(read, view2, holding) {
  const v3 = read.contractVersion === "opendexter.portfolio.v3";
  if (v3 && view2 === "targets" && read.source.kind === "holdings") return { readVersion: 3, network: read.network, view: view2, holdingSnapshotId: read.snapshotId };
  if (v3 && view2 === "summary" && read.source.kind === "action_targets") return { readVersion: 3, network: read.network, view: view2 };
  const common = { network: read.network, snapshotId: read.snapshotId, ...v3 ? { readVersion: 3 } : {} };
  if (view2 === "next") return { ...common, cursor: read.selection.nextCursor };
  if (view2 === "detail" && holding) return {
    ...common,
    view: view2,
    mint: holding.mint,
    ...holding.tokenAccount === null ? {} : { tokenAccount: holding.tokenAccount }
  };
  return { ...common, view: view2 };
}
function samePortfolioObservation(left, right) {
  if (left.contractVersion !== right.contractVersion) return false;
  if (left.contractVersion === "opendexter.portfolio.v3" && right.contractVersion === "opendexter.portfolio.v3") {
    return left.snapshotId === right.snapshotId && left.walletAddress === right.walletAddress && left.network === right.network && left.observedAt === right.observedAt && left.expiresAt === right.expiresAt && left.contextSlot === right.contextSlot && samePortfolioFacts(left.source, right.source);
  }
  if (left.contractVersion !== "opendexter.portfolio.v2" || right.contractVersion !== "opendexter.portfolio.v2") return false;
  return left.snapshotId === right.snapshotId && left.walletAddress === right.walletAddress && left.network === right.network && left.observedAt === right.observedAt && left.expiresAt === right.expiresAt && left.contextSlot === right.contextSlot && Object.keys(left.sourceSummary).every((key) => key === "enrichment" ? ["metadata", "pricing", "tokenExtensions"].every((field) => left.sourceSummary.enrichment[field] === right.sourceSummary.enrichment[field]) : left.sourceSummary[key] === right.sourceSummary[key]);
}
function portfolioReadMatchesRequest(previous, next, request) {
  if (previous.contractVersion === "opendexter.portfolio.v3") {
    if (request.readVersion !== 3 || next.contractVersion !== "opendexter.portfolio.v3" || next.network !== previous.network || next.walletAddress !== previous.walletAddress) return false;
    if (request.holdingSnapshotId !== void 0) {
      return previous.source.kind === "holdings" && request.holdingSnapshotId === previous.snapshotId && request.snapshotId === void 0 && request.cursor === void 0 && request.view === "targets" && next.source.kind === "action_targets" && next.source.holdingSnapshotId === previous.snapshotId && next.snapshotId !== previous.snapshotId && next.selection.view === "targets" && next.selection.offset === 0 && next.selection.query === (request.query ?? null) && next.selection.mint === (request.mint ?? null) && next.selection.tokenAccount === null;
    }
    if (previous.source.kind === "action_targets" && request.view === "summary" && request.snapshotId === void 0) {
      return next.source.kind === "holdings" && next.snapshotId !== previous.snapshotId && next.selection.view === "summary" && next.selection.offset === 0 && next.selection.query === null && next.selection.mint === null && next.selection.tokenAccount === null;
    }
  }
  if (!samePortfolioObservation(previous, next)) return false;
  const selection = next.selection;
  if (request.cursor !== void 0) {
    return request.cursor === previous.selection.nextCursor && selection.offset === previous.selection.offset + previous.selection.returnedCount && ["view", "query", "mint", "tokenAccount", "limit", "matchedCount"].every((key) => selection[key] === previous.selection[key]);
  }
  return selection.view === request.view && selection.offset === 0 && selection.query === (request.query ?? null) && selection.mint === (request.mint ?? null) && selection.tokenAccount === (request.tokenAccount ?? null);
}
function samePortfolioFacts(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => samePortfolioFacts(value, right[index]));
  }
  const leftRecord = record(left);
  const rightRecord = record(right);
  return leftRecord !== null && rightRecord !== null && Object.keys(leftRecord).length === Object.keys(rightRecord).length && Object.keys(leftRecord).every((key) => Object.hasOwn(rightRecord, key) && samePortfolioFacts(leftRecord[key], rightRecord[key]));
}
function accumulatePortfolioRows(previous, next) {
  if (previous) {
    if (!samePortfolioObservation(previous.read, next)) return null;
    const lastSelection = previous.read.selection;
    const selection = next.selection;
    const summaryToHoldings = lastSelection.view === "summary" && selection.view === "holdings" && selection.offset === 0 && selection.query === null && selection.mint === null && selection.tokenAccount === null && selection.matchedCount === lastSelection.matchedCount;
    const continuation = lastSelection.nextCursor !== null && selection.offset === lastSelection.offset + lastSelection.returnedCount && ["view", "query", "mint", "tokenAccount", "limit", "matchedCount"].every((key) => selection[key] === lastSelection[key]);
    if (!summaryToHoldings && !continuation) return null;
  }
  const identity2 = (holding) => `${holding.mint}:${holding.tokenAccount ?? ""}`;
  const holdings = previous ? [...previous.holdings] : [];
  const consumedHoldingIdentities = new Set(previous ? previous.consumedHoldingIdentities : []);
  const holdingIndexes = new Map(holdings.map((row, index) => [identity2(row.holding), index]));
  const richByIdentity = new Map(next.richHoldings.map((holding) => [identity2(holding), holding]));
  for (const holding of next.holdings) {
    const key = identity2(holding);
    if (next.selection.view !== "summary") {
      if (consumedHoldingIdentities.has(key)) return null;
      consumedHoldingIdentities.add(key);
    }
    const rich = richByIdentity.get(key) ?? null;
    const index = holdingIndexes.get(key);
    if (index === void 0) {
      holdingIndexes.set(key, holdings.length);
      holdings.push({ holding, rich });
    } else {
      const retained = holdings[index];
      if (!samePortfolioFacts(retained.holding, holding) || retained.rich && rich && !samePortfolioFacts(retained.rich, rich)) return null;
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
function safeMessage(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 240 ? value.trim() : null;
}
function unwrapOutput(value) {
  const envelope = record(value);
  return envelope && record(envelope.structuredContent) ? envelope.structuredContent : value;
}
function formatExactDecimal(value) {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === void 0 ? grouped : `${grouped}.${fraction}`;
}
function formatExactUsd(value) {
  return `$${formatExactDecimal(value)}`;
}
function formatPriceChangePercent(value) {
  return `${value === "0" || value.startsWith("-") ? "" : "+"}${formatExactDecimal(value)}%`;
}
function formatDisplayUsd(value) {
  const [whole, fraction = ""] = value.split(".");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  const roundDigit = fraction[2] ?? "0";
  let atomicCents = BigInt(whole) * 100n + BigInt(cents);
  if (roundDigit >= "5") atomicCents += 1n;
  const roundedWhole = (atomicCents / 100n).toString();
  const roundedCents = (atomicCents % 100n).toString().padStart(2, "0");
  return `$${formatExactDecimal(roundedWhole)}.${roundedCents}`;
}
function roundPortfolioDecimal(value, places) {
  const [whole, fraction = ""] = value.split(".");
  const digits = BigInt(whole + fraction);
  const removedPlaces = fraction.length - places;
  if (removedPlaces <= 0) return { rounded: digits * 10n ** BigInt(-removedPlaces), changed: false };
  const divisor = 10n ** BigInt(removedPlaces);
  const remainder = digits % divisor;
  return { rounded: digits / divisor + (remainder * 2n >= divisor ? 1n : 0n), changed: remainder !== 0n };
}
function portfolioDecimalDigits(value, places) {
  if (places === 0) return value.toString();
  const digits = value.toString().padStart(places + 1, "0");
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, "");
}
function portfolioScientific(value, significantDigits) {
  const [whole, fraction = ""] = value.split(".");
  let exponent = whole !== "0" ? whole.length - 1 : -fraction.search(/[1-9]/) - 1;
  let result = roundPortfolioDecimal(value, significantDigits - 1 - exponent);
  if (result.rounded >= 10n ** BigInt(significantDigits)) {
    exponent += 1;
    result = roundPortfolioDecimal(value, significantDigits - 1 - exponent);
  }
  return { text: `${portfolioDecimalDigits(result.rounded, significantDigits - 1)}e${exponent}`, changed: result.changed };
}
function portfolioAbbreviation(value) {
  const whole = value.split(".")[0];
  if (whole.length > 15) return portfolioScientific(value, 3);
  let exponent = Math.floor((whole.length - 1) / 3) * 3;
  let result = roundPortfolioDecimal(value, 2 - exponent);
  if (result.rounded >= 100000n) {
    exponent += 3;
    if (exponent > 12) return portfolioScientific(value, 3);
    result = roundPortfolioDecimal(value, 2 - exponent);
  }
  const suffix = { 3: "K", 6: "M", 9: "B", 12: "T" }[exponent];
  return { text: `${portfolioDecimalDigits(result.rounded, 2)}${suffix}`, changed: result.changed };
}
function formatPortfolioMoney(value) {
  const [whole, fraction = ""] = value.split(".");
  if (whole === "0" && !/[1-9]/.test(fraction)) return "$0.00";
  if (whole === "0" && !/[1-9]/.test(fraction.slice(0, 2))) return "<$0.01";
  if (whole.length < 7) return formatDisplayUsd(value);
  const result = portfolioAbbreviation(value);
  return `${result.changed ? "~" : ""}$${result.text}`;
}
function formatPortfolioQuantity(value) {
  const [whole, fraction = ""] = value.split(".");
  if (whole === "0" && !/[1-9]/.test(fraction)) return "0";
  if (whole.length > 3) {
    const result2 = portfolioAbbreviation(value);
    return `${result2.changed ? "~" : ""}${result2.text}`;
  }
  const firstDigit = fraction.search(/[1-9]/);
  if (whole === "0" && firstDigit >= 12) {
    const result2 = portfolioScientific(value, 6);
    return `${result2.changed ? "~" : ""}${result2.text}`;
  }
  const places = whole === "0" ? firstDigit + 6 : 6;
  const result = roundPortfolioDecimal(value, places);
  return `${result.changed ? "~" : ""}${portfolioDecimalDigits(result.rounded, places)}`;
}
function formatPortfolioPrice(value) {
  const [whole, fraction = ""] = value.split(".");
  if (whole === "0" && !/[1-9]/.test(fraction)) return "$0.00";
  if (whole.length > 6) return formatPortfolioMoney(value);
  const firstDigit = fraction.search(/[1-9]/);
  if (whole === "0" && firstDigit >= 12) {
    const result2 = portfolioScientific(value, 4);
    return `${result2.changed ? "~" : ""}$${result2.text}`;
  }
  const places = whole === "0" ? Math.max(2, firstDigit + 4) : 6;
  const result = roundPortfolioDecimal(value, places);
  return `${result.changed ? "~" : ""}$${formatExactDecimal(portfolioDecimalDigits(result.rounded, places))}`;
}
function summarizePortfolio(snapshot) {
  if (snapshot.portfolioValueUsd !== null) {
    return {
      label: "Portfolio value",
      value: formatExactUsd(snapshot.portfolioValueUsd),
      exact: true
    };
  }
  if (snapshot.pricedHoldings > 0) {
    return {
      label: "Priced subtotal",
      value: formatExactUsd(snapshot.pricedValueUsd),
      exact: false
    };
  }
  return {
    label: "Portfolio value unavailable",
    value: null,
    exact: false
  };
}
function portfolioCoverage(snapshot) {
  const details = [];
  if (snapshot.omittedHoldings > 0) {
    details.push(`${snapshot.omittedHoldings} ${snapshot.omittedHoldings === 1 ? "holding was" : "holdings were"} omitted`);
  }
  if (snapshot.unpricedHoldings > 0) {
    details.push(`${snapshot.unpricedHoldings} ${snapshot.unpricedHoldings === 1 ? "holding has" : "holdings have"} no current price`);
  }
  if (snapshot.holdingsComplete && details.length === 0 && snapshot.portfolioValueUsd !== null) {
    return null;
  }
  const joinedDetails = details.length < 2 ? details[0] ?? null : `${details.slice(0, -1).join(", ")}, and ${details[details.length - 1]}`;
  const readState = !snapshot.holdingsComplete ? joinedDetails ? `The holdings read is incomplete: ${joinedDetails}.` : "The holdings read is incomplete." : joinedDetails ? `${joinedDetails.slice(0, 1).toUpperCase()}${joinedDetails.slice(1)}.` : "";
  const valueState = snapshot.portfolioValueUsd === null ? "The total value is unknown." : "";
  return `${readState} ${valueState}`.trim() || null;
}
function governedActionReason(reason2) {
  if (reason2 === "protected_agent_send_sdk_required") return "Sending is unavailable through this connection.";
  if (reason2 === "governed_asset_action_not_supported") return "This action is unavailable for the asset.";
  if (reason2 === "governed_asset_rail_not_live") return "This action is currently unavailable for this asset.";
  if (reason2 === "stock_approval_required") return "This agent needs approval to trade stocks.";
  if (reason2 === "stock_connection_unavailable") return "This agent's wallet connection could not be verified.";
  if (reason2 === "stock_authority_unavailable") return "Stock trading permission could not be checked.";
  if (reason2 === "stock_activation_unavailable") return "This stock is not enabled for trading.";
  if (reason2 === "stock_eligibility_required") return "Stock eligibility approval is required.";
  if (reason2 === "stock_eligibility_unavailable") return "Stock eligibility could not be checked.";
  if (reason2 === "stock_direction_not_permitted") return "This stock permission does not allow this action.";
  return "Available";
}
function holdingCapabilityReason(reason2) {
  if (reason2 === "asset_not_approved") return "Dexter has not approved this asset for the action.";
  if (reason2 === "token_program_mismatch") return "The token program does not match the approved asset.";
  if (reason2 === "account_state_unverified") return "The account state could not be verified.";
  if (reason2 === "unknown") return "The reason is unavailable.";
  return governedActionReason(reason2);
}
function normalizeDexterPortfolio(value, metadata) {
  if (value === null || value === void 0) return { state: "loading" };
  const source = record(unwrapOutput(value));
  if (!source) {
    return {
      state: "invalid",
      title: "Portfolio data unavailable",
      body: "OpenDexter did not return a portfolio that this view can verify."
    };
  }
  if (source.mode === "authentication_required" || source.status === 401 || source.vault_status === "authentication_required") {
    return {
      state: "authentication_required",
      title: "Connect OpenDexter",
      body: "Authorize this session with your passkey, then ask for the portfolio again."
    };
  }
  if (source.mode === "portfolio_read_error" || source.portfolio_status === "read_error") {
    const expired = source.readError === "portfolio_snapshot_expired";
    return {
      state: "read_error",
      title: expired ? "Portfolio read expired" : "Portfolio unavailable",
      expired,
      body: expired ? "Request a fresh summary for a new observation." : safeMessage(source.message) ?? "Dexter could not complete the portfolio read. Retry the same request in a moment."
    };
  }
  if (["opendexter.portfolio.v2", "opendexter.portfolio.v3"].includes(String(record(source.portfolio)?.contractVersion))) {
    const meta = record(metadata ?? record(value)?._meta);
    const read = record(source.portfolio)?.contractVersion === "opendexter.portfolio.v3" ? parseSelectedReadV3(source.portfolio, meta?.portfolioCard) : parseSelectedRead(source.portfolio, meta?.portfolioCard);
    if (source.mode !== "portfolio_ready" || source.portfolio_status !== "ready" || source.user_bound !== true || !read || !exactKeys(source, ["portfolio_status", "mode", "user_bound", "portfolio"]) || new TextEncoder().encode(JSON.stringify(source)).length > (read.selection.view === "summary" ? 2048 : read.selection.view === "detail" ? 8192 : 6144) || meta?.portfolioCard !== void 0 && new TextEncoder().encode(JSON.stringify(meta.portfolioCard)).length > 512 * 1024) {
      return {
        state: "invalid",
        title: "Portfolio data unavailable",
        body: "OpenDexter did not return a portfolio that this view can verify."
      };
    }
    const holdingsSource2 = portfolioHoldingsSource(read);
    return {
      state: "selected",
      read,
      summary: holdingsSource2 ? summarizePortfolio(holdingsSource2) : null,
      coverage: holdingsSource2 ? portfolioCoverage(holdingsSource2) : null
    };
  }
  const snapshot = parseSnapshot(source.portfolio);
  if (source.mode !== "portfolio_ready" || source.portfolio_status !== "ready" || source.user_bound !== true || !snapshot) {
    return {
      state: "invalid",
      title: "Portfolio data unavailable",
      body: "OpenDexter did not return a portfolio that this view can verify."
    };
  }
  return {
    state: "ready",
    snapshot,
    summary: summarizePortfolio(snapshot),
    isEmpty: snapshot.holdingsComplete && snapshot.holdings.length === 0,
    isPartial: !snapshot.holdingsComplete || snapshot.omittedHoldings > 0 || snapshot.unpricedHoldings > 0,
    coverage: portfolioCoverage(snapshot)
  };
}
function shortenIdentity(value, leading = 7, trailing = 7) {
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}
function sentenceCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replace(/-/g, " ")}`;
}
function formatObservedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(void 0, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
function formatCount(value, singular, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}
function readableList(values) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
function holdingActionText(actions) {
  if (actions.length === 0) return "No actions are listed for this asset.";
  const names = actions.map((action) => action.replace(/-/g, " "));
  const subject = readableList(names);
  return `${sentenceCase(subject)} ${actions.length === 1 ? "is" : "are"} available.`;
}
function holdingStateText(holding) {
  const approval = `${sentenceCase(holding.approvalStatus)} asset`;
  if (holding.accountState === "initialized") return `${approval}.`;
  if (holding.accountState === "frozen") return `${approval}; account frozen.`;
  return `${approval}; account state unknown.`;
}
function enrichmentText(enrichment) {
  return `Enrichment: pricing ${enrichment.pricing}; metadata ${enrichment.metadata}; token extensions ${enrichment.tokenExtensions}.`;
}
function HoldingContext({ holding, section = "all" }) {
  const market = holding.marketContext;
  const registry = holding.registryIdentity;
  const unavailable = /* @__PURE__ */ new Map();
  for (const capability of holding.capabilities) {
    if (!capability.available && capability.reasonCode) {
      unavailable.set(capability.reasonCode, [...unavailable.get(capability.reasonCode) ?? [], capability.action]);
    }
  }
  const priceSource = holding.priceSource === "jupiter-price-v3" ? "Jupiter Price V3" : holding.priceSource === "jupiter-exact-in-quote" ? "Jupiter ExactIn valuation quote" : "Unknown";
  const marketMetrics = market ? [
    market.liquidityUsd === null ? null : `Liquidity: ${formatExactUsd(market.liquidityUsd)}`,
    market.holderCount === null ? null : `holders: ${market.holderCount.toLocaleString()}`,
    market.activity24h.traderCount === null ? null : `traders (24h): ${market.activity24h.traderCount.toLocaleString()}`
  ].filter((metric) => metric !== null).join("; ") : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    section !== "overview" && market ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      marketMetrics ? `${marketMetrics}. ` : "",
      "Jupiter Tokens V2, observed ",
      formatObservedAt(market.observedAt),
      "."
    ] }) : null,
    section !== "market" && registry && (registry.providerName !== null || registry.legalIssuerName !== null) ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      "Dexter registry:",
      registry.providerName !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " provider ",
        registry.providerName,
        "."
      ] }) : null,
      registry.legalIssuerName !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " Legal issuer: ",
        registry.legalIssuerName,
        "."
      ] }) : null
    ] }) : null,
    section !== "overview" && (holding.priceSource !== null || holding.priceObservedAt !== null || holding.priceBlockId !== null) ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      "Price source: ",
      priceSource,
      ".",
      holding.priceObservedAt !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " Observed ",
        formatObservedAt(holding.priceObservedAt),
        "."
      ] }) : null,
      holding.priceBlockId !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " Block: ",
        holding.priceBlockId.toLocaleString(),
        "."
      ] }) : null
    ] }) : null,
    section !== "overview" && holding.metadataObservedAt !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      "Metadata observed ",
      formatObservedAt(holding.metadataObservedAt),
      "."
    ] }) : null,
    section !== "market" && [...unavailable].map(([reason2, actions]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
      sentenceCase(readableList(actions)),
      ": ",
      holdingCapabilityReason(reason2)
    ] }, reason2))
  ] });
}
function unavailableActionText(action) {
  const name = sentenceCase(action.action);
  if (action.reason?.startsWith("stock_")) {
    return `${name} is unavailable. ${governedActionReason(action.reason)}`;
  }
  if (action.reason === "protected_agent_send_sdk_required") {
    return "Sending is unavailable through this connection.";
  }
  if (action.reason === "governed_asset_action_not_supported") {
    return `${name} is unavailable for this asset.`;
  }
  return `${name} is currently unavailable for this asset.`;
}
function targetActionText(target) {
  const available = target.actions.filter((action) => action.available).map((action) => action.action);
  const unavailable = target.actions.filter((action) => !action.available).map(unavailableActionText);
  const sentences = [];
  if (available.length > 0) {
    const names = readableList(available.map((action) => action.replace(/-/g, " ")));
    sentences.push(`${sentenceCase(names)} ${available.length === 1 ? "is" : "are"} available.`);
  } else {
    sentences.push("No actions are currently available.");
  }
  return [...sentences, ...unavailable].join(" ");
}
function WalletLockup() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-lockup", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, { width: 132 }) });
}
function summaryDisplayValue(model) {
  const value = model.snapshot.portfolioValueUsd ?? (model.snapshot.pricedHoldings > 0 ? model.snapshot.pricedValueUsd : null);
  return value === null ? null : formatDisplayUsd(value);
}
const ASSET_WORDMARKS = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  solana: "Solana"
};
function displayAssetLabel(assetId2, assetClass2) {
  if (!assetId2) return sentenceCase(assetClass2);
  return assetId2.split(/[-_]+/u).filter(Boolean).map((part) => ASSET_WORDMARKS[part] ?? (part.length <= 5 ? part.toUpperCase() : sentenceCase(part))).join(" ");
}
function InlineHolding({ holding }) {
  const name = holding.symbol ?? holding.name ?? displayAssetLabel(holding.assetId, holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-inline-holding", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-inline-holding__name", title: holding.name ?? holding.assetId ?? holding.mint, children: name }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-inline-holding__amount", children: formatExactDecimal(holding.displayAmount) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: holding.valueUsd === null ? "dxp-value-unknown" : void 0, children: holding.valueUsd === null ? "Unpriced" : formatDisplayUsd(holding.valueUsd) })
  ] });
}
function InlinePortfolio({
  model,
  onExpand,
  condensed,
  triggerRef
}) {
  const displayValue = summaryDisplayValue(model);
  const exactValue = model.summary.value ?? "Unknown";
  const visibleHoldings = condensed ? [] : model.snapshot.holdings.slice(0, 2);
  const hiddenCount = Math.max(0, model.snapshot.holdings.length - visibleHoldings.length);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dxp-inline", "aria-labelledby": "dxp-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dxp-inline__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(WalletLockup, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Solana · ",
        formatObservedAt(model.snapshot.observedAt)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-inline__summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-title", children: model.summary.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "strong",
          {
            className: displayValue === null ? "dxp-unknown" : void 0,
            "aria-label": `${model.summary.label}: ${exactValue}`,
            title: `${model.summary.label}: ${exactValue}`,
            children: displayValue ?? "Unknown"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        formatCount(model.snapshot.holdings.length, "asset"),
        model.snapshot.unpricedHoldings > 0 ? ` · ${formatCount(model.snapshot.unpricedHoldings, "unpriced asset")}` : model.isPartial ? " · partial read" : " · current snapshot"
      ] })
    ] }),
    visibleHoldings.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-inline-holdings", children: visibleHoldings.map((holding) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineHolding,
      {
        holding
      },
      `${holding.tokenProgram}:${holding.tokenAccount ?? holding.mint}`
    )) }) : !condensed ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-inline__empty", children: model.isEmpty ? "No assets held." : "No holdings returned in this snapshot." }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-inline__footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: hiddenCount > 0 ? visibleHoldings.length > 0 ? `${formatCount(hiddenCount, "more asset")} in the full view` : `${formatCount(hiddenCount, "asset")} in the full view` : model.coverage ?? "Session-bound · read only" }),
      onExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { ref: triggerRef, type: "button", onClick: onExpand, children: "View portfolio" }) : null
    ] })
  ] });
}
function InlineBrowserItem({ item, detailSection, walletAddress }) {
  if (item.kind === "target") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-browser-item", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__identity", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: item.target.symbol }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          item.target.name,
          " · available to discover"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { "aria-label": `Asset identifier ${item.target.assetId}`, children: item.target.assetId }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: targetActionText(item.target) })
    ] });
  }
  const { holding } = item;
  const name = holding.name ?? holding.symbol ?? displayAssetLabel(holding.assetId, holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-browser-item", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__identity", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
        name,
        holding.symbol && holding.symbol !== name ? ` (${holding.symbol})` : ""
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holdingStateText(holding) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__values", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
        formatExactDecimal(holding.displayAmount),
        holding.symbol ? ` ${holding.symbol}` : ""
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.valueUsd === null ? "Unpriced" : formatExactUsd(holding.valueUsd) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__description dxp-detail-panel", "data-detail-section": detailSection ?? "all", children: [
      !detailSection || detailSection === "overview" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        holdingActionText(holding.availableActions),
        /* @__PURE__ */ jsxRuntimeExports.jsx(HoldingContext, { holding, section: "overview" })
      ] }) : null,
      !detailSection || detailSection === "market" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        holding.priceUsd === null ? "Price unavailable." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          "Price per unit: ",
          formatExactUsd(holding.priceUsd),
          "."
        ] }),
        holding.change24hPercent !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          " 24h price change: ",
          formatPriceChangePercent(holding.change24hPercent),
          "."
        ] }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx(HoldingContext, { holding, section: "market" })
      ] }) : null,
      !detailSection || detailSection === "identity" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__codes", children: [
        holding.assetId ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Asset identifier: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.assetId })
        ] }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Mint ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { "aria-label": `Mint ${holding.mint}`, children: holding.mint })
        ] }),
        holding.tokenAccount ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Token account ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.tokenAccount })
        ] }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Raw amount: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.amountRaw }),
          ". Decimals: ",
          holding.decimals,
          ". Token program: ",
          holding.tokenProgram,
          "."
        ] }),
        holding.displayMultiplier !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Display multiplier: ",
          formatExactDecimal(holding.displayMultiplier),
          "."
        ] }) : null,
        walletAddress ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "Wallet ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: walletAddress })
        ] }) : null
      ] }) : null
    ] })
  ] });
}
function InlinePortfolioBrowser({
  model,
  condensed,
  detailRef,
  onClose
}) {
  const items = reactExports.useMemo(() => [
    ...model.snapshot.holdings.map((holding) => ({ kind: "holding", holding })),
    ...model.snapshot.approvedActionTargets.map((target) => ({ kind: "target", target }))
  ], [model]);
  const pageSize = condensed ? 1 : 2;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = reactExports.useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visibleItems = items.slice(start, start + pageSize);
  const end = start + visibleItems.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "article",
    {
      className: `dxp-browser${condensed ? " dxp-browser--condensed" : ""}`,
      "aria-labelledby": "dxp-browser-title",
      ref: detailRef,
      tabIndex: -1,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dxp-browser__header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(WalletLockup, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, children: "Back" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser__intro", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-browser-title", children: "Solana portfolio details" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: items.length === 0 ? "No held or discoverable assets in this snapshot." : `${start + 1}–${end} of ${items.length} held and discoverable assets` })
        ] }),
        visibleItems.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-browser__items", children: visibleItems.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          InlineBrowserItem,
          {
            item
          },
          item.kind === "holding" ? `holding:${item.holding.tokenProgram}:${item.holding.tokenAccount ?? item.holding.mint}` : `target:${item.target.assetId}`
        )) }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "dxp-browser__footer", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
            "Wallet ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: model.snapshot.walletAddress }),
            " · observed",
            " ",
            formatObservedAt(model.snapshot.observedAt),
            model.snapshot.enrichment ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
              enrichmentText(model.snapshot.enrichment)
            ] }) : null
          ] }),
          pageCount > 1 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { "aria-label": "Portfolio detail pages", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                disabled: safePage === 0,
                onClick: () => setPage((current) => Math.max(0, current - 1)),
                children: "Previous"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { "aria-live": "polite", children: [
              "Page ",
              safePage + 1,
              " of ",
              pageCount
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                disabled: safePage === pageCount - 1,
                onClick: () => setPage((current) => Math.min(pageCount - 1, current + 1)),
                children: "Next"
              }
            )
          ] }) : null
        ] })
      ]
    }
  );
}
function HoldingRow({ holding }) {
  const identity2 = holding.symbol ?? holding.name ?? holding.assetId ?? shortenIdentity(holding.mint);
  const unit = holding.symbol ?? holding.assetId ?? sentenceCase(holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-holding", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-holding__identity", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: holding.assetId ?? holding.mint, children: identity2 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        holding.name ? `${holding.name}. ` : "",
        sentenceCase(holding.assetClass),
        ". ",
        holdingStateText(holding)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-holding__amount", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: formatExactDecimal(holding.displayAmount) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: unit })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-holding__value", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: holding.valueUsd === null ? "dxp-value-unknown" : void 0, children: holding.valueUsd === null ? "Unpriced" : formatExactUsd(holding.valueUsd) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.priceUsd === null ? "No current price" : `${formatExactUsd(holding.priceUsd)} per unit` }),
      holding.change24hPercent !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "24h price change: ",
        formatPriceChangePercent(holding.change24hPercent)
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-holding__details", children: [
      holdingActionText(holding.availableActions),
      holding.displayMultiplier !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " Display multiplier: ",
        formatExactDecimal(holding.displayMultiplier),
        "."
      ] }) : null,
      holding.assetId ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " Asset identifier: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.assetId }),
        "."
      ] }) : null,
      " ",
      "Mint ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.mint }),
      ".",
      /* @__PURE__ */ jsxRuntimeExports.jsx(HoldingContext, { holding })
    ] })
  ] });
}
function Holdings({ model }) {
  const { snapshot } = model;
  if (snapshot.holdings.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-section dxp-empty", "aria-labelledby": "dxp-assets-title", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "dxp-assets-title", children: model.isEmpty ? "No assets held" : "No assets returned" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        model.isEmpty ? "This complete portfolio snapshot contains no holdings." : "This incomplete portfolio snapshot did not return any holdings.",
        snapshot.approvedActionTargets.length > 0 ? " Assets available for discovery appear below." : ""
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-section", "aria-labelledby": "dxp-assets-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "dxp-assets-title", children: model.isPartial ? `${formatCount(snapshot.holdings.length, "asset")} shown` : `${formatCount(snapshot.holdings.length, "asset")} held` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-section__note", children: "Actions describe each asset rail. Prepare verifies current authority." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-holdings", children: snapshot.holdings.map((holding) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      HoldingRow,
      {
        holding
      },
      `${holding.tokenProgram}:${holding.tokenAccount ?? holding.mint}`
    )) })
  ] });
}
function TargetRow({ target, showHoldingState = true }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-target", "data-discovery-context": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-target__title", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: target.symbol }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: target.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: target.assetId, children: target.assetId }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: targetActionText(target) }),
    showHoldingState ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-target__holding-state", children: "Not held" }) : null
  ] });
}
function ApprovedTargets({ targets }) {
  if (targets.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-section dxp-targets", "aria-labelledby": "dxp-targets-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "dxp-targets-title", children: "Available to discover" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-targets__note", children: "These assets are discovery context. Holdings, balances, and authority remain separate. Prepare checks current authority before any action." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-target-list", children: targets.map((target) => /* @__PURE__ */ jsxRuntimeExports.jsx(TargetRow, { target }, target.assetId)) })
  ] });
}
function ReadDetails({ model }) {
  const { snapshot } = model;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "dxp-read-details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
      "Solana wallet ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: snapshot.walletAddress })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
      "Observed ",
      formatObservedAt(snapshot.observedAt),
      snapshot.contextSlot === null ? "." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        " at Solana slot ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: snapshot.contextSlot.toLocaleString() }),
        "."
      ] })
    ] }),
    snapshot.enrichment ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: enrichmentText(snapshot.enrichment) }) : null
  ] });
}
function ReadyLedger({
  model,
  onClose
}) {
  const { summary } = model;
  const displayValue = summaryDisplayValue(model);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dxp-ledger", "aria-labelledby": "dxp-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dxp-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(WalletLockup, {}),
      onClose ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, children: "Close" }) : null
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-hero", "aria-label": "Portfolio summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-title", children: summary.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "strong",
        {
          className: summary.value === null ? "dxp-unknown" : void 0,
          "aria-label": `${summary.label}: ${summary.value ?? "Unknown"}`,
          title: `${summary.label}: ${summary.value ?? "Unknown"}`,
          children: displayValue ?? "Unknown"
        }
      ),
      model.coverage ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-coverage", role: "status", children: model.coverage }) : null
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Holdings, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ApprovedTargets, { targets: model.snapshot.approvedActionTargets }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ReadDetails, { model })
  ] });
}
function LoadingLedger({ compact }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "article",
    {
      className: `dxp-ledger dxp-ledger--loading${compact ? " dxp-ledger--compact-state" : ""}`,
      "aria-busy": "true",
      "aria-label": "Loading portfolio",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "dxp-header", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WalletLockup, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-hero", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Portfolio value" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-skeleton dxp-skeleton--value" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-skeleton dxp-skeleton--line" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-skeleton dxp-skeleton--asset" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-visually-hidden", children: "Loading the current portfolio." })
      ]
    }
  );
}
function StateLedger({ model, compact }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "article",
    {
      className: `dxp-ledger dxp-ledger--state${compact ? " dxp-ledger--compact-state" : ""}`,
      "aria-labelledby": "dxp-state-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "dxp-header", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WalletLockup, {}) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-state", role: model.state === "authentication_required" ? "status" : "alert", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-state-title", children: model.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: model.body })
        ] })
      ]
    }
  );
}
function holdingKey(holding) {
  return `${holding.mint}:${holding.tokenAccount ?? ""}`;
}
function holdingLabel(holding) {
  return holding.symbol ?? holding.name ?? "Unidentified asset";
}
function holdingDetailLabel(holding) {
  return `View details for ${holdingLabel(holding)}${holding.symbol && holding.name && holding.symbol !== holding.name ? ` (${holding.name})` : ""}`;
}
function readDate(value) {
  return new Intl.DateTimeFormat(void 0, { dateStyle: "medium", timeStyle: "long" }).format(new Date(value));
}
function SelectedMoney({ value }) {
  if (value === null) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-selected-money dxp-selected-money--unknown", children: "Value unavailable" });
  const text = formatPortfolioMoney(value);
  const parts = text.match(/^\$([\d,]+)(\.\d{2})$/u);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-selected-money", "data-testid": "portfolio-value", children: parts ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-selected-money__currency", children: "$" }),
    parts[1],
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-selected-money__cents", children: parts[2] })
  ] }) : text });
}
function SelectedChange({ value }) {
  const tone = value === null || value === "0" ? "" : value.startsWith("-") ? " negative" : " positive";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `dxp-selected-change${tone}`, children: value === null ? "24h change unavailable" : `24h price ${formatPriceChangePercent(value)}` });
}
function Fact({ label: label2, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: label2 }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: children ?? "Unavailable" })
  ] });
}
function SelectedActionFacts({ holding, target, onExpand }) {
  const available = (holding?.availableActions ?? target?.actions.filter((item) => item.available).map((item) => item.action) ?? []).filter((action) => action !== "view");
  const unavailable = /* @__PURE__ */ new Map();
  const records = holding ? holding.capabilities.map((item) => ({
    action: item.action,
    available: item.available,
    reason: item.reasonCode
  })) : target?.actions ?? [];
  for (const item of records) {
    if (item.available || item.action === "view") continue;
    const code = item.reason ?? "unknown";
    const group = unavailable.get(code) ?? { actions: [], explanation: holdingCapabilityReason(code) };
    group.actions.push(sentenceCase(item.action));
    unavailable.set(code, group);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-selected-actions", "aria-label": "Action availability", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Actions" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: available.length > 0 ? `${readableList(available.map(sentenceCase))} available.` : "No actions are currently available." }),
    unavailable.size > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", onToggle: (event) => {
      if (event.currentTarget.open) onExpand();
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Unavailable actions" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dxp-selected-facts dxp-selected-facts--reasons", children: [...unavailable].map(([code, group]) => /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: readableList(group.actions), children: group.explanation }, code)) })
    ] }) : null
  ] });
}
function holdingIdentityLabel(identity2) {
  if (identity2.state === "native") return "Native SOL";
  if (identity2.state === "unreviewed") return "Identity has not been reviewed";
  if (identity2.state === "unavailable") return "Identity verification unavailable";
  return identity2.registryState === "retired" ? "Verified identity; registry entry retired" : "Verified identity";
}
function holdingIdentityReason(identity2) {
  const reasons = {
    source_unavailable: "The identity source is unavailable.",
    read_inconsistent: "The identity records could not be read consistently.",
    token_identity_mismatch: "The token does not match its identity record.",
    release_missing: "The identity release is unavailable.",
    lineage_invalid: "The identity release history could not be verified.",
    conflicting_material: "The identity records disagree.",
    registry_digest_mismatch: "The registry identity could not be verified."
  };
  return reasons[identity2.reason];
}
function SelectedHoldingDetail({ holding, read, onExpand }) {
  const market = holding.marketContext;
  const registry = holding.registryIdentity;
  const metrics = [market?.liquidityUsd ?? null, market?.holderCount ?? null, market?.activity24h.traderCount ?? null];
  const knownMetrics = metrics.filter((value) => value !== null).length;
  const program = holding.tokenProgram === "native" ? "Native SOL" : holding.tokenProgram === "token-2022" ? "Token-2022" : "SPL Token";
  const priceSource = holding.priceSource === "jupiter-price-v3" ? "Jupiter Price V3" : holding.priceSource === "jupiter-exact-in-quote" ? "Jupiter ExactIn quote" : "Unavailable";
  const openDisclosure = (event) => {
    if (event.currentTarget.open) onExpand();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-selected-title", tabIndex: -1, children: holding.name ?? holdingLabel(holding) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-selected-detail-value", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedMoney, { value: holding.valueUsd }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: holding.amountModel === "unknown" ? "Amount unavailable" : `${formatPortfolioQuantity(holding.displayAmount)}${holding.symbol ? ` ${holding.symbol}` : ""} held` }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedChange, { value: holding.change24hPercent })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-selected-market", "aria-label": "Market data", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Market data" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token price", children: holding.priceUsd === null ? null : formatPortfolioPrice(holding.priceUsd) }),
        market?.liquidityUsd !== null && market?.liquidityUsd !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Liquidity", children: formatPortfolioMoney(market.liquidityUsd) }) : null,
        market?.holderCount !== null && market?.holderCount !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Holders", children: market.holderCount.toLocaleString() }) : null,
        market?.activity24h.traderCount !== null && market?.activity24h.traderCount !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Traders in 24h", children: market.activity24h.traderCount.toLocaleString() }) : null
      ] }),
      market && holding.mint === "native:SOL" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: "Liquidity, holders and traders refer to wrapped SOL." }) : null,
      knownMetrics < 3 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: knownMetrics === 0 ? "Liquidity, holder counts and trading activity are unavailable." : "Some market data is unavailable." }) : null
    ] }),
    registry && (registry.providerName !== null || registry.legalIssuerName !== null) ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-selected-registry", "aria-label": "Registry identity", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Registry identity" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts", children: [
        registry.providerName !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Provider", children: registry.providerName }) : null,
        registry.legalIssuerName !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Legal issuer", children: registry.legalIssuerName }) : null
      ] })
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", "data-testid": "exact-balance", onToggle: openDisclosure, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Exact balance" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts dxp-selected-facts--exact", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: holding.symbol ? `Amount (${holding.symbol})` : "Amount", children: holding.amountModel === "unknown" ? "Unavailable" : formatExactDecimal(holding.displayAmount) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Holding value (USD)", children: holding.valueUsd === null ? null : formatExactUsd(holding.valueUsd) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token price (USD)", children: holding.priceUsd === null ? null : formatExactUsd(holding.priceUsd) }),
        holding.amountModel === "scaled-ui-amount" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Display multiplier", children: holding.displayMultiplier }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", "data-testid": "asset-diagnostics", onToggle: openDisclosure, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Identity and data sources" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts dxp-selected-facts--diagnostics", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Asset class", children: sentenceCase(holding.assetClass) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token program", children: program }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Mint", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.mint }) }),
        holding.tokenAccount !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token account", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.tokenAccount }) }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Wallet", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: read.walletAddress }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Account state", children: sentenceCase(holding.accountState) }),
        "identity" in holding ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Asset identity", children: holdingIdentityLabel(holding.identity) }),
          holding.identity.state === "unavailable" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Identity availability", children: holdingIdentityReason(holding.identity) }) : null,
          holding.identity.state === "recognized" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Identity source", children: holding.identity.source === "static_registry" ? "Dexter asset definitions" : "Released asset catalog" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Registry status", children: holding.identity.registryState === "not_observed" ? "Not observed" : sentenceCase(holding.identity.registryState) }),
            holding.identity.source === "released_catalog" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Identity observed at", children: readDate(holding.identity.observedAt) }) : null
          ] }) : null
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Asset review", children: sentenceCase(holding.approvalStatus) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Amount display", children: holding.amountModel === "scaled-ui-amount" ? "Scaled token amount" : holding.amountModel === "raw-decimals" ? "Token decimals" : "Unavailable" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Raw amount", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.amountRaw }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Decimals", children: holding.decimals }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Display multiplier", children: holding.tokenProgram === "native" ? "Not applicable to native SOL" : holding.amountModel === "raw-decimals" ? "Not applied" : holding.displayMultiplier }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Market source", children: market ? "Jupiter Tokens V2" : null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Market mint", children: market ? /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: market.mint }) : null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Liquidity (USD)", children: market?.liquidityUsd === null || market?.liquidityUsd === void 0 ? null : formatExactUsd(market.liquidityUsd) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Holders", children: market?.holderCount?.toLocaleString() ?? null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Traders in 24h", children: market?.activity24h.traderCount?.toLocaleString() ?? null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Market observed at", children: market ? readDate(market.observedAt) : null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Price source", children: priceSource }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Price observed at", children: holding.priceObservedAt === null ? null : readDate(holding.priceObservedAt) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Price block", children: holding.priceBlockId?.toLocaleString() ?? null }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Metadata observed at", children: holding.metadataObservedAt === null ? null : readDate(holding.metadataObservedAt) }),
        registry ? /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Registry identity source", children: "identity" in holding ? "Dexter asset registry" : "Dexter approved asset registry" }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Portfolio observed at", children: readDate(read.observedAt) })
      ] }),
      "identity" in holding && holding.identity.state === "recognized" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", onToggle: openDisclosure, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Identity verification details" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts dxp-selected-facts--diagnostics", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Registry identity digest", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.identity.material.registryIdentityDigest }) }),
          holding.identity.source === "released_catalog" ? Object.entries(holding.identity.provenance).map(([key, value]) => /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: sentenceCase(key.replace(/([A-Z])/g, " $1")), children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: value }) }, key)) : null
        ] })
      ] }) : null
    ] }),
    "identity" in holding ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dxp-selected-actions", "aria-label": "Trading availability", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Trading availability" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Trading availability has not been checked. Explore assets to check available actions." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedActionFacts, { holding, onExpand })
  ] });
}
function SelectedPortfolio({ model, condensed, maxHeight, isFullscreen, onExpand, onClose }) {
  const callTool = useAdaptiveCallToolFn();
  const capabilities = useAdaptiveHostCapabilities();
  const owner = reactExports.useRef(model);
  owner.current = model;
  const requestId = reactExports.useRef(0);
  const mounted = reactExports.useRef(true);
  const scrollRef = reactExports.useRef(null);
  const [stored, setStored] = reactExports.useState(null);
  const [pending, setPending] = reactExports.useState(null);
  const [clockTick, setClockTick] = reactExports.useState(0);
  const initialCollection = reactExports.useMemo(() => accumulatePortfolioRows(null, model.read), [model]);
  const session = stored?.owner === model ? stored : {
    owner: model,
    screen: { model, collection: initialCollection, target: null, scrollTop: 0, focusKey: null },
    history: [],
    problem: null,
    restore: false
  };
  const { screen, problem } = session;
  const { read } = screen.model;
  const source = portfolioHoldingsSource(read);
  const selection = read.selection;
  const busy = pending === model;
  const expired = Date.now() >= Date.parse(read.expiresAt) || Boolean(problem && "expired" in problem && problem.expired);
  const locked = problem !== null || expired;
  const isDetail = screen.target === null && selection.view === "detail" && selection.match === "matched";
  const isTargets = screen.target === null && selection.view === "targets";
  const isHoldings = !isDetail && !isTargets && screen.target === null;
  const displayValue = source ? source.portfolioValueUsd ?? (source.pricedHoldings > 0 ? source.pricedValueUsd : null) : null;
  const expand = () => onExpand?.();
  reactExports.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, []);
  reactExports.useEffect(() => {
    const remaining = Date.parse(read.expiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setClockTick((value) => value + 1), Math.min(remaining + 1, 2147483647));
    return () => window.clearTimeout(timer);
  }, [read.expiresAt, clockTick]);
  reactExports.useEffect(() => {
    if (stored?.owner !== model) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      if (stored.restore) {
        container.scrollTop = stored.screen.scrollTop;
        const element = [...container.querySelectorAll("[data-holding-key]")].find((item) => item.dataset.holdingKey === stored.screen.focusKey);
        element?.focus({ preventScroll: true });
      } else {
        container.scrollTop = 0;
        container.querySelector("h1")?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [stored, model]);
  const captureScreen = (focusKey = null) => ({
    ...screen,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
    focusKey
  });
  const request = async (view2, holding) => {
    if (!capabilities.callTool || busy || locked && view2 !== "refresh") return;
    if (view2 !== "refresh" && Date.now() >= Date.parse(read.expiresAt)) {
      setClockTick((value) => value + 1);
      return;
    }
    const requestOwner = model;
    const id = ++requestId.current;
    const args = view2 === "refresh" ? { view: "summary", network: read.network, readVersion: 3 } : portfolioReadRequest(read, view2, holding);
    const savedScreen = captureScreen(holding ? holdingKey(holding) : null);
    if (view2 === "detail" || view2 === "holdings" || view2 === "next") expand();
    setPending(requestOwner);
    let next;
    try {
      const result = await callTool("dexter_wallet_portfolio", args);
      next = normalizeDexterPortfolio(result);
      if (next.state === "selected" && (result.isError || (view2 === "refresh" ? next.read.contractVersion !== "opendexter.portfolio.v3" || next.read.selection.view !== "summary" || next.read.walletAddress !== read.walletAddress || next.read.network !== read.network : !portfolioReadMatchesRequest(read, next.read, args)))) {
        next = { state: "invalid", title: "Portfolio data unavailable", body: "The response did not match this portfolio request." };
      }
      if (next.state === "ready" || next.state === "loading") {
        next = { state: "invalid", title: "Portfolio data unavailable", body: "The response did not match this portfolio request." };
      }
    } catch {
      next = { state: "read_error", title: "Portfolio unavailable", body: "The portfolio request could not be completed. Refresh to try again." };
    }
    if (!mounted.current || owner.current !== requestOwner || requestId.current !== id) return;
    setPending(null);
    if (next.state !== "selected") {
      setStored({ ...session, owner: model, problem: next, restore: true });
      return;
    }
    const append = view2 === "next" || view2 === "holdings" && selection.view === "summary";
    const collection = accumulatePortfolioRows(append ? screen.collection : null, next.read);
    if (!collection) {
      setStored({ ...session, owner: model, problem: { state: "invalid", title: "Portfolio data unavailable", body: "The response did not match the holdings already displayed." }, restore: true });
      return;
    }
    setStored({
      owner: model,
      screen: { model: next, collection, target: null, scrollTop: append ? savedScreen.scrollTop : 0, focusKey: null },
      history: view2 === "refresh" || view2 === "summary" ? [] : append ? session.history : [...session.history, savedScreen],
      problem: null,
      restore: append
    });
  };
  const back = () => {
    if (busy) return;
    const previous = session.history.at(-1);
    if (previous) setStored({ ...session, screen: previous, history: session.history.slice(0, -1), problem: null, restore: true });
    else void request("summary");
  };
  const openTarget = (target) => {
    if (busy || locked) return;
    expand();
    setStored({
      ...session,
      screen: { ...screen, target, scrollTop: 0, focusKey: null },
      history: [...session.history, captureScreen(target.assetId)],
      restore: false
    });
  };
  const holdingSnapshotId = read.contractVersion === "opendexter.portfolio.v3" && read.source.kind === "action_targets" ? read.source.holdingSnapshotId : read.snapshotId;
  const holdingScreens = [screen, ...session.history].filter((item) => item.model.read.snapshotId === holdingSnapshotId && item.model.read.walletAddress === read.walletAddress && item.model.read.network === read.network && portfolioHoldingsSource(item.model.read) !== null);
  const loadedHoldings = holdingScreens.flatMap((item) => item.collection.holdings);
  const correlatedSource = holdingScreens.length ? portfolioHoldingsSource(holdingScreens[0].model.read) : null;
  const allObservedLoaded = correlatedSource?.holdingsComplete && new Set(loadedHoldings.map((item) => holdingKey(item.holding))).size === correlatedSource.holdingCount;
  const heldLabel = (mint2) => loadedHoldings.some((item) => item.holding.mint === mint2) ? read.contractVersion === "opendexter.portfolio.v3" ? "Held in portfolio observation" : "Held" : allObservedLoaded ? read.contractVersion === "opendexter.portfolio.v3" ? "Not held in portfolio observation" : "Not held" : null;
  const hasMore = selection.nextCursor !== null || selection.view === "summary" && source !== null && source.holdingCount > screen.collection.holdings.length;
  const narrowedSelection = selection.match === "ambiguous" || selection.query !== null || selection.mint !== null;
  const listedCount = isTargets ? screen.collection.targets.length : screen.collection.holdings.length;
  const collectionCount = isTargets || narrowedSelection ? selection.matchedCount : source?.holdingCount ?? null;
  const coverage = source ? [
    source.omittedHoldings > 0 ? `${formatCount(source.omittedHoldings, "holding")} could not be included.` : !source.holdingsComplete ? "Some holdings could not be read." : null,
    source.unpricedHoldings > 0 ? `Prices are unavailable for ${formatCount(source.unpricedHoldings, "asset")}.` : null
  ].filter(Boolean).join(" ") : "";
  const title = screen.target ? screen.target.name : isTargets ? "Explore assets" : selection.match === "ambiguous" ? "Choose an asset" : narrowedSelection ? "Matching holdings" : locked ? "Last observed value" : screen.model.summary?.label === "Priced subtotal" ? "Priced subtotal" : "Portfolio value";
  const detailedHolding = isDetail ? read.richHoldings[0] : null;
  const backLabel = session.history.at(-1)?.model.read.selection.view === "targets" ? "Back to Explore assets" : session.history.length === 0 && read.contractVersion === "opendexter.portfolio.v3" && read.source.kind === "action_targets" ? "Read current portfolio" : "Back to portfolio";
  if (problem?.state === "authentication_required") return /* @__PURE__ */ jsxRuntimeExports.jsx(StateLedger, { model: problem, compact: condensed });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "article",
    {
      ref: scrollRef,
      className: `dxp-selected${condensed ? " dxp-selected--condensed" : ""}`,
      "data-testid": "portfolio-selected",
      "data-view": screen.target ? "target" : selection.view,
      "data-expired": expired ? "true" : void 0,
      style: { maxHeight: maxHeight ?? (isFullscreen ? "100dvh" : void 0) },
      "aria-labelledby": "dxp-selected-title",
      "aria-busy": busy,
      tabIndex: -1,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dxp-selected-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Lockup, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Solana" }),
          isFullscreen && onClose ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClose, children: "Close" }) : onExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onExpand, children: "Expand" }) : null
        ] }),
        session.history.length > 0 || isDetail || isTargets || screen.target !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            className: "dxp-selected-back",
            "data-testid": "portfolio-back",
            type: "button",
            disabled: busy || session.history.length === 0 && (locked || !capabilities.callTool),
            onClick: back,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-selected-chevron dxp-selected-chevron--back", "aria-hidden": "true" }),
              backLabel
            ]
          }
        ) : null,
        problem || expired ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-selected-problem", role: "alert", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: problem?.body ?? `This observation expired on ${readDate(read.expiresAt)}. Refresh to read your portfolio again.` }),
          capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "dxp-selected-refresh", "data-testid": "portfolio-refresh", onClick: () => void request("refresh"), disabled: busy, children: "Refresh portfolio" }) : null
        ] }) : null,
        screen.target ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-selected-title", tabIndex: -1, children: screen.target.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-selected-note", children: [
            screen.target.symbol,
            heldLabel(screen.target.mint) ? ` · ${heldLabel(screen.target.mint)}` : ""
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedActionFacts, { target: screen.target, onExpand: expand }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", "data-testid": "asset-diagnostics", onToggle: (event) => {
            if (event.currentTarget.open) expand();
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Identity and data sources" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts dxp-selected-facts--diagnostics", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Supported asset", children: screen.target.assetId }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Mint", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: screen.target.mint }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token program", children: screen.target.tokenProgram === "token-2022" ? "Token-2022" : "SPL Token" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Observed at", children: readDate(read.observedAt) })
            ] })
          ] })
        ] }) : detailedHolding ? /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedHoldingDetail, { holding: detailedHolding, read, onExpand: expand }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: isTargets ? "dxp-selected-explore" : "dxp-selected-summary", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-selected-title", tabIndex: -1, children: title }),
            isTargets ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Supported assets on Solana. Open an asset to see its available actions." }) : narrowedSelection ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: selection.match === "ambiguous" ? "Select the matching mint and token account." : readDate(read.observedAt) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedMoney, { value: displayValue }),
              source ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-selected-freshness", children: [
                formatCount(source.holdingCount, source.holdingsComplete ? "holding" : "observed holding"),
                " · ",
                readDate(read.observedAt)
              ] }) : null,
              coverage ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: coverage }) : null
            ] }),
            selection.query ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-selected-note", children: [
              "Results for ",
              selection.query
            ] }) : null
          ] }),
          isHoldings ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-selected-list", children: screen.collection.holdings.map(({ holding }) => {
            const row = /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxp-selected-identity", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: holdingLabel(holding) }),
                holding.name && holding.name !== holding.symbol ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.name }) : null,
                holding.identityStatus === "retired" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Registry entry retired" }) : holding.identityStatus === "unreviewed" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Identity unreviewed" }) : holding.identityStatus === "unavailable" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Identity unavailable" }) : null
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxp-selected-values", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: holding.valueUsd === null ? "Unpriced" : formatPortfolioMoney(holding.valueUsd) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.amountModel === "unknown" ? "Amount unavailable" : `${formatPortfolioQuantity(holding.displayAmount)}${holding.symbol ? ` ${holding.symbol}` : ""}` }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedChange, { value: holding.change24hPercent })
              ] }),
              !locked && capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-selected-chevron", "aria-hidden": "true" }) : null
            ] });
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              !locked && capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  className: "dxp-selected-row",
                  "data-testid": "holding-row",
                  "data-holding-key": holdingKey(holding),
                  disabled: busy,
                  "aria-label": holdingDetailLabel(holding),
                  onClick: () => void request("detail", holding),
                  children: row
                }
              ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxp-selected-row", children: row }),
              selection.match === "ambiguous" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-selected-ambiguous", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.mint }),
                holding.tokenAccount ? /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: holding.tokenAccount }) : null
              ] }) : null
            ] }, holdingKey(holding));
          }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxp-selected-list", children: screen.collection.targets.map((target) => {
            const actions = target.actions.filter((item) => item.available).map((item) => sentenceCase(item.action));
            return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                className: "dxp-selected-row",
                "data-testid": "explore-asset",
                "data-holding-key": target.assetId,
                disabled: busy || locked,
                onClick: () => openTarget(target),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxp-selected-identity", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: target.symbol }),
                    target.name !== target.symbol ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: target.name }) : null
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dxp-selected-values dxp-selected-values--target", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: actions.length > 0 ? readableList(actions) : "Actions unavailable" }),
                    heldLabel(target.mint) ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: heldLabel(target.mint) }) : null
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-selected-chevron", "aria-hidden": "true" })
                ]
              }
            ) }, target.assetId);
          }) }),
          selection.match === "none" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: isTargets ? "No supported assets match this request." : source?.holdingCount === 0 && source.holdingsComplete ? "No assets held." : "No matching holdings were found." }) : null,
          selection.match === "unavailable" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: "Supported asset information is unavailable." }) : null,
          collectionCount !== null && listedCount < collectionCount ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-selected-note", "data-testid": "portfolio-list-count", children: [
            "Showing ",
            listedCount.toLocaleString(),
            " of ",
            formatCount(collectionCount, isTargets ? "supported asset" : "holding")
          ] }) : null,
          hasMore && !locked && capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "dxp-selected-more",
              "data-testid": "more-holdings",
              disabled: busy,
              onClick: () => void request(selection.nextCursor ? "next" : "holdings"),
              children: isTargets ? "More assets" : "More holdings"
            }
          ) : null
        ] }),
        busy ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", role: "status", children: "Reading portfolio..." }) : null,
        !locked && !capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxp-selected-note", children: "Ask for holdings or asset details to continue." }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "dxp-selected-footer", children: [
          (isHoldings || isDetail && read.contractVersion === "opendexter.portfolio.v3") && !locked && capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "data-testid": "explore-assets", disabled: busy, onClick: () => void request("targets"), children: "Explore assets" }) : null,
          /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dxp-selected-disclosure", "data-testid": "observation-details", onToggle: (event) => {
            if (event.currentTarget.open) expand();
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Observation details" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dxp-selected-facts dxp-selected-facts--diagnostics", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Observed at", children: readDate(read.observedAt) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Read expires at", children: readDate(read.expiresAt) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Wallet", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: read.walletAddress }) }),
              source ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Observed holdings", children: source.holdingCount.toLocaleString() }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Loaded holdings", children: new Set(loadedHoldings.map((item) => holdingKey(item.holding))).size.toLocaleString() }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Exact portfolio value (USD)", children: source.portfolioValueUsd === null ? null : formatExactUsd(source.portfolioValueUsd) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Exact priced subtotal (USD)", children: formatExactUsd(source.pricedValueUsd) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Inventory", children: source.holdingsComplete ? "Complete" : "Incomplete" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Omitted holdings", children: source.omittedHoldings.toLocaleString() }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Pricing", children: sentenceCase(source.enrichment.pricing) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Asset metadata", children: sentenceCase(source.enrichment.metadata) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Token display data", children: sentenceCase(source.enrichment.tokenExtensions) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Solana slot", children: read.contextSlot?.toLocaleString() ?? null }),
                "identityCoverage" in source ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Recognized identities", children: source.identityCoverage.recognized.toLocaleString() }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Unreviewed identities", children: source.identityCoverage.unreviewed.toLocaleString() }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Identity verification unavailable", children: source.identityCoverage.unavailable.toLocaleString() }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Trading availability", children: "Not checked" })
                ] }) : null
              ] }) : read.contractVersion === "opendexter.portfolio.v3" && read.source.kind === "action_targets" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Supported assets", children: read.source.targetCount?.toLocaleString() ?? null }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Fact, { label: "Holdings observation", children: read.source.holdingSnapshotId ? /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: read.source.holdingSnapshotId }) : "Not linked" })
              ] }) : null
            ] }),
            !locked && capabilities.callTool ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "data-testid": "portfolio-refresh", disabled: busy, onClick: () => void request("refresh"), children: "Refresh portfolio" }) : null
          ] })
        ] })
      ]
    }
  );
}
function PortfolioLedger() {
  const toolOutput = useToolOutput();
  const toolMetadata = useToolResponseMetadata();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight();
  const model = reactExports.useMemo(() => normalizeDexterPortfolio(toolOutput, toolMetadata), [toolOutput, toolMetadata]);
  const [inlineExpanded, setInlineExpanded] = reactExports.useState(false);
  const overviewTriggerRef = reactExports.useRef(null);
  const inlineDetailRef = reactExports.useRef(null);
  const restoreOverviewFocus = reactExports.useRef(false);
  const desiredDisplayMode = reactExports.useRef("inline");
  const displayModeRequestId = reactExports.useRef(0);
  const isFullscreen = displayMode === "fullscreen";
  const condensed = !isFullscreen && maxHeight !== null && maxHeight < 520;
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    if (inlineExpanded) {
      inlineDetailRef.current?.focus();
      return;
    }
    if (!isFullscreen && restoreOverviewFocus.current) {
      overviewTriggerRef.current?.focus();
      restoreOverviewFocus.current = false;
    }
  }, [inlineExpanded, isFullscreen]);
  const requestMode = (mode) => {
    if (!requestDisplayMode) return;
    desiredDisplayMode.current = mode;
    const requestId = ++displayModeRequestId.current;
    const issueRequest = async (requestedMode, activeRequestId) => {
      try {
        await Promise.resolve(requestDisplayMode({ mode: requestedMode }));
      } catch {
        return;
      }
      const desiredMode = desiredDisplayMode.current;
      if (activeRequestId !== displayModeRequestId.current && desiredMode !== requestedMode) {
        const correctionId = ++displayModeRequestId.current;
        await issueRequest(desiredMode, correctionId);
      }
    };
    void issueRequest(mode, requestId);
  };
  const canFullscreen = Boolean(
    requestDisplayMode && hostCapabilities.requestDisplayMode && hostContext.availableDisplayModes.includes("fullscreen")
  );
  const canReturnInline = Boolean(
    requestDisplayMode && hostCapabilities.requestDisplayMode && hostContext.availableDisplayModes.includes("inline")
  );
  const openPortfolio = () => {
    setInlineExpanded(true);
    if (canFullscreen) requestMode("fullscreen");
  };
  const closePortfolio = () => {
    restoreOverviewFocus.current = true;
    setInlineExpanded(false);
    if (canReturnInline) requestMode("inline");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `dxp-root ${isFullscreen ? "dxp-root--fullscreen" : "dxp-root--inline"}${model.state === "selected" ? " dxp-root--selected" : ""}`,
      ref: rootRef,
      "data-theme": theme,
      "data-host-max-height": maxHeight ?? void 0,
      style: isFullscreen ? {
        paddingTop: hostContext.safeAreaInsets.top || void 0,
        paddingRight: hostContext.safeAreaInsets.right || void 0,
        paddingBottom: hostContext.safeAreaInsets.bottom || void 0,
        paddingLeft: hostContext.safeAreaInsets.left || void 0
      } : void 0,
      children: [
        model.state === "loading" ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoadingLedger, { compact: condensed }) : null,
        model.state === "selected" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          SelectedPortfolio,
          {
            model,
            condensed,
            isFullscreen,
            maxHeight: maxHeight === null ? null : Math.max(0, maxHeight - (isFullscreen ? hostContext.safeAreaInsets.top + hostContext.safeAreaInsets.bottom : 0)),
            onExpand: canFullscreen ? () => requestMode("fullscreen") : null,
            onClose: canReturnInline ? () => requestMode("inline") : null
          }
        ) : null,
        model.state === "ready" && !isFullscreen && !inlineExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          InlinePortfolio,
          {
            model,
            onExpand: openPortfolio,
            condensed,
            triggerRef: overviewTriggerRef
          }
        ) : null,
        model.state === "ready" && !isFullscreen && inlineExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          InlinePortfolioBrowser,
          {
            model,
            condensed,
            detailRef: inlineDetailRef,
            onClose: closePortfolio
          }
        ) : null,
        model.state === "ready" && isFullscreen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          ReadyLedger,
          {
            model,
            onClose: closePortfolio
          }
        ) : null,
        model.state !== "loading" && model.state !== "ready" && model.state !== "selected" ? /* @__PURE__ */ jsxRuntimeExports.jsx(StateLedger, { model, compact: condensed }) : null
      ]
    }
  );
}
const root = document.getElementById("dexter-portfolio-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.portfolio-ledger";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PortfolioLedger, {}));
}
