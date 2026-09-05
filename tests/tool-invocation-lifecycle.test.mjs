import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEXTER_TOOL_INVOCATION_META_KEY,
  OPENAI_WIDGET_SESSION_META_KEY,
  TOOL_RESULT_ATTACH_TIMEOUT_MS,
  ToolInvocationStore,
  hostToolInvocationIdentity,
  normalizeToolResponseMetadata,
} from '../apps-sdk/ui/src/sdk/tool-invocation-lifecycle.ts';

class FakeClock {
  time = 1_000;
  nextId = 1;
  timers = new Map();

  now = () => this.time;

  setTimeout = (callback, delayMs) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delayMs, callback });
    return id;
  };

  clearTimeout = (id) => {
    this.timers.delete(id);
  };

  advance(ms) {
    const target = this.time + ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      this.time = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
    }
    this.time = target;
  }
}

function hostContext(toolName, requestId, widgetSessionId = null) {
  return {
    toolInfo: {
      id: requestId,
      tool: { name: toolName, inputSchema: { type: 'object' } },
    },
    ...(widgetSessionId
      ? { [OPENAI_WIDGET_SESSION_META_KEY]: widgetSessionId }
      : {}),
  };
}

function metadata(toolName, requestId, widgetSessionId = null) {
  return {
    [DEXTER_TOOL_INVOCATION_META_KEY]: { toolName, requestId },
    ...(widgetSessionId
      ? { [OPENAI_WIDGET_SESSION_META_KEY]: widgetSessionId }
      : {}),
  };
}

function result(toolName, requestId, output, widgetSessionId = null) {
  return {
    structuredContent: output,
    content: [{ type: 'text', text: JSON.stringify(output) }],
    _meta: metadata(toolName, requestId, widgetSessionId),
  };
}

function makeStore() {
  const fake = new FakeClock();
  const store = new ToolInvocationStore({ clock: fake });
  return { fake, store };
}

test('metadata normalization accepts canonical envelopes and direct legacy metadata', () => {
  const direct = metadata('indexter_search', 'request-1', 'widget-1');
  assert.deepEqual(normalizeToolResponseMetadata(direct), direct);
  assert.deepEqual(normalizeToolResponseMetadata({ _meta: direct }), direct);
  assert.deepEqual(
    normalizeToolResponseMetadata({ toolResponseMetadata: { _meta: direct } }),
    direct,
  );
  assert.equal(normalizeToolResponseMetadata(null), null);
});

test('host tool name, request id, and widget session form the owning identity', () => {
  assert.deepEqual(
    hostToolInvocationIdentity(
      hostContext('indexter_search', 41, 'widget-alpha'),
    ),
    {
      toolName: 'indexter_search',
      requestId: '41',
      widgetSessionId: 'widget-alpha',
    },
  );
});

test('mismatched and duplicate results cannot overwrite the active invocation', () => {
  const { store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', 'request-a', 'widget-a'));
  store.acceptInput({ query: 'weather' }, 'mcp-apps');
  assert.equal(store.getSnapshot().status, 'running');

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'request-b', { marker: 'wrong' }, 'widget-b'),
      'mcp-apps',
    ),
    false,
  );
  assert.equal(store.getSnapshot().status, 'running');
  assert.equal(store.getSnapshot().output, null);

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'request-a', { marker: 'right' }, 'widget-a'),
      'mcp-apps',
    ),
    true,
  );
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'right' });

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'request-a', { marker: 'late-duplicate' }, 'widget-a'),
      'mcp-apps',
    ),
    false,
  );
  assert.deepEqual(store.getSnapshot().output, { marker: 'right' });
});

test('missing binding and missing output are malformed, then time out and recover late', () => {
  const { fake, store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', 'request-a', 'widget-a'));
  store.acceptInput({ query: 'weather' }, 'mcp-apps');

  assert.equal(
    store.acceptResult({ structuredContent: { marker: 'unbound' } }, 'mcp-apps'),
    false,
  );
  assert.equal(store.getSnapshot().status, 'malformed');
  assert.match(store.getSnapshot().message, /did not identify/i);

  assert.equal(
    store.acceptResult({ _meta: metadata('indexter_search', 'request-a', 'widget-a') }, 'mcp-apps'),
    false,
  );
  assert.equal(store.getSnapshot().status, 'malformed');
  assert.match(store.getSnapshot().message, /no usable output/i);

  fake.advance(TOOL_RESULT_ATTACH_TIMEOUT_MS);
  assert.equal(store.getSnapshot().status, 'timed_out');
  assert.match(store.getSnapshot().message, /30 seconds/i);
  assert.match(store.getSnapshot().message, /No action was taken/i);

  store.acceptInput({ query: 'late input' }, 'mcp-apps');
  store.acceptResult(
    { _meta: metadata('indexter_search', 'request-a', 'widget-a'), content: [] },
    'mcp-apps',
  );
  assert.equal(store.getSnapshot().status, 'timed_out');
  assert.match(store.getSnapshot().message, /30 seconds/i);

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'request-a', { marker: 'late-valid' }, 'widget-a'),
      'mcp-apps',
    ),
    true,
  );
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'late-valid' });
});

