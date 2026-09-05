import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
function formatPrice(value) {
  if (!value || !Number.isFinite(value)) return "$0.00";
  if (value < 1e-4) return `$${value.toExponential(2)}`;
  if (value < 1) return `$${value.toFixed(6)}`;
  return `$${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatLargeNumber(value) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
function formatChange(value) {
  if (!value || !Number.isFinite(value)) return { text: "0.00%", isPositive: true };
  const isPositive = value >= 0;
  return { text: `${isPositive ? "+" : ""}${value.toFixed(2)}%`, isPositive };
}
function shortenAddress(addr) {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function TokenIcon({ symbol, imageUrl, size = 42 }) {
  const [error, setError] = reactExports.useState(false);
  const showImage = imageUrl && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-token-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-token-icon__fallback", children: (symbol || "?").slice(0, 2) }) });
}
function TokenCard({
  token,
  rank,
  isExpanded,
  onToggle
}) {
  const change = formatChange(token.priceChange24h || token.price_change_24h);
  const volume = token.volume24h || token.volume_24h;
  const mcap = token.marketCap || token.market_cap;
  const address = token.mint || token.address;
  const logo = token.logoUrl || token.logo_url || token.image || (address ? getTokenLogoUrl(address) : void 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `trending-card ${isExpanded ? "trending-card--expanded" : ""} ${change.isPositive ? "trending-card--positive" : "trending-card--negative"}`,
      onClick: onToggle,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `trending-card__glow ${change.isPositive ? "trending-card__glow--positive" : "trending-card__glow--negative"}` }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__content", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__token", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__rank-badge", children: [
                "#",
                rank
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol: token.symbol || "?", imageUrl: logo, size: isExpanded ? 56 : 42 }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__token-info", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `trending-card__symbol ${isExpanded ? "trending-card__symbol--large" : ""}`, children: token.symbol || "Unknown" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__name", children: token.name || "—" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__value", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `trending-card__price ${isExpanded ? "trending-card__price--large" : ""}`, children: formatPrice(token.price) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `trending-card__change ${change.isPositive ? "trending-card__change--positive" : "trending-card__change--negative"}`, children: change.text })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-card__divider" }),
          !isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-card__footer", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__stats", children: [
            mcap && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "trending-card__stat", children: [
              "MC ",
              formatLargeNumber(mcap)
            ] }),
            volume && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "trending-card__stat", children: [
              "VOL ",
              formatLargeNumber(volume)
            ] })
          ] }) }),
          isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__details", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__metrics", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__metric", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-label", children: "MARKET CAP" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-value", children: formatLargeNumber(mcap) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__metric", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-label", children: "VOL (24H)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-value", children: formatLargeNumber(volume) })
              ] }),
              token.holders && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__metric", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-label", children: "HOLDERS" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__metric-value", children: token.holders.toLocaleString() })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-card__links", children: [
              address && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-card__mint", title: address, children: shortenAddress(address) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-card__external-links", children: address && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://solscan.io/token/${address}`, target: "_blank", rel: "noreferrer", onClick: (e) => e.stopPropagation(), children: "Solscan" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://birdeye.so/token/${address}`, target: "_blank", rel: "noreferrer", onClick: (e) => e.stopPropagation(), children: "Birdeye" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://dexscreener.com/solana/${address}`, target: "_blank", rel: "noreferrer", onClick: (e) => e.stopPropagation(), children: "Dexscreener" })
              ] }) })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function SolscanTrending() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const [expandedIdx, setExpandedIdx] = reactExports.useState(null);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading trending tokens..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-error", children: toolOutput.error }) });
  }
  const tokens = toolOutput.tokens || toolOutput.data || toolOutput.results || [];
  const fetchedAt = toolOutput.fetchedAt || toolOutput.fetched_at;
  if (tokens.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-empty", children: "No trending tokens found." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-header__gradient" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-header__content", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-header__left", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-header__icon", children: "🔥" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "trending-header__text", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-header__label", children: "Solscan" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-header__title", children: "Trending Tokens" })
          ] })
        ] }),
        fetchedAt && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "trending-header__timestamp", children: new Date(fetchedAt).toLocaleTimeString() })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "trending-grid", children: tokens.map((token, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      TokenCard,
      {
        token,
        rank: token.rank || idx + 1,
        isExpanded: expandedIdx === idx,
        onToggle: () => setExpandedIdx(expandedIdx === idx ? null : idx)
      },
      token.mint || token.address || idx
    )) })
  ] });
}
const root = document.getElementById("solscan-trending-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolscanTrending, {}));
}
