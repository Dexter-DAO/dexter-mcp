import { useCallback, useState } from 'react';
import type { CallToolResult } from './types';

type UseCallToolReturn = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult | null>;
  isLoading: boolean;
  error: string | null;
  result: CallToolResult | null;
  reset: () => void;
};

/**
 * Hook for calling MCP tools directly from widgets.
 * Wraps window.openai.callTool with loading/error state management.
 */
export function useCallTool(): UseCallToolReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CallToolResult | null>(null);

  const callTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    if (typeof window === 'undefined' || !window.openai?.callTool) {
      setError('callTool is not available in this context');
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
      const message = err instanceof Error ? err.message : 'Failed to call tool';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { callTool, isLoading, error, result, reset };
}

/**
 * Simplified hook that just returns the callTool function.
 * Use when you want to manage state yourself.
 */
export function useCallToolFn() {
  return useCallback(async (name: string, args: Record<string, unknown>) => {
    if (typeof window === 'undefined' || !window.openai?.callTool) {
      throw new Error('callTool is not available');
    }
    return window.openai.callTool(name, args);
  }, []);
}
