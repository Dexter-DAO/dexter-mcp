/* Money + time formatting for the wallet widget. Pure functions, no deps. */

/** Split a USD value into integer (with grouping) and 2-decimal cents parts. */
export function splitUsd(value: number): { int: string; cents: string } {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? '-' : '';
  if (Math.abs(safe) > Number.MAX_SAFE_INTEGER / 100) {
    return {
      int: sign + Math.abs(safe).toLocaleString('en-US', { maximumFractionDigits: 0 }),
      cents: '.00',
    };
  }
  const roundedCents = Math.round((Math.abs(safe) + Number.EPSILON) * 100);
  const int = sign + Math.floor(roundedCents / 100).toLocaleString('en-US');
  const cents = `.${String(roundedCents % 100).padStart(2, '0')}`;
  return { int, cents };
}

/** Compact visual magnitude for large balances. Exact value remains in AT copy. */
export function compactUsdMagnitude(value: number): string | null {
  const safe = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safe);
  if (absolute < 1_000_000) return null;
  const sign = safe < 0 ? '-' : '';
  const scales = [
    { value: 1e15, suffix: 'Q' },
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
  ];
  const scale = scales.find((candidate) => absolute >= candidate.value);
  if (!scale || absolute >= 1e18) {
    const exponential = absolute.toExponential(2).replace(/\.00e/, 'e').replace(/(\.\d)0e/, '$1e');
    return `${sign}${exponential}`;
  }
  const scaled = absolute / scale.value;
  const fractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const formatted = scaled.toFixed(fractionDigits).replace(/\.0+$/, '');
  return `${sign}${formatted}${scale.suffix}`;
}

/** `$1,284.50`: exact two-decimal presentation for labels and assistive text. */
export function fmtExactUsd(value: number): string {
  return '$' + (Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Compact visible USD; ordinary balances retain exact two-decimal formatting. */
export function fmtUsd(value: number): string {
  const compact = compactUsdMagnitude(value);
  return compact ? `$${compact}` : fmtExactUsd(value);
}

/** Signed amount for an activity row: `−$0.04` / `+$50.00`. Uses a real minus glyph. */
export function fmtSignedUsd(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? '−' : '+';
  return `${sign}${fmtUsd(Math.abs(v))}`;
}

/** Signed exact amount for assistive text and user-inspectable values. */
export function fmtExactSignedUsd(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? '−' : '+';
  return `${sign}${fmtExactUsd(Math.abs(v))}`;
}

/** `6yKDrT…2mRk4` — head/tail elision for a wallet address. */
export function shortAddr(addr?: string): string {
  if (!addr) return '';
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-5)}` : addr;
}

/** Compact relative time: `just now`, `2 min ago`, `3 h ago`, `Mon`. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  if (secs < 86400 * 6) return new Date(then).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
