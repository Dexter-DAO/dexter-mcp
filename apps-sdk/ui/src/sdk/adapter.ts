/**
 * Dual-runtime SDK adapter.
 *
 * Provides unified React hooks that work in both ChatGPT (OpenAI Apps SDK)
 * and MCP Apps hosts (Cursor, Claude Desktop, VS Code).
 *
 * ChatGPT can expose both the standard MCP Apps postMessage bridge and the
 * optional window.openai extensions. Each hook subscribes to both surfaces
 * and chooses live data by capability, avoiding a brittle module-load fork.
 */

import { useSyncExternalStore, useCallback } from 'react';
import { normalizeCallToolResult } from './call-tool-result';
import type {
  AdaptiveHostCapabilities,
  AdaptiveHostContext,
  CallTool,
  DisplayMode,
  RequestDisplayMode,
  Theme,
  ToolResultContent,
  UnknownObject,
} from './types';
import {
  createDefaultCapabilities,
  createDefaultHostContext,
  normalizeMcpCapabilities,
  normalizeMcpHostContext,
  normalizeMcpToolInput,
} from './host-adapter-model';
import * as mcpApps from './mcp-apps-bridge';

type HostRuntime = 'chatgpt' | 'mcp-apps' | 'unknown';

const DEFAULT_HOST_CONTEXT = createDefaultHostContext();
const DEFAULT_HOST_CAPABILITIES = createDefaultCapabilities();

function detectHost(): HostRuntime {
  if (typeof window === 'undefined') return 'unknown';
  if (typeof window.openai !== 'undefined') return 'chatgpt';
  if (window.__isMcpApp) return 'mcp-apps';
  if (window.self !== window.top) return 'mcp-apps';
  return 'unknown';
}

