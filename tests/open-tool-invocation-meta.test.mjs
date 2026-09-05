import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPEN_TOOL_NAMES,
  installOpenToolContracts,
  stampOpenToolInvocation,
} from '../lib/open-tool-contracts.mjs';

function capturingServer() {
  const handlers = new Map();
  return {
    handlers,
    registerTool(name, _config, handler) {
      handlers.set(name, handler);
      return {};
    },
  };
}

test('every OpenDexter tool result receives one canonical invocation identity', async () => {
  const server = capturingServer();
  installOpenToolContracts(server);

  for (const name of OPEN_TOOL_NAMES) {
    server.registerTool(name, {}, async () => ({
      content: [{ type: 'text', text: 'Fixture result.' }],
      _meta: { retained: name },
    }));
  }

  assert.equal(server.handlers.size, OPEN_TOOL_NAMES.length);
  const requestId = 'rpc id:/?#[]@!$&\'()*+,;=';
  for (const name of OPEN_TOOL_NAMES) {
    const result = await server.handlers.get(name)({}, { requestId });
    assert.equal(result._meta.retained, name);
    assert.deepEqual(result._meta['dexter/toolInvocation'], {
      toolName: name,
      requestId,
    });
  }

  const inputSpoof = await server.handlers.get('x402_status')({
    requestId: 'model-supplied-id',
  });
  assert.deepEqual(inputSpoof._meta['dexter/toolInvocation'], {
    toolName: 'x402_status',
  });
});

test('invocation identity preserves numeric IDs and omits oversized or non-scalar IDs', () => {
  assert.deepEqual(
    stampOpenToolInvocation('indexter_search', { _meta: { retained: true } }, {
      requestId: 0,
    }),
    {
      _meta: {
        retained: true,
        'dexter/toolInvocation': {
          toolName: 'indexter_search',
          requestId: '0',
        },
      },
    },
  );

  for (const requestId of ['x'.repeat(513), { opaque: true }, null]) {
    const result = stampOpenToolInvocation('dexter_wallet', {}, { requestId });
    assert.deepEqual(result._meta['dexter/toolInvocation'], {
      toolName: 'dexter_wallet',
    });
  }
});
