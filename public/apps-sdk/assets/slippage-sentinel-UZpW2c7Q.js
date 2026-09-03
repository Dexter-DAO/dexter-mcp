import { j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
/* empty css                    */
import { c as clientExports } from "./client-BiBV5Ase.js";
import { u as useOpenAIGlobal } from "./use-openai-global-C0rBccno.js";
function getRiskColor(level) {
  switch (level?.toLowerCase()) {
    case "low":
      return "sentinel-risk--low";
    case "medium":
      return "sentinel-risk--medium";
    case "high":
      return "sentinel-risk--high";
    case "extreme":
      return "sentinel-risk--extreme";
    default:
      return "";
  }
}
function formatBps(bps) {
  if (!bps || !Number.isFinite(bps)) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}
function formatLargeNumber(value) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
function SlippageSentinel() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Analyzing slippage..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-error", children: toolOutput.error }) });
  }
  const recommended = toolOutput.recommendedSlippageBps || toolOutput.recommended_slippage_bps;
  const min = toolOutput.minSlippageBps || toolOutput.min_slippage_bps;
  const max = toolOutput.maxSlippageBps || toolOutput.max_slippage_bps;
  const risk = toolOutput.riskLevel || toolOutput.risk_level;
  const volatility = toolOutput.volatility24h || toolOutput.volatility_24h;
  const liquidity = toolOutput.liquidityScore || toolOutput.liquidity_score;
  const spread = toolOutput.avgSpread || toolOutput.avg_spread;
  const depth = toolOutput.depthUsd || toolOutput.depth_usd;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-icon", children: "🛡️" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-title", children: "Slippage Sentinel" })
      ] }),
      risk && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `sentinel-badge ${getRiskColor(risk)}`, children: [
        risk.toUpperCase(),
        " RISK"
      ] })
    ] }),
    (toolOutput.symbol || toolOutput.name) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-token", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-token__symbol", children: toolOutput.symbol }),
      toolOutput.name && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-token__name", children: toolOutput.name })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-recommendation", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-recommendation__label", children: "RECOMMENDED SLIPPAGE" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-recommendation__value", children: formatBps(recommended) }),
      (min || max) && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sentinel-recommendation__range", children: [
        "Range: ",
        formatBps(min),
        " – ",
        formatBps(max)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-metrics", children: [
      volatility != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-metric__label", children: "24h Volatility" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sentinel-metric__value", children: [
          volatility.toFixed(2),
          "%"
        ] })
      ] }),
      liquidity != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-metric__label", children: "Liquidity Score" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sentinel-metric__value", children: [
          liquidity.toFixed(1),
          "/10"
        ] })
      ] }),
      spread != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-metric__label", children: "Avg Spread" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "sentinel-metric__value", children: [
          (spread * 100).toFixed(3),
          "%"
        ] })
      ] }),
      depth != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-metric__label", children: "Depth (±2%)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-metric__value", children: formatLargeNumber(depth) })
      ] })
    ] }),
    toolOutput.reasoning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-reasoning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-reasoning__label", children: "ANALYSIS" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "sentinel-reasoning__text", children: toolOutput.reasoning })
    ] }),
    toolOutput.warnings && toolOutput.warnings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sentinel-warnings", children: toolOutput.warnings.map((warning, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sentinel-warning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sentinel-warning__icon", children: "⚠️" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: warning })
    ] }, idx)) })
  ] }) });
}
const root = document.getElementById("slippage-sentinel-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SlippageSentinel, {}));
}
