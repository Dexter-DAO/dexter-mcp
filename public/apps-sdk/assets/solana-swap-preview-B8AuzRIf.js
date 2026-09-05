import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
/* empty css                     */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
import { u as useCallTool } from "./use-call-tool-CwnhX6mu.js";
import { u as useSendFollowUp } from "./use-send-followup-CwsWxaot.js";
import { u as useTheme } from "./use-theme-wabjPbcu.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
function pickString(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return void 0;
}
function pickNumber(...values) {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return void 0;
}
function symbolFromMint(mint) {
  if (!mint) return "TOKEN";
  return mint.slice(0, 4).toUpperCase();
}
function formatAmount(value) {
  if (value === void 0) return "—";
  if (Math.abs(value) >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
function formatPercent(value) {
  if (value === void 0) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function abbreviate(value, prefix = 4, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function TokenIcon({ symbol, imageUrl, size = 56 }) {
  const [error, setError] = reactExports.useState(false);
  const showImage = imageUrl && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-token-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-token-icon__fallback", style: { fontSize: size * 0.3 }, children: symbol.slice(0, 2) }) });
}
function SwapFlow({
  fromSymbol,
  fromAmount,
  fromImage,
  toSymbol,
  toAmount,
  toImage
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-flow", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-flow__side", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: fromSymbol, imageUrl: fromImage, size: 56 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-flow__info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-flow__amount", children: fromAmount }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-flow__symbol", children: fromSymbol })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-flow__arrow", children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14M13 6l6 6-6 6", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-flow__side swap-flow__side--to", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: toSymbol, imageUrl: toImage, size: 56 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-flow__info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-flow__amount swap-flow__amount--receive", children: toAmount }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-flow__symbol", children: toSymbol })
      ] })
    ] })
  ] });
}
function ActionButton({
  onClick,
  label,
  loadingLabel,
  isLoading,
  disabled,
  variant = "secondary"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      className: `swap-action-btn swap-action-btn--${variant}`,
      onClick,
      disabled: isLoading || disabled,
      children: isLoading ? loadingLabel || "Loading..." : label
    }
  );
}
function SolanaSwapPreview() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const theme = useTheme();
  const { callTool, isLoading: isExecuting } = useCallTool();
  const sendFollowUp = useSendFollowUp();
  const [actionState, setActionState] = reactExports.useState("idle");
  const [actionMessage, setActionMessage] = reactExports.useState(null);
  const quote = toolOutput ? toolOutput.result ?? toolOutput.quote ?? toolOutput : null;
  if (!quote) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-container", "data-theme": theme, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Building swap quote..." })
    ] }) });
  }
  const inputMint = pickString(quote.inputMint);
  const outputMint = pickString(quote.outputMint);
  const inputSymbol = pickString(quote.inputToken?.symbol) ?? symbolFromMint(inputMint);
  const outputSymbol = pickString(quote.outputToken?.symbol) ?? symbolFromMint(outputMint);
  const inputImage = pickString(
    quote.inputToken?.imageUrl,
    quote.inputToken?.logoUri,
    quote.inputLogo,
    inputMint ? getTokenLogoUrl(inputMint) : void 0
  );
  const outputImage = pickString(
    quote.outputToken?.imageUrl,
    quote.outputToken?.logoUri,
    quote.outputLogo,
    outputMint ? getTokenLogoUrl(outputMint) : void 0
  );
  const amountIn = pickNumber(quote.amountUi, quote.inAmountUi);
  const amountOut = pickNumber(quote.expectedOutputUi, quote.outAmountUi);
  const priceImpact = pickNumber(quote.priceImpactPct);
  const slippageBps = pickNumber(quote.slippageBps);
  const networkFee = pickNumber(quote.networkFeeSol);
  const routeLabel = pickString(quote.route, quote.routeLabel) ?? "Jupiter";
  const quoteId = pickString(quote.quoteId, quote.swapId);
  const highImpact = priceImpact !== void 0 && priceImpact > 1;
  const impactIsNegative = priceImpact !== void 0 && priceImpact < 0;
  const handleExecuteSwap = async () => {
    if (!inputMint || !outputMint) return;
    setActionState("idle");
    setActionMessage(null);
    const result = await callTool("solana_swap_execute", {
      inputMint,
      outputMint,
      amount: amountIn,
      slippageBps: slippageBps || 100
    });
    if (result) {
      setActionState("success");
      setActionMessage("Swap executed successfully!");
    } else {
      setActionState("error");
      setActionMessage("Failed to execute swap");
    }
  };
  const handleCheckSlippage = async () => {
    if (!outputMint) return;
    await callTool("slippage_sentinel", {
      token_out: outputMint,
      token_in: inputMint,
      amount_in_ui: amountIn
    });
  };
  const handleLearnMore = async () => {
    await sendFollowUp(`Tell me more about ${outputSymbol} (${outputMint})`);
  };
  const handleRefreshQuote = async () => {
    if (!inputMint || !outputMint) return;
    await callTool("solana_swap_preview", {
      inputMint,
      outputMint,
      amount: amountIn
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-container", "data-theme": theme, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__title", children: "Swap Preview" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__badge", children: routeLabel })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      SwapFlow,
      {
        fromSymbol: inputSymbol,
        fromAmount: formatAmount(amountIn),
        fromImage: inputImage,
        toSymbol: outputSymbol,
        toAmount: formatAmount(amountOut),
        toImage: outputImage
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__metrics", children: [
      priceImpact !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__metric-label", children: "Price Impact" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `swap-card__metric-value ${impactIsNegative ? "swap-card__metric-value--negative" : "swap-card__metric-value--positive"}`, children: formatPercent(priceImpact) })
      ] }),
      slippageBps !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__metric-label", children: "Slippage" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "swap-card__metric-value", children: [
          (slippageBps / 100).toFixed(2),
          "%"
        ] })
      ] }),
      networkFee !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__metric-label", children: "Network Fee" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "swap-card__metric-value", children: [
          networkFee.toFixed(6),
          " SOL"
        ] })
      ] })
    ] }),
    highImpact && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__warning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-card__warning-icon", children: "⚠" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__warning-content", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__warning-title", children: "High Price Impact" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__warning-text", children: "Consider using a smaller amount to reduce slippage." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ActionButton,
        {
          variant: "primary",
          onClick: handleExecuteSwap,
          label: "Execute Swap",
          loadingLabel: "Executing...",
          isLoading: isExecuting
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ActionButton,
        {
          onClick: handleRefreshQuote,
          label: "Refresh Quote"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ActionButton,
        {
          onClick: handleCheckSlippage,
          label: "Check Slippage"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ActionButton,
        {
          onClick: handleLearnMore,
          label: `About ${outputSymbol}`
        }
      )
    ] }),
    actionMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `swap-card__action-result swap-card__action-result--${actionState}`, children: actionMessage }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__footer", children: [
      quoteId && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "swap-card__quote-id", children: [
        "Quote: ",
        abbreviate(quoteId, 6, 4)
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__status", children: "Ready to execute" })
    ] })
  ] }) });
}
const root = document.getElementById("solana-swap-preview-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolanaSwapPreview, {}));
}
