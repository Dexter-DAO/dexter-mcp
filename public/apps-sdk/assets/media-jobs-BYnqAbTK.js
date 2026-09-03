import { j as jsxRuntimeExports } from "./adapter-BBMYb_B0.js";
/* empty css                    */
import { c as clientExports } from "./client-Hl6e0V0s.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DIHzgDeX.js";
function formatTime(timestamp) {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}
function truncatePrompt(prompt, maxLen = 150) {
  if (!prompt) return "—";
  if (prompt.length <= maxLen) return prompt;
  return prompt.slice(0, maxLen) + "...";
}
function detectJobType(job) {
  if (job.jobType?.toLowerCase().includes("sora") || job.jobType?.toLowerCase().includes("video")) {
    return "video";
  }
  return "image";
}
function MediaJobs() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading job..." })
    ] }) });
  }
  if (toolOutput.error || toolOutput.ok === false) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-error", children: toolOutput.error || "Job creation failed" }) });
  }
  const job = toolOutput.job;
  if (!job) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-error", children: "No job data returned" }) });
  }
  const status = job.status || "pending";
  const jobType = detectJobType(job);
  const artifacts = job.resultPayload?.artifacts || [];
  const hasArtifacts = artifacts.length > 0;
  const pricing = toolOutput.pricing;
  const costUsd = pricing?.chargeUsd || (job.costCents ? job.costCents / 100 : null);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-icon", children: jobType === "video" ? "🎬" : "🖼️" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-title", children: jobType === "video" ? "Sora Video Job" : "Meme Generator Job" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `media-badge media-badge--${status}`, children: [
        status === "running" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-badge__spin", children: "↻" }),
        status === "completed" && "✓",
        status === "failed" && "✕",
        status === "pending" && "◷",
        status
      ] })
    ] }),
    hasArtifacts ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-preview", children: [
      jobType === "video" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "video",
        {
          src: artifacts[0].url,
          controls: true,
          className: "media-preview__video",
          children: "Your browser does not support video playback."
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: artifacts[0].url,
          alt: "Generated media",
          className: "media-preview__image"
        }
      ),
      artifacts.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "media-preview__count", children: [
        artifacts.length,
        " files"
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `media-placeholder media-placeholder--${jobType}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-placeholder__icon", children: jobType === "video" ? "🎬" : "🖼️" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-placeholder__text", children: status === "completed" ? "Generation complete" : "Processing..." }),
      status === "running" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-placeholder__progress" })
    ] }),
    job.requestPayload?.prompt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-prompt", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-prompt__label", children: "PROMPT" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "media-prompt__text", children: truncatePrompt(job.requestPayload.prompt, 300) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__label", children: "STATUS" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__value", children: status.toUpperCase() })
      ] }),
      jobType === "video" && job.requestPayload?.seconds && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__label", children: "DURATION" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "media-metric__value", children: [
          job.requestPayload.seconds,
          "s"
        ] })
      ] }),
      job.requestPayload?.resolution && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__label", children: "RESOLUTION" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__value", children: job.requestPayload.resolution })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__label", children: "CREATED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-metric__value", children: formatTime(job.createdAt) })
      ] })
    ] }),
    jobType === "image" && job.requestPayload?.tokens && job.requestPayload.tokens.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-tokens", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-tokens__label", children: "TOKENS" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "media-tokens__list", children: job.requestPayload.tokens.map((token, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-tokens__item", children: token.symbol || token.mint?.slice(0, 8) || "Unknown" }, idx)) })
    ] }),
    costUsd && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-pricing", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-pricing__label", children: "Cost" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "media-pricing__value", children: [
        "$",
        costUsd.toFixed(2)
      ] })
    ] }),
    job.errorMessage && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-error-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "media-error-box__icon", children: "✕" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: job.errorMessage })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "media-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "media-footer__id", children: job.id }),
      job.statusUrl && /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: job.statusUrl, target: "_blank", rel: "noreferrer", className: "media-footer__link", children: "View Job ↗" })
    ] })
  ] }) });
}
const root = document.getElementById("media-jobs-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(MediaJobs, {}));
}
