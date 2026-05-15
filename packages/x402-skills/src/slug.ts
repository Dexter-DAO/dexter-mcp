const MAX_SLUG_LENGTH = 64;

/**
 * Normalize an arbitrary string (a host name or a user-supplied skill_name) into
 * a kebab-case ASCII slug suitable for filesystem paths and URL segments.
 *
 * Rules: lowercase, strip non-ASCII, replace any run of non-alphanumeric
 * characters with a single hyphen, trim leading/trailing hyphens, truncate to
 * 64 chars (and trim again after truncation).
 *
 * Throws if the normalized result is empty.
 */
export function deriveSlug(input: string): string {
  const ascii = input.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  const lower = ascii.toLowerCase();
  const hyphenated = lower.replace(/[^a-z0-9]+/g, '-');
  const trimmed = hyphenated.replace(/^-+|-+$/g, '');
  const truncated = trimmed.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  if (!truncated) {
    throw new Error(`Cannot derive slug from input: "${input}"`);
  }
  return truncated;
}
