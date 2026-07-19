import { j as jsxRuntimeExports, r as reactExports } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Badge } from "./index-DbPowsVZ.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { C as Check } from "./Check-BZrRAPv_.js";
import { C as ChevronUp, a as ChevronDown } from "./ChevronUp-DRwehCbi.js";
import { C as Copy } from "./Copy-CMyF_UKx.js";
import { C as CreditCard } from "./CreditCard-DrQkauka.js";
import { E as EmptyMessage } from "./EmptyMessage-CHDmduY1.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
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
function formatUsd(value) {
  const num = pickNumber(value);
  if (num === void 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(num);
}
function formatToken(value, symbol) {
  if (value === void 0 || !Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return symbol ? `${formatted} ${symbol}` : formatted;
}
function abbreviate(value, prefix = 6, suffix = 4) {
  if (!value) return "—";
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
function SolanaIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 128 128", fill: "none", className, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "sol-port-grad", x1: "90%", y1: "0%", x2: "10%", y2: "100%", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#00FFA3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#DC1FFF" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 93.5c0.9-0.9 2.2-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3l-24.2 24.2c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 93.5z", fill: "url(#sol-port-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 2.5c1-1 2.3-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3L103.5 29.5c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 2.5z", fill: "url(#sol-port-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M102.7 47.3c-0.9-0.9-2.2-1.5-3.5-1.5H2.1c-2.2 0-3.4 2.7-1.8 4.3l24.2 24.2c0.9 0.9 2.2 1.5 3.5 1.5h97.1c2.2 0 3.4-2.7 1.8-4.3L102.7 47.3z", fill: "url(#sol-port-grad)" })
  ] });
}
function CopyAddressButton({ address }) {
  const [copied, setCopied] = reactExports.useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = address;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Button,
    {
      color: "secondary",
      variant: "ghost",
      size: "xs",
      onClick: handleCopy,
      uniform: true,
      children: copied ? /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { className: "size-3.5" })
    }
  );
}
function WalletCard({ wallet, index }) {
  const [expanded, setExpanded] = reactExports.useState(false);
  const address = wallet.address || wallet.public_key || `Wallet ${index + 1}`;
  const label = wallet.label;
  const chain = wallet.chain ?? "Solana";
  const isDefault = wallet.is_default ?? false;
  const status = wallet.status;
  const hasBalances = wallet.sol !== void 0 || wallet.usdc !== void 0 || wallet.usdt !== void 0;
  const totalUsd = wallet.totalUsd !== void 0 ? formatUsd(wallet.totalUsd) : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `rounded-xl border p-4 transition-all ${isDefault ? "border-success/30 bg-success/5" : "border-default bg-surface"} ${hasBalances ? "cursor-pointer hover:border-default-strong" : ""}`,
      onClick: () => hasBalances && setExpanded(!expanded),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 size-10 rounded-lg bg-surface-tertiary flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SolanaIcon, { className: "size-5" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-sm text-primary truncate", children: abbreviate(address) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(CopyAddressButton, { address })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary", children: label || chain }),
                isDefault && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "success", size: "sm", variant: "soft", children: "Default" }),
                status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `size-2 rounded-full ${status === "active" ? "bg-success" : "bg-secondary"}` })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            totalUsd && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-sm text-primary", children: totalUsd }),
            hasBalances && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-tertiary", children: expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "size-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "size-4" }) })
          ] })
        ] }),
        expanded && hasBalances && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-4 border-t border-subtle grid grid-cols-3 gap-4", children: [
          wallet.sol !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "SOL" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: formatToken(wallet.sol) })
          ] }),
          wallet.usdc !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "USDC" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: formatToken(wallet.usdc) })
          ] }),
          wallet.usdt !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "USDT" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-primary mt-0.5", children: formatToken(wallet.usdt) })
          ] })
        ] })
      ]
    }
  );
}
function PortfolioStatus() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-3 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-secondary text-sm", children: "Loading portfolio..." })
    ] }) });
  }
  const wallets = Array.isArray(toolOutput.wallets) ? toolOutput.wallets : [];
  const totalUsd = toolOutput.totalUsd !== void 0 ? formatUsd(toolOutput.totalUsd) : null;
  const updatedAt = toolOutput.updatedAt;
  const defaultWallet = wallets.find((w) => w.is_default);
  const hasBalanceData = wallets.some((w) => w.totalUsd !== void 0 || w.sol !== void 0);
  if (wallets.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { fill: "none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CreditCard, { className: "size-8" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { children: "No wallets linked" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: "Link a wallet to see your portfolio and start trading." })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-default bg-surface p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CreditCard, { className: "size-5 text-secondary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-semibold text-base text-primary", children: "Linked Wallets" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "secondary", size: "sm", variant: "soft", children: wallets.length })
        ] }),
        updatedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-tertiary", children: [
          "Updated ",
          formatTimestamp(updatedAt)
        ] })
      ] }),
      hasBalanceData && totalUsd && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-4 border-t border-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-tertiary uppercase tracking-wide", children: "Total Value" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-primary mt-1", children: totalUsd })
      ] }),
      defaultWallet && !hasBalanceData && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-4 border-t border-subtle flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "size-2 rounded-full bg-success" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-secondary", children: "Active:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs text-primary bg-surface-secondary px-2 py-0.5 rounded", children: abbreviate(defaultWallet.address || defaultWallet.public_key || "") })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: wallets.map((wallet, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(WalletCard, { wallet, index }, wallet.address || index)) })
  ] });
}
const root = document.getElementById("portfolio-status-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PortfolioStatus, {}));
}
