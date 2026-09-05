import { r as reactExports } from "./adapter-CkHbMm1G.js";
function useIntrinsicHeight() {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const notify = window.openai?.notifyIntrinsicHeight;
      if (typeof notify === "function") {
        notify({ height: el.scrollHeight });
      }
    };
    report();
    window.addEventListener("openai:set_globals", report, { passive: true });
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(report);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("openai:set_globals", report);
    };
  }, []);
  return ref;
}
export {
  useIntrinsicHeight as u
};
