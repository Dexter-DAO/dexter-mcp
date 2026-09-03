import { j as jsxRuntimeExports } from "./adapter-BD2Wya3l.js";
/* empty css                    */
import { c as clientExports } from "./client-D3-tzCZy.js";
import { A as AppShell, C as Card, E as EmptyState, S as Status, W as Warning, G as Grid, F as Field } from "./AppShell-BfbUVvvq.js";
import { u as useOpenAIGlobal } from "./use-openai-global-BfYd9Rwa.js";
import { u as useMaxHeight, a as useDisplayMode, b as useRequestDisplayMode } from "./use-request-display-mode-CiOSoFwh.js";
function formatPrice(priceUsdc) {
  if (priceUsdc == null) return "—";
  return `$${priceUsdc.toFixed(2)} USDC`;
}
function BundleItem({ bundle, showDetails = false }) {
  const tags = bundle.tags ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    padding: "12px",
    background: "var(--dexter-bg-secondary, #f5f5f5)",
    borderRadius: "8px",
    marginBottom: "12px"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: "12px" }, children: [
      bundle.iconUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: bundle.iconUrl,
          alt: bundle.name || "Bundle",
          style: { width: "48px", height: "48px", borderRadius: "8px", objectFit: "cover" }
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { style: { fontSize: "16px", fontWeight: "600", margin: 0, color: "var(--dexter-text-primary, #111)" }, children: bundle.name || "Unnamed Bundle" }),
          bundle.isVerified && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "12px", color: "#10b981" }, children: "✓ Verified" }),
          bundle.isFeatured && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
            fontSize: "10px",
            background: "#8b5cf6",
            color: "white",
            padding: "2px 6px",
            borderRadius: "4px"
          }, children: "Featured" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontSize: "13px", color: "var(--dexter-text-secondary, #666)", margin: "4px 0" }, children: bundle.shortDescription || bundle.description || "No description" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Grid, { columns: 3, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Price", value: formatPrice(bundle.priceUsdc) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Tools", value: bundle.toolCount ?? bundle.tools?.length ?? "—" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Uses", value: bundle.usesPerPurchase ?? "—" })
    ] }),
    bundle.avgRating != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginTop: "8px", fontSize: "13px", color: "var(--dexter-text-muted, #888)" }, children: [
      "★ ",
      bundle.avgRating.toFixed(1),
      " (",
      bundle.ratingCount ?? 0,
      " ratings) • ",
      bundle.totalPurchases ?? 0,
      " purchases"
    ] }),
    tags.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }, children: tags.slice(0, 5).map((tag, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        style: {
          fontSize: "11px",
          background: "var(--dexter-bg-tertiary, #e5e5e5)",
          padding: "2px 8px",
          borderRadius: "4px",
          color: "var(--dexter-text-muted, #666)"
        },
        children: tag
      },
      idx
    )) }),
    showDetails && bundle.tools && bundle.tools.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginTop: "12px", borderTop: "1px solid var(--dexter-border, #e5e5e5)", paddingTop: "12px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { style: { fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "var(--dexter-text-secondary, #333)" }, children: "Included Tools" }),
      bundle.tools.map((tool, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontSize: "12px", marginBottom: "4px" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontWeight: "500" }, children: tool.name }),
        tool.description && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { color: "var(--dexter-text-muted, #888)" }, children: [
          " — ",
          tool.description
        ] })
      ] }, idx))
    ] })
  ] });
}
function BundleCard() {
  const props = useOpenAIGlobal("toolOutput");
  const maxHeight = useMaxHeight() ?? null;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const style = maxHeight ? { maxHeight, overflow: "auto" } : void 0;
  const canExpand = displayMode !== "fullscreen" && typeof requestDisplayMode === "function";
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Tool Bundle", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Loading bundle..." }) }) });
  }
  const { bundle, bundles, hasAccess, remainingUses, total, categories } = props;
  if (bundle) {
    const accessLabel = hasAccess ? `${remainingUses ?? "∞"} uses left` : "No Access";
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Card,
      {
        title: bundle.name || "Tool Bundle",
        badge: { label: hasAccess ? "Owned" : formatPrice(bundle.priceUsdc) },
        actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(BundleItem, { bundle, showDetails: true }),
          hasAccess && /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: accessLabel }) }),
          !hasAccess && bundle.priceUsdc != null && bundle.priceUsdc > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, { children: "Purchase this bundle to access the tools." })
        ]
      }
    ) });
  }
  if (bundles && bundles.length > 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Card,
      {
        title: "Tool Bundles",
        badge: { label: `${total ?? bundles.length} found` },
        actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
        children: [
          bundles.slice(0, 10).map((b, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(BundleItem, { bundle: b }, b.id || idx)),
          bundles.length > 10 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center", fontSize: "13px", color: "var(--dexter-text-muted, #888)", padding: "8px" }, children: [
            "+",
            bundles.length - 10,
            " more bundles"
          ] }),
          categories && categories.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "Categories: ",
            categories.join(", ")
          ] }) })
        ]
      }
    ) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Tool Bundles", badge: { label: "Empty" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "No bundles found" }) }) });
}
const root = document.getElementById("bundle-card-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(BundleCard, {}));
}
