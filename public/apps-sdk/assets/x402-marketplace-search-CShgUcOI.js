import { j as jsxRuntimeExports, r as reactExports, d as addWidgetBreadcrumb, b as captureWidgetException, u as useToolOutput, e as useAdaptiveTheme } from "./adapter-Cqp56u5t.js";
/* empty css             */
import { P as ProfessorDexterCard, D as DoctorDexterCard } from "./DoctorDexterCard-CNV6RBVs.js";
/* empty css                        */
import { c as clientExports } from "./client-DVhZ5jh_.js";
import { B as Button } from "./Button-BoXwCpzo.js";
import { S as Search } from "./Search-wAJIDm_v.js";
import { W as Warning } from "./Warning-fnh1SKl0.js";
import { E as EmptyMessage } from "./EmptyMessage-CHDmduY1.js";
import { u as useDisplayMode } from "./use-display-mode-DdvQOhxH.js";
import { u as useMaxHeight } from "./use-max-height-CHtTYO6k.js";
import { a as useCallToolFn } from "./use-call-tool-ClsA_gLD.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CD95Kk1r.js";
import { C as ChainIcon, U as UsdcIcon, a as CopyButton, D as DebugPanel } from "./DebugPanel-BYHd6KTo.js";
import { D as DexterLoading } from "./DexterLoading-QVm2_ohx.js";
import "./Check-BZrRAPv_.js";
import "./Copy-CMyF_UKx.js";
function useToolInput() {
  return useOpenAIGlobal("toolInput");
}
function useUserAgent() {
  return useOpenAIGlobal("userAgent");
}
const GOOGLE_COLORS = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC05",
  green: "#34A853"
};
const X402GLE_COLORS = [
  GOOGLE_COLORS.blue,
  // x
  GOOGLE_COLORS.red,
  // 4
  GOOGLE_COLORS.yellow,
  // 0
  GOOGLE_COLORS.blue,
  // 2
  GOOGLE_COLORS.green,
  // g
  GOOGLE_COLORS.red,
  // l
  GOOGLE_COLORS.yellow
  // e
];
const DEXTER_GLYPH_URL = "https://dexter.cash/assets/pokedexter/dexter-logo.svg";
const DEXTER_WORDMARK_URL = "https://dexter.cash/wordmarks/dexter-wordmark.svg";
function X402gleLockup({ size = "sm", showBeta = false }) {
  const text = "x402gle";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-x402gle-lockup", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `dx-x402gle-lockup__wordmark dx-x402gle-lockup__wordmark--${size}`, "aria-label": "x402gle", children: text.split("").map((char, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: X402GLE_COLORS[i] }, children: char }, i)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-x402gle-lockup__by", children: [
      showBeta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-x402gle-lockup__beta", children: "beta" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-x402gle-lockup__by-label", children: "by" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "a",
        {
          href: "https://dexter.cash",
          target: "_blank",
          rel: "noopener noreferrer",
          className: "dx-x402gle-lockup__by-link",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: DEXTER_GLYPH_URL,
                alt: "",
                className: "dx-x402gle-lockup__dexter-glyph",
                "aria-hidden": true
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: DEXTER_WORDMARK_URL,
                alt: "Dexter",
                className: "dx-x402gle-lockup__dexter-wordmark"
              }
            )
          ]
        }
      )
    ] })
  ] });
}
function MarketplaceSummaryHeader({
  resultCount,
  strongCount,
  relatedCount,
  rerankApplied = false,
  isFullscreen,
  onToggleFullscreen
}) {
  const hasTieredCounts = typeof strongCount === "number" && typeof relatedCount === "number";
  const tierLabel = hasTieredCounts ? `${strongCount} strong · ${relatedCount} related` : `${resultCount.toLocaleString()} result${resultCount !== 1 ? "s" : ""}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-header", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-header__brand", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X402gleLockup, { size: "sm", showBeta: true }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-header__meta", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-header__count", children: tierLabel }),
      rerankApplied && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: "dx-search-header__reranked",
          title: "Top results reordered by an LLM cross-encoder pass",
          children: "reranked"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "dx-search-header__expand",
          onClick: onToggleFullscreen,
          children: isFullscreen ? "minimize" : "expand"
        }
      )
    ] })
  ] });
}
function formatCompactNumber(value) {
  if (value == null || Number.isNaN(value)) return "0";
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}
function shortenUrl(url) {
  try {
    const parsed = new URL(url);
    const compactPath = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    return compactPath.length > 72 ? `${compactPath.slice(0, 69)}...` : compactPath;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return shortenUrl(url);
  }
}
function looksLikeWalletFragment(label, payTo) {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (payTo && trimmed === payTo.slice(0, trimmed.length)) return true;
  if (/^(0x[a-fA-F0-9]{6,}|[1-9A-HJ-NP-Za-km-z]{8,})$/.test(trimmed) && !/\s/.test(trimmed)) return true;
  return false;
}
function providerDisplayName(resource) {
  const sellerName = resource.sellerMeta.displayName?.trim() || resource.seller?.trim() || "";
  if (sellerName && !looksLikeWalletFragment(sellerName, resource.sellerMeta.payTo)) {
    return sellerName;
  }
  return hostLabel(resource.url);
}
function resourceIconUrl(resource) {
  if (resource.iconUrl) return resource.iconUrl;
  try {
    const hostname = new URL(resource.url).hostname;
    return `https://dexter.cash/api/favicon?domain=${encodeURIComponent(hostname)}`;
  } catch {
    return resource.sellerMeta.logoUrl || "";
  }
}
function SearchIdentityIcon({ resource, size = 44 }) {
  const sources = reactExports.useMemo(() => {
    const list = [];
    if (resource.iconUrl) list.push(resource.iconUrl);
    if (resource.sellerMeta?.logoUrl) list.push(resource.sellerMeta.logoUrl);
    const proxied = resourceIconUrl(resource);
    if (proxied && !list.includes(proxied)) list.push(proxied);
    return list;
  }, [resource]);
  const [attempt, setAttempt] = reactExports.useState(0);
  const currentSrc = sources[attempt];
  const allFailed = attempt >= sources.length;
  if (!currentSrc || allFailed) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(UnsignedMark, { size });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: currentSrc,
      alt: "",
      width: size,
      height: size,
      className: "dx-search-identity__img",
      style: { width: size, height: size },
      onError: () => setAttempt((a) => a + 1),
      "aria-hidden": "true"
    }
  );
}
function UnsignedMark({ size }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "dx-search-identity__unsigned",
      style: { width: size, height: size },
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 44 44", width: size, height: size, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "dx-id-grad", x1: "0", y1: "0", x2: "1", y2: "1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "rgba(255,255,255,0.06)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "rgba(255,255,255,0.02)" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "0", y: "0", width: "44", height: "44", rx: "14", fill: "url(#dx-id-grad)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "rect",
          {
            x: "6",
            y: "6",
            width: "32",
            height: "32",
            rx: "10",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1",
            opacity: "0.18"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "path",
          {
            d: "M22 12 L32 22 L22 32 L12 22 Z",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.2",
            strokeLinejoin: "round",
            opacity: "0.32"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "22", cy: "22", r: "2.6", fill: "currentColor", opacity: "0.42" })
      ] })
    }
  );
}
function synthesizeRunFromResource(resource) {
  const score = resource.qualityScore;
  const notes = resource.verificationNotes ?? null;
  const status = resource.verificationStatus ?? null;
  const verifiedAt = resource.lastVerifiedAt ?? null;
  const hasNotes = typeof notes === "string" && notes.trim().length > 0;
  if (!hasNotes) return null;
  return {
    attempted_at: verifiedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    completed_at: verifiedAt,
    duration_ms: null,
    paid: false,
    payment_network: null,
    payment_tx_signature: null,
    probe_status: null,
    probe_error: null,
    response_status: null,
    response_size_bytes: null,
    response_content_type: null,
    response_preview: null,
    response_kind: "unknown",
    response_image_format: null,
    response_image_bytes_persisted: false,
    ai_model: null,
    ai_score: typeof score === "number" ? score : null,
    ai_status: status,
    ai_notes: notes,
    ai_fix_instructions: resource.verificationFixInstructions ?? null,
    final_status: status ?? "unknown",
    skip_reason: null,
    initiator: "search"
  };
}
function SearchVerdictRow({
  resource,
  index,
  featured = false,
  selected = false,
  onInspect,
  onCheckPrice,
  onFetch
}) {
  const [visible, setVisible] = reactExports.useState(false);
  const [checking, setChecking] = reactExports.useState(false);
  const [fetching, setFetching] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50 + index * 35);
    return () => clearTimeout(t);
  }, [index]);
  async function handleCheckPrice(e) {
    e.stopPropagation();
    setChecking(true);
    try {
      await onCheckPrice(resource);
    } finally {
      setChecking(false);
    }
  }
  async function handleFetch(e) {
    e.stopPropagation();
    setFetching(true);
    try {
      await onFetch(resource);
    } finally {
      setFetching(false);
    }
  }
  providerDisplayName(resource);
  const host = hostLabel(resource.url);
  const chainOptions = resource.chains?.length ? resource.chains : [{ network: resource.network ?? null }];
  const visibleChainOptions = chainOptions.filter((chain, chainIndex, list) => {
    const key = chain.network ?? "unknown";
    return list.findIndex((item) => (item.network ?? "unknown") === key) === chainIndex;
  });
  const fetchPriceLabel = resource.price === "free" ? "Free" : resource.price.replace(/^\$/, "");
  const tier = resource.tier;
  const gamingSuspicious = resource.gamingSuspicious === true;
  const synthRun = synthesizeRunFromResource(resource);
  const hasFix = synthRun?.ai_fix_instructions && synthRun.ai_status !== "pass" && (synthRun.ai_score == null || synthRun.ai_score < 75);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `dx-search-cell ${visible ? "dx-search-cell--visible" : ""} ${selected ? "dx-search-cell--selected" : ""} ${featured ? "dx-search-cell--featured" : ""}`,
      onClick: () => onInspect(resource),
      role: "button",
      tabIndex: 0,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__identity", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SearchIdentityIcon, { resource, size: 44 }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__identity-text", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "dx-search-cell__name", children: resource.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__meta", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__host", children: host }),
              resource.verified && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-cell__badge dx-search-cell__badge--verified", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon, {}),
                " verified"
              ] }),
              gamingSuspicious && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__badge dx-search-cell__badge--warn", children: "⚠ flagged" }),
              tier === "strong" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__tier", children: "strong" }),
              resource.totalCalls > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-cell__usage", children: [
                formatCompactNumber(resource.totalCalls),
                " calls"
              ] })
            ] })
          ] })
        ] }),
        resource.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-search-cell__description", children: resource.description }),
        synthRun && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ProfessorDexterCard,
          {
            run: synthRun,
            passesOfRecent: null,
            animate: false
          }
        ),
        hasFix && synthRun?.ai_fix_instructions && /* @__PURE__ */ jsxRuntimeExports.jsx(
          DoctorDexterCard,
          {
            fixText: synthRun.ai_fix_instructions,
            animate: false
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__footer", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__chains", children: [
            visibleChainOptions.map((chain, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__chain", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChainIcon, { network: chain.network, size: 16 }) }, `${chain.network ?? "x"}-${i}`)),
            resource.authRequired && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "dx-search-cell__auth",
                title: resource.authHint || "Provider authentication required.",
                children: "auth"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-cell__actions", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                variant: "soft",
                color: "secondary",
                size: "sm",
                onClick: handleCheckPrice,
                disabled: checking,
                children: checking ? "Checking…" : "Check price"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                color: "primary",
                size: "sm",
                onClick: handleFetch,
                disabled: fetching,
                className: "dx-search-cell__fetch",
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-cell__fetch-content", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: fetching ? "Fetching…" : "Fetch" }),
                  !fetching && resource.price !== "free" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(UsdcIcon, { size: 14 }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__fetch-price", children: fetchPriceLabel })
                  ] }),
                  !fetching && resource.price === "free" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-cell__fetch-price", children: fetchPriceLabel })
                ] })
              }
            )
          ] })
        ] })
      ]
    }
  );
}
function CheckIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 12 12", width: 10, height: 10, "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "path",
    {
      d: "M2 6.5 L5 9 L10 3.5",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
function MarketBoardLoading({ query }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    DexterLoading,
    {
      eyebrow: "x402gle · MARKET BOARD",
      logoSrc: "https://x402gle.com/x-final-transparent.png",
      logoAlt: "x402gle",
      stages: [
        {
          upTo: 4,
          heading: "Surveying the market…",
          supporting: "Ranking paid APIs, trust signals, and recent verifier passes."
        },
        {
          upTo: 9,
          heading: "Cross-referencing verifier history…",
          supporting: "Pulling AI grades, payment routes, and seller reputation per match."
        },
        {
          upTo: 16,
          heading: "Re-ranking strong matches…",
          supporting: "Cross-encoder is reordering the top candidates."
        },
        {
          upTo: Infinity,
          heading: "Still in flight — long-tail catalog is slow tonight.",
          supporting: "The capability index is still working through this query. Holding."
        }
      ],
      context: query || null,
      contextLabel: "query"
    }
  );
}
const API_ORIGIN = "https://api.dexter.cash";
function SearchVerdictDrawer({ resource, onClose, onCheckPrice, onFetch }) {
  const [payload, setPayload] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [activeRunIndex, setActiveRunIndex] = reactExports.useState(0);
  const carouselRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveRunIndex(0);
    async function load() {
      try {
        addWidgetBreadcrumb("drawer_fetch_start", { url: resource.url });
        const url = `${API_ORIGIN}/api/x402/resource?url=${encodeURIComponent(resource.url)}&history=3&full_previews=1`;
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        setPayload(json);
        addWidgetBreadcrumb("drawer_fetch_success", {
          url: resource.url,
          historyCount: json.history?.recent?.length ?? 0
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load resource detail");
        captureWidgetException(err, { phase: "drawer_fetch", url: resource.url });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resource.url]);
  const runs = payload?.history?.recent ?? [];
  const summary = payload?.history?.summary ?? null;
  const accepts = payload?.resource?.accepts ?? [];
  reactExports.useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || runs.length <= 1) return;
    const slides = Array.from(carousel.querySelectorAll("[data-slide-idx]"));
    if (!slides.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const idx = parseInt(visible[0].target.getAttribute("data-slide-idx") ?? "0", 10);
          setActiveRunIndex(idx);
        }
      },
      { root: carousel, threshold: [0.5, 0.75, 1] }
    );
    slides.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [runs.length]);
  const scrollToSlide = (index) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const slides = carousel.querySelectorAll("[data-slide-idx]");
    const target = slides[index];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__identity", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SearchIdentityIcon, { resource, size: 48 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__identity-text", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "dx-search-drawer__name", children: resource.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-drawer__host", children: resource.url })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: "dx-search-drawer__close",
          onClick: () => void onClose(),
          "aria-label": "Close detail",
          children: "✕"
        }
      )
    ] }),
    resource.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-search-drawer__description", children: resource.description }),
    loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-drawer__loading-spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading verifier history…" })
    ] }),
    error && !loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__error", children: [
      "Couldn't load the deeper detail — ",
      error
    ] }),
    summary && summary.total > 0 && !loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__summary-label", children: "Recent runs" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-drawer__summary-stat", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: summary.passes }),
        " passed"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__summary-sep", children: "·" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-drawer__summary-stat", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: summary.fails }),
        " failed"
      ] }),
      typeof summary.median_duration_ms === "number" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__summary-sep", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-drawer__summary-stat", children: [
          "median ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: formatDuration(summary.median_duration_ms) })
        ] })
      ] })
    ] }),
    runs.length > 0 && !loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__carousel-section", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: carouselRef, className: "dx-search-drawer__carousel", children: runs.map((run, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          "data-slide-idx": i,
          className: "dx-search-drawer__slide",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RunCard, { run, runNumber: i + 1, totalRuns: runs.length })
        },
        run.attempted_at + i
      )) }),
      runs.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-drawer__dots", children: runs.map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          className: `dx-search-drawer__dot ${i === activeRunIndex ? "dx-search-drawer__dot--active" : ""}`,
          onClick: () => scrollToSlide(i),
          "aria-label": `Go to run ${i + 1}`
        },
        i
      )) })
    ] }),
    accepts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__chains", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-drawer__chains-label", children: "Payment routes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "dx-search-drawer__chains-list", children: accepts.map((accept, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "dx-search-drawer__chain-row", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__chain-network", children: shortenNetwork(accept.network) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__chain-price", children: formatChainPrice(accept.amount, accept.extra?.decimals) })
      ] }, i)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CopyButton, { copyValue: resource.url, variant: "ghost", color: "secondary", size: "sm", children: "Copy URL" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__footer-actions", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "soft",
            color: "secondary",
            size: "sm",
            onClick: (e) => {
              e.stopPropagation();
              void onCheckPrice(resource);
            },
            children: "Check price"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            color: "primary",
            size: "sm",
            onClick: (e) => {
              e.stopPropagation();
              void onFetch(resource);
            },
            children: [
              "Fetch · ",
              resource.price === "free" ? "Free" : resource.price
            ]
          }
        )
      ] })
    ] })
  ] });
}
function RunCard({ run, runNumber, totalRuns }) {
  const hasFix = run.ai_fix_instructions && run.ai_status !== "pass" && (run.ai_score == null || run.ai_score < 75);
  const responseStatus = run.response_status;
  const responseSize = run.response_size_bytes;
  const responseKind = run.response_kind;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__run", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__run-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "dx-search-drawer__run-marker", children: [
        "run ",
        runNumber,
        " of ",
        totalRuns
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__run-status", children: run.final_status })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ProfessorDexterCard, { run, passesOfRecent: null, animate: false }),
    hasFix && run.ai_fix_instructions && /* @__PURE__ */ jsxRuntimeExports.jsx(DoctorDexterCard, { fixText: run.ai_fix_instructions, animate: false }),
    (responseStatus !== null || responseSize) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-search-drawer__shape", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__shape-key", children: "Response" }),
      responseStatus !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__shape-val", children: responseStatus }),
      responseKind !== "unknown" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__shape-val", children: responseKind }),
      typeof responseSize === "number" && responseSize > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__shape-val", children: formatBytes(responseSize) })
    ] }),
    responseKind === "image" && run.response_image_bytes_persisted && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-search-drawer__image-preview", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-search-drawer__image-format", children: run.response_image_format ?? "image" }) })
  ] });
}
function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1e3) return `${ms}ms`;
  return `${(ms / 1e3).toFixed(1)}s`;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function shortenNetwork(network) {
  if (!network) return "—";
  const [family, ref] = network.split(":");
  if (!family) return network;
  if (family === "solana") return "Solana";
  if (family === "algorand") return "Algorand";
  if (family === "stellar") return "Stellar";
  if (family === "eip155") {
    if (ref === "8453") return "Base";
    if (ref === "137") return "Polygon";
    if (ref === "42161") return "Arbitrum";
    if (ref === "10") return "Optimism";
    if (ref === "43114") return "Avalanche";
    if (ref === "56") return "BNB";
    if (ref === "1") return "Ethereum";
    return `EVM ${ref}`;
  }
  return family;
}
function formatChainPrice(amount, decimals = 6) {
  if (!amount) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const usd = n / Math.pow(10, decimals);
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
function normalizeSearchResource(resource) {
  const sellerValue = resource.seller;
  const sellerMeta = resource.sellerMeta ?? {
    payTo: null,
    displayName: null,
    logoUrl: null,
    twitterHandle: null
  };
  if (sellerValue && typeof sellerValue === "object") {
    const sellerObj = sellerValue;
    return {
      ...resource,
      seller: typeof sellerObj.displayName === "string" ? sellerObj.displayName : null,
      sellerMeta: {
        payTo: typeof sellerObj.payTo === "string" ? sellerObj.payTo : sellerMeta.payTo ?? null,
        displayName: typeof sellerObj.displayName === "string" ? sellerObj.displayName : sellerMeta.displayName ?? null,
        logoUrl: typeof sellerObj.logoUrl === "string" ? sellerObj.logoUrl : sellerMeta.logoUrl ?? null,
        twitterHandle: typeof sellerObj.twitterHandle === "string" ? sellerObj.twitterHandle : sellerMeta.twitterHandle ?? null
      }
    };
  }
  return {
    ...resource,
    seller: typeof sellerValue === "string" ? sellerValue : null,
    sellerMeta
  };
}
function normalizeSearchPayload(payload) {
  if (!payload) return payload;
  const resources = Array.isArray(payload.resources) ? payload.resources.map(normalizeSearchResource) : [];
  const strongResults = Array.isArray(payload.strongResults) ? payload.strongResults.map(normalizeSearchResource) : void 0;
  const relatedResults = Array.isArray(payload.relatedResults) ? payload.relatedResults.map(normalizeSearchResource) : void 0;
  return {
    ...payload,
    resources,
    strongResults,
    relatedResults
  };
}
function MarketplaceSearch() {
  const toolOutput = useToolOutput();
  const toolInput = useToolInput();
  const theme = useAdaptiveTheme();
  const maxHeight = useMaxHeight();
  const displayMode = useDisplayMode();
  const userAgent = useUserAgent();
  const isMobile = userAgent?.device?.type === "mobile";
  const callTool = useCallToolFn();
  const isFullscreen = displayMode === "fullscreen";
  const [liveResult, setLiveResult] = reactExports.useState(null);
  const [isSearching, setIsSearching] = reactExports.useState(false);
  const activeOutput = reactExports.useMemo(
    () => normalizeSearchPayload(liveResult ?? toolOutput),
    [liveResult, toolOutput]
  );
  const externalQuery = toolInput?.query ?? "";
  const [queryDraft, setQueryDraft] = reactExports.useState(externalQuery);
  const [selectedUrl, setSelectedUrl] = reactExports.useState(void 0);
  const [detailOpen, setDetailOpen] = reactExports.useState(false);
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  reactExports.useEffect(() => {
    if (!liveResult) {
      setQueryDraft(externalQuery);
    }
  }, [externalQuery, liveResult]);
  reactExports.useEffect(() => {
    if (!activeOutput) return;
    addWidgetBreadcrumb("search_payload_normalized", {
      count: Array.isArray(activeOutput.resources) ? activeOutput.resources.length : 0
    });
  }, [activeOutput]);
  const strongResults = activeOutput?.strongResults ?? [];
  const relatedResults = activeOutput?.relatedResults ?? [];
  const hasTieredShape = strongResults.length > 0 || relatedResults.length > 0;
  const resources = hasTieredShape ? [...strongResults, ...relatedResults] : activeOutput?.resources ?? [];
  const strongCount = activeOutput?.strongCount ?? strongResults.length;
  const relatedCount = activeOutput?.relatedCount ?? relatedResults.length;
  const rerankApplied = activeOutput?.rerank?.applied === true;
  const noMatchReason = activeOutput?.noMatchReason ?? null;
  const searchMode = activeOutput?.searchMeta?.mode ?? "none";
  const searchNote = activeOutput?.searchMeta?.note ?? "";
  const effectiveSelectedUrl = reactExports.useMemo(() => {
    if (selectedUrl && resources.some((resource) => resource.url === selectedUrl)) {
      return selectedUrl;
    }
    return resources[0]?.url;
  }, [resources, selectedUrl]);
  const selectedResource = reactExports.useMemo(
    () => resources.find((resource) => resource.url === effectiveSelectedUrl) ?? resources[0] ?? null,
    [effectiveSelectedUrl, resources]
  );
  const runCheckPrice = reactExports.useCallback(async (resource) => {
    addWidgetBreadcrumb("check_price_clicked", { url: resource.url, method: resource.method });
    await callTool("x402_check", { url: resource.url, method: resource.method || "GET" });
  }, [callTool]);
  const runFetch = reactExports.useCallback(async (resource) => {
    addWidgetBreadcrumb("fetch_clicked", { url: resource.url, method: resource.method });
    await callTool("x402_fetch", { url: resource.url, method: resource.method || "GET" });
  }, [callTool]);
  const handleInspectResource = reactExports.useCallback(async (resource) => {
    addWidgetBreadcrumb("inspect_opened", { url: resource.url, resourceId: resource.resourceId });
    setSelectedUrl(resource.url);
    setDetailOpen(true);
  }, []);
  const handleCloseDetail = reactExports.useCallback(async () => {
    addWidgetBreadcrumb("inspect_closed");
    setDetailOpen(false);
  }, []);
  reactExports.useCallback(async () => {
    const nextQuery = queryDraft.trim();
    addWidgetBreadcrumb("search_submit", { query: nextQuery });
    setIsSearching(true);
    try {
      const previousSelectedUrl = selectedUrl;
      const previousDetailOpen = detailOpen;
      const response = await callTool("x402_search", {
        query: nextQuery,
        limit: typeof toolInput?.limit === "number" ? toolInput.limit : void 0,
        unverified: typeof toolInput?.unverified === "boolean" ? toolInput.unverified : void 0,
        testnets: typeof toolInput?.testnets === "boolean" ? toolInput.testnets : void 0
      });
      const next = normalizeSearchPayload(response?.structuredContent ?? null);
      if (!next) return;
      setLiveResult(next);
      addWidgetBreadcrumb("search_result_loaded", {
        query: nextQuery,
        count: next.count,
        mode: next.searchMeta?.mode ?? "unknown"
      });
      const nextSelectedUrl = next.resources.some((resource) => resource.url === previousSelectedUrl) ? previousSelectedUrl : next.resources[0]?.url;
      setQueryDraft(nextQuery);
      setSelectedUrl(nextSelectedUrl);
      setDetailOpen(previousDetailOpen && Boolean(nextSelectedUrl));
    } catch (error) {
      captureWidgetException(error, { phase: "search_submit", query: nextQuery });
      throw error;
    } finally {
      setIsSearching(false);
    }
  }, [callTool, detailOpen, queryDraft, selectedUrl, toolInput]);
  const toggleFullscreen = reactExports.useCallback(() => {
    try {
      window.openai?.requestDisplayMode?.({ mode: isFullscreen ? "inline" : "fullscreen" });
    } catch (error) {
      captureWidgetException(error, { phase: "request_display_mode" });
    }
  }, [isFullscreen]);
  if (!activeOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "p-2", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarketBoardLoading, { query: externalQuery || queryDraft }) });
  }
  if (activeOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "p-4", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { className: "rounded-2xl border border-subtle bg-surface px-4 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { color: "danger", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Warning, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { color: "danger", children: activeOutput.error }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: "Dexter could not build the marketplace view for this request." })
    ] }) });
  }
  if (activeOutput.count === 0) {
    const queryLabel = externalQuery || queryDraft;
    const emptyTitle = noMatchReason === "below_strong_threshold" ? `Only weak matches${queryLabel ? ` for "${queryLabel}"` : ""}` : `No x402 APIs found${queryLabel ? ` for "${queryLabel}"` : ""}`;
    const emptyDescription = noMatchReason === "below_similarity_threshold" ? "Nothing in our capability index matches that query yet. Try rephrasing, or widen the description of what you want to do." : noMatchReason === "below_strong_threshold" ? "We found some adjacent services but nothing cleared the strong-match bar. Try a more specific verb for the capability you want." : "Try a broader query or a different angle.";
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-theme": theme, className: "p-4", style: { maxHeight: maxHeight ?? void 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(EmptyMessage, { className: "rounded-2xl border border-subtle bg-surface px-4 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Icon, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Search, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Title, { children: emptyTitle }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyMessage.Description, { children: emptyDescription })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-theme": theme,
      className: `flex flex-col overflow-y-auto ${isFullscreen ? "p-5 sm:p-6" : "p-0"}`,
      style: { maxHeight: isFullscreen ? void 0 : maxHeight ?? void 0 },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          MarketplaceSummaryHeader,
          {
            resultCount: activeOutput.count,
            strongCount: hasTieredShape ? strongCount : void 0,
            relatedCount: hasTieredShape ? relatedCount : void 0,
            rerankApplied,
            isFullscreen,
            onToggleFullscreen: toggleFullscreen
          }
        ) }),
        !isMobile && !isFullscreen && detailOpen && selectedResource && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          SearchVerdictDrawer,
          {
            resource: selectedResource,
            onClose: handleCloseDetail,
            onCheckPrice: runCheckPrice,
            onFetch: runFetch
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `px-4 py-4 ${isFullscreen ? "grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]" : ""}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-5", children: hasTieredShape ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            strongResults.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center gap-2 px-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ff9a52]", children: "Strong matches" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-tertiary", children: strongResults.length }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 border-t border-[rgba(255,107,0,0.18)]" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `grid gap-3 ${isFullscreen ? "xl:grid-cols-2" : "grid-cols-1"}`, children: strongResults.map((resource, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                SearchVerdictRow,
                {
                  resource,
                  index,
                  featured: index === 0,
                  selected: effectiveSelectedUrl === resource.url,
                  onInspect: handleInspectResource,
                  onCheckPrice: runCheckPrice,
                  onFetch: runFetch
                },
                `strong-${resource.url}-${index}`
              )) })
            ] }),
            relatedResults.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center gap-2 px-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-tertiary", children: "Related services" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-tertiary", children: relatedResults.length }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 border-t border-white/8" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `grid gap-3 ${isFullscreen ? "xl:grid-cols-2" : "grid-cols-1"}`, children: relatedResults.map((resource, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                SearchVerdictRow,
                {
                  resource,
                  index,
                  featured: false,
                  selected: effectiveSelectedUrl === resource.url,
                  onInspect: handleInspectResource,
                  onCheckPrice: runCheckPrice,
                  onFetch: runFetch
                },
                `related-${resource.url}-${index}`
              )) })
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `grid gap-3 ${isFullscreen ? "xl:grid-cols-2" : "grid-cols-1"}`, children: resources.map((resource, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            SearchVerdictRow,
            {
              resource,
              index,
              featured: index === 0,
              selected: effectiveSelectedUrl === resource.url,
              onInspect: handleInspectResource,
              onCheckPrice: runCheckPrice,
              onFetch: runFetch
            },
            `${resource.url}-${index}`
          )) }) }),
          isFullscreen && !isMobile && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-0", children: detailOpen && selectedResource ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            SearchVerdictDrawer,
            {
              resource: selectedResource,
              onClose: handleCloseDetail,
              onCheckPrice: runCheckPrice,
              onFetch: runFetch
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "sticky top-4 rounded-[22px] border border-dashed border-subtle bg-surface px-4 py-6 transition-all duration-200", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.22em] text-tertiary", children: "Inspection Deck" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-2 text-lg font-semibold text-primary", children: "Select a result to inspect" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm leading-6 text-secondary", children: "Fullscreen mode now supports a dedicated review surface. Pick any candidate to compare pricing, trust signals, and endpoint context without losing the market board." }),
            selectedResource && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { className: "mt-4", variant: "soft", color: "secondary", size: "sm", onClick: () => handleInspectResource(selectedResource), children: [
              "Open ",
              selectedResource.name
            ] })
          ] }) })
        ] }),
        isMobile && detailOpen && selectedResource && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-20 flex items-end bg-black/50 px-3 py-3 backdrop-blur-sm", onClick: () => {
          void handleCloseDetail();
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-h-[92vh] w-full overflow-y-auto animate-[fadein_.18s_ease-out]", onClick: (event) => event.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          SearchVerdictDrawer,
          {
            resource: selectedResource,
            onClose: handleCloseDetail,
            onCheckPrice: runCheckPrice,
            onFetch: runFetch
          }
        ) }) }),
        activeOutput.tip && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-tertiary px-4 pb-3", children: activeOutput.tip }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          DebugPanel,
          {
            widgetName: "x402-marketplace-search",
            extraInfo: {
              externalQuery,
              queryDraft,
              liveResultCount: liveResult?.count ?? 0,
              activeResultCount: activeOutput?.count ?? 0,
              strongCount,
              relatedCount,
              topSimilarity: activeOutput?.topSimilarity ?? null,
              noMatchReason: noMatchReason ?? "",
              rerankApplied,
              rerankReason: activeOutput?.rerank?.reason ?? "",
              intentCapabilityText: activeOutput?.intent?.capabilityText ?? "",
              searchMode,
              searchNote,
              selectedUrl: effectiveSelectedUrl ?? "",
              detailOpen,
              isSearching,
              isMobile,
              isFullscreen
            }
          }
        )
      ]
    }
  );
}
const root = document.getElementById("x402-marketplace-search-root");
if (root) {
  root.setAttribute("data-widget-build", "2026-04-16.1");
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(MarketplaceSearch, {}));
}
