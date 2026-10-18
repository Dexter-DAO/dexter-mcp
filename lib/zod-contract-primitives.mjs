import { z } from 'zod';

// Preserve the existing wire contracts where Zod 4 changed validation or output.
// Zod 3 integers had no implicit safe-integer bounds.
export const integer = () => z.number().multipleOf(1)
  .meta({ type: 'integer', multipleOf: undefined });

// Zod 4's URL validator trims the returned string. Keep the caller's exact URL.
export const urlString = () => z.stringFormat('uri', (value) => URL.canParse(value));

// The prior datetime contract permits omitted seconds and colonless offsets.
const date = z.regexes.date.source.slice(1, -1);
const time = '([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d+)?)?';
export function dateTime({ offset = false } = {}) {
  const pattern = new RegExp(`^${date}T${time}(${offset ? 'Z|[+-]\\d{2}:?\\d{2}' : 'Z'})$`);
  return z.stringFormat('date-time', (value) => pattern.test(value));
}

// Zod 3 accepted UUID-shaped hex strings without version or variant restrictions.
export const uuidString = () => z.stringFormat('uuid', (value) => z.regexes.guid.test(value))
  .meta({ format: 'uuid' });
