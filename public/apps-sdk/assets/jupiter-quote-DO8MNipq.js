import { j as jsxRuntimeExports, r as reactExports } from "./adapter-BBMYb_B0.js";
/* empty css                    */
import { c as clientExports } from "./client-Hl6e0V0s.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DIHzgDeX.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
function formatAmount(value, decimals = 9) {
  if (!value) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "0";
  const adjusted = num / Math.pow(10, decimals);
  if (adjusted < 1e-4) return adjusted.toExponential(4);
  return adjusted.toLocaleString(void 0, { maximumFractionDigits: 6 });
}
function shortenMint(mint) {
  if (!mint) return "—";
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}
function TokenIcon({ symbol, mint, size = 32 }) {
  const [error, setError] = reactExports.useState(false);
  const imageUrl = mint ? getTokenLogoUrl(mint) : void 0;
  const showImage = imageUrl && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-token-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-token-icon__fallback", children: symbol.slice(0, 2) }) });
}
function JupiterQuote() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Fetching quote..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-error", children: toolOutput.error }) });
  }
  const inputMint = toolOutput.inputMint || toolOutput.input_mint;
  const outputMint = toolOutput.outputMint || toolOutput.output_mint;
  const inAmount = toolOutput.inAmount || toolOutput.in_amount;
  const outAmount = toolOutput.outAmount || toolOutput.out_amount;
  const slippage = toolOutput.slippageBps || toolOutput.slippage_bps || 0;
  const priceImpact = toolOutput.priceImpactPct || toolOutput.price_impact_pct;
  const routePlan = toolOutput.routePlan || toolOutput.route_plan || [];
  const inputSymbol = toolOutput.inputSymbol || shortenMint(inputMint);
  const outputSymbol = toolOutput.outputSymbol || shortenMint(outputMint);
  const inputDecimals = toolOutput.inputDecimals || 9;
  const outputDecimals = toolOutput.outputDecimals || 9;
  const impactNum = typeof priceImpact === "string" ? parseFloat(priceImpact) : priceImpact;
  const impactClass = impactNum && impactNum > 1 ? "quote-impact--high" : impactNum && impactNum > 0.5 ? "quote-impact--medium" : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-icon", children: "⚡" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-title", children: "Jupiter Quote" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-badge", children: "Preview" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-swap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-swap__from", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: inputSymbol, mint: inputMint, size: 36 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-swap__info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__label", children: "From" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__amount", children: formatAmount(inAmount, inputDecimals) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__symbol", children: inputSymbol })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-swap__arrow", children: "→" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-swap__to", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: outputSymbol, mint: outputMint, size: 36 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-swap__info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__label", children: "To" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__amount", children: formatAmount(outAmount, outputDecimals) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-swap__symbol", children: outputSymbol })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-metric__label", children: "Slippage" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "quote-metric__value", children: [
          (slippage / 100).toFixed(2),
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-metric__label", children: "Price Impact" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `quote-metric__value ${impactClass}`, children: impactNum ? `${impactNum.toFixed(4)}%` : "< 0.01%" })
      ] }),
      routePlan.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-metric__label", children: "Route" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "quote-metric__value", children: [
          routePlan.length,
          " hop",
          routePlan.length > 1 ? "s" : ""
        ] })
      ] })
    ] }),
    routePlan.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-route", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-route__label", children: "ROUTE PATH" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quote-route__steps", children: routePlan.map((step, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-route__step", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "quote-route__step-label", children: step.label || `Step ${idx + 1}` }),
        step.percent && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "quote-route__step-pct", children: [
          step.percent,
          "%"
        ] })
      ] }, idx)) })
    ] }),
    toolOutput.contextSlot && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "quote-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "quote-footer__slot", children: [
        "Slot: ",
        toolOutput.contextSlot
      ] }),
      toolOutput.timeTaken && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "quote-footer__time", children: [
        toolOutput.timeTaken,
        "ms"
      ] })
    ] })
  ] }) });
}
const root = document.getElementById("jupiter-quote-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(JupiterQuote, {}));
}
