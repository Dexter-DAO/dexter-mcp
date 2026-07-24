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
import type { Theme } from './types';
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
let _mcpInitDone = false;
const _mcpListeners = new Set<() => void>();

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
    _mcpToolInput = params;
    notifyMcpListeners();
  });

  mcpApps.initialize().then((result) => {
    _mcpTheme = result.hostContext?.theme ?? 'dark';
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
 * Call another MCP tool from within a widget.
 */
export function useAdaptiveCallToolFn(): (name: string, args: Record<string, unknown>) => Promise<{ result: string }> {
  return useCallback(async (name: string, args: Record<string, unknown>) => {
    if (HOST === 'mcp-apps') {
      return mcpApps.callTool(name, args);
    }
    if (typeof window !== 'undefined' && window.openai?.callTool) {
      return window.openai.callTool(name, args);
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
      mcpApps.openLink(href);
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
