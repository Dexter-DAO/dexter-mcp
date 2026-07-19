import { j as jsxRuntimeExports, r as reactExports } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Badge } from "./index-DbPowsVZ.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { C as Check } from "./Check-BZrRAPv_.js";
import { C as Copy } from "./Copy-CMyF_UKx.js";
import { C as CreditCard } from "./CreditCard-DrQkauka.js";
import { E as ExternalLink } from "./ExternalLink-CX0ioRAf.js";
import { W as Warning } from "./Warning-fnh1SKl0.js";
import { A as Alert } from "./Alert-Bk5IwN3Q.js";
import { E as EmptyMessage } from "./EmptyMessage-CHDmduY1.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
function pickString(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return void 0;
}
function abbreviate(value, prefix = 6, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
function SolanaIcon({ className }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 128 128", fill: "none", className, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "sol-resolve-grad", x1: "90%", y1: "0%", x2: "10%", y2: "100%", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#00FFA3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#DC1FFF" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 93.5c0.9-0.9 2.2-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3l-24.2 24.2c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 93.5z", fill: "url(#sol-resolve-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M25.3 2.5c1-1 2.3-1.5 3.5-1.5h97.1c2.2 0 3.4 2.7 1.8 4.3L103.5 29.5c-0.9 0.9-2.2 1.5-3.5 1.5H2.9c-2.2 0-3.4-2.7-1.8-4.3L25.3 2.5z", fill: "url(#sol-resolve-grad)" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M102.7 47.3c-0.9-0.9-2.2-1.5-3.5-1.5H2.1c-2.2 0-3.4 2.7-1.8 4.3l24.2 24.2c0.9 0.9 2.2 1.5 3.5 1.5h97.1c2.2 0 3.4-2.7 1.8-4.3L102.7 47.3z", fill: "url(#sol-resolve-grad)" })
  ] });
}
function ChainIcon({ chain, className }) {
  const chainLower = chain.toLowerCase();
  if (chainLower === "solana" || chainLower === "sol") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(SolanaIcon, { className });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `flex items-center justify-center rounded-lg bg-surface-secondary ${className}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-bold text-secondary", children: chain.slice(0, 2).toUpperCase() }) });
}
function CopyButton({ text }) {
  const [copied, setCopied] = reactExports.useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2e3);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "ghost", size: "xs", onClick: handleCopy, uniform: true, children: copied ? /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { className: "size-3.5" }) });
}
function ResolveWallet() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-3 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "size-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-secondary text-sm", children: "Resolving wallet..." })
    ] }) });
  }
  const resolved = toolOutput.result ?? toolOutput;
  const address = pickString(resolved.address, resolved.walletAddress, resolved.wallet_address);
  const chain = pickString(resolved.chain) ?? "solana";
  const source = pickString(resolved.source, resolved.resolvedVia) ?? "unknown";
  const verified = resolved.verified ?? false;
  const linkedAt = resolved.linkedAt;
  const handle = pickString(resolved.handle, resolved.twitter);
  if (!address) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { fill: "none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CreditCard, { className: "size-8" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { children: "Wallet Not Found" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: "No wallet address could be resolved for this request." })
    ] }) });
  }
  const chainName = chain.charAt(0).toUpperCase() + chain.slice(1);
  const explorerUrl = chain.toLowerCase() === "solana" ? `https://solscan.io/account/${address}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-xl border p-4 ${verified ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-semibold text-base text-primary", children: "Wallet Resolution" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Badge,
          {
            color: verified ? "success" : "warning",
            size: "sm",
            variant: "soft",
            children: verified ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3" }),
              "Verified"
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, { className: "size-3" }),
              "Unverified"
            ] })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 size-12 rounded-xl bg-surface-tertiary flex items-center justify-center overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { chain, className: "size-8" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono text-sm font-medium text-primary", children: abbreviate(address, 8, 6) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { text: address })
          ] }),
          handle && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-accent", children: [
            "@",
            handle.replace("@", "")
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mt-2 text-xs text-tertiary", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: chainName }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "via ",
              source
            ] }),
            linkedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatTimestamp(linkedAt) })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 pt-4 border-t border-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs text-tertiary font-mono truncate flex-1", title: address, children: address }),
        explorerUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "a",
          {
            href: explorerUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "flex-shrink-0",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { color: "secondary", variant: "soft", size: "xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
              "Solscan",
              /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-3" })
            ] }) })
          }
        )
      ] }) })
    ] }),
    !verified && /* @__PURE__ */ jsxRuntimeExports.jsx(
      Alert,
      {
        color: "warning",
        variant: "soft",
        title: "Unverified Wallet",
        description: "This wallet has not been verified. Consider confirming ownership before proceeding with transactions."
      }
    )
  ] });
}
const root = document.getElementById("resolve-wallet-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(ResolveWallet, {}));
}
