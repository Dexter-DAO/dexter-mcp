import { j as jsxRuntimeExports, r as reactExports, u as useToolOutput, i as useToolInput, e as useAdaptiveSendFollowUp, g as useAdaptiveTheme } from "./adapter-B3ynKBmf.js";
/* empty css             */
import { b as formatHitCount, a as formatAssetLabel, c as formatBytes, d as normalizeX402PaymentRoutes, p as pickPrimaryRun, e as pickFixInstructions, P as ProfessorDexterCard, D as DoctorDexterCard } from "./check-result-model-mqo9-mGV.js";
import { c as clientExports } from "./client-CGLDWKLD.js";
import { B as Badge } from "./index-C6nCFUwa.js";
import { A as Alert } from "./Alert-driVTOE8.js";
import { u as useMaxHeight } from "./use-max-height-DF742X4T.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-CaBDxNwZ.js";
import { D as DebugPanel } from "./DebugPanel-CV1cXidT.js";
import "./portfolioModel-yEMSOUo4.js";
import { B as Button } from "./Button-B7uq752z.js";
import { g as getChain, C as ChainIcon } from "./ChainIcon-BgpFhKs9.js";
import "./Warning-BlUVe1mr.js";
import "./use-openai-global-BY612iuq.js";
function ResourceIdentity({ resource, fallbackUrl, resourceRef }) {
  const refUrl = fallbackUrl || resourceUrlFrom(resourceRef);
  const name = resource?.display_name?.trim() || prettyHost(resource?.host) || hostPath(refUrl) || descriptionFrom(resourceRef) || "Unknown endpoint";
  const meta = buildMetaLine(resource, refUrl);
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
function buildMetaLine(resource, refUrl) {
  const parts = [];
  if (resource?.category) parts.push(resource.category);
  const host = resource?.host || hostFromUrl(refUrl);
  if (host) parts.push(host);
  if (typeof resource?.hit_count === "number" && resource.hit_count > 0) {
    parts.push(`${formatHitCount(resource.hit_count)} calls`);
  }
  return parts.join(" · ");
}
function resourceUrlFrom(ref) {
  if (typeof ref === "string") return ref.trim() || null;
  if (ref && typeof ref === "object") {
    const o = ref;
    if (typeof o.url === "string" && o.url.trim()) return o.url.trim();
    if (typeof o.resource === "string" && o.resource.trim()) return o.resource.trim();
  }
  return null;
}
function descriptionFrom(ref) {
  if (ref && typeof ref === "object") {
    const o = ref;
    if (typeof o.description === "string" && o.description.trim()) return o.description.trim();
  }
  return null;
}
function hostFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
function hostPath(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "");
    const path = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "";
    return `${host}${path}`;
  } catch {
    return null;
  }
}
function prettyHost(host) {
  if (!host) return null;
  return host.replace(/^www\./i, "");
}
function ResourceDescription({ description }) {
  if (!description) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__description", children: description });
}
function shortRecipient(value) {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function priceLabel(route) {
  return route.priceFormatted || `${route.amountAtomic ?? "Unknown"} atomic`;
}
function schemeLabel(value) {
  if (!value) return "x402";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function PaymentTermRow({ route }) {
  const { name: chainName } = getChain(route.network);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route dx-pricing__route--terms", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: route.network, size: 20 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain-text", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__route-chain-line", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-chain-name", children: schemeLabel(route.scheme) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-pricing__route-chain-asset", children: [
          formatAssetLabel(route.asset),
          " · ",
          chainName,
          route.amountAtomic ? ` · ${route.amountAtomic} atomic` : ""
        ] })
      ] })
    ] }),
    route.payTo ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__route-payto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-pricing__route-payto-addr", children: [
      "to ",
      shortRecipient(route.payTo)
    ] }) }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-price", children: priceLabel(route) })
  ] });
}
function PaymentRoutes({
  options
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-pricing__routes", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-pricing__section-title", children: "Current seller terms" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__routes-list", children: options.map((route) => /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentTermRow, { route }, route.routeKey)) })
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
function FetchAction({
  price,
  requestBound,
  disabled = false,
  status = "idle",
  onFetch
}) {
  const label = status === "sending" ? "Opening review…" : status === "sent" ? "Review opened in chat" : requestBound ? "Review payment" : "Review request";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { color: "primary", block: true, onClick: onFetch, disabled, children: [
    label,
    price && status !== "sent" ? ` · ${price}` : ""
  ] });
}
const WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
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
const POSITIVE_ATOMIC_AMOUNT = /^[1-9]\d{0,19}$/;
function canonicalMethod(method) {
  return String(method || "GET").toUpperCase();
}
function checkedPaymentRequest(payload, input) {
  const method = canonicalMethod(payload.checkedRequest?.method ?? input?.method);
  const sampleBodyProvided = Boolean(
    input && Object.prototype.hasOwnProperty.call(input, "sampleInputBody")
  );
  return {
    url: payload.checkedRequest?.url || input?.url || "",
    method,
    body: method === "GET" ? null : payload.checkedRequest?.body ?? (sampleBodyProvided ? JSON.stringify(input?.sampleInputBody ?? {}) : null),
    requestBound: payload.checkedRequest?.requestBound ?? (method === "GET" || sampleBodyProvided)
  };
}
function exactCeilingRoute(routes) {
  return routes.reduce((best, route) => {
    if (typeof route.amountAtomic !== "string" || !POSITIVE_ATOMIC_AMOUNT.test(route.amountAtomic)) {
      return best;
    }
    return !best || route.price < best.price ? route : best;
  }, null);
}
function sellerTerms(route) {
  const asset = formatAssetLabel(route.asset);
  const network = route.network || "the listed network";
  const recipient = route.payTo ? ` to ${route.payTo}` : "";
  return `${route.amountAtomic} atomic units of ${asset} on ${network}${recipient}`;
}
function paidContinuationPrompt(request, routes) {
  if (!request.requestBound) {
    return `Form the exact raw JSON request body for ${request.url} using ${request.method}, then run x402_check again with sampleInputBody before asking me to approve a payment. Do not pay from this indicative quote.`;
  }
  const route = exactCeilingRoute(routes);
  if (!route?.amountAtomic) {
    return `Run x402_check again for the exact ${request.method} request to ${request.url} and obtain a current positive atomic amount before asking me to approve a payment. Do not pay from this incomplete quote.`;
  }
  const bodyDescription = request.body === null ? "no request body" : `raw JSON body ${request.body}`;
  const fetchBody = request.body === null ? "no body" : `body ${request.body}`;
  return `Review payment for ${request.url}. Exact request: ${request.method} with ${bodyDescription}. Current seller terms: ${sellerTerms(route)}. The approval ceiling is maxAmountAtomic ${route.amountAtomic}. Ask for my confirmation before paying. After I confirm, call x402_fetch once with url ${request.url}, method ${request.method}, ${fetchBody}, and maxAmountAtomic ${route.amountAtomic}. Do not retry automatically if the outcome is ambiguous or the request was dispatched.`;
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
  const sendFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);
  const paymentOptions = reactExports.useMemo(
    () => normalizeX402PaymentRoutes(toolOutput?.paymentOptions),
    [toolOutput?.paymentOptions]
  );
  const checkedRequest = reactExports.useMemo(
    () => toolOutput ? checkedPaymentRequest(toolOutput, toolInput) : null,
    [toolInput, toolOutput]
  );
  const [continueState, setContinueState] = reactExports.useState({ status: "idle" });
  const continuationInFlight = reactExports.useRef(false);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    continuationInFlight.current = false;
    setContinueState({ status: "idle" });
  }, [toolOutput]);
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
          fallbackUrl: toolInput?.url ?? null,
          resourceRef: toolOutput.resource
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
          fallbackUrl: toolInput?.url ?? null,
          resourceRef: toolOutput.resource
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
          fallbackUrl: toolInput?.url ?? null,
          resourceRef: toolOutput.resource
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: toolOutput.enrichment?.resource?.description ?? null }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__state", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "No payment required — this endpoint is free to use." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { color: "success", children: "Free" })
      ] }) })
    ] });
  }
  const ceilingRoute = exactCeilingRoute(paymentOptions);
  const displayedPrice = ceilingRoute?.priceFormatted ?? paymentOptions[0]?.priceFormatted ?? null;
  const requestBound = checkedRequest?.requestBound ?? false;
  const enrichment = toolOutput.enrichment ?? null;
  const recent = enrichment?.history?.recent ?? [];
  const primaryRun = pickPrimaryRun(recent);
  const fixText = pickFixInstructions(recent);
  const passesOfRecent = recent.length ? {
    passes: recent.filter((r) => r.final_status === "pass").length,
    total: recent.length
  } : null;
  const handleContinue = async () => {
    if (!checkedRequest?.url || !sendFollowUp || continuationInFlight.current || continueState.status === "sending" || continueState.status === "sent") {
      return;
    }
    continuationInFlight.current = true;
    setContinueState({ status: "sending" });
    try {
      await sendFollowUp(
        paidContinuationPrompt(checkedRequest, paymentOptions)
      );
      setContinueState({ status: "sent" });
    } catch {
      continuationInFlight.current = false;
      setContinueState({
        status: "error",
        message: "Couldn’t open the review in chat. Try again."
      });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, containerRef, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ResourceIdentity,
      {
        resource: enrichment?.resource ?? null,
        fallbackUrl: toolInput?.url ?? null,
        resourceRef: toolOutput.resource
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: enrichment?.resource?.description ?? null }),
    primaryRun ? /* @__PURE__ */ jsxRuntimeExports.jsx(ProfessorDexterCard, { run: primaryRun, passesOfRecent, animate }) : null,
    fixText ? /* @__PURE__ */ jsxRuntimeExports.jsx(DoctorDexterCard, { fixText, animate }) : null,
    paymentOptions.length ? /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentRoutes, { options: paymentOptions }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      Alert,
      {
        color: "warning",
        title: "Current seller terms unavailable",
        description: "Run x402_check again before asking for payment approval."
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ResponseShape,
      {
        run: primaryRun,
        contentType: enrichment?.resource?.response_content_type ?? null,
        sizeBytes: enrichment?.resource?.response_size_bytes ?? null
      }
    ),
    checkedRequest?.url && sendFollowUp ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FetchAction,
        {
          price: displayedPrice,
          requestBound,
          status: continueState.status,
          disabled: continueState.status === "sending" || continueState.status === "sent",
          onFetch: handleContinue
        }
      ),
      continueState.status === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        Alert,
        {
          color: "danger",
          title: "Couldn’t open chat",
          description: continueState.message
        }
      ) : null
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(DebugPanel, { widgetName: "x402-pricing" })
  ] });
}
const root = document.getElementById("x402-pricing-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-07-26.2");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PricingCheck, {}));
}
