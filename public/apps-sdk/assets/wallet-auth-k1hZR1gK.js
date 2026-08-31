import { j as jsxRuntimeExports } from "./adapter-C5lR_HvA.js";
/* empty css                    */
import { c as clientExports } from "./client-C1-6VL7X.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
function abbreviate(value, len = 8) {
  if (value.length <= len * 2 + 3) return value;
  return `${value.slice(0, len)}…${value.slice(-4)}`;
}
function WalletAuth() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-auth-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading auth info..." })
    ] }) });
  }
  const diagnostics = toolOutput.diagnostics ?? {};
  const chips = [];
  if (toolOutput.source) chips.push({ label: "Source", value: toolOutput.source });
  if (diagnostics.bearer_source) chips.push({ label: "Bearer", value: diagnostics.bearer_source });
  if (diagnostics.override_session) chips.push({ label: "Override", value: diagnostics.override_session, tone: "notice" });
  if (diagnostics.wallets_cached !== void 0) chips.push({ label: "Cached", value: String(diagnostics.wallets_cached) });
  if (diagnostics.has_token !== void 0) chips.push({
    label: "Token",
    value: diagnostics.has_token ? "Present" : "Missing",
    tone: diagnostics.has_token ? "positive" : "negative"
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-auth-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-header", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-title", children: "Auth Diagnostics" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-auth-main", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-auth-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-label", children: "Session Wallet" }),
        toolOutput.wallet_address ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "a",
          {
            href: `https://solscan.io/account/${toolOutput.wallet_address}`,
            target: "_blank",
            rel: "noreferrer",
            className: "wallet-auth-address",
            children: toolOutput.wallet_address
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-no-wallet", children: "No wallet bound to this session." })
      ] })
    ] }),
    toolOutput.user_id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-auth-user", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-user-label", children: "Supabase User" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-user-id", children: abbreviate(toolOutput.user_id, 8) })
    ] }),
    chips.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-chips", children: chips.map((chip, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `wallet-auth-chip ${chip.tone === "notice" ? "wallet-auth-chip--notice" : ""} ${chip.tone === "positive" ? "wallet-auth-chip--positive" : ""} ${chip.tone === "negative" ? "wallet-auth-chip--negative" : ""}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-chip__label", children: chip.label.toUpperCase() }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-auth-chip__value", children: chip.value })
        ]
      },
      `${chip.label}-${idx}`
    )) }),
    diagnostics.detail && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-auth-detail", children: diagnostics.detail })
  ] }) });
}
const root = document.getElementById("wallet-auth-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletAuth, {}));
}
