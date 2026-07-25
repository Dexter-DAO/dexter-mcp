import test from 'node:test';
import assert from 'node:assert/strict';

test('MCP Apps bridge preserves protocol requests, results, and live host context', async () => {
  const messages = [];
  let fallbackOpenCount = 0;
  const listeners = new Map();
  const styleValues = new Map();
  const rootStyle = {
    colorScheme: '',
    width: '',
    height: '',
    setProperty(name, value) {
      styleValues.set(name, value);
    },
  };
  const documentElement = {
    style: rootStyle,
    setAttribute(name, value) {
      if (name === 'data-theme') this.theme = value;
    },
  };

  const parent = {
    postMessage(message) {
      messages.push(message);
      if (!('id' in message)) return;

      let result = {};
      if (message.method === 'ui/initialize') {
        result = {
          protocolVersion: '2026-01-26',
          hostInfo: { name: 'Test Host', version: '1.0.0' },
          hostCapabilities: {
            serverTools: {},
            message: { text: {} },
            updateModelContext: { text: {}, structuredContent: {} },
            downloadFile: {},
            openLinks: {},
          },
          hostContext: {
            theme: 'light',
            displayMode: 'inline',
            availableDisplayModes: ['inline', 'fullscreen'],
            locale: 'en-US',
            safeAreaInsets: { top: 0, right: 0, bottom: 16, left: 0 },
            styles: {
              variables: { '--color-text-primary': '#111111' },
            },
          },
        };
      } else if (message.method === 'tools/call') {
        result = {
          structuredContent: {
            requiresPayment: true,
            paymentOptions: [{ price: 0.01, asset: 'USDC' }],
          },
          content: [{ type: 'text', text: 'Fresh quote' }],
          _meta: { source: 'test' },
          isError: false,
        };
      } else if (message.method === 'ui/request-display-mode') {
        result = { mode: message.params.mode };
      } else if (message.method === 'ui/open-link') {
        result = { isError: true };
      }

      queueMicrotask(() => {
        listeners.get('message')?.({
          source: parent,
          data: { jsonrpc: '2.0', id: message.id, result },
        });
      });
    },
  };

  globalThis.window = {
    parent,
    self: {},
    top: {},
    innerWidth: 800,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    open() {
      fallbackOpenCount += 1;
      return {};
    },
  };
  globalThis.document = {
    documentElement,
    body: null,
    head: { appendChild() {} },
    getElementById() {
      return null;
    },
    createElement() {
      return { id: '', textContent: '' };
    },
    querySelector() {
      return null;
    },
  };
  globalThis.ResizeObserver = undefined;

  const bridge = await import('../apps-sdk/ui/src/sdk/mcp-apps-bridge.ts');
  const init = await bridge.initialize();

  const initializeRequest = messages.find((message) => message.method === 'ui/initialize');
  assert.deepEqual(initializeRequest.params.appCapabilities.availableDisplayModes, [
    'inline',
  ]);
  assert.equal(init.hostCapabilities.message.text instanceof Object, true);
  assert.equal(documentElement.theme, 'light');
  assert.equal(styleValues.get('--color-text-primary'), '#111111');
  assert.ok(messages.some((message) => (
    message.method === 'ui/notifications/initialized'
  )));

  const toolResult = await bridge.callTool('x402_check', {
    url: 'https://example.com/price',
    method: 'GET',
  });
  assert.equal(toolResult.result, 'Fresh quote');
  assert.equal(toolResult.isError, false);
  assert.deepEqual(toolResult.structuredContent, {
    requiresPayment: true,
    paymentOptions: [{ price: 0.01, asset: 'USDC' }],
  });
  assert.deepEqual(toolResult._meta, { source: 'test' });

  await bridge.updateModelContext({
    text: 'Selected Example Price',
    structuredContent: { selectedUrl: 'https://example.com/price' },
  });
  await bridge.sendMessage('Compare the selected service');
  const mode = await bridge.requestDisplayMode('fullscreen');
  await bridge.downloadFile({
    contents: [{
      type: 'resource',
      resource: {
        uri: 'file:///quote.json',
        mimeType: 'application/json',
        text: '{}',
      },
    }],
  });

  const byMethod = new Map(messages.map((message) => [message.method, message]));
  assert.deepEqual(byMethod.get('ui/update-model-context').params, {
    content: [{ type: 'text', text: 'Selected Example Price' }],
    structuredContent: { selectedUrl: 'https://example.com/price' },
  });
  assert.deepEqual(byMethod.get('ui/message').params, {
    role: 'user',
    content: [{ type: 'text', text: 'Compare the selected service' }],
  });
  assert.deepEqual(byMethod.get('ui/request-display-mode').params, {
    mode: 'fullscreen',
  });
  assert.equal(mode.mode, 'fullscreen');
  assert.equal(byMethod.get('ui/download-file').params.contents.length, 1);
  await assert.rejects(
    bridge.openLink('https://example.com/declined'),
    /declined to open this link/,
  );
  assert.equal(
    fallbackOpenCount,
    0,
    'an explicit host denial must never be bypassed with window.open',
  );

  let changedContext = null;
  bridge.onNotification(
    'ui/notifications/host-context-changed',
    (params) => {
      changedContext = params;
    },
  );
  listeners.get('message')({
    source: parent,
    data: {
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: {
        theme: 'dark',
        displayMode: 'fullscreen',
      },
    },
  });

  assert.deepEqual(changedContext, {
    theme: 'dark',
    displayMode: 'fullscreen',
  });
  assert.equal(bridge.getHostContext().theme, 'dark');
  assert.equal(bridge.getHostContext().locale, 'en-US');
  assert.equal(documentElement.theme, 'dark');
});
