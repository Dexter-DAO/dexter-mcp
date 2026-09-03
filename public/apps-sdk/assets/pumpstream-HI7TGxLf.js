import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
function pickNumber(...values) {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/%/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return void 0;
}
function formatViewerCount(value) {
  if (value === void 0) return "—";
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
}
function formatCurrency(value) {
  if (value === void 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0
  }).format(value);
}
function formatMomentum(value) {
  if (value === void 0) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function TokenIcon({ symbol, mint, size = 48 }) {
  const [error, setError] = reactExports.useState(false);
  const imageUrl = mint ? getTokenLogoUrl(mint) : void 0;
  const showImage = imageUrl && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-token-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer",
      style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: "4px" }
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: size * 0.35 }, children: symbol.slice(0, 2).toUpperCase() }) });
}
function StreamCard({ stream, index }) {
  const [imgError, setImgError] = reactExports.useState(false);
  const title = stream.name || stream.symbol || stream.mintId || stream.channel || `Stream ${index + 1}`;
  const viewers = pickNumber(stream.currentViewers, stream.viewer_count, stream.viewers);
  const marketCap = pickNumber(stream.marketCapUsd, stream.market_cap_usd, stream.marketCap);
  const momentumRaw = pickNumber(stream.momentum, stream.signal);
  const isPositive = momentumRaw !== void 0 && momentumRaw >= 0;
  const href = stream.url || stream.streamUrl || (stream.mintId ? `https://pump.fun/${stream.mintId}` : void 0);
  const showThumbnail = stream.thumbnail && !imgError;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "a",
    {
      href,
      target: "_blank",
      rel: "noreferrer",
      className: "pumpstream-card",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__thumbnail", children: [
          showThumbnail ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: stream.thumbnail,
              alt: title,
              onError: () => setImgError(true),
              referrerPolicy: "no-referrer"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-card__thumbnail-fallback", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: title, mint: stream.mintId, size: 48 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__live-badge", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__live-dot" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "LIVE" })
          ] }),
          viewers !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__viewers", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "7", r: "4" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatViewerCount(viewers) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__content", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__title", children: title }),
            stream.symbol && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__symbol", children: stream.symbol })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__metrics", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__metric", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__metric-label", children: "MCAP" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__metric-value", children: formatCurrency(marketCap) })
            ] }),
            momentumRaw !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-card__metric pumpstream-card__metric--right", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-card__metric-label", children: "MOMENTUM" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `pumpstream-card__metric-value ${isPositive ? "pumpstream-card__metric-value--positive" : "pumpstream-card__metric-value--negative"}`, children: formatMomentum(momentumRaw) })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function Pumpstream() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const [showAll, setShowAll] = reactExports.useState(false);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading live streams..." })
    ] }) });
  }
  const streams = Array.isArray(toolOutput.streams) ? toolOutput.streams : [];
  if (streams.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-empty", children: "No active Pump.fun streams detected." }) });
  }
  const visibleStreams = showAll ? streams : streams.slice(0, 6);
  const hiddenCount = streams.length - visibleStreams.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-title", children: "Live Streams" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pumpstream-header__badges", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "pumpstream-live-indicator", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-live-indicator__dot" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pumpstream-live-indicator__ping" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Live" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "pumpstream-count", children: [
          streams.length,
          " streams"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pumpstream-grid", children: visibleStreams.map((stream, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      StreamCard,
      {
        stream,
        index
      },
      stream.mintId || stream.url || `${stream.name}-${index}`
    )) }),
    hiddenCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "pumpstream-show-more", onClick: () => setShowAll(!showAll), children: showAll ? "Collapse" : `Show ${hiddenCount} more streams` })
  ] });
}
const root = document.getElementById("pumpstream-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Pumpstream, {}));
}
