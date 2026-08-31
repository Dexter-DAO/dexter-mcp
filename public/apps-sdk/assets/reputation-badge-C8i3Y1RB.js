import { j as jsxRuntimeExports } from "./adapter-C5lR_HvA.js";
/* empty css                    */
import { c as clientExports } from "./client-C1-6VL7X.js";
import { A as AppShell, C as Card, E as EmptyState, G as Grid, F as Field, S as Status } from "./AppShell-3Jj4_PkH.js";
import { a as abbreviateAddress, f as formatValue, b as formatTimestamp } from "./utils-P8Td2kdr.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
import { u as useDisplayMode, a as useRequestDisplayMode } from "./use-request-display-mode-BvbhWnav.js";
import { u as useMaxHeight } from "./use-max-height-DwvblLE2.js";
function StarRating({ rating, max = 5 }) {
  const stars = [];
  for (let i = 1; i <= max; i++) {
    stars.push(
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: i <= rating ? "#f59e0b" : "#d1d5db" }, children: "★" }, i)
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "16px" }, children: stars });
}
function FeedbackItem({ feedback }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    padding: "8px 12px",
    background: "var(--dexter-bg-secondary, #f5f5f5)",
    borderRadius: "6px",
    marginBottom: "8px"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(StarRating, { rating: feedback.rating ?? 0 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "11px", color: "var(--dexter-text-muted, #888)" }, children: feedback.createdAt ? formatTimestamp(feedback.createdAt) : "" })
    ] }),
    feedback.comment && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontSize: "13px", margin: "4px 0 0", color: "var(--dexter-text-secondary, #444)" }, children: feedback.comment }),
    feedback.fromAgentId && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontSize: "11px", color: "var(--dexter-text-muted, #888)" }, children: [
      "From: ",
      abbreviateAddress(feedback.fromAgentId)
    ] })
  ] });
}
function ReputationBadge() {
  const props = useOpenAIGlobal("toolOutput");
  const maxHeight = useMaxHeight() ?? null;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const style = maxHeight ? { maxHeight, overflow: "auto" } : void 0;
  const canExpand = displayMode !== "fullscreen" && typeof requestDisplayMode === "function";
  if (!props) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Reputation", badge: { label: "Loading" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { message: "Loading reputation..." }) }) });
  }
  const { agentId, chain, score, totalRatings, averageRating, recentFeedback } = props;
  const displayRating = averageRating ?? score ?? 0;
  const ratingLabel = displayRating > 0 ? `${displayRating.toFixed(1)} / 5` : "No ratings";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AppShell, { style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Card,
    {
      title: "Agent Reputation",
      badge: { label: ratingLabel },
      actions: canExpand ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "dexter-link", onClick: () => requestDisplayMode?.({ mode: "fullscreen" }), children: "Expand" }) : null,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center", padding: "16px 0" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "32px", marginBottom: "8px" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(StarRating, { rating: Math.round(displayRating) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "24px", fontWeight: "bold", color: "var(--dexter-text-primary, #111)" }, children: displayRating > 0 ? displayRating.toFixed(1) : "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontSize: "13px", color: "var(--dexter-text-muted, #666)" }, children: [
            totalRatings ?? 0,
            " ratings"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Grid, { columns: 2, children: [
          agentId && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Agent ID", value: abbreviateAddress(agentId), code: true }),
          chain && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Chain", value: formatValue(chain) })
        ] }),
        recentFeedback && recentFeedback.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginTop: "16px" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { style: { fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "var(--dexter-text-secondary, #333)" }, children: "Recent Feedback" }),
          recentFeedback.slice(0, 5).map((fb, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(FeedbackItem, { feedback: fb }, fb.id || idx))
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Status, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "ERC-8004 Reputation System" }) })
      ]
    }
  ) });
}
const root = document.getElementById("reputation-badge-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(ReputationBadge, {}));
}
