import { u as useToolOutput, c as useToolResponseMetadata, a as useAdaptiveTheme, b as useAdaptiveMaxHeight, d as useAdaptiveOpenExternal, r as reactExports, j as jsxRuntimeExports } from "./adapter-BD2Wya3l.js";
/* empty css             */
import { n as normalizeGovernedHistory, W as WidgetShell, G as GovernedActionDetail, a as WidgetError, b as WidgetEmpty } from "./GovernedActionView-D9PVjC_5.js";
import { c as clientExports } from "./client-D3-tzCZy.js";
import "./use-openai-global-BfYd9Rwa.js";
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
function HistoryLoading({ maxHeight }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetShell,
    {
      width: "full",
      style: maxHeight ? { maxHeight, overflowY: "auto" } : void 0,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-history dx-history--loading", role: "status", "aria-live": "polite", "aria-label": "Loading wallet history", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-history__skeleton-title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-history__skeleton-copy" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-history__skeleton-list", children: Array.from({ length: 3 }, (_, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" }, index)) })
      ] })
    }
  );
}
function GovernedHistoryView() {
  const output = useToolOutput();
  const responseMetadata = useToolResponseMetadata();
  const renderOutput = output ?? responseMetadata?.["dexter/governedWidgetResult"] ?? null;
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const openExternal = useAdaptiveOpenExternal();
  const model = reactExports.useMemo(() => normalizeGovernedHistory(renderOutput), [renderOutput]);
  const [selectedIndex, setSelectedIndex] = reactExports.useState(null);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    setSelectedIndex(null);
  }, [renderOutput]);
  if (renderOutput === null) return /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryLoading, { maxHeight });
  const selected = model && selectedIndex !== null ? model.items[selectedIndex] ?? null : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetShell,
    {
      width: "full",
      style: maxHeight ? { maxHeight, overflowY: "auto" } : void 0,
      children: selected ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        GovernedActionDetail,
        {
          model: selected,
          openExternal,
          onBack: () => setSelectedIndex(null)
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
              onClick: () => setSelectedIndex(index),
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
      ] })
    }
  );
}
const root = document.getElementById("governed-history-root");
if (root) {
  root.dataset.widgetBuild = "2026-09-03.governed-history";
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(GovernedHistoryView, {}));
}
