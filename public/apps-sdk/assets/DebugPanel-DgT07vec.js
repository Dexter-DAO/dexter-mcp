import { j as jsxRuntimeExports, r as reactExports } from "./adapter-2CdQiSQS.js";
import { C as Check } from "./Check-CFLPyjzF.js";
import { C as Copy } from "./Copy-DH5U0kU7.js";
import { c as clsx, T as TransitionGroup, t as toTransformProperty, a as toCssVariables, b as toFilterProperty, d as toOpacityProperty, e as toMsDurationProperty, B as Button } from "./Button-D0aT-vrW.js";
import "./AppsSDKUIContext-DIC63NTQ.js";
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
const CHAIN_MAP = {
  solana: { name: "Solana", slug: "solana" },
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": { name: "Solana", slug: "solana" },
  base: { name: "Base", slug: "base" },
  "eip155:8453": { name: "Base", slug: "base" },
  polygon: { name: "Polygon", slug: "polygon" },
  "eip155:137": { name: "Polygon", slug: "polygon" },
  "eip155:42161": { name: "Arbitrum", slug: "arbitrum" },
  arbitrum: { name: "Arbitrum", slug: "arbitrum" },
  "eip155:10": { name: "Optimism", slug: "optimism" },
  optimism: { name: "Optimism", slug: "optimism" },
  "eip155:43114": { name: "Avalanche", slug: "avalanche" },
  avalanche: { name: "Avalanche", slug: "avalanche" },
  "eip155:2046399126": { name: "SKALE", slug: "skale" },
  skale: { name: "SKALE", slug: "skale" }
};
const ASSET_BASE = "https://dexter.cash/assets/chains";
const LOGO_FILES = {
  solana: "solana.svg",
  base: "base.svg",
  polygon: "polygon.svg",
  arbitrum: "arbitrum.svg",
  optimism: "optimism.svg",
  avalanche: "avalanche.svg",
  skale: "skale.svg",
  usdc: "usdc.svg"
};
function getChain(network) {
  if (!network) return { name: "", slug: "" };
  return CHAIN_MAP[network] ?? { name: network, slug: "default" };
}
function ChainIcon({ network, size = 16 }) {
  const { slug } = getChain(network);
  if (!slug) return null;
  const file = LOGO_FILES[slug];
  if (!file) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `x4-chain-icon x4-chain-icon--${slug}`, "aria-hidden": "true" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: `${ASSET_BASE}/${file}`,
      alt: slug,
      width: size,
      height: size,
      className: "x4-chain-logo",
      "aria-hidden": "true"
    }
  );
}
function UsdcIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: `${ASSET_BASE}/usdc.svg`,
      alt: "USDC",
      width: size,
      height: size,
      className: "x4-chain-logo",
      "aria-hidden": "true"
    }
  );
}
function DebugPanel({ widgetName, extraInfo }) {
  const [open, setOpen] = reactExports.useState(false);
  const oa = window.openai;
  if (!open) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: "4px 8px", textAlign: "right" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => setOpen(true),
        style: {
          all: "unset",
          cursor: "pointer",
          fontSize: 9,
          opacity: 0.3,
          fontFamily: "monospace",
          color: "inherit"
        },
        children: "[debug]"
      }
    ) });
  }
  const info = {
    widget: widgetName,
    build: document.querySelector("[data-widget-build]")?.getAttribute("data-widget-build") || "?",
    theme: oa?.theme || "?",
    displayMode: oa?.displayMode || "?",
    maxHeight: String(oa?.maxHeight ?? "?"),
    locale: oa?.locale || "?",
    hasCallTool: typeof oa?.callTool === "function" ? "YES" : "NO",
    hasSendFollowUp: typeof oa?.sendFollowUpMessage === "function" ? "YES" : "NO",
    hasOpenExternal: typeof oa?.openExternal === "function" ? "YES" : "NO",
    hasWidgetState: typeof oa?.setWidgetState === "function" ? "YES" : "NO",
    hasNotifyHeight: typeof oa?.notifyIntrinsicHeight === "function" ? "YES" : "NO",
    hasRequestModal: typeof oa?.requestModal === "function" ? "YES" : "NO",
    hasUploadFile: typeof oa?.uploadFile === "function" ? "YES" : "NO",
    hasRequestDisplayMode: typeof oa?.requestDisplayMode === "function" ? "YES" : "NO",
    userAgent: oa?.userAgent ? JSON.stringify(oa.userAgent) : "?",
    toolInputKeys: oa?.toolInput ? Object.keys(oa.toolInput).join(", ") : "?",
    toolOutputType: oa?.toolOutput ? typeof oa.toolOutput : "null",
    toolOutputKeys: oa?.toolOutput && typeof oa.toolOutput === "object" ? Object.keys(oa.toolOutput).join(", ") : "?",
    isChatGptApp: String(window.__isChatGptApp ?? "?")
  };
  if (extraInfo) {
    for (const [key, value] of Object.entries(extraInfo)) {
      info[key] = value == null ? String(value) : String(value);
    }
  }
  const text = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join("\n");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    margin: "8px 0 0",
    padding: 10,
    borderRadius: 8,
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontFamily: "monospace",
    fontSize: 10,
    lineHeight: 1.6,
    color: "#94a3b8",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontWeight: 700, color: "#facc15" }, children: [
        "DEBUG — ",
        widgetName
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              navigator.clipboard.writeText(text);
            },
            style: { all: "unset", cursor: "pointer", color: "#60a5fa", fontSize: 10 },
            children: "[copy]"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setOpen(false),
            style: { all: "unset", cursor: "pointer", color: "#fb7185", fontSize: 10 },
            children: "[close]"
          }
        )
      ] })
    ] }),
    text
  ] });
}
export {
  ChainIcon as C,
  DebugPanel as D,
  UsdcIcon as U,
  CopyButton as a,
  getChain as g
};
