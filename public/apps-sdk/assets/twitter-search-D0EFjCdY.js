import { j as jsxRuntimeExports, r as reactExports } from "./adapter-CkHbMm1G.js";
/* empty css                    */
import { c as clientExports } from "./client-CfP9AF2a.js";
import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
function formatNumber(value) {
  if (!value || !Number.isFinite(value)) return "0";
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}
function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return "";
  }
}
function ensureTweetUrl(tweet) {
  if (tweet.url) return tweet.url;
  if (tweet.author?.handle && tweet.id) {
    return `https://x.com/${tweet.author.handle}/status/${tweet.id}`;
  }
  return null;
}
function TwitterSearch() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  const [showAll, setShowAll] = reactExports.useState(false);
  const [expandedId, setExpandedId] = reactExports.useState(null);
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading tweets..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-error", children: toolOutput.error }) });
  }
  const tweets = toolOutput.tweets || [];
  const primaryQuery = toolOutput.ticker ? `$${toolOutput.ticker}` : toolOutput.query || toolOutput.queries?.[0];
  const visibleTweets = showAll ? tweets : tweets.slice(0, 4);
  if (tweets.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-empty", children: "No tweets found for this topic." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-container", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-icon", children: "𝕏" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-title", children: "Social Pulse" })
      ] }),
      primaryQuery && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-query", children: primaryQuery })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-grid", children: visibleTweets.map((tweet, idx) => {
      const authorName = tweet.author?.display_name || tweet.author?.handle || "Unknown";
      const handle = tweet.author?.handle ? `@${tweet.author.handle}` : null;
      const avatar = tweet.author?.avatar_url;
      const isVerified = tweet.author?.is_verified;
      const tweetUrl = ensureTweetUrl(tweet);
      const relativeTime = formatRelativeTime(tweet.timestamp);
      const stats = tweet.stats || {};
      const photos = tweet.media?.photos || [];
      const uniqueKey = tweet.id || `tweet-${idx}`;
      const isExpanded = expandedId === uniqueKey;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `twitter-card ${isExpanded ? "twitter-card--expanded" : ""}`,
          onClick: () => setExpandedId(isExpanded ? null : uniqueKey),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__header", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-card__avatar", children: avatar ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: avatar, alt: authorName }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: authorName.slice(0, 2) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__author", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__name", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: authorName }),
                  isVerified && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-card__verified", children: "✓" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__meta", children: [
                  handle && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: handle }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "·" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: relativeTime })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `twitter-card__text ${isExpanded ? "" : "twitter-card__text--clamped"}`, children: tweet.text }),
            photos.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__media", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: photos[0], alt: "Tweet media" }),
              photos.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "twitter-card__media-count", children: [
                "+",
                photos.length - 1
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__stats", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__stat", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-card__stat-icon", children: "❤️" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatNumber(stats.likes) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__stat", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-card__stat-icon", children: "🔁" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatNumber(stats.retweets) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "twitter-card__stat", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "twitter-card__stat-icon", children: "👁" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatNumber(stats.views) })
              ] })
            ] }),
            isExpanded && tweetUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "twitter-card__actions", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "a",
              {
                href: tweetUrl,
                target: "_blank",
                rel: "noreferrer",
                className: "twitter-card__link",
                onClick: (e) => e.stopPropagation(),
                children: "Open on X ↗"
              }
            ) })
          ]
        },
        uniqueKey
      );
    }) }),
    tweets.length > 4 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "twitter-show-more", onClick: () => setShowAll(!showAll), children: showAll ? "Collapse" : `Show ${tweets.length - 4} more tweets` })
  ] });
}
const root = document.getElementById("twitter-search-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(TwitterSearch, {}));
}
