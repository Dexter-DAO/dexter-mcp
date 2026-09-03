import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
function useDisplayMode() {
  return useOpenAIGlobal("displayMode");
}
function useMaxHeight() {
  return useOpenAIGlobal("maxHeight");
}
function useRequestDisplayMode() {
  return useOpenAIGlobal("requestDisplayMode");
}
export {
  useDisplayMode as a,
  useRequestDisplayMode as b,
  useMaxHeight as u
};
