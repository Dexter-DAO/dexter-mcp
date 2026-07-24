import { r as reactExports, j as jsxRuntimeExports } from "./adapter-2CdQiSQS.js";
const DEFAULT_LOGO_URL = "https://dexter.cash/assets/pokedexter/dexter-logo.svg";
function DexterLoading({
  eyebrow,
  stages,
  context,
  contextLabel = "context",
  logoSrc = DEFAULT_LOGO_URL,
  logoAlt = ""
}) {
  const [elapsed, setElapsed] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1e3);
    return () => clearInterval(t);
  }, []);
  const current = stages.find((s) => elapsed < s.upTo) ?? stages[stages.length - 1];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-loading", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-loading__stage", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-loading__ring dx-loading__ring--outer", "aria-hidden": true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-loading__ring dx-loading__ring--mid", "aria-hidden": true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-loading__logo", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: logoSrc,
          alt: logoAlt,
          width: 120,
          height: 120,
          "aria-hidden": logoAlt ? void 0 : true
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-loading__orbit", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-loading__orbit-tick" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-loading__copy", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-loading__eyebrow", children: eyebrow }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-loading__heading", children: current.heading }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-loading__supporting", children: current.supporting }),
      context && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dx-loading__context", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-loading__context-label", children: contextLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-loading__context-value", children: [
          '"',
          context,
          '"'
        ] })
      ] })
    ] })
  ] });
}
export {
  DexterLoading as D
};