test('cancellation after host context is terminal and never accepts a late result', () => {
  const { fake, store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', 'request-c', 'widget-c'));
  store.acceptInput({ query: 'cancel me' }, 'mcp-apps');
  assert.equal(store.cancel('user action'), true);
  assert.equal(store.getSnapshot().status, 'cancelled');
  assert.match(store.getSnapshot().message, /user action/i);

  fake.advance(TOOL_RESULT_ATTACH_TIMEOUT_MS * 2);
  assert.equal(store.getSnapshot().status, 'cancelled');
  assert.equal(
    store.acceptResult(
      result('indexter_search', 'request-c', { marker: 'too-late' }, 'widget-c'),
      'mcp-apps',
    ),
    false,
  );
  assert.equal(store.getSnapshot().output, null);
});

test('cancellation before delayed host context rekeys and remains terminal', () => {
  const { fake, store } = makeStore();
  assert.equal(store.cancel('user action'), true);
  const beforeBinding = store.getSnapshot();
  assert.equal(beforeBinding.status, 'cancelled');
  assert.equal(fake.timers.size, 0);

  assert.equal(
    store.activateHostContext(
      hostContext('indexter_search', 'rpc-1', 'widget-a'),
    ),
    true,
  );
  const bound = store.getSnapshot();
  assert.deepEqual(bound.identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
  assert.equal(bound.status, 'cancelled');
  assert.match(bound.message, /user action/i);
  assert.equal(bound.startedAt, beforeBinding.startedAt);
  assert.equal(fake.timers.size, 0);

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'rpc-1', { marker: 'too-late' }, 'widget-a'),
      'mcp-apps',
    ),
    false,
  );
  fake.advance(TOOL_RESULT_ATTACH_TIMEOUT_MS * 2);
  assert.equal(store.getSnapshot().status, 'cancelled');
  assert.equal(store.getSnapshot().output, null);
});