function isEmbeddedHost(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

let _chatGptDisplayModeOverride: DisplayMode | null = null;
const _chatGptAdapterListeners = new Set<() => void>();

// ── MCP Apps state store ──────────────────────────────────────────────

let _mcpToolOutput: unknown = null;
let _mcpToolInput: unknown = null;
let _mcpToolMeta: unknown = null;
let _mcpTheme: Theme = 'dark';
let _mcpHostContext: AdaptiveHostContext = DEFAULT_HOST_CONTEXT;
let _mcpHostCapabilities: AdaptiveHostCapabilities = DEFAULT_HOST_CAPABILITIES;
let _mcpInitDone = false;
const _mcpListeners = new Set<() => void>();
const _adaptiveSnapshotCache = new Map<string, { serialized: string; value: unknown }>();

function stableSnapshot<T>(key: string, value: T): T {
  try {
    const serialized = JSON.stringify(value);
    const cached = _adaptiveSnapshotCache.get(key);
    if (cached?.serialized === serialized) return cached.value as T;
    _adaptiveSnapshotCache.set(key, { serialized, value });
  } catch {
    // Return the live value when serialization is not possible.
  }
  return value;
}

function getChatGptHostContext(
  fallback: AdaptiveHostContext = DEFAULT_HOST_CONTEXT,
): AdaptiveHostContext {
  const openai = typeof window !== 'undefined' ? window.openai : undefined;
  const displayMode = _chatGptDisplayModeOverride
    ?? openai?.displayMode
    ?? fallback.displayMode;
  const safeArea = openai?.safeArea?.insets ?? fallback.safeAreaInsets;
  const maxHeight =
    typeof openai?.maxHeight === 'number' && Number.isFinite(openai.maxHeight)
      ? openai.maxHeight
      : fallback.containerDimensions?.maxHeight;
  const platform = openai?.userAgent?.device?.type === 'mobile'
    ? 'mobile'
    : openai?.userAgent?.device?.type === 'desktop'
      ? 'desktop'
      : fallback.platform;

  return stableSnapshot('chatgpt-host-context', {
    ...fallback,
    theme: openai?.theme ?? fallback.theme,
    displayMode,
    availableDisplayModes: typeof openai?.requestDisplayMode === 'function'
      ? Array.from(new Set<DisplayMode>([
          ...fallback.availableDisplayModes,
          displayMode,
          'inline',
          'fullscreen',
        ]))
      : fallback.availableDisplayModes,
    ...(maxHeight
      ? {
          containerDimensions: {
            ...fallback.containerDimensions,
            maxHeight,
          },
        }
      : {}),
    locale: openai?.locale ?? fallback.locale,
    platform,
    deviceCapabilities:
      openai?.userAgent?.capabilities ?? fallback.deviceCapabilities,
    safeAreaInsets: safeArea,
  });
}

function getChatGptCapabilities(): AdaptiveHostCapabilities {
  const openai = typeof window !== 'undefined' ? window.openai : undefined;
  return stableSnapshot('chatgpt-capabilities', {
    callTool: typeof openai?.callTool === 'function',
    openExternal: typeof openai?.openExternal === 'function',
    requestDisplayMode: typeof openai?.requestDisplayMode === 'function',
    updateModelContext: typeof openai?.updateModelContext === 'function',
    sendFollowUpMessage: typeof openai?.sendFollowUpMessage === 'function',
    downloadFile: typeof openai?.downloadFile === 'function',
    widgetState: typeof openai?.setWidgetState === 'function',
  });
}

function notifyMcpListeners() {
  for (const fn of _mcpListeners) fn();
}

function initMcpAppsOnce() {
  if (_mcpInitDone) return;
  _mcpInitDone = true;

  mcpApps.onNotification('ui/notifications/tool-result', (params: unknown) => {
    const p = params as { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; _meta?: unknown } | undefined;
    _mcpToolOutput = p?.structuredContent ?? tryParseTextContent(p?.content);
    // Widget-only side-channel (sessionToken, dexterCardToken). Absent on
    // hosts that strip _meta — consumers must treat null as "not armed".
    _mcpToolMeta = p?._meta ?? null;
    notifyMcpListeners();
  });

  mcpApps.onNotification('ui/notifications/tool-input', (params: unknown) => {
    _mcpToolInput = normalizeMcpToolInput(params);
    notifyMcpListeners();
  });

  mcpApps.onNotification('ui/notifications/host-context-changed', (params: unknown) => {
    _mcpHostContext = normalizeMcpHostContext(
      params && typeof params === 'object' && !Array.isArray(params)
        ? params as Record<string, unknown>
        : null,
      _mcpHostContext,
    );
    _mcpTheme = _mcpHostContext.theme;
    _mcpHostCapabilities = normalizeMcpCapabilities(
      mcpApps.getHostCapabilities(),
      _mcpHostContext,
    );
    notifyMcpListeners();
  });

  mcpApps.initialize().then((result) => {
    _mcpHostContext = normalizeMcpHostContext(
      result.hostContext as Record<string, unknown> | undefined,
      _mcpHostContext,
    );
    _mcpTheme = _mcpHostContext.theme;
    _mcpHostCapabilities = normalizeMcpCapabilities(
      result.hostCapabilities,
      _mcpHostContext,
    );
    notifyMcpListeners();
  }).catch(() => {});
}

// MCP Apps is the portable baseline, including in ChatGPT. window.openai is
// additive and may be injected before or after this module evaluates.
if (isEmbeddedHost()) {
  initMcpAppsOnce();
}

function tryParseTextContent(content?: Array<{ type: string; text?: string }>): unknown {
  const text = content?.find(c => c.type === 'text')?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function subscribeChatGPTGlobals(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  _chatGptAdapterListeners.add(onChange);
  const handler = (event: CustomEvent<{ globals?: Record<string, unknown> }>) => {
    if (Object.prototype.hasOwnProperty.call(event.detail?.globals ?? {}, 'displayMode')) {
      _chatGptDisplayModeOverride = null;
    }
    onChange();
  };
  window.addEventListener('openai:set_globals', handler as EventListener, { passive: true });
  return () => {
    _chatGptAdapterListeners.delete(onChange);
    window.removeEventListener('openai:set_globals', handler as EventListener);
  };
}

// ── MCP Apps subscribe helper ─────────────────────────────────────────

function subscribeMcpApps(onChange: () => void): () => void {
  _mcpListeners.add(onChange);
  return () => { _mcpListeners.delete(onChange); };
}

function subscribeAdaptive(onChange: () => void): () => void {
  const unsubscribeChatGpt = subscribeChatGPTGlobals(onChange);
  const unsubscribeMcpApps = subscribeMcpApps(onChange);
  return () => {
    unsubscribeChatGpt();
    unsubscribeMcpApps();
  };
}

function chatGptGlobal<T>(key: string): T | undefined {
  if (typeof window === 'undefined' || !window.openai) return undefined;
  const value = (window.openai as unknown as Record<string, unknown>)[key];
  return value === undefined ? undefined : value as T;
}

function getAdaptiveHostContext(): AdaptiveHostContext {
  if (typeof window === 'undefined' || !window.openai) return _mcpHostContext;
  return getChatGptHostContext(_mcpHostContext);
}

function getAdaptiveCapabilities(): AdaptiveHostCapabilities {
  const chatGpt = getChatGptCapabilities();
  return stableSnapshot('adaptive-capabilities', {
    callTool: chatGpt.callTool || _mcpHostCapabilities.callTool,
    openExternal: chatGpt.openExternal || _mcpHostCapabilities.openExternal,
    requestDisplayMode:
      chatGpt.requestDisplayMode || _mcpHostCapabilities.requestDisplayMode,
    updateModelContext:
      chatGpt.updateModelContext || _mcpHostCapabilities.updateModelContext,
    sendFollowUpMessage:
      chatGpt.sendFollowUpMessage || _mcpHostCapabilities.sendFollowUpMessage,
    downloadFile: chatGpt.downloadFile || _mcpHostCapabilities.downloadFile,
    widgetState: chatGpt.widgetState,
  });
}

// ── Unified hooks ─────────────────────────────────────────────────────

/**
 * Get the tool output (structured data for rendering).
 */
export function useToolOutput<T = unknown>(): T | null {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => (_mcpToolOutput ?? chatGptGlobal<T | null>('toolOutput') ?? null) as T | null,
    () => null,
  );
}

/**
 * Get the tool response _meta — the widget-only side-channel (sessionToken,
 * dexterCardToken). Never rendered to the model; may be null on hosts that
 * don't deliver it.
 */
export function useToolResponseMetadata<T = Record<string, unknown>>(): T | null {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => (
      _mcpToolMeta ?? chatGptGlobal<T | null>('toolResponseMetadata') ?? null
    ) as T | null,
    () => null,
  );
}

