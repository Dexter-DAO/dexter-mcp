import { u as useToolOutput, g as useToolResponseMetadata, a as useAdaptiveTheme, c as useAdaptiveDisplayMode, e as useAdaptiveHostCapabilities, d as useAdaptiveHostContext, f as useAdaptiveRequestDisplayMode, h as useAdaptiveOpenExternal, r as reactExports, j as jsxRuntimeExports } from "./adapter-CkHbMm1G.js";
/* empty css             */
import { n as normalizeGovernedHistory, W as WidgetShell, G as GovernedActionDetail, a as WidgetError, b as WidgetEmpty } from "./GovernedActionView-nx0g04OT.js";
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-6oJrZ1U8.js";
import "./use-openai-global-CSgf-drU.js";
function formatActivityTime(model) {
  const value = model.lastActivityAt ?? model.createdAt;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function HistoryLoading({
  rootRef,
  style
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", rootRef, style, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-history dx-history--loading", role: "status", "aria-live": "polite", "aria-label": "Loading wallet history", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-history__skeleton-title" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-history__skeleton-copy" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-history__skeleton-list", children: Array.from({ length: 3 }, (_, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" }, index)) })
  ] }) });
}
function GovernedHistoryView() {
  const output = useToolOutput();
  const responseMetadata = useToolResponseMetadata();
  const renderOutput = output ?? responseMetadata?.["dexter/governedWidgetResult"] ?? null;
  const theme = useAdaptiveTheme();
  const displayMode = useAdaptiveDisplayMode();
  const hostCapabilities = useAdaptiveHostCapabilities();
  const hostContext = useAdaptiveHostContext();
  const requestDisplayMode = useAdaptiveRequestDisplayMode();
  const openExternal = useAdaptiveOpenExternal();
  const rootRef = useIntrinsicHeight();
  const model = reactExports.useMemo(() => normalizeGovernedHistory(renderOutput), [renderOutput]);
  const [selectedIndex, setSelectedIndex] = reactExports.useState(null);
  const returnFocusIndex = reactExports.useRef(null);
  const rowRefs = reactExports.useRef([]);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    returnFocusIndex.current = null;
    setSelectedIndex(null);
  }, [renderOutput]);
  reactExports.useLayoutEffect(() => {
    if (selectedIndex !== null || returnFocusIndex.current === null) return;
    const target = rowRefs.current[returnFocusIndex.current];
    if (target?.isConnected) target.focus();
    returnFocusIndex.current = null;
  }, [selectedIndex]);
  const canExpand = Boolean(requestDisplayMode && hostCapabilities.requestDisplayMode);
  const isFullscreen = displayMode === "fullscreen";
  const rootStyle = isFullscreen ? {
    paddingTop: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.top}px)`,
    paddingRight: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.right}px)`,
    paddingBottom: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.bottom}px)`,
    paddingLeft: `max(var(--dx-space-6), ${hostContext.safeAreaInsets.left}px)`
  } : void 0;
  const requestMode = (mode) => {
    if (!requestDisplayMode) return;
    void requestDisplayMode({ mode }).catch(() => {
    });
  };
  if (renderOutput === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryLoading, { rootRef, style: rootStyle });
  }
  const selected = model && selectedIndex !== null ? model.items[selectedIndex] ?? null : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(WidgetShell, { width: "full", rootRef, style: rootStyle, children: selected ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    GovernedActionDetail,
    {
      model: selected,
      openExternal,
      compact: !isFullscreen && canExpand,
      onExpand: canExpand ? () => requestMode("fullscreen") : void 0,
      onBack: () => {
        setSelectedIndex(null);
        if (isFullscreen) requestMode("inline");
      }
    }
  ) : !model ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetError,
    {
      title: "Wallet history unavailable",
      description: "Ask OpenDexter to read wallet history again. No action was started."
    }
  ) : model.items.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-history", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "dx-history__header", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "Wallet history" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      WidgetEmpty,
      {
        title: "No governed actions yet",
        description: "Send, Buy, and Sell receipts will appear here."
      }
    )
  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-history", "aria-labelledby": "dx-history-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-history__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "dx-history-title", children: "Wallet history" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Send, Buy, and Sell receipts from this wallet." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dx-history__list", children: model.items.map((item, index) => {
      const time = formatActivityTime(item);
      return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          className: "dx-history__row",
          ref: (element) => {
            rowRefs.current[index] = element;
          },
          onClick: () => {
            returnFocusIndex.current = index;
            setSelectedIndex(index);
            if (!isFullscreen && canExpand) requestMode("fullscreen");
          },
          "aria-label": `Open details for ${item.headline}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-history__row-copy", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: item.headline }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                time ? /* @__PURE__ */ jsxRuntimeExports.jsx("time", { dateTime: item.lastActivityAt ?? item.createdAt ?? void 0, children: time }) : null,
                time && item.actor !== "unknown" ? " / " : null,
                item.actor !== "unknown" ? item.actor === "agent" ? "Agent" : "Owner" : null
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-history__row-state", "data-stage": item.stage, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("i", { "aria-hidden": "true" }),
              item.stageLabel
            ] })
          ]
        }
      ) }, `${item.intentId ?? item.requestId ?? "action"}:${index}`);
    }) }),
    model.omittedItems > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dx-history__notice", role: "alert", children: [
      model.omittedItems,
      " malformed ",
      model.omittedItems === 1 ? "entry was" : "entries were",
      " omitted."
    ] }) : null,
    model.hasMore ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-history__notice", children: "More history is available on the next page." }) : null
  ] }) });
}
const root = document.getElementById("governed-history-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.governed-history";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(GovernedHistoryView, {}));
}
