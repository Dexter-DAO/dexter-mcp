import { u as useOpenAIGlobal } from "./use-openai-global-DwA6iG8U.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
