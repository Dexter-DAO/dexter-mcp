/**
 * Dual-runtime SDK adapter.
 *
 * Provides unified React hooks that work in both ChatGPT (OpenAI Apps SDK)
 * and MCP Apps hosts (Cursor, Claude Desktop, VS Code).
 *
 * Host detection happens once at module load. Each hook uses a single
 * useSyncExternalStore call that routes to the correct backend based
 * on the detected host, avoiding React hook ordering issues.
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
  ZERO_SAFE_AREA,
  createDefaultCapabilities,
  createDefaultHostContext,
  normalizeMcpCapabilities,
  normalizeMcpHostContext,
  normalizeMcpToolInput,
} from './host-adapter-model';
import * as mcpApps from './mcp-apps-bridge';

type HostRuntime = 'chatgpt' | 'mcp-apps' | 'unknown';

function detectHost(): HostRuntime {
  if (typeof window === 'undefined') return 'unknown';
  if (typeof window.openai !== 'undefined') return 'chatgpt';
  if (window.__isMcpApp) return 'mcp-apps';
  if (window.self !== window.top) return 'mcp-apps';
  return 'unknown';
}

const HOST: HostRuntime = detectHost();

// ── MCP Apps state store ──────────────────────────────────────────────

let _mcpToolOutput: unknown = null;
let _mcpToolInput: unknown = null;
let _mcpToolMeta: unknown = null;
let _mcpTheme: Theme = 'dark';
let _mcpHostContext: AdaptiveHostContext = createDefaultHostContext();
let _mcpHostCapabilities: AdaptiveHostCapabilities = createDefaultCapabilities();
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

function getChatGptHostContext(): AdaptiveHostContext {
  const openai = typeof window !== 'undefined' ? window.openai : undefined;
  const displayMode = openai?.displayMode ?? 'inline';
  const safeArea = openai?.safeArea?.insets ?? ZERO_SAFE_AREA;
  const maxHeight =
    typeof openai?.maxHeight === 'number' && Number.isFinite(openai.maxHeight)
      ? openai.maxHeight
      : undefined;

  return stableSnapshot('chatgpt-host-context', {
    theme: openai?.theme ?? 'dark',
    displayMode,
    availableDisplayModes: typeof openai?.requestDisplayMode === 'function'
      ? Array.from(new Set<DisplayMode>([displayMode, 'inline', 'fullscreen']))
      : [displayMode],
    ...(maxHeight ? { containerDimensions: { maxHeight } } : {}),
    locale: openai?.locale,
    platform: openai?.userAgent?.device?.type === 'mobile'
      ? 'mobile'
      : openai?.userAgent?.device?.type === 'desktop'
        ? 'desktop'
        : undefined,
    deviceCapabilities: openai?.userAgent?.capabilities,
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

if (HOST === 'mcp-apps') {
  initMcpAppsOnce();
}

function tryParseTextContent(content?: Array<{ type: string; text?: string }>): unknown {
  const text = content?.find(c => c.type === 'text')?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ── ChatGPT subscribe/snapshot helpers ────────────────────────────────

function subscribeChatGPT(key: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: CustomEvent<{ globals: Record<string, unknown> }>) => {
    if (Object.prototype.hasOwnProperty.call(event.detail.globals, key)) {
      onChange();
    }
  };
  window.addEventListener('openai:set_globals', handler as EventListener, { passive: true });
  return () => window.removeEventListener('openai:set_globals', handler as EventListener);
}

function subscribeChatGPTGlobals(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener('openai:set_globals', handler as EventListener, { passive: true });
  return () => window.removeEventListener('openai:set_globals', handler as EventListener);
}

// ── MCP Apps subscribe helper ─────────────────────────────────────────

function subscribeMcpApps(onChange: () => void): () => void {
  _mcpListeners.add(onChange);
  return () => { _mcpListeners.delete(onChange); };
}

// ── Unified hooks ─────────────────────────────────────────────────────

/**
 * Get the tool output (structured data for rendering).
 */
export function useToolOutput<T = unknown>(): T | null {
  return useSyncExternalStore(
    HOST === 'chatgpt'
      ? (onChange) => subscribeChatGPT('toolOutput', onChange)
      : HOST === 'mcp-apps'
        ? (onChange) => subscribeMcpApps(onChange)
        : () => () => {},
    HOST === 'chatgpt'
      ? () => (window.openai?.toolOutput ?? null) as T | null
      : HOST === 'mcp-apps'
        ? () => _mcpToolOutput as T | null
        : () => null,
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
    HOST === 'chatgpt'
      ? (onChange) => subscribeChatGPT('toolResponseMetadata', onChange)
      : HOST === 'mcp-apps'
        ? (onChange) => subscribeMcpApps(onChange)
        : () => () => {},
    HOST === 'chatgpt'
      ? () => (window.openai?.toolResponseMetadata ?? null) as T | null
      : HOST === 'mcp-apps'
        ? () => _mcpToolMeta as T | null
        : () => null,
    () => null,
  );
}

