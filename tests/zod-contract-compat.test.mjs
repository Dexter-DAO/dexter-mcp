import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../common.mjs';
import { buildInputSchemaShape } from '../lib/x402/zod.mjs';
import { dateTime, integer, urlString, uuidString } from '../lib/zod-contract-primitives.mjs';

test('integer contracts retain their existing bounds without an implicit safe-integer limit', () => {
  for (const value of [0, -1, 2 ** 53, -(2 ** 53), 1e30]) {
    assert.equal(integer().parse(value), value);
  }
  for (const value of [0.5, NaN, Infinity, '1']) {
    assert.equal(integer().safeParse(value).success, false);
  }
  assert.equal(integer().nonnegative().safeParse(-1).success, false);
  assert.equal(integer().max(10).safeParse(11).success, false);
  assert.equal(z.toJSONSchema(integer(), { target: 'draft-7' }).type, 'integer');
});

test('URL contracts validate without changing the returned string', () => {
  for (const value of ['https://example.com/a', ' https://example.com/a ', 'mailto:a@example.com']) {
    assert.equal(urlString().parse(value), value);
  }
  for (const value of ['', 'not a URL', 1, null]) {
    assert.equal(urlString().safeParse(value).success, false);
  }
});

test('datetime contracts preserve optional seconds, offset policy and calendar validation', () => {
  for (const value of ['2024-02-29T12:30Z', '2024-02-29T12:30:15.123Z']) {
    assert.equal(dateTime().parse(value), value);
  }
  for (const value of ['2024-02-29T12:30+0100', '2024-02-29T12:30:15+01:00']) {
    assert.equal(dateTime({ offset: true }).parse(value), value);
    assert.equal(dateTime().safeParse(value).success, false);
  }
  for (const value of ['2023-02-29T12:30Z', '2024-02-29T25:30Z', '2024-02-29T12:30', '']) {
    assert.equal(dateTime({ offset: true }).safeParse(value).success, false);
  }
});

test('UUID contracts preserve hex-shaped IDs and additional caller constraints', () => {
  for (const value of ['00000000-0000-0000-0000-000000000000', '11111111-2222-3333-4444-555555555555']) {
    assert.equal(uuidString().parse(value), value);
  }
  assert.equal(uuidString().safeParse('not-a-uuid').success, false);
  assert.equal(uuidString().regex(/^[a-f0-9-]+$/).safeParse('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA').success, false);
});

test('private SDK v1 registration validates Zod 4 objects and records before dispatch', async () => {
  const server = await buildMcpServer({ includeToolsets: ['general'] });
  let calls = 0;
  server.registerTool('zod_contract_probe', {
    inputSchema: { type: z.literal('probe'), values: z.record(z.string(), z.string()) },
    outputSchema: z.object({ count: integer() }),
  }, async ({ values }) => {
    calls++;
    return { content: [], structuredContent: { count: Object.keys(values).length } };
  });
  server.registerTool('zod_object_probe', { inputSchema: z.object({ value: z.string() }) },
    async () => ({ content: [] }));
  const client = new Client({ name: 'zod-contract-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.find(t => t.name === 'zod_object_probe').inputSchema.additionalProperties, false);
    const tool = tools.find(t => t.name === 'zod_contract_probe');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.inputSchema.properties.values.additionalProperties.type, 'string');
    const good = await client.callTool({ name: tool.name, arguments: { type: 'probe', values: { a: 'one' } } });
    assert.deepEqual(good.structuredContent, { count: 1 });
    const bad = await client.callTool({ name: tool.name, arguments: { type: 'probe', values: { a: 1 } } });
    assert.equal(bad.isError, true);
    assert.equal(calls, 1);
  } finally {
    await client.close();
    await server.close();
  }
});


test('catalog schemas retain closed nested descriptors and optional fields', () => {
  const schema = z.object(buildInputSchemaShape({ bodyFields: {
    details: { type: 'object', properties: {
      name: { type: 'string', required: true },
      note: { type: 'string' },
    } },
  } }, 'POST'));
  const descriptor = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
  assert.equal(descriptor.properties.details.additionalProperties, false);
  assert.deepEqual(descriptor.properties.details.required, ['name']);
  assert.deepEqual(schema.parse({}), {});
  assert.equal(schema.safeParse({ details: {} }).success, false);
  assert.deepEqual(schema.parse({ details: { name: 'service', extra: 'ignored' } }),
    { details: { name: 'service' } });
});
