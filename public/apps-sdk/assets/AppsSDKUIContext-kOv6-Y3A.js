import { r as reactExports } from "./adapter-C5lR_HvA.js";
const __vite_import_meta_env__ = { "DEV": false, "MODE": "production" };
const META_ENV = typeof import.meta !== "undefined" ? __vite_import_meta_env__ : void 0;
const isDev = !!META_ENV?.DEV;
const isJSDomLike = typeof navigator !== "undefined" && /(jsdom|happy-dom)/i.test(navigator.userAgent) || typeof globalThis.happyDOM === "object";
const isTest = META_ENV?.MODE === "test" || isJSDomLike;
const hasWindow = typeof window !== "undefined";
const hasDocument = typeof document !== "undefined";
const canUseDOM = hasWindow && hasDocument;
reactExports.createContext(null);
export {
  isDev as a,
  canUseDOM as c,
  hasDocument as h,
  isTest as i
};
