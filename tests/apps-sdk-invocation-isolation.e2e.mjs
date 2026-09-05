import assert from 'node:assert/strict';
import test from 'node:test';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const UI_ROOT = new URL('../apps-sdk/ui/', import.meta.url).pathname;
const TOOL_NAME = 'indexter_search';
const FIXED_NOW = '2026-09-04T12:00:00.000Z';

const INVOCATIONS = Object.freeze([
  { frameId: 'alpha', requestId: 'request-alpha', widgetSessionId: 'widget-alpha' },
  { frameId: 'bravo', requestId: 'request-bravo', widgetSessionId: 'widget-bravo' },
  { frameId: 'charlie', requestId: 'request-charlie', widgetSessionId: 'widget-charlie' },
  { frameId: 'delta', requestId: 'request-delta', widgetSessionId: 'widget-delta' },
]);

function hostDocument() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Invocation isolation host</title></head>
  <body>
    ${INVOCATIONS.map(({ frameId }) => (
      `<iframe id="${frameId}" title="${frameId}"></iframe>`
    )).join('\n')}
  </body>
</html>`;
}

function installHost({ baseUrl, invocations }) {
  window.__invocationHostMessages = [];
  const bySource = () => new Map(invocations.map((invocation) => [
    document.getElementById(invocation.frameId).contentWindow,
    invocation,
  ]));

  window.__notifyInvocation = (frameId, method, params) => {
    const frame = document.getElementById(frameId);
    frame.contentWindow.postMessage({ jsonrpc: '2.0', method, params }, '*');
  };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
    const invocation = bySource().get(event.source);
    if (!invocation) return;
    window.__invocationHostMessages.push({ frameId: invocation.frameId, message });
    if (!Object.prototype.hasOwnProperty.call(message, 'id')) return;

    let result = {};
    if (message.method === 'ui/initialize') {
      result = {
        protocolVersion: '2026-01-26',
        hostInfo: { name: 'Invocation Isolation Host', version: '1.0.0' },
        hostCapabilities: {},
        hostContext: {
          toolInfo: {
            id: invocation.requestId,
            tool: { name: 'indexter_search', inputSchema: { type: 'object' } },
          },
          'openai/widgetSessionId': invocation.widgetSessionId,
          theme: 'light',
          displayMode: 'inline',
          availableDisplayModes: ['inline'],
          locale: 'en-US',
          timeZone: 'UTC',
          safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      };
    }
    event.source.postMessage({ jsonrpc: '2.0', id: message.id, result }, '*');
  });

  for (const invocation of invocations) {
    const frame = document.getElementById(invocation.frameId);
    frame.src = `${baseUrl}/indexter-search.html?invocation=${invocation.frameId}`;
  }
}

function invocationMetadata(invocation) {
  return {
    'dexter/toolInvocation': {
      toolName: TOOL_NAME,
      requestId: invocation.requestId,
    },
    'openai/widgetSessionId': invocation.widgetSessionId,
  };
}

function invocationResult(invocation, output) {
  return {
    structuredContent: {
      ok: true,
      route: 'task',
      counts: { providers: 0, endpoints: output.count, actors: 0 },
    },
    content: [{ type: 'text', text: 'Indexter returned one current match.' }],
    _meta: {
      ...invocationMetadata(invocation),
      indexterPayload: { route: 'task', data: output },
    },
    isError: false,
  };
}

function outputFor(invocation) {
  const ordinal = INVOCATIONS.findIndex(({ frameId }) => frameId === invocation.frameId) + 1;
  return {
    searchResultSetId: `11111111-1111-4111-8111-${String(ordinal).padStart(12, '0')}`,
    success: true,
    count: 1,
    strongCount: 1,
    relatedCount: 0,
    strongResults: [{
      kind: 'endpoint',
      resourceId: `77777777-7777-4777-8777-${String(ordinal).padStart(12, '0')}`,
      name: `${invocation.frameId} result`,
      url: `https://${invocation.frameId}.fixture.example/v1/result`,
      access: { kind: 'direct_url', checkable: true, requiresFreshCheck: true },
      merchant: {
        providerKey: `${invocation.frameId}-merchant`,
        providerSlug: `${invocation.frameId}-merchant`,
        displayName: `${invocation.frameId} merchant`,
        logoUrl: null,
        technicalHost: `${invocation.frameId}.fixture.example`,
      },
      method: 'GET',
      price: '$0.008',
      priceAtomic: '8000',
      priceUsdc: 0.008,
      priceAsset: 'USDC',
      network: 'eip155:8453',
      networkLabel: 'Base',
      pricingMode: 'fixed',
      chains: [{
        network: 'eip155:8453',
        networkLabel: 'Base',
        asset: 'USDC',
        scheme: 'exact',
        priceAtomic: '8000',
        priceUsdc: 0.008,
        priceLabel: '$0.008',
      }],
      execution: {
        sideEffectful: false,
        effect: null,
        automatedVerification: 'enabled',
        userExecution: 'allowed',
        confirmationRequired: false,
        availability: 'available',
        requiresExplicitInput: false,
        quoteMayCreateProviderReservation: false,
      },
      requestInput: {
        version: 1,
        fields: [],
      },
      description: `Current result for ${invocation.frameId}.`,
      category: 'Test data',
      qualityScore: 97,
      verified: true,
      verificationStatus: 'verified',
      paidQualityTestPassed: true,
      trustBasis: 'recent_paid_delivery',
      trustLabel: 'Recent paid delivery',
      lastVerifiedAt: FIXED_NOW,
      totalCalls: 42,
      seller: `${invocation.frameId} merchant`,
      sellerMeta: {
        payTo: null,
        displayName: `${invocation.frameId} merchant`,
        logoUrl: null,
        twitterHandle: null,
      },
      tier: 'strong',
      similarity: 0.97,
      why: `Bound to ${invocation.frameId}.`,
      score: 0.97,
    }],
    relatedResults: [],
    rerank: { enabled: false, applied: false, reason: 'Isolation fixture' },
    searchMeta: { mode: 'direct', note: 'One isolated match' },
  };
}

