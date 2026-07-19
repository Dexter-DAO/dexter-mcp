import { j as jsxRuntimeExports, r as reactExports } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Badge } from "./index-DbPowsVZ.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { C as Check } from "./Check-BZrRAPv_.js";
import { E as ExternalLink } from "./ExternalLink-CX0ioRAf.js";
import { S as Search } from "./Search-wAJIDm_v.js";
import { W as Warning } from "./Warning-fnh1SKl0.js";
import { A as Alert } from "./Alert-Bk5IwN3Q.js";
import { E as EmptyMessage } from "./EmptyMessage-CHDmduY1.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
import { u as useCallTool } from "./use-call-tool-ClsA_gLD.js";
import { u as useSendFollowUp } from "./use-send-followup-D7SVDohc.js";
import { u as useOpenExternal } from "./use-open-external-BoQwh7M_.js";
import { g as getTokenLogoUrl } from "./utils-P8Td2kdr.js";
const ChevronRight = (props) => jsxRuntimeExports.jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M8.293 4.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L14.586 12 8.293 5.707a1 1 0 0 1 0-1.414Z", clipRule: "evenodd" }) });
const Globe = (props) => jsxRuntimeExports.jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: jsxRuntimeExports.jsx("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9851 4.00291C11.9744 4.00615 11.953 4.01416 11.921 4.03356C11.7908 4.11248 11.5742 4.32444 11.325 4.77696C11.0839 5.21453 10.8521 5.8046 10.6514 6.53263C10.3148 7.75315 10.0844 9.29169 10.019 11H13.981C13.9156 9.29169 13.6852 7.75315 13.3486 6.53263C13.1479 5.8046 12.9161 5.21453 12.675 4.77696C12.4258 4.32444 12.2092 4.11248 12.079 4.03356C12.047 4.01416 12.0256 4.00615 12.0149 4.00291C12.0067 4.00046 12.001 4.00006 11.9996 4C11.9982 4.00006 11.9933 4.00046 11.9851 4.00291ZM8.01766 11C8.08396 9.13314 8.33431 7.41167 8.72334 6.00094C8.87366 5.45584 9.04762 4.94639 9.24523 4.48694C6.48462 5.49946 4.43722 7.9901 4.06189 11H8.01766ZM4.06189 13H8.01766C8.09487 15.1737 8.42177 17.1555 8.93 18.6802C9.02641 18.9694 9.13134 19.2483 9.24522 19.5131C6.48461 18.5005 4.43722 16.0099 4.06189 13ZM10.019 13C10.0955 14.9972 10.3973 16.7574 10.8274 18.0477C11.0794 18.8038 11.3575 19.3436 11.6177 19.6737C11.7455 19.8359 11.8494 19.9225 11.9186 19.9649C11.9515 19.9852 11.9736 19.9935 11.9847 19.9969C11.9948 20 11.9999 20 11.9999 20C11.9999 20 12.0049 20.0001 12.0153 19.9969C12.0264 19.9935 12.0485 19.9852 12.0814 19.9649C12.1506 19.9225 12.2545 19.8359 12.3823 19.6737C12.6425 19.3436 12.9206 18.8038 13.1726 18.0477C13.6027 16.7574 13.9045 14.9972 13.981 13H10.019ZM15.9823 13C15.9051 15.1737 15.5782 17.1555 15.07 18.6802C14.9736 18.9694 14.8687 19.2483 14.7548 19.5131C17.5154 18.5005 19.5628 16.0099 19.9381 13H15.9823ZM19.9381 11C19.5628 7.99009 17.5154 5.49946 14.7548 4.48694C14.9524 4.94639 15.1263 5.45584 15.2767 6.00094C15.6657 7.41167 15.916 9.13314 15.9823 11H19.9381Z" }) });
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
function formatUsdCompact(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}
function formatUsdPrecise(value) {
  const decimals = value < 0.01 ? 6 : value < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals
  }).format(value);
}
function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}
function abbreviate(value, prefix = 4, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function TokenIcon({ symbol, imageUrl, size = "lg" }) {
  const [error, setError] = reactExports.useState(false);
  const showImage = imageUrl && !error;
  const sizeClass = size === "lg" ? "size-16" : "size-12";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${sizeClass} rounded-2xl overflow-hidden bg-surface-secondary flex items-center justify-center flex-shrink-0`, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: imageUrl,
      alt: symbol,
      onError: () => setError(true),
      referrerPolicy: "no-referrer",
      className: "w-full h-full object-cover"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xl font-bold text-secondary", children: symbol.slice(0, 2) }) });
}
function TwitterIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", fill: "currentColor", className, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" }) });
}
function TelegramIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", fill: "currentColor", className, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" }) });
}
function DiscordIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", fill: "currentColor", className, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" }) });
}
function SecurityAuditSection({ audit }) {
  const isSus = audit.isSus === true;
  const items = [
    { label: "Mint Disabled", ok: audit.mintAuthorityDisabled === true },
    { label: "Freeze Disabled", ok: audit.freezeAuthorityDisabled === true },
    { label: "Low Whale Risk", ok: !audit.highSingleOwnership }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase tracking-wide font-medium", children: "Security" }),
      isSus && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "danger", size: "sm", variant: "soft", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, { className: "size-3" }),
        "Suspicious"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-2", children: items.map((item, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
      item.ok ? /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5 text-success" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, { className: "size-3.5 text-warning" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-xs ${item.ok ? "text-secondary" : "text-warning"}`, children: item.label })
    ] }, i)) }),
    audit.topHoldersPercentage !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: "Top Holders" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: audit.topHoldersPercentage > 50 ? "text-warning font-medium" : "text-secondary", children: [
        audit.topHoldersPercentage.toFixed(1),
        "%"
      ] })
    ] })
  ] });
}
function OrganicScoreMeter({ score, label }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 bg-surface-secondary rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `h-full ${color} rounded-full transition-all`,
        style: { width: `${Math.min(score, 100)}%` }
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-primary", children: score.toFixed(0) }),
      label && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: label })
    ] })
  ] });
}
function TokenCard({ token }) {
  const { callTool } = useCallTool();
  const sendFollowUp = useSendFollowUp();
  const openExternal = useOpenExternal();
  const [isQuoting, setIsQuoting] = reactExports.useState(false);
  const info = token.info;
  const address = pickString(token.address, token.mint);
  const symbol = pickString(token.symbol, info?.symbol) ?? "UNKNOWN";
  const name = pickString(token.name, info?.name) ?? symbol;
  const imageUrl = pickString(
    token.logoUri,
    token.imageUrl,
    info?.imageUrl,
    token.logoURI,
    token.icon,
    token.logo,
    token.image,
    address ? getTokenLogoUrl(address) : void 0
  );
  const priceRaw = pickNumber(token.priceUsd, token.price_usd);
  const price = priceRaw !== void 0 ? formatUsdPrecise(priceRaw) : void 0;
  const priceChangeRaw = pickNumber(token.priceChange24h, token.price_change_24h, token.priceChange24hPct);
  const priceChange = priceChangeRaw !== void 0 ? formatPercent(priceChangeRaw) : void 0;
  const isPositive = priceChangeRaw !== void 0 && priceChangeRaw >= 0;
  const marketCapRaw = pickNumber(token.marketCap, token.market_cap, token.fdvUsd);
  const marketCap = marketCapRaw !== void 0 ? formatUsdCompact(marketCapRaw) : void 0;
  const volumeRaw = pickNumber(token.volume24hUsd, token.volume24h);
  const volume = volumeRaw !== void 0 ? formatUsdCompact(volumeRaw) : void 0;
  const liquidityRaw = pickNumber(token.liquidityUsd, token.liquidity_usd);
  const liquidity = liquidityRaw !== void 0 ? formatUsdCompact(liquidityRaw) : void 0;
  const holderCount = token.holderCount ? formatNumber(token.holderCount) : void 0;
  const isVerified = token.isVerified === true;
  const organicScore = pickNumber(token.organicScore);
  const tags = Array.isArray(token.jupiterTags) ? token.jupiterTags : [];
  const showTags = tags.filter((t) => !["strict", "verified"].includes(t)).slice(0, 3);
  const websiteUrl = pickString(token.websiteUrl);
  const twitterUrl = pickString(token.twitterUrl);
  const telegramUrl = pickString(token.telegramUrl);
  const discordUrl = pickString(token.discordUrl);
  const hasSocials = websiteUrl || twitterUrl || telegramUrl || discordUrl;
  const audit = token.audit;
  const hasAudit = audit && (audit.mintAuthorityDisabled !== void 0 || audit.freezeAuthorityDisabled !== void 0 || audit.topHoldersPercentage !== void 0);
  const isSus = audit?.isSus === true;
  const handleGetQuote = async () => {
    if (!address) return;
    setIsQuoting(true);
    await callTool("solana_swap_preview", { outputMint: address, amount: 1 });
    setIsQuoting(false);
  };
  const handleCheckSlippage = async () => {
    if (!address) return;
    await callTool("slippage_sentinel", { token_out: address });
  };
  const handleAnalyze = async () => {
    await sendFollowUp(`Give me a detailed analysis of ${symbol} (${address})`);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-xl border p-4 space-y-4 ${isSus ? "border-danger/30 bg-danger/5" : isPositive ? "border-success/20 bg-surface" : "border-danger/20 bg-surface"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TokenIcon, { symbol, imageUrl, size: "lg" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-lg text-primary truncate", children: name }),
          isVerified && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "success", size: "sm", variant: "soft", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3" }),
            "Verified"
          ] }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-secondary", children: symbol }),
          holderCount && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-tertiary", children: [
            "• ",
            holderCount,
            " holders"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-right flex-shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-primary", children: price ?? "—" }),
        priceChange && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Badge,
          {
            color: isPositive ? "success" : "danger",
            size: "sm",
            variant: "soft",
            className: "mt-1",
            children: priceChange
          }
        )
      ] })
    ] }),
    showTags.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 flex-wrap", children: showTags.map((tag, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "secondary", size: "sm", variant: "outline", children: tag.replace(/-/g, " ") }, i)) }),
    isSus && /* @__PURE__ */ jsxRuntimeExports.jsx(
      Alert,
      {
        color: "danger",
        variant: "soft",
        title: "Suspicious Token",
        description: "This token has been flagged as potentially risky. Exercise extreme caution."
      }
    ),
    organicScore !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide mb-2", children: "Organic Score" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(OrganicScoreMeter, { score: organicScore, label: token.organicScoreLabel })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
      marketCap && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "MCap" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: marketCap })
      ] }),
      volume && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Vol 24h" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: volume })
      ] }),
      liquidity && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Liquidity" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: liquidity })
      ] })
    ] }),
    hasAudit && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-3 border-t border-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SecurityAuditSection, { audit }) }),
    hasSocials && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      websiteUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", onClick: () => openExternal(websiteUrl), uniform: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Globe, { className: "size-4" }) }),
      twitterUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", onClick: () => openExternal(twitterUrl), uniform: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TwitterIcon, { className: "size-4" }) }),
      telegramUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", onClick: () => openExternal(telegramUrl), uniform: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TelegramIcon, { className: "size-4" }) }),
      discordUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", onClick: () => openExternal(discordUrl), uniform: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(DiscordIcon, { className: "size-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "primary", variant: "solid", size: "sm", onClick: handleGetQuote, disabled: isQuoting, children: isQuoting ? "Quoting..." : "Get Quote" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "soft", size: "sm", onClick: handleCheckSlippage, children: "Slippage" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "soft", size: "sm", onClick: handleAnalyze, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        "Analyze",
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-3.5" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pt-3 border-t border-subtle", children: [
      address && /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs text-tertiary font-mono", children: abbreviate(address, 6, 4) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: address && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://solscan.io/token/${address}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          "Solscan",
          /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
        ] }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://birdeye.so/token/${address}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          "Birdeye",
          /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
        ] }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: `https://dexscreener.com/solana/${address}`, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          "Chart",
          /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
        ] }) }) })
      ] }) })
    ] })
  ] });
}
function SolanaTokenLookup() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-3 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-secondary text-sm", children: "Looking up token..." })
    ] }) });
  }
  let tokens = [];
  if (Array.isArray(toolOutput.results)) {
    tokens = toolOutput.results;
  } else if (toolOutput.result) {
    tokens = [toolOutput.result];
  } else if (toolOutput.token) {
    tokens = [toolOutput.token];
  } else if (toolOutput.address || toolOutput.mint || toolOutput.symbol) {
    tokens = [toolOutput];
  }
  if (tokens.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { fill: "none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "size-8" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { children: "No Tokens Found" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: "Could not find any tokens matching your query." })
    ] }) });
  }
  const visibleTokens = tokens.slice(0, 3);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "size-5 text-secondary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-semibold text-base text-primary", children: "Token Analysis" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "secondary", size: "sm", variant: "soft", children: tokens.length })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: visibleTokens.map((token, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(TokenCard, { token }, token.address || token.mint || index)) })
  ] });
}
const root = document.getElementById("solana-token-lookup-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(SolanaTokenLookup, {}));
}
