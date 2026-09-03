import { j as jsxRuntimeExports } from "./adapter-CnqTmm6v.js";
const walletLockupDark = "" + new URL("dexter-wallet-lockup-dark-CuN9btRO.svg", import.meta.url).href;
const walletLockupLight = "" + new URL("dexter-wallet-lockup-light-CKvwVKXW.svg", import.meta.url).href;
function Lockup({ width = 122 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      className: "dxw-lockup",
      role: "img",
      "aria-label": "Dexter Wallet",
      style: { width },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            className: "dxw-lockup__image dxw-lockup__image--light",
            src: walletLockupLight,
            alt: "",
            "aria-hidden": "true"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            className: "dxw-lockup__image dxw-lockup__image--dark",
            src: walletLockupDark,
            alt: "",
            "aria-hidden": "true"
          }
        )
      ]
    }
  );
}
export {
  Lockup as L
};
