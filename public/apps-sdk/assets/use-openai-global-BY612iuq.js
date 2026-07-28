import { r as reactExports } from "./adapter-B3ynKBmf.js";
const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";
const snapshotCache = /* @__PURE__ */ new Map();
function getStableSnapshot(key) {
  const value = typeof window !== "undefined" ? window.openai?.[key] ?? null : null;
  if (value === null || value === void 0) return null;
  if (typeof value !== "object") return value;
  try {
    const serialized = JSON.stringify(value);
    const cacheKey = String(key);
    const cached = snapshotCache.get(cacheKey);
    if (cached && cached.serialized === serialized) {
      return cached.value;
    }
    snapshotCache.set(cacheKey, { serialized, value });
    return value;
  } catch {
    return value;
  }
}
function useOpenAIGlobal(key) {
  return reactExports.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {
        };
      }
      const handler = (event) => {
        if (!Object.prototype.hasOwnProperty.call(event.detail.globals, key)) return;
        const cacheKey = String(key);
        const cached = snapshotCache.get(cacheKey);
        const next = window.openai?.[key] ?? null;
        if (cached && next !== null && typeof next === "object") {
          try {
            if (JSON.stringify(next) === cached.serialized) return;
          } catch {
          }
        }
        onStoreChange();
      };
      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handler, { passive: true });
      return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handler);
    },
    () => getStableSnapshot(key),
    () => null
  );
}
export {
  useOpenAIGlobal as u
};
