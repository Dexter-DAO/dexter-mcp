import { j as jsxRuntimeExports, r as reactExports } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Badge } from "./index-DbPowsVZ.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { C as ChevronUp, a as ChevronDown } from "./ChevronUp-DRwehCbi.js";
import { C as CreditCard } from "./CreditCard-DrQkauka.js";
import { E as ExternalLink } from "./ExternalLink-CX0ioRAf.js";
import { E as EmptyMessage } from "./EmptyMessage-CHDmduY1.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
const Trending = (props) => jsxRuntimeExports.jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: jsxRuntimeExports.jsx("path", { d: "M14 7C14 6.44772 14.4477 6 15 6H21C21.5523 6 22 6.44772 22 7V13C22 13.5523 21.5523 14 21 14C20.4477 14 20 13.5523 20 13V9.41421L13.2071 16.2071C12.8166 16.5976 12.1834 16.5976 11.7929 16.2071L8.5 12.9142L3.70711 17.7071C3.31658 18.0976 2.68342 18.0976 2.29289 17.7071C1.90237 17.3166 1.90237 16.6834 2.29289 16.2929L7.79289 10.7929C8.18342 10.4024 8.81658 10.4024 9.20711 10.7929L12.5 14.0858L18.5858 8H15C14.4477 8 14 7.55228 14 7Z", fill: "currentColor" }) });
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
  if (!mint) return void 0;
  return mint.slice(0, 4).toUpperCase();
}
function formatUsdCompact(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}
function formatUsdPrecise(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6
  }).format(value);
}
function formatUsdNoCents(value) {
  return "$" + Math.round(value).toLocaleString("en-US");
}
function formatPercent(value) {
  const corrected = value / 100;
  return `${corrected >= 0 ? "+" : ""}${corrected.toFixed(2)}%`;
}
function formatAmount(amount, decimals) {
  if (amount === void 0) return void 0;
  const maxDigits = decimals && decimals > 4 ? 4 : decimals ?? 6;
  return amount.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}
