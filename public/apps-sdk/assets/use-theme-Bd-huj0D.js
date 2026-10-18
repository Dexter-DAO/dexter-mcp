import { u as useOpenAIGlobal } from "./use-openai-global-BVDorJ16.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
