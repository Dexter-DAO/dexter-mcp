import { u as useToolOutput, a as useAdaptiveTheme, b as useAdaptiveMaxHeight, c as useAdaptiveDisplayMode, d as useAdaptiveHostContext, e as useAdaptiveHostCapabilities, f as useAdaptiveRequestDisplayMode, r as reactExports, j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
/* empty css             */
import { c as clientExports } from "./client-BiBV5Ase.js";
import { L as Lockup } from "./Lockup-C9TGOrcD.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-BzjHxK4c.js";
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
const ASSET_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_MAX = 18446744073709551615n;
const GOVERNED_ACTIONS = ["buy", "sell", "send"];
const GOVERNED_UNAVAILABLE_REASONS = /* @__PURE__ */ new Set([
  "governed_asset_rail_not_live",
  "governed_asset_action_not_supported",
  "protected_agent_send_sdk_required"
]);
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmptyString(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
  return value;
}
function safeCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function decimal(value) {
  return typeof value === "string" && DECIMAL.test(value) ? value : null;
}
function nullableDecimal(value) {
  if (value === null) return null;
  return decimal(value) ?? void 0;
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
function parseHolding(value) {
  const source = record(value);
  if (!source) return null;
  const assetId = source.assetId === null ? null : typeof source.assetId === "string" && ASSET_ID.test(source.assetId) ? source.assetId : void 0;
  const mint = nonEmptyString(source.mint, 128);
  const tokenAccount = source.tokenAccount === null ? null : nonEmptyString(source.tokenAccount, 128) ?? void 0;
  const tokenProgram = source.tokenProgram === "native" || source.tokenProgram === "spl-token" || source.tokenProgram === "token-2022" ? source.tokenProgram : null;
  const assetClass = source.assetClass === "cash" || source.assetClass === "yield" || source.assetClass === "token" || source.assetClass === "stock" || source.assetClass === "fund" || source.assetClass === "nft" || source.assetClass === "rwa" ? source.assetClass : null;
  const amountRaw = typeof source.amountRaw === "string" && INTEGER.test(source.amountRaw) ? source.amountRaw : null;
  const decimals = safeCount(source.decimals);
  const displayAmount = decimal(source.displayAmount);
  const amountModel = source.amountModel === "raw-decimals" || source.amountModel === "scaled-ui-amount" || source.amountModel === "unknown" ? source.amountModel : null;
  const accountState = source.accountState === "initialized" || source.accountState === "frozen" || source.accountState === "unknown" ? source.accountState : null;
  const valueUsd = nullableDecimal(source.valueUsd);
  const priceUsd = nullableDecimal(source.priceUsd);
  const priceObservedAt = nullableIsoDate(source.priceObservedAt);
  const approvalStatus = source.approvalStatus === "approved" || source.approvalStatus === "unreviewed" || source.approvalStatus === "blocked" ? source.approvalStatus : null;
  const actions = Array.isArray(source.availableActions) ? source.availableActions : null;
  if (assetId === void 0 || !mint || tokenAccount === void 0 || !tokenProgram || !assetClass || !amountRaw || BigInt(amountRaw) > U64_MAX || decimals === null || decimals > 255 || !displayAmount || !amountModel || !accountState || tokenProgram === "native" !== (mint === "native:SOL") || tokenProgram === "native" && tokenAccount !== null || tokenProgram !== "native" && tokenAccount === null || valueUsd === void 0 || priceUsd === void 0 || priceObservedAt === void 0 || !approvalStatus || !actions || !actions.every((action) => PORTFOLIO_ACTIONS.includes(action)) || new Set(actions).size !== actions.length || approvalStatus === "approved" && assetId === null || approvalStatus !== "approved" && assetId !== null || amountModel !== "scaled-ui-amount" && displayAmount !== rawDecimal(amountRaw, decimals)) {
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
    availableActions: actions
  };
}
function parseApprovedAction(value, assetId, index) {
  const source = record(value);
  const expectedAction = GOVERNED_ACTIONS[index];
  if (!source || source.namespace !== "dexter-governed-asset-action-availability/v1" || source.action !== expectedAction || source.assetId !== assetId || typeof source.registryIdentityDigest !== "string" || !SHA256_HEX.test(source.registryIdentityDigest) || typeof source.runtimeReleaseDigest !== "string" || !SHA256_HEX.test(source.runtimeReleaseDigest) || typeof source.available !== "boolean" || typeof source.receiptDigest !== "string" || !SHA256_HEX.test(source.receiptDigest)) {
    return null;
  }
  const reason = source.reason;
  if (source.available && reason !== null || !source.available && !GOVERNED_UNAVAILABLE_REASONS.has(reason)) {
    return null;
  }
  return {
    action: expectedAction,
    available: source.available,
    reason
  };
}
function parseApprovedTarget(value) {
  const source = record(value);
  const assetId = typeof source?.assetId === "string" && ASSET_ID.test(source.assetId) ? source.assetId : null;
  const symbol = nonEmptyString(source?.symbol, 32);
  const name = nonEmptyString(source?.name, 128);
  const mint = typeof source?.mint === "string" && SOLANA_ADDRESS.test(source.mint) ? source.mint : null;
  const tokenProgram = source?.tokenProgram === "spl-token" || source?.tokenProgram === "token-2022" ? source.tokenProgram : null;
  const decimals = safeCount(source?.decimals);
  const actions = Array.isArray(source?.actions) && assetId ? source.actions.map((action, index) => parseApprovedAction(action, assetId, index)) : null;
  if (!source || source.namespace !== "dexter-approved-action-target/v1" || !assetId || !symbol || !name || source.network !== "solana-mainnet" || !mint || !tokenProgram || decimals === null || decimals > 18 || !actions || actions.length !== GOVERNED_ACTIONS.length || actions.some((action) => action === null) || typeof source.targetDigest !== "string" || !SHA256_HEX.test(source.targetDigest)) {
    return null;
  }
  return {
    assetId,
    symbol,
    name,
    network: "solana-mainnet",
    mint,
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
  const holdings = Array.isArray(source.holdings) ? source.holdings.map(parseHolding) : null;
  const targets = source.approvedActionTargets === void 0 ? [] : Array.isArray(source.approvedActionTargets) ? source.approvedActionTargets.map(parseApprovedTarget) : null;
  if (source.contractVersion !== "opendexter.portfolio.v1" || source.network !== "solana-mainnet" || !walletAddress || !observedAt || source.contextSlot !== null && contextSlot === null || typeof source.holdingsComplete !== "boolean" || omittedHoldings === null || !pricedValueUsd || portfolioValueUsd === void 0 || pricedHoldings === null || unpricedHoldings === null || !holdings || holdings.some((holding) => holding === null) || !targets || targets.some((target) => target === null)) {
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
  if (pricedHoldings !== calculatedPriced.length || unpricedHoldings !== calculatedUnpriced || pricedValueUsd !== calculatedValue || source.holdingsComplete && omittedHoldings !== 0 || (source.holdingsComplete && calculatedUnpriced === 0 ? portfolioValueUsd !== pricedValueUsd : portfolioValueUsd !== null) || new Set(targetAssetIds).size !== targetAssetIds.length || new Set(targetMints).size !== targetMints.length || targetAssetIds.some((assetId, index) => index > 0 && targetAssetIds[index - 1] >= assetId)) {
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
    holdings: parsedHoldings,
    approvedActionTargets: parsedTargets
  };
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
function normalizeDexterPortfolio(value) {
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
    return {
      state: "read_error",
      title: "Portfolio unavailable",
      body: safeMessage(source.message) ?? "Dexter could not complete the portfolio read. Retry the same request in a moment."
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
function unavailableActionText(action) {
  const name = sentenceCase(action.action);
  if (action.reason === "protected_agent_send_sdk_required") {
    return "Send requires the protected agent SDK.";
  }
  if (action.reason === "governed_asset_action_not_supported") {
    return `${name} is unavailable for this asset.`;
  }
  return `${name} is unavailable because the governed asset rail is not live.`;
}
function targetActionText(target) {
  const available = target.actions.filter((action) => action.available).map((action) => action.action);
  const unavailable = target.actions.filter((action) => !action.available).map(unavailableActionText);
  const sentences = [];
  if (available.length > 0) {
    const names = readableList(available.map((action) => action.replace(/-/g, " ")));
    sentences.push(`${sentenceCase(names)} ${available.length === 1 ? "is" : "are"} available.`);
  } else {
    sentences.push("No governed actions are currently available.");
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
function displayAssetLabel(assetId, assetClass) {
  if (!assetId) return sentenceCase(assetClass);
  return assetId.split(/[-_]+/u).filter(Boolean).map((part) => ASSET_WORDMARKS[part] ?? (part.length <= 5 ? part.toUpperCase() : sentenceCase(part))).join(" ");
}
function InlineHolding({ holding }) {
  const name = displayAssetLabel(holding.assetId, holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-inline-holding", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-inline-holding__name", title: holding.assetId ?? holding.mint, children: name }),
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
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatObservedAt(model.snapshot.observedAt) })
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
function InlineBrowserItem({ item }) {
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
  const name = displayAssetLabel(holding.assetId, holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-browser-item", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__identity", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holdingStateText(holding) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-browser-item__values", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: formatExactDecimal(holding.displayAmount) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.valueUsd === null ? "Unpriced" : formatExactUsd(holding.valueUsd) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: holdingActionText(holding.availableActions) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("code", { "aria-label": `Mint ${holding.mint}`, children: [
      "Mint ",
      holding.mint
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
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { id: "dxp-browser-title", children: "Portfolio details" }),
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
            formatObservedAt(model.snapshot.observedAt)
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
  const identity = holding.assetId ?? shortenIdentity(holding.mint);
  const unit = holding.assetId ?? sentenceCase(holding.assetClass);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-holding", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-holding__identity", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: holding.assetId ?? holding.mint, children: identity }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
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
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: holding.priceUsd === null ? "No current price" : `${formatExactUsd(holding.priceUsd)} per unit` })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxp-holding__details", children: [
      holdingActionText(holding.availableActions),
      " Mint",
      " ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: holding.mint, children: shortenIdentity(holding.mint, 9, 9) }),
      "."
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
function TargetRow({ target }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dxp-target", "data-discovery-context": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxp-target__title", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: target.symbol }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: target.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("code", { title: target.assetId, children: target.assetId }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: targetActionText(target) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dxp-target__holding-state", children: "Not held" })
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
      "Wallet ",
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
    ] })
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
function PortfolioLedger() {
  const toolOutput = useToolOutput();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const displayMode = useAdaptiveDisplayMode();
  const hostContext = useAdaptiveHostContext();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const rootRef = useIntrinsicHeight();
  const model = reactExports.useMemo(() => normalizeDexterPortfolio(toolOutput), [toolOutput]);
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
      className: `dxp-root ${isFullscreen ? "dxp-root--fullscreen" : "dxp-root--inline"}`,
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
        model.state !== "loading" && model.state !== "ready" ? /* @__PURE__ */ jsxRuntimeExports.jsx(StateLedger, { model, compact: condensed }) : null
      ]
    }
  );
}
const root = document.getElementById("dexter-portfolio-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.portfolio-ledger";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PortfolioLedger, {}));
}
