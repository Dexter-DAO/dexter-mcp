const SENSITIVE_KEY =
  /(?:^|_)(?:address|authorization|body|cookie|credential|email|id|input|name|output|password|payload|phone|prompt|query|request|response|secret|session|token|user|wallet)(?:$|_)/i;
const URL_KEY = /(?:url|uri|href|endpoint|origin)/i;
const SAFE_ENUM = /^[a-z0-9_.:-]{1,96}$/i;

export function safeTelemetryUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function safeTelemetryError(error) {
  const name =
    typeof error?.name === 'string' && SAFE_ENUM.test(error.name)
      ? error.name
      : 'Error';
  const code =
    typeof error?.code === 'string' && SAFE_ENUM.test(error.code)
      ? error.code
      : null;
  return code ? { name, code } : { name };
}

function redactedString(value) {
  return { redacted: true, length: value.length };
}

export function sanitizeTelemetryValue(value, key = '', depth = 0) {
  const normalizedKey = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return { numeric: true };
  if (typeof value === 'string') {
    const origin = URL_KEY.test(normalizedKey) || /^https?:\/\//i.test(value)
      ? safeTelemetryUrl(value)
      : null;
    if (origin) return origin;
    if (SENSITIVE_KEY.test(normalizedKey)) return redactedString(value);
    return SAFE_ENUM.test(value) ? value : redactedString(value);
  }
  if (value instanceof Error) return safeTelemetryError(value);
  if (Array.isArray(value)) return { count: value.length };
  if (typeof value !== 'object') return { redacted: true };
  if (depth >= 3) return { redacted: true };

  const clean = {};
  for (const [nestedKey, nestedValue] of Object.entries(value).slice(0, 32)) {
    clean[nestedKey] = sanitizeTelemetryValue(nestedValue, nestedKey, depth + 1);
  }
  return clean;
}

export function sanitizeTelemetryRecord(value) {
  const clean = sanitizeTelemetryValue(value);
  return clean && typeof clean === 'object' && !Array.isArray(clean)
    ? clean
    : { value: clean };
}

export function safeTelemetryLabel(value, fallback = 'redacted') {
  return typeof value === 'string' && SAFE_ENUM.test(value) ? value : fallback;
}
