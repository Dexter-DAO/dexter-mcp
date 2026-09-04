import { j as jsxRuntimeExports } from "./adapter-DxAkFo4M.js";
/* empty css                    */
import { c as clientExports } from "./client-DrGRJi51.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CFfrkUHE.js";
function formatTime(timestamp) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}
function formatExpiry(timestamp) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = date.getTime() - now;
    if (diff <= 0) return "expired";
    const mins = Math.floor(diff / 6e4);
    if (mins < 60) return `${mins}m left`;
    const hours = Math.floor(mins / 60);
    return `${hours}h left`;
  } catch {
    return "";
  }
}
function ShoutCard({ shout, isNew = false }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `shout-card ${isNew ? "shout-card--new" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shout-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shout-card__alias", children: shout.alias || "Anonymous" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shout-card__time", children: formatTime(shout.created_at) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "shout-card__message", children: shout.message }),
    shout.expires_at && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shout-card__expiry", children: formatExpiry(shout.expires_at) })
  ] });
}
function StreamShout() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-error", children: toolOutput.error }) });
  }
  if (toolOutput.shout) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-card", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-header-left", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-icon", children: "📣" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-title", children: "Shout Submitted" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-badge stream-badge--success", children: "✓ Queued" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ShoutCard, { shout: toolOutput.shout, isNew: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-note", children: "Your shout will appear on the live stream overlay." })
    ] }) });
  }
  const shouts = toolOutput.shouts || [];
  if (shouts.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-card", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-header", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-icon", children: "📣" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-title", children: "Stream Shouts" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-empty", children: "No shouts in queue right now." })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "stream-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-icon", children: "📣" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "stream-title", children: "Stream Shouts" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "stream-count", children: [
        shouts.length,
        " in queue"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "stream-feed", children: shouts.map((shout, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(ShoutCard, { shout }, shout.id || idx)) })
  ] }) });
}
const root = document.getElementById("stream-shout-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(StreamShout, {}));
}
