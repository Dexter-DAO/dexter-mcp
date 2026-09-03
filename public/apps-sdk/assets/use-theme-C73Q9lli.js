import { u as useOpenAIGlobal } from "./use-openai-global-BfYd9Rwa.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