test('late ChatGPT globals cannot replace a host-bound MCP result', () => {
  const { store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', 'request-a', 'widget-a'));
  store.acceptInput({ query: 'right query' }, 'mcp-apps');
  store.acceptResult(
    result('indexter_search', 'request-a', { marker: 'right' }, 'widget-a'),
    'mcp-apps',
  );

  assert.equal(store.acceptChatGptGlobals({
    toolInput: { query: 'stale query' },
    toolOutput: { marker: 'stale' },
    toolResponseMetadata: {
      _meta: metadata('indexter_search', 'request-b', 'widget-b'),
    },
    widgetSessionId: 'widget-b',
  }), false);
  assert.equal(store.getSnapshot().identity.requestId, 'request-a');
  assert.deepEqual(store.getSnapshot().input, { query: 'right query' });
  assert.deepEqual(store.getSnapshot().output, { marker: 'right' });
});

test('server binding supplies request id when toolInfo omits it', () => {
  const { store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', undefined, 'widget-a'));
  store.acceptInput({ query: 'weather' }, 'mcp-apps');
  assert.equal(store.getSnapshot().identity.requestId, null);

  assert.equal(
    store.acceptResult(
      result('indexter_search', 'server-request-a', { marker: 'ready' }, 'widget-a'),
      'mcp-apps',
    ),
    true,
  );
  assert.equal(store.getSnapshot().identity.requestId, 'server-request-a');
  assert.equal(store.getSnapshot().status, 'ready');
});

test('only one-time legacy hydration may attach output without a host identity', () => {
  const strict = makeStore().store;
  assert.equal(strict.acceptChatGptGlobals({
    toolInput: { query: 'first' },
    toolOutput: { marker: 'first' },
    toolResponseMetadata: null,
  }), true);
  assert.equal(strict.getSnapshot().status, 'malformed');
  assert.equal(strict.getSnapshot().output, null);

  const legacy = makeStore().store;
  assert.equal(legacy.acceptChatGptGlobals({
    toolInput: { query: 'legacy snapshot' },
    toolOutput: { marker: 'legacy snapshot' },
    toolResponseMetadata: null,
  }, { allowUnboundLegacyHydration: true }), true);
  assert.equal(legacy.getSnapshot().status, 'ready');
  assert.deepEqual(legacy.getSnapshot().output, { marker: 'legacy snapshot' });
});

test('trusted host context rekeys an accepted unbound legacy result without losing it', () => {
  const { fake, store } = makeStore();
  assert.equal(store.acceptChatGptGlobals({
    toolInput: { query: 'legacy snapshot' },
    toolOutput: { marker: 'legacy snapshot' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true }), true);

  const beforeBinding = store.getSnapshot();
  assert.equal(beforeBinding.status, 'ready');
  assert.equal(fake.timers.size, 0);

  assert.equal(
    store.activateHostContext(
      hostContext('indexter_search', 'rpc-1', 'widget-a'),
    ),
    true,
  );
  const bound = store.getSnapshot();
  assert.deepEqual(bound.identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
  assert.equal(bound.status, 'ready');
  assert.deepEqual(bound.input, { query: 'legacy snapshot' });
  assert.deepEqual(bound.output, { marker: 'legacy snapshot' });
  assert.equal(bound.startedAt, beforeBinding.startedAt);
  assert.equal(fake.timers.size, 0);
});

test('matching metadata-only globals enrich output-first legacy result', () => {
  const { store } = makeStore();
  const compactOutput = { ok: true, route: 'task', counts: { endpoints: 2 } };
  store.acceptChatGptGlobals({
    toolOutput: compactOutput,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });
  assert.equal(store.getSnapshot().status, 'ready');
  assert.equal(store.getSnapshot().metadata, null);

  const enrichedMetadata = {
    ...metadata('indexter_search', 'rpc-1', 'widget-a'),
    indexterPayload: {
      route: 'task',
      data: { success: true, count: 2 },
    },
  };
  store.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-a'),
  );
  assert.equal(store.acceptChatGptGlobals({
    toolResponseMetadata: { _meta: enrichedMetadata },
    widgetSessionId: 'widget-a',
  }), true);

  const enriched = store.getSnapshot();
  assert.equal(enriched.status, 'ready');
  assert.deepEqual(enriched.output, compactOutput);
  assert.deepEqual(enriched.metadata, enrichedMetadata);
  assert.deepEqual(enriched.identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
});

test('bound result stages its own invocation instead of relabeling anonymous ready output', () => {
  const { store } = makeStore();
  const outputA = { marker: 'anonymous output A' };
  store.acceptChatGptGlobals({
    toolOutput: outputA,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });

  const resultB = result(
    'indexter_search',
    'request-b',
    { marker: 'bound output B' },
    'widget-b',
  );
  resultB._meta.indexterPayload = {
    route: 'task',
    data: { marker: 'complete B' },
  };
  assert.equal(store.acceptResult(resultB, 'mcp-apps'), true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, outputA);
  assert.equal(store.getSnapshot().metadata, null);
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: null,
    requestId: null,
    widgetSessionId: null,
  });

  assert.equal(store.activateHostContext(
    hostContext('indexter_search', 'request-b', 'widget-b'),
  ), true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'bound output B' });
  assert.deepEqual(store.getSnapshot().metadata, resultB._meta);
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: 'indexter_search',
    requestId: 'request-b',
    widgetSessionId: 'widget-b',
  });
});

test('metadata-only pre-context stages identity and never relabels anonymous output', () => {
  const { store } = makeStore();
  const outputA = { marker: 'anonymous output A' };
  store.acceptChatGptGlobals({
    toolOutput: outputA,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });
  const metadataB = {
    ...metadata('indexter_search', 'request-b', 'widget-b'),
    indexterPayload: { route: 'task', data: { marker: 'metadata B' } },
  };

  assert.equal(store.acceptChatGptGlobals({
    toolResponseMetadata: { _meta: metadataB },
    widgetSessionId: 'widget-b',
  }), true);
  assert.deepEqual(store.getSnapshot().output, outputA);
  assert.equal(store.getSnapshot().metadata, null);

  store.activateHostContext(
    hostContext('indexter_search', 'request-b', 'widget-b'),
  );
  assert.equal(store.getSnapshot().status, 'waiting');
  assert.equal(store.getSnapshot().output, null);
  assert.equal(store.getSnapshot().metadata, null);

  const resultB = result(
    'indexter_search',
    'request-b',
    { marker: 'bound output B' },
    'widget-b',
  );
  resultB._meta.indexterPayload = metadataB.indexterPayload;
  assert.equal(store.acceptResult(resultB, 'mcp-apps'), true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'bound output B' });
  assert.deepEqual(store.getSnapshot().metadata, resultB._meta);
});

