import { j as jsxRuntimeExports } from "./adapter-G-K6R9j_.js";
/* empty css                    */
import { c as clientExports } from "./client-C4wamDB_.js";
import { A as AppShell, C as Card, E as EmptyState, S as Status, G as Grid, F as Field, W as Warning } from "./AppShell-CVdrjA-p.js";
import { f as formatValue, a as abbreviateAddress, b as formatTimestamp } from "./utils-P8Td2kdr.js";
import { u as useOpenAIGlobal } from "./use-openai-global-C5L_09K0.js";
import { u as useDisplayMode, a as useRequestDisplayMode } from "./use-request-display-mode-Dy-U6slV.js";
import { u as useMaxHeight } from "./use-max-height-B8kaEeB9.js";
function IdentityCard({ identity }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: "12px", padding: "12px", background: "var(--dexter-bg-secondary, #f5f5f5)", borderRadius: "8px" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Grid, { columns: 2, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Name", value: identity.name || "Unnamed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Chain", value: formatValue(identity.chain) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Agent ID", value: abbreviateAddress(identity.agentId ?? ""), code: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Status", value: formatValue(identity.status) }),
      identity.agentWallet && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Wallet", value: abbreviateAddress(identity.agentWallet), code: true }),
      identity.mintedAt && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Minted", value: formatTimestamp(identity.mintedAt) })
    ] }),
    identity.services && identity.services.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginTop: "8px" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontSize: "12px", color: "var(--dexter-text-muted, #666)" }, children: [
      "Services: ",
      identity.services.map((s) => s.name).join(", ")
    ] }) })
  ] });
}
function IdentityStatus() {
  const props = useOpenAIGlobal("toolOutput");
  const maxHeight = useMaxHeight() ?? null;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const style = maxHeight ? { maxHeight, overflow: "auto" } : void 0;
  const canExpand = displayMode !== "fullscreen" && typeof requestDisplayMode === "function";
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Identity Status", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Checking identity..." }) }) });
  }
  const { hasIdentity, hasBase, hasSolana, identity, identities, recommended } = props;
  if (identity) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Card,
      {
        title: "ERC-8004 Identity",
        badge: { label: identity.status === "minted" ? "Active" : formatValue(identity.status) },
        actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(IdentityCard, { identity }),
          identity.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontSize: "14px", color: "var(--dexter-text-secondary, #444)", margin: "8px 0" }, children: identity.description }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "ERC-8004 on ",
            identity.chain
          ] }) })
        ]
      }
    ) });
  }
  if (identities && identities.length > 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Card,
      {
        title: "Your Identities",
        badge: { label: `${identities.length} found` },
        actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
        children: [
          identities.map((id, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(IdentityCard, { identity: id }, id.id || idx)),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "Base: ",
            hasBase ? "✓" : "✗",
            " | Solana: ",
            hasSolana ? "✓" : "✗"
          ] }) })
        ]
      }
    ) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Card,
    {
      title: "Identity Status",
      badge: { label: hasIdentity ? "Found" : "Not Found" },
      actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Grid, { columns: 2, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Has Identity", value: hasIdentity ? "Yes" : "No" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Base", value: hasBase ? "Yes" : "No" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Solana", value: hasSolana ? "Yes" : "No" }),
          recommended && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Recommended", value: recommended })
        ] }),
        !hasIdentity && /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, { children: "No ERC-8004 identity found. Use mint_identity to create one." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "ERC-8004 Identity Check" }) })
      ]
    }
  ) });
}
const root = document.getElementById("identity-status-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(IdentityStatus, {}));
}
