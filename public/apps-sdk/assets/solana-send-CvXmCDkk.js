import { j as jsxRuntimeExports, r as reactExports } from "./adapter-2CdQiSQS.js";
/* empty css                    */
import { c as clientExports } from "./client-iwtKvXVU.js";
import { u as useOpenAIGlobal } from "./use-openai-global-D3_loJJG.js";
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
function resolveSymbol(mint) {
  if (!mint) return "TOKEN";
  if (mint.toLowerCase().includes("sol") || mint === "native:SOL") return "SOL";
  return mint.slice(0, 4).toUpperCase();
}
function formatAmount(value, decimals) {
  if (value === void 0) return "—";
  const maxDigits = decimals && decimals > 4 ? 4 : decimals ?? 6;
  if (Math.abs(value) >= 1) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
  }
  return value.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}
function formatUsd(value) {
  if (value === void 0 || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
function abbreviate(value, prefix = 6, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function SolanaIcon({ size = 24 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: "0 0 128 128", fill: "none", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "sol-send-grad", x1: "90%", y1: "0%", x2: "10%", y2: "100%", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#00FFA3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#DC1FFF" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 93.5c0.9-0.9 2.2-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3l-24.2 24.2c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 93.5z", fill: "url(#sol-send-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 2.5c1-1 2.3-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3L103.5 29.5c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 2.5z", fill: "url(#sol-send-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M102.7 47.3c-0.9-0.9-2.2-1.5-3.5-1.5H2.1c-2.2 0-3.4 2.7-1.8 4.3l24.2 24.2c0.9 0.9 2.2 1.5 3.5 1.5h97.1c2.2 0 3.4-2.7 1.8-4.3L102.7 47.3z", fill: "url(#sol-send-grad)" })
  ] });
}
function TokenIcon({ symbol, mint, size = 24 }) {
  const [error, setError] = reactExports.useState(false);
  if (symbol === "SOL") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(SolanaIcon, { size });
  }
  const imageUrl = mint ? getTokenLogoUrl(mint) : void 0;
  const showImage = imageUrl && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-token-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer",
      style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: "4px" }
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: size * 0.4 }, children: symbol.slice(0, 2) }) });
}
function StatusBadge({ status }) {
  const config = {
    sent: { label: "Confirmed", className: "send-status-badge--success", icon: "✓" },
    confirm: { label: "Needs Confirmation", className: "send-status-badge--warning", icon: "⚠" },
    failed: { label: "Failed", className: "send-status-badge--error", icon: "✕" }
  }[status];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `send-status-badge ${config.className}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-status-badge__icon", children: config.icon }),
    config.label
  ] });
}
function TransferFlow({
  from,
  to,
  amount,
  symbol,
  mint,
  valueUsd,
  recipientHandle
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__wallet", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-flow__wallet-box", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__wallet-label", children: "FROM" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__wallet-address", children: abbreviate(from) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__amount-box", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol, mint, size: 28 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__amount-info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "send-flow__amount", children: [
            amount,
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__symbol", children: symbol })
          ] }),
          valueUsd && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__value-usd", children: valueUsd })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__track", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-flow__track-line" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-flow__plane", children: "✈" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-flow__wallet send-flow__wallet--to", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-flow__wallet-box send-flow__wallet-box--to", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__wallet-label", children: "TO" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__wallet-address", children: abbreviate(to) }),
      recipientHandle && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-flow__handle", children: recipientHandle })
    ] })
  ] });
}
function SolanaSend() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Processing transfer..." })
    ] }) });
  }
  const transfer = toolOutput.result ?? toolOutput.transfer ?? null;
  const status = toolOutput.ok ? "sent" : toolOutput.error === "confirmation_required" ? "confirm" : "failed";
  const destination = pickString(transfer?.destination, transfer?.recipient) ?? "";
  const signature = pickString(transfer?.signature);
  const solscanUrl = pickString(transfer?.solscanUrl) ?? (signature ? `https://solscan.io/tx/${signature}` : null);
  const symbol = resolveSymbol(transfer?.mint);
  const amount = formatAmount(pickNumber(transfer?.amountUi), transfer?.decimals);
  const valueUsd = formatUsd(pickNumber(transfer?.valueUsd));
  const priceUsd = formatUsd(pickNumber(transfer?.priceUsd));
  const threshold = pickNumber(toolOutput.thresholdUsd);
  const walletAddress = pickString(transfer?.walletAddress) ?? "";
  const recipientHandle = pickString(transfer?.recipientHandle);
  const memo = pickString(transfer?.memo);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `send-card ${status === "sent" ? "send-card--success" : status === "confirm" ? "send-card--warning" : "send-card--error"}`, children: [
    status === "sent" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-card__glow send-card__glow--success" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__title-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__icon", children: "✈" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__title", children: status === "confirm" ? "Transfer Preview" : "Token Transfer" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status })
    ] }),
    status === "confirm" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__warning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-card__warning-icon", children: "⚠" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__warning-content", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__warning-title", children: "Confirmation Required" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "send-card__warning-text", children: [
          "This transfer exceeds the $",
          threshold ?? 50,
          " threshold. Re-run with ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "confirm=true" }),
          " to proceed."
        ] })
      ] })
    ] }),
    status === "failed" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-card__error", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: toolOutput.message || toolOutput.error || "Transfer failed" }) }),
    transfer && /* @__PURE__ */ jsxRuntimeExports.jsx(
      TransferFlow,
      {
        from: walletAddress,
        to: destination,
        amount,
        symbol,
        mint: transfer.mint,
        valueUsd: valueUsd !== "—" ? valueUsd : void 0,
        recipientHandle
      }
    ),
    transfer && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__metric-label", children: "Amount" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "send-card__metric-value", children: [
          amount,
          " ",
          symbol
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__metric-label", children: "Value" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__metric-value", children: valueUsd })
      ] }),
      priceUsd !== "—" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__metric-label", children: "Price" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__metric-value", children: priceUsd })
      ] })
    ] }),
    memo && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__memo", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__memo-label", children: "Memo" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__memo-value", children: memo })
    ] }),
    signature && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "send-card__signature", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__signature-label", children: "Transaction" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "send-card__signature-value", children: abbreviate(signature) })
    ] }),
    solscanUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "send-card__footer", children: /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: solscanUrl, target: "_blank", rel: "noreferrer", className: "send-card__link", children: "View on Solscan ↗" }) })
  ] }) });
}
const root = document.getElementById("solana-send-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolanaSend, {}));
}
