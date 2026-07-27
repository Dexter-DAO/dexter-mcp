/**
 * MCP Apps JSON-RPC 2.0 bridge over postMessage.
 *
 * This compatibility layer preserves the existing lightweight runtime while
 * following the protocol shapes from @modelcontextprotocol/ext-apps. The
 * lightweight bridge remains deliberate because it preserves both ChatGPT's
 * compatibility surface and the MCP Apps postMessage protocol.
 */

import { normalizeCallToolResult } from './call-tool-result.ts';
import type { CallToolResult, DisplayMode, ToolResultContent } from './types.ts';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type McpAppsTheme = 'light' | 'dark';

export type McpAppsHostContext = {
  theme?: McpAppsTheme;
  displayMode?: DisplayMode;
  availableDisplayModes?: DisplayMode[];
  containerDimensions?: {
    width?: number;
    maxWidth?: number;
    height?: number;
    maxHeight?: number;
  };
  locale?: string;
  timeZone?: string;
  userAgent?: string;
  platform?: 'web' | 'desktop' | 'mobile';
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  styles?: {
    variables?: Record<string, string>;
    css?: {
      fonts?: string;
    };
  };
  [key: string]: unknown;
};

export type McpAppsHostCapabilities = {
  openLinks?: Record<string, never>;
  downloadFile?: Record<string, never>;
  serverTools?: {
    listChanged?: boolean;
  };
  updateModelContext?: {
    text?: Record<string, never>;
    structuredContent?: Record<string, never>;
    [key: string]: unknown;
  };
  message?: {
    text?: Record<string, never>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type McpAppsInitResult = {
  protocolVersion?: string;
  hostInfo?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  hostCapabilities?: McpAppsHostCapabilities;
  hostContext?: McpAppsHostContext;
  [key: string]: unknown;
};

export type McpAppsToolResult = {
  content?: ToolResultContent[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: unknown;
  result?: string;
  [key: string]: unknown;
};

export type McpAppsToolInput = Record<string, unknown>;

export type ModelContextUpdate = {
  text?: string;
  structuredContent?: Record<string, unknown>;
};

export type DownloadFileParams = {
  contents: Array<Record<string, unknown>>;
};

type NotificationHandler = (params: unknown) => void;

const REQUEST_TIMEOUT_MS = 30_000;
let _nextId = 1;
const _pending = new Map<number, PendingRequest>();
const _notificationHandlers = new Map<string, Set<NotificationHandler>>();
let _initialized = false;
let _initPromise: Promise<McpAppsInitResult> | null = null;
let _initResult: McpAppsInitResult | null = null;
let _hostContext: McpAppsHostContext = {};
let _hostCapabilities: McpAppsHostCapabilities = {};
let _messageListenerAttached = false;

function getDeclaredDisplayModes(): DisplayMode[] {
  if (typeof document === 'undefined') return ['inline'];
  const content = document
    .querySelector<HTMLMetaElement>('meta[name="dexter-app-display-modes"]')
    ?.content;
  const modes = content
    ?.split(/\s+/)
    .filter((mode): mode is DisplayMode => (
      mode === 'inline' || mode === 'fullscreen' || mode === 'pip'
    ));
  return modes?.length ? Array.from(new Set(modes)) : ['inline'];
}

function sendRequest(method: string, params?: unknown): Promise<unknown> {
  const id = _nextId++;
  const message: JsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`MCP Apps request timed out: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    _pending.set(id, { resolve, reject, timeoutId });
    window.parent.postMessage(message, '*');
  });
}

function sendNotification(method: string, params?: unknown): void {
  const message: JsonRpcNotification = {
    jsonrpc: '2.0',
    method,
    ...(params === undefined ? {} : { params }),
  };
  window.parent.postMessage(message, '*');
}

function dispatchNotification(method: string, params: unknown): void {
  const handlers = _notificationHandlers.get(method);
  if (!handlers) return;

  for (const handler of handlers) {
    try {
      handler(params);
    } catch {
      // A consumer error must not break the protocol event loop.
    }
  }
}

function applyHostContext(context: McpAppsHostContext): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (context.theme) {
    root.setAttribute('data-theme', context.theme);
    root.style.colorScheme = context.theme;
  }

  for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
    if (typeof value === 'string') root.style.setProperty(name, value);
  }

  const fonts = context.styles?.css?.fonts;
  if (fonts) {
    let style = document.getElementById('__mcp-host-fonts') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = '__mcp-host-fonts';
      document.head.appendChild(style);
    }
    style.textContent = fonts;
  }
}

function handleMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  const data = event.data as JsonRpcResponse | JsonRpcNotification | undefined;
  if (!data || data.jsonrpc !== '2.0') return;

  if ('id' in data && (data.result !== undefined || data.error !== undefined)) {
    const pending = _pending.get(data.id);
    if (!pending) return;
    _pending.delete(data.id);
    clearTimeout(pending.timeoutId);

    if (data.error) {
      pending.reject(new Error(data.error.message ?? 'MCP Apps RPC error'));
    } else {
      pending.resolve(data.result);
    }
    return;
  }

  if ('method' in data && !('id' in data)) {
    if (
      data.method === 'ui/notifications/host-context-changed'
      && data.params
      && typeof data.params === 'object'
      && !Array.isArray(data.params)
    ) {
      _hostContext = {
        ..._hostContext,
        ...data.params as McpAppsHostContext,
      };
      applyHostContext(_hostContext);
    }
    dispatchNotification(data.method, data.params);
  }
}

export function onNotification(
  method: string,
  handler: NotificationHandler,
): () => void {
  let handlers = _notificationHandlers.get(method);
  if (!handlers) {
    handlers = new Set();
    _notificationHandlers.set(method, handlers);
  }
  handlers.add(handler);
  return () => {
    handlers?.delete(handler);
  };
}

export async function initialize(): Promise<McpAppsInitResult> {
  if (_initialized && _initResult) return _initResult;
  if (_initPromise) return _initPromise;

  if (!_messageListenerAttached) {
    window.addEventListener('message', handleMessage);
    _messageListenerAttached = true;
  }

  _initPromise = (async () => {
    const result = await sendRequest('ui/initialize', {
      protocolVersion: '2026-01-26',
      appCapabilities: {
        availableDisplayModes: getDeclaredDisplayModes(),
      },
      appInfo: {
        name: 'dexter-apps-sdk',
        version: '0.2.0',
      },
    }) as McpAppsInitResult;

    _initResult = result;
    _hostContext = result.hostContext ?? {};
    _hostCapabilities = result.hostCapabilities ?? {};
    applyHostContext(_hostContext);
    _initialized = true;

    sendNotification('ui/notifications/initialized');
    startSizeChangedNotifications();

    return result;
  })();

  try {
    return await _initPromise;
  } catch (error) {
    _initPromise = null;
    throw error;
  }
}

/**
 * Mirrors the official SDK's automatic size reporting.
 */
function startSizeChangedNotifications(): void {
  if (typeof ResizeObserver === 'undefined') return;

  let scheduled = false;
  let lastWidth = 0;
  let lastHeight = 0;

  const measure = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const root = document.documentElement;
      const previousWidth = root.style.width;
      const previousHeight = root.style.height;
      root.style.width = 'fit-content';
      root.style.height = 'max-content';
      const rect = root.getBoundingClientRect();
      root.style.width = previousWidth;
      root.style.height = previousHeight;

      const scrollbarWidth = window.innerWidth - root.clientWidth;
      const width = Math.ceil(rect.width + scrollbarWidth);
      const height = Math.ceil(rect.height);

      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        sendNotification('ui/notifications/size-changed', { width, height });
      }
    });
  };

  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(document.documentElement);
  if (document.body) observer.observe(document.body);
}

export function getInitResult(): McpAppsInitResult | null {
  return _initResult;
}

export function getHostContext(): McpAppsHostContext | null {
  return _initialized ? _hostContext : null;
}

export function getHostCapabilities(): McpAppsHostCapabilities | null {
  return _initialized ? _hostCapabilities : null;
}

export function isInitialized(): boolean {
  return _initialized;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const response = await sendRequest('tools/call', {
    name,
    arguments: args,
  });
  return normalizeCallToolResult(response);
}

export async function openLink(href: string): Promise<void> {
  let result: { isError?: boolean } | undefined;
  try {
    result = await sendRequest('ui/open-link', { url: href }) as {
      isError?: boolean;
    };
  } catch (error) {
    const opened = window.open(href, '_blank', 'noopener,noreferrer');
    if (!opened) throw error;
    return;
  }
  if (result?.isError) {
    throw new Error('The host declined to open this link');
  }
}

// Diagnostic-only variant used by the passkey probe. Unlike openLink(), this
// reports the host response and never opens a browser fallback.
export async function openLinkProbe(
  href: string,
): Promise<
  { ok: true; response: unknown }
  | { ok: false; error: string }
> {
  try {
    const response = await sendRequest('ui/open-link', { url: href });
    const result = response as { isError?: boolean } | undefined;
    return result?.isError
      ? { ok: false, error: 'The host declined to open this link' }
      : { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function updateModelContext(
  context: ModelContextUpdate,
): Promise<void> {
  await sendRequest('ui/update-model-context', {
    ...(context.text
      ? { content: [{ type: 'text', text: context.text }] }
      : {}),
    ...(context.structuredContent
      ? { structuredContent: context.structuredContent }
      : {}),
  });
}

export async function sendMessage(prompt: string): Promise<void> {
  const result = await sendRequest('ui/message', {
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  }) as { isError?: boolean } | undefined;
  if (result?.isError) {
    throw new Error('The host declined the follow-up message');
  }
}

export async function requestDisplayMode(
  mode: DisplayMode,
): Promise<{ mode: DisplayMode }> {
  return sendRequest('ui/request-display-mode', { mode }) as Promise<{
    mode: DisplayMode;
  }>;
}

export async function downloadFile(
  params: DownloadFileParams,
): Promise<void> {
  const result = await sendRequest('ui/download-file', params) as {
    isError?: boolean;
  } | undefined;
  if (result?.isError) {
    throw new Error('The host declined the file download');
  }
}

export function isMcpAppsHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__isMcpApp) return true;
  if (typeof window.openai !== 'undefined') return false;
  return window.self !== window.top;
}

declare global {
  interface Window {
    __isMcpApp?: boolean;
  }
}
