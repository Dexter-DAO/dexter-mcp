import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileHostedCheckInputSchema } from '../lib/open-check-schema.mjs';

const persistedOpenApi = {
  type: 'object',
  properties: {
    contents: { type: 'array' },
  },
  required: ['contents'],
  additionalProperties: false,
};

const persistedEnrichment = {
  resource: {
    method: 'post',
    input_schema: persistedOpenApi,
    input_schema_source: 'openapi',
    input_schema_rejected_sources: ['bazaar'],
  },
};

test('informative live seller schema remains first', () => {
  const liveSchema = {
    type: 'object',
    properties: { prompt: { type: 'string' } },
    required: ['prompt'],
    additionalProperties: false,
  };

  const resolved = reconcileHostedCheckInputSchema({
    liveSchema,
    enrichment: persistedEnrichment,
    resourceUrl: 'https://seller.example/v1/generate',
    method: 'POST',
  });

  assert.equal(resolved.schema, liveSchema);
  assert.deepEqual(resolved, {
    schema: liveSchema,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  });
});

test('closed zero-field live schema falls back to richer persisted schema', () => {
  for (const liveSchema of [
    { type: 'object', properties: {}, additionalProperties: false },
    { type: 'object', additionalProperties: false },
  ]) {
    assert.deepEqual(reconcileHostedCheckInputSchema({
      liveSchema,
      enrichment: persistedEnrichment,
      resourceUrl: 'https://seller.example/v1/generate',
      method: 'POST',
    }), {
      schema: persistedOpenApi,
      source: 'openapi',
      replaced: true,
      rejectedSources: ['bazaar'],
    });
  }
});

test('fixed-operation sole-field phantom falls back only with richer corroboration', () => {
  const livePhantom = {
    type: 'object',
    properties: { generateContent: { type: 'string' } },
    required: ['generateContent'],
    additionalProperties: false,
  };
  const resourceUrl = 'https://seller.example/v1/models/model:generateContent';

  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: livePhantom,
    enrichment: persistedEnrichment,
    resourceUrl,
    method: 'POST',
  }), {
    schema: persistedOpenApi,
    source: 'openapi',
    replaced: true,
    rejectedSources: ['bazaar'],
  });

  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: livePhantom,
    enrichment: {
      resource: {
        method: 'POST',
        input_schema: livePhantom,
        input_schema_source: 'bazaar',
        input_schema_rejected_sources: [],
      },
    },
    resourceUrl,
    method: 'POST',
  }), {
    schema: livePhantom,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  });
});

test('fixed-operation sole-field input is not replaced without Bazaar rejection evidence', () => {
  const liveOneField = {
    type: 'object',
    properties: { run: { type: 'boolean' } },
    required: ['run'],
    additionalProperties: false,
  };
  const enrichmentWithoutCorroboration = {
    resource: {
      method: 'POST',
      input_schema: persistedOpenApi,
      input_schema_source: 'openapi',
      input_schema_rejected_sources: [],
    },
  };

  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: liveOneField,
    enrichment: enrichmentWithoutCorroboration,
    resourceUrl: 'https://seller.example/v1/reports/report:run',
    method: 'POST',
  }), {
    schema: liveOneField,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  });
});

test('no persisted DB schema leaves the live schema unchanged', () => {
  const liveSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema,
    enrichment: { resource: { method: 'POST', input_schema_source: 'openapi' } },
    resourceUrl: 'https://seller.example/v1/generate',
    method: 'POST',
  }), {
    schema: liveSchema,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  });
});

test('missing live schema uses a concrete persisted schema', () => {
  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: undefined,
    enrichment: persistedEnrichment,
    resourceUrl: 'https://seller.example/v1/generate',
    method: 'POST',
  }), {
    schema: persistedOpenApi,
    source: 'openapi',
    replaced: true,
    rejectedSources: ['bazaar'],
  });
});

test('LLM profile and cached Bazaar sources never repair an exact live check schema', () => {
  const liveClosedEmpty = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };
  for (const inputSchemaSource of ['profile', 'bazaar']) {
    assert.deepEqual(reconcileHostedCheckInputSchema({
      liveSchema: liveClosedEmpty,
      enrichment: {
        resource: {
          method: 'POST',
          input_schema: persistedOpenApi,
          input_schema_source: inputSchemaSource,
          input_schema_rejected_sources: [],
        },
      },
      resourceUrl: 'https://seller.example/v1/generate',
      method: 'POST',
    }), {
      schema: liveClosedEmpty,
      source: 'live',
      replaced: false,
      rejectedSources: [],
    });
  }
});

test('free-form and schema-valued additionalProperties count as concrete persisted inputs', () => {
  for (const inputSchema of [
    { type: 'object', properties: {}, additionalProperties: true },
    { type: 'object', properties: {}, additionalProperties: {} },
    {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
  ]) {
    assert.deepEqual(reconcileHostedCheckInputSchema({
      liveSchema: undefined,
      enrichment: {
        resource: {
          method: 'POST',
          input_schema: inputSchema,
          input_schema_source: 'openapi',
          input_schema_rejected_sources: [],
        },
      },
      resourceUrl: 'https://seller.example/v1/free-form',
      method: 'POST',
    }), {
      schema: inputSchema,
      source: 'openapi',
      replaced: true,
      rejectedSources: [],
    });
  }
});

test('URL-only enrichment cannot repair a different checked method', () => {
  const liveClosedEmpty = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  for (const persistedMethod of ['GET', 'PATCH']) {
    assert.deepEqual(reconcileHostedCheckInputSchema({
      liveSchema: liveClosedEmpty,
      enrichment: {
        resource: {
          ...persistedEnrichment.resource,
          method: persistedMethod,
        },
      },
      resourceUrl: 'https://seller.example/v1/shared-route',
      method: 'POST',
    }), {
      schema: liveClosedEmpty,
      source: 'live',
      replaced: false,
      rejectedSources: [],
    });
  }
});

test('persisted method identity is required and compared case-insensitively', () => {
  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: undefined,
    enrichment: {
      resource: {
        ...persistedEnrichment.resource,
        method: ' post ',
      },
    },
    resourceUrl: 'https://seller.example/v1/generate',
    method: 'POST',
  }), {
    schema: persistedOpenApi,
    source: 'openapi',
    replaced: true,
    rejectedSources: ['bazaar'],
  });

  assert.deepEqual(reconcileHostedCheckInputSchema({
    liveSchema: undefined,
    enrichment: {
      resource: {
        ...persistedEnrichment.resource,
        method: undefined,
      },
    },
    resourceUrl: 'https://seller.example/v1/generate',
    method: 'POST',
  }), {
    schema: undefined,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  });
});
