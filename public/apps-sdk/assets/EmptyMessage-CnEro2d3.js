import { r as reactExports, j as jsxRuntimeExports, v as commonjsGlobal, R as React } from "./adapter-CnqTmm6v.js";
import { c as canUseDOM, h as hasDocument, i as isTest, a as isDev } from "./AppsSDKUIContext-BLI5RP5r.js";
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o2 = e.length;
    for (t = 0; t < o2; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o2 = arguments.length; f < o2; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
const handlePressableMouseEnter = (evt) => {
  const target = evt.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const elementWidth = target.offsetWidth;
  let scale = 0.985;
  if (elementWidth <= 80) {
    scale = 0.96;
  } else if (elementWidth <= 150) {
    scale = 0.97;
  } else if (elementWidth <= 220) {
    scale = 0.98;
  } else if (elementWidth > 600) {
    scale = 0.995;
  }
  target.style.setProperty("--scale", scale.toString());
};
const waitForAnimationFrame = (cb, options) => {
  const runAfterTick = () => {
    const id = setTimeout(cb);
    return () => {
      clearTimeout(id);
    };
  };
  if (!canUseDOM || typeof window.requestAnimationFrame !== "function") {
    return runAfterTick();
  }
  const visibilityHidden = hasDocument && document.visibilityState === "hidden";
  if (visibilityHidden) {
    return runAfterTick();
  }
  let frames = 2;
  let animationFrame = window.requestAnimationFrame(function recurse() {
    frames -= 1;
    if (frames === 0) {
      cb();
    } else {
      animationFrame = window.requestAnimationFrame(recurse);
    }
  });
  return () => {
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(animationFrame);
    }
  };
};
const toCssVariables = (variables) => {
  const formattedVariables = Object.keys(variables).reduce((acc, variable) => {
    const value = variables[variable];
    if (value || value === 0) {
      const prefix = variable.startsWith("--") ? "" : "--";
      const formattedValue = typeof value === "number" ? `${value}px` : value;
      acc[`${prefix}${variable}`] = formattedValue;
    }
    return acc;
  }, {});
  return formattedVariables;
};
const flattenTextNodes = (children) => {
  const nodes = reactExports.Children.toArray(children);
  const result = [];
  let buffer = "";
  const flush = () => {
    if (buffer !== "") {
      result.push(buffer);
      buffer = "";
    }
  };
  for (const node of nodes) {
    if (node == null || typeof node === "boolean") {
      continue;
    }
    if (typeof node === "string" || typeof node === "number") {
      buffer += String(node);
      continue;
    }
    flush();
    result.push(node);
  }
  flush();
  return result;
};
const wrapTextNodeSiblings = (children) => {
  const flattenedChildren = flattenTextNodes(children);
  const childrenCount = reactExports.Children.count(flattenedChildren);
  return reactExports.Children.map(flattenedChildren, (child) => {
    if (typeof child === "string" && !!child.trim()) {
      if (childrenCount <= 1) {
        return child;
      }
      return jsxRuntimeExports.jsx("span", { children: child });
    }
    if (reactExports.isValidElement(child)) {
      const element = child;
      const { children: innerChildren, ...restProps } = element.props;
      if (innerChildren != null) {
        return reactExports.cloneElement(element, restProps, wrapTextNodeSiblings(innerChildren));
      }
      return element;
    }
    return child;
  });
};
var lodash_debounce;
var hasRequiredLodash_debounce;
function requireLodash_debounce() {
  if (hasRequiredLodash_debounce) return lodash_debounce;
  hasRequiredLodash_debounce = 1;
  var FUNC_ERROR_TEXT = "Expected a function";
  var NAN = 0 / 0;
  var symbolTag = "[object Symbol]";
  var reTrim = /^\s+|\s+$/g;
  var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
  var reIsBinary = /^0b[01]+$/i;
  var reIsOctal = /^0o[0-7]+$/i;
  var freeParseInt = parseInt;
  var freeGlobal = typeof commonjsGlobal == "object" && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;
  var freeSelf = typeof self == "object" && self && self.Object === Object && self;
  var root = freeGlobal || freeSelf || Function("return this")();
  var objectProto = Object.prototype;
  var objectToString = objectProto.toString;
  var nativeMax = Math.max, nativeMin = Math.min;
  var now = function() {
    return root.Date.now();
  };
  function debounce(func, wait, options) {
    var lastArgs, lastThis, maxWait, result, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
    if (typeof func != "function") {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    wait = toNumber(wait) || 0;
    if (isObject(options)) {
      leading = !!options.leading;
      maxing = "maxWait" in options;
      maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
      trailing = "trailing" in options ? !!options.trailing : trailing;
    }
    function invokeFunc(time) {
      var args = lastArgs, thisArg = lastThis;
      lastArgs = lastThis = void 0;
      lastInvokeTime = time;
      result = func.apply(thisArg, args);
      return result;
    }
    function leadingEdge(time) {
      lastInvokeTime = time;
      timerId = setTimeout(timerExpired, wait);
      return leading ? invokeFunc(time) : result;
    }
    function remainingWait(time) {
      var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, result2 = wait - timeSinceLastCall;
      return maxing ? nativeMin(result2, maxWait - timeSinceLastInvoke) : result2;
    }
    function shouldInvoke(time) {
      var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
      return lastCallTime === void 0 || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
    }
    function timerExpired() {
      var time = now();
      if (shouldInvoke(time)) {
        return trailingEdge(time);
      }
      timerId = setTimeout(timerExpired, remainingWait(time));
    }
    function trailingEdge(time) {
      timerId = void 0;
      if (trailing && lastArgs) {
        return invokeFunc(time);
      }
      lastArgs = lastThis = void 0;
      return result;
    }
    function cancel() {
      if (timerId !== void 0) {
        clearTimeout(timerId);
      }
      lastInvokeTime = 0;
      lastArgs = lastCallTime = lastThis = timerId = void 0;
    }
    function flush() {
      return timerId === void 0 ? result : trailingEdge(now());
    }
    function debounced() {
      var time = now(), isInvoking = shouldInvoke(time);
      lastArgs = arguments;
      lastThis = this;
      lastCallTime = time;
      if (isInvoking) {
        if (timerId === void 0) {
          return leadingEdge(lastCallTime);
        }
        if (maxing) {
          timerId = setTimeout(timerExpired, wait);
          return invokeFunc(lastCallTime);
        }
      }
      if (timerId === void 0) {
        timerId = setTimeout(timerExpired, wait);
      }
      return result;
    }
    debounced.cancel = cancel;
    debounced.flush = flush;
    return debounced;
  }
  function isObject(value) {
    var type = typeof value;
    return !!value && (type == "object" || type == "function");
  }
  function isObjectLike(value) {
    return !!value && typeof value == "object";
  }
  function isSymbol(value) {
    return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
  }
  function toNumber(value) {
    if (typeof value == "number") {
      return value;
    }
    if (isSymbol(value)) {
      return NAN;
    }
    if (isObject(value)) {
      var other = typeof value.valueOf == "function" ? value.valueOf() : value;
      value = isObject(other) ? other + "" : other;
    }
    if (typeof value != "string") {
      return value === 0 ? value : +value;
    }
    value = value.replace(reTrim, "");
    var isBinary = reIsBinary.test(value);
    return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
  }
  lodash_debounce = debounce;
  return lodash_debounce;
}
requireLodash_debounce();
var useIsomorphicLayoutEffect = typeof window !== "undefined" ? reactExports.useLayoutEffect : reactExports.useEffect;
function useIsMounted() {
  const isMounted = reactExports.useRef(false);
  reactExports.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return reactExports.useCallback(() => isMounted.current, []);
}
var initialSize = {
  width: void 0,
  height: void 0
};
function useResizeObserver(options) {
  const { ref, box = "content-box" } = options;
  const [{ width, height }, setSize] = reactExports.useState(initialSize);
  const isMounted = useIsMounted();
  const previousSize = reactExports.useRef({ ...initialSize });
  const onResize = reactExports.useRef(void 0);
  onResize.current = options.onResize;
  reactExports.useEffect(() => {
    if (!ref.current)
      return;
    if (typeof window === "undefined" || !("ResizeObserver" in window))
      return;
    const observer = new ResizeObserver(([entry]) => {
      const boxProp = box === "border-box" ? "borderBoxSize" : box === "device-pixel-content-box" ? "devicePixelContentBoxSize" : "contentBoxSize";
      const newWidth = extractSize(entry, boxProp, "inlineSize");
      const newHeight = extractSize(entry, boxProp, "blockSize");
      const hasChanged = previousSize.current.width !== newWidth || previousSize.current.height !== newHeight;
      if (hasChanged) {
        const newSize = { width: newWidth, height: newHeight };
        previousSize.current.width = newWidth;
        previousSize.current.height = newHeight;
        if (onResize.current) {
          onResize.current(newSize);
        } else {
          if (isMounted()) {
            setSize(newSize);
          }
        }
      }
    });
    observer.observe(ref.current, { box });
    return () => {
      observer.disconnect();
    };
  }, [box, ref, isMounted]);
  return { width, height };
}
function extractSize(entry, box, sizeType) {
  if (!entry[box]) {
    if (box === "contentBoxSize") {
      return entry.contentRect[sizeType === "inlineSize" ? "width" : "height"];
    }
    return void 0;
  }
  return Array.isArray(entry[box]) ? entry[box][0][sizeType] : (
    // @ts-ignore Support Firefox's non-standard behavior
    entry[box][sizeType]
  );
}
function useTimeout(callback, delay) {
  const savedCallback = reactExports.useRef(callback);
  useIsomorphicLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  reactExports.useEffect(() => {
    if (!delay && delay !== 0) {
      return;
    }
    const id = setTimeout(() => {
      savedCallback.current();
    }, delay);
    return () => {
      clearTimeout(id);
    };
  }, [delay]);
}
const LoadingIndicator$1 = "_LoadingIndicator_7yl6f_1";
const s$4 = {
  LoadingIndicator: LoadingIndicator$1
};
const LoadingIndicator = ({ className, size, strokeWidth, style, ...restProps }) => {
  return jsxRuntimeExports.jsx("div", { ...restProps, className: clsx(s$4.LoadingIndicator, className), style: style || toCssVariables({
    "indicator-size": size,
    "indicator-stroke": strokeWidth
  }) });
};
function o(f) {
  return (r2) => {
    f.forEach((n) => {
      typeof n == "function" ? n(r2) : n != null && (n.current = r2);
    });
  };
}
const getDisableAnimations = () => isTest;
const ChildrenWithKeys = (children, shouldThrow = false, componentName = "TransitionGroup") => {
  const validChildren = [];
  reactExports.Children.forEach(children, (child) => {
    if (child && typeof child === "object" && "key" in child && !!child.key) {
      validChildren.push(child);
    } else if (shouldThrow) {
      throw new Error(`Child elements of <${componentName} /> must include a \`key\``);
    }
  });
  return validChildren;
};
const noop = () => {
};
const useChildCallback = (cb) => {
  const ref = reactExports.useRef(cb);
  ref.current = cb;
  return reactExports.useCallback((element) => ref.current(element), []);
};
function computeNextRenderChildren(propChildrenArray, currentRenderChildren, createDefaultRenderChildProps, insertMethod) {
  const propChildKeyMap = propChildrenArray.reduce((acc, child) => ({ ...acc, [child.key]: 1 }), {});
  const currentRenderChildKeyMap = currentRenderChildren.reduce((acc, child) => ({ ...acc, [child.component.key]: 1 }), {});
  const newRenderChildren = propChildrenArray.filter((propChild) => !currentRenderChildKeyMap[propChild.key]).map(createDefaultRenderChildProps);
  const updatedCurrentChildren = currentRenderChildren.map((childProps) => ({
    ...childProps,
    component: propChildrenArray.find(({ key }) => key === childProps.component.key) || childProps.component,
    shouldRender: !!propChildKeyMap[childProps.component.key]
  }));
  return insertMethod === "append" ? updatedCurrentChildren.concat(newRenderChildren) : newRenderChildren.concat(updatedCurrentChildren);
}
function assertSingleChildWhenRef(componentName, ref, childrenCount) {
  if ((isTest || isDev) && ref && childrenCount > 1) {
    throw new Error(`Cannot use forwardRef with multiple children in <${componentName} />`);
  }
}
const TransitionGroupChild$1 = "_TransitionGroupChild_1hv1z_1";
const s$3 = {
  TransitionGroupChild: TransitionGroupChild$1
};
const RESTING_TRANSITION_STATE = {
  enter: false,
  enterActive: false,
  exit: false,
  exitActive: false,
  interrupted: false
};
const getInitialTransitionState = (preventMountTransition) => ({
  ...RESTING_TRANSITION_STATE,
  enter: !preventMountTransition
});
const transitionReducer = (state, action) => {
  switch (action.type) {
    case "enter-before":
      return {
        enter: true,
        enterActive: false,
        exit: false,
        exitActive: false,
        interrupted: state.interrupted || state.exit
      };
    case "enter-active":
      return {
        enter: true,
        enterActive: true,
        exit: false,
        exitActive: false,
        interrupted: false
      };
    case "exit-before":
      return {
        enter: false,
        enterActive: false,
        exit: true,
        exitActive: false,
        interrupted: state.interrupted || state.enter
      };
    case "exit-active":
      return {
        enter: false,
        enterActive: false,
        exit: true,
        exitActive: true,
        interrupted: false
      };
    case "done":
    default:
      return RESTING_TRANSITION_STATE;
  }
};
const TransitionGroupChildInner = ({ ref: forwardedRef, as: TagName, children, className, transitionId, style, preventMountTransition, shouldRender, enterDuration, exitDuration, removeChild, onEnter, onEnterActive, onEnterComplete, onExit, onExitActive, onExitComplete }) => {
  const [state, dispatch] = reactExports.useReducer(transitionReducer, getInitialTransitionState(preventMountTransition || false));
  const preventedMountTransition = reactExports.useRef(false);
  const elementRef = reactExports.useRef(null);
  const enterDurationRef = reactExports.useRef(enterDuration);
  enterDurationRef.current = enterDuration;
  const exitDurationRef = reactExports.useRef(exitDuration);
  exitDurationRef.current = exitDuration;
  const lastCallbackRef = reactExports.useRef(null);
  const triggerCallback = reactExports.useCallback((callbackType) => {
    const element = elementRef.current;
    if (!element || callbackType === lastCallbackRef.current) {
      return;
    }
    lastCallbackRef.current = callbackType;
    switch (callbackType) {
      case "enter":
        onEnter(element);
        break;
      case "enter-active":
        onEnterActive(element);
        break;
      case "enter-complete":
        onEnterComplete(element);
        break;
      case "exit":
        onExit(element);
        break;
      case "exit-active":
        onExitActive(element);
        break;
      case "exit-complete":
        onExitComplete(element);
        break;
    }
  }, [onEnter, onEnterActive, onEnterComplete, onExit, onExitActive, onExitComplete]);
  React.useLayoutEffect(() => {
    if (!shouldRender) {
      let exitTimeout;
      dispatch({ type: "exit-before" });
      triggerCallback("exit");
      const cancelAnimationFrame2 = waitForAnimationFrame(() => {
        dispatch({ type: "exit-active" });
        triggerCallback("exit-active");
        exitTimeout = window.setTimeout(() => {
          triggerCallback("exit-complete");
          removeChild();
        }, exitDurationRef.current);
      });
      return () => {
        cancelAnimationFrame2();
        if (exitTimeout !== void 0)
          clearTimeout(exitTimeout);
      };
    }
    if (preventMountTransition && !preventedMountTransition.current) {
      preventedMountTransition.current = true;
      return;
    }
    let enterTimeout;
    dispatch({ type: "enter-before" });
    triggerCallback("enter");
    const cancelAnimationFrame = waitForAnimationFrame(() => {
      dispatch({ type: "enter-active" });
      triggerCallback("enter-active");
      enterTimeout = window.setTimeout(() => {
        dispatch({ type: "done" });
        triggerCallback("enter-complete");
      }, enterDurationRef.current);
    });
    return () => {
      cancelAnimationFrame();
      if (enterTimeout !== void 0)
        clearTimeout(enterTimeout);
    };
  }, [
    shouldRender,
    // This value is immutable after <TransitionGroup> is created, and does not change on re-renders.
    preventMountTransition,
    removeChild,
    triggerCallback
  ]);
  reactExports.useEffect(() => {
    return () => {
      preventedMountTransition.current = false;
    };
  }, []);
  return jsxRuntimeExports.jsx(TagName, { ref: o([elementRef, forwardedRef]), className: clsx(className, s$3.TransitionGroupChild), "data-transition-id": transitionId, style, "data-entering": state.enter ? "" : void 0, "data-entering-active": state.enterActive ? "" : void 0, "data-exiting": state.exit ? "" : void 0, "data-exiting-active": state.exitActive ? "" : void 0, "data-interrupted": state.interrupted ? "" : void 0, children });
};
const TransitionGroupChild = (props) => {
  const { enterMountDelay, preventMountTransition } = props;
  const mountDelay = !preventMountTransition && enterMountDelay != null ? enterMountDelay : null;
  const [mounted, setMounted] = reactExports.useState(mountDelay == null);
  useTimeout(() => setMounted(true), mounted ? null : mountDelay);
  return mounted ? jsxRuntimeExports.jsx(TransitionGroupChildInner, { ...props }) : null;
};
const TransitionGroup = (props) => {
  const { ref: forwardedRef, as: TagName = "span", children, className, transitionId, style, enterDuration = 0, exitDuration = 0, preventInitialTransition = true, enterMountDelay, insertMethod = "append", disableAnimations = getDisableAnimations() } = props;
  const onEnter = useChildCallback(props.onEnter ?? noop);
  const onEnterActive = useChildCallback(props.onEnterActive ?? noop);
  const onEnterComplete = useChildCallback(props.onEnterComplete ?? noop);
  const onExit = useChildCallback(props.onExit ?? noop);
  const onExitActive = useChildCallback(props.onExitActive ?? noop);
  const onExitComplete = useChildCallback(props.onExitComplete ?? noop);
  reactExports.Children.forEach(children, (child) => {
    if (child && !child.key) {
      throw new Error("Child elements of <TransitionGroup /> must include a `key`");
    }
  });
  const createDefaultRenderChildProps = reactExports.useCallback((child) => ({
    component: child,
    shouldRender: true,
    removeChild: () => {
      setRenderChildren((currentRenderChildren) => currentRenderChildren.filter((c) => child.key !== c.component.key));
    },
    onEnter,
    onEnterActive,
    onEnterComplete,
    onExit,
    onExitActive,
    onExitComplete
  }), [onEnter, onEnterActive, onEnterComplete, onExit, onExitActive, onExitComplete]);
  const [renderChildren, setRenderChildren] = reactExports.useState(() => {
    return ChildrenWithKeys(children).map((child) => ({
      ...createDefaultRenderChildProps(child),
      // Lock this value to whatever the value was on initial render of the TransitionGroup.
      // It doesn't make sense to change this once it is mounted.
      preventMountTransition: preventInitialTransition
    }));
  });
  reactExports.useLayoutEffect(() => {
    setRenderChildren((currentRenderChildren) => {
      const propChildrenArray = ChildrenWithKeys(children);
      return computeNextRenderChildren(propChildrenArray, currentRenderChildren, createDefaultRenderChildProps, insertMethod);
    });
  }, [children, insertMethod, createDefaultRenderChildProps]);
  assertSingleChildWhenRef("TransitionGroup", forwardedRef, reactExports.Children.count(children));
  if (disableAnimations) {
    return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: reactExports.Children.map(children, (child) => jsxRuntimeExports.jsx(
      TagName,
      {
        // @ts-expect-error -- TS is not happy about this forwardedRef, but it's fine.
        ref: forwardedRef,
        className,
        style,
        "data-transition-id": transitionId,
        children: child
      }
    )) });
  }
  return jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: renderChildren.map(({ component, ...restProps }) => jsxRuntimeExports.jsx(TransitionGroupChild, { ...restProps, as: TagName, className, transitionId, enterDuration, exitDuration, enterMountDelay, style, ref: forwardedRef, children: component }, component.key)) });
};
const Button$1 = "_Button_1864l_1";
const ButtonInner = "_ButtonInner_1864l_4";
const ButtonLoader = "_ButtonLoader_1864l_749";
const s$2 = {
  Button: Button$1,
  ButtonInner,
  ButtonLoader
};
const Button = (props) => {
  const {
    type = "button",
    color = "primary",
    variant = "solid",
    pill = true,
    uniform = false,
    size = "md",
    iconSize,
    gutterSize,
    loading,
    selected,
    block,
    opticallyAlign,
    children,
    className,
    onClick,
    disabled,
    disabledTone,
    // Defaults to `loading` state
    inert = loading,
    ...restProps
  } = props;
  const isInert = disabled || inert;
  const handleClick = reactExports.useCallback((e) => {
    if (disabled) {
      return;
    }
    onClick?.(e);
  }, [onClick, disabled]);
  return jsxRuntimeExports.jsxs("button", {
    type,
    className: clsx(s$2.Button, className),
    "data-color": color,
    "data-variant": variant,
    "data-pill": pill ? "" : void 0,
    "data-uniform": uniform ? "" : void 0,
    "data-size": size,
    "data-gutter-size": gutterSize,
    "data-icon-size": iconSize,
    "data-loading": loading ? "" : void 0,
    "data-selected": selected ? "" : void 0,
    "data-block": block ? "" : void 0,
    "data-optically-align": opticallyAlign,
    onPointerEnter: handlePressableMouseEnter,
    // Non-visual, accessible disablement
    // NOTE: Do not use literal `inert` because that is incorrect semantically
    disabled: isInert,
    "aria-disabled": isInert,
    tabIndex: isInert ? -1 : void 0,
    "data-disabled": disabled ? "" : void 0,
    "data-disabled-tone": disabled ? disabledTone : void 0,
    onClick: handleClick,
    ...restProps,
    children: [jsxRuntimeExports.jsx(TransitionGroup, { className: s$2.ButtonLoader, enterDuration: 250, exitDuration: 150, children: loading && jsxRuntimeExports.jsx(LoadingIndicator, {}, "loader") }), jsxRuntimeExports.jsx("span", { className: s$2.ButtonInner, children: wrapTextNodeSiblings(children) })]
  });
};
const Badge$1 = "_Badge_1viyg_1";
const s$1 = {
  Badge: Badge$1
};
const Badge = ({ children, className, variant = "soft", color = "secondary", size = "sm", pill, ...restMaybeAsChildProps }) => {
  return jsxRuntimeExports.jsx("div", { className: clsx(s$1.Badge, className), "data-color": color, "data-size": size, "data-pill": pill ? "" : void 0, "data-variant": variant, ...restMaybeAsChildProps, children: wrapTextNodeSiblings(children) });
};
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
  Badge as B,
  EmptyMessage as E,
  Button as a,
  clsx as c,
  o,
  useResizeObserver as u
};
