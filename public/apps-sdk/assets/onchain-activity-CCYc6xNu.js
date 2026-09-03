import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
function getVolumes(summary) {
  return {
    buy: summary.buyQuoteVolume ?? summary.buyVolumeSol ?? 0,
    sell: summary.sellQuoteVolume ?? summary.sellVolumeSol ?? 0,
    net: summary.netQuoteVolume ?? summary.netFlowSol ?? summary.netSol ?? 0
  };
}
function formatTimeframe(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
function formatVolume(value, decimals = 4) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(decimals);
}
function formatUsd(value) {
  if (value === void 0 || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
function abbreviate(value, len = 6) {
  if (value.length <= len * 2 + 3) return value;
  return `${value.slice(0, len)}…${value.slice(-4)}`;
}
function relativeTime(timestamp) {
  if (!timestamp) return "—";
  const now = Math.floor(Date.now() / 1e3);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function VolumeBar({ buy, sell, label }) {
  const total = buy + sell;
  const buyPct = total > 0 ? buy / total * 100 : 50;
  const sellPct = total > 0 ? sell / total * 100 : 50;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-volume-bar", children: [
    label && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-volume-bar__label", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-volume-bar__track", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-volume-bar__buy", style: { width: `${buyPct}%` } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-volume-bar__sell", style: { width: `${sellPct}%` } }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-volume-bar__values", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-volume-bar__value onchain-volume-bar__value--buy", children: formatVolume(buy) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-volume-bar__value onchain-volume-bar__value--sell", children: formatVolume(sell) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-volume-bar__legend", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "BUY ",
        buyPct.toFixed(0),
        "%"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "SELL ",
        sellPct.toFixed(0),
        "%"
      ] })
    ] })
  ] });
}
function NetFlowIndicator({ value, symbol = "SOL" }) {
  const isPositive = value > 0;
  const isNeutral = Math.abs(value) < 1e-4;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `onchain-net-flow ${isNeutral ? "" : isPositive ? "onchain-net-flow--positive" : "onchain-net-flow--negative"}`, children: [
    !isNeutral && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-net-flow__arrow", children: isPositive ? "↑" : "↓" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-net-flow__info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-net-flow__label", children: "Net Flow" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-net-flow__value", children: [
        isPositive ? "+" : "",
        formatVolume(value),
        " ",
        symbol
      ] })
    ] })
  ] });
}
function TopTradersList({ buyers, sellers }) {
  const [showAll, setShowAll] = reactExports.useState(false);
  const limit = showAll ? 10 : 3;
  const topBuyers = (buyers || []).slice(0, limit);
  const topSellers = (sellers || []).slice(0, limit);
  if (topBuyers.length === 0 && topSellers.length === 0) return null;
  const hasMore = (buyers?.length || 0) > 3 || (sellers?.length || 0) > 3;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-traders", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-traders__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__title", children: "Top Traders" }),
      hasMore && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "onchain-traders__toggle", onClick: () => setShowAll(!showAll), children: showAll ? "Show Less" : "Show All" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-traders__grid", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-traders__column", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__column-title onchain-traders__column-title--buy", children: "↑ Buyers" }),
        topBuyers.map((flow) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "a",
          {
            href: `https://solscan.io/account/${flow.wallet}`,
            target: "_blank",
            rel: "noreferrer",
            className: "onchain-traders__item onchain-traders__item--buy",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__wallet", children: abbreviate(flow.wallet) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-traders__amount", children: [
                "+",
                formatVolume(flow.netBaseVolume, 2)
              ] })
            ]
          },
          flow.wallet
        ))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-traders__column", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__column-title onchain-traders__column-title--sell", children: "↓ Sellers" }),
        topSellers.map((flow) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "a",
          {
            href: `https://solscan.io/account/${flow.wallet}`,
            target: "_blank",
            rel: "noreferrer",
            className: "onchain-traders__item onchain-traders__item--sell",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__wallet", children: abbreviate(flow.wallet) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-traders__amount", children: formatVolume(flow.netBaseVolume, 2) })
            ]
          },
          flow.wallet
        ))
      ] })
    ] })
  ] });
}
function RecentTradesList({ trades }) {
  const [expanded, setExpanded] = reactExports.useState(false);
  const limit = expanded ? 20 : 5;
  const displayTrades = (trades || []).slice(0, limit);
  if (displayTrades.length === 0) return null;
  const hasMore = (trades?.length || 0) > 5;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-trades", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-trades__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-trades__title", children: "Recent Trades" }),
      hasMore && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "onchain-trades__toggle", onClick: () => setExpanded(!expanded), children: expanded ? "Collapse" : `Show ${Math.min(20, trades.length)} trades` })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-trades__list", children: displayTrades.map((trade) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "a",
      {
        href: `https://solscan.io/tx/${trade.signature}`,
        target: "_blank",
        rel: "noreferrer",
        className: `onchain-trades__item ${trade.side === "buy" ? "onchain-trades__item--buy" : "onchain-trades__item--sell"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-trades__item-left", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-trades__arrow", children: trade.side === "buy" ? "↑" : "↓" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-trades__sig", children: abbreviate(trade.signature, 8) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-trades__item-right", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-trades__amount", children: [
              formatVolume(trade.quoteAbs, 4),
              " ",
              trade.quoteSymbol || "SOL"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-trades__time", children: relativeTime(trade.timestamp) })
          ] })
        ]
      },
      trade.signature
    )) })
  ] });
}
function TokenActivityView({ summary }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "TRADES" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__value", children: summary.tradeCount.toLocaleString() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "WALLETS" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__value", children: summary.uniqueWallets.toLocaleString() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "TIMEFRAME" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__value", children: formatTimeframe(summary.timeframeSeconds) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(VolumeBar, { buy: getVolumes(summary).buy, sell: getVolumes(summary).sell, label: "VOLUME (SOL)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(NetFlowIndicator, { value: getVolumes(summary).net }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TopTradersList, { buyers: summary.topNetBuyers, sellers: summary.topNetSellers }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(RecentTradesList, { trades: summary.recentTrades }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-footer", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("a", { href: `https://solscan.io/token/${summary.mint}`, target: "_blank", rel: "noreferrer", className: "onchain-hash", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-hash__label", children: "Token" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-hash__value", children: abbreviate(summary.mint, 8) })
    ] }) })
  ] });
}
function WalletActivityView({ summary }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-wallet-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-wallet-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "7", r: "4" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-wallet-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://solscan.io/account/${summary.wallet}`, target: "_blank", rel: "noreferrer", className: "onchain-wallet-address", children: abbreviate(summary.wallet, 8) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-wallet-timeframe", children: [
          formatTimeframe(summary.timeframeSeconds),
          " activity window"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metrics onchain-metrics--4col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "TRADES" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__value", children: summary.tradeCount.toLocaleString() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "BUY VOL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-metric__value", children: [
          formatVolume(getVolumes(summary).buy, 4),
          " SOL"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "SELL VOL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-metric__value", children: [
          formatVolume(getVolumes(summary).sell, 4),
          " SOL"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-metric__label", children: "NET SOL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `onchain-metric__value ${getVolumes(summary).net > 0 ? "onchain-metric__value--positive" : getVolumes(summary).net < 0 ? "onchain-metric__value--negative" : ""}`, children: [
          formatVolume(getVolumes(summary).net, 4),
          " SOL"
        ] })
      ] })
    ] }),
    summary.netUsdChange !== void 0 && summary.netUsdChange !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `onchain-pnl ${summary.netUsdChange >= 0 ? "onchain-pnl--positive" : "onchain-pnl--negative"}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-pnl__label", children: "NET P&L" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-pnl__value", children: [
        summary.netUsdChange >= 0 ? "+" : "",
        formatUsd(summary.netUsdChange)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(RecentTradesList, { trades: summary.trades }),
    summary.mint && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-footer", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("a", { href: `https://solscan.io/token/${summary.mint}`, target: "_blank", rel: "noreferrer", className: "onchain-hash", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-hash__label", children: "Token" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-hash__value", children: abbreviate(summary.mint, 8) })
    ] }) })
  ] });
}
function OnchainActivity() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Analyzing on-chain activity..." })
    ] }) });
  }
  if (toolOutput.ok === false || toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-error", children: toolOutput.error || toolOutput.message || "Activity lookup failed" }) });
  }
  const scope = toolOutput.scope || "token";
  const summary = toolOutput.summary;
  if (!summary) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-error", children: "No activity data available" }) });
  }
  const scopeConfig = {
    token: { label: "Token", icon: "🚀" },
    wallet: { label: "Wallet", icon: "👤" },
    trade: { label: "Trade", icon: "📊" }
  }[scope];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "onchain-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "onchain-card__title-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-card__icon", children: "📊" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "onchain-card__title", children: "On-Chain Activity" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "onchain-scope-badge", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: scopeConfig.icon }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: scopeConfig.label })
      ] })
    ] }),
    scope === "token" && /* @__PURE__ */ jsxRuntimeExports.jsx(TokenActivityView, { summary }),
    scope === "wallet" && /* @__PURE__ */ jsxRuntimeExports.jsx(WalletActivityView, { summary })
  ] }) });
}
const root = document.getElementById("onchain-activity-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(OnchainActivity, {}));
}
