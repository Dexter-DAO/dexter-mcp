import { r as reactExports, j as jsxRuntimeExports, u as useToolOutput, i as useToolInput, q as useAdaptiveSendFollowUp, a as useAdaptiveTheme, b as useAdaptiveMaxHeight } from "./adapter-BD2Wya3l.js";
/* empty css             */
import { c as clientExports } from "./client-D3-tzCZy.js";
import { u as useIntrinsicHeight } from "./useIntrinsicHeight-DwUwMVLV.js";
import "./portfolioModel-yEMSOUo4.js";
import "./AppsSDKUIContext-Bf14exO8.js";
import { p as providerImageSources, g as getChain, C as ChainIcon, a as formatAssetLabel, n as normalizeX402CheckResult, d as normalizeX402PaymentRoutes, b as purchaseReviewData, e as purchaseReviewContinuationPrompt } from "./check-result-model-S_gp3OJ4.js";
function formatHitCount(n) {
  if (typeof n !== "number" || n < 0) return "0";
  if (n < 1e3) return String(n);
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  return `${(n / 1e6).toFixed(1)}M`;
}
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
    icon ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__identity-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
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
    ) }) : null,
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
  if (!value) return "Exact payment";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function PaymentTermRow({ route }) {
  const { name: chainName } = getChain(route.network);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dx-pricing__route", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: route.network, size: 20 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__route-chain-text", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-pricing__route-chain-line", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__route-chain-name", children: schemeLabel(route.scheme) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-pricing__route-chain-asset", children: [
          formatAssetLabel(route.asset),
          " on ",
          chainName,
          route.amountAtomic ? `, ${route.amountAtomic} base units` : ""
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
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-pricing__routes-title", children: options.length === 1 ? "Seller terms" : `${options.length} seller routes` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dx-pricing__routes-list", children: options.map((route) => /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentTermRow, { route }, route.routeKey)) })
  ] });
}
function FetchAction({
  price,
  intentReady,
  disabled = false,
  status = "idle",
  onFetch
}) {
  const label = status === "sending" ? "Opening review…" : status === "sent" ? "Opened in chat" : intentReady ? "Review payment" : "Complete request";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      className: "dx-pricing__action",
      "aria-label": label,
      onClick: onFetch,
      disabled,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label }),
        price && status !== "sent" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__action-price", "aria-hidden": true, children: price }) : null
      ]
    }
  );
}
const POSITIVE_ATOMIC_AMOUNT = /^[1-9]\d{0,19}$/;
function canonicalMethod(method) {
  return String(method || "GET").toUpperCase();
}
function checkedPaymentRequest(payload, input) {
  const method = canonicalMethod(payload.checkedRequest?.method ?? input?.method);
  const rawBodyProvided = typeof input?.body === "string";
  let body = null;
  if (method !== "GET") {
    body = payload.checkedRequest?.body ?? (rawBodyProvided ? input.body : null);
  }
  return {
    url: payload.checkedRequest?.url || input?.url || "",
    method,
    body,
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
function paidContinuationPrompt(requestBound, quoteOnly, reviewData) {
  if (!requestBound) {
    return "This access check is not bound to a complete request. Ask for the exact missing request details, then call x402_check again. Do not call x402_fetch without a new server-bound intent.";
  }
  if (quoteOnly) {
    return "The current access check returned no executable purchase intent. Tell the user that purchasing is unavailable from this result. Do not call x402_fetch or ask the user to connect again.";
  }
  if (!reviewData) {
    return "This result does not contain a safe executable intent and positive payment ceiling. Run x402_check again for the exact request. Do not pay from this incomplete result.";
  }
  return purchaseReviewContinuationPrompt(reviewData);
}
function useElapsedSeconds(pending) {
  const [elapsed, setElapsed] = reactExports.useState(0);
  reactExports.useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1e3);
    return () => window.clearInterval(timer);
  }, [pending]);
  return elapsed;
}
function StateFrame({
  theme,
  maxHeight,
  children,
  containerRef,
  loading = false
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "main",
    {
      "data-theme": theme,
      ref: containerRef,
      className: `dx-pricing${loading ? " dx-pricing--loading" : ""}`,
      style: {
        maxHeight: maxHeight ?? void 0,
        overflowY: maxHeight ? "auto" : void 0
      },
      children
    }
  );
}
function StatusCopy({
  classification,
  title,
  summary
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-pricing__status", "data-state": classification, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "dx-pricing__status-title", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__status-copy", children: summary })
  ] });
}
function RequestDetails({ request }) {
  if (!request.url) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-pricing__request", "aria-label": "Checked request", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__request-method", children: request.method }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__request-url", title: request.url, children: request.url })
  ] });
}
function AccessExplanation({
  classification,
  signerAvailable
}) {
  if (classification === "siwx") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence", children: signerAvailable === false ? "OpenDexter recognized the wallet sign-in request, but no compatible signer is available here." : "The provider wants a wallet signature to establish identity. It requests no funds." });
  }
  if (classification === "apiKey") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence", children: "Provider credentials are required before access or payment terms can be verified." });
  }
  if (classification === "hybrid") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence", children: "Provider authentication must be completed before these payment terms can be used." });
  }
  return null;
}
function PricingCheck() {
  const toolOutput = useToolOutput();
  const toolInput = useToolInput();
  const sendFollowUp = useAdaptiveSendFollowUp();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const containerRef = useIntrinsicHeight();
  const loadingElapsed = useElapsedSeconds(!toolOutput);
  const [continueState, setContinueState] = reactExports.useState({ status: "idle" });
  const continuationInFlight = reactExports.useRef(false);
  const state = reactExports.useMemo(
    () => normalizeX402CheckResult(toolOutput),
    [toolOutput]
  );
  const paymentOptions = reactExports.useMemo(
    () => normalizeX402PaymentRoutes(toolOutput?.paymentOptions),
    [toolOutput?.paymentOptions]
  );
  const checkedRequest = reactExports.useMemo(
    () => toolOutput ? checkedPaymentRequest(toolOutput, toolInput) : null,
    [toolInput, toolOutput]
  );
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    continuationInFlight.current = false;
    setContinueState({ status: "idle" });
  }, [toolOutput]);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(StateFrame, { theme, maxHeight, loading: true, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-pricing__loading-mark", "aria-hidden": true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__loading-copy", children: loadingElapsed < 5 ? "Checking current access terms…" : "The provider is taking longer than expected." })
    ] });
  }
  const enrichment = toolOutput.enrichment ?? null;
  const ceilingRoute = exactCeilingRoute(paymentOptions);
  const displayedPrice = ceilingRoute?.priceFormatted ?? paymentOptions[0]?.priceFormatted ?? null;
  const requestBound = checkedRequest?.requestBound ?? false;
  const quoteOnly = state.quoteOnly;
  const reviewData = requestBound && ceilingRoute ? purchaseReviewData(toolOutput.intentId, ceilingRoute.amountAtomic) : null;
  const intentReady = Boolean(
    reviewData && !quoteOnly
  );
  const isPaidState = state.classification === "paid" || state.classification === "hybrid";
  const signerAvailable = typeof toolOutput.siwx?.signerAvailable === "boolean" ? toolOutput.siwx.signerAvailable : null;
  const handleContinue = async () => {
    if (!checkedRequest || !sendFollowUp || continuationInFlight.current || continueState.status === "sending" || continueState.status === "sent") {
      return;
    }
    continuationInFlight.current = true;
    setContinueState({ status: "sending" });
    try {
      await sendFollowUp(
        paidContinuationPrompt(
          checkedRequest.requestBound,
          quoteOnly,
          reviewData
        )
      );
      setContinueState({ status: "sent" });
    } catch {
      continuationInFlight.current = false;
      setContinueState({
        status: "error",
        message: "The payment review could not be opened in chat. No payment was made."
      });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    StateFrame,
    {
      theme,
      maxHeight,
      containerRef,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResourceIdentity,
          {
            resource: enrichment?.resource ?? null,
            fallbackUrl: checkedRequest?.url || toolInput?.url || null,
            resourceRef: toolOutput.resource
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ResourceDescription, { description: enrichment?.resource?.description ?? null }),
        isPaidState && displayedPrice ? /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-pricing__quote", "aria-label": "Current price", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__price", children: displayedPrice }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__quote-copy", children: "Current price for this exact request. No payment has been made." })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          StatusCopy,
          {
            classification: state.classification,
            title: state.title,
            summary: state.summary
          }
        ),
        checkedRequest ? /* @__PURE__ */ jsxRuntimeExports.jsx(RequestDetails, { request: checkedRequest }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AccessExplanation,
          {
            classification: state.classification,
            signerAvailable
          }
        ),
        isPaidState && paymentOptions.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(PaymentRoutes, { options: paymentOptions }) : null,
        state.classification === "paid" && checkedRequest?.url && sendFollowUp ? intentReady || !requestBound ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          FetchAction,
          {
            price: displayedPrice,
            intentReady,
            status: continueState.status,
            disabled: continueState.status === "sending" || continueState.status === "sent",
            onFetch: handleContinue
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence dx-pricing__consequence--warning", children: "These terms are informational because this check did not return an executable purchase intent. No payment can continue from this result." }) : null,
        state.classification === "error" && state.errorMessage ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence dx-pricing__consequence--error", children: state.errorMessage }) : null,
        continueState.status === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-pricing__consequence dx-pricing__consequence--error", role: "alert", children: continueState.message }) : null
      ]
    }
  );
}
const root = document.getElementById("x402-pricing-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-09-03.1");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(PricingCheck, {}));
}
