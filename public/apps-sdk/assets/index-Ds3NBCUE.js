import { j as jsxRuntimeExports } from "./adapter-C5lR_HvA.js";
import { w as wrapTextNodeSiblings, c as clsx } from "./Button-vSLM53YF.js";
const Badge$1 = "_Badge_1viyg_1";
const s = {
  Badge: Badge$1
};
const Badge = ({ children, className, variant = "soft", color = "secondary", size = "sm", pill, ...restMaybeAsChildProps }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.Badge, className), "data-color": color, "data-size": size, "data-pill": pill ? "" : void 0, "data-variant": variant, ...restMaybeAsChildProps, children: wrapTextNodeSiblings(children) });
};
export {
  Badge as B
};
