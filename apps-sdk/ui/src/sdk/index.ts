import './init-sentry';

export * from './types';
export * from './call-tool-result';
export * from './use-openai-global';
export * from './use-widget-props';
export * from './use-display-mode';
export * from './use-max-height';
export * from './use-request-display-mode';
export * from './use-is-chatgpt-app';
// New interactive hooks
export * from './use-call-tool';
export * from './use-send-followup';
export * from './use-widget-state';
export * from './use-theme';
export * from './use-tool-input';
export * from './use-open-external';
export * from './use-user-agent';
// Dual-runtime adapter (ChatGPT + MCP Apps)
export {
  useToolOutput,
  useToolResponseMetadata,
  useAdaptiveTheme,
  useAdaptiveHostContext,
  useAdaptiveHostCapabilities,
  useAdaptiveDisplayMode,
  useAdaptiveMaxHeight,
  useAdaptiveRequestDisplayMode,
  useAdaptiveUpdateModelContext,
  useAdaptiveSendFollowUp,
  useAdaptiveCallToolFn,
  useAdaptiveOpenExternal,
  useHostRuntime,
} from './adapter';
export { isMcpAppsHost } from './mcp-apps-bridge';
