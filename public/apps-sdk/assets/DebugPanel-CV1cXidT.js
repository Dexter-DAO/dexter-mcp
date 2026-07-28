import { r as reactExports, j as jsxRuntimeExports } from "./adapter-B3ynKBmf.js";
function DebugPanel({ widgetName, extraInfo }) {
  const [open, setOpen] = reactExports.useState(false);
  const oa = window.openai;
  if (!open) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: "4px 8px", textAlign: "right" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => setOpen(true),
        style: {
          all: "unset",
          cursor: "pointer",
          fontSize: 9,
          opacity: 0.3,
          fontFamily: "monospace",
          color: "inherit"
        },
        children: "[debug]"
      }
    ) });
  }
  const info = {
    widget: widgetName,
    build: document.querySelector("[data-widget-build]")?.getAttribute("data-widget-build") || "?",
    theme: oa?.theme || "?",
    displayMode: oa?.displayMode || "?",
    maxHeight: String(oa?.maxHeight ?? "?"),
    locale: oa?.locale || "?",
    hasCallTool: typeof oa?.callTool === "function" ? "YES" : "NO",
    hasSendFollowUp: typeof oa?.sendFollowUpMessage === "function" ? "YES" : "NO",
    hasOpenExternal: typeof oa?.openExternal === "function" ? "YES" : "NO",
    hasWidgetState: typeof oa?.setWidgetState === "function" ? "YES" : "NO",
    hasNotifyHeight: typeof oa?.notifyIntrinsicHeight === "function" ? "YES" : "NO",
    hasRequestModal: typeof oa?.requestModal === "function" ? "YES" : "NO",
    hasUploadFile: typeof oa?.uploadFile === "function" ? "YES" : "NO",
    hasRequestDisplayMode: typeof oa?.requestDisplayMode === "function" ? "YES" : "NO",
    userAgent: oa?.userAgent ? JSON.stringify(oa.userAgent) : "?",
    toolInputKeys: oa?.toolInput ? Object.keys(oa.toolInput).join(", ") : "?",
    toolOutputType: oa?.toolOutput ? typeof oa.toolOutput : "null",
    toolOutputKeys: oa?.toolOutput && typeof oa.toolOutput === "object" ? Object.keys(oa.toolOutput).join(", ") : "?",
    isChatGptApp: String(window.__isChatGptApp ?? "?")
  };
  if (extraInfo) {
    for (const [key, value] of Object.entries(extraInfo)) {
      info[key] = value == null ? String(value) : String(value);
    }
  }
  const text = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join("\n");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    margin: "8px 0 0",
    padding: 10,
    borderRadius: 8,
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 1.6,
    color: "#94a3b8",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontWeight: 700, color: "#facc15" }, children: [
        "DEBUG — ",
        widgetName
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              navigator.clipboard.writeText(text);
            },
            style: { all: "unset", cursor: "pointer", color: "#60a5fa", fontSize: 10 },
            children: "[copy]"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setOpen(false),
            style: { all: "unset", cursor: "pointer", color: "#fb7185", fontSize: 10 },
            children: "[close]"
          }
        )
      ] })
    ] }),
    text
  ] });
}
export {
  DebugPanel as D
};