/**
 * Get the tool input (what the user asked for).
 */
export function useToolInput<T = Record<string, unknown>>(): T | null {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => (_mcpToolInput ?? chatGptGlobal<T | null>('toolInput') ?? null) as T | null,
    () => null,
  );
}

/**
 * Get the current theme.
 */
export function useAdaptiveTheme(): Theme {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => chatGptGlobal<Theme>('theme') ?? _mcpTheme,
    () => 'dark' as Theme,
  );
}

/**
 * Host presentation context normalized across ChatGPT and MCP Apps.
 */
export function useAdaptiveHostContext(): AdaptiveHostContext {
  return useSyncExternalStore(
    subscribeAdaptive,
    getAdaptiveHostContext,
    () => DEFAULT_HOST_CONTEXT,
  );
}

/**
 * Capabilities are detected from the active host, never from its product name.
 */
export function useAdaptiveHostCapabilities(): AdaptiveHostCapabilities {
  return useSyncExternalStore(
    subscribeAdaptive,
    getAdaptiveCapabilities,
    () => DEFAULT_HOST_CAPABILITIES,
  );
}

export function useAdaptiveDisplayMode(): DisplayMode {
  return useAdaptiveHostContext().displayMode;
}

export function useAdaptiveMaxHeight(): number | null {
  const dimensions = useAdaptiveHostContext().containerDimensions;
  const value = dimensions?.height ?? dimensions?.maxHeight;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function useAdaptiveRequestDisplayMode(): RequestDisplayMode | null {
  const capabilities = useAdaptiveHostCapabilities();
  const request = useCallback<RequestDisplayMode>(async ({ mode }) => {
    if (mcpApps.isInitialized() && _mcpHostCapabilities.requestDisplayMode) {
      const result = await mcpApps.requestDisplayMode(mode);
      if (result.mode !== 'inline' && result.mode !== 'fullscreen' && result.mode !== 'pip') {
        throw new Error('Host returned an invalid display mode');
      }
      _mcpHostContext = { ..._mcpHostContext, displayMode: result.mode };
      notifyMcpListeners();
      return result;
    }
    if (typeof window !== 'undefined' && window.openai?.requestDisplayMode) {
      const result = await window.openai.requestDisplayMode({ mode });
      if (result.mode !== 'inline' && result.mode !== 'fullscreen' && result.mode !== 'pip') {
        throw new Error('Host returned an invalid display mode');
      }
      _chatGptDisplayModeOverride = result.mode;
      for (const listener of _chatGptAdapterListeners) listener();
      return result;
    }
    if (isEmbeddedHost()) {
      const result = await mcpApps.requestDisplayMode(mode);
      if (result.mode !== 'inline' && result.mode !== 'fullscreen' && result.mode !== 'pip') {
        throw new Error('Host returned an invalid display mode');
      }
      _mcpHostContext = { ..._mcpHostContext, displayMode: result.mode };
      notifyMcpListeners();
      return result;
    }
    throw new Error('Display mode changes are not available');
  }, []);

  return capabilities.requestDisplayMode ? request : null;
}

export function useAdaptiveUpdateModelContext(): ((
  update: {
    text?: string;
    structuredContent?: UnknownObject;
  },
) => Promise<void>) | null {
  const capabilities = useAdaptiveHostCapabilities();
  const update = useCallback(async (
    value: {
      text?: string;
      structuredContent?: UnknownObject;
    },
  ) => {
    if (mcpApps.isInitialized() && _mcpHostCapabilities.updateModelContext) {
      await mcpApps.updateModelContext(value);
      return;
    }
    if (typeof window !== 'undefined' && window.openai?.updateModelContext) {
      const content: ToolResultContent[] | undefined = value.text
        ? [{ type: 'text', text: value.text }]
        : undefined;
      await window.openai.updateModelContext({
        ...(content ? { content } : {}),
        ...(value.structuredContent
          ? { structuredContent: value.structuredContent }
          : {}),
      });
      return;
    }
    if (isEmbeddedHost()) {
      await mcpApps.updateModelContext(value);
      return;
    }
    throw new Error('Model-context updates are not available');
  }, []);

  return capabilities.updateModelContext ? update : null;
}

export function useAdaptiveSendFollowUp(): ((
  prompt: string,
) => Promise<void>) | null {
  const capabilities = useAdaptiveHostCapabilities();
  const send = useCallback(async (prompt: string) => {
    if (mcpApps.isInitialized() && _mcpHostCapabilities.sendFollowUpMessage) {
      await mcpApps.sendMessage(prompt);
      return;
    }
    if (typeof window !== 'undefined' && window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({
        prompt,
        scrollToBottom: false,
      });
      return;
    }
    if (isEmbeddedHost()) {
      await mcpApps.sendMessage(prompt);
      return;
    }
    throw new Error('Follow-up messages are not available');
  }, []);

  return capabilities.sendFollowUpMessage ? send : null;
}

/**
 * Call another MCP tool from within a widget.
 */
export function useAdaptiveCallToolFn(): CallTool {
  return useCallback(async (name: string, args: Record<string, unknown>) => {
    if (mcpApps.isInitialized() && _mcpHostCapabilities.callTool) {
      return mcpApps.callTool(name, args);
    }
    if (typeof window !== 'undefined' && window.openai?.callTool) {
      return normalizeCallToolResult(await window.openai.callTool(name, args));
    }
    if (isEmbeddedHost()) {
      return mcpApps.callTool(name, args);
    }
    throw new Error('callTool is not available');
  }, []);
}

/**
 * Open an external link.
 */
export function useAdaptiveOpenExternal(): (href: string) => void {
  return useCallback((href: string) => {
    if (mcpApps.isInitialized() && _mcpHostCapabilities.openExternal) {
      void mcpApps.openLink(href).catch(() => {});
      return;
    }
    if (typeof window !== 'undefined' && window.openai?.openExternal) {
      window.openai.openExternal({ href });
      return;
    }
    if (isEmbeddedHost()) {
      void mcpApps.openLink(href).catch(() => {});
      return;
    }
    window?.open(href, '_blank', 'noopener,noreferrer');
  }, []);
}

/**
 * Returns the detected host runtime.
 */
export function useHostRuntime(): HostRuntime {
  return detectHost();
}
