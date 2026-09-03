import { j as jsxRuntimeExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
function formatVolume(value) {
  if (!value || !Number.isFinite(value)) return "$0";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}
function formatNumber(value) {
  if (!value || !Number.isFinite(value)) return "0";
  return value.toLocaleString();
}
function getHealthClass(health) {
  switch (health) {
    case "healthy":
      return "x402-health--healthy";
    case "degraded":
      return "x402-health--degraded";
    case "down":
      return "x402-health--down";
    default:
      return "";
  }
}
function X402Stats() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading network stats..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-error", children: toolOutput.error }) });
  }
  const summary = toolOutput.network_summary;
  const facilitators = toolOutput.facilitators || [];
  const topAgents = toolOutput.top_agents || [];
  const fetchedAt = toolOutput.fetchedAt || toolOutput.fetched_at;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-icon", children: "💳" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-title", children: "x402 Network Stats" })
      ] }),
      fetchedAt && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-timestamp", children: new Date(fetchedAt).toLocaleTimeString() })
    ] }),
    summary && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-summary", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-summary__grid", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-summary__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__value", children: formatNumber(summary.total_transactions) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__label", children: "Transactions" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-summary__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__value", children: formatVolume(summary.total_volume) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__label", children: "Volume" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-summary__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__value", children: formatNumber(summary.active_facilitators) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__label", children: "Facilitators" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-summary__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__value", children: formatNumber(summary.active_agents) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-summary__label", children: "Active Agents" })
      ] })
    ] }) }),
    facilitators.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-section__title", children: "FACILITATORS" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-facilitators", children: facilitators.map((f, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-facilitator", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-facilitator__header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-facilitator__name", children: f.name || "Unknown" }),
          f.health && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `x402-facilitator__health ${getHealthClass(f.health)}`, children: f.health })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-facilitator__stats", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            formatNumber(f.transactions),
            " txns"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatVolume(f.volume) }),
          f.active_agents && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            f.active_agents,
            " agents"
          ] })
        ] })
      ] }, idx)) })
    ] }),
    topAgents.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-section__title", children: "TOP AGENTS" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "x402-agents", children: topAgents.slice(0, 5).map((agent, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "x402-agent", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "x402-agent__rank", children: [
          "#",
          idx + 1
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-agent__name", children: agent.name || agent.id || "Unknown" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "x402-agent__volume", children: formatVolume(agent.volume) })
      ] }, idx)) })
    ] })
  ] }) });
}
const root = document.getElementById("x402-stats-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(X402Stats, {}));
}
