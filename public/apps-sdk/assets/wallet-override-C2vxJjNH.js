import { j as jsxRuntimeExports } from "./adapter-2CdQiSQS.js";
/* empty css                    */
import { c as clientExports } from "./client-iwtKvXVU.js";
import { u as useOpenAIGlobal } from "./use-openai-global-D3_loJJG.js";
function WalletOverride() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-override-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-override-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-override-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Processing override..." })
    ] }) });
  }
  const cleared = Boolean(toolOutput.cleared);
  const ok = Boolean(toolOutput.ok);
  const walletAddress = toolOutput.wallet_address;
  const statusLabel = cleared ? "OVERRIDE CLEARED" : ok ? "OVERRIDE ACTIVE" : "OVERRIDE FAILED";
  const statusClass = cleared ? "neutral" : ok ? "success" : "error";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-override-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-override-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "wallet-override-header", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-override-title", children: "Session Control" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-override-main", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `wallet-override-icon wallet-override-icon--${statusClass}`, children: cleared ? /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "23 4 23 10 17 10" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
      ] }) : ok ? /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "22 4 12 14.01 9 11.01" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "10" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "15", y1: "9", x2: "9", y2: "15" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "9", y1: "9", x2: "15", y2: "15" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-override-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `wallet-override-status wallet-override-status--${statusClass}`, children: statusLabel }),
        cleared ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-override-description", children: "Session reverted to default resolver." }) : walletAddress ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "a",
          {
            href: `https://solscan.io/account/${walletAddress}`,
            target: "_blank",
            rel: "noreferrer",
            className: "wallet-override-address",
            children: walletAddress
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "wallet-override-description", children: "No wallet address provided." })
      ] })
    ] }),
    walletAddress && !cleared && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "wallet-override-links", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: `https://solscan.io/account/${walletAddress}`,
          target: "_blank",
          rel: "noreferrer",
          className: "wallet-override-link",
          children: "Solscan"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: `https://explorer.solana.com/address/${walletAddress}`,
          target: "_blank",
          rel: "noreferrer",
          className: "wallet-override-link",
          children: "Explorer"
        }
      )
    ] })
  ] }) });
}
const root = document.getElementById("wallet-override-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(WalletOverride, {}));
}
