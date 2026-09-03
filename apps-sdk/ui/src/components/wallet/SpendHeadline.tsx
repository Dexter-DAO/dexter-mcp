import { useEffect, useId, useRef, useState } from 'react';
import { compactUsdMagnitude, fmtExactUsd, splitUsd } from './format';

/**
 * The account-capacity headline with a count-up on mount.
 * Honors prefers-reduced-motion and guarantees the resting value even if
 * requestAnimationFrame stalls.
 */
export function SpendHeadline({ value, label }: { value: number; label: string }) {
  const labelId = useId();
  const valueId = useId();
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const duration = 300;
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

  const compact = compactUsdMagnitude(display);
  const { int, cents } = compact ? { int: compact, cents: '' } : splitUsd(display);
  return (
    <div
      className="dxw-hero"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={valueId}
    >
      <h1 className="dxw-spend-label" id={labelId}>{label}</h1>
      <span className="sr-only" id={valueId}>{fmtExactUsd(value)}</span>
      <div className="dxw-spend-amount" aria-hidden="true">
        <span className="dxw-cur">$</span><span>{int}</span>
        {cents ? <span className="dxw-cents">{cents}</span> : null}
      </div>
    </div>
  );
}
