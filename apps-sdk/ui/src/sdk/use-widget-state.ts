import { useCallback, useState, useEffect, useRef } from 'react';
import { useOpenAIGlobal } from './use-openai-global';

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * Hook for persistent widget state that survives across tool calls.
 * Similar to useState but persisted by ChatGPT.
 */
export function useWidgetState<T extends Record<string, unknown>>(
  initialState: T
): [T, (action: SetStateAction<T>) => Promise<void>] {
  const hostState = useOpenAIGlobal('widgetState') as T | null;
  const [localState, setLocalState] = useState<T>(hostState ?? initialState);
  const stateRef = useRef(localState);

  // Sync with host state when it changes
  useEffect(() => {
    if (hostState) {
      stateRef.current = hostState;
      setLocalState(hostState);
    }
  }, [hostState]);

  const setState = useCallback(async (action: SetStateAction<T>) => {
    const newState = typeof action === 'function'
      ? (action as (prev: T) => T)(stateRef.current)
      : action;

    stateRef.current = newState;
    setLocalState(newState);

    if (typeof window !== 'undefined' && window.openai?.setWidgetState) {
      await window.openai.setWidgetState(newState);
    }
  }, []);

  return [localState, setState];
}
