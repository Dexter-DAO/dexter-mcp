import { j as jsxRuntimeExports } from "./adapter-BBMYb_B0.js";
/* empty css                    */
import { c as clientExports } from "./client-Hl6e0V0s.js";
import { u as useOpenAIGlobal } from "./use-openai-global-DIHzgDeX.js";
function detectJobType(payload) {
  if (payload.type) return payload.type;
  if (payload.spaceId || payload.space_id || payload.spaceName) return "spaces";
  if (payload.code || payload.language) return "code-interpreter";
  if (payload.query || payload.sources) return "deep-research";
  return "async-job";
}
function getJobIcon(type) {
  switch (type) {
    case "spaces":
      return "🎙️";
    case "code-interpreter":
      return "💻";
    case "deep-research":
      return "🔬";
    default:
      return "⚙️";
  }
}
function getJobTitle(type) {
  switch (type) {
    case "spaces":
      return "Twitter Spaces Job";
    case "code-interpreter":
      return "Code Execution";
    case "deep-research":
      return "Deep Research";
    default:
      return "Async Job";
  }
}
function getStatusClass(status) {
  switch (status) {
    case "completed":
      return "job-status--completed";
    case "running":
      return "job-status--running";
    case "queued":
      return "job-status--queued";
    case "failed":
      return "job-status--failed";
    case "cancelled":
      return "job-status--cancelled";
    default:
      return "";
  }
}
function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1e3) return `${ms}ms`;
  const secs = ms / 1e3;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}m ${remainingSecs}s`;
}
function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}
function AsyncJob() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading job..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-error", children: toolOutput.error }) });
  }
  const jobType = detectJobType(toolOutput);
  const jobId = toolOutput.jobId || toolOutput.job_id || toolOutput.id;
  const created = toolOutput.createdAt || toolOutput.created_at;
  toolOutput.completedAt || toolOutput.completed_at;
  const duration = toolOutput.durationMs || toolOutput.duration_ms;
  const spaceName = toolOutput.spaceName || toolOutput.space_name;
  const result = toolOutput.result || toolOutput.output;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-icon", children: getJobIcon(jobType) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-title", children: getJobTitle(jobType) })
      ] }),
      toolOutput.status && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `job-badge ${getStatusClass(toolOutput.status)}`, children: toolOutput.status.toUpperCase() })
    ] }),
    toolOutput.status === "running" && toolOutput.progress != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-progress", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-progress__bar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "job-progress__fill",
          style: { width: `${Math.min(toolOutput.progress, 100)}%` }
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "job-progress__text", children: [
        toolOutput.progress,
        "%"
      ] })
    ] }),
    jobType === "spaces" && spaceName && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-detail-block", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-detail-block__label", children: "Space" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-detail-block__value", children: spaceName })
    ] }),
    jobType === "code-interpreter" && toolOutput.code && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-code", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-code__label", children: toolOutput.language || "Code" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "job-code__content", children: toolOutput.code })
    ] }),
    jobType === "deep-research" && toolOutput.query && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-detail-block", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-detail-block__label", children: "Query" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-detail-block__value", children: toolOutput.query })
    ] }),
    result && toolOutput.status === "completed" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-result", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-result__label", children: "RESULT" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-result__content", children: typeof result === "string" ? result : JSON.stringify(result, null, 2).slice(0, 500) })
    ] }),
    toolOutput.sources && toolOutput.sources.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-sources", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-sources__label", children: "SOURCES" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "job-sources__list", children: toolOutput.sources.slice(0, 5).map((src, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: src.url,
          target: "_blank",
          rel: "noreferrer",
          className: "job-sources__item",
          children: src.title || src.url
        },
        idx
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-meta", children: [
      jobId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-meta__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__label", children: "Job ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__value", children: jobId.length > 16 ? `${jobId.slice(0, 8)}...` : jobId })
      ] }),
      created && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-meta__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__label", children: "Started" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__value", children: formatTimestamp(created) })
      ] }),
      duration && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "job-meta__item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__label", children: "Duration" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "job-meta__value", children: formatDuration(duration) })
      ] })
    ] })
  ] }) });
}
const root = document.getElementById("async-job-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(AsyncJob, {}));
}
