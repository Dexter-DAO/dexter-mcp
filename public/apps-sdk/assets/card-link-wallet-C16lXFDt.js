import { j as jsxRuntimeExports } from "./adapter-DxAkFo4M.js";
/* empty css                    */
import { V as VirtualCard } from "./VirtualCard-CROhXQyQ.js";
import { c as clientExports } from "./client-DrGRJi51.js";
import { A as AppShell, C as Card, E as EmptyState } from "./AppShell-CX5Fj-UJ.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CFfrkUHE.js";
function CardLinkWalletWidget() {
  const props = useOpenAIGlobal("toolOutput");
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Link Wallet", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Linking wallet…" }) }) });
  }
  const { ok, linked, tip, error } = props;
  const linkedAmount = linked?.amount && linked.currency ? `${linked.amount.toLocaleString()} ${linked.currency.toUpperCase()}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Card,
    {
      title: "Link Wallet to Dextercard",
      badge: { label: ok ? "Linked" : "Not linked" },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(VirtualCard, { theme: "orange", stage: ok ? "active" : void 0 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dxc-meta", children: ok && linked ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dxc-meta-copy", children: [
            linked.wallet,
            " is now authorized to fund Dextercard transactions",
            linkedAmount ? ` up to ${linkedAmount}` : "",
            "."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-fields", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Wallet" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: linked.wallet })
            ] }),
            linked.chain ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Chain" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: linked.chain })
            ] }) : null,
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Currency" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: linked.currency.toUpperCase() })
            ] }),
            linkedAmount ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Cap" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: linkedAmount })
            ] }) : null,
            linked.status ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dxc-field-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Status" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: linked.status })
            ] }) : null
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dxc-meta-copy", children: tip || error || "Wallet could not be linked. Verify the card is active and the wallet exists in the carrier wallet store." }) }) })
      ]
    }
  ) });
}
const root = document.getElementById("card-link-wallet-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(CardLinkWalletWidget, {}));
}
