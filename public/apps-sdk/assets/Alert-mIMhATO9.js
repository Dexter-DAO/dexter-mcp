import { j as jsxRuntimeExports, r as reactExports } from "./adapter-BD2Wya3l.js";
import { u as useResizeObserver, c as clsx, o } from "./EmptyMessage-D5hKS9aB.js";
const CheckCircle = (props) => jsxRuntimeExports.jsx("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: jsxRuntimeExports.jsx("path", { d: "M12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z", fill: "currentColor" }) });
const Info = (props) => jsxRuntimeExports.jsxs("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: [jsxRuntimeExports.jsx("path", { d: "M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0v-4Zm-1-2.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5Z" }), jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2ZM4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Z", clipRule: "evenodd" })] });
const Warning = (props) => jsxRuntimeExports.jsxs("svg", { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "currentColor", ...props, children: [jsxRuntimeExports.jsx("path", { d: "M10.42 2.006a4 4 0 0 1 3.159 0c.674.29 1.188.822 1.667 1.456.474.627 1 1.473 1.653 2.523l3.542 5.696c.72 1.16 1.3 2.09 1.682 2.854.384.766.654 1.517.59 2.292a4 4 0 0 1-1.604 2.886c-.625.463-1.405.63-2.258.709-.85.078-1.945.078-3.311.078H8.46c-1.366 0-2.46 0-3.31-.078-.854-.078-1.634-.246-2.26-.71a4 4 0 0 1-1.603-2.885c-.064-.775.206-1.526.59-2.292.383-.764.961-1.694 1.682-2.854l3.542-5.696c.653-1.05 1.18-1.896 1.653-2.523.48-.634.993-1.166 1.667-1.456Zm2.37 1.838a2 2 0 0 0-1.58 0c-.192.083-.448.28-.86.825-.413.544-.891 1.312-1.577 2.415l-3.488 5.61c-.755 1.214-1.283 2.066-1.62 2.737-.34.678-.402 1.02-.385 1.232a2 2 0 0 0 .802 1.443c.171.127.494.255 1.25.324.748.069 1.75.07 3.18.07h6.976c1.43 0 2.432-.001 3.18-.07.756-.069 1.079-.197 1.25-.324a2 2 0 0 0 .802-1.443c.017-.212-.045-.554-.385-1.232-.337-.671-.865-1.523-1.62-2.737l-3.488-5.61c-.686-1.103-1.164-1.87-1.576-2.415-.413-.546-.67-.742-.861-.825" }), jsxRuntimeExports.jsx("path", { d: "M12 7.5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1M10.851 15a1.15 1.15 0 1 1 2.3 0 1.15 1.15 0 0 1-2.3 0" })] });
const Alert$1 = "_Alert_1tr02_1";
const Content = "_Content_1tr02_145";
const Indicator$1 = "_Indicator_1tr02_156";
const Message = "_Message_1tr02_159";
const Title = "_Title_1tr02_162";
const Description = "_Description_1tr02_168";
const Actions = "_Actions_1tr02_173";
const s = {
  Alert: Alert$1,
  Content,
  Indicator: Indicator$1,
  Message,
  Title,
  Description,
  Actions
};
const Alert = ({ color = "primary", variant = "outline", title, description, actions, actionsPlacement, indicator, className, actionsClassName, ref, ...restProps }) => {
  const containerRef = reactExports.useRef(null);
  const actionsRef = reactExports.useRef(null);
  const [actionsAutoPlacement, setActionsAutoPlacement] = reactExports.useState("end");
  const { width: containerWidth } = useResizeObserver({ ref: containerRef });
  reactExports.useEffect(() => {
    const actionsWidth = actionsRef.current?.clientWidth ?? 0;
    if (actionsWidth && containerWidth) {
      const placement = actionsWidth > containerWidth / 3 ? "bottom" : "end";
      setActionsAutoPlacement(placement);
    }
  }, [containerWidth]);
  return jsxRuntimeExports.jsxs("div", { ref: o([ref, containerRef]), className: clsx(s.Alert, className), "data-variant": variant, "data-color": color, role: color === "danger" ? "alert" : void 0, "data-actions-placement": actionsPlacement ?? actionsAutoPlacement, ...restProps, children: [indicator === false ? null : jsxRuntimeExports.jsx("div", { className: s.Indicator, children: indicator ?? jsxRuntimeExports.jsx(Indicator, { color }) }), jsxRuntimeExports.jsxs("div", { className: s.Content, children: [jsxRuntimeExports.jsxs("div", { className: s.Message, children: [title && jsxRuntimeExports.jsx("div", { className: s.Title, children: title }), description && jsxRuntimeExports.jsx("div", { className: s.Description, children: description })] }), actions && jsxRuntimeExports.jsx("div", { className: clsx(s.Actions, actionsClassName), ref: actionsRef, children: actions })] })] });
};
const Indicator = ({ color }) => {
  switch (color) {
    case "warning":
    case "caution":
    case "danger":
      return jsxRuntimeExports.jsx(Warning, {});
    case "success":
      return jsxRuntimeExports.jsx(CheckCircle, {});
    default:
      return jsxRuntimeExports.jsx(Info, {});
  }
};
export {
  Alert as A,
  Warning as W
};