function abbreviate(value, prefix = 4, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function SolanaIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 128 128", fill: "none", className, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "sol-bal-grad", x1: "90%", y1: "0%", x2: "10%", y2: "100%", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#00FFA3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#DC1FFF" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 93.5c0.9-0.9 2.2-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3l-24.2 24.2c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 93.5z", fill: "url(#sol-bal-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 2.5c1-1 2.3-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3L103.5 29.5c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 2.5z", fill: "url(#sol-bal-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M102.7 47.3c-0.9-0.9-2.2-1.5-3.5-1.5H2.1c-2.2 0-3.4 2.7-1.8 4.3l24.2 24.2c0.9 0.9 2.2 1.5 3.5 1.5h97.1c2.2 0 3.4-2.7 1.8-4.3L102.7 47.3z", fill: "url(#sol-bal-grad)" })
  ] });
}
function TokenIcon({ symbol, imageUrl, size = "md" }) {
  const [error, setError] = reactExports.useState(false);
  const showImage = imageUrl && !error;
  const sizeClasses = {
    sm: "size-8",
    md: "size-10",
    lg: "size-14"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${sizeClasses[size]} rounded-xl overflow-hidden bg-surface-secondary flex items-center justify-center flex-shrink-0`, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer",
      className: "w-full h-full object-cover"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-bold text-secondary", children: symbol.slice(0, 2) }) });
}
function TokenCard({
  entry,
  index,
  isExpanded,
  onToggle
}) {
  const tokenMeta = entry.token;
  const mint = pickString(entry.mint);
  const symbol = pickString(tokenMeta?.symbol) ?? symbolFromMint(mint) ?? `Token ${index + 1}`;
  const name = pickString(tokenMeta?.name) ?? symbol;
  const iconUrl = pickString(
    tokenMeta?.imageUrl,
    tokenMeta?.logoUri,
    entry.icon,
    entry.logo,
    mint ? getTokenLogoUrl(mint) : void 0
  );
  const amountUi = pickNumber(entry.amountUi, entry.amount_ui);
  const amountDisplay = formatAmount(amountUi, entry.decimals);
  const priceUsdRaw = pickNumber(tokenMeta?.priceUsd, tokenMeta?.price_usd);
  const priceUsd = priceUsdRaw !== void 0 ? formatUsdPrecise(priceUsdRaw) : void 0;
  const priceChangeRaw = pickNumber(tokenMeta?.priceChange24h, tokenMeta?.price_change_24h);
  const priceChange = priceChangeRaw !== void 0 ? formatPercent(priceChangeRaw) : void 0;
  const isPositive = priceChangeRaw !== void 0 && priceChangeRaw >= 0;
  const holdingUsdRaw = pickNumber(tokenMeta?.holdingUsd, tokenMeta?.balanceUsd, tokenMeta?.balance_usd) ?? (priceUsdRaw && amountUi ? priceUsdRaw * amountUi : void 0);
  const holdingUsd = holdingUsdRaw !== void 0 ? formatUsdNoCents(holdingUsdRaw) : void 0;
  const marketCapRaw = pickNumber(tokenMeta?.marketCap, tokenMeta?.market_cap);
  const marketCap = marketCapRaw !== void 0 ? formatUsdCompact(marketCapRaw) : void 0;
  const volumeRaw = pickNumber(tokenMeta?.volume24hUsd, tokenMeta?.volume24h);
  const volume = volumeRaw !== void 0 ? formatUsdCompact(volumeRaw) : void 0;
  const liquidityRaw = pickNumber(tokenMeta?.liquidityUsd, tokenMeta?.liquidity_usd);
  const liquidity = liquidityRaw !== void 0 ? formatUsdCompact(liquidityRaw) : void 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `rounded-xl border p-4 cursor-pointer transition-all hover:border-default-strong ${isExpanded ? "border-accent/30 bg-accent/5" : "border-default bg-surface"}`,
      onClick: onToggle,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol, imageUrl: iconUrl, size: isExpanded ? "lg" : "md" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-semibold text-primary ${isExpanded ? "text-lg" : "text-sm"}`, children: symbol }),
                priceChange && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Badge,
                  {
                    color: isPositive ? "success" : "danger",
                    size: "sm",
                    variant: "soft",
                    children: priceChange
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary truncate", children: name })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-right", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-semibold text-primary ${isExpanded ? "text-lg" : "text-sm"}`, children: holdingUsd ?? "—" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary", children: amountDisplay })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-tertiary", children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "size-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "size-4" }) })
          ] })
        ] }),
        !isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mt-3 pt-3 border-t border-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary", children: priceUsd ?? "—" }),
          volume && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-tertiary", children: [
            "VOL ",
            volume
          ] })
        ] }),
        isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-4 border-t border-subtle space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Price" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: priceUsd ?? "—" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "24h Change" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-sm font-medium mt-0.5 ${isPositive ? "text-success" : "text-danger"}`, children: priceChange ?? "—" })
            ] }),
            marketCap && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Market Cap" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: marketCap })
            ] }),
            volume && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Volume 24h" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: volume })
            ] }),
            liquidity && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Liquidity" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: liquidity })
            ] })
          ] }),
          mint && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs text-tertiary font-mono", children: abbreviate(mint, 6, 4) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://solscan.io/token/${mint}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                "Solscan",
                /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
              ] }) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://birdeye.so/token/${mint}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                "Birdeye",
                /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
              ] }) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://dexscreener.com/solana/${mint}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                "DEX",
                /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
              ] }) }) })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function SolanaBalances() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const [expandedIndex, setExpandedIndex] = reactExports.useState(null);
  const [showAll, setShowAll] = reactExports.useState(false);
  const balances = Array.isArray(toolOutput) ? toolOutput : Array.isArray(toolOutput?.balances) ? toolOutput.balances : [];
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-3 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-secondary text-sm", children: "Loading balances..." })
    ] }) });
  }
  if (balances.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { fill: "none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CreditCard, { className: "size-8" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { children: "No Balances Found" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: "No token balances detected for this wallet." })
    ] }) });
  }
  let totalUsd = 0;
  let solPriceUsd = 0;
  for (const entry of balances) {
    const tokenMeta = entry.token;
    const holdingUsd = pickNumber(tokenMeta?.holdingUsd, tokenMeta?.balanceUsd, tokenMeta?.balance_usd);
    const priceUsd = pickNumber(tokenMeta?.priceUsd, tokenMeta?.price_usd);
    const amountUi = pickNumber(entry.amountUi, entry.amount_ui);
    const symbol = pickString(tokenMeta?.symbol);
    if (symbol === "SOL" && priceUsd) {
      solPriceUsd = priceUsd;
    }
    const value = holdingUsd ?? (priceUsd && amountUi ? priceUsd * amountUi : 0);
    if (value && Number.isFinite(value)) {
      totalUsd += value;
    }
  }
  const totalSol = solPriceUsd > 0 ? totalUsd / solPriceUsd : void 0;
  const getEntryValue = (e) => {
    const tm = e.token;
    const h = pickNumber(tm?.holdingUsd, tm?.balanceUsd, tm?.balance_usd);
    const p = pickNumber(tm?.priceUsd, tm?.price_usd);
    const a = pickNumber(e.amountUi, e.amount_ui);
    return h ?? (p && a ? p * a : 0) ?? 0;
  };
  const valuedBalances = balances.filter((e) => getEntryValue(e) > 0).sort((a, b) => getEntryValue(b) - getEntryValue(a));
  const unvaluedBalances = balances.filter((e) => getEntryValue(e) <= 0);
  const visibleBalances = showAll ? [...valuedBalances, ...unvaluedBalances] : valuedBalances.slice(0, 6);
  const hiddenCount = showAll ? 0 : Math.max(0, valuedBalances.length - 6) + unvaluedBalances.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-tertiary text-xs uppercase tracking-wide mb-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Trending, { className: "size-4" }),
        "Total Portfolio"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-3xl font-bold text-primary", children: formatUsdNoCents(totalUsd) }),
      totalSol !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mt-2 text-sm text-secondary", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SolanaIcon, { className: "size-4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          totalSol.toLocaleString("en-US", { maximumFractionDigits: 0 }),
          " SOL"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: visibleBalances.map((entry, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      TokenCard,
      {
        entry,
        index,
        isExpanded: expandedIndex === index,
        onToggle: () => setExpandedIndex(expandedIndex === index ? null : index)
      },
      `${index}-${entry.mint || entry.ata || "unknown"}`
    )) }),
    hiddenCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
      Button,
      {
        color: "secondary",
        variant: "soft",
        size: "sm",
        onClick: () => setShowAll(!showAll),
        className: "w-full",
        children: showAll ? "Collapse List" : `Show ${hiddenCount} more assets`
      }
    )
  ] });
}
const root = document.getElementById("solana-balances-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolanaBalances, {}));
}
