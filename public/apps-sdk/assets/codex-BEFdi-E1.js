import { j as jsxRuntimeExports } from "./adapter-CnqTmm6v.js";
/* empty css                    */
import { c as clientExports } from "./client-CHHxyzum.js";
import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
function Codex() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Processing..." })
    ] }) });
  }
  if (toolOutput.error || toolOutput.ok === false) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-error", children: toolOutput.error || "Session failed" }) });
  }
  const message = toolOutput.response?.text?.trim();
  const reasoning = toolOutput.response?.reasoning?.trim();
  const model = toolOutput.session?.model;
  const effort = toolOutput.session?.reasoningEffort;
  const durationMs = toolOutput.durationMs;
  const tokens = toolOutput.tokenUsage;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "codex-scanlines" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-icon", children: "⚡" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-title", children: "Codex Session" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-badge", children: "Session Active" })
    ] }),
    (model || effort || durationMs) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-metrics", children: [
      model && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-metric__label", children: "MODEL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-metric__value", children: model })
      ] }),
      effort && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-metric__label", children: "EFFORT" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-metric__value", children: effort })
      ] }),
      durationMs !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-metric", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-metric__label", children: "DURATION" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "codex-metric__value", children: [
          (durationMs / 1e3).toFixed(2),
          "s"
        ] })
      ] })
    ] }),
    reasoning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-section codex-section--reasoning", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-section-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-section-title", children: "Reasoning Trail" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-pulse" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "codex-reasoning-text", children: [
        reasoning,
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-cursor" })
      ] })
    ] }),
    message && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-section codex-section--output", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-section-title", children: "Output" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("pre", { className: "codex-output-text", children: [
        message,
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-cursor codex-cursor--dim" })
      ] })
    ] }),
    tokens && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-tokens", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-token", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__label", children: "PROMPT" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__value", children: tokens.prompt_tokens ?? 0 })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-token", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__label", children: "COMPLETION" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__value", children: tokens.completion_tokens ?? 0 })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "codex-token", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__label", children: "TOTAL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "codex-token__value", children: tokens.total_tokens ?? 0 })
      ] })
    ] })
  ] }) });
}
const root = document.getElementById("codex-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(Codex, {}));
}
