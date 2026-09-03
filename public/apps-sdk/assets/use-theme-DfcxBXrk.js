import { u as useOpenAIGlobal } from "./use-openai-global-Do_3DceD.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
