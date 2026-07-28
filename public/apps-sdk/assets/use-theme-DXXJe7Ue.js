import { u as useOpenAIGlobal } from "./use-openai-global-BY612iuq.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
