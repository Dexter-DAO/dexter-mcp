import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
function formatNumber(value, decimals = 2) {
  if (value === void 0 || value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return value.toFixed(decimals);
}
function formatPercent(value) {
  if (value === void 0 || value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(4)}%`;
}
function abbreviate(value, len = 8) {
  if (!value) return "—";
  if (value.length <= len * 2 + 3) return value;
  return `${value.slice(0, len)}...${value.slice(-4)}`;
}
function detectToolType(payload) {
  if (payload.markets) return "markets";
  if (payload.agent) return "opt_in";
  const result = payload.result;
  if (result) {
    if ("solSignature" in result || "steps" in result) return "fund";
    if ("txHash" in result) return "deposit";
    if ("orderId" in result || "side" in result) return "trade";
  }
  return "unknown";
}
function HLLogo({ size = 20 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "hl-logo",
      style: { width: size, height: size, fontSize: size * 0.5 },
      children: "HL"
    }
  );
}
function HLStatusBadge({ status }) {
  const statusClass = {
    active: "hl-badge--success",
    success: "hl-badge--success",
    filled: "hl-badge--success",
    completed: "hl-badge--success",
    pending: "hl-badge--warning",
    partial: "hl-badge--warning",
    failed: "hl-badge--error"
  }[status.toLowerCase()] || "hl-badge--warning";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `hl-badge ${statusClass}`, children: status });
}
function MarketsView({ markets }) {
  const [showAll, setShowAll] = reactExports.useState(false);
  const visibleMarkets = showAll ? markets : markets.slice(0, 10);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-markets-header", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hl-markets-count", children: [
      markets.length,
      " markets"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-markets-list", children: visibleMarkets.map((market, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-market-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-market-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-market-symbol", children: market.symbol || market.name }),
        market.maxLeverage && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hl-market-leverage", children: [
          market.maxLeverage,
          "x"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-market-right", children: [
        market.price && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hl-market-price", children: [
          "$",
          formatNumber(market.price, 4)
        ] }),
        market.fundingRate !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `hl-market-funding ${market.fundingRate >= 0 ? "hl-positive" : "hl-negative"}`, children: formatPercent(market.fundingRate) })
      ] })
    ] }, market.symbol || idx)) }),
    markets.length > 10 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "hl-show-more", onClick: () => setShowAll(!showAll), children: showAll ? "Show Less" : `Show ${markets.length - 10} more` })
  ] });
}
function OptInView({ agent }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-success-banner", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-success-icon", children: "✓" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-success-text", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-success-title", children: "Agent Provisioned!" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-success-subtitle", children: "Your Hyperliquid trading agent is ready" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-info-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-info-label", children: "AGENT WALLET" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-info-value", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: abbreviate(agent.agentWalletAddress, 12) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "VALID UNTIL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: agent.validUntil ? new Date(agent.validUntil).toLocaleDateString() : "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "AGENT ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: agent.id?.slice(0, 8) || "—" })
      ] })
    ] })
  ] });
}
function FundView({ result }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-flow-visual", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-flow-step", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-label", children: "SOL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-sublabel", children: "Solana" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-arrow", children: "→" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-flow-step", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-label hl-cyan", children: "USDC" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-sublabel", children: "Arbitrum" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-arrow", children: "→" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-flow-step", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(HLLogo, { size: 32 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-sublabel", children: "Hyperliquid" })
      ] })
    ] }),
    result.usdcAmount && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-amount-display", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-amount-label", children: "Funded" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hl-amount-value", children: [
        "$",
        formatNumber(result.usdcAmount, 2)
      ] })
    ] }),
    result.steps && result.steps.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-steps", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-steps-title", children: "Bridge Steps" }),
      result.steps.map((step, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `hl-step ${step.status === "completed" || step.status === "success" ? "hl-step--success" : "hl-step--pending"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-step-name", children: step.step }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-step-status", children: step.status })
      ] }, idx))
    ] }),
    result.solSignature && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "a",
      {
        href: `https://solscan.io/tx/${result.solSignature}`,
        target: "_blank",
        rel: "noreferrer",
        className: "hl-tx-link",
        children: [
          "View SOL transaction: ",
          abbreviate(result.solSignature, 12),
          " ↗"
        ]
      }
    )
  ] });
}
function DepositView({ result }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-deposit-visual", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-deposit-flow", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "L2 (Arbitrum)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-flow-arrow", children: "→" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-cyan", children: "L1 (Hyperliquid)" })
      ] }),
      result.amountUsd && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "hl-deposit-amount", children: [
        "$",
        formatNumber(result.amountUsd, 2)
      ] })
    ] }),
    result.txHash && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-info-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-info-label", children: "TRANSACTION HASH" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "hl-info-value", children: abbreviate(result.txHash, 16) })
    ] })
  ] });
}
function TradeView({ result }) {
  const isBuy = result.side?.toLowerCase() === "buy";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `hl-trade-banner ${isBuy ? "hl-trade-banner--buy" : "hl-trade-banner--sell"}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-trade-icon", children: isBuy ? "↑" : "↓" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-trade-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `hl-trade-action ${isBuy ? "hl-positive" : "hl-negative"}`, children: [
          result.side?.toUpperCase(),
          " ",
          result.symbol
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-trade-type", children: "Perpetual" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-trade-size", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-trade-size-value", children: formatNumber(result.size, 4) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-trade-size-label", children: "Size" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metrics hl-metrics--4col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "PRICE" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: result.price ? `$${formatNumber(result.price, 4)}` : "Market" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "FILLED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: formatNumber(result.filledSize, 4) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "ORDER ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: result.orderId?.slice(0, 8) || "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-label", children: "TIME" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-metric-value", children: result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : "—" })
      ] })
    ] })
  ] });
}
function Hyperliquid() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading Hyperliquid..." })
    ] }) });
  }
  if (toolOutput.error || toolOutput.ok === false) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-error", children: toolOutput.error || "Operation failed" }) });
  }
  const toolType = detectToolType(toolOutput);
  const titles = {
    markets: "Hyperliquid Markets",
    opt_in: "Hyperliquid Opt-In",
    fund: "Fund Hyperliquid",
    deposit: "Bridge Deposit",
    trade: "Perp Trade",
    unknown: "Hyperliquid"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hl-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hl-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(HLLogo, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hl-title", children: titles[toolType] })
      ] }),
      toolType === "opt_in" && toolOutput.agent?.status && /* @__PURE__ */ jsxRuntimeExports.jsx(HLStatusBadge, { status: toolOutput.agent.status }),
      toolType === "fund" && /* @__PURE__ */ jsxRuntimeExports.jsx(HLStatusBadge, { status: toolOutput.result?.bridgeStatus || "success" }),
      toolType === "trade" && /* @__PURE__ */ jsxRuntimeExports.jsx(HLStatusBadge, { status: toolOutput.result?.status || "filled" })
    ] }),
    toolType === "markets" && toolOutput.markets && /* @__PURE__ */ jsxRuntimeExports.jsx(MarketsView, { markets: toolOutput.markets }),
    toolType === "opt_in" && toolOutput.agent && /* @__PURE__ */ jsxRuntimeExports.jsx(OptInView, { agent: toolOutput.agent }),
    toolType === "fund" && toolOutput.result && /* @__PURE__ */ jsxRuntimeExports.jsx(FundView, { result: toolOutput.result }),
    toolType === "deposit" && toolOutput.result && /* @__PURE__ */ jsxRuntimeExports.jsx(DepositView, { result: toolOutput.result }),
    toolType === "trade" && toolOutput.result && /* @__PURE__ */ jsxRuntimeExports.jsx(TradeView, { result: toolOutput.result })
  ] }) });
}
const root = document.getElementById("hyperliquid-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Hyperliquid, {}));
}
