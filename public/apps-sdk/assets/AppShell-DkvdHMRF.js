import { j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
function AppShell({ children, style }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dexter-app", style, children });
}
function Card({ title, badge, actions, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dexter-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dexter-card__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dexter-card__title", children: title }),
      badge ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dexter-badge", children: [
        badge.prefix,
        badge.label
      ] }) : null,
      actions ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dexter-card__actions", children: actions }) : null
    ] }),
    children
  ] });
}
function Grid({ columns = 1, children }) {
  const className = columns === 3 ? "dexter-grid dexter-grid--cols-3" : columns === 2 ? "dexter-grid dexter-grid--cols-2 dexter-grid" : "dexter-grid";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className, children });
}
function Field({
  label,
  value,
  code = false
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dexter-field", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dexter-field__label", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `dexter-field__value${code ? " dexter-field__value--code" : ""}`, children: value ?? "—" })
  ] });
}
function Status({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("footer", { className: "dexter-status", children });
}
function Warning({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dexter-status__warning", children });
}
function EmptyState({ message }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dexter-empty", children: message });
}
export {
  AppShell as A,
  Card as C,
  EmptyState as E,
  Field as F,
  Grid as G,
  Status as S,
  Warning as W
};
