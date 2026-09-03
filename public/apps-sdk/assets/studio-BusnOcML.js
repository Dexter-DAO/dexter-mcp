import { j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
/* empty css                    */
import { c as clientExports } from "./client-BiBV5Ase.js";
import { u as useOpenAIGlobal } from "./use-openai-global-C0rBccno.js";
function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor(seconds % 3600 / 60);
  return `${hrs}h ${mins}m`;
}
function formatTime(timestamp) {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}
function detectViewType(payload) {
  if (payload.jobs) return "list";
  if (payload.job) return "inspect";
  if (payload.media || payload.headline) return "breaking_news";
  if (payload.artifacts !== void 0 || payload.completed_at) return "news_status";
  if (payload.success === false && payload.message?.includes("cancel")) return "cancel";
  if (payload.job_id && !payload.status) return "create";
  return "status";
}
function StudioStatusBadge({ status }) {
  const configs = {
    running: { icon: "↻", className: "studio-badge--running" },
    completed: { icon: "✓", className: "studio-badge--success" },
    failed: { icon: "✕", className: "studio-badge--error" },
    cancelled: { icon: "◼", className: "studio-badge--neutral" },
    pending: { icon: "◷", className: "studio-badge--warning" },
    queued: { icon: "◷", className: "studio-badge--info" }
  };
  const config = configs[status] || configs.pending;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `studio-badge ${config.className}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: status === "running" ? "studio-badge__spin" : "", children: config.icon }),
    status
  ] });
}
function CreateView({ payload }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-success-banner", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-success-icon", children: "🚀" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-success-text", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-success-title", children: "Agent Started!" }) })
    ] }),
    payload.job_id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-info-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-info-label", children: "JOB ID" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "studio-info-value", children: payload.job_id })
    ] }),
    payload.message && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "studio-message", children: payload.message })
  ] });
}
function StatusView({ payload }) {
  const status = payload.status || "pending";
  const jobId = payload.job_id;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-info-box", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-info-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-info-label", children: "JOB ID" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "studio-info-value", children: jobId || "—" })
    ] }) }),
    status === "running" && payload.current_step && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-progress", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-progress-icon", children: "🚀" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-progress-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-progress-step", children: payload.current_step }),
        payload.turns !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "studio-progress-turns", children: [
          "Turn ",
          payload.turns
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-metrics", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__label", children: "STATUS" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__value", children: status.toUpperCase() })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__label", children: "TURNS" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__value", children: payload.turns ?? 0 })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__label", children: "ELAPSED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__value", children: formatDuration(payload.elapsed_seconds) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__label", children: "STARTED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-metric__value", children: formatTime(payload.started_at) })
      ] })
    ] }),
    payload.error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-error-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-error-icon", children: "✕" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: payload.error })
    ] })
  ] });
}
function ListView({ jobs }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-view", children: jobs.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-empty", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-empty-icon", children: "🚀" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "No jobs found" })
  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-jobs-list", children: jobs.map((job, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-job-row", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-job-left", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "studio-job-id", children: job.id || job.job_id }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StudioStatusBadge, { status: job.status || "pending" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-job-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "studio-job-turns", children: [
      job.turns || 0,
      " turns"
    ] }) })
  ] }, job.id || idx)) }) });
}
function BreakingNewsView({ payload }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-view", children: [
    payload.headline && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-headline-box", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-headline-label", children: "HEADLINE" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "studio-headline-text", children: payload.headline })
    ] }),
    payload.media && payload.media.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-media-list", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-media-label", children: "MEDIA JOBS" }),
      payload.media.map((m, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `studio-media-item ${m.type === "video" ? "studio-media-item--video" : "studio-media-item--image"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-media-icon", children: m.type === "video" ? "🎬" : "🖼️" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-media-info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-media-type", children: m.type === "video" ? "Sora Video" : "Infographic" }),
          m.job_id && /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "studio-media-id", children: m.job_id })
        ] })
      ] }, m.job_id || idx))
    ] }),
    payload.view_at && /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: payload.view_at, target: "_blank", rel: "noreferrer", className: "studio-view-link", children: "View Jobs ↗" })
  ] });
}
function Studio() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading Studio..." })
    ] }) });
  }
  if (toolOutput.error && toolOutput.success === false) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-error", children: toolOutput.error || "Operation failed" }) });
  }
  const viewType = detectViewType(toolOutput);
  const status = toolOutput.status || toolOutput.job?.status || "pending";
  const titles = {
    create: "Studio Job Created",
    status: "Job Status",
    list: "Studio Jobs",
    inspect: "Job Inspection",
    cancel: "Job Cancellation",
    breaking_news: "Breaking News Media",
    news_status: "News Media Status"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "studio-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "studio-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-icon", children: "🎬" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "studio-title", children: titles[viewType] })
      ] }),
      viewType !== "list" && viewType !== "create" && /* @__PURE__ */ jsxRuntimeExports.jsx(StudioStatusBadge, { status }),
      viewType === "list" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "studio-count", children: [
        toolOutput.count || toolOutput.jobs?.length || 0,
        " jobs"
      ] })
    ] }),
    viewType === "create" && /* @__PURE__ */ jsxRuntimeExports.jsx(CreateView, { payload: toolOutput }),
    viewType === "status" && /* @__PURE__ */ jsxRuntimeExports.jsx(StatusView, { payload: toolOutput }),
    viewType === "list" && /* @__PURE__ */ jsxRuntimeExports.jsx(ListView, { jobs: toolOutput.jobs || [] }),
    viewType === "inspect" && toolOutput.job && /* @__PURE__ */ jsxRuntimeExports.jsx(StatusView, { payload: { ...toolOutput.job, job_id: toolOutput.job.id } }),
    (viewType === "breaking_news" || viewType === "news_status") && /* @__PURE__ */ jsxRuntimeExports.jsx(BreakingNewsView, { payload: toolOutput })
  ] }) });
}
const root = document.getElementById("studio-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Studio, {}));
}
