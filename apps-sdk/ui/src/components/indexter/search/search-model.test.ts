import { describe, expect, it } from 'vitest';

import { getSearchErrorCopy, type SearchPayload } from './search-model';

describe('Indexter state copy', () => {
  it('bounds and normalizes backend-provided error text', () => {
    const payload: SearchPayload = {
      count: 0,
      resources: [],
      error: `  ${'upstream-message '.repeat(40)}  `,
    };

    const error = getSearchErrorCopy(payload);

    expect(error?.title).toBe('Indexter is unavailable');
    expect(error?.description.length).toBe(320);
    expect(error?.description.endsWith('\u2026')).toBe(true);
    expect(error?.description).not.toMatch(/\s{2,}/);
  });
});
