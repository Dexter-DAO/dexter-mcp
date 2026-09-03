import { r as reactExports } from "./adapter-BD2Wya3l.js";
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
