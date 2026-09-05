import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
function formatPrice(value) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value < 1e-4) return `$${value.toExponential(2)}`;
  if (value < 1) return `$${value.toFixed(6)}`;
  return `$${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}
function formatVolume(value) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
function shortenAddress(addr) {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function TokenIcon({ mint, size = 32 }) {
  const [error, setError] = reactExports.useState(false);
  const imageUrl = mint ? getTokenLogoUrl(mint) : void 0;
  const showImage = imageUrl && !error;
  if (!showImage) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-token-icon", style: { width: size, height: size }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: "Token",
      onError: () => setError(true),
      referrerPolicy: "no-referrer"
    }
  ) });
}
function MiniChart({ candles }) {
  if (!candles.length) return null;
  const closes = candles.map((c) => c.c).filter((v) => v != null && Number.isFinite(v));
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const displayCandles = candles.slice(-30);
  const isUp = (closes[closes.length - 1] || 0) >= (closes[0] || 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-chart", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `ohlcv-chart__bars ${isUp ? "ohlcv-chart__bars--up" : "ohlcv-chart__bars--down"}`, children: displayCandles.map((candle, idx) => {
    const close = candle.c ?? 0;
    const height = (close - min) / range * 100;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "ohlcv-chart__bar",
        style: { height: `${Math.max(height, 5)}%` }
      },
      idx
    );
  }) }) });
}
function Ohlcv() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading OHLCV data..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-error", children: toolOutput.error }) });
  }
  const summary = toolOutput.summary;
  const candles = toolOutput.ohlcv || [];
  if (!summary && candles.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-empty", children: "No OHLCV data available." }) });
  }
  const changeStr = summary?.price_change_pct;
  const isPositive = changeStr ? !changeStr.startsWith("-") : true;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-icon", children: "📊" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-title", children: "OHLCV Data" })
      ] }),
      summary?.interval && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-badge", children: summary.interval })
    ] }),
    summary?.mint_address && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-token", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { mint: summary.mint_address, size: 32 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-token__info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-token__label", children: "Token" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "a",
          {
            href: `https://solscan.io/token/${summary.mint_address}`,
            target: "_blank",
            rel: "noreferrer",
            className: "ohlcv-token__address",
            children: shortenAddress(summary.mint_address)
          }
        )
      ] })
    ] }),
    candles.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(MiniChart, { candles }),
    summary && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-summary", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-summary__main", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-summary__price", children: formatPrice(summary.price_close) }),
      changeStr && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `ohlcv-summary__change ${isPositive ? "ohlcv-summary__change--positive" : "ohlcv-summary__change--negative"}`, children: changeStr })
    ] }) }),
    summary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__label", children: "Open" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__value", children: formatPrice(summary.price_open) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__label", children: "High" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__value ohlcv-metric__value--high", children: formatPrice(summary.price_high) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__label", children: "Low" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__value ohlcv-metric__value--low", children: formatPrice(summary.price_low) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__label", children: "Volume" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-metric__value", children: formatVolume(summary.total_volume) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ohlcv-footer", children: [
      summary?.total_candles && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ohlcv-footer__candles", children: [
        summary.total_candles,
        " candles"
      ] }),
      summary?.provider && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ohlcv-footer__provider", children: summary.provider })
    ] }),
    summary?._truncated && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ohlcv-note", children: summary._truncated })
  ] }) });
}
const root = document.getElementById("ohlcv-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Ohlcv, {}));
}
