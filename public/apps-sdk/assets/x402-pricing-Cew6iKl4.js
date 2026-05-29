import { j as jsxRuntimeExports, r as reactExports, u as useToolOutput, g as useToolInput, h as useAdaptiveCallToolFn, e as useAdaptiveTheme } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { f as formatHitCount, a as formatBytes, p as pickPrimaryRun, b as pickFixInstructions, P as ProfessorDexterCard, D as DoctorDexterCard } from "./DoctorDexterCard-CNV6RBVs.js";
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Badge } from "./index-DbPowsVZ.js";
import { A as Alert } from "./Alert-Bk5IwN3Q.js";
import { u as useMaxHeight } from "./use-max-height-CHtTYO6k.js";
import { u as useSendFollowUp } from "./use-send-followup-D7SVDohc.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-jKfgvg4Y.js";
import { g as getChain, C as ChainIcon, a as CopyButton, D as DebugPanel } from "./DebugPanel-BYHd6KTo.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import "./Warning-fnh1SKl0.js";
import "./use-openai-global-CD95Kk1r.js";
import "./Check-BZrRAPv_.js";
import "./Copy-CMyF_UKx.js";
function ResourceIdentity({ resource, fallbackUrl }) {
  const name = resource?.display_name || prettyHost(resource?.host || hostFromUrl(fallbackUrl));
  const meta = buildMetaLine(resource, fallbackUrl);
  const icon = resource?.icon_url || null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__identity", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__identity-icon", children: icon ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: icon,
        alt: "",
        width: 32,
        height: 32,
        className: "dx-pricing__identity-icon-img",
        "aria-hidden": true,
        loading: "lazy"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__identity-icon-placeholder", "aria-hidden": true }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__identity-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "dx-pricing__identity-name", children: name }),
      meta ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__identity-meta", children: meta }) : null
    ] })
  ] });
}
function buildMetaLine(resource, fallbackUrl) {
  const parts = [];
  if (resource?.category) parts.push(resource.category);
  const host = resource?.host || hostFromUrl(fallbackUrl);
  if (host) parts.push(host);
  if (typeof resource?.hit_count === "number" && resource.hit_count > 0) {
    parts.push(`${formatHitCount(resource.hit_count)} calls`);
  }
  return parts.join(" · ");
}
function hostFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
function prettyHost(host) {
  if (!host) return "Unknown endpoint";
  return host.replace(/^www\./i, "");
}
function ResourceDescription({ description }) {
  if (!description) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__description", children: description });
}
function shortenAddress(addr) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function PaymentRouteRow({ option, isBest }) {
  const { name: chainName } = getChain(option.network);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `dx-pricing__route ${isBest ? "dx-pricing__route--best" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: option.network, size: 20 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain-text", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain-line", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-chain-name", children: chainName }),
          isBest ? /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "success", size: "sm", children: "Best" }) : null
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-chain-asset", children: "USDC" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-payto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-payto-addr", children: shortenAddress(option.payTo) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: option.payTo, variant: "ghost", color: "secondary", size: "sm" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-price", children: option.priceFormatted })
  ] });
}
function PaymentRoutes({ options, cheapestIndex }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-pricing__routes", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-pricing__section-title", children: "Pay via" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__routes-list", children: options.map((opt, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentRouteRow, { option: opt, isBest: i === cheapestIndex }, i)) })
  ] });
}
function ResponseShape({ run, contentType, sizeBytes }) {
  const ct = run?.response_content_type || contentType;
  const size = run?.response_size_bytes ?? sizeBytes;
  const kind = run?.response_kind ?? inferKindFromCt(ct);
  const preview = run?.response_preview ?? null;
  if (!ct && !size && !preview) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-pricing__shape", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-pricing__section-title", children: "What you'll get" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__shape-meta", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__shape-meta-kind", children: labelForKind(kind, run) }),
      typeof size === "number" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__shape-meta-sep", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__shape-meta-size", children: formatBytes(size) })
      ] }) : null
    ] }),
    preview && shouldRenderPreview(kind) ? /* @__PURE__ */ jsxRuntimeExports.jsx(ResponsePreview, { kind, preview }) : null
  ] });
}
function inferKindFromCt(ct) {
  if (!ct) return "unknown";
  const lower = ct.toLowerCase();
  if (lower.includes("json")) return "json";
  if (lower.includes("image/")) return "image";
  if (lower.includes("html")) return "html";
  if (lower.includes("event-stream")) return "stream";
  if (lower.includes("text/")) return "text";
  if (lower.includes("octet-stream")) return "binary";
  return "unknown";
}
function labelForKind(kind, run) {
  switch (kind) {
    case "json":
      return "JSON";
    case "text":
      return "Text";
    case "html":
      return "HTML";
    case "image": {
      const fmt = run?.response_image_format;
      return fmt ? `${fmt} image` : "Image";
    }
    case "stream":
      return "Streaming response";
    case "binary":
      return "Binary blob";
    case "unknown":
    default:
      return "Response";
  }
}
function shouldRenderPreview(kind) {
  return kind === "json" || kind === "text" || kind === "html";
}
function ResponsePreview({ kind, preview }) {
  const [open, setOpen] = reactExports.useState(false);
  const text = kind === "json" ? prettyJson(preview) : preview;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__preview", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setOpen((v) => !v),
        className: "dx-pricing__preview-toggle",
        "aria-expanded": open,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__preview-toggle-arrow", "data-open": open ? "1" : "0", children: "▸" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: open ? "Hide sample response" : "View sample response" })
        ]
      }
    ),
    open ? /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "dx-pricing__preview-body", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: text }) }) : null
  ] });
}
function prettyJson(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
function FetchAction({ selectedPrice, onFetch }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { color: "primary", block: true, onClick: onFetch, children: [
    "Fetch & pay",
    selectedPrice ? ` ${selectedPrice}` : ""
  ] });
}
const WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
function pickCheapestIndex(options) {
  if (!options.length) return -1;
  return options.reduce(
    (best, current, idx) => current.price < options[best].price ? idx : best,
    0
  );
}
function isFreeEndpoint(payload) {
  if (payload.free) return true;
  if (payload.requiresPayment) return false;
  const code = payload.statusCode;
  return Boolean(code && code >= 200 && code < 300);
}
function isPricingUnavailable(payload) {
  if (payload.error) return true;
  if (payload.requiresPayment && !(payload.paymentOptions || []).length) return true;
  return false;
}
function unavailableMessage(payload) {
  return payload.message || (typeof payload.error === "string" ? payload.error : void 0) || "No payment options are currently available for this endpoint.";
}
function useElapsedSeconds(pending) {
  const [elapsed, setElapsed] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1e3);
    return () => clearInterval(t);
  }, [pending]);
  return elapsed;
}
function StateFrame({
  theme,
  maxHeight,
  children,
  containerRef,
  variant = "default"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-theme": theme,
      ref: containerRef,
      className: `dx-pricing dx-pricing--${variant}`,
      style: { maxHeight: maxHeight ?? void 0, overflowY: maxHeight ? "auto" : void 0 },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Wordmark, {}),
        children
      ]
    }
  );
}
function Wordmark() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__wordmark", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: WORDMARK_URL, alt: "Dexter", className: "dx-pricing__wordmark-img" }) });
}
function PricingCheck() {
  const toolOutput = useToolOutput();
  const toolInput = useToolInput();
  const callTool = useAdaptiveCallToolFn();
  const sendFollowUp = useSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const animate = reactExports.useMemo(() => true, []);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(StateFrame, { theme, maxHeight, variant: "loading", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__state", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: loadingElapsed < 5 ? "Checking pricing…" : "Still probing endpoint — hang tight." }) }) });
  }
  if (toolOutput.authRequired) {
    const authEnrichment = toolOutput.enrichment ?? null;
    const authRecent = authEnrichment?.history?.recent ?? [];
    const authPrimary = pickPrimaryRun(authRecent);
    const authFix = pickFixInstructions(authRecent);
    const authPasses = authRecent.length ? {
      passes: authRecent.filter((r) => r.final_status === "pass").length,
      total: authRecent.length
    } : null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, containerRef, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResourceIdentity,
        {
          resource: authEnrichment?.resource ?? null,
          fallbackUrl: toolInput?.url ?? null
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: authEnrichment?.resource?.description ?? null }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Alert,
        {
          color: "warning",
          title: "Authentication required",
          description: `This endpoint requires provider authentication before the x402 payment flow.${toolOutput.message ? " " + toolOutput.message : ""}`
        }
      ),
      authPrimary ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProfessorDexterCard, { run: authPrimary, passesOfRecent: authPasses, animate }) : null,
      authFix ? /* @__PURE__ */ jsxRuntimeExports.jsx(DoctorDexterCard, { fixText: authFix, animate }) : null
    ] });
  }
  if (isPricingUnavailable(toolOutput)) {
    const errEnrichment = toolOutput.enrichment ?? null;
    const errRecent = errEnrichment?.history?.recent ?? [];
    const errPrimary = pickPrimaryRun(errRecent);
    const errFix = pickFixInstructions(errRecent);
    const errPasses = errRecent.length ? {
      passes: errRecent.filter((r) => r.final_status === "pass").length,
      total: errRecent.length
    } : null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, containerRef, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResourceIdentity,
        {
          resource: errEnrichment?.resource ?? null,
          fallbackUrl: toolInput?.url ?? null
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: errEnrichment?.resource?.description ?? null }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Alert, { color: "danger", title: "Pricing unavailable", description: unavailableMessage(toolOutput) }),
      errPrimary ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProfessorDexterCard, { run: errPrimary, passesOfRecent: errPasses, animate }) : null,
      errFix ? /* @__PURE__ */ jsxRuntimeExports.jsx(DoctorDexterCard, { fixText: errFix, animate }) : null
    ] });
  }
  if (isFreeEndpoint(toolOutput)) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResourceIdentity,
        {
          resource: toolOutput.enrichment?.resource ?? null,
          fallbackUrl: toolInput?.url ?? null
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: toolOutput.enrichment?.resource?.description ?? null }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__state", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "No payment required — this endpoint is free to use." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "success", children: "Free" })
      ] }) })
    ] });
  }
  const options = toolOutput.paymentOptions || [];
  const cheapestIndex = pickCheapestIndex(options);
  const selectedPrice = cheapestIndex >= 0 ? options[cheapestIndex].priceFormatted : null;
  const enrichment = toolOutput.enrichment ?? null;
  const recent = enrichment?.history?.recent ?? [];
  const primaryRun = pickPrimaryRun(recent);
  const fixText = pickFixInstructions(recent);
  const passesOfRecent = recent.length ? {
    passes: recent.filter((r) => r.final_status === "pass").length,
    total: recent.length
  } : null;
  const handleFetch = async () => {
    if (!toolInput?.url) return;
    await sendFollowUp({
      prompt: `Paying ${selectedPrice || "the listed price"} to call ${toolInput.url}`,
      scrollToBottom: false
    });
    await callTool("x402_fetch", {
      url: toolInput.url,
      method: toolInput.method || "GET"
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, containerRef, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ResourceIdentity,
      {
        resource: enrichment?.resource ?? null,
        fallbackUrl: toolInput?.url ?? null
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: enrichment?.resource?.description ?? null }),
    primaryRun ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProfessorDexterCard, { run: primaryRun, passesOfRecent, animate }) : null,
    fixText ? /* @__PURE__ */ jsxRuntimeExports.jsx(DoctorDexterCard, { fixText, animate }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentRoutes, { options, cheapestIndex }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ResponseShape,
      {
        run: primaryRun,
        contentType: enrichment?.resource?.response_content_type ?? null,
        sizeBytes: enrichment?.resource?.response_size_bytes ?? null
      }
    ),
    toolInput?.url ? /* @__PURE__ */ jsxRuntimeExports.jsx(FetchAction, { selectedPrice, onFetch: handleFetch }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(DebugPanel, { widgetName: "x402-pricing" })
  ] });
}
const root = document.getElementById("x402-pricing-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-05-04.1");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PricingCheck, {}));
}
