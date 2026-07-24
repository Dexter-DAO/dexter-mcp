import { j as jsxRuntimeExports } from "./adapter-2CdQiSQS.js";
import { c as clsx } from "./Button-D0aT-vrW.js";
const EmptyMessage$1 = "_EmptyMessage_1r5gu_1";
const IconBadge = "_IconBadge_1r5gu_16";
const Title$1 = "_Title_1r5gu_54";
const Description$1 = "_Description_1r5gu_69";
const ActionRow$1 = "_ActionRow_1r5gu_77";
const s = {
  EmptyMessage: EmptyMessage$1,
  IconBadge,
  Title: Title$1,
  Description: Description$1,
  ActionRow: ActionRow$1
};
const EmptyMessage = ({ children, className, fill = "static" }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.EmptyMessage, className), "data-fill": fill, children });
};
const Icon = ({ size = "md", color = "secondary", children, className }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.IconBadge, className), "data-size": size, "data-color": color, children });
};
const Title = ({ children, className, color = "secondary" }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.Title, className), "data-color": color, children });
};
const Description = ({ children, className }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.Description, className), children });
};
const ActionRow = ({ children, className }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s.ActionRow, className), children });
};
EmptyMessage.Icon = Icon;
EmptyMessage.Title = Title;
EmptyMessage.Description = Description;
EmptyMessage.ActionRow = ActionRow;
export {
  EmptyMessage as E
};
