import { useEffect, useRef } from 'react';

/**
 * Reports the widget's actual content height to ChatGPT on every layout change.
 * Uses ResizeObserver so height updates fire when content expands/collapses
 * (JSON viewer toggle, funding panel show/hide, results loading, etc.),
 * not just on the initial render.
 */
export function useIntrinsicHeight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = () => {
      const notify = (window as any).openai?.notifyIntrinsicHeight;
      if (typeof notify === 'function') {
        notify({ height: el.scrollHeight });
      }
    };

    report();

    window.addEventListener('openai:set_globals', report, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(report);
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener('openai:set_globals', report);
    };
  }, []);

  return ref;
}
