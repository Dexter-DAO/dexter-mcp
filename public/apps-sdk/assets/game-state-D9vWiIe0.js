import { j as jsxRuntimeExports } from "./adapter-G-K6R9j_.js";
/* empty css                    */
import { c as clientExports } from "./client-C4wamDB_.js";
import { u as useOpenAIGlobal } from "./use-openai-global-C5L_09K0.js";
function detectGameType(payload) {
  if (payload.gameType || payload.game_type || payload.type) {
    return payload.gameType || payload.game_type || payload.type || "unknown";
  }
  if (payload.currentKing || payload.current_king || payload.kingScore != null) {
    return "king";
  }
  if (payload.storyId || payload.story_id || payload.chapter != null) {
    return "story";
  }
  return "generic";
}
function getGameIcon(type) {
  switch (type) {
    case "king":
      return "👑";
    case "story":
      return "📖";
    default:
      return "🎮";
  }
}
function getGameTitle(type) {
  switch (type) {
    case "king":
      return "King of the Hill";
    case "story":
      return "Story Game";
    default:
      return "Game State";
  }
}
function GameState() {
  const toolOutput = useOpenAIGlobal("toolOutput");
  if (!toolOutput) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-loading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-loading__spinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Loading game state..." })
    ] }) });
  }
  if (toolOutput.error) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-error", children: toolOutput.error }) });
  }
  const gameType = detectGameType(toolOutput);
  const currentKing = toolOutput.currentKing || toolOutput.current_king;
  const kingScore = toolOutput.kingScore || toolOutput.king_score;
  toolOutput.storyId || toolOutput.story_id;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-container", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-card", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-header-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-icon", children: getGameIcon(gameType) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-title", children: getGameTitle(gameType) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-badge", children: "P3 STUB" })
    ] }),
    gameType === "king" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-content", children: [
      currentKing && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-field", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__label", children: "Current King" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__value", children: currentKing })
      ] }),
      kingScore != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-field", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__label", children: "Score" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__value", children: kingScore })
      ] }),
      toolOutput.challengers != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-field", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__label", children: "Challengers" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__value", children: toolOutput.challengers })
      ] })
    ] }),
    gameType === "story" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-content", children: [
      toolOutput.title && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-field", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__label", children: "Title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__value", children: toolOutput.title })
      ] }),
      toolOutput.chapter != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "game-field", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__label", children: "Chapter" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "game-field__value", children: toolOutput.chapter })
      ] }),
      toolOutput.content && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-story", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        toolOutput.content.slice(0, 300),
        toolOutput.content.length > 300 ? "..." : ""
      ] }) })
    ] }),
    gameType === "generic" && toolOutput.state && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-raw", children: /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { children: JSON.stringify(toolOutput.state, null, 2).slice(0, 500) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "game-stub-notice", children: "This is a P3 stub widget. Full implementation pending." })
  ] }) });
}
const root = document.getElementById("game-state-root");
if (root) {
  clientExports.createRoot(root).render(/* @__PURE__ */ jsxRuntimeExports.jsx(GameState, {}));
}
