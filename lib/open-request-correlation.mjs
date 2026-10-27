import { createHash, randomUUID } from 'node:crypto';
import {
  JSONRPCMessageSchema,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  isJSONRPCErrorResponse,
} from '@modelcontextprotocol/sdk/types.js';

const LOGGED_METHODS = new Set([
  'initialize', 'ping', 'tools/list', 'tools/call', 'resources/list',
  'resources/templates/list', 'resources/read', 'resources/subscribe',
  'resources/unsubscribe', 'prompts/list', 'prompts/get', 'logging/setLevel',
  'completion/complete',
]);

/** Protect the SDK's per-session request-ID maps before dispatch can mutate them. */
export function createOpenRequestCorrelation({ logEvent = () => {}, sessionRef = () => null } = {}) {
  const active = new Map();
  const logSalt = randomUUID();
  let attached = false;
  let closed = false;
  let observedServer = null;

  const idRef = id => createHash('sha256')
    .update(logSalt).update(typeof id).update(JSON.stringify(id)).digest('hex').slice(0, 16);
  function emit(event, fields = {}) {
    try {
      const ref = sessionRef();
      logEvent({ event, sessionRef: typeof ref === 'string' ? ref.slice(0, 32) : null, ...fields });
    } catch { /* Logging must not change request execution. */ }
  }
  function entryFields(entry) {
    return {
      httpRequestRef: entry.httpRequestRef,
      requestIdRef: entry.requestIdRef,
      requestIdType: typeof entry.id,
      method: entry.method,
    };
  }
  function release(entry, outcome) {
    if (active.get(entry.id) !== entry) return;
    active.delete(entry.id);
    entry.signal?.removeEventListener('abort', entry.onAbort);
    emit('completed', { ...entryFields(entry), outcome });
  }
  function finish(entry) {
    if (active.get(entry.id) !== entry) return;
    if (entry.terminalSucceeded && entry.terminalInFlight === 0 && (!entry.handlerObserved || entry.handlerDone)) {
      release(entry, 'terminal_sent');
    } else if (
      entry.handlerDone && entry.signal?.aborted && !entry.terminalStarted
    ) {
      // Protocol._onrequest suppresses the result/error after an aborted handler
      // finishes. A disconnected HTTP response does not establish this state.
      release(entry, 'cancelled_handler_finished');
    }
    // A rejected send can be followed by another terminal send. Retain ownership
    // until one succeeds or the session closes, including after HTTP disconnect.
  }
  function close() {
    if (closed) return;
    closed = true;
    const count = active.size;
    for (const entry of active.values()) {
      entry.signal?.removeEventListener('abort', entry.onAbort);
    }
    active.clear();
    emit('session_closed', { unfinishedRequests: count });
  }

  function observeServer(server) {
    if (observedServer === server) return;
    if (observedServer || typeof server?.setRequestHandler !== 'function') {
      throw new Error('MCP request handler registration unavailable for correlation');
    }
    observedServer = server;
    const register = server.setRequestHandler.bind(server);
    server.setRequestHandler = (schema, handler) => register(schema, async (request, extra) => {
      // SDK request-schema parsing strips the JSON-RPC envelope ID. The public
      // handler context retains its original typed ID.
      const entry = active.get(extra.requestId);
      if (!entry || !entry.dispatched) return handler(request, extra);
      entry.handlerObserved = true;
      entry.signal = extra.signal;
      entry.onAbort = () => finish(entry);
      entry.signal?.addEventListener('abort', entry.onAbort, { once: true });
      try {
        return await handler(request, extra);
      } finally {
        entry.handlerDone = true;
        finish(entry);
      }
    });
  }

  function reject(res, status, id, reason, message) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32600, message, data: { reason } } }));
  }

  function attachTransport(transport) {
    if (attached || !observedServer || typeof transport?.onmessage !== 'function') {
      throw new Error('MCP correlation must attach once after server connection');
    }
    attached = true;
    const receive = transport.onmessage;
    transport.onmessage = (message, extra) => {
      if (isJSONRPCRequest(message)) {
        const entry = active.get(message.id);
        if (entry) entry.dispatched = true;
      }
      return receive(message, extra);
    };
    const onclose = transport.onclose;
    transport.onclose = () => { close(); onclose?.(); };
    const send = transport.send.bind(transport);
    transport.send = async (message, options) => {
      const terminal = isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);
      const entry = terminal ? active.get(message.id) : null;
      if (entry) {
        entry.terminalStarted = true;
        entry.terminalInFlight += 1;
      }
      try {
        await send(message, options);
        if (entry) entry.terminalSucceeded = true;
      } catch (error) {
        if (entry) emit('terminal_send_failed', entryFields(entry));
        throw error;
      } finally {
        if (entry) {
          entry.terminalInFlight -= 1;
          finish(entry);
        }
      }
    };
    const handle = transport.handleRequest.bind(transport);
    transport.handleRequest = async (req, res, parsedBody) => {
      if (req.method !== 'POST' || closed) return handle(req, res, parsedBody);
      const httpRequestRef = randomUUID();
      const raw = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
      const messages = [];
      for (const value of raw) {
        const parsed = JSONRPCMessageSchema.safeParse(value);
        if (!parsed.success) {
          emit('rejected_invalid', { httpRequestRef });
          reject(res, 400, null, 'invalid_jsonrpc_message', 'Invalid JSON-RPC message.');
          return;
        }
        messages.push(parsed.data);
      }
      const requests = messages.filter(isJSONRPCRequest);
      const seen = new Set();
      for (const message of requests) {
        const owner = active.get(message.id);
        const repeatedInBatch = seen.has(message.id);
        if (owner || repeatedInBatch) {
          const reason = owner ? 'request_id_in_flight' : 'duplicate_batch_request_id';
          emit('rejected_duplicate', {
            httpRequestRef, requestIdRef: idRef(message.id), requestIdType: typeof message.id,
            ownerHttpRequestRef: owner?.httpRequestRef ?? null, reason,
          });
          reject(res, 409, Array.isArray(parsedBody) ? null : message.id, reason,
            owner ? 'Request ID is already in use.' : 'Request IDs must be unique within one batch.');
          return;
        }
        seen.add(message.id);
      }
      // The complete batch is validated before any reservation or SDK await.
      const entries = requests.map(message => ({
        id: message.id, httpRequestRef, requestIdRef: idRef(message.id),
        method: LOGGED_METHODS.has(message.method) ? message.method : 'other',
        dispatched: false, handlerObserved: false, handlerDone: false,
        terminalStarted: false, terminalSucceeded: false, terminalInFlight: 0,
        signal: null, onAbort: null,
      }));
      for (const entry of entries) {
        active.set(entry.id, entry);
        emit('accepted', entryFields(entry));
      }
      if (entries.length) {
        res.once('close', () => emit('http_closed', {
          httpRequestRef,
          unfinishedRequests: entries.filter(entry => active.get(entry.id) === entry).length,
        }));
      }
      try {
        return await handle(req, res, parsedBody);
      } finally {
        for (const entry of entries) {
          if (!entry.dispatched) release(entry, 'rejected_before_dispatch');
        }
      }
    };
    return transport;
  }

  return { observeServer, attachTransport };
}
