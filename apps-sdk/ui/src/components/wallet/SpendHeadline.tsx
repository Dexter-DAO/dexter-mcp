import { useEffect, useRef, useState } from 'react';
import { splitUsd } from './format';

/**
 * The "You can spend $X" headline with a count-up on mount.
 * Honors prefers-reduced-motion and guarantees the resting value even if
 * requestAnimationFrame stalls.
 */
export function SpendHeadline({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    const guard = window.setTimeout(() => setDisplay(value), duration + 150);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(guard);
    };
  }, [value]);

  const { int, cents } = splitUsd(display);
  return (
    <div className="dxw-hero">
      <div className="dxw-spend-label">You can spend</div>
      <div className="dxw-spend-amount">
        <span className="dxw-cur">$</span><span>{int}</span><span className="dxw-cents">{cents}</span>
      </div>
    </div>
  );
}
