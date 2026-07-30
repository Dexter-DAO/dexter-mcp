import { r as reactExports } from "./adapter-G-K6R9j_.js";
function useOpenExternal() {
  return reactExports.useCallback((href) => {
    if (typeof window === "undefined" || !window.openai?.openExternal) {
      window?.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    window.openai.openExternal({ href });
  }, []);
}
export {
  useOpenExternal as u
};
