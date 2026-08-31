import { j as jsxRuntimeExports } from "./adapter-C5lR_HvA.js";
/* empty css                    */
import { c as clientExports } from "./client-C1-6VL7X.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
function getTypeIcon(type) {
  switch (type) {
    case "bug":
      return "🐛";
    case "feature":
      return "💡";
    case "praise":
      return "⭐";
    case "complaint":
      return "⚠️";
    default:
      return "📝";
  }
}
function getTypeLabel(type) {
  switch (type) {
    case "bug":
      return "Bug Report";
    case "feature":
      return "Feature Request";
    case "praise":
      return "Positive Feedback";
    case "complaint":
      return "Complaint";
    default:
      return "General Feedback";
  }
}
function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}
function Feedback() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Submitting feedback..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-error", children: toolOutput.error }) });
  }
  const id = toolOutput.id || toolOutput.feedback_id;
  const submitted = toolOutput.submittedAt || toolOutput.submitted_at;
  const ticketUrl = toolOutput.ticketUrl || toolOutput.ticket_url;
  const refId = toolOutput.referenceId || toolOutput.reference_id;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-icon", children: getTypeIcon(toolOutput.type) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-title", children: getTypeLabel(toolOutput.type) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-badge feedback-badge--success", children: "✓ Submitted" })
    ] }),
    toolOutput.message && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-message", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-message__label", children: "YOUR FEEDBACK" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "feedback-message__text", children: toolOutput.message.length > 200 ? `${toolOutput.message.slice(0, 200)}...` : toolOutput.message })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-details", children: [
      id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__label", children: "Feedback ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__value", children: id })
      ] }),
      refId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__label", children: "Reference" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__value", children: refId })
      ] }),
      toolOutput.category && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__label", children: "Category" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__value", children: toolOutput.category })
      ] }),
      submitted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feedback-detail", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__label", children: "Submitted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feedback-detail__value", children: formatTimestamp(submitted) })
      ] })
    ] }),
    ticketUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "a",
      {
        href: ticketUrl,
        target: "_blank",
        rel: "noreferrer",
        className: "feedback-link",
        children: "View Ticket ↗"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feedback-note", children: "Thank you for your feedback! We'll review it and get back to you if needed." })
  ] }) });
}
const root = document.getElementById("feedback-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Feedback, {}));
}
