import { j as jsxRuntimeExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
function formatMoney(value, currency = "USD") {
  if (!value || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(timestamp) {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}
function getStatusClass(status) {
  switch (status) {
    case "active":
      return "shield-status--active";
    case "pending":
      return "shield-status--pending";
    case "expired":
      return "shield-status--expired";
    case "cancelled":
      return "shield-status--cancelled";
    default:
      return "";
  }
}
function Shield() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Creating shield..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-error", children: toolOutput.error }) });
  }
  const id = toolOutput.id || toolOutput.shield_id;
  const expires = toolOutput.expiresAt || toolOutput.expires_at;
  const created = toolOutput.createdAt || toolOutput.created_at;
  const protectedValue = toolOutput.protectedValue || toolOutput.protected_value;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-icon", children: "🛡️" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-title", children: "Protection Shield" })
      ] }),
      toolOutput.status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shield-badge ${getStatusClass(toolOutput.status)}`, children: toolOutput.status.toUpperCase() })
    ] }),
    toolOutput.symbol && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-token", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-token__symbol", children: toolOutput.symbol }),
      toolOutput.type && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-token__type", children: toolOutput.type })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-coverage", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-coverage__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__label", children: "Protected Value" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__value", children: formatMoney(protectedValue) })
      ] }),
      toolOutput.coverage && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-coverage__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__label", children: "Coverage" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__value", children: toolOutput.coverage.percentage ? `${toolOutput.coverage.percentage}%` : formatMoney(toolOutput.coverage.amount) })
      ] }),
      toolOutput.premium && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-coverage__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__label", children: "Premium" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-coverage__value shield-coverage__value--premium", children: formatMoney(toolOutput.premium.amount) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-details", children: [
      id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-detail__label", children: "Shield ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shield-detail__value", children: [
          id.slice(0, 8),
          "...",
          id.slice(-4)
        ] })
      ] }),
      created && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-detail__label", children: "Created" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-detail__value", children: formatDate(created) })
      ] }),
      expires && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shield-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-detail__label", children: "Expires" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shield-detail__value", children: formatDate(expires) })
      ] })
    ] }),
    toolOutput.claimable && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shield-claimable", children: "✓ This shield is claimable" })
  ] }) });
}
const root = document.getElementById("shield-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Shield, {}));
}
