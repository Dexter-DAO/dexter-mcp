import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
/* empty css                     */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
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
function abbreviate(value, prefix = 6, suffix = 4) {
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
function StatusBadge({ status }) {
  const config = {
    confirmed: { label: "Confirmed", className: "swap-status-badge--success" },
    pending: { label: "Pending", className: "swap-status-badge--pending" },
    failed: { label: "Failed", className: "swap-status-badge--error" }
  }[status];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `swap-status-badge ${config.className}`, children: [
    status === "confirmed" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-status-badge__icon", children: "✓" }),
    status === "pending" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-status-badge__icon swap-status-badge__icon--pulse", children: "●" }),
    status === "failed" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-status-badge__icon", children: "✕" }),
    config.label
  ] });
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
function SolanaSwapExecute() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const execution = toolOutput ? toolOutput.result ?? toolOutput : null;
  if (!execution) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Executing swap..." })
    ] }) });
  }
  const inputMint = pickString(execution.inputMint);
  const outputMint = pickString(execution.outputMint);
  const inputSymbol = pickString(execution.inputToken?.symbol) ?? symbolFromMint(inputMint);
  const outputSymbol = pickString(execution.outputToken?.symbol) ?? symbolFromMint(outputMint);
  const inputImage = pickString(
    execution.inputToken?.imageUrl,
    execution.inputToken?.logoUri,
    execution.inputLogo,
    inputMint ? getTokenLogoUrl(inputMint) : void 0
  );
  const outputImage = pickString(
    execution.outputToken?.imageUrl,
    execution.outputToken?.logoUri,
    execution.outputLogo,
    outputMint ? getTokenLogoUrl(outputMint) : void 0
  );
  const amountIn = pickNumber(execution.amountUi);
  const amountOut = pickNumber(execution.outputAmountUi, execution.expectedOutputUi);
  const priceImpact = pickNumber(execution.priceImpactPct);
  const slippageBps = pickNumber(execution.slippageBps);
  const networkFee = pickNumber(execution.networkFeeSol);
  const signature = pickString(execution.txSignature, execution.transactionSignature, execution.signature);
  pickString(execution.swapId);
  const wallet = pickString(execution.walletAddress);
  const statusRaw = pickString(execution.status)?.toLowerCase();
  const swapStatus = statusRaw === "confirmed" || statusRaw === "success" ? "confirmed" : statusRaw === "failed" || statusRaw === "error" ? "failed" : signature ? "confirmed" : "pending";
  const impactIsNegative = priceImpact !== void 0 && priceImpact < 0;
  const solscanUrl = signature ? `https://solscan.io/tx/${signature}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `swap-card ${swapStatus === "confirmed" ? "swap-card--success" : ""}`, children: [
    swapStatus === "confirmed" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-card__glow swap-card__glow--success" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__title", children: "Swap Execution" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: swapStatus })
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
    signature && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__signature", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__signature-label", children: "Transaction" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "swap-card__signature-value", children: abbreviate(signature) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "swap-card__footer", children: [
      wallet && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "swap-card__wallet", children: [
        "Wallet: ",
        abbreviate(wallet)
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "swap-card__links", children: solscanUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: solscanUrl, target: "_blank", rel: "noreferrer", className: "swap-card__link", children: "Solscan" }) })
    ] })
  ] }) });
}
const root = document.getElementById("solana-swap-execute-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolanaSwapExecute, {}));
}
