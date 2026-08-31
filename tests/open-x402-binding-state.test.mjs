import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildX402CheckBindingUnavailable,
  classifyMcpBindingLookupResponse,
} from '../lib/open-x402-binding-state.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

test('only the API typed 404 proves that no wallet binding exists', async () => {
  assert.deepEqual(
    await classifyMcpBindingLookupResponse(new Response(JSON.stringify({
      ok: false,
      error: 'mcp_binding_not_found',
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })),
    { ok: true, bound: false },
  );
  assert.deepEqual(
    await classifyMcpBindingLookupResponse(new Response(null, { status: 404 })),
    { ok: false, bound: false },
  );
  assert.deepEqual(
    await classifyMcpBindingLookupResponse(new Response('<h1>Not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    })),
    { ok: false, bound: false },
  );
  assert.deepEqual(
    await classifyMcpBindingLookupResponse(new Response(JSON.stringify({
      user_handle: 'bound-user',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })),
    { ok: true, bound: true, userHandle: 'bound-user' },
  );
});

test('a binding outage stays distinct from a missing-intent quote', () => {
  const result = buildX402CheckBindingUnavailable({
    url: 'https://merchant.example/price',
    method: 'POST',
    body: '{"symbol":"SOL"}',
    bodyProvided: true,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.error, 'wallet_connection_temporarily_unavailable');
  assert.equal(result.retryable, true);
  assert.equal(Object.hasOwn(result, 'quoteOnly'), false);
  assert.deepEqual(result.checkedRequest, {
    url: 'https://merchant.example/price',
    method: 'POST',
    body: '{"symbol":"SOL"}',
    requestBound: true,
  });
  assert.equal(
    OPEN_TOOL_CONTRACTS.x402_check.outputSchema.safeParse(result).success,
    true,
  );
});

test('x402_check and x402_access refuse to downgrade a failed binding lookup', async () => {
  const source = await readFile(
    new URL('../open-mcp-server.mjs', import.meta.url),
    'utf8',
  );
  for (const [name, nextName] of [
    ['x402_check', 'x402_access'],
    ['x402_access', 'x402_wallet'],
  ]) {
    const handler = source.slice(
      source.indexOf(`registerOpenTool(server, '${name}'`),
      source.indexOf(`registerOpenTool(server, '${nextName}'`),
    );
    const outageGate = handler.indexOf('if (session.lookupFailed)');
    const canonicalCheck = handler.indexOf('runCanonicalX402Check(args, session)');
    assert.ok(outageGate >= 0, `${name} outage gate missing`);
    assert.ok(canonicalCheck > outageGate, `${name} checked before outage gate`);
    assert.match(handler.slice(outageGate, canonicalCheck), /isError:\s*true/);
  }
});
