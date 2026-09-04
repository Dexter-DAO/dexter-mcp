import { u as useOpenAIGlobal } from "./use-openai-global-CFfrkUHE.js";
function useTheme() {
  const theme = useOpenAIGlobal("theme");
  return theme ?? "dark";
}
export {
  useTheme as u
};
