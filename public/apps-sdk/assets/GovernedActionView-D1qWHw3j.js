import { j as jsxRuntimeExports, u as useToolOutput, a as useToolResponseMetadata, b as useAdaptiveTheme, d as useAdaptiveDisplayMode, f as useAdaptiveHostCapabilities, e as useAdaptiveHostContext, g as useAdaptiveRequestDisplayMode, i as useAdaptiveOpenExternal, r as reactExports } from "./adapter--q2j4xTS.js";
import { u as useOpenAIGlobal } from "./use-openai-global-BVDorJ16.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-Dv3mveW-.js";
import { Z as ZodIssueCode, b as bytesToHex, s as sha256, u as utf8ToBytes } from "./sha256-c6WszRQG.js";
import { s as string, c as uuidString, n as number, o as object, l as literal, u as union, i as integer, _ as _enum } from "./zod-contract-primitives-BL_kr6tN.js";
function useToolInput() {
  return useOpenAIGlobal("toolInput");
}
function WidgetShell({
  children,
  style,
  rootRef,
  density = "comfortable",
  width = "auto"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: rootRef,
      className: "dx-widget",
      "data-density": density,
      "data-width": width,
      style,
      children
    }
  );
}
function WidgetEmpty({
  title,
  description,
  action
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state", "data-state": "empty", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-label", children: title }),
      description ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-description", children: description }) : null
    ] }),
    action ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__state-action", children: action }) : null
  ] });
}
function WidgetError({
  title = "Something went wrong",
  description,
  action
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state", "data-state": "error", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-label", children: title }),
      description ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-description", children: description }) : null
    ] }),
    action ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__state-action", children: action }) : null
  ] });
}
const OPEN_MCP_PRM_URL = "https://open.dexter.cash/.well-known/oauth-protected-resource/mcp";
const VAULT_OAUTH = Object.freeze({ type: "oauth2", scopes: Object.freeze(["vault"]) });
const VAULT_OAUTH_SECURITY_SCHEMES = Object.freeze([VAULT_OAUTH]);
function authParam(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function buildVaultWwwAuthenticate({
  error = null,
  errorDescription = null
} = {}) {
  const parameters = [
    `resource_metadata="${OPEN_MCP_PRM_URL}"`,
    'scope="vault"'
  ];
  if (error) parameters.push(`error="${authParam(error)}"`);
  if (error && errorDescription) {
    parameters.push(`error_description="${authParam(errorDescription)}"`);
  }
  return `Bearer ${parameters.join(", ")}`;
}
buildVaultWwwAuthenticate();
const GOVERNED_ASSET_TOOL_NAMES = Object.freeze({
  prepare: "dexter_prepare_asset_action",
  execute: "dexter_execute_asset_action",
  status: "dexter_asset_action_status",
  reconcile: "dexter_reconcile_asset_action",
  history: "dexter_wallet_history",
  // Owner approval is deliberately not model-callable. It remains on the
  // separately authenticated owner ceremony surface in dexter-api.
  authorize: "dexter_authorize_asset_action"
});
Object.freeze([
  GOVERNED_ASSET_TOOL_NAMES.prepare,
  GOVERNED_ASSET_TOOL_NAMES.execute,
  GOVERNED_ASSET_TOOL_NAMES.status,
  GOVERNED_ASSET_TOOL_NAMES.reconcile,
  GOVERNED_ASSET_TOOL_NAMES.history
]);
Object.freeze([
  GOVERNED_ASSET_TOOL_NAMES.authorize
]);
const U64_MAX = 18446744073709551615n;
const POSITIVE_DECIMAL$1 = /^[1-9][0-9]*$/;
const NONNEGATIVE_DECIMAL = /^(0|[1-9][0-9]*)$/;
const SHARE_QUANTITY_DECIMAL = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
const VALUE_USD_DECIMAL = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const OPERATION_ID = string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).describe(
  "Stable idempotency identity for this exact request. Reuse it only for an exact replay of the same operation and arguments."
);
const INTENT_ID = uuidString().describe(
  "Exact governed intentId returned by dexter_prepare_asset_action."
);
const GOVERNED_U64_DECIMAL_SCHEMA = string().max(20).regex(NONNEGATIVE_DECIMAL).refine(
  (value) => value.length <= 20 && NONNEGATIVE_DECIMAL.test(value) && BigInt(value) <= U64_MAX,
  "value exceeds u64"
);
const GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA = string().max(20).regex(POSITIVE_DECIMAL$1).refine(
  (value) => value.length <= 20 && POSITIVE_DECIMAL$1.test(value) && BigInt(value) <= U64_MAX,
  "amount exceeds u64"
);
const GOVERNED_SHARE_QUANTITY_SCHEMA = string().max(39).regex(SHARE_QUANTITY_DECIMAL).refine(
  (value) => !/^0(?:\.0+)?$/.test(value),
  "share quantity must be greater than zero"
).overwrite((value) => {
  const [whole, fraction = ""] = value.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  return canonicalFraction.length === 0 ? whole : `${whole}.${canonicalFraction}`;
}).describe(
  "Positive decimal underlying-share-equivalent quantity, such as 10 or 0.25. Keep this as a human decimal; Dexter resolves the selected product version, token decimals, and current display multiplier."
);
const GOVERNED_VALUE_USD_SCHEMA = string().max(39).regex(VALUE_USD_DECIMAL).refine(
  (value) => !/^0(?:\.0+)?$/.test(value),
  "USD value must be greater than zero"
).overwrite((value) => {
  const [whole, fraction = ""] = value.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  return canonicalFraction.length === 0 ? whole : `${whole}.${canonicalFraction}`;
}).describe(
  "USD market value to sell at preparation, as a positive human decimal such as 1 or 12.50. Dexter sizes the token input from the latest reported USD price. Dexter checks the selected value against the current sale quote. Net USDC proceeds are approximate until the receipt. Use valueUsd or amountAtomic, never both."
);
const GOVERNED_ASSET_ID_SCHEMA = string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._:-]*$/).describe(
  "Canonical assetId returned by dexter_wallet_portfolio from an approved holding or approvedActionTarget. Pass the assetId itself; Dexter resolves its exact network, mint, token program, decimals, and capability record."
);
const GOVERNED_COMPANY_QUERY_SCHEMA = string().min(1).max(256).refine(
  (value) => value === value.trim() && !CONTROL_CHARACTER.test(value),
  "companyQuery must be trimmed human text without control characters"
).describe(
  "Human company or stock query for the catalog-owned stock route, such as Tesla, NVIDIA, or Moderna. Dexter normalizes the query and selects, pins, and returns the exact current Solana stock product. Never replace this with a remembered assetId, mint, or symbol."
);
const GOVERNED_HISTORY_CURSOR_MAX_LENGTH = 1024;
const TRADE_MEMO = string().max(566).nullable().optional().describe(
  "Optional trade memo. Send does not support a memo and exposes no memo field."
);
const BPS = number().int().min(0).max(1e4).optional();
const SOLANA_ADDRESS = string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/).describe("Canonical Solana base58 destination owner address.");
const prepareSendInput = object({
  operationId: OPERATION_ID,
  action: literal("send"),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.describe(
    "Exact selected-asset amount in integer base units. Use the server-certified decimals returned for this asset; never infer decimals from its symbol."
  ),
  destinationOwner: SOLANA_ADDRESS
}).strict();
const prepareBuySpendInput = object({
  operationId: OPERATION_ID,
  action: literal("buy"),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.describe(
    "Exact USDC budget to spend, in integer base units. The canonical settlement asset uses 6 decimals, so 1000000 means 1 USDC; assetId identifies the asset being bought."
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS
}).strict();
const prepareCatalogStockBuySpendInput = object({
  operationId: OPERATION_ID,
  action: literal("buy"),
  companyQuery: GOVERNED_COMPANY_QUERY_SCHEMA,
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.describe(
    "Exact USDC budget to spend, in integer base units with 6 decimals, on the stock Dexter selects from the current catalog."
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS
}).strict();
const prepareCatalogStockBuyQuantityInput = object({
  operationId: OPERATION_ID,
  action: literal("buy"),
  companyQuery: GOVERNED_COMPANY_QUERY_SCHEMA,
  shareQuantity: GOVERNED_SHARE_QUANTITY_SCHEMA.describe(
    "Minimum underlying-share-equivalent quantity requested for the current catalog-selected Solana stock product, expressed as a human decimal such as 10 or 0.25. Dexter resolves the exact product version, current display multiplier, and raw token amount. This is a minimum-receive target and execution may receive slightly more."
  ),
  maximumSpendAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.optional().describe(
    "Optional maximum USDC input permitted for this share-quantity Buy, in integer base units with 6 decimals. It is valid only with shareQuantity."
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS
}).strict();
const prepareSellInput = object({
  operationId: OPERATION_ID,
  action: literal("sell"),
  assetId: GOVERNED_ASSET_ID_SCHEMA,
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.describe(
    "Exact selected-asset amount to sell, in integer base units. Use the server-certified decimals returned for this asset; never infer decimals from its symbol."
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS
}).strict();
const prepareCatalogStockSellInput = object({
  operationId: OPERATION_ID,
  action: literal("sell"),
  companyQuery: GOVERNED_COMPANY_QUERY_SCHEMA,
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA.describe(
    "Exact selected-stock token input in integer base units. Dexter resolves the current catalog product, token program, and decimals; never infer them from the company name or symbol."
  ),
  memo: TRADE_MEMO,
  maxSlippageBps: BPS,
  maxPriceImpactBps: BPS
}).strict();
const prepareSellValueInput = prepareSellInput.omit({ amountAtomic: true }).extend({ valueUsd: GOVERNED_VALUE_USD_SCHEMA });
const prepareCatalogStockSellValueInput = prepareCatalogStockSellInput.omit({ amountAtomic: true }).extend({ valueUsd: GOVERNED_VALUE_USD_SCHEMA });
const GOVERNED_PREPARE_INPUT_SCHEMA = union([
  prepareSendInput,
  prepareBuySpendInput,
  prepareCatalogStockBuySpendInput,
  prepareCatalogStockBuyQuantityInput,
  prepareSellInput,
  prepareCatalogStockSellInput,
  prepareSellValueInput,
  prepareCatalogStockSellValueInput
]);
const GOVERNED_EXECUTE_INPUT_SCHEMA = object({
  operationId: OPERATION_ID,
  intentId: INTENT_ID
}).strict();
const GOVERNED_STATUS_INPUT_SCHEMA = object({
  intentId: INTENT_ID
}).strict();
const GOVERNED_RECONCILE_INPUT_SCHEMA = object({
  intentId: INTENT_ID
}).strict();
const GOVERNED_HISTORY_INPUT_SCHEMA = object({
  limit: number().int().min(1).max(100).optional().describe(
    "Maximum number of governed transactions to return. The server default is 25."
  ),
  cursor: string().min(1).max(GOVERNED_HISTORY_CURSOR_MAX_LENGTH).optional().describe(
    "Opaque nextCursor from a prior dexter_wallet_history response."
  )
}).strict();
const GOVERNED_ASSET_INPUT_SCHEMAS = Object.freeze({
  prepare: GOVERNED_PREPARE_INPUT_SCHEMA,
  execute: GOVERNED_EXECUTE_INPUT_SCHEMA,
  status: GOVERNED_STATUS_INPUT_SCHEMA,
  reconcile: GOVERNED_RECONCILE_INPUT_SCHEMA,
  history: GOVERNED_HISTORY_INPUT_SCHEMA
});
function cloneVaultSchemes() {
  return VAULT_OAUTH_SECURITY_SCHEMES.map((scheme) => ({
    type: scheme.type,
    scopes: [...scheme.scopes]
  }));
}
function descriptor({ operation, title, description, annotations }) {
  const securitySchemes = cloneVaultSchemes();
  return Object.freeze({
    operation,
    title,
    description,
    inputSchema: GOVERNED_ASSET_INPUT_SCHEMAS[operation],
    annotations: Object.freeze(annotations),
    securitySchemes: Object.freeze(securitySchemes),
    _meta: Object.freeze({
      securitySchemes: Object.freeze(cloneVaultSchemes()),
      ui: Object.freeze({ visibility: Object.freeze(["model"]) })
    }),
    requiresPerRequestVaultBearer: true,
    registered: true
  });
}
Object.freeze({
  [GOVERNED_ASSET_TOOL_NAMES.prepare]: descriptor({
    operation: "prepare",
    title: "Prepare a Governed Send, Buy, or Sell",
    description: "Persist and evaluate one exact Send, Buy, or Sell without signing or submitting it. Treat this Prepare response as the proof of current runtime capability. To buy a stock, pass companyQuery and let Dexter resolve and pin the current catalog product. To sell a stock the user holds, pass its assetId from dexter_wallet_portfolio, which keeps the exact version they hold. Never pass a remembered stock assetId, mint, or symbol. The assetId variants also serve a non-stock approved holding or approvedActionTarget returned by dexter_wallet_portfolio. In the current integrated release, covered Buy and Sell may continue autonomously, while Send is preserved in the input contract but fails closed with protected_agent_send_sdk_required before capacity reservation or intent creation. A Buy uses exactly one amount mode: amountAtomic is the exact USDC budget to spend, while shareQuantity is the human decimal underlying-share-equivalent quantity requested and may be paired with maximumSpendAtomic as a USDC ceiling. Keep shareQuantity as a human decimal; Dexter resolves the exact product version, current display multiplier, and raw minimum output. Never send both modes, and never treat shareQuantity as exact output because slight overfill is possible. Sell uses exactly one amount mode: valueUsd is the positive human decimal USD market value to sell at preparation, and amountAtomic is exact selected-asset token input. Dexter sizes the token input for valueUsd from the latest reported USD price and checks the selected value against the current sale quote; net USDC proceeds are approximate until the receipt. Send amountAtomic is selected-asset input. operationId is only the Idempotency-Key. The server resolves the wallet and reusable bounded mandate; enrollment, extension, or owner escalation happens outside model-callable tools only when the request is not already covered.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }),
  [GOVERNED_ASSET_TOOL_NAMES.execute]: descriptor({
    operation: "execute",
    title: "Execute a Prepared Governed Asset Action",
    description: "Execute the exact intent returned by successful Prepare when the current task and active mandate cover it. Continue without another approval question when they already do. An unavailable or uncovered request cannot execute. Pass only operationId and intentId; operationId identifies the request and grants no authority. Use the returned actual receipt result, report its confirmed or finalized state, and read current holdings when useful. After uncertainty, inspect this same intent with Status. Do not repeat Execute.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    }
  }),
  [GOVERNED_ASSET_TOOL_NAMES.status]: descriptor({
    operation: "status",
    title: "Check a Governed Asset Action",
    description: "Read the result and actual receipt amounts for one existing intent. Report readable actual amounts, distinguish the saved quote from the fill, and follow the returned same-attempt recovery guidance. This tool never dispatches a transaction. Keep technical evidence available when requested.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }),
  [GOVERNED_ASSET_TOOL_NAMES.reconcile]: descriptor({
    operation: "reconcile",
    title: "Reconcile a Governed Asset Action",
    description: "Continue recovery for one existing intent only when its saved Status requires it and the original task covers completing the attempt. Recovery may contact the facilitator or submit that attempt's already-signed transaction. A status-only request does not authorize that submission. No new attempt or expanded permission is created. After uncertainty, read Status instead of automatically repeating Reconcile. A not-required result means no recovery was needed.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    }
  }),
  [GOVERNED_ASSET_TOOL_NAMES.history]: descriptor({
    operation: "history",
    title: "Read Governed Wallet History",
    description: "Read wallet action history with readable actual receipt amounts where recorded. Use only the returned pagination cursor. Give a concise account of what happened; distinguish historical transaction balances from a current Portfolio read and keep receipt references available.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  })
});
const TIME = number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SLOT = TIME.refine((value) => value > 0);
const EFFECTIVE_SECONDS = integer().min(-Math.floor(Number.MAX_SAFE_INTEGER / 1e3)).max(Math.floor(Number.MAX_SAFE_INTEGER / 1e3));
const HASH = string().regex(/^[a-f0-9]{64}$/);
const MINT = string().min(32).max(64);
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
function decimalParts(value) {
  if (typeof value !== "string" || value.length > 128 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 64) return null;
  const units = BigInt(whole + fraction);
  return units > 0n ? { units, scale: fraction.length } : null;
}
function decimalFromUnits(units, scale) {
  if (scale === 0) return units.toString();
  const digits = units.toString().padStart(scale + 1, "0");
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}
const POSITIVE_DECIMAL = string().max(128).refine((value) => decimalParts(value) !== null);
const CANONICAL_DECIMAL = POSITIVE_DECIMAL.refine((value) => {
  const parts = decimalParts(value);
  return parts !== null && decimalFromUnits(parts.units, parts.scale) === value;
});
const CANONICAL_VALUE_USD = string().max(39).refine((value) => {
  const parsed = GOVERNED_VALUE_USD_SCHEMA.safeParse(value);
  return parsed.success && parsed.data === value;
});
const settlementUsdPrice = object({
  mint: literal(SOLANA_USDC_MINT),
  usdPrice: POSITIVE_DECIMAL,
  source: string().refine((value) => value.trim().length > 0),
  retrievedAtUnixMs: TIME,
  marketBlockId: TIME.nullable()
}).strict();
const price = object({
  mint: MINT,
  usdPrice: POSITIVE_DECIMAL,
  quantityUnit: _enum(["raw-decimals", "scaled-ui"]),
  source: string().refine((value) => value.trim().length > 0),
  retrievedAtUnixMs: TIME,
  marketBlockId: TIME.nullable(),
  expiresAtUnixMs: TIME,
  settlementUsdPrice
}).strict();
const balance = object({
  amountAtomic: GOVERNED_U64_DECIMAL_SCHEMA,
  observedSlot: SLOT,
  observedAtUnixMs: TIME
}).strict();
const multiplier = object({
  source: _enum(["identity", "token-2022-scaled-ui-current", "token-2022-scaled-ui-scheduled"]),
  value: CANONICAL_DECIMAL,
  currentValue: CANONICAL_DECIMAL,
  scheduledValue: CANONICAL_DECIMAL.nullable(),
  scheduledEffectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  effectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  nextValue: CANONICAL_DECIMAL.nullable(),
  nextEffectiveTimestampUnixSeconds: EFFECTIVE_SECONDS.nullable(),
  observedSlot: SLOT,
  observedAtUnixMs: TIME,
  mintStateDigest: HASH
}).strict();
function exactMultiplier(binding) {
  const m = binding.multiplier;
  if (m.observedSlot !== binding.mintObservedSlot || m.observedAtUnixMs !== binding.mintObservedAtUnixMs || m.mintStateDigest !== binding.mintStateDigest) return false;
  if (m.source === "identity") {
    return binding.amountModel === "raw-decimals" && m.value === "1" && m.currentValue === "1" && m.scheduledValue === null && m.scheduledEffectiveTimestampUnixSeconds === null && m.effectiveTimestampUnixSeconds === null && m.nextValue === null && m.nextEffectiveTimestampUnixSeconds === null;
  }
  if (binding.tokenProgram !== "token-2022" || binding.amountModel !== "scaled-ui-amount" || m.scheduledValue === null || m.scheduledEffectiveTimestampUnixSeconds === null) return false;
  const effective = m.scheduledEffectiveTimestampUnixSeconds;
  const mintTime = Math.floor(binding.mintObservedAtUnixMs / 1e3);
  const priceTime = Math.floor(binding.price.retrievedAtUnixMs / 1e3);
  const preparedTime = Math.floor(binding.preparedAtUnixMs / 1e3);
  if (m.currentValue !== m.scheduledValue && effective > Math.min(mintTime, priceTime) && effective <= preparedTime) return false;
  const active = effective <= mintTime;
  return m.source === (active ? "token-2022-scaled-ui-scheduled" : "token-2022-scaled-ui-current") && m.value === (active ? m.scheduledValue : m.currentValue) && m.effectiveTimestampUnixSeconds === (active ? effective : null) && m.nextValue === (active ? null : m.scheduledValue) && m.nextEffectiveTimestampUnixSeconds === (active ? null : effective);
}
function exactUsdValue(binding) {
  const p = binding.price;
  if (!Number.isInteger(binding.assetDecimals) || binding.assetDecimals < 0 || binding.assetDecimals > 18 || !/^(?:0|[1-9][0-9]{0,19})$/.test(binding.balance.amountAtomic)) return false;
  if (p.mint !== binding.mint || p.retrievedAtUnixMs > binding.preparedAtUnixMs || p.expiresAtUnixMs <= p.retrievedAtUnixMs || p.expiresAtUnixMs <= binding.preparedAtUnixMs || p.settlementUsdPrice.source !== p.source || p.settlementUsdPrice.retrievedAtUnixMs !== p.retrievedAtUnixMs || binding.mintObservedAtUnixMs > binding.preparedAtUnixMs || binding.balance.observedAtUnixMs > binding.preparedAtUnixMs || !exactMultiplier(binding)) return false;
  const target = decimalParts(binding.requestedValueUsd);
  const priceParts = decimalParts(p.usdPrice);
  const displayMultiplier = decimalParts(binding.multiplier.value);
  if (!target || !priceParts || !displayMultiplier) return false;
  const sizingMultiplier = p.quantityUnit === "scaled-ui" ? displayMultiplier : { units: 1n, scale: 0 };
  const numerator = target.units * 10n ** BigInt(binding.assetDecimals + priceParts.scale + sizingMultiplier.scale);
  const denominator = priceParts.units * sizingMultiplier.units * 10n ** BigInt(target.scale);
  const raw = numerator / denominator;
  return raw.toString() === binding.amountAtomic && raw <= BigInt(binding.balance.amountAtomic) && decimalFromUnits(raw, binding.assetDecimals) === binding.rawDecimalAmount && decimalFromUnits(
    raw * sizingMultiplier.units * priceParts.units,
    binding.assetDecimals + sizingMultiplier.scale + priceParts.scale
  ) === binding.selectedReferenceValueUsd && decimalFromUnits(raw * displayMultiplier.units, binding.assetDecimals + displayMultiplier.scale) === binding.displayAmount;
}
const GOVERNED_USD_VALUE_BINDING_SCHEMA = object({
  namespace: literal("dexter-governed-usd-value/v1"),
  semantics: literal("approximate-input-market-value"),
  requestedValueUsd: CANONICAL_VALUE_USD,
  selectedReferenceValueUsd: string().max(256),
  rounding: literal("floor"),
  amountAtomic: GOVERNED_POSITIVE_U64_DECIMAL_SCHEMA,
  rawDecimalAmount: string().max(256),
  displayAmount: string().max(256),
  amountModel: _enum(["raw-decimals", "scaled-ui-amount"]),
  mint: MINT,
  tokenProgram: _enum(["spl-token", "token-2022"]),
  assetDecimals: number().int().min(0).max(18),
  mintStateDigest: HASH,
  mintObservedSlot: SLOT,
  mintObservedAtUnixMs: TIME,
  preparedAtUnixMs: TIME,
  price,
  balance,
  multiplier
}).strict().superRefine((value, context) => {
  let exact = false;
  try {
    exact = exactUsdValue(value);
  } catch {
  }
  if (!exact) {
    context.addIssue({ code: ZodIssueCode.custom, message: "USD value evidence does not reproduce the token input" });
  }
});
function usdValueMatchesAsset(value, action, amountAtomic, product) {
  return action === "sell" && value !== void 0 && value.amountAtomic === amountAtomic && value.mint === product.mint && value.tokenProgram === product.tokenProgram && value.assetDecimals === product.decimals;
}
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index])
);
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function selectGovernedWidgetResult(output, responseMetadata) {
  if (typeof record(output)?.namespace === "string") return output;
  const errorBody = record(record(responseMetadata)?.["dexter/governedWidgetResult"]);
  return errorBody ?? output ?? null;
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function integerString(value) {
  const candidate = stringValue(value);
  return candidate && INTEGER.test(candidate) ? candidate : null;
}
function decimalString(value) {
  const candidate = stringValue(value);
  return candidate && DECIMAL.test(candidate) ? candidate : null;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function booleanValue(value) {
  return typeof value === "boolean" ? value : null;
}
function firstRecord(...values) {
  for (const value of values) {
    const candidate = record(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstString(...values) {
  for (const value of values) {
    const candidate = stringValue(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstDecimal(...values) {
  for (const value of values) {
    const candidate = decimalString(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstInteger(...values) {
  for (const value of values) {
    const candidate = integerString(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstBoolean(...values) {
  for (const value of values) {
    const candidate = booleanValue(value);
    if (candidate !== null) return candidate;
  }
  return null;
}
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter((item) => item !== null);
}
function operationOf(root, input) {
  const explicit = firstString(root.operation)?.toLowerCase();
  if (explicit === "prepare" || explicit === "execute" || explicit === "status" || explicit === "reconcile") return explicit;
  const namespace = firstString(root.namespace);
  if (namespace === "dexter-governed-agent-action/v1") return "prepare";
  if (namespace === "dexter-governed-agent-execute/v1") return "execute";
  if (namespace === "dexter-governed-transaction-status/v1") return "status";
  if (namespace === "dexter-governed-agent-reconcile/v1") return "reconcile";
  if (input?.operationId !== void 0 && input?.intentId !== void 0) return "execute";
  if (input?.action !== void 0) return "prepare";
  return "unknown";
}
function actorOf(...values) {
  const actor = firstString(...values)?.toLowerCase();
  return actor === "agent" || actor === "owner" ? actor : "unknown";
}
function ownerDecisionOf(...values) {
  const status = firstString(...values)?.toLowerCase();
  return status === "not-required" || status === "pending" || status === "approved" || status === "refused" ? status : null;
}
function policyDecisionOf(...values) {
  const decision = firstString(...values)?.toLowerCase();
  return decision === "allowed" || decision === "approval_required" ? decision : null;
}
function groupedInteger(value) {
  if (!value || !INTEGER.test(value)) return null;
  return BigInt(value).toLocaleString("en-US");
}
function decodedBase58ByteLength(value) {
  if (!value) return null;
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === void 0) return null;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < value.length && value[leadingZeroBytes] === "1") {
    leadingZeroBytes += 1;
  }
  const magnitudeBytes = bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length;
  return leadingZeroBytes + magnitudeBytes;
}
function safeNumber(value) {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  const candidate = stringValue(value);
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}
function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
function normalizeProduct(identity, preview, business, status) {
  return {
    assetId: firstString(
      identity?.assetId,
      preview?.assetId,
      business?.assetId,
      status.assetId
    ),
    assetClass: firstString(identity?.assetClass),
    companyName: firstString(identity?.companyName),
    productName: firstString(identity?.productName),
    symbol: firstString(identity?.symbol, preview?.symbol),
    providerName: firstString(identity?.providerName),
    legalIssuerName: firstString(identity?.legalIssuerName),
    issuer: firstString(identity?.issuer),
    network: firstString(identity?.network, "solana-mainnet"),
    mint: firstString(
      identity?.mint,
      status.assetMint,
      preview?.outputMint
    ),
    tokenProgram: firstString(identity?.tokenProgram, status.tokenProgram),
    decimals: safeInteger(identity?.decimals, 0, 18),
    registryIdentityDigest: firstString(identity?.registryIdentityDigest)
  };
}
function feeLine(value) {
  const candidate = record(value);
  if (!candidate) return null;
  const amountAtomic = integerString(candidate.amountAtomic);
  const mint = stringValue(candidate.mint);
  return amountAtomic && mint ? { amountAtomic, mint } : null;
}
function normalizeFees(value) {
  if (!value) return null;
  const summary = stringValue(value.summary);
  const networkFee = record(value.networkFee);
  if (!summary || !networkFee) return null;
  const routeFees = Array.isArray(value.routeFees) ? value.routeFees.map(feeLine).filter((item) => item !== null) : [];
  return {
    summary,
    platformFee: feeLine(value.platformFee),
    routeFees,
    networkFeeStatus: stringValue(networkFee.status),
    networkFeeLamports: integerString(networkFee.amountLamports)
  };
}
function formatAtomicDecimal(value, decimals, maximumFractionDigits = decimals) {
  if (!value || !INTEGER.test(value) || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  const padded = value.padStart(decimals + 1, "0");
  const integer2 = decimals === 0 ? padded : padded.slice(0, -decimals);
  const rawFraction = decimals === 0 ? "" : padded.slice(-decimals);
  const fraction = rawFraction.slice(0, Math.max(0, maximumFractionDigits)).replace(/0+$/, "");
  const grouped = BigInt(integer2).toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
function displayQuantity(value) {
  if (!value) return null;
  const [integer2, fraction = ""] = value.split(".");
  const grouped = BigInt(integer2).toLocaleString("en-US");
  const trimmed = fraction.slice(0, 8).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}
function actionOf(...values) {
  const action = firstString(...values)?.toLowerCase();
  return action === "buy" || action === "sell" || action === "send" ? action : "unknown";
}
function commitmentOf(...values) {
  const commitment = firstString(...values)?.toLowerCase();
  return commitment === "confirmed" || commitment === "finalized" ? commitment : null;
}
function exactSignature(...values) {
  const signature = firstString(...values);
  return signature && decodedBase58ByteLength(signature) === 64 ? signature : null;
}
function exactStringAgreement(...values) {
  const present = values.filter((value) => typeof value === "string" && value.length > 0);
  return present.length > 0 && present.every((value) => value === present[0]);
}
function exactNumberAgreement(...values) {
  const present = values.filter((value) => typeof value === "number" && Number.isSafeInteger(value));
  return present.length > 0 && present.every((value) => value === present[0]);
}
function exactGovernedAssetIdentity(product) {
  return firstString(product.assetClass) === "stock" && firstString(product.companyName) !== null && firstString(product.productName) !== null && firstString(product.providerName) !== null && firstString(product.legalIssuerName) !== null && exactStringAgreement(product.issuer, product.legalIssuerName) && firstString(product.registryIdentityDigest) !== null && safeInteger(product.decimals, 0, 18) !== null && exactNumberAgreement(product.decimals);
}
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("non_integer_identity_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("unsupported_governed_identity_value");
  }
  const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => {
    if (item === void 0) {
      throw new TypeError(`undefined_governed_identity_value:${key}`);
    }
    return `${JSON.stringify(key)}:${canonicalJson(item)}`;
  }).join(",")}}`;
}
function stockTradeSummarySnapshotDigest(summary) {
  const product = record(summary.productIdentity);
  if (product === null || summary.namespace !== "dexter-governed-stock-trade-summary/v1") return null;
  try {
    const snapshot = {
      namespace: "dexter-governed-stock-prepare-summary-snapshot/v1",
      action: summary.action,
      assetId: summary.assetId,
      symbol: summary.symbol,
      amountAtomic: summary.amountAtomic,
      requestAmountKind: summary.requestAmountKind,
      ...summary.usdValue === void 0 ? {} : { usdValue: summary.usdValue },
      requestedShareQuantity: summary.requestedShareQuantity,
      shareQuantityUnit: summary.shareQuantityUnit,
      shareQuantitySemantics: summary.shareQuantitySemantics,
      requestedMaximumSpendAtomic: summary.requestedMaximumSpendAtomic,
      overfillPossible: summary.overfillPossible,
      productIdentity: {
        assetId: product.assetId,
        assetClass: product.assetClass,
        companyName: product.companyName,
        productName: product.productName,
        symbol: product.symbol,
        providerName: product.providerName,
        legalIssuerName: product.legalIssuerName,
        issuer: product.issuer,
        mint: product.mint,
        tokenProgram: product.tokenProgram,
        decimals: product.decimals,
        network: product.network,
        registryIdentityDigest: product.registryIdentityDigest
      }
    };
    return bytesToHex(sha256(utf8ToBytes(canonicalJson(snapshot))));
  } catch {
    return null;
  }
}
function validatedUsdValue(summary) {
  if (summary?.requestAmountKind !== "usd-value") return null;
  const product = record(summary.productIdentity);
  const parsed = GOVERNED_USD_VALUE_BINDING_SCHEMA.safeParse(summary.usdValue);
  if (!parsed.success || product === null || !usdValueMatchesAsset(parsed.data, summary.action, summary.amountAtomic, product)) return null;
  return parsed.data;
}
function exactSuccessEnvelopeIdentity(input) {
  const selection = record(input.status.stockSelection);
  const durableIdentity = record(input.status.stockV2Identity);
  const product = record(input.tradeSummary?.productIdentity);
  const intentId = firstString(input.status.intentId, input.root.intentId);
  const durableSummaryDigest = firstString(
    durableIdentity?.tradeSummarySnapshotDigest
  );
  if (intentId === null || !exactStringAgreement(
    input.status.intentId,
    input.root.intentId,
    durableIdentity?.intentId
  )) return false;
  if (durableIdentity !== null && (selection === null || input.tradeSummary === null || firstString(durableIdentity.intentId) !== intentId || durableIdentity.namespace !== "dexter-governed-stock-v2-durable-identity/v1" || durableSummaryDigest === null || !SHA256_HEX.test(durableSummaryDigest) || stockTradeSummarySnapshotDigest(input.tradeSummary) !== durableSummaryDigest)) return false;
  if (selection !== null && durableIdentity === null) return false;
  if (input.tradeSummary === null) {
    return exactStringAgreement(input.status.action, input.business?.action) && exactStringAgreement(input.status.assetId, input.business?.assetId) && exactStringAgreement(
      input.status.amountAtomic,
      input.business?.amountAtomic
    );
  }
  if (product === null || !exactGovernedAssetIdentity(product)) return false;
  if (input.tradeSummary.requestAmountKind === "usd-value" ? validatedUsdValue(input.tradeSummary) === null : input.tradeSummary.usdValue !== void 0) return false;
  return exactStringAgreement(
    input.tradeSummary.action,
    input.status.action,
    input.business?.action
  ) && exactStringAgreement(
    input.tradeSummary.assetId,
    product.assetId,
    selection?.assetId,
    input.status.assetId,
    input.business?.assetId
  ) && exactStringAgreement(
    input.tradeSummary.amountAtomic,
    input.status.amountAtomic,
    input.business?.amountAtomic
  ) && exactStringAgreement(
    product.mint,
    selection?.mint,
    input.status.assetMint
  ) && exactStringAgreement(
    product.tokenProgram,
    selection?.tokenProgram,
    input.status.tokenProgram
  ) && (selection === null || exactStringAgreement(
    input.tradeSummary.symbol,
    product.symbol,
    selection.productSymbol
  ) && exactStringAgreement(product.companyName, selection.companyName) && exactStringAgreement(product.productName, selection.productName) && exactStringAgreement(product.providerName, selection.providerName) && exactStringAgreement(
    product.legalIssuerName,
    product.issuer,
    selection.legalIssuerName
  ) && exactStringAgreement(
    product.registryIdentityDigest,
    selection.registryIdentityDigest
  ) && exactNumberAgreement(product.decimals, selection.decimals));
}
function productLabel(product) {
  return firstString(
    product.companyName,
    product.productName,
    product.symbol,
    product.assetId
  ) ?? "asset";
}
function sharePhrase(quantity) {
  const displayed = displayQuantity(quantity);
  if (!displayed) return "the requested amount";
  return `${displayed} ${displayed === "1" ? "share" : "shares"}`;
}
function classifyStage(input) {
  if (input.signature !== null && input.commitment !== null && input.executionSucceeded === true && input.identityExact) {
    return "success";
  }
  if (input.executionSucceeded === false || input.programError || input.definitiveNonlandingProof || ["failed", "refused", "provably_not_landed"].includes(input.rawStatus)) {
    return "failure";
  }
  if (input.rawStatus === "prepared") return "prepared";
  return "pending";
}
function actionPhrase(input) {
  const product = productLabel(input.product);
  const shareTarget = displayQuantity(input.requestedShares ?? input.minimumShares);
  const amount = input.amountDisplay && input.amountUnit ? `${input.amountDisplay} ${input.amountUnit}` : input.amountDisplay;
  const amountAlreadyNamesAsset = input.amountUnit?.endsWith(" base units") === true;
  const destination = shortenSolanaIdentity(input.destinationOwner, 5);
  if (input.action === "buy") {
    const target = shareTarget ? `${sharePhrase(input.requestedShares ?? input.minimumShares)} of ${product}` : input.quotedSpend ? `$${input.quotedSpend} of ${product}` : product;
    return {
      imperative: `Buy ${target}`,
      completed: `${target} bought`,
      noun: "purchase"
    };
  }
  if (input.action === "sell") {
    const target = amount ? amountAlreadyNamesAsset ? amount : `${amount} of ${product}` : product;
    return {
      imperative: `Sell ${target}`,
      completed: `${target} sold`,
      noun: "sale"
    };
  }
  if (input.action === "send") {
    const target = amount ?? product;
    const suffix = destination ? ` to ${destination}` : "";
    return {
      imperative: `Send ${target}${suffix}`,
      completed: `${target} sent${suffix}`,
      noun: "transfer"
    };
  }
  return {
    imperative: "Governed action",
    completed: "Governed action confirmed",
    noun: "action"
  };
}
function stageCopy(input) {
  const phrase = actionPhrase(input);
  if (input.stage === "success") {
    return {
      stageLabel: input.commitment === "finalized" ? "Finalized" : "Confirmed",
      headline: phrase.completed,
      supporting: "Solana confirmed the transaction and Dexter recorded successful execution."
    };
  }
  if (input.stage === "failure") {
    return {
      stageLabel: input.rawStatus === "refused" ? "Stopped" : "Failed",
      headline: `${phrase.imperative} stopped before completion`,
      supporting: input.definitiveNonlandingProof ? "Dexter proved that this transaction did not land." : "Dexter recorded no successful execution for this action."
    };
  }
  if (input.stage === "prepared") {
    return {
      stageLabel: "Prepared",
      headline: phrase.imperative,
      supporting: "This exact action is prepared. Nothing has been signed or submitted."
    };
  }
  if (input.commitment !== null && input.executionSucceeded !== true) {
    return {
      stageLabel: "Verifying",
      headline: `${phrase.imperative} is being verified`,
      supporting: "Solana confirmation is present. Dexter has not yet proven successful execution."
    };
  }
  if (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(input.rawStatus)) {
    return {
      stageLabel: "Outcome unknown",
      headline: `Outcome unknown for ${phrase.noun}`,
      supporting: input.operation === "prepare" ? "Retry only the same request with the same operation ID." : "Keep this intent and inspect its durable status before any further action."
    };
  }
  if (input.rawStatus === "signed") {
    return {
      stageLabel: "Signed",
      headline: `${phrase.imperative} is signed`,
      supporting: "The signed transaction has not been proven submitted or confirmed."
    };
  }
  return {
    stageLabel: "Pending",
    headline: `${phrase.imperative} is awaiting confirmation`,
    supporting: "Keep this intent and read its durable status before taking another action."
  };
}
function recoveryFor(input) {
  if (input.confirmedOutcome || input.definitiveNonlandingProof) {
    return { kind: "none", sentence: null };
  }
  if (input.retry === "same_operation_only" || input.retryable === true || input.operation === "prepare" && ["uncertain", "unknown"].includes(input.rawStatus)) {
    return {
      kind: "same-request",
      sentence: "Retry only the same request with the same operation ID."
    };
  }
  if (input.retry === "reconcile_same_intent_only") {
    return {
      kind: "reconcile",
      sentence: "Do not execute again. Inspect and reconcile this same intent only."
    };
  }
  if (input.retry === "manual_same_intent_only") {
    return {
      kind: "manual",
      sentence: "Do not retry automatically. Inspect this same intent before any manual reconciliation."
    };
  }
  if (input.operation === "reconcile" && ["pending", "unavailable"].includes(input.reconcileOutcome ?? "")) {
    return {
      kind: "manual",
      sentence: "Do not retry reconciliation automatically. Inspect this same intent first."
    };
  }
  if (input.intentId && (input.rawStatus === "reconciliation-required" || input.rawStatus === "ambiguous" || input.reconciliationRequired && input.canReconcile)) {
    return {
      kind: "reconcile",
      sentence: "Do not execute again. Reconcile this same intent and attempt only."
    };
  }
  if (input.retry === "read_again" || input.intentId && input.stage === "pending") {
    return {
      kind: "read",
      sentence: "Do not execute again. Read this same intent before taking another action."
    };
  }
  return { kind: "none", sentence: null };
}
function normalizeGovernedAction(payload, toolInput = null) {
  const root = record(payload);
  if (!root) return null;
  const input = record(toolInput);
  const namespace = firstString(root.namespace);
  if (namespace === "dexter-governed-transaction-history/v1") return null;
  const operation = operationOf(root, input);
  const statusAfter = record(root.statusAfter);
  const status = statusAfter ?? root;
  const preview = firstRecord(root.preview, status.preview);
  const business = firstRecord(status.business, root.business);
  const tradeSummary = firstRecord(status.tradeSummary, root.tradeSummary);
  const attribution = firstRecord(status.attribution, root.attribution);
  const grant = firstRecord(attribution?.grant);
  const approval = firstRecord(status.approval, root.approval);
  const ownerDecisionRecord = firstRecord(status.ownerDecision, root.ownerDecision);
  const replay = firstRecord(status.replay, root.replay);
  const execution = firstRecord(status.execution, root.execution);
  const share = firstRecord(
    preview?.shareQuantity,
    status.shareQuantity,
    business?.shareQuantity,
    root.shareQuantity
  );
  const productIdentity = firstRecord(
    tradeSummary?.productIdentity,
    preview?.productIdentity,
    status.productIdentity,
    business?.productIdentity,
    root.productIdentity
  );
  const feeSummary = firstRecord(
    tradeSummary?.feeSummary,
    preview?.feeSummary,
    status.feeSummary,
    business?.feeSummary,
    root.feeSummary
  );
  const action = actionOf(
    tradeSummary?.action,
    preview?.action,
    status.action,
    business?.action,
    root.action,
    input?.action
  );
  const product = normalizeProduct(productIdentity, preview, business, status);
  const destinationOwner = firstString(
    preview?.destinationOwner,
    status.destinationOwner,
    business?.destinationOwner,
    root.destinationOwner,
    input?.destinationOwner
  );
  const requestedShares = firstDecimal(
    tradeSummary?.requestedShareQuantity,
    preview?.requestedShareQuantity,
    share?.requestedShareQuantity,
    status.requestedShareQuantity,
    root.requestedShareQuantity,
    input?.shareQuantity
  );
  const expectedShares = firstDecimal(
    tradeSummary?.expectedShareQuantity,
    preview?.expectedShareQuantity,
    share?.expectedShareQuantity,
    status.expectedShareQuantity,
    root.expectedShareQuantity
  );
  const minimumShares = firstDecimal(
    tradeSummary?.minimumShareQuantity,
    preview?.minimumShareQuantity,
    share?.minimumShareQuantity,
    status.minimumShareQuantity,
    root.minimumShareQuantity
  );
  const amountKind = firstString(
    tradeSummary?.requestAmountKind,
    preview?.requestAmountKind
  );
  const usdValue = validatedUsdValue(tradeSummary ?? preview);
  const requestAmountKind = amountKind === "usd-value" ? "usd-value" : amountKind === "share-quantity" || requestedShares !== null ? "share-quantity" : "input";
  const rawStatus = (firstString(status.status, business?.lifecycle, root.status, root.outcome) ?? (preview ? "prepared" : "unknown")).toLowerCase();
  const signature = exactSignature(
    status.transactionSignature,
    business?.transactionSignature,
    root.transactionSignature
  );
  const commitment = commitmentOf(
    status.confirmationCommitment,
    business?.finality,
    status.finality,
    root.confirmationCommitment
  );
  const executionSucceeded = firstBoolean(
    status.executionSucceeded,
    business?.executionSucceeded,
    root.executionSucceeded
  );
  const programError = firstBoolean(status.programError, business?.programError) === true;
  const definitiveNonlandingProof = firstBoolean(
    status.definitiveNonlandingProof,
    business?.definitiveNonlandingProof
  ) === true;
  const identityExact = exactSuccessEnvelopeIdentity({
    root,
    status,
    business,
    tradeSummary
  });
  const classifiedStage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof,
    identityExact
  });
  const maintenance = namespace === "opendexter-governed-maintenance/v1" && rawStatus === "paused" && root.code === "VAULT_PROGRAM_TRANSITION_HELD";
  const localFailure = namespace === "opendexter-governed-backend-failure/v1";
  const stage = localFailure ? operation === "execute" || operation === "reconcile" ? "pending" : "failure" : classifiedStage;
  const quotedInputAtomic = firstInteger(
    tradeSummary?.amountAtomic,
    preview?.maximumInputAmountAtomic,
    preview?.amountAtomic,
    business?.amountAtomic,
    status.amountAtomic
  );
  const expectedOutputAtomic = firstInteger(
    preview?.expectedOutputAtomic,
    status.expectedOutputAtomic,
    business?.expectedOutputAtomic,
    root.expectedOutputAtomic
  );
  const minimumOutputAtomic = firstInteger(
    preview?.minimumOutputAtomic,
    status.minimumOutputAtomic,
    business?.minimumOutputAtomic,
    root.minimumOutputAtomic
  );
  const requestedMaximumSpendAtomic = firstInteger(
    tradeSummary?.requestedMaximumSpendAtomic,
    preview?.requestedMaximumSpendAtomic,
    share?.requestedMaximumSpendAtomic,
    input?.maximumSpendAtomic
  );
  const quotedSpend = action === "buy" ? formatAtomicDecimal(quotedInputAtomic, 6, 6) : null;
  const inputAssetAmount = action === "buy" || product.decimals === null ? null : stage === "prepared" && usdValue !== null ? firstDecimal(usdValue.displayAmount) : formatAtomicDecimal(quotedInputAtomic, product.decimals, product.decimals);
  const amountDisplay = action === "buy" ? quotedSpend : inputAssetAmount ?? groupedInteger(quotedInputAtomic);
  const selectedAssetLabel = firstString(product.symbol, product.assetId) ?? "asset";
  const amountUnit = action === "buy" ? "USDC" : product.decimals === null ? `${selectedAssetLabel} base units` : usdValue?.amountModel === "scaled-ui-amount" && stage !== "prepared" ? `${selectedAssetLabel} (base quantity)` : selectedAssetLabel;
  const outputDecimals = action === "buy" ? product.decimals : action === "sell" ? 6 : null;
  const copy = maintenance ? {
    stageLabel: "Maintenance",
    headline: "Vault operations are temporarily unavailable",
    supporting: "Affected actions can resume after maintenance. Saved results remain available."
  } : stageCopy({
    stage,
    operation,
    action,
    product,
    requestedShares,
    minimumShares,
    quotedSpend,
    amountDisplay,
    amountUnit,
    destinationOwner,
    rawStatus,
    commitment,
    executionSucceeded,
    definitiveNonlandingProof
  });
  const delta = firstRecord(
    status.accountDeltaEvidence,
    business?.accountDeltaEvidence,
    root.accountDeltaEvidence
  );
  const intentId = firstString(status.intentId, root.intentId);
  const reconciliationRequired = firstBoolean(
    status.reconciliationRequired,
    business?.reconciliation && record(business.reconciliation)?.required,
    root.reconciliationRequired
  ) === true;
  const canReconcile = firstBoolean(
    status.canReconcile,
    business?.reconciliation && record(business.reconciliation)?.availableToOwner,
    root.canReconcile
  ) === true;
  const needsStatusCheck = stage === "pending" && (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(rawStatus) || commitment !== null || intentId !== null);
  const approvalStatus = firstString(approval?.status)?.toLowerCase();
  const ownerDecision = ownerDecisionOf(ownerDecisionRecord?.status) ?? (approvalStatus === "owner-approval-required" ? "pending" : approvalStatus === "not-required" ? "not-required" : null);
  const policyDecision = policyDecisionOf(status.policyDecision, root.policyDecision);
  const approvalReasons = Array.from(/* @__PURE__ */ new Set([
    ...stringArray(approval?.reasons),
    ...stringArray(status.escalationReasons),
    ...stringArray(business?.refusalOrEscalationReasons)
  ]));
  const approvalRequired = approvalStatus === "owner-approval-required" || firstBoolean(ownerDecisionRecord?.required) === true || policyDecision === "approval_required";
  const confirmedExecutionOutcome = stage === "success" || stage === "failure" && commitment !== null && executionSucceeded === false && identityExact && !definitiveNonlandingProof && status.landingProof !== false && root.landingProof !== false && (status.landingProof === true || root.landingProof === true || business?.settlement === "landed");
  const recovery = maintenance ? intentId ? { kind: "read", sentence: "Check the result of your original request." } : { kind: "same-request", sentence: "Resume your original request after maintenance." } : recoveryFor({
    stage,
    confirmedOutcome: confirmedExecutionOutcome,
    operation,
    rawStatus,
    retry: firstString(root.retry),
    retryable: firstBoolean(root.retryable),
    intentId,
    reconciliationRequired,
    canReconcile,
    definitiveNonlandingProof,
    reconcileOutcome: operation === "reconcile" ? firstString(root.outcome) : null
  });
  if (action === "unknown" && !product.assetId && !intentId && !preview && rawStatus === "unknown" && !firstString(root.explanation)) {
    return null;
  }
  return {
    namespace,
    operation,
    stage,
    ...copy,
    action,
    rawStatus,
    needsStatusCheck,
    intentId,
    attemptId: firstString(status.attemptId, root.attemptId),
    requestId: firstString(status.requestId, root.requestId, root.operationId),
    destinationOwner,
    protocolId: firstString(status.protocolId, business?.protocolId, root.protocolId),
    createdAt: firstString(status.createdAt, root.createdAt),
    lastActivityAt: firstString(status.lastActivityAt, root.lastActivityAt),
    product,
    requestAmountKind,
    requestedValueUsd: firstDecimal(usdValue?.requestedValueUsd),
    usdValueObservedAtUnixMs: safeInteger(usdValue?.preparedAtUnixMs, 0),
    isShareQuantityOrder: requestAmountKind === "share-quantity",
    requestedShareQuantity: requestedShares,
    expectedShareQuantity: expectedShares,
    minimumShareQuantity: minimumShares,
    shareQuantityUnit: firstString(
      tradeSummary?.shareQuantityUnit,
      preview?.shareQuantityUnit,
      share?.shareQuantityUnit,
      share?.unit
    ),
    shareQuantitySemantics: firstString(
      tradeSummary?.shareQuantitySemantics,
      preview?.shareQuantitySemantics,
      share?.shareQuantitySemantics,
      share?.semantics
    ),
    overfillPossible: firstBoolean(
      tradeSummary?.overfillPossible,
      preview?.overfillPossible,
      share?.overfillPossible
    ) === true,
    quotedInputAtomic,
    expectedOutputAtomic,
    minimumOutputAtomic,
    requestedMaximumSpendAtomic,
    quotedSpend,
    inputAssetAmount,
    expectedOutput: outputDecimals === null ? null : formatAtomicDecimal(expectedOutputAtomic, outputDecimals, outputDecimals),
    minimumOutput: outputDecimals === null ? null : formatAtomicDecimal(minimumOutputAtomic, outputDecimals, outputDecimals),
    requestedMaximumSpend: formatAtomicDecimal(requestedMaximumSpendAtomic, 6, 6),
    amountDisplay,
    amountUnit,
    slippageBps: safeInteger(preview?.slippageBps, 0, 1e4),
    priceImpactBps: safeInteger(preview?.priceImpactBps, 0, 1e4),
    quoteExpiresAtUnixMs: safeInteger(preview?.quoteExpiresAtUnixMs, 0),
    fees: normalizeFees(feeSummary),
    transactionSignature: signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    confirmationCommitment: commitment,
    executionSucceeded,
    confirmedExecutionOutcome,
    finalizedEvidence: commitment === "finalized",
    accountDeltaObserved: firstBoolean(delta?.observed),
    accountDeltaMatchesExpected: firstBoolean(delta?.matchesExpected),
    actor: actorOf(status.actor, attribution?.actor, root.actor),
    grantId: firstString(status.grantId, grant?.id, root.grantId),
    grantRevision: safeInteger(
      status.grantRevision ?? grant?.revision ?? root.grantRevision,
      0
    ),
    grantRuleId: firstString(status.grantRuleId, grant?.ruleId, root.grantRuleId),
    authorityExpiresAt: firstString(
      status.authorityExpiresAt,
      grant?.expiresAt,
      root.authorityExpiresAt
    ),
    policyDecision,
    ownerDecision,
    approvalRequired,
    approvalReasons,
    submitted: firstBoolean(status.submitted, execution?.submitted, root.submitted),
    signed: firstBoolean(status.signed, execution?.signed, root.signed),
    landingProof: firstBoolean(status.landingProof, root.landingProof),
    definitiveNonlandingProof,
    settlementFinalized: firstBoolean(
      status.settlementFinalized,
      root.settlementFinalized
    ),
    reconciliationRequired,
    canReconcile,
    reconcileOutcome: operation === "reconcile" ? firstString(root.outcome) : null,
    reconcilePhase: operation === "reconcile" ? firstString(root.phase) : null,
    reconcileMutated: operation === "reconcile" ? firstBoolean(root.mutated) : null,
    receiptPhases: stringArray(status.receiptPhases),
    statusReadSafe: firstBoolean(replay?.statusReadSafe),
    reconcileSameAttemptOnly: firstBoolean(replay?.reconcileSameAttemptOnly),
    executeFromStatusForbidden: firstBoolean(replay?.executeFromStatusForbidden),
    evidenceDigest: firstString(root.evidenceDigest, status.evidenceDigest),
    reconciliationEvidenceDigest: firstString(
      status.reconciliationEvidenceDigest,
      root.reconciliationEvidenceDigest,
      root.digest
    ),
    recovery,
    refusalCode: firstString(
      status.refusalCode,
      root.refusalCode,
      root.code,
      business?.refusalCode
    ),
    explanation: firstString(root.explanation, status.explanation, business?.explanation)
  };
}
function normalizeGovernedHistory(payload) {
  const root = record(payload);
  if (root?.namespace !== "dexter-governed-transaction-history/v1" || !Array.isArray(root.items)) return null;
  const items = root.items.map((item) => normalizeGovernedAction(item)).filter((item) => item !== null);
  const nextCursor = stringValue(root.nextCursor);
  return {
    namespace: "dexter-governed-transaction-history/v1",
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    omittedItems: root.items.length - items.length
  };
}
function displayShareQuantity(value) {
  return displayQuantity(value);
}
function shortenSolanaIdentity(value, size = 5) {
  if (!value) return null;
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}
const XSTOCKS_SYMBOL_URL = new URL("data:image/svg+xml,%3csvg%20width='800'%20height='801'%20viewBox='0%200%20800%20801'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M800%206.00637C800%202.78947%20797.392%200.181652%20794.175%200.181652L533.333%200.181641L400%20133.515L266.667%200.181652H5.82473C2.60782%200.181652%206.4736e-06%202.78947%206.4736e-06%206.00638V266.848L133.333%20400.182L1.14018e-05%20533.515L0%20794.357C-1.40616e-07%20797.574%202.60782%20800.182%205.82472%20800.182H266.667L400%20666.848L533.333%20800.182H794.175C797.392%20800.182%20800%20797.574%20800%20794.357V533.515L666.667%20400.182L800%20266.848V6.00637Z'%20fill='url(%23paint0_linear_138_3037)'/%3e%3cdefs%3e%3clinearGradient%20id='paint0_linear_138_3037'%20x1='800'%20y1='0.181641'%20x2='6.10352e-05'%20y2='800.182'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20stop-color='%236EC7E2'/%3e%3cstop%20offset='1'%20stop-color='%231FD59A'/%3e%3c/linearGradient%3e%3c/defs%3e%3c/svg%3e", import.meta.url).href;
const XSTOCKS_LEGAL_ISSUER = "Backed Assets (JE) Limited";
const XSTOCKS_PROVIDER_NAMES = /* @__PURE__ */ new Set(["Backed Finance", "xStocks"]);
function CheckIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m5 10 3 3 7-7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ExternalIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4h5v5M9 11l7-7M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function BackIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 10H4m5-5-5 5 5 5", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function StatusMark({ stage }) {
  if (stage === "success") return /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon, {});
  if (stage === "failure") return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "x" });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__status-dot", "aria-hidden": "true" });
}
function formatBps(value) {
  if (value === null) return null;
  const percentage = value / 100;
  return `${percentage.toLocaleString("en-US", {
    minimumFractionDigits: percentage % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}%`;
}
function formatDateTime(value) {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function feeLineLabel(amountAtomic, mint) {
  const amount = amountAtomic.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount} base units / ${shortenSolanaIdentity(mint, 5) ?? mint}`;
}
function productName(model) {
  return [
    model.product.companyName,
    model.product.productName,
    model.product.symbol,
    model.product.assetId
  ].find((value) => Boolean(value)) ?? "Selected asset";
}
function isOfficialXStocksProduct(model) {
  return model.product.assetClass === "stock" && model.product.legalIssuerName === XSTOCKS_LEGAL_ISSUER && model.product.providerName !== null && XSTOCKS_PROVIDER_NAMES.has(model.product.providerName);
}
function displayCode(value) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
function operationLabel(operation) {
  if (operation === "prepare") return "Preparation";
  if (operation === "execute") return "Execution request";
  if (operation === "status") return "Status read";
  if (operation === "reconcile") return "Reconciliation";
  return "Governed action";
}
function exactTerms(model) {
  const requested = displayShareQuantity(model.requestedShareQuantity);
  displayShareQuantity(model.expectedShareQuantity);
  const minimumShares = displayShareQuantity(model.minimumShareQuantity);
  const symbol = model.product.symbol ?? model.product.assetId ?? "asset";
  const terms = [];
  if (model.action === "buy") {
    if (model.quotedSpend) {
      terms.push({ label: "Spend", value: `$${model.quotedSpend}`, detail: "USDC" });
    }
    if (requested) {
      terms.push({
        label: "Buy",
        value: requested,
        detail: requested === "1" ? "share" : "shares"
      });
    } else if (model.expectedOutput) {
      terms.push({ label: "Expected", value: model.expectedOutput, detail: symbol });
    }
    if (minimumShares) {
      terms.push({ label: "Minimum", value: minimumShares, detail: "shares" });
    } else if (model.minimumOutput) {
      terms.push({ label: "Minimum", value: model.minimumOutput, detail: symbol });
    }
  } else if (model.action === "sell") {
    if (model.requestAmountKind === "usd-value" && model.requestedValueUsd) {
      const [whole, fraction = ""] = model.requestedValueUsd.split(".");
      terms.push({
        label: "Requested",
        value: `$${whole}.${fraction.padEnd(2, "0")}`,
        detail: `of ${productName(model)}`
      });
    }
    if (model.amountDisplay) {
      terms.push({ label: "Sell", value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    if (model.expectedOutput) {
      terms.push({ label: "Expected", value: `$${model.expectedOutput}`, detail: "USDC" });
    }
    if (model.minimumOutput) {
      terms.push({ label: "Minimum", value: `$${model.minimumOutput}`, detail: "USDC" });
    }
  } else if (model.action === "send") {
    if (model.amountDisplay) {
      terms.push({ label: "Send", value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    const destination = shortenSolanaIdentity(model.destinationOwner, 7);
    if (destination) {
      terms.push({
        label: "To",
        value: destination,
        detail: "Solana address",
        presentation: "identity"
      });
    }
  } else if (model.amountDisplay) {
    terms.push({ label: "Amount", value: model.amountDisplay, detail: model.amountUnit ?? void 0 });
  }
  if (model.requestedMaximumSpend && model.quotedSpend) {
    terms.push({ label: "Spend limit", value: `$${model.requestedMaximumSpend}`, detail: "USDC" });
  }
  return terms;
}
function Economics({ model }) {
  const terms = exactTerms(model);
  if (terms.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__terms", "aria-label": "Exact financial terms", children: terms.map((term) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-presentation": term.presentation, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: term.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: term.value }),
      term.detail ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: term.detail }) : null
    ] })
  ] }, `${term.label}:${term.value}`)) });
}
function AssetIdentity({ model }) {
  const product = model.product;
  if (!product.assetId && !product.productName && !product.symbol) return null;
  const provider = product.providerName ?? (product.assetClass === "stock" ? product.issuer : null);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-asset-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-asset-title", children: "Asset" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__asset", children: [
      isOfficialXStocksProduct(model) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: XSTOCKS_SYMBOL_URL,
          alt: "",
          "aria-hidden": "true",
          width: 32,
          height: 32,
          className: "dx-action__asset-mark"
        }
      ) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: productName(model) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: [product.symbol, provider ? `Provider: ${provider}` : null].filter(Boolean).join(" / ") })
      ] })
    ] })
  ] });
}
function approvalLabel(model) {
  if (model.ownerDecision === "approved") return "Approved by owner";
  if (model.ownerDecision === "refused") return "Refused by owner";
  if (model.approvalRequired || model.ownerDecision === "pending") return "Pending in Dexter Wallet";
  if (model.ownerDecision === "not-required") return "Not required";
  return "Not reported";
}
function Authority({ model }) {
  const grant = shortenSolanaIdentity(model.grantId, 6);
  const expires = formatDateTime(model.authorityExpiresAt);
  const authorityPresent = model.actor !== "unknown" || grant !== null || model.policyDecision !== null || model.ownerDecision !== null || model.approvalRequired;
  if (!authorityPresent) return null;
  const authoritySentence = model.actor === "agent" ? grant ? `Agent authority came from mandate ${grant}.` : "Dexter recorded agent authority for this action." : model.actor === "owner" ? "The wallet owner acted directly." : "Dexter returned an authority decision for this action.";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-authority-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-authority-title", children: "Authority" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: authoritySentence }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-action__facts", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Owner approval" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: approvalLabel(model) })
      ] }),
      model.policyDecision ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Policy" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.policyDecision === "allowed" ? "Within mandate" : "Approval required" })
      ] }) : null,
      model.grantRevision !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Mandate revision" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.grantRevision.toLocaleString("en-US") })
      ] }) : null,
      expires ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Authority expires" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: expires })
      ] }) : null
    ] }),
    model.approvalRequired && model.ownerDecision !== "approved" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__approval-note", children: "Approval belongs in Dexter Wallet. This view cannot grant it or execute the action." }) : null,
    model.approvalReasons.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__reasons", children: model.approvalReasons.map(displayCode).join(", ") }) : null
  ] });
}
function executionSentence(model) {
  if (model.namespace === "opendexter-governed-maintenance/v1") {
    return "This response does not report an execution outcome.";
  }
  if (model.confirmedExecutionOutcome) {
    const commitment = model.confirmationCommitment === "finalized" ? "Finalized" : "Confirmed";
    const outcome = model.executionSucceeded === true ? "successful" : "failed";
    return `${commitment} on Solana with ${outcome} execution.`;
  }
  if (model.definitiveNonlandingProof) return "Dexter proved that the transaction did not land.";
  if (model.stage === "prepared") return "The action is unsigned and has not been submitted.";
  if (model.stage === "failure") return "The action stopped without successful execution.";
  if (model.rawStatus === "signed") return "The transaction is signed; submission and landing remain unproven.";
  if (model.submitted === true) return "The transaction was submitted; landing and execution remain unproven.";
  return "The execution outcome remains open.";
}
function Execution({ model }) {
  const signature = shortenSolanaIdentity(model.transactionSignature, 7);
  const chainStatus = model.confirmationCommitment ? model.confirmationCommitment === "finalized" ? "Finalized" : "Confirmed" : model.definitiveNonlandingProof ? "Proven not landed" : model.landingProof === true ? "Landed" : model.submitted === true ? "Submitted" : "No landing proof";
  const executionStatus = model.executionSucceeded === true ? "Succeeded" : model.executionSucceeded === false ? "Failed" : "Unproven";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-execution-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-execution-title", children: "Execution" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: executionSentence(model) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-action__facts dx-action__facts--evidence", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-evidence": "commitment", "data-result": model.confirmationCommitment ? "confirmed" : "unconfirmed", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Solana status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: chainStatus })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-evidence": "execution", "data-result": model.executionSucceeded === true ? "succeeded" : model.executionSucceeded === false ? "failed" : "unknown", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Execution" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: executionStatus })
      ] }),
      signature ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Signature" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: model.transactionSignature ?? void 0, children: signature })
      ] }) : null
    ] })
  ] });
}
function ReceiptDetails({ model }) {
  const fields = [
    model.confirmedExecutionOutcome && model.explanation ? { label: "Original explanation", value: model.explanation, wrap: true } : null,
    { label: "Operation", value: operationLabel(model.operation) },
    model.intentId ? { label: "Intent", value: shortenSolanaIdentity(model.intentId, 7) ?? model.intentId } : null,
    model.attemptId ? { label: "Attempt", value: shortenSolanaIdentity(model.attemptId, 7) ?? model.attemptId } : null,
    model.requestId ? { label: "Request", value: shortenSolanaIdentity(model.requestId, 7) ?? model.requestId } : null,
    model.protocolId ? { label: "Protocol", value: model.protocolId } : null,
    model.product.mint ? { label: "Mint", value: shortenSolanaIdentity(model.product.mint, 7) ?? model.product.mint } : null,
    model.product.tokenProgram ? { label: "Token standard", value: model.product.tokenProgram === "token-2022" ? "Token-2022" : model.product.tokenProgram } : null,
    model.product.legalIssuerName ? { label: "Legal issuer", value: model.product.legalIssuerName } : null,
    model.reconcileOutcome ? { label: "Reconciliation", value: displayCode(model.reconcileOutcome) } : null,
    model.reconcilePhase ? { label: "Reconciliation phase", value: displayCode(model.reconcilePhase) } : null,
    model.reconcileMutated !== null ? { label: "Reconciliation change", value: model.reconcileMutated ? "State advanced" : "No state change" } : null,
    model.settlementFinalized !== null ? { label: "Settlement finality", value: model.settlementFinalized ? "Finalized" : "Not finalized" } : null,
    model.accountDeltaObserved !== null ? { label: "Account delta", value: model.accountDeltaObserved ? "Observed" : "Not observed" } : null,
    model.accountDeltaMatchesExpected !== null ? { label: "Expected delta", value: model.accountDeltaMatchesExpected ? "Matched" : "Did not match" } : null,
    model.statusReadSafe === true ? { label: "Status read", value: "Read-only" } : null,
    model.reconcileSameAttemptOnly === true ? { label: "Reconciliation scope", value: "Same attempt only" } : null,
    model.executeFromStatusForbidden === true ? { label: "Execute from status", value: "Forbidden" } : null,
    model.receiptPhases.length > 0 ? { label: "Receipt phases", value: model.receiptPhases.map(displayCode).join(", ") } : null,
    model.evidenceDigest ? { label: "Execution evidence", value: shortenSolanaIdentity(model.evidenceDigest, 7) ?? model.evidenceDigest } : null,
    model.reconciliationEvidenceDigest ? { label: "Reconciliation evidence", value: shortenSolanaIdentity(model.reconciliationEvidenceDigest, 7) ?? model.reconciliationEvidenceDigest } : null
  ].filter((field) => field !== null);
  if (fields.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dx-action__details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Receipt details" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__receipt-grid", children: fields.map((field) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: field.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: field.value, style: field.wrap ? { whiteSpace: "normal", overflowWrap: "anywhere" } : void 0, children: field.value })
    ] }, `${field.label}:${field.value}`)) })
  ] });
}
function QuoteDetails({ model }) {
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const slippage = formatBps(model.slippageBps);
  const priceImpact = formatBps(model.priceImpactBps);
  const expiry = formatDateTime(model.quoteExpiresAtUnixMs);
  const feeLines = model.fees ? [
    model.fees.platformFee ? ["Platform fee", feeLineLabel(
      model.fees.platformFee.amountAtomic,
      model.fees.platformFee.mint
    )] : null,
    ...model.fees.routeFees.map((fee, index) => [
      `Route fee ${index + 1}`,
      feeLineLabel(fee.amountAtomic, fee.mint)
    ])
  ].filter((field) => field !== null) : [];
  const fields = [
    expected ? ["Expected shares", expected] : null,
    minimum ? ["Minimum shares", minimum] : null,
    slippage ? ["Slippage limit", slippage] : null,
    priceImpact ? ["Price-impact limit", priceImpact] : null,
    expiry ? ["Quote expires", expiry] : null,
    model.fees ? ["Fees", model.fees.summary] : null,
    model.fees?.networkFeeStatus === "not-yet-calculated" ? ["Network fee", "Calculated at execution"] : model.fees?.networkFeeLamports ? ["Network fee", `${formatAtomicDecimal(model.fees.networkFeeLamports, 9, 9) ?? model.fees.networkFeeLamports} SOL`] : null,
    ...feeLines
  ].filter((field) => field !== null);
  if (fields.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dx-action__details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Quote details" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__receipt-grid", children: fields.map(([label, value]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: value })
    ] }, label)) })
  ] });
}
function GovernedLoading({
  rootRef,
  style
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", rootRef, style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action dx-action--loading", role: "status", "aria-live": "polite", "aria-label": "Loading governed action", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--state" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--title" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--copy" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__skeleton-terms", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" })
    ] })
  ] }) });
}
function GovernedActionDetail({
  model,
  openExternal,
  onBack,
  compact = false,
  onExpand
}) {
  const updated = formatDateTime(model.lastActivityAt ?? model.createdAt);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: `dx-action${compact ? " dx-action--compact" : ""}`, "data-stage": model.stage, "aria-live": "polite", children: [
    onBack ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "dx-action__back", onClick: onBack, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BackIcon, {}),
      "Back to history"
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-action__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__status", "data-stage": model.stage, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusMark, { stage: model.stage }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: model.stageLabel }),
        updated ? /* @__PURE__ */ jsxRuntimeExports.jsx("time", { dateTime: model.lastActivityAt ?? model.createdAt ?? void 0, children: updated }) : null
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: model.headline }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: model.supporting })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Economics, { model }),
    compact ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__compact-evidence", "aria-label": "Authority and execution summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-action__facts", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Owner approval" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: approvalLabel(model) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-evidence": "execution", "data-result": model.executionSucceeded === true ? "succeeded" : model.executionSucceeded === false ? "failed" : "unknown", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Execution" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: executionSentence(model) })
        ] })
      ] }),
      model.approvalRequired && model.ownerDecision !== "approved" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__approval-note", children: "Approval belongs in Dexter Wallet. This view cannot grant it or execute the action." }) : null,
      model.recovery.sentence ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__recovery", "data-kind": model.recovery.kind, role: "status", children: model.recovery.sentence }) : null,
      onExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "dx-action__expand", onClick: onExpand, children: model.namespace === "opendexter-governed-maintenance/v1" ? "View details" : "View full receipt" }) : null
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Authority, { model }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Execution, { model }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AssetIdentity, { model }),
      model.explanation && model.explanation !== model.supporting && !model.confirmedExecutionOutcome ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__explanation", role: model.stage === "failure" ? "alert" : void 0, children: model.explanation }) : null,
      model.recovery.sentence ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__recovery", "data-kind": model.recovery.kind, role: "status", children: model.recovery.sentence }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx(QuoteDetails, { model }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptDetails, { model }),
      model.solscanUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          className: "dx-action__external",
          onClick: () => openExternal(model.solscanUrl),
          "aria-label": "View this transaction on Solscan",
          children: [
            "View on Solscan",
            /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalIcon, {})
          ]
        }
      ) : null
    ] })
  ] });
}
function GovernedActionView() {
  const output = useToolOutput();
  const responseMetadata = useToolResponseMetadata();
  const renderOutput = selectGovernedWidgetResult(output, responseMetadata);
  const input = useToolInput();
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const hostContext = useAdaptiveHostContext();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const openExternal = useAdaptiveOpenExternal();
  const rootRef = useIntrinsicHeight();
  const model = reactExports.useMemo(
    () => normalizeGovernedAction(renderOutput, input),
    [renderOutput, input]
  );
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const canExpand = Boolean(requestDisplayMode && hostCapabilities.requestDisplayMode);
  const isFullscreen = displayMode === "fullscreen";
  const rootStyle = isFullscreen ? {
    paddingTop: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.top}px)`,
    paddingRight: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.right}px)`,
    paddingBottom: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.bottom}px)`,
    paddingLeft: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.left}px)`
  } : void 0;
  const requestMode = (mode) => {
    if (!requestDisplayMode) return;
    void requestDisplayMode({ mode }).catch(() => {
    });
  };
  if (renderOutput === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(GovernedLoading, { rootRef, style: rootStyle });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", rootRef, style: rootStyle, children: model ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    GovernedActionDetail,
    {
      model,
      openExternal,
      compact: !isFullscreen && canExpand,
      onExpand: canExpand ? () => requestMode("fullscreen") : void 0
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetEmpty,
    {
      title: "No governed-action details available",
      description: "Read the same intent again. This view will not start an execution."
    }
  ) });
}
export {
  GovernedActionDetail as G,
  WidgetShell as W,
  WidgetError as a,
  WidgetEmpty as b,
  GovernedActionView as c,
  normalizeGovernedHistory as n,
  selectGovernedWidgetResult as s
};
