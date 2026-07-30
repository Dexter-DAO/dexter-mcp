import { r as reactExports, j as jsxRuntimeExports, u as useToolOutput, e as useAdaptiveOpenExternal, f as useAdaptiveSendFollowUp, g as useAdaptiveTheme, c as captureWidgetException } from "./adapter-G-K6R9j_.js";
import { u as useDisplayMode, a as useRequestDisplayMode } from "./use-request-display-mode-Dy-U6slV.js";
import { u as useMaxHeight } from "./use-max-height-B8kaEeB9.js";
/* empty css             */
import { c as clientExports } from "./client-C4wamDB_.js";
import { g as getChain } from "./ChainIcon-DxLItDo6.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-BMp19l4T.js";
import { D as DebugPanel } from "./DebugPanel-Co3MNpuA.js";
import "./portfolioModel-yEMSOUo4.js";
import "./AppsSDKUIContext-DOyS2lyj.js";
import { D as DexterLoading } from "./DexterLoading-ZDOGpjzp.js";
import "./use-openai-global-C5L_09K0.js";
function getType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
const TYPE_COLORS = {
  string: "text-[#e9967a]",
  number: "text-[#b5cea8]",
  boolean: "text-[#569cd6]",
  null: "text-[#808080]",
  object: "",
  array: ""
};
function JsonNode({ keyName, value, depth = 0, last = true }) {
  const type = getType(value);
  const isExpandable = type === "object" || type === "array";
  const [expanded, setExpanded] = reactExports.useState(depth < 2);
  if (!isExpandable) {
    let rendered;
    if (type === "string") rendered = `"${String(value)}"`;
    else if (type === "null") rendered = "null";
    else rendered = String(value);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex", style: { paddingLeft: `${depth * 16}px` }, children: [
      keyName !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[#9cdcfe] flex-shrink-0", children: [
        '"',
        keyName,
        '"',
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: ": " })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `${TYPE_COLORS[type]} break-all`, children: rendered }),
      !last && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: "," })
    ] });
  }
  const entries = type === "array" ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const bracketOpen = type === "array" ? "[" : "{";
  const bracketClose = type === "array" ? "]" : "}";
  const isEmpty = entries.length === 0;
  if (isEmpty) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex", style: { paddingLeft: `${depth * 16}px` }, children: [
      keyName !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[#9cdcfe]", children: [
        '"',
        keyName,
        '"',
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: ": " })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-tertiary", children: [
        bracketOpen,
        bracketClose
      ] }),
      !last && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: "," })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "flex items-center cursor-pointer hover:bg-white/5 rounded",
        style: { paddingLeft: `${depth * 16}px` },
        onClick: () => setExpanded(!expanded),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary w-4 text-center text-2xs select-none flex-shrink-0", children: expanded ? "▼" : "▶" }),
          keyName !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[#9cdcfe]", children: [
            '"',
            keyName,
            '"',
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: ": " })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: bracketOpen }),
          !expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-tertiary ml-1", children: [
            entries.length,
            " ",
            type === "array" ? "items" : "keys",
            " ",
            bracketClose,
            !last && ","
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      entries.map(([k, v], i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        JsonNode,
        {
          keyName: type === "array" ? void 0 : k,
          value: v,
          depth: depth + 1,
          last: i === entries.length - 1
        },
        k
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { paddingLeft: `${depth * 16}px` }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary ml-4", children: bracketClose }),
        !last && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-tertiary", children: "," })
      ] })
    ] })
  ] });
}
function JsonViewer({ data, title = "Response Payload", defaultExpanded = true }) {
  const parsed = reactExports.useMemo(() => {
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }, [data]);
  const [expanded, setExpanded] = reactExports.useState(defaultExpanded);
  const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
  const isLong = jsonStr.length > 300;
  if (typeof parsed === "string") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-surface-secondary border border-subtle overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase font-semibold", children: title }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "px-3 py-2 text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap break-all", children: parsed })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-surface-secondary border border-subtle overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-tertiary uppercase font-semibold", children: title }),
      isLong && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "text-2xs text-primary hover:underline cursor-pointer",
          onClick: () => setExpanded(!expanded),
          children: expanded ? "Collapse" : "Expand"
        }
      )
    ] }),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 py-2 text-xs font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(JsonNode, { value: parsed }) })
  ] });
}
function ReceiptHeader({
  resourceLabel,
  method,
  isFullscreen,
  showToggle,
  onToggleFullscreen
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-receipt-header", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-header__brand", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-header__eyebrow", children: "Dexter · Receipt" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "dx-receipt-header__title", children: [
        method && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-header__method", children: method }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-header__resource", children: resourceLabel })
      ] })
    ] }),
    showToggle && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: "dx-receipt-header__toggle",
        onClick: onToggleFullscreen,
        children: isFullscreen ? "minimize" : "expand"
      }
    )
  ] });
}
function isImageUrl(data) {
  if (typeof data !== "object" || !data) return null;
  const obj = data;
  const url = obj.image_url || obj.imageUrl || obj.url;
  if (typeof url === "string" && /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/.test(url)) return url;
  return null;
}
function proxyImageUrl(url) {
  return `https://api.dexter.cash/api/img?url=${encodeURIComponent(url)}`;
}
function ReceiptBody({ data }) {
  if (data === void 0 || data === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-receipt-body dx-receipt-body--empty", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "No payload returned." }) });
  }
  const imageUrl = isImageUrl(data);
  if (imageUrl) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-receipt-body dx-receipt-body--image", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: proxyImageUrl(imageUrl), alt: "Response" }) });
  }
  if (typeof data === "string") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-receipt-body dx-receipt-body--text", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: data }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-receipt-body dx-receipt-body--json", children: /* @__PURE__ */ jsxRuntimeExports.jsx(JsonViewer, { data }) });
}
function AccessProof({ data }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-stamp-block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "dx-receipt-stamp dx-receipt-stamp--access",
        role: "img",
        "aria-label": `Access proof verified via ${data.mode}.`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-receipt-stamp__core", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__paid", children: "PROVEN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__amount", children: data.mode.toUpperCase() }),
            data.networkName && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__network", children: data.networkName })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__inner-ring", "aria-hidden": true }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__outer-ring", "aria-hidden": true })
        ]
      }
    ),
    data.signedAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-receipt-stamp__link dx-receipt-stamp__link--static", children: [
      "Signed by ",
      data.signedAddress
    ] })
  ] });
}
function ReceiptLoading({ resourceLabel }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    DexterLoading,
    {
      eyebrow: "Dexter · Receipt",
      stages: [
        {
          upTo: 3,
          heading: "Submitting payment…",
          supporting: "Quoting the resource and preparing the on-chain transfer."
        },
        {
          upTo: 9,
          heading: "Awaiting settlement…",
          supporting: "Facilitator is confirming the payment and forwarding to the seller."
        },
        {
          upTo: 18,
          heading: "Calling the endpoint…",
          supporting: "Payment cleared; waiting on the seller to respond."
        },
        {
          upTo: Infinity,
          heading: "Still processing — endpoint is slow.",
          supporting: "The settlement landed; the seller is taking longer than usual."
        }
      ],
      context: resourceLabel || null,
      contextLabel: "endpoint"
    }
  );
}
const buffer = [];
function getWidgetLogForDebug() {
  const out = {};
  buffer.forEach((entry, i) => {
    const t = new Date(entry.ts).toISOString().slice(11, 23);
    const detail = entry.detail ? ` ${entry.detail}` : "";
    out[`evt[${i.toString().padStart(2, "0")}]`] = `${t} ${entry.level} ${entry.tag}${detail}`;
  });
  return out;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function nestedState(value) {
  if (!isRecord(value)) return cleanString(value);
  return cleanString(value.state) ?? cleanString(value.status);
}
function humanize(value, fallback = "Not reported") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function deliveryLabel(value) {
  const state = nestedState(value);
  if (!isRecord(value)) return humanize(state);
  const httpStatus = typeof value.httpStatus === "number" && Number.isInteger(value.httpStatus) ? value.httpStatus : null;
  return httpStatus === null ? humanize(state) : `${humanize(state)} · HTTP ${httpStatus}`;
}
function paymentLabel(value) {
  if (!isRecord(value)) return humanize(nestedState(value));
  const state = nestedState(value);
  if (state) return humanize(state);
  if (value.confirmed === true || value.settled === true) return "Confirmed";
  if (value.confirmed === false || value.settled === false) return "Not confirmed";
  return "Not reported";
}
function reconciliationLabel(value) {
  if (!isRecord(value)) return humanize(nestedState(value));
  const state = nestedState(value);
  if (state) return humanize(state);
  if (value.required === true) {
    return value.performed === true ? "Required · performed" : "Required · pending";
  }
  if (value.required === false) return "Not required";
  if (value.performed === true) return "Performed";
  return "Not reported";
}
function token(value) {
  return value?.toLowerCase().replace(/\s+/g, "_") ?? "";
}
function classifyOutcome(payload) {
  const status = token(cleanString(payload.status));
  const delivery = token(nestedState(payload.delivery));
  const payment = token(nestedState(payload.payment));
  const reconciliation = isRecord(payload.reconciliation) ? payload.reconciliation : {};
  const reconciliationState = token(nestedState(payload.reconciliation));
  const combined = [status, delivery, payment, reconciliationState].join(" ");
  if (/ambiguous|uncertain|unknown|dispatch_possible|reconciliation_required/.test(combined) || reconciliation.required === true && reconciliation.performed !== true) {
    return "ambiguous";
  }
  if (/prepar|pending|signed|building|executing|dispatching/.test(combined)) {
    return "preparing";
  }
  if (/failed|refused|expired|rejected|cancelled|canceled/.test(combined)) {
    return "failed";
  }
  if (/resolved|complete|completed|success|succeeded|delivered/.test(combined) || isRecord(payload.payment) && payload.payment.confirmed === true) {
    return "complete";
  }
  if (payload.ok === false || payload.error === true || cleanString(payload.error) !== null) {
    return "failed";
  }
  return "unknown";
}
function buildSameIntentStatusPrompt(intentId) {
  return `Call x402_status with only intentId ${intentId}. Inspect that same intent; do not call x402_fetch again and do not create a replacement intent.`;
}
function normalizeIntentLifecycle(value) {
  const payload = isRecord(value) ? value : {};
  const intentId = cleanString(payload.intentId);
  const outcome = classifyOutcome(payload);
  const needsStatusCheck = Boolean(
    intentId && (outcome === "preparing" || outcome === "ambiguous")
  );
  const copy = {
    complete: {
      eyebrow: "Intent · Complete",
      title: "Purchase complete",
      summary: "Delivery and payment reached a terminal reported outcome."
    },
    preparing: {
      eyebrow: "Intent · Preparing",
      title: "Purchase is still preparing",
      summary: "Do not submit the purchase again. Check the same intent for progress."
    },
    ambiguous: {
      eyebrow: "Intent · Reconcile",
      title: "Outcome needs reconciliation",
      summary: "Dispatch or payment may have occurred. Do not retry the purchase."
    },
    failed: {
      eyebrow: "Intent · Stopped",
      title: "Purchase not completed",
      summary: "The intent stopped without a reported successful outcome."
    },
    unknown: {
      eyebrow: "Intent · Status",
      title: "Purchase status",
      summary: "Review the route-neutral lifecycle state reported for this intent."
    }
  }[outcome];
  return {
    intentId,
    outcome,
    ...copy,
    rows: [
      { label: "Delivery", value: deliveryLabel(payload.delivery) },
      { label: "Payment", value: paymentLabel(payload.payment) },
      {
        label: "Reconciliation",
        value: reconciliationLabel(payload.reconciliation)
      },
      {
        label: "Reservation",
        value: humanize(
          cleanString(payload.reservationState) ?? nestedState(payload.reservation)
        )
      }
    ],
    needsStatusCheck,
    statusPrompt: needsStatusCheck && intentId ? buildSameIntentStatusPrompt(intentId) : null
  };
}
function shortenIntent(intentId) {
  if (intentId.length <= 18) return intentId;
  return `${intentId.slice(0, 10)}…${intentId.slice(-6)}`;
}
function shortenAddress(address) {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
function errorText(payload) {
  if (payload.message?.trim()) return payload.message.trim();
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (payload.reason?.trim()) return payload.reason.trim();
  return "OpenDexter could not complete this intent.";
}
function ReceiptError({
  message,
  code,
  intentId,
  requestId
}) {
  const references = [];
  if (intentId) references.push(["Intent", intentId]);
  if (requestId) references.push(["OpenDexter request", requestId]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-error", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-error__eyebrow", children: "Couldn’t complete" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-receipt-error__message", children: message }),
    code && code !== message ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-receipt-error__code", children: code }) : null,
    references.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-receipt-error__references", children: references.map(([label, value]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: value })
    ] }, label)) }) : null
  ] });
}
function IntentLifecycleSummary({
  lifecycle,
  canCheckStatus,
  followUpState,
  followUpError,
  onCheckStatus
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: `dx-intent-status dx-intent-status--${lifecycle.outcome}`,
      "aria-labelledby": "dx-intent-status-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-intent-status__header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: lifecycle.eyebrow }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "dx-intent-status-title", children: lifecycle.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: lifecycle.summary })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { children: lifecycle.rows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: row.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: row.value })
        ] }, row.label)) }),
        lifecycle.intentId ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "dx-intent-status__reference", title: lifecycle.intentId, children: [
          "Intent ",
          lifecycle.intentId
        ] }) : null,
        lifecycle.needsStatusCheck ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-intent-status__follow-up", children: [
          canCheckStatus ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onCheckStatus,
              disabled: followUpState === "sending" || followUpState === "sent",
              children: followUpState === "sending" ? "Opening status check…" : followUpState === "sent" ? "Status check opened in chat" : "Check this intent in chat"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Ask Dexter to call x402_status with this same intentId." }),
          followUpError ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", children: followUpError }) : null
        ] }) : null
      ]
    }
  );
}
function FetchResult() {
  const toolOutput = useToolOutput();
  const openExternal = useAdaptiveOpenExternal();
  const openStatusFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const containerRef = useIntrinsicHeight();
  const [followUpState, setFollowUpState] = reactExports.useState("idle");
  const [followUpError, setFollowUpError] = reactExports.useState(null);
  const followUpInFlight = reactExports.useRef(false);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const isFullscreen = displayMode === "fullscreen";
  const requestDisplayMode = useRequestDisplayMode();
  const toggleFullscreen = reactExports.useCallback(() => {
    try {
      requestDisplayMode?.({ mode: isFullscreen ? "inline" : "fullscreen" });
    } catch (error) {
      captureWidgetException(error, { phase: "request_display_mode" });
    }
  }, [isFullscreen, requestDisplayMode]);
  const lifecycle = reactExports.useMemo(
    () => normalizeIntentLifecycle(toolOutput),
    [toolOutput]
  );
  const dataStr = reactExports.useMemo(
    () => toolOutput?.data !== void 0 ? JSON.stringify(toolOutput.data) : "",
    [toolOutput?.data]
  );
  const isLargePayload = dataStr.length > 500;
  reactExports.useEffect(() => {
    followUpInFlight.current = false;
    setFollowUpState("idle");
    setFollowUpError(null);
  }, [lifecycle.intentId]);
  const handleCheckStatus = reactExports.useCallback(async () => {
    if (!openStatusFollowUp || !lifecycle.statusPrompt || followUpInFlight.current || followUpState === "sending" || followUpState === "sent") {
      return;
    }
    followUpInFlight.current = true;
    setFollowUpState("sending");
    setFollowUpError(null);
    try {
      await openStatusFollowUp(lifecycle.statusPrompt);
      setFollowUpState("sent");
    } catch (error) {
      followUpInFlight.current = false;
      setFollowUpState("error");
      setFollowUpError("Couldn’t open the status check in chat. Try again.");
      captureWidgetException(error, { phase: "intent_status_follow_up" });
    }
  }, [lifecycle.statusPrompt, openStatusFollowUp, followUpState]);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        "data-theme": theme,
        className: "dx-fetch-result-frame",
        style: { maxHeight: maxHeight ?? void 0 },
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptLoading, { resourceLabel: null })
      }
    );
  }
  const isError = lifecycle.outcome === "failed";
  const hasIntentLifecycle = Boolean(
    lifecycle.intentId || toolOutput.delivery !== void 0 || toolOutput.payment !== void 0 || toolOutput.reconciliation !== void 0 || toolOutput.reservationState !== void 0 || toolOutput.reservation !== void 0
  );
  const accessProof = !hasIntentLifecycle && toolOutput.auth?.mode ? {
    mode: toolOutput.auth.mode,
    signedAddress: shortenAddress(toolOutput.auth.signedAddress),
    networkName: toolOutput.auth.network ? getChain(toolOutput.auth.network).name : ""
  } : null;
  const consentUrl = toolOutput.consentUrl?.startsWith("https://dexter.cash/") ? toolOutput.consentUrl : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-theme": theme,
      ref: containerRef,
      className: `dx-fetch-result-frame${isFullscreen ? " dx-fetch-result-frame--fullscreen" : ""}`,
      style: { maxHeight: isFullscreen ? void 0 : maxHeight ?? void 0 },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dx-receipt", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ReceiptHeader,
            {
              resourceLabel: lifecycle.intentId ? `Intent ${shortenIntent(lifecycle.intentId)}` : "OpenDexter response",
              isFullscreen,
              showToggle: isLargePayload,
              onToggleFullscreen: toggleFullscreen
            }
          ),
          isError ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            ReceiptError,
            {
              message: errorText(toolOutput),
              code: typeof toolOutput.error === "string" ? toolOutput.error : toolOutput.reason,
              intentId: lifecycle.intentId,
              requestId: toolOutput.requestId
            }
          ) : toolOutput.data !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptBody, { data: toolOutput.data }) : null,
          hasIntentLifecycle ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              IntentLifecycleSummary,
              {
                lifecycle,
                canCheckStatus: Boolean(openStatusFollowUp),
                followUpState,
                followUpError,
                onCheckStatus: () => {
                  void handleCheckStatus();
                }
              }
            ),
            toolOutput.authorizationRequired && consentUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-intent-consent", "aria-label": "Intent authorization required", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Approve this same intent on Dexter, then resume it without changing the request." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => openExternal(consentUrl), children: "Open Dexter consent" })
            ] }) : null
          ] }) : accessProof ? /* @__PURE__ */ jsxRuntimeExports.jsx(AccessProof, { data: accessProof }) : null
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          DebugPanel,
          {
            widgetName: "x402-fetch-result",
            extraInfo: getWidgetLogForDebug()
          }
        )
      ]
    }
  );
}
const root = document.getElementById("x402-fetch-result-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-07-30.opaque-intent");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(FetchResult, {}));
}
