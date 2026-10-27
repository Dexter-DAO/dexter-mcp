import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createOpenRequestCorrelation } from '../lib/open-request-correlation.mjs';

const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input);
  assert(url.protocol === 'http:' && url.hostname === '127.0.0.1', 'Tests allow loopback HTTP only');
  return localFetch(input, options);
};

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
async function bounded(promise, label, ms = 2000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Deadline: ' + label)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function until(predicate, label) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Deadline: ' + label);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
const call = (id, label) => ({
  jsonrpc: '2.0', id, method: 'tools/call',
  params: { name: 'correlation_probe', arguments: { label } },
});
const notification = id => ({
  jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id },
});

async function fixture({ modifySend, serverFactory, throwLog = false } = {}) {
  const logs = [];
  const errors = [];
  const gates = new Map();
  const started = [];
  const closedHttp = [];
  const clients = [];
  const correlation = createOpenRequestCorrelation({
    sessionRef: () => 'synthetic-session-reference',
    logEvent: event => { logs.push(event); if (throwLog) throw new Error('log sink failed'); },
  });
  const mcp = serverFactory ? await serverFactory(correlation)
    : new McpServer({ name: 'correlation-test', version: '1' });
  if (!serverFactory) correlation.observeServer(mcp.server);
  mcp.server.onerror = error => errors.push(error.message);
  mcp.registerTool('correlation_probe', { inputSchema: { label: z.string() } }, async ({ label }, extra) => {
    const gate = gates.get(label);
    assert(gate, 'Unprepared local label: ' + label);
    started.push({ label, id: extra.requestId });
    gate.signal = extra.signal;
    gate.started.resolve();
    await gate.release.promise;
    gate.returned.resolve();
    if (gate.throwError) throw new Error('synthetic handler error');
    return { content: [{ type: 'text', text: label }], structuredContent: { label } };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'local-' + Math.random().toString(36).slice(2) });
  await mcp.connect(transport);
  modifySend?.(transport);
  correlation.attachTransport(transport);
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/mcp');
      let raw = '';
      for await (const chunk of req) { raw += chunk; assert(raw.length < 8192); }
      const body = JSON.parse(raw);
      res.on('close', () => closedHttp.push(body?.params?.arguments?.label ?? body?.method ?? 'batch'));
      await transport.handleRequest(req, res, body);
    } catch (error) {
      errors.push('HTTP: ' + error.message);
      if (!res.headersSent) { res.writeHead(500); res.end(); } else res.destroy();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/mcp';
  function post(body, headerOverrides = {}) {
    const controller = new AbortController();
    const record = { status: null, raw: '', ended: false, error: null, contentType: null };
    const done = (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST', signal: controller.signal,
          headers: {
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
            ...(transport.sessionId ? { 'Mcp-Session-Id': transport.sessionId } : {}),
            ...headerOverrides,
          },
          body: JSON.stringify(body),
        });
        record.status = response.status;
        record.contentType = response.headers.get('content-type');
        for await (const chunk of response.body ?? []) record.raw += new TextDecoder().decode(chunk);
      } catch (error) { record.error = error.name; }
      finally { record.ended = true; }
      return record;
    })();
    const result = {
      record, controller, done,
      messages: () => record.contentType?.includes('text/event-stream')
        ? record.raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
        : record.raw ? [JSON.parse(record.raw)] : [],
    };
    clients.push(result);
    return result;
  }
  async function complete(client) { return bounded(client.done, 'HTTP completion'); }
  function gate(label) {
    const value = { started: deferred(), release: deferred(), returned: deferred(), signal: null };
    gates.set(label, value);
    return value;
  }
  async function begin(id, label) {
    const control = gate(label);
    const client = post(call(id, label));
    await bounded(control.started.promise, 'tool start');
    return { ...client, control };
  }
  async function finish(client, expectedLabel) {
    client.control.release.resolve();
    await complete(client);
    assert.equal(client.messages()[0]?.result?.structuredContent?.label, expectedLabel);
  }
  async function conflict(id, label = 'must-not-run') {
    const client = post(call(id, label));
    await complete(client);
    assert.equal(client.record.status, 409);
    assert.equal(client.messages()[0].error.data.reason, 'request_id_in_flight');
    assert.equal(started.some(row => row.label === label), false);
    return client;
  }
  async function close() {
    for (const control of gates.values()) control.release.resolve();
    for (const client of clients) client.controller.abort();
    await mcp.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await Promise.all(clients.map(client => client.done));
  }
  try {
    const initialization = post({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'local-only', version: '1' },
    } });
    await complete(initialization);
    assert.equal(initialization.record.status, 200);
    const ready = post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await complete(ready);
    assert.equal(ready.record.status, 202);
  } catch (error) { await close(); throw error; }
  return { transport, mcp, logs, errors, gates, started, closedHttp, post, gate, begin, finish, conflict, complete, close };
}

