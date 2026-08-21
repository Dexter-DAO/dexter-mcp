import { j as jsxRuntimeExports, u as useToolOutput, b as useAdaptiveTheme, d as useAdaptiveOpenExternal, r as reactExports } from "./adapter-C5lR_HvA.js";
/* empty css             */
import { c as clientExports } from "./client-C1-6VL7X.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
function useToolInput() {
  return useOpenAIGlobal("toolInput");
}
function WidgetShell({
  children,
  style,
  density = "comfortable",
  width = "auto"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "dx-widget",
      "data-density": density,
      "data-width": width,
      style,
      children
    }
  );
}
function WidgetHeader({
  title,
  eyebrow,
  supporting,
  trailing
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-widget__header", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__heading", children: [
      eyebrow ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "span",
        {
          className: "dx-widget__eyebrow",
          "data-tone": eyebrow.tone ?? "default",
          children: [
            eyebrow.prefix,
            eyebrow.label
          ]
        }
      ) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "dx-widget__title", children: title }),
      supporting ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-widget__supporting", children: supporting }) : null
    ] }),
    trailing ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__trailing", children: trailing }) : null
  ] });
}
function WidgetSection({
  title,
  description,
  framed = false,
  trailing,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "dx-widget__section",
      "data-framed": framed ? "true" : "false",
      children: [
        title || description || trailing ? /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-widget__section-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__section-heading", children: [
            title ? /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-widget__section-title", children: title }) : null,
            description ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-widget__section-description", children: description }) : null
          ] }),
          trailing ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__section-trailing", children: trailing }) : null
        ] }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__section-body", children })
      ]
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
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
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
function safeNumber(value) {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  const candidate = stringValue(value);
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
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
    decimals: safeNumber(identity?.decimals),
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
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const rawFraction = decimals === 0 ? "" : padded.slice(-decimals);
  const fraction = rawFraction.slice(0, Math.max(0, maximumFractionDigits)).replace(/0+$/, "");
  const grouped = BigInt(integer).toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
function displayQuantity(value) {
  if (!value) return null;
  const [integer, fraction = ""] = value.split(".");
  const grouped = BigInt(integer).toLocaleString("en-US");
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
  return signature && SOLANA_SIGNATURE.test(signature) ? signature : null;
}
function productLabel(product) {
  return product.companyName ?? product.productName ?? product.symbol ?? product.assetId ?? "asset";
}
function sharePhrase(quantity) {
  const displayed = displayQuantity(quantity);
  if (!displayed) return "the requested amount";
  return `${displayed} ${displayed === "1" ? "share" : "shares"}`;
}
function classifyStage(input) {
  if (input.signature !== null && input.commitment !== null && input.executionSucceeded === true) {
    return "success";
  }
  if (input.executionSucceeded === false || input.programError || input.definitiveNonlandingProof || ["failed", "refused", "provably_not_landed"].includes(input.rawStatus)) {
    return "failure";
  }
  if (input.rawStatus === "prepared") return "prepared";
  return "pending";
}
function stageCopy(input) {
  const product = productLabel(input.product);
  const action = input.action === "unknown" ? "trade" : input.action;
  const target = sharePhrase(input.requestedShares ?? input.minimumShares);
  if (input.stage === "success") {
    return {
      stageLabel: "Confirmed",
      headline: input.action === "buy" ? `${product} purchase confirmed` : `${product} ${action} confirmed`,
      supporting: input.action === "buy" ? `Solana confirmed the transaction, and Dexter reports that execution succeeded${input.requestedShares ? ` for at least ${target}` : ""}.` : `Solana confirmed this ${action}.`
    };
  }
  if (input.stage === "failure") {
    return {
      stageLabel: "Failed",
      headline: input.action === "buy" ? `${product} purchase failed` : `${product} ${action} failed`,
      supporting: "The transaction did not complete successfully. No success is being claimed."
    };
  }
  if (input.stage === "prepared") {
    const preparedState = input.action === "buy" ? "bought" : input.action === "sell" ? "sold" : input.action === "send" ? "sent" : "submitted";
    return {
      stageLabel: "Preview",
      headline: input.action === "buy" ? input.isShareQuantityOrder ? `Buy ${target} of ${product}` : input.quotedSpend ? `Buy $${input.quotedSpend} of ${product}` : `Buy ${product}` : `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} ${product}`,
      supporting: `Review the exact Solana asset and quote. This is prepared, not yet ${preparedState}.`
    };
  }
  if (input.commitment !== null && input.executionSucceeded !== true) {
    return {
      stageLabel: "Confirming",
      headline: `${product} ${input.action === "buy" ? "purchase" : action} is being verified`,
      supporting: "Solana confirmation is present, but the execution result is not yet proven successful."
    };
  }
  if (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(input.rawStatus)) {
    return {
      stageLabel: "Needs check",
      headline: `${product} ${input.action === "buy" ? "purchase" : action} needs a status check`,
      supporting: "Dexter will inspect this same transaction. It will not place a replacement trade."
    };
  }
  return {
    stageLabel: "Confirming",
    headline: `${product} ${input.action === "buy" ? "purchase" : action} is confirming`,
    supporting: input.rawStatus === "signed" ? "The trade is signed and waiting to be sent or confirmed on Solana." : "The trade is waiting for Solana confirmation."
  };
}
function normalizeStockTrade(payload, toolInput = null) {
  const root2 = record(payload);
  if (!root2) return null;
  const input = record(toolInput);
  const statusAfter = record(root2.statusAfter);
  const status = statusAfter ?? root2;
  const preview = firstRecord(root2.preview, status.preview);
  const business = firstRecord(status.business, root2.business);
  const share = firstRecord(
    preview?.shareQuantity,
    status.shareQuantity,
    business?.shareQuantity,
    root2.shareQuantity
  );
  const productIdentity = firstRecord(
    preview?.productIdentity,
    status.productIdentity,
    business?.productIdentity,
    root2.productIdentity
  );
  const feeSummary = firstRecord(
    preview?.feeSummary,
    status.feeSummary,
    business?.feeSummary,
    root2.feeSummary
  );
  const action = actionOf(preview?.action, status.action, business?.action, root2.action, input?.action);
  const product = normalizeProduct(productIdentity, preview, business, status);
  const requestedShares = firstDecimal(
    preview?.requestedShareQuantity,
    share?.requestedShareQuantity,
    status.requestedShareQuantity,
    root2.requestedShareQuantity,
    input?.shareQuantity
  );
  const expectedShares = firstDecimal(
    preview?.expectedShareQuantity,
    share?.expectedShareQuantity,
    status.expectedShareQuantity,
    root2.expectedShareQuantity
  );
  const minimumShares = firstDecimal(
    preview?.minimumShareQuantity,
    share?.minimumShareQuantity,
    status.minimumShareQuantity,
    root2.minimumShareQuantity
  );
  const requestAmountKind = firstString(preview?.requestAmountKind) === "share-quantity" || requestedShares !== null ? "share-quantity" : "input";
  const rawStatus = (firstString(status.status, business?.lifecycle, root2.status, root2.outcome) ?? (preview ? "prepared" : "unknown")).toLowerCase();
  const signature = exactSignature(
    status.transactionSignature,
    business?.transactionSignature,
    root2.transactionSignature
  );
  const commitment = commitmentOf(
    status.confirmationCommitment,
    business?.finality,
    status.finality,
    root2.confirmationCommitment
  );
  const executionSucceeded = firstBoolean(
    status.executionSucceeded,
    business?.executionSucceeded,
    root2.executionSucceeded
  );
  const programError = firstBoolean(status.programError, business?.programError) === true;
  const definitiveNonlandingProof = firstBoolean(
    status.definitiveNonlandingProof,
    business?.definitiveNonlandingProof
  ) === true;
  const stage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof
  });
  const quotedInputAtomic = firstInteger(
    preview?.maximumInputAmountAtomic,
    preview?.amountAtomic,
    business?.amountAtomic,
    status.amountAtomic
  );
  const expectedOutputAtomic = firstInteger(
    preview?.expectedOutputAtomic,
    status.expectedOutputAtomic,
    business?.expectedOutputAtomic,
    root2.expectedOutputAtomic
  );
  const minimumOutputAtomic = firstInteger(
    preview?.minimumOutputAtomic,
    status.minimumOutputAtomic,
    business?.minimumOutputAtomic,
    root2.minimumOutputAtomic
  );
  const requestedMaximumSpendAtomic = firstInteger(
    preview?.requestedMaximumSpendAtomic,
    share?.requestedMaximumSpendAtomic,
    input?.maximumSpendAtomic
  );
  const quotedSpend = action === "buy" ? formatAtomicDecimal(quotedInputAtomic, 6, 6) : null;
  const outputDecimals = action === "buy" ? product.decimals : action === "sell" ? 6 : null;
  const copy = stageCopy({
    stage,
    action,
    product,
    requestedShares,
    minimumShares,
    quotedSpend,
    isShareQuantityOrder: requestAmountKind === "share-quantity",
    rawStatus,
    commitment,
    executionSucceeded
  });
  const delta = firstRecord(
    status.accountDeltaEvidence,
    business?.accountDeltaEvidence,
    root2.accountDeltaEvidence
  );
  const intentId = firstString(status.intentId, root2.intentId);
  const needsStatusCheck = stage === "pending" && (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(rawStatus) || commitment !== null);
  if (action === "unknown" && !product.assetId && !intentId && !preview && rawStatus === "unknown") {
    return null;
  }
  return {
    stage,
    ...copy,
    action,
    rawStatus,
    needsStatusCheck,
    intentId,
    product,
    requestAmountKind,
    isShareQuantityOrder: requestAmountKind === "share-quantity",
    requestedShareQuantity: requestedShares,
    expectedShareQuantity: expectedShares,
    minimumShareQuantity: minimumShares,
    shareQuantityUnit: firstString(
      preview?.shareQuantityUnit,
      share?.shareQuantityUnit,
      share?.unit
    ),
    shareQuantitySemantics: firstString(
      preview?.shareQuantitySemantics,
      share?.shareQuantitySemantics,
      share?.semantics
    ),
    overfillPossible: firstBoolean(preview?.overfillPossible, share?.overfillPossible) === true,
    quotedInputAtomic,
    expectedOutputAtomic,
    minimumOutputAtomic,
    requestedMaximumSpendAtomic,
    quotedSpend,
    inputAssetAmount: action === "buy" || product.decimals === null ? null : formatAtomicDecimal(quotedInputAtomic, product.decimals, product.decimals),
    expectedOutput: outputDecimals === null ? null : formatAtomicDecimal(expectedOutputAtomic, outputDecimals, outputDecimals),
    minimumOutput: outputDecimals === null ? null : formatAtomicDecimal(minimumOutputAtomic, outputDecimals, outputDecimals),
    requestedMaximumSpend: formatAtomicDecimal(requestedMaximumSpendAtomic, 6, 6),
    slippageBps: safeNumber(preview?.slippageBps),
    priceImpactBps: safeNumber(preview?.priceImpactBps),
    quoteExpiresAtUnixMs: safeNumber(preview?.quoteExpiresAtUnixMs),
    fees: normalizeFees(feeSummary),
    transactionSignature: signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    confirmationCommitment: commitment,
    executionSucceeded,
    finalizedEvidence: commitment === "finalized",
    accountDeltaObserved: firstBoolean(delta?.observed),
    accountDeltaMatchesExpected: firstBoolean(delta?.matchesExpected),
    explanation: firstString(root2.explanation, status.explanation, business?.explanation)
  };
}
function displayShareQuantity(value) {
  return displayQuantity(value);
}
function shortenSolanaIdentity(value, size = 5) {
  if (!value) return null;
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
function ArrowIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 10h13M11 5l5 5-5 5", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ExternalIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4h5v5M9 11l7-7M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function CheckIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m5 10 3 3 7-7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function StatusMark({ stage }) {
  if (stage === "success") return /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon, {});
  if (stage === "failure") return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "×" });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-status__pulse", "aria-hidden": "true" });
}
function formatBps(value) {
  if (value === null) return null;
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  const percentage = absolute / 100;
  return `${sign}${percentage.toLocaleString("en-US", {
    minimumFractionDigits: percentage % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}%`;
}
function formatExpiry(value) {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}
function productName(model) {
  return model.product.companyName ?? model.product.productName ?? model.product.symbol ?? model.product.assetId ?? "Selected product";
}
function ProductIdentity({ model }) {
  const product = model.product;
  const isStock = product.assetClass === "stock";
  const provider = product.providerName ?? (isStock && product.legalIssuerName === null ? product.issuer : null);
  const mint = shortenSolanaIdentity(product.mint);
  const digest = shortenSolanaIdentity(product.registryIdentityDigest, 6);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    WidgetSection,
    {
      title: isStock ? "Solana product" : "Solana asset",
      description: isStock ? "The exact tokenized product Dexter selected for this company." : "The exact Solana asset Dexter selected for this trade.",
      framed: true,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-product", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-stock-product__mark", "aria-hidden": "true", children: (product.symbol ?? productName(model)).slice(0, 2).toUpperCase() }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-product__identity", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-product__name-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: productName(model) }),
              product.symbol ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: product.symbol }) : null
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: provider ? `Provider: ${provider}` : !isStock && product.issuer ? `Issuer: ${product.issuer}` : "Provider information unavailable" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-network", children: "Solana" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-stock-identity-grid", children: [
          mint ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Mint" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: product.mint ?? void 0, children: mint })
          ] }) : null,
          product.tokenProgram ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Token standard" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: product.tokenProgram === "token-2022" ? "Token-2022" : product.tokenProgram })
          ] }) : null,
          product.legalIssuerName ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Legal issuer" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: product.legalIssuerName })
          ] }) : null,
          digest ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Registry proof" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: product.registryIdentityDigest ?? void 0, children: digest })
          ] }) : null
        ] })
      ]
    }
  );
}
function TradeFlow({ model }) {
  const requested = displayShareQuantity(model.requestedShareQuantity);
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const symbol = model.product.symbol ?? "shares";
  const shareValue = model.isShareQuantityOrder ? requested ?? expected ?? minimum : null;
  const spend = model.quotedSpend ?? model.requestedMaximumSpend;
  const outputValue = shareValue ?? model.expectedOutput ?? model.minimumOutput;
  const isBuy = model.action === "buy";
  const isSell = model.action === "sell";
  const leftValue = isBuy ? spend : model.inputAssetAmount;
  const leftLabel = isBuy ? model.quotedSpend ? "Spend" : model.requestedMaximumSpend ? "Limit" : "Order" : isSell ? "Sell" : "Amount";
  const outputSymbol = isBuy ? symbol : isSell ? "USDC" : symbol;
  const orderState = model.stage === "success" ? "Confirmed" : model.stage === "failure" ? "Failed" : model.stage === "pending" ? "Pending" : "Prepared";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-stock-flow", "aria-label": "Trade terms", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-flow__side", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-flow__label", children: leftLabel }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "dx-stock-flow__amount", children: leftValue ? `${isBuy ? "$" : ""}${leftValue}` : orderState }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-flow__unit", children: leftValue ? isBuy ? "USDC" : symbol : isBuy ? "Governed purchase" : "Governed trade" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-flow__arrow", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowIcon, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-flow__side dx-stock-flow__side--receive", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-flow__label", children: isBuy ? "Receive" : isSell ? "Est. receive" : "Result" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "dx-stock-flow__amount", children: outputValue ?? "—" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-flow__unit", children: shareValue ? `${symbol} share equivalent${shareValue === "1" ? "" : "s"}` : outputValue ? model.product.assetClass === "stock" && isBuy ? `${outputSymbol} token units` : outputSymbol : outputSymbol })
    ] })
  ] });
}
function timelineFor(model) {
  if (model.stage === "success") {
    return [
      { label: "Prepared", state: "complete" },
      { label: "Sent", state: "complete" },
      { label: "Confirmed", state: "complete" }
    ];
  }
  if (model.stage === "failure") {
    const sent2 = Boolean(model.transactionSignature);
    return [
      { label: "Prepared", state: "complete" },
      { label: "Sent", state: sent2 ? "complete" : "failed" },
      { label: "Failed", state: "failed" }
    ];
  }
  if (model.stage === "prepared") {
    return [
      { label: "Prepared", state: "complete" },
      { label: "Sent", state: "waiting" },
      { label: "Confirmed", state: "waiting" }
    ];
  }
  const sent = Boolean(model.transactionSignature) || ["submitted", "confirmed"].includes(model.rawStatus);
  return [
    { label: "Prepared", state: "complete" },
    { label: "Sent", state: sent ? "complete" : "current" },
    { label: "Confirmed", state: sent ? "current" : "waiting" }
  ];
}
function TradeTimeline({ model }) {
  const steps = timelineFor(model);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "dx-stock-timeline", "aria-label": "Transaction progress", children: steps.map((step, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { "data-state": step.state, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-timeline__dot", "aria-hidden": "true", children: step.state === "complete" ? /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon, {}) : step.state === "failed" ? "×" : null }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: step.label }),
    index < steps.length - 1 ? /* @__PURE__ */ jsxRuntimeExports.jsx("i", { "aria-hidden": "true" }) : null
  ] }, step.label)) });
}
function QuoteDetails({ model }) {
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const slippage = formatBps(model.slippageBps);
  const priceImpact = formatBps(model.priceImpactBps);
  const expiry = formatExpiry(model.quoteExpiresAtUnixMs);
  const outputSymbol = model.action === "sell" ? "USDC" : model.product.symbol ?? "tokens";
  const items = [
    model.isShareQuantityOrder && expected ? ["Expected", `${expected} shares`] : null,
    model.isShareQuantityOrder && minimum ? ["Minimum", `${minimum} shares`] : null,
    !model.isShareQuantityOrder && model.expectedOutput ? ["Expected", `${model.expectedOutput} ${outputSymbol}`] : null,
    !model.isShareQuantityOrder && model.minimumOutput ? ["Minimum", `${model.minimumOutput} ${outputSymbol}`] : null,
    model.requestedMaximumSpend && model.quotedSpend ? ["Your limit", `$${model.requestedMaximumSpend} USDC`] : null,
    slippage ? ["Slippage", slippage] : null,
    priceImpact ? ["Price impact", priceImpact] : null,
    expiry ? ["Quote expires", expiry] : null
  ].filter((item) => item !== null);
  if (items.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-stock-quote-grid", children: items.map(([label, value]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: value })
  ] }, label)) });
}
function FeeSummary({ model }) {
  if (!model.fees) return null;
  const networkFee = model.fees.networkFeeLamports ? `${formatAtomicDecimal(model.fees.networkFeeLamports, 9, 9) ?? model.fees.networkFeeLamports} SOL` : model.fees.networkFeeStatus === "not-yet-calculated" ? "Calculated at execution" : "Not reported";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetSection, { title: "Fees", description: model.fees.summary, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-stock-fees", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Platform fee" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.fees.platformFee ? "Included in quote" : "None" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Route fees" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.fees.routeFees.length > 0 ? `Included (${model.fees.routeFees.length})` : "None reported" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Network fee" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: networkFee })
    ] })
  ] }) });
}
function StatusEvidence({ model }) {
  const signature = shortenSolanaIdentity(model.transactionSignature, 7);
  const solanaStatus = model.confirmationCommitment !== null ? "Confirmed" : model.stage === "prepared" ? "Not sent" : model.transactionSignature ? "Not confirmed" : "Not sent";
  const executionStatus = model.executionSucceeded === true ? "Succeeded" : model.executionSucceeded === false ? "Failed" : model.confirmationCommitment !== null ? "Not yet proven" : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-stock-evidence", "aria-label": "Transaction evidence", "aria-live": "polite", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        "data-evidence": "commitment",
        "data-result": model.confirmationCommitment !== null ? "confirmed" : "unconfirmed",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Solana status" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: solanaStatus })
        ]
      }
    ),
    executionStatus ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        "data-evidence": "execution",
        "data-result": model.executionSucceeded === true ? "succeeded" : model.executionSucceeded === false ? "failed" : "unknown",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Execution" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: executionStatus })
        ]
      }
    ) : null,
    signature ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Signature" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { title: model.transactionSignature ?? void 0, children: signature })
    ] }) : null,
    model.finalizedEvidence ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Additional evidence" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Finalized" })
    ] }) : null,
    model.accountDeltaObserved === true ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Wallet change" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: model.accountDeltaMatchesExpected === true ? "Matches trade" : "Observed" })
    ] }) : null
  ] });
}
function TradeLoading() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-card dx-stock-card--loading", role: "status", "aria-live": "polite", "aria-label": "Loading trade update", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-skeleton dx-stock-skeleton--eyebrow" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-skeleton dx-stock-skeleton--title" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-stock-skeleton-flow", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-skeleton" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-skeleton" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-stock-skeleton dx-stock-skeleton--footer" })
  ] }) });
}
function StockTradeCard() {
  const output = useToolOutput();
  const input = useToolInput();
  const theme = useAdaptiveTheme();
  const openExternal = useAdaptiveOpenExternal();
  const model = reactExports.useMemo(() => normalizeStockTrade(output, input), [output, input]);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  if (output === null) return /* @__PURE__ */ jsxRuntimeExports.jsx(TradeLoading, {});
  if (!model) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-stock-card", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      WidgetEmpty,
      {
        title: "No trade details to show",
        description: "Ask OpenDexter to check the same trade again. It will not place a replacement order."
      }
    ) }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dx-stock-card", "data-stage": model.stage, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      WidgetHeader,
      {
        eyebrow: {
          label: model.product.assetClass === "stock" ? "Tokenized stock · Solana" : "Governed asset · Solana",
          tone: model.stage === "success" ? "success" : model.stage === "failure" ? "danger" : model.stage === "pending" ? "warn" : "accent"
        },
        title: model.headline,
        supporting: model.supporting,
        trailing: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-stock-status", "data-stage": model.stage, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(StatusMark, { stage: model.stage }),
          model.stageLabel
        ] })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TradeFlow, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(QuoteDetails, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TradeTimeline, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ProductIdentity, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(FeeSummary, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(StatusEvidence, { model }),
    model.stage === "failure" && model.explanation ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-stock-failure", role: "alert", children: model.explanation }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "dx-stock-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: model.isShareQuantityOrder ? "Share amounts are underlying-share equivalents represented by the selected Solana tokenized product." : model.product.assetClass === "stock" && model.action === "buy" ? "Dollar orders show the exact token amount from the prepared quote." : "Amounts come from the exact prepared Solana quote." }),
      model.solscanUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          className: "dx-stock-explorer",
          onClick: () => openExternal(model.solscanUrl),
          "aria-label": "View this transaction on Solscan",
          children: [
            "View on Solscan",
            /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalIcon, {})
          ]
        }
      ) : null
    ] })
  ] }) });
}
const root = document.getElementById("stock-trade-root");
if (root) {
  root.dataset.widgetBuild = "2026-08-20.confirmed-stock-trade";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(StockTradeCard, {}));
}
