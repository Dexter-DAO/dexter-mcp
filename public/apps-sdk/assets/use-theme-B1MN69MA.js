import { u as useOpenAIGlobal } from "./use-openai-global-C5L_09K0.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
