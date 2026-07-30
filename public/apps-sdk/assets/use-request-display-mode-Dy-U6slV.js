import { u as useOpenAIGlobal } from "./use-openai-global-C5L_09K0.js";
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
