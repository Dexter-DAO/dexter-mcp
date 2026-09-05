import { j as jsxRuntimeExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { V as VirtualCard } from "./VirtualCard-Dqmr1MOV.js";
import { c as clientExports } from "./client-CfP9AF2a.js";
import { A as AppShell, C as Card, E as EmptyState } from "./AppShell-DHHL1MEX.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
import { u as useMaxHeight, a as useDisplayMode, b as useRequestDisplayMode } from "./use-request-display-mode-DzL4L4dq.js";
function StageCopy({ stage }) {
  const copy = {
    no_session: "Sign in to view your Dextercard.",
    onboarding_required: "Identity verification is the next step. Run `card_issue` to start.",
    pending_kyc: "Identity check is in flight. Re-run `card_status` to refresh.",
    pending_finalize: "KYC verified. Provide a residential address to finalize and create your card.",
    not_issued: 'Onboarding complete. Run `card_issue step="create"` to issue your virtual card.',
    active: "Card is active. Spend USDC anywhere Mastercard is accepted.",
    frozen: "Card is frozen. Run `card_freeze frozen=false` to resume spending."
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: copy[stage] });
}
function pickTheme() {
  return "orange";
}
function CardStatusWidget() {
  const props = useOpenAIGlobal("toolOutput");
  const maxHeight = useMaxHeight() ?? null;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const style = maxHeight ? { maxHeight, overflow: "auto" } : void 0;
  const canExpand = displayMode !== "fullscreen" && typeof requestDisplayMode === "function";
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Dextercard", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Reading card status…" }) }) });
  }
  const { stage, user, card, wallets, recentTransactions, tip } = props;
  const theme = pickTheme();
  const cardholder = user?.email?.split("@")[0]?.toUpperCase() || "DEXTER HOLDER";
  const lastFour = card?.last4 ?? "x402";
  const expiry = card?.expiry ?? "••/••";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Card,
    {
      title: "Dextercard",
      badge: { label: stageBadge(stage) },
      actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "dexter-link",
          onClick: () => requestDisplayMode?.({ mode: "fullscreen" }),
          children: "Expand"
        }
      ) : null,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          VirtualCard,
          {
            theme,
            stage,
            cardholderName: cardholder,
            lastFour,
            expiry
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-meta", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(StageCopy, { stage }),
          tip ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: tip }) : null,
          wallets && wallets.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-section-title", children: "Linked wallets" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxc-list", children: wallets.map((w, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                w.wallet,
                " · ",
                (w.currency || "").toUpperCase(),
                typeof w.amount === "number" ? ` · ${w.amount.toLocaleString()} cap` : ""
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: w.status || "" })
            ] }, `${w.wallet}-${w.currency}-${i}`)) })
          ] }) : stage === "active" || stage === "frozen" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-empty", children: "No wallets linked yet. Run `card_link_wallet` to authorize one." }) : null,
          recentTransactions && recentTransactions.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-section-title", children: "Recent transactions" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dxc-list", children: recentTransactions.slice(0, 8).map((tx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                tx.merchant || "Transaction",
                typeof tx.amount === "number" ? ` · ${tx.amount.toFixed(2)} ${(tx.currency || "").toUpperCase()}` : ""
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: tx.status || formatDate(tx.createdAt) })
            ] }, tx.id)) })
          ] }) : null
        ] })
      ]
    }
  ) });
}
function stageBadge(stage) {
  switch (stage) {
    case "active":
      return "Active";
    case "frozen":
      return "Frozen";
    case "pending_kyc":
      return "KYC in flight";
    case "pending_finalize":
      return "Awaiting address";
    case "onboarding_required":
      return "Not onboarded";
    case "not_issued":
      return "Ready to issue";
    case "no_session":
      return "Sign in";
    default:
      return "Unknown";
  }
}
function formatDate(s) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}
const root = document.getElementById("card-status-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(CardStatusWidget, {}));
}
