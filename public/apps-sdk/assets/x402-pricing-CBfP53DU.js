import { r as reactExports, j as jsxRuntimeExports, u as useToolOutput, i as useToolInput, g as useAdaptiveSendFollowUp, b as useAdaptiveTheme } from "./adapter-C5lR_HvA.js";
/* empty css             */
import { p as providerImageSources, b as formatHitCount, a as formatAssetLabel, c as formatBytes, d as normalizeX402PaymentRoutes, e as pickPrimaryRun, g as pickFixInstructions, P as ProfessorDexterCard, D as DoctorDexterCard } from "./check-result-model-CL0kSTQ6.js";
import { c as clientExports } from "./client-C1-6VL7X.js";
import { B as Badge } from "./index-Ds3NBCUE.js";
import { A as Alert } from "./Alert-DZzDQXHr.js";
import { u as useMaxHeight } from "./use-max-height-DwvblLE2.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-DnKt_gDh.js";
import { D as DebugPanel } from "./DebugPanel-BZZdbZWZ.js";
import "./portfolioModel-yEMSOUo4.js";
import "./AppsSDKUIContext-kOv6-Y3A.js";
import { g as getChain, C as ChainIcon } from "./ChainIcon-DTCLxhdk.js";
import { B as Button } from "./Button-vSLM53YF.js";
import "./Warning-BtVBT-hC.js";
import "./use-openai-global-DwA6iG8U.js";
function ResourceIdentity({ resource, fallbackUrl, resourceRef }) {
  const refUrl = fallbackUrl || resourceUrlFrom(resourceRef);
  const name = resource?.display_name?.trim() || prettyHost(resource?.host) || hostPath(refUrl) || descriptionFrom(resourceRef) || "Unknown endpoint";
  const meta = buildMetaLine(resource, refUrl);
  const sources = reactExports.useMemo(() => providerImageSources({
    iconUrl: resource?.icon_url,
    resourceUrl: resource?.resource_url || refUrl
  }), [resource?.icon_url, resource?.resource_url, refUrl]);
  const sourceKey = sources.join("\n");
  const [loadState, setLoadState] = reactExports.useState({
    sourceKey: "",
    attempt: 0
  });
  const attempt = loadState.sourceKey === sourceKey ? loadState.attempt : 0;
  const icon = sources[attempt] || null;
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
        loading: "lazy",
        onError: () => {
          setLoadState((current) => ({
            sourceKey,
            attempt: current.sourceKey === sourceKey ? current.attempt + 1 : 1
          }));
        }
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
  intentReady,
  disabled = false,
  status = "idle",
  onFetch
}) {
  const label = status === "sending" ? "Opening review…" : status === "sent" ? "Review opened in chat" : intentReady ? "Review payment" : "Connect & re-check";
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
  const rawBodyProvided = typeof input?.body === "string";
  return {
    url: payload.checkedRequest?.url || input?.url || "",
    method,
    body: method === "GET" ? null : payload.checkedRequest?.body ?? (rawBodyProvided ? input.body : null),
    requestBound: payload.checkedRequest?.requestBound ?? (method === "GET" || rawBodyProvided)
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
function paidContinuationPrompt(request, routes, intentId, quoteOnly) {
  if (quoteOnly || !intentId || !request.requestBound) {
    const exactRequest = request.url ? `url ${request.url}, method ${request.method}` : "the same URL and method";
    const bodyInstruction = request.method === "GET" ? "and omit body" : request.body === null ? "and first form the exact raw body string required for the request" : `and pass body as the exact raw string ${JSON.stringify(request.body)}`;
    return `Connect OpenDexter, then repeat x402_check with ${exactRequest} ${bodyInstruction}. Use the authenticated re-check only if it returns a non-quote-only intentId. Do not call x402_fetch from this quote.`;
  }
  const route = exactCeilingRoute(routes);
  if (!route?.amountAtomic) {
    return `Run x402_check again for the exact ${request.method} request to ${request.url} and obtain a current positive atomic amount before authorizing any payment. Do not pay from this incomplete quote.`;
  }
  const bodyDescription = request.body === null ? "no request body" : `raw JSON body ${request.body}`;
  return `Review payment for ${request.url}. Exact request: ${request.method} with ${bodyDescription}. Current seller terms: ${sellerTerms(route)}. The execution ceiling is maxAmountAtomic ${route.amountAtomic}. Confirm whether my current instruction or a bounded delegated policy already authorizes this exact seller, request, and ceiling. If it does, do not ask again; otherwise ask only for the missing authority. Once covered, call x402_fetch once with only intentId ${intentId} and maxAmountAtomic ${route.amountAtomic}. Do not include URL, method, body, route, payee, asset, challenge, or prepared purchase data. If the outcome is preparing or ambiguous, call x402_status with only intentId ${intentId}; do not call x402_fetch again.`;
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
  const intentId = typeof toolOutput.intentId === "string" && toolOutput.intentId.trim() ? toolOutput.intentId.trim() : null;
  const quoteOnly = toolOutput.quoteOnly === true || intentId === null;
  const intentReady = Boolean(intentId && !quoteOnly && requestBound && ceilingRoute?.amountAtomic);
  const enrichment = toolOutput.enrichment ?? null;
  const recent = enrichment?.history?.recent ?? [];
  const primaryRun = pickPrimaryRun(recent);
  const fixText = pickFixInstructions(recent);
  const passesOfRecent = recent.length ? {
    passes: recent.filter((r) => r.final_status === "pass").length,
    total: recent.length
  } : null;
  const handleContinue = async () => {
    if (!checkedRequest || !sendFollowUp || continuationInFlight.current || continueState.status === "sending" || continueState.status === "sent") {
      return;
    }
    continuationInFlight.current = true;
    setContinueState({ status: "sending" });
    try {
      await sendFollowUp(
        paidContinuationPrompt(
          checkedRequest,
          paymentOptions,
          intentId,
          quoteOnly
        )
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
        description: "Run x402_check again before any payment review."
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
          intentReady,
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
