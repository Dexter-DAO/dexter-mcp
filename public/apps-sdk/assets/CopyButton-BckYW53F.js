import { j as jsxRuntimeExports, r as reactExports } from "./adapter-B3ynKBmf.js";
import { C as Check } from "./Check-1vL_MH1D.js";
import { C as Copy } from "./Copy-BYEHp3zd.js";
import { T as TransitionGroup, c as clsx, t as toTransformProperty, a as toCssVariables, b as toFilterProperty, d as toOpacityProperty, e as toMsDurationProperty, B as Button } from "./Button-B7uq752z.js";
const supportsRichClipboard = () => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
function toClipboardItem(content) {
  const { "text/plain": text, ...rest } = content;
  return new ClipboardItem({
    ...rest,
    ...text ? { "text/plain": new Blob([text], { type: "text/plain" }) } : null
  });
}
async function copyToClipboard(content, container = document.body) {
  if (typeof content === "string") {
    return copyText(content, container);
  }
  try {
    if (supportsRichClipboard()) {
      await navigator.clipboard.write([toClipboardItem(content)]);
      return true;
    }
    if (content["text/plain"]) {
      return copyText(content["text/plain"], container);
    }
    return false;
  } catch (error) {
    return false;
  }
}
async function copyText(text, container = document.body) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
    }
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.opacity = "0";
  container.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch (error) {
  }
  container.removeChild(textArea);
  return succeeded;
}
const TransitionItem = "_TransitionItem_1o7b1_1";
const s = {
  TransitionItem
};
const Animate = (props) => {
  const { as: TagName = "span", className, children, preventInitialTransition, insertMethod, transitionClassName, transitionPosition = "absolute" } = props;
  const { enterTotalDuration, exitTotalDuration, variables } = getAnimationProperties(props);
  return jsxRuntimeExports.jsx(TagName, { className: clsx("block", transitionPosition === "absolute" && "relative", className), "data-transition-position": transitionPosition, style: variables, children: jsxRuntimeExports.jsx(TransitionGroup, { as: TagName, className: clsx(s.TransitionItem, transitionClassName), enterDuration: enterTotalDuration, exitDuration: exitTotalDuration, insertMethod, preventInitialTransition, children }) });
};
const DEFAULT_ENTER_DURATION_MS_EASE = 400;
const DEFAULT_ENTER_DURATION_MS_CUBIC = 500;
const DEFAULT_EXIT_DURATION_MS_EASE = 200;
const DEFAULT_EXIT_DURATION_MS_CUBIC = 300;
function getAnimationProperties({ initial, enter, exit, forceCompositeLayer }) {
  const initialTransform = toTransformProperty(initial);
  const enterTransform = toTransformProperty(enter);
  const exitTransform = toTransformProperty(exit);
  const isCubicTransition = [initialTransform, exitTransform, enterTransform].some((t) => t !== "none");
  const enterDuration = enter?.duration ?? (isCubicTransition ? DEFAULT_ENTER_DURATION_MS_CUBIC : DEFAULT_ENTER_DURATION_MS_EASE);
  const enterTimingFunction = enter?.timingFunction ?? (isCubicTransition ? "var(--cubic-enter)" : "ease");
  const exitDuration = exit?.duration ?? (isCubicTransition ? DEFAULT_EXIT_DURATION_MS_CUBIC : DEFAULT_EXIT_DURATION_MS_EASE);
  const exitTimingFunction = exit?.timingFunction ?? (isCubicTransition ? "var(--cubic-exit)" : "ease");
  const variables = toCssVariables({
    "tg-will-change": forceCompositeLayer ? "transform, opacity" : "auto",
    "tg-enter-opacity": toOpacityProperty(enter?.opacity ?? 1),
    "tg-enter-transform": enterTransform,
    "tg-enter-filter": toFilterProperty(enter),
    "tg-enter-duration": toMsDurationProperty(enterDuration),
    "tg-enter-delay": toMsDurationProperty(enter?.delay ?? 0),
    "tg-enter-timing-function": enterTimingFunction,
    "tg-exit-opacity": toOpacityProperty(exit?.opacity ?? 0),
    "tg-exit-transform": exitTransform,
    "tg-exit-filter": toFilterProperty(exit),
    "tg-exit-duration": toMsDurationProperty(exitDuration),
    "tg-exit-delay": toMsDurationProperty(exit?.delay ?? 0),
    "tg-exit-timing-function": exitTimingFunction,
    "tg-initial-opacity": toOpacityProperty(initial?.opacity ?? exit?.opacity ?? 0),
    "tg-initial-transform": initialTransform === "none" ? exitTransform : initialTransform,
    "tg-initial-filter": toFilterProperty(initial ?? exit ?? {})
  });
  const enterTotalDuration = (enter?.delay ?? 0) + enterDuration;
  const exitTotalDuration = (exit?.delay ?? 0) + exitDuration;
  return { enterTotalDuration, exitTotalDuration, variables };
}
const CopyButton = ({ children, copyValue, onClick, ...restProps }) => {
  const [copied, setCopied] = reactExports.useState(false);
  const copiedTimeout = reactExports.useRef(null);
  const handleClick = (evt) => {
    if (copied) {
      return;
    }
    setCopied(true);
    onClick?.(evt);
    copyToClipboard(typeof copyValue === "function" ? copyValue() : copyValue);
    copiedTimeout.current = window.setTimeout(() => {
      setCopied(false);
    }, 1300);
  };
  reactExports.useEffect(() => {
    return () => {
      if (copiedTimeout.current)
        clearTimeout(copiedTimeout.current);
    };
  }, []);
  return jsxRuntimeExports.jsxs(Button, { ...restProps, onClick: handleClick, children: [jsxRuntimeExports.jsx(Animate, { className: "w-[var(--button-icon-size)] h-[var(--button-icon-size)]", initial: { scale: 0.6 }, enter: { scale: 1, delay: 150, duration: 300 }, exit: { scale: 0.6, duration: 150 }, forceCompositeLayer: true, children: copied ? jsxRuntimeExports.jsx(Check, {}, "copied-icon") : jsxRuntimeExports.jsx(Copy, {}, "copy-icon") }), typeof children === "function" ? children({ copied }) : children] });
};
export {
  CopyButton as C
};
