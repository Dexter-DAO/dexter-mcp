import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
function useDisplayMode() {
  return useOpenAIGlobal("displayMode");
}
function useRequestDisplayMode() {
  return useOpenAIGlobal("requestDisplayMode");
}
export {
  useRequestDisplayMode as a,
  useDisplayMode as u
};
