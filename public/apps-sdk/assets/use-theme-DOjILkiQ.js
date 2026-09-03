import { u as useOpenAIGlobal } from "./use-openai-global-C0rBccno.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
