import { r as reactExports } from "./adapter-B3ynKBmf.js";
function useIntrinsicHeight() {
  const ref = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const el = ref.current;
    const notify = window.openai?.notifyIntrinsicHeight;
    if (!el || typeof notify !== "function") return;
    const report = () => notify({ height: el.scrollHeight });
    report();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(report);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);
  return ref;
}
export {
  useIntrinsicHeight as u
};