/**
 * Get the tool input (what the user asked for).
 */
export function useToolInput<T = Record<string, unknown>>(): T | null {
  return useSyncExternalStore(
    HOST === 'chatgpt'
      ? (onChange) => subscribeChatGPT('toolInput', onChange)
      : HOST === 'mcp-apps'
        ? (onChange) => subscribeMcpApps(onChange)
        : () => () => {},
    HOST === 'chatgpt'
      ? () => (window.openai?.toolInput ?? null) as T | null
      : HOST === 'mcp-apps'
        ? () => _mcpToolInput as T | null
        : () => null,
    () => null,
  );
}

/**
 * Get the current theme.
 */
export function useAdaptiveTheme(): Theme {
  return useSyncExternalStore(
    HOST === 'chatgpt'
      ? (onChange) => subscribeChatGPT('theme', onChange)
      : HOST === 'mcp-apps'
        ? (onChange) => subscribeMcpApps(onChange)
        : () => () => {},
    HOST === 'chatgpt'
      ? () => window.openai?.theme ?? 'dark'
      : HOST === 'mcp-apps'
        ? () => _mcpTheme
        : () => 'dark' as Theme,
    () => 'dark' as Theme,
  );
}

/**
 * Host presentation context normalized across ChatGPT and MCP Apps.
 */
export function useAdaptiveHostContext(): AdaptiveHostContext {
  return useSyncExternalStore(
    HOST === 'chatgpt'
      ? subscribeChatGPTGlobals
      : HOST === 'mcp-apps'
        ? subscribeMcpApps
        : () => () => {},
    HOST === 'chatgpt'
      ? getChatGptHostContext
      : HOST === 'mcp-apps'
        ? () => _mcpHostContext
        : createDefaultHostContext,
    createDefaultHostContext,
  );
}

/**
 * Capabilities are detected from the active host, never from its product name.
 */
export function useAdaptiveHostCapabilities(): AdaptiveHostCapabilities {
  return useSyncExternalStore(
    HOST === 'chatgpt'
      ? subscribeChatGPTGlobals
      : HOST === 'mcp-apps'
        ? subscribeMcpApps
        : () => () => {},
    HOST === 'chatgpt'
      ? getChatGptCapabilities
      : HOST === 'mcp-apps'
        ? () => _mcpHostCapabilities
        : createDefaultCapabilities,
    createDefaultCapabilities,
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
    if (HOST === 'mcp-apps') {
      return mcpApps.requestDisplayMode(mode);
    }
    if (typeof window !== 'undefined' && window.openai?.requestDisplayMode) {
      return window.openai.requestDisplayMode({ mode });
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
    if (HOST === 'mcp-apps') {
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
    throw new Error('Model-context updates are not available');
  }, []);

  return capabilities.updateModelContext ? update : null;
}

export function useAdaptiveSendFollowUp(): ((
  prompt: string,
) => Promise<void>) | null {
  const capabilities = useAdaptiveHostCapabilities();
  const send = useCallback(async (prompt: string) => {
    if (HOST === 'mcp-apps') {
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
    throw new Error('Follow-up messages are not available');
  }, []);

  return capabilities.sendFollowUpMessage ? send : null;
}

/**
 * Call another MCP tool from within a widget.
 */
export function useAdaptiveCallToolFn(): CallTool {
  return useCallback(async (name: string, args: Record<string, unknown>) => {
    if (HOST === 'mcp-apps') {
      return mcpApps.callTool(name, args);
    }
    if (typeof window !== 'undefined' && window.openai?.callTool) {
      return normalizeCallToolResult(await window.openai.callTool(name, args));
    }
    throw new Error('callTool is not available');
  }, []);
}

/**
 * Open an external link.
 */
export function useAdaptiveOpenExternal(): (href: string) => void {
  return useCallback((href: string) => {
    if (HOST === 'mcp-apps') {
      void mcpApps.openLink(href).catch(() => {});
      return;
    }
    if (typeof window !== 'undefined' && window.openai?.openExternal) {
      window.openai.openExternal({ href });
      return;
    }
    window?.open(href, '_blank', 'noopener,noreferrer');
  }, []);
}

/**
 * Returns the detected host runtime.
 */
export function useHostRuntime(): HostRuntime {
  return HOST;
}
