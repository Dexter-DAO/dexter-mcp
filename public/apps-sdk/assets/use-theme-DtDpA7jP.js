import { u as useOpenAIGlobal } from "./use-openai-global-DIHzgDeX.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