async function status(frame) {
  return frame.locator('[data-tool-invocation-status]').getAttribute(
    'data-tool-invocation-status',
  );
}

test('four concurrent widget invocations isolate lifecycle, identity, and late delivery', async (t) => {
  const vite = await createServer({
    root: UI_ROOT,
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript((fixedNow) => {
    let now = new Date(fixedNow).getTime();
    let nextTimerId = 1;
    const timers = new Map();
    window.__dexterToolInvocationClock = {
      now: () => now,
      setTimeout(callback, delayMs) {
        const id = nextTimerId++;
        timers.set(id, { at: now + delayMs, callback });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };
    window.__advanceDexterToolInvocationClock = (durationMs) => {
      const target = now + durationMs;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    };
    window.openai = {
      toolInput: null,
      toolOutput: null,
      toolResponseMetadata: null,
      openExternal() {},
    };
  }, FIXED_NOW);

  const page = await context.newPage();
  t.after(async () => {
    await context.close();
    await browser.close();
    await vite.close();
  });

  await page.setContent(hostDocument());
  await page.evaluate(installHost, { baseUrl, invocations: INVOCATIONS });

  const frames = new Map();
  for (const invocation of INVOCATIONS) {
    const locator = page.frameLocator(`#${invocation.frameId}`);
    await locator.locator('[data-tool-invocation-status="waiting"]').waitFor({
      state: 'visible',
      timeout: 8_000,
    });
    const frame = page.frames().find((candidate) => (
      new URL(candidate.url()).searchParams.get('invocation') === invocation.frameId
    ));
    assert.ok(frame, `${invocation.frameId} frame did not load`);
    frames.set(invocation.frameId, { frame, locator });
  }

  for (const invocation of INVOCATIONS) {
    await page.evaluate(({ frameId, query }) => {
      window.__notifyInvocation(
        frameId,
        'ui/notifications/tool-input',
        { arguments: { query } },
      );
    }, { frameId: invocation.frameId, query: `${invocation.frameId} query` });
  }
  for (const { locator } of frames.values()) {
    await locator.locator('[data-tool-invocation-status="running"]').waitFor({
      state: 'visible',
    });
  }

  // A result for Bravo delivered to Alpha is ignored rather than becoming
  // Alpha's output or error state.
  const bravo = INVOCATIONS[1];
  await page.evaluate(({ frameId, result }) => {
    window.__notifyInvocation(frameId, 'ui/notifications/tool-result', result);
  }, {
    frameId: 'alpha',
    result: invocationResult(bravo, outputFor(bravo)),
  });
  assert.equal(await status(frames.get('alpha').locator), 'running');

  // Deliver a matching but structurally empty result, then cancel another
  // invocation while the remaining two continue independently.
  await page.evaluate(({ frameId, result }) => {
    window.__notifyInvocation(frameId, 'ui/notifications/tool-result', result);
  }, {
    frameId: 'bravo',
    result: { _meta: invocationMetadata(bravo), content: [] },
  });
  await frames.get('bravo').locator
    .locator('[data-tool-invocation-status="malformed"]')
    .waitFor({ state: 'visible' });

  await page.evaluate(() => {
    window.__notifyInvocation(
      'charlie',
      'ui/notifications/tool-cancelled',
      { reason: 'user action' },
    );
  });
  await frames.get('charlie').locator
    .locator('[data-tool-invocation-status="cancelled"]')
    .waitFor({ state: 'visible' });

  const alpha = INVOCATIONS[0];
  await page.evaluate(({ frameId, result }) => {
    window.__notifyInvocation(frameId, 'ui/notifications/tool-result', result);
  }, {
    frameId: 'alpha',
    result: invocationResult(alpha, outputFor(alpha)),
  });
  await frames.get('alpha').locator
    .locator('[data-tool-invocation-status="ready"]')
    .waitFor({ state: 'visible' });

  // A late ChatGPT globals update for another call cannot replace Alpha's
  // MCP-bound result, even in the canonical toolResponseMetadata envelope.
  await frames.get('alpha').frame.evaluate(({ staleInput, staleOutput, staleMetadata }) => {
    window.openai.toolInput = staleInput;
    window.openai.toolOutput = staleOutput;
    window.openai.toolResponseMetadata = { _meta: staleMetadata };
    window.openai.widgetSessionId = staleMetadata['openai/widgetSessionId'];
    window.dispatchEvent(new CustomEvent('openai:set_globals', {
      detail: {
        globals: {
          toolInput: staleInput,
          toolOutput: staleOutput,
          toolResponseMetadata: { _meta: staleMetadata },
          widgetSessionId: staleMetadata['openai/widgetSessionId'],
        },
      },
    }));
  }, {
    staleInput: { query: 'bravo stale query' },
    staleOutput: outputFor(bravo),
    staleMetadata: invocationMetadata(bravo),
  });

  assert.equal(await status(frames.get('alpha').locator), 'ready');
  assert.match(
    await frames.get('alpha').locator.locator('.dx-search-query-context').innerText(),
    /alpha query/i,
  );
  assert.match(
    await frames.get('alpha').locator.locator('.dx-search-brief__title').innerText(),
    /alpha result/i,
  );

  // A metadata-only globals event cannot pair its new identity with an older
  // output still present on the mutable window.openai object.
  const delta = INVOCATIONS[3];
  await frames.get('delta').frame.evaluate(({ staleOutput, currentMetadata }) => {
    window.openai.toolOutput = staleOutput;
    window.openai.toolResponseMetadata = currentMetadata;
    window.dispatchEvent(new CustomEvent('openai:set_globals', {
      detail: { globals: { toolResponseMetadata: currentMetadata } },
    }));
  }, {
    staleOutput: outputFor(alpha),
    currentMetadata: invocationMetadata(delta),
  });
  assert.equal(await status(frames.get('delta').locator), 'running');

  // Delta reaches the exact 30-second attach deadline, remains isolated from a
  // late stale ChatGPT result, then recovers when its matching MCP result lands.
  await frames.get('delta').frame.evaluate(() => {
    window.__advanceDexterToolInvocationClock(30_000);
  });
  await frames.get('delta').locator
    .locator('[data-tool-invocation-status="timed_out"]')
    .waitFor({ state: 'visible' });
  assert.match(await frames.get('delta').locator.locator('[role="alert"]').innerText(), /30 seconds/i);

  await frames.get('delta').frame.evaluate(({ staleOutput, staleMetadata }) => {
    window.openai.toolOutput = staleOutput;
    window.openai.toolResponseMetadata = staleMetadata;
    window.dispatchEvent(new CustomEvent('openai:set_globals', {
      detail: { globals: { toolOutput: staleOutput, toolResponseMetadata: staleMetadata } },
    }));
  }, {
    staleOutput: outputFor(alpha),
    staleMetadata: invocationMetadata(alpha),
  });
  assert.equal(await status(frames.get('delta').locator), 'timed_out');

  await page.evaluate(({ frameId, result }) => {
    window.__notifyInvocation(frameId, 'ui/notifications/tool-result', result);
  }, {
    frameId: 'delta',
    result: invocationResult(delta, outputFor(delta)),
  });
  await frames.get('delta').locator
    .locator('[data-tool-invocation-status="ready"]')
    .waitFor({ state: 'visible' });

  // Bravo recovers from malformed data; Charlie remains cancelled even if a
  // result arrives after cancellation.
  await page.evaluate(({ bravoResult, charlieResult }) => {
    window.__notifyInvocation('bravo', 'ui/notifications/tool-result', bravoResult);
    window.__notifyInvocation('charlie', 'ui/notifications/tool-result', charlieResult);
  }, {
    bravoResult: invocationResult(bravo, outputFor(bravo)),
    charlieResult: invocationResult(
      INVOCATIONS[2],
      outputFor(INVOCATIONS[2]),
    ),
  });
  await frames.get('bravo').locator
    .locator('[data-tool-invocation-status="ready"]')
    .waitFor({ state: 'visible' });
  assert.equal(await status(frames.get('charlie').locator), 'cancelled');

  for (const invocation of [alpha, bravo, delta]) {
    const current = frames.get(invocation.frameId).locator;
    assert.match(
      await current.locator('.dx-search-query-context').innerText(),
      new RegExp(`${invocation.frameId} query`, 'i'),
    );
    assert.match(
      await current.locator('.dx-search-brief__title').innerText(),
      new RegExp(`${invocation.frameId} result`, 'i'),
    );
  }

  const methods = await page.evaluate(() => (
    window.__invocationHostMessages.map(({ frameId, message }) => ({
      frameId,
      method: message.method,
    }))
  ));
  assert.equal(methods.some(({ method }) => method === 'tools/call'), false);
  assert.equal(methods.some(({ method }) => method === 'ui/message'), false);
  assert.equal(
    new Set(methods.filter(({ method }) => method === 'ui/initialize').map(({ frameId }) => frameId)).size,
    4,
  );
});

test('ChatGPT output that lands in the render-to-subscribe gap is attached', async (t) => {
  const invocation = {
    frameId: 'gap',
    requestId: 'request-gap',
    widgetSessionId: 'widget-gap',
  };
  const output = outputFor(invocation);
  const result = invocationResult(invocation, output);
  const vite = await createServer({
    root: UI_ROOT,
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 900, height: 640 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(({ invocationInput, invocationOutput, responseMetadata }) => {
    window.openai = {
      toolInput: null,
      toolOutput: null,
      toolResponseMetadata: null,
      openExternal() {},
    };
    const nativeAddEventListener = window.addEventListener.bind(window);
    let insertedGapResult = false;
    window.addEventListener = function addEventListener(type, listener, options) {
      if (
        type === 'openai:set_globals'
        && !insertedGapResult
        && new URL(window.location.href).searchParams.get('invocation') === 'gap'
      ) {
        insertedGapResult = true;
        window.openai.toolInput = invocationInput;
        window.openai.toolOutput = invocationOutput;
        window.openai.toolResponseMetadata = { _meta: responseMetadata };
        window.openai.widgetSessionId = responseMetadata['openai/widgetSessionId'];
        // The host event lands immediately before this listener is registered.
        nativeAddEventListener.call(window, 'openai:set_globals', () => {}, { once: true });
        window.dispatchEvent(new CustomEvent('openai:set_globals', {
          detail: {
            globals: {
              toolInput: invocationInput,
              toolOutput: invocationOutput,
              toolResponseMetadata: { _meta: responseMetadata },
              widgetSessionId: responseMetadata['openai/widgetSessionId'],
            },
          },
        }));
      }
      return nativeAddEventListener(type, listener, options);
    };
  }, {
    invocationInput: { query: 'gap query' },
    invocationOutput: result.structuredContent,
    responseMetadata: result._meta,
  });

  const page = await context.newPage();
  t.after(async () => {
    await context.close();
    await browser.close();
    await vite.close();
  });
  await page.setContent('<!doctype html><html><body><iframe id="gap" title="gap"></iframe></body></html>');
  await page.evaluate(installHost, { baseUrl, invocations: [invocation] });

  const frame = page.frameLocator('#gap');
  await frame.locator('[data-tool-invocation-status="ready"]').waitFor({
    state: 'visible',
    timeout: 8_000,
  });
  assert.match(await frame.locator('.dx-search-query-context').innerText(), /gap query/i);
  assert.match(await frame.locator('.dx-search-brief__title').innerText(), /gap result/i);
});

test('malformed and unsafe task attachments fail closed without crashing the renderer', async (t) => {
  const invocations = [
    { frameId: 'null-row', requestId: 'request-null-row', widgetSessionId: 'widget-null-row' },
    { frameId: 'unsafe-field', requestId: 'request-unsafe-field', widgetSessionId: 'widget-unsafe-field' },
  ];
  const vite = await createServer({
    root: UI_ROOT,
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
  await context.addInitScript(() => {
    window.openai = {
      toolInput: null,
      toolOutput: null,
      toolResponseMetadata: null,
      openExternal() {},
    };
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  t.after(async () => {
    await context.close();
    await browser.close();
    await vite.close();
  });

  await page.setContent(`<!doctype html><html><body>${invocations.map(({ frameId }) => (
    `<iframe id="${frameId}" title="${frameId}"></iframe>`
  )).join('')}</body></html>`);
  await page.evaluate(installHost, { baseUrl, invocations });

  for (const invocation of invocations) {
    await page.frameLocator(`#${invocation.frameId}`)
      .locator('[data-tool-invocation-status="waiting"]')
      .waitFor({ state: 'visible', timeout: 8_000 });
    await page.evaluate(({ frameId }) => {
      window.__notifyInvocation(
        frameId,
        'ui/notifications/tool-input',
        { arguments: { query: 'find a current market price' } },
      );
    }, invocation);
  }

  const malformedNullOutput = {
    ...outputFor(invocations[0]),
    strongResults: [null],
  };
  const unsafeFieldOutput = outputFor(invocations[1]);
  unsafeFieldOutput.strongResults[0].authorization = 'Bearer abcdefghijklmnop';
  await page.evaluate(({ nullInvocation, nullResult, unsafeInvocation, unsafeResult }) => {
    window.__notifyInvocation(
      nullInvocation.frameId,
      'ui/notifications/tool-result',
      nullResult,
    );
    window.__notifyInvocation(
      unsafeInvocation.frameId,
      'ui/notifications/tool-result',
      unsafeResult,
    );
  }, {
    nullInvocation: invocations[0],
    nullResult: invocationResult(invocations[0], malformedNullOutput),
    unsafeInvocation: invocations[1],
    unsafeResult: invocationResult(invocations[1], unsafeFieldOutput),
  });

  for (const invocation of invocations) {
    const frame = page.frameLocator(`#${invocation.frameId}`);
    await frame.locator('[data-tool-invocation-status="malformed"]')
      .waitFor({ state: 'visible', timeout: 8_000 });
    assert.match(await frame.locator('[role="alert"]').innerText(), /not a valid Indexter response/i);
    assert.equal(await frame.locator('.dx-search-brief__title').count(), 0);
  }
  assert.deepEqual(pageErrors, []);
});
