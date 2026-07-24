import { j as jsxRuntimeExports, r as reactExports } from "./adapter-2CdQiSQS.js";
/* empty css                    */
import { c as clientExports } from "./client-iwtKvXVU.js";
import { u as useOpenAIGlobal } from "./use-openai-global-D3_loJJG.js";
function pickAddress(wallet) {
  if (wallet.address && wallet.address.trim().length > 0) return wallet.address.trim();
  if (wallet.public_key && wallet.public_key.trim().length > 0) return wallet.public_key.trim();
  return null;
}
function abbreviate(value, len = 6) {
  if (value.length <= len * 2 + 3) return value;
  return `${value.slice(0, len)}…${value.slice(-4)}`;
}
function WalletList() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const [showAll, setShowAll] = reactExports.useState(false);
  const [expandedIndex, setExpandedIndex] = reactExports.useState(null);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-list-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-list-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading wallets..." })
    ] }) });
  }
  const payload = toolOutput;
  const wallets = Array.isArray(payload.wallets) ? payload.wallets : Array.isArray(toolOutput) ? toolOutput : [];
  if (wallets.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-list-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-list-empty", children: "No linked wallets found." }) });
  }
  const visibleWallets = showAll ? wallets : wallets.slice(0, 6);
  const hiddenCount = wallets.length - visibleWallets.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-list-title", children: "Linked Wallets" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "wallet-list-count", children: [
        wallets.length,
        " wallet",
        wallets.length !== 1 ? "s" : ""
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-list-grid", children: visibleWallets.map((wallet, index) => {
      const address = pickAddress(wallet);
      const label = typeof wallet.label === "string" && wallet.label.trim().length > 0 ? wallet.label.trim() : null;
      const isDefault = Boolean(wallet.is_default);
      const displayLabel = label ?? (address ? `Wallet ${index + 1}` : "Unknown Wallet");
      const isExpanded = expandedIndex === index;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `wallet-list-card ${isExpanded ? "wallet-list-card--expanded" : ""} ${isDefault ? "wallet-list-card--default" : ""}`,
          onClick: () => setExpandedIndex(isExpanded ? null : index),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-card__header", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `wallet-list-card__icon ${isDefault ? "wallet-list-card__icon--default" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "3", y1: "10", x2: "21", y2: "10" })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-card__info", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-card__label-row", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-list-card__label", children: displayLabel }),
                  isDefault && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-list-card__default-badge", children: "Default" })
                ] }),
                address && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "a",
                  {
                    href: `https://solscan.io/account/${address}`,
                    target: "_blank",
                    rel: "noreferrer",
                    className: "wallet-list-card__address",
                    onClick: (e) => e.stopPropagation(),
                    children: isExpanded ? address : abbreviate(address, 6)
                  }
                )
              ] })
            ] }),
            isExpanded && address && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-list-card__actions", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: `https://solscan.io/account/${address}`,
                  target: "_blank",
                  rel: "noreferrer",
                  className: "wallet-list-card__action",
                  onClick: (e) => e.stopPropagation(),
                  children: "Solscan"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: `https://explorer.solana.com/address/${address}`,
                  target: "_blank",
                  rel: "noreferrer",
                  className: "wallet-list-card__action",
                  onClick: (e) => e.stopPropagation(),
                  children: "Explorer"
                }
              )
            ] })
          ]
        },
        address ?? `wallet-${index}`
      );
    }) }),
    hiddenCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "wallet-list-show-more", onClick: () => setShowAll(!showAll), children: showAll ? "Collapse List" : `Show ${hiddenCount} more wallets` })
  ] });
}
const root = document.getElementById("wallet-list-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletList, {}));
}
