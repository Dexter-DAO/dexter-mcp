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
import {
  ToolInvocationStore,
  type ToolInvocationClock,
  type ToolInvocationLifecycle,
} from './tool-invocation-lifecycle';

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

let _mcpTheme: Theme = 'dark';
let _mcpHostContext: AdaptiveHostContext = DEFAULT_HOST_CONTEXT;
let _mcpHostCapabilities: AdaptiveHostCapabilities = DEFAULT_HOST_CAPABILITIES;
let _mcpInitDone = false;
const _mcpListeners = new Set<() => void>();
const _adaptiveSnapshotCache = new Map<string, { serialized: string; value: unknown }>();
type ChatGptInvocationHydrationState = {
  toolInput: unknown;
  toolOutput: unknown;
  toolResponseMetadata: unknown;
  widgetSessionId: unknown;
};
let _chatGptInvocationHydrationState: ChatGptInvocationHydrationState | null = null;

function invocationHydrationState(
  globals: Record<string, unknown>,
): ChatGptInvocationHydrationState {
  return {
    toolInput: globals.toolInput,
    toolOutput: globals.toolOutput,
    toolResponseMetadata: globals.toolResponseMetadata,
    widgetSessionId: globals.widgetSessionId,
  };
}

function invocationClock(): ToolInvocationClock | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as Record<string, unknown>).__dexterToolInvocationClock;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
  const value = candidate as Record<string, unknown>;
  if (
    typeof value.now !== 'function'
    || typeof value.setTimeout !== 'function'
    || typeof value.clearTimeout !== 'function'
  ) return undefined;
  return {
    now: value.now as ToolInvocationClock['now'],
    setTimeout: value.setTimeout as ToolInvocationClock['setTimeout'],
    clearTimeout: value.clearTimeout as ToolInvocationClock['clearTimeout'],
  };
}

const _invocations = new ToolInvocationStore({ clock: invocationClock() });

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

_invocations.subscribe(notifyMcpListeners);

function chatGptInvocationGlobals(
  changedGlobals?: Record<string, unknown>,
): Record<string, unknown> | null {
  if (typeof window === 'undefined' || !window.openai) return null;
  const changed = changedGlobals ?? {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(changed, key);
  const includeAll = changedGlobals === undefined;
  const invocationChanged = includeAll
    || has('toolInput')
    || has('toolOutput')
    || has('toolResponseMetadata')
    || has('widgetSessionId');
  if (!invocationChanged) return null;

  const globals = window.openai as unknown as Record<string, unknown>;
  return {
    ...(includeAll || has('toolInput')
      ? { toolInput: has('toolInput') ? changed.toolInput : globals.toolInput }
      : {}),
    // A metadata-only update must never inherit an older output from the
    // mutable window global. Output updates may pair with the metadata in the
    // same event or the host's already-updated metadata global.
    ...(includeAll || has('toolOutput')
      ? { toolOutput: has('toolOutput') ? changed.toolOutput : globals.toolOutput }
      : {}),
    ...(includeAll || has('toolResponseMetadata') || has('toolOutput')
      ? {
          toolResponseMetadata: has('toolResponseMetadata')
            ? changed.toolResponseMetadata
            : globals.toolResponseMetadata,
        }
      : {}),
    widgetSessionId: has('widgetSessionId')
      ? changed.widgetSessionId
      : globals.widgetSessionId,
  };
}

function hydrateChatGptInvocation(): void {
  const globals = chatGptInvocationGlobals();
  if (!globals) return;
  const next = invocationHydrationState(globals);
  const previous = _chatGptInvocationHydrationState;
  if (
    previous
    && Object.is(previous.toolInput, next.toolInput)
    && Object.is(previous.toolOutput, next.toolOutput)
    && Object.is(previous.toolResponseMetadata, next.toolResponseMetadata)
    && Object.is(previous.widgetSessionId, next.widgetSessionId)
  ) return;

  // Record the observed global references before updating the store because
  // the store notifies React synchronously. Re-read whenever any reference
  // changes so a host update in React's render-to-subscribe gap still attaches.
  _chatGptInvocationHydrationState = next;
  _invocations.acceptChatGptGlobals(globals, {
    allowUnboundLegacyHydration: true,
  });
}

function initMcpAppsOnce() {
  if (_mcpInitDone) return;
  _mcpInitDone = true;

  mcpApps.onNotification('ui/notifications/tool-result', (params: unknown) => {
    _invocations.acceptResult(params, 'mcp-apps');
  });

  mcpApps.onNotification('ui/notifications/tool-input', (params: unknown) => {
    _invocations.acceptInput(normalizeMcpToolInput(params), 'mcp-apps');
  });

  mcpApps.onNotification('ui/notifications/tool-cancelled', (params: unknown) => {
    const reason = params && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, unknown>).reason
      : null;
    _invocations.cancel(reason);
  });

  mcpApps.onNotification('ui/notifications/host-context-changed', (params: unknown) => {
    _invocations.activateHostContext(
      params,
      typeof window !== 'undefined' ? window.openai?.widgetSessionId : null,
    );
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
    _invocations.activateHostContext(
      result.hostContext,
      typeof window !== 'undefined' ? window.openai?.widgetSessionId : null,
    );
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

function subscribeChatGPTGlobals(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  _chatGptAdapterListeners.add(onChange);
  const handler = (event: CustomEvent<{ globals?: Record<string, unknown> }>) => {
    const globals = event.detail?.globals ?? {};
    if (Object.prototype.hasOwnProperty.call(globals, 'displayMode')) {
      _chatGptDisplayModeOverride = null;
    }
    const invocationGlobals = chatGptInvocationGlobals(globals);
    if (invocationGlobals) _invocations.acceptChatGptGlobals(invocationGlobals);
    // Mark the complete current globals as observed. In particular, a
    // metadata-only event must not be followed by a snapshot hydration that
    // pairs that identity with an older output still present on window.openai.
    const currentInvocationGlobals = chatGptInvocationGlobals();
    if (currentInvocationGlobals) {
      _chatGptInvocationHydrationState = invocationHydrationState(
        currentInvocationGlobals,
      );
    }
    onChange();
  };
  window.addEventListener('openai:set_globals', handler as EventListener, { passive: true });
  hydrateChatGptInvocation();
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
    () => {
      hydrateChatGptInvocation();
      return (_invocations.getSnapshot().output ?? null) as T | null;
    },
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
    () => {
      hydrateChatGptInvocation();
      return (_invocations.getSnapshot().metadata ?? null) as T | null;
    },
    () => null,
  );
}

/**
 * Get the tool input (what the user asked for).
 */
export function useToolInput<T = Record<string, unknown>>(): T | null {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => {
      hydrateChatGptInvocation();
      return (_invocations.getSnapshot().input ?? null) as T | null;
    },
    () => null,
  );
}

/**
 * Read-only lifecycle for the host-owned tool invocation attached to this
 * widget. Rendering this state never starts or retries a tool call.
 */
export function useToolInvocationLifecycle(): ToolInvocationLifecycle {
  return useSyncExternalStore(
    subscribeAdaptive,
    () => {
      hydrateChatGptInvocation();
      return _invocations.getSnapshot();
    },
    () => _invocations.getSnapshot(),
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
