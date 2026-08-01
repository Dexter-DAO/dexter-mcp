import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('non_integer_identity_number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (
    !value
    || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError('unsupported_governed_identity_value');
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => {
    if (item === undefined) {
      throw new TypeError(`undefined_governed_identity_value:${key}`);
    }
    return `${JSON.stringify(key)}:${canonicalJson(item)}`;
  }).join(',')}}`;
}

export function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
