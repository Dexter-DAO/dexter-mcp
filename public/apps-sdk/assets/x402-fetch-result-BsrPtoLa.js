import { r as reactExports, j as jsxRuntimeExports, u as useToolOutput, f as useAdaptiveOpenExternal, e as useAdaptiveTheme, b as captureWidgetException } from "./adapter-Cqp56u5t.js";
import { u as useDisplayMode } from "./use-display-mode-DdvQOhxH.js";
import { u as useMaxHeight } from "./use-max-height-CHtTYO6k.js";
import { u as useRequestDisplayMode } from "./use-request-display-mode-BeppON3Y.js";
/* empty css             */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { a as CopyButton, g as getChain, D as DebugPanel } from "./DebugPanel-BYHd6KTo.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-jKfgvg4Y.js";
import "./Button-BoXwCpzo.js";
import { D as DexterLoading } from "./DexterLoading-QVm2_ohx.js";
import { a as useCallToolFn } from "./use-call-tool-ClsA_gLD.js";
import "./use-openai-global-CD95Kk1r.js";
import "./Check-BZrRAPv_.js";
import "./Copy-CMyF_UKx.js";
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
function formatUsdc(atomic, decimals = 6) {
  const n = Number(atomic) / Math.pow(10, decimals);
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
function getExplorerUrl(tx, network) {
  if (network?.includes("8453")) return `https://basescan.org/tx/${tx}`;
  if (network?.includes("137")) return `https://polygonscan.com/tx/${tx}`;
  if (network?.includes("42161")) return `https://arbiscan.io/tx/${tx}`;
  if (network?.includes("10") && network?.includes("eip155")) return `https://optimistic.etherscan.io/tx/${tx}`;
  return `https://solscan.io/tx/${tx}`;
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
function formatSettlementTime(ms) {
  if (!ms || ms <= 0) return "";
  if (ms < 1e3) return `${ms}ms`;
  const seconds = ms / 1e3;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}
function ReceiptStamp({ data, onOpen }) {
  const settle = formatSettlementTime(data.settlementMs);
  const explorerHost = data.explorerUrl ? (() => {
    try {
      return new URL(data.explorerUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })() : "";
  const handleOpen = () => {
    if (data.explorerUrl && onOpen) onOpen(data.explorerUrl);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-stamp-block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: "dx-receipt-stamp",
        onClick: handleOpen,
        "aria-label": `Paid ${data.priceLabel}${settle ? ` in ${settle}` : ""} on ${data.networkName}. Tap to view transaction on ${explorerHost || "explorer"}.`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-receipt-stamp__core", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__paid", children: "PAID" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__amount", children: data.priceLabel || "—" }),
            settle && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__settle", children: settle }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__network", children: data.networkName || "" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__inner-ring", "aria-hidden": true }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-stamp__outer-ring", "aria-hidden": true })
        ]
      }
    ),
    data.explorerUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: "dx-receipt-stamp__link",
        onClick: handleOpen,
        children: [
          "View on ",
          explorerHost || "explorer",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: "↗" })
        ]
      }
    )
  ] });
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
function shortenUrl(url, max = 56) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    const combined = host + path;
    if (combined.length <= max) return combined;
    return combined.slice(0, max - 1) + "…";
  } catch {
    return url.length > max ? url.slice(0, max - 1) + "…" : url;
  }
}
function InstinctNextCall({ recommendation, onAct }) {
  const [visible, setVisible] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 220);
    return () => clearTimeout(t);
  }, []);
  const method = (recommendation.method || "GET").toUpperCase();
  const display = shortenUrl(recommendation.resourceUrl);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "aside",
    {
      className: `dx-instinct-next ${visible ? "is-visible" : ""}`,
      "aria-label": "Instinct recommends a next call",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-instinct-next__eyebrow", children: "Instinct · next call" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-instinct-next__body", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "dx-instinct-next__sponsor", children: recommendation.sponsor }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-instinct-next__description", children: recommendation.description }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-instinct-next__address", title: recommendation.resourceUrl, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-instinct-next__method", children: method }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-instinct-next__url", children: display })
          ] })
        ] }),
        onAct && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "dx-instinct-next__cta",
            onClick: () => onAct(recommendation.resourceUrl, method),
            children: [
              "Try this ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: "→" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-instinct-next__attribution", children: "Matched by capability, not by bid." })
      ]
    }
  );
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
const MAX_ENTRIES = 24;
function logWidgetEvent(level, tag, detail) {
  let detailStr;
  if (detail !== void 0) {
    if (typeof detail === "string") {
      detailStr = detail.length > 200 ? detail.slice(0, 197) + "…" : detail;
    } else if (detail instanceof Error) {
      detailStr = `${detail.name}: ${detail.message}`;
    } else {
      try {
        detailStr = JSON.stringify(detail).slice(0, 200);
      } catch {
        detailStr = String(detail);
      }
    }
  }
  buffer.push({ ts: Date.now(), level, tag, detail: detailStr });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[receipt:${tag}]`, detail ?? "");
}
function getWidgetLogForDebug() {
  const out = {};
  buffer.forEach((entry, i) => {
    const t = new Date(entry.ts).toISOString().slice(11, 23);
    const detail = entry.detail ? ` ${entry.detail}` : "";
    out[`evt[${i.toString().padStart(2, "0")}]`] = `${t} ${entry.level} ${entry.tag}${detail}`;
  });
  return out;
}
function FundingCountdown({ expiresAt }) {
  const [label, setLabel] = reactExports.useState("");
  reactExports.useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      if (remaining <= 0) {
        setLabel("Expired");
        return;
      }
      const mins = Math.floor(remaining / 6e4);
      const secs = Math.floor(remaining % 6e4 / 1e3);
      setLabel(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1e3);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-receipt-funding__countdown", children: [
    "Session expires in ",
    label
  ] });
}
function shortenAddress$1(addr, head = 6, tail = 4) {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
function SessionFunding({
  message,
  funding,
  expiresAt,
  retryCall,
  onOpenExternal
}) {
  const callTool = useCallToolFn();
  const walletAddress = funding?.walletAddress || funding?.payTo;
  const qrUrl = funding?.solanaPayUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(funding.solanaPayUrl)}` : null;
  reactExports.useEffect(() => {
    logWidgetEvent("info", "funding.mount", {
      hasFunding: Boolean(funding),
      walletAddress: walletAddress || null,
      hasSolanaPayUrl: Boolean(funding?.solanaPayUrl),
      solanaPayScheme: funding?.solanaPayUrl?.split(":")[0] || null,
      hasTxUrl: Boolean(funding?.txUrl),
      txUrlScheme: funding?.txUrl?.split(":")[0] || null,
      retryUrl: retryCall?.url || null,
      retryMethod: retryCall?.method || null
    });
  }, []);
  const targetUsdc = funding?.amountUsdc;
  const amountStr = typeof targetUsdc === "number" ? `$${targetUsdc.toFixed(2)} USDC` : "";
  const canRetry = Boolean(retryCall?.url);
  const [retrying, setRetrying] = reactExports.useState(false);
  const [retryError, setRetryError] = reactExports.useState(null);
  const handleRetry = async () => {
    if (!retryCall?.url || retrying) return;
    setRetrying(true);
    setRetryError(null);
    logWidgetEvent("info", "retry.tap", { url: retryCall.url, method: retryCall.method || "GET" });
    try {
      const result = await callTool("x402_fetch", {
        url: retryCall.url,
        method: retryCall.method || "GET"
      });
      logWidgetEvent("info", "retry.callTool.resolved", {
        hasResult: result != null
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Retry failed.";
      logWidgetEvent("error", "retry.callTool.threw", err);
      setRetryError(msg);
      setRetrying(false);
    }
  };
  const handleOpenExternal = (url, source) => {
    let isValid = false;
    let scheme = "";
    try {
      const parsed = new URL(url);
      scheme = parsed.protocol.replace(":", "");
      isValid = true;
    } catch {
      isValid = false;
    }
    logWidgetEvent("info", `${source}.tap`, { url, scheme, valid: isValid });
    if (!isValid) {
      logWidgetEvent("error", `${source}.url_invalid`, url);
      return;
    }
    try {
      onOpenExternal(url);
      logWidgetEvent("info", `${source}.openExternal.called`, { scheme });
    } catch (err) {
      logWidgetEvent("error", `${source}.openExternal.threw`, err);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-receipt-funding", "aria-label": "Session needs funding", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-funding__head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-funding__eyebrow", children: "Wallet · Needs funding" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-receipt-funding__headline", children: amountStr ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Send ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: amountStr }),
        " to continue."
      ] }) : "Fund your wallet to continue." }),
      message && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-receipt-funding__sub", children: message })
    ] }),
    walletAddress && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-funding__chip", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-funding__chip-label", children: "Deposit address" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "dx-receipt-funding__chip-value", title: walletAddress, children: shortenAddress$1(walletAddress, 8, 6) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: walletAddress, variant: "ghost", color: "secondary", size: "sm", children: "Copy" })
    ] }),
    qrUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-receipt-funding__qr", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrUrl, alt: "Solana Pay QR", width: 196, height: 196 }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-funding__actions", children: [
      funding?.solanaPayUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          className: "dx-receipt-funding__btn dx-receipt-funding__btn--primary",
          onClick: () => handleOpenExternal(funding.solanaPayUrl, "solanaPay"),
          children: [
            "Open in Solana Pay ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: "↗" })
          ]
        }
      ),
      funding?.txUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          className: "dx-receipt-funding__btn",
          onClick: () => handleOpenExternal(funding.txUrl, "fundingPage"),
          children: [
            "Funding page ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: "↗" })
          ]
        }
      )
    ] }),
    canRetry && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-funding__retry", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "dx-receipt-funding__retry-btn",
          onClick: handleRetry,
          disabled: retrying,
          "aria-busy": retrying,
          children: retrying ? "Trying again…" : "I've funded it — try again"
        }
      ),
      retryError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-receipt-funding__retry-error", role: "alert", children: retryError })
    ] }),
    expiresAt && /* @__PURE__ */ jsxRuntimeExports.jsx(FundingCountdown, { expiresAt })
  ] });
}
function shortenAddress(addr) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function deriveResourceLabel(payload) {
  const url = payload.url;
  if (!url) return "this endpoint";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    const combined = host + path;
    if (combined.length <= 64) return combined;
    return combined.slice(0, 63) + "…";
  } catch {
    return url.length > 64 ? url.slice(0, 63) + "…" : url;
  }
}
function ReceiptError({ message }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-receipt-error", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-receipt-error__eyebrow", children: "Error" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-receipt-error__message", children: message })
  ] });
}
function FetchResult() {
  const toolOutput = useToolOutput();
  const openExternal = useAdaptiveOpenExternal();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const containerRef = useIntrinsicHeight();
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
  const dataStr = reactExports.useMemo(
    () => toolOutput?.data !== void 0 ? JSON.stringify(toolOutput.data) : "",
    [toolOutput?.data]
  );
  const isLargePayload = dataStr.length > 500;
  const resourceLabel = reactExports.useMemo(
    () => toolOutput ? deriveResourceLabel(toolOutput) : "",
    [toolOutput]
  );
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "dx-fetch-result-frame", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptLoading, { resourceLabel: null }) });
  }
  const isSession = toolOutput.mode === "session_required";
  const isError = !!toolOutput.error && !isSession;
  const payment = toolOutput.payment;
  const auth = toolOutput.auth;
  const details = payment?.details;
  const stamp = (() => {
    if (!payment?.settled || !details?.transaction) return null;
    const networkName = details.network ? getChain(details.network).name : "";
    const priceLabel = details.requirements?.amount ? formatUsdc(details.requirements.amount, details.requirements.extra?.decimals ?? 6) : "";
    const stampMs = details.settleDurationMs ?? details.settlementMs;
    return {
      priceLabel,
      settlementMs: stampMs,
      networkName,
      txHash: details.transaction,
      explorerUrl: getExplorerUrl(details.transaction, details.network)
    };
  })();
  const accessProof = (() => {
    if (!auth?.mode || stamp) return null;
    return {
      mode: auth.mode,
      signedAddress: shortenAddress(auth.signedAddress),
      networkName: auth.network ? getChain(auth.network).name : ""
    };
  })();
  const topRec = toolOutput.recommendations?.[0];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-theme": theme,
      ref: containerRef,
      className: `dx-fetch-result-frame${isFullscreen ? " dx-fetch-result-frame--fullscreen" : ""}`,
      style: { maxHeight: isFullscreen ? void 0 : maxHeight ?? void 0 },
      children: [
        isSession ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          SessionFunding,
          {
            message: toolOutput.message,
            funding: toolOutput.sessionFunding || toolOutput.session?.funding,
            expiresAt: toolOutput.session?.expiresAt,
            retryCall: { url: toolOutput.url, method: toolOutput.method },
            onOpenExternal: openExternal
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dx-receipt", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ReceiptHeader,
            {
              resourceLabel,
              method: toolOutput.method,
              isFullscreen,
              showToggle: isLargePayload,
              onToggleFullscreen: toggleFullscreen
            }
          ),
          isError ? /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptError, { message: toolOutput.error || "Unknown error." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptBody, { data: toolOutput.data }),
            stamp ? /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptStamp, { data: stamp, onOpen: openExternal }) : accessProof ? /* @__PURE__ */ jsxRuntimeExports.jsx(AccessProof, { data: accessProof }) : null,
            topRec && /* @__PURE__ */ jsxRuntimeExports.jsx(
              InstinctNextCall,
              {
                recommendation: topRec,
                onAct: (url) => openExternal(url)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DebugPanel, { widgetName: "x402-fetch-result", extraInfo: getWidgetLogForDebug() })
      ]
    }
  );
}
const root = document.getElementById("x402-fetch-result-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-05-06.receipt-redesign");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(FetchResult, {}));
}
