import { r as reactExports, c as captureWidgetException } from "./adapter-C5lR_HvA.js";
function useSendFollowUp() {
  return reactExports.useCallback(async (options) => {
    if (typeof window === "undefined" || !window.openai?.sendFollowUpMessage) {
      console.warn("sendFollowUpMessage is not available in this context");
      return;
    }
    try {
      await window.openai.sendFollowUpMessage(options);
    } catch (error) {
      captureWidgetException(error, { phase: "send_follow_up", prompt: options.prompt });
    }
  }, []);
}
export {
  useSendFollowUp as u
};