test('multiple staged results activate by host identity in out-of-order delivery', () => {
  const { store } = makeStore();
  store.acceptChatGptGlobals({
    toolOutput: { marker: 'anonymous output A' },
    toolResponseMetadata: null,
  }, { allowUnboundLegacyHydration: true });
  const resultB = result(
    'indexter_search',
    'request-b',
    { marker: 'bound output B' },
    'widget-b',
  );
  const resultC = result(
    'indexter_search',
    'request-c',
    { marker: 'bound output C' },
    'widget-c',
  );
  assert.equal(store.acceptResult(resultB, 'mcp-apps'), true);
  assert.equal(store.acceptResult(resultC, 'mcp-apps'), true);

  store.activateHostContext(
    hostContext('indexter_search', 'request-c', 'widget-c'),
  );
  assert.deepEqual(store.getSnapshot().output, { marker: 'bound output C' });
  assert.equal(store.activateHostContext(
    hostContext('indexter_search', undefined, 'widget-c'),
  ), false);
  assert.deepEqual(store.getSnapshot().output, { marker: 'bound output C' });
  store.activateHostContext(
    hostContext('indexter_search', 'request-b', 'widget-b'),
  );
  assert.deepEqual(store.getSnapshot().output, { marker: 'bound output B' });
});

test('staged malformed result times out and recovers only with matching late output', () => {
  const { fake, store } = makeStore();
  const outputA = { marker: 'anonymous output A' };
  store.acceptChatGptGlobals({
    toolOutput: outputA,
    toolResponseMetadata: null,
  }, { allowUnboundLegacyHydration: true });
  assert.equal(store.acceptResult({
    content: [],
    _meta: metadata('indexter_search', 'request-b', 'widget-b'),
  }, 'mcp-apps'), false);
  assert.deepEqual(store.getSnapshot().output, outputA);

  store.activateHostContext(
    hostContext('indexter_search', 'request-b', 'widget-b'),
  );
  assert.equal(store.getSnapshot().status, 'malformed');
  fake.advance(TOOL_RESULT_ATTACH_TIMEOUT_MS);
  assert.equal(store.getSnapshot().status, 'timed_out');

  assert.equal(store.acceptResult(
    result(
      'indexter_search',
      'request-c',
      { marker: 'wrong late output' },
      'widget-c',
    ),
    'mcp-apps',
  ), false);
  assert.equal(store.getSnapshot().status, 'timed_out');
  assert.equal(store.acceptResult(
    result(
      'indexter_search',
      'request-b',
      { marker: 'matching late output' },
      'widget-b',
    ),
    'mcp-apps',
  ), true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'matching late output' });
});

test('matching full MCP result enriches metadata without replacing ready output', () => {
  const { store } = makeStore();
  store.activateHostContext(
    hostContext('indexter_search', undefined, 'widget-a'),
  );
  const compactOutput = { ok: true, route: 'task', counts: { endpoints: 1 } };
  store.acceptChatGptGlobals({
    toolOutput: compactOutput,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });

  const completeResult = result(
    'indexter_search',
    'rpc-1',
    { marker: 'must not replace compact output' },
    'widget-a',
  );
  completeResult._meta.indexterPayload = {
    route: 'task',
    data: { success: true, count: 1 },
  };
  assert.equal(store.acceptResult(completeResult, 'mcp-apps'), true);

  const enriched = store.getSnapshot();
  assert.equal(enriched.status, 'ready');
  assert.deepEqual(enriched.output, compactOutput);
  assert.deepEqual(enriched.metadata, completeResult._meta);
  assert.deepEqual(enriched.identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
});

test('ready metadata enrichment rejects mismatches and never revives cancellation', () => {
  const ready = makeStore().store;
  ready.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-a'),
  );
  const compactOutput = { ok: true, route: 'task', counts: { endpoints: 1 } };
  ready.acceptChatGptGlobals({
    toolOutput: compactOutput,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });
  assert.equal(ready.acceptChatGptGlobals({
    toolResponseMetadata: {
      _meta: {
        ...metadata('indexter_search', 'rpc-2', 'widget-b'),
        indexterPayload: { route: 'task', data: { marker: 'wrong' } },
      },
    },
    widgetSessionId: 'widget-b',
  }), false);
  assert.equal(ready.getSnapshot().status, 'ready');
  assert.deepEqual(ready.getSnapshot().output, compactOutput);
  assert.equal(ready.getSnapshot().metadata, null);
  assert.equal(ready.getSnapshot().identity.requestId, 'rpc-1');

  const cancelled = makeStore().store;
  cancelled.cancel('user action');
  const matchingMetadata = {
    ...metadata('indexter_search', 'rpc-1', 'widget-a'),
    indexterPayload: { route: 'task', data: { marker: 'too late' } },
  };
  assert.equal(cancelled.acceptChatGptGlobals({
    toolResponseMetadata: { _meta: matchingMetadata },
    widgetSessionId: 'widget-a',
  }), false);
  assert.equal(cancelled.acceptResult({
    structuredContent: { marker: 'too late' },
    _meta: matchingMetadata,
  }, 'mcp-apps'), false);
  assert.equal(cancelled.getSnapshot().status, 'cancelled');
  assert.equal(cancelled.getSnapshot().output, null);
  assert.equal(cancelled.getSnapshot().metadata, null);
});

