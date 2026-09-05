import { u as useOpenAIGlobal } from "./use-openai-global-CSgf-drU.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
