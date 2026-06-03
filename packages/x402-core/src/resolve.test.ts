import { describe, it, expect } from 'vitest';
import { resolveInputSchema, resolveOutputSchema } from './resolve.js';

describe('resolveInputSchema', () => {
  it('prefers bazaar declaration over openapi and profile', () => {
    const r = resolveInputSchema({
      bazaar_input_schema: { type: 'object', properties: { domain: { type: 'string' } } },
      openapi_input_schema: { foo: { type: 'string' } },
      service_profile: { input_semantics: [{ field: 'x' }] },
    });
    expect(r.source).toBe('bazaar');
    expect(r.schema).toEqual({ type: 'object', properties: { domain: { type: 'string' } } });
  });

  it('falls through to openapi when bazaar is absent', () => {
    const r = resolveInputSchema({
      bazaar_input_schema: null,
      openapi_input_schema: { foo: { type: 'string' } },
      service_profile: { input_semantics: [{ field: 'x' }] },
    });
    expect(r.source).toBe('openapi');
  });

  it('treats an EMPTY bazaar (no properties) as absent and falls through', () => {
    const r = resolveInputSchema({
      bazaar_input_schema: { type: 'object', properties: {} },
      openapi_input_schema: { foo: { type: 'string' } },
      service_profile: null,
    });
    expect(r.source).toBe('openapi'); // NOT 'bazaar'
  });

  it('falls through to profile when only profile has input', () => {
    const r = resolveInputSchema({
      bazaar_input_schema: null,
      openapi_input_schema: null,
      service_profile: { input_semantics: [{ field: 'x' }] },
    });
    expect(r.source).toBe('profile');
  });

  it('returns none when nothing has input', () => {
    const r = resolveInputSchema({
      bazaar_input_schema: null,
      openapi_input_schema: null,
      service_profile: { input_semantics: [] },
    });
    expect(r.source).toBe('none');
    expect(r.schema).toBeNull();
  });
});

describe('resolveOutputSchema', () => {
  it('prefers bazaar output over none', () => {
    const r = resolveOutputSchema({ bazaar_output_schema: { type: 'object' } });
    expect(r.source).toBe('bazaar');
  });
  it('returns none when no output anywhere', () => {
    const r = resolveOutputSchema({ bazaar_output_schema: null });
    expect(r.source).toBe('none');
    expect(r.schema).toBeNull();
  });
});