test('initial unbound legacy snapshot may hydrate a pristine trusted host context once', () => {
  const { store } = makeStore();
  store.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-a'),
  );

  assert.equal(store.acceptChatGptGlobals({
    toolInput: { query: 'legacy snapshot' },
    toolOutput: { marker: 'legacy snapshot' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true }), true);
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'legacy snapshot' });

  store.activateHostContext(
    hostContext('indexter_search', 'rpc-2', 'widget-a'),
  );
  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'must not cross calls' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true }), false);
  assert.equal(store.getSnapshot().status, 'waiting');
  assert.equal(store.getSnapshot().output, null);
});

test('empty legacy snapshot arms delayed output before trusted host context arrives', () => {
  const { store } = makeStore();
  assert.equal(store.acceptChatGptGlobals({
    toolInput: undefined,
    toolOutput: undefined,
    toolResponseMetadata: undefined,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true }), false);

  store.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-a'),
  );
  assert.equal(store.getSnapshot().status, 'waiting');
  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'delayed legacy output' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }), true);
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, {
    marker: 'delayed legacy output',
  });
});

test('empty legacy snapshot arms delayed output after trusted host context arrives', () => {
  const { store } = makeStore();
  store.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-a'),
  );
  assert.equal(store.acceptChatGptGlobals({
    toolInput: undefined,
    toolOutput: null,
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true }), false);

  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'delayed legacy output' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }), true);
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-a',
  });
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, {
    marker: 'delayed legacy output',
  });
});

test('delayed legacy output must match the session that armed the empty snapshot', () => {
  const { store } = makeStore();
  store.acceptChatGptGlobals({
    toolOutput: undefined,
    toolResponseMetadata: undefined,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });

  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'wrong widget' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-b',
  }), false);
  assert.equal(store.getSnapshot().status, 'malformed');
  assert.match(store.getSnapshot().message, /did not identify/i);
  assert.equal(store.getSnapshot().output, null);

  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'right widget' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }), true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().output, { marker: 'right widget' });
});

test('unbound legacy output cannot rekey into a different widget session', () => {
  const { store } = makeStore();
  store.acceptChatGptGlobals({
    toolOutput: { marker: 'widget-a result' },
    toolResponseMetadata: null,
    widgetSessionId: 'widget-a',
  }, { allowUnboundLegacyHydration: true });
  assert.equal(store.getSnapshot().status, 'ready');

  store.activateHostContext(
    hostContext('indexter_search', 'rpc-1', 'widget-b'),
  );
  assert.deepEqual(store.getSnapshot().identity, {
    toolName: 'indexter_search',
    requestId: 'rpc-1',
    widgetSessionId: 'widget-b',
  });
  assert.equal(store.getSnapshot().status, 'waiting');
  assert.equal(store.getSnapshot().output, null);
});

test('mismatched binding and unbound fallback cannot override a bound active call', () => {
  const { store } = makeStore();
  store.activateHostContext(hostContext('indexter_search', 'request-a', 'widget-a'));
  store.acceptInput({ query: 'owned query' }, 'mcp-apps');

  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'wrong binding' },
    toolResponseMetadata: metadata('indexter_search', 'request-b', 'widget-b'),
  }), false);
  assert.equal(store.acceptChatGptGlobals({
    toolOutput: { marker: 'unbound fallback' },
    toolResponseMetadata: null,
  }, { allowUnboundLegacyHydration: true }), false);
  assert.equal(store.getSnapshot().status, 'running');
  assert.equal(store.getSnapshot().output, null);
});
