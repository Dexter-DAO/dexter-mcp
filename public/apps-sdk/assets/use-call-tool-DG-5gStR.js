import { r as reactExports } from "./adapter-CnqTmm6v.js";
function useCallTool() {
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [result, setResult] = reactExports.useState(null);
  const callTool = reactExports.useCallback(async (name, args) => {
    if (typeof window === "undefined" || !window.openai?.callTool) {
      setError("callTool is not available in this context");
      return null;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await window.openai.callTool(name, args);
      setResult(response);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to call tool";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);
  const reset = reactExports.useCallback(() => {
    setIsLoading(false);
    setError(null);
    setResult(null);
  }, []);
  return { callTool, isLoading, error, result, reset };
}
export {
  useCallTool as u
};