test('overlapping duplicate cannot replace the original SDK stream or run a second handler', async () => {
  const f = await fixture();
  try {
    const first = await f.begin(7, 'overview');
    const originalMapping = f.transport._webStandardTransport._requestToStreamMapping.get(7);
    await f.conflict(7);
    assert.equal(f.transport._webStandardTransport._requestToStreamMapping.get(7), originalMapping);
    assert.equal(f.started.length, 1);
    await f.finish(first, 'overview');
    const next = await f.begin(7, 'nansen');
    await f.finish(next, 'nansen');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

for (const ids of [[7, 8], [7, '7'], [0, '0']]) {
  test('distinct typed IDs retain concurrent delivery: ' + JSON.stringify(ids), async () => {
    const f = await fixture();
    try {
      const first = await f.begin(ids[0], 'overview');
      const second = await f.begin(ids[1], 'nansen');
      await f.finish(second, 'nansen');
      assert.equal(first.record.ended, false);
      await f.finish(first, 'overview');
      assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
  });
}

test('HTTP disconnect retains ownership during the handler and after failed delivery', async () => {
  const f = await fixture();
  try {
    const first = await f.begin(7, 'overview');
    first.controller.abort();
    await f.complete(first);
    await until(() => f.closedHttp.includes('overview'), 'HTTP closed');
    await f.conflict(7, 'before-completion');
    first.control.release.resolve();
    await until(() => f.errors.some(error => error.includes('No connection established for request ID: 7')), 'actual SDK send failure');
    await f.conflict(7, 'after-failed-send');
    assert.equal(f.logs.some(row => row.event === 'terminal_send_failed'), true);
  } finally { await f.close(); }
});

test('successful sequential reuse releases only after the terminal send promise settles', async () => {
  const sendGate = deferred();
  const f = await fixture({ modifySend: transport => {
    const original = transport.send.bind(transport);
    transport.send = async (message, options) => {
      await original(message, options);
      if (message.result?.structuredContent?.label === 'overview') await sendGate.promise;
    };
  } });
  try {
    const first = await f.begin(7, 'overview');
    first.control.release.resolve();
    await f.complete(first);
    await f.conflict(7);
    sendGate.resolve();
    await until(() => f.logs.some(row => row.event === 'completed' && row.requestIdType === 'number'), 'send completion');
    const next = await f.begin(7, 'nansen');
    await f.finish(next, 'nansen');
  } finally { sendGate.resolve(); await f.close(); }
});

test('failed send retains ownership through a delayed successful terminal fallback', async () => {
  let failed = false;
  const f = await fixture({ modifySend: transport => {
    const original = transport.send.bind(transport);
    transport.send = async (message, options) => {
      if (!failed && message.result?.structuredContent?.label === 'overview') {
        failed = true;
        throw new Error('synthetic first terminal send failure');
      }
      return original(message, options);
    };
  } });
  try {
    const first = await f.begin(7, 'overview');
    first.control.release.resolve();
    await until(() => f.errors.some(error => error.includes('synthetic first terminal send failure')), 'send failure');
    await f.conflict(7);
    // Installed Protocol currently logs the send failure. Inject the possible
    // later fallback to verify ownership does not depend on that SDK behavior.
    await f.transport.send({ jsonrpc: '2.0', id: 7, error: { code: -32603, message: 'synthetic terminal fallback' } });
    await f.complete(first);
    assert.equal(first.messages()[0]?.error?.message, 'synthetic terminal fallback');
    const next = await f.begin(7, 'nansen');
    await f.finish(next, 'nansen');
  } finally { await f.close(); }
});

test('cancellation retains ownership until the old handler finishes and cannot clear its successor', async () => {
  const f = await fixture();
  try {
    const first = await f.begin(7, 'overview');
    const cancellation = f.post(notification(7));
    await f.complete(cancellation);
    await until(() => first.control.signal.aborted, 'SDK handler abort');
    await f.conflict(7);
    first.control.release.resolve();
    await bounded(first.control.returned.promise, 'cancelled tool callback returned');
    try {
      await until(() => f.logs.some(row => row.outcome === 'cancelled_handler_finished'), 'cancelled handler completion');
    } catch (error) {
      throw new Error(error.message + ': ' + JSON.stringify({ logs: f.logs, errors: f.errors, aborted: first.control.signal.aborted }));
    }
    const next = await f.begin(7, 'nansen');
    await f.conflict(7, 'after-old-finally');
    assert.equal(first.messages().length, 0);
    await f.finish(next, 'nansen');
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('batch duplicates reject atomically before any SDK map or handler mutation', async () => {
  const f = await fixture();
  try {
    const response = f.post([call(7, 'overview'), call(7, 'nansen')]);
    await f.complete(response);
    assert.equal(response.record.status, 409);
    assert.equal(response.messages()[0].error.data.reason, 'duplicate_batch_request_id');
    assert.equal(f.started.length, 0);
    assert.equal(f.transport._webStandardTransport._requestToStreamMapping.has(7), false);
    const next = await f.begin(7, 'later');
    await f.finish(next, 'later');
  } finally { await f.close(); }
});

test('batch conflict with an existing owner never executes its otherwise valid sibling', async () => {
  const f = await fixture();
  try {
    const first = await f.begin(7, 'overview');
    const response = f.post([call(8, 'must-not-run'), call(7, 'nansen')]);
    await f.complete(response);
    assert.equal(response.record.status, 409);
    assert.deepEqual(f.started, [{ label: 'overview', id: 7 }]);
    assert.equal(f.transport._webStandardTransport._requestToStreamMapping.has(8), false);
    await f.finish(first, 'overview');
  } finally { await f.close(); }
});

test('valid distinct-ID batch preserves both responses', async () => {
  const f = await fixture();
  try {
    const a = f.gate('overview');
    const b = f.gate('nansen');
    const response = f.post([call(7, 'overview'), call(8, 'nansen')]);
    await bounded(Promise.all([a.started.promise, b.started.promise]), 'batch handlers');
    b.release.resolve(); a.release.resolve();
    await f.complete(response);
    assert.deepEqual(response.messages().map(m => [m.id, m.result.structuredContent.label]).sort(), [[7, 'overview'], [8, 'nansen']]);
  } finally { await f.close(); }
});

for (const body of [null, 7, 'invalid', { jsonrpc: '1.0', id: 7, method: 'tools/call' }, [call(7, 'never'), { broken: true }]]) {
  test('malformed JSON-RPC reserves nothing: ' + JSON.stringify(body), async () => {
    const f = await fixture();
    try {
      const response = f.post(body);
      await f.complete(response);
      assert.equal(response.record.status, 400);
      assert.equal(f.started.length, 0);
      const next = await f.begin(7, 'later');
      await f.finish(next, 'later');
    } finally { await f.close(); }
  });
}

test('SDK rejection before dispatch releases the reservation', async () => {
  const f = await fixture();
  try {
    const response = f.post(call(7, 'never'), { 'MCP-Protocol-Version': 'unsupported' });
    await f.complete(response);
    assert.equal(response.record.status, 400);
    assert.equal(f.started.length, 0);
    assert(f.logs.some(row => row.outcome === 'rejected_before_dispatch'));
    const next = await f.begin(7, 'later');
    await f.finish(next, 'later');
  } finally { await f.close(); }
});

test('handler errors finish through the SDK error response and allow reuse', async () => {
  const f = await fixture();
  try {
    const first = await f.begin(7, 'overview');
    first.control.throwError = true;
    first.control.release.resolve();
    await f.complete(first);
    assert.equal(first.messages()[0].result.isError, true);
    const next = await f.begin(7, 'nansen');
    await f.finish(next, 'nansen');
  } finally { await f.close(); }
});

test('sessions with the same typed ID execute concurrently and teardown isolates late completion', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    const first = await a.begin(7, 'old');
    const second = await b.begin(7, 'new');
    await a.mcp.close();
    assert(a.logs.some(row => row.event === 'session_closed' && row.unfinishedRequests === 1));
    first.control.release.resolve();
    await bounded(first.control.returned.promise, 'old handler return');
    await b.conflict(7);
    await b.finish(second, 'new');
  } finally { await a.close(); await b.close(); }
});

test('correlation logs omit raw IDs, arguments, payloads and exceptions; logging failure is harmless', async () => {
  const f = await fixture({ throwLog: true });
  try {
    const first = await f.begin('private-request-id', 'private-tool-argument');
    await f.conflict('private-request-id');
    await f.finish(first, 'private-tool-argument');
    const serialized = JSON.stringify(f.logs);
    assert.equal(serialized.includes('private-request-id'), false);
    assert.equal(serialized.includes('private-tool-argument'), false);
    for (const row of f.logs) assert(JSON.stringify(row).length < 450);
    assert(f.logs.some(row => row.event === 'rejected_duplicate'));
  } finally { await f.close(); }
});

test('the actual application factory installs observation before registering tool handlers', async () => {
  const { createOpenMcpServer } = await import('../open-mcp-server.mjs');
  const methods = [];
  const requestCorrelation = createOpenRequestCorrelation();
  let observed = null;
  const server = createOpenMcpServer({ includeResources: false, requestCorrelation: {
    observeServer(protocol) {
      observed = protocol;
      requestCorrelation.observeServer(protocol);
      const register = protocol.setRequestHandler.bind(protocol);
      protocol.setRequestHandler = (schema, handler) => {
        methods.push(schema.shape.method.value);
        return register(schema, handler);
      };
    },
  } });
  try {
    assert.equal(observed, server.server);
    assert(methods.includes('tools/call'));
    assert(methods.includes('tools/list'));
  } finally {
    await server.close();
    await (await import('@sentry/node')).close(0);
  }
});
