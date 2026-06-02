import { describe, it, expect } from 'vitest';
import { extractBazaarSchema } from '../bazaar.js';

/**
 * Fixtures use the two REAL bazaar shapes we verified live:
 *   1. AgentMail create-inbox — POST with info.input.body + a published
 *      schema.properties.{input,output} object.
 *   2. Ava-style /whois/lookup — GET with info.input.queryParams + a published
 *      schema...input.queryParams.properties shape (the half the old parser
 *      dropped).
 * Plus the malformed/missing cases that must yield an all-null object.
 */

describe('extractBazaarSchema', () => {
  it('parses the AgentMail create-inbox POST body shape', () => {
    const extensions = {
      bazaar: {
        info: {
          input: {
            type: 'http',
            method: 'POST',
            bodyType: 'json',
            body: {
              domain: '<domain>',
              username: '<username>',
              client_id: '<client_id>',
              display_name: '<display_name>',
            },
          },
          output: {
            type: 'json',
            example: {},
          },
        },
        schema: {
          properties: {
            input: {
              type: 'object',
              properties: {
                body: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                    username: { type: 'string' },
                    client_id: { type: 'string' },
                    display_name: { type: 'string' },
                  },
                },
              },
            },
            output: {
              type: 'object',
              properties: {
                inbox_id: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const result = extractBazaarSchema(extensions);

    // inputBody has exactly the 4 published keys
    expect(result.inputBody).not.toBeNull();
    expect(Object.keys(result.inputBody as Record<string, unknown>).sort()).toEqual(
      ['client_id', 'display_name', 'domain', 'username'],
    );

    // method is the uppercased POST
    expect(result.inputMethod).toBe('POST');

    // body field shapes come from schema...input.body.properties
    expect(result.bodyFieldShapes).not.toBeNull();
    expect(Object.keys(result.bodyFieldShapes as Record<string, unknown>).sort()).toEqual(
      ['client_id', 'display_name', 'domain', 'username'],
    );

    // queryParams half is absent for this POST seller
    expect(result.inputQueryParams).toBeNull();
    expect(result.queryParamShapes).toBeNull();

    // inputSchema convenience prefers the published schema.properties.input
    expect(result.inputSchema).not.toBeNull();
    expect(result.inputSchema).toBe(extensions.bazaar.schema.properties.input);

    // outputSchema convenience prefers schema.properties.output
    expect(result.outputSchema).not.toBeNull();
    expect(result.outputSchema).toBe(extensions.bazaar.schema.properties.output);
    expect(result.outputShape).toBe(extensions.bazaar.schema.properties.output);

    // output example surfaced from info.output.example
    expect(result.outputExample).toEqual({});
  });

  it('parses the GET queryParams shape (Ava-style)', () => {
    const extensions = {
      bazaar: {
        info: {
          input: {
            type: 'http',
            method: 'GET',
            queryParams: { domain: 'apple.com' },
          },
          output: {
            type: 'json',
            example: { registrar: 'MarkMonitor' },
          },
        },
        schema: {
          properties: {
            input: {
              type: 'object',
              properties: {
                queryParams: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                  },
                },
              },
            },
            output: {
              type: 'object',
              properties: {
                registrar: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const result = extractBazaarSchema(extensions);

    // the dropped half is now read
    expect(result.inputQueryParams).not.toBeNull();
    expect((result.inputQueryParams as Record<string, unknown>).domain).toBe('apple.com');

    expect(result.queryParamShapes).not.toBeNull();
    expect(Object.keys(result.queryParamShapes as Record<string, unknown>)).toEqual(['domain']);

    // method is the uppercased GET
    expect(result.inputMethod).toBe('GET');

    // no body half for this GET seller
    expect(result.inputBody).toBeNull();
    expect(result.bodyFieldShapes).toBeNull();

    // inputSchema convenience prefers the published schema.properties.input
    // (which here carries the queryParams shape) — non-null and reflects query.
    expect(result.inputSchema).not.toBeNull();
    expect(result.inputSchema).toBe(extensions.bazaar.schema.properties.input);

    expect(result.outputSchema).toBe(extensions.bazaar.schema.properties.output);
  });

  it('synthesizes inputSchema from info.input.queryParams when no published schema (GET)', () => {
    // No schema.properties at all — must fall back to info.input for the
    // convenience field, picking queryParams for a GET.
    const extensions = {
      bazaar: {
        info: {
          input: {
            type: 'http',
            method: 'GET',
            queryParams: { domain: 'apple.com' },
          },
          output: { type: 'json', example: { ok: true } },
        },
      },
    };

    const result = extractBazaarSchema(extensions);

    expect(result.inputMethod).toBe('GET');
    expect(result.inputQueryParams).toEqual({ domain: 'apple.com' });
    expect(result.queryParamShapes).toBeNull(); // no published shape
    // convenience falls back to the queryParams example for a GET
    expect(result.inputSchema).toEqual({ domain: 'apple.com' });
    // outputSchema falls back to info.output
    expect(result.outputSchema).toEqual({ type: 'json', example: { ok: true } });
  });

  it('returns the all-null object for malformed / missing input, never throwing', () => {
    const NULL_FIELDS = {
      inputBody: null,
      inputQueryParams: null,
      inputMethod: null,
      outputExample: null,
      bodyFieldShapes: null,
      queryParamShapes: null,
      outputShape: null,
      inputSchema: null,
      outputSchema: null,
    };

    expect(extractBazaarSchema(undefined)).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema(null)).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema({})).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema({ bazaar: 'garbage' })).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema({ bazaar: { info: 42 } })).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema('not even an object')).toEqual(NULL_FIELDS);
    expect(extractBazaarSchema(['array', 'top', 'level'])).toEqual(NULL_FIELDS);
  });
});
