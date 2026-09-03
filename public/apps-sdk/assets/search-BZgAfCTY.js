import { j as jsxRuntimeExports, r as reactExports } from "./adapter-BBMYb_B0.js";
/* empty css                    */
import { c as clientExports } from "./client-Hl6e0V0s.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DIHzgDeX.js";
function extractHostname(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}
function resolveFaviconUrl(favicon, pageUrl) {
  if (!favicon) return null;
  const trimmed = favicon.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (pageUrl) {
    try {
      const base = new URL(pageUrl);
      if (trimmed.startsWith("/")) {
        return `${base.origin}${trimmed}`;
      }
      return new URL(trimmed, `${base.origin}/`).toString();
    } catch {
    }
  }
  return trimmed;
}
function SiteIcon({ hostname, favicon, size = 40 }) {
  const [error, setError] = reactExports.useState(false);
  const label = hostname ? hostname.slice(0, 2).toUpperCase() : "WW";
  const showImage = favicon && !error;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-site-icon", style: { width: size, height: size }, children: showImage ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: favicon,
      alt: "",
      onError: () => setError(true),
      referrerPolicy: "no-referrer"
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: size * 0.35 }, children: label }) });
}
function SearchResultItem({ result, index }) {
  const title = result.title?.trim() || `Result ${index + 1}`;
  const snippet = result.snippet?.trim();
  const url = result.url?.trim();
  const hostname = extractHostname(url);
  const faviconUrl = resolveFaviconUrl(result.favicon, url);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "a",
    {
      href: url,
      target: "_blank",
      rel: "noreferrer",
      className: "search-result",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-result__icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SiteIcon, { hostname, favicon: faviconUrl, size: 40 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-result__content", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-result__header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-result__hostname", children: hostname }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "search-result__external", width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 3 21 3 21 9" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "search-result__title", children: title }),
          snippet && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "search-result__snippet", children: snippet })
        ] })
      ]
    }
  );
}
function Search() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Searching..." })
    ] }) });
  }
  const payload = toolOutput;
  const results = Array.isArray(payload.results) ? payload.results : Array.isArray(toolOutput) ? toolOutput : [];
  const answer = typeof payload.answer === "string" && payload.answer.trim().length ? payload.answer.trim() : null;
  const query = typeof payload.query === "string" && payload.query.trim().length ? payload.query.trim() : void 0;
  const images = Array.isArray(payload.images) ? payload.images.filter(
    (img) => Boolean(img && typeof img.url === "string" && img.url.trim().length)
  ) : [];
  if (results.length === 0 && !answer) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-empty", children: "No search results found." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-card__header", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-card__title-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", className: "search-icon", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "11", cy: "11", r: "8" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-card__title", children: "Search Results" })
    ] }) }),
    query && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-query", children: [
      '"',
      query,
      '"'
    ] }),
    answer && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-summary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-summary__label", children: "AI Summary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "search-summary__text", children: answer })
    ] }),
    images.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "search-images", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-images__label", children: "Visuals" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-images__grid", children: images.slice(0, 4).map((img, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: img.url,
          target: "_blank",
          rel: "noreferrer",
          className: "search-images__item",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: img.url, alt: img.description || "Search result", referrerPolicy: "no-referrer" })
        },
        idx
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "search-results", children: results.map((result, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(SearchResultItem, { result, index }, result.id || index)) })
  ] }) });
}
const root = document.getElementById("search-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Search, {}));
}
