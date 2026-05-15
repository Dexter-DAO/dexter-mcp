import { describe, it, expect } from 'vitest';
import { deriveSlug } from '../slug.js';

describe('deriveSlug', () => {
  it('lowercases', () => {
    expect(deriveSlug('BlockRun.AI')).toBe('blockrun-ai');
  });
  it('replaces non-alphanumeric runs with single hyphen', () => {
    expect(deriveSlug('defi-shield-hazel.vercel.app')).toBe('defi-shield-hazel-vercel-app');
  });
  it('strips leading and trailing hyphens', () => {
    expect(deriveSlug('--foo--bar--')).toBe('foo-bar');
  });
  it('truncates to 64 chars', () => {
    const long = 'a'.repeat(100);
    expect(deriveSlug(long).length).toBe(64);
  });
  it('keeps existing kebab-case unchanged', () => {
    expect(deriveSlug('research-and-narrate')).toBe('research-and-narrate');
  });
  it('decomposes unicode to ASCII (NFKD-preserve-base-letter)', () => {
    expect(deriveSlug('café-é.test')).toBe('cafe-e-test');
  });
  it('throws on empty input after normalization', () => {
    expect(() => deriveSlug('!!!')).toThrow(/slug/i);
  });
});
