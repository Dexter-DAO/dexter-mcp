/* Money + time formatting for the wallet widget. Pure functions, no deps. */

/** Split a USD value into integer (with grouping) and 2-decimal cents parts. */
export function splitUsd(value: number): { int: string; cents: string } {
  const safe = Number.isFinite(value) ? value : 0;
  const int = Math.floor(safe).toLocaleString('en-US');
  const cents = '.' + Math.round((safe - Math.floor(safe)) * 100).toString().padStart(2, '0');
  return { int, cents };
}

/** `$1,284.50` — flat two-decimal dollars. */
export function fmtUsd(value: number): string {
  return '$' + (Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Signed amount for an activity row: `−$0.04` / `+$50.00`. Uses a real minus glyph. */
export function fmtSignedUsd(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? '−' : '+';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
