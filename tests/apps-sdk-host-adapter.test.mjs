import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMcpCapabilities,
  normalizeMcpHostContext,
  normalizeMcpToolInput,
} from '../apps-sdk/ui/src/sdk/host-adapter-model.ts';

test('MCP tool input exposes arguments rather than the protocol wrapper', () => {
  assert.deepEqual(
    normalizeMcpToolInput({
      arguments: {
        url: 'https://example.com/price',
        method: 'GET',
      },
    }),
    {
      url: 'https://example.com/price',
      method: 'GET',
    },
  );
});

test('partial host-context updates merge without erasing prior presentation state', () => {
  const initial = normalizeMcpHostContext({
    theme: 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline', 'fullscreen'],
    toolInfo: {
      id: 'request-alpha',
      tool: { name: 'indexter_search', inputSchema: { type: 'object' } },
    },
    'openai/widgetSessionId': 'widget-alpha',
    locale: 'en-US',
    safeAreaInsets: { top: 1, right: 2, bottom: 18, left: 2 },
    styles: {
      variables: {
        '--color-text-primary': '#171717',
      },
    },
  });

  const updated = normalizeMcpHostContext({
    theme: 'dark',
    displayMode: 'fullscreen',
    safeAreaInsets: { bottom: 24 },
  }, initial);

  assert.equal(updated.theme, 'dark');
  assert.equal(updated.displayMode, 'fullscreen');
  assert.deepEqual(updated.availableDisplayModes, ['inline', 'fullscreen']);
  assert.equal(updated.locale, 'en-US');
  assert.deepEqual(updated.toolInfo, initial.toolInfo);
  assert.equal(updated.widgetSessionId, 'widget-alpha');
  assert.deepEqual(updated.safeAreaInsets, {
    top: 1,
    right: 2,
    bottom: 24,
    left: 2,
  });
  assert.deepEqual(updated.styles, initial.styles);
});

test('MCP capability detection requires text support for conversational actions', () => {
  const hostContext = normalizeMcpHostContext({
    availableDisplayModes: ['inline', 'fullscreen'],
  });
  const capabilities = normalizeMcpCapabilities({
    serverTools: {},
    openLinks: {},
    downloadFile: {},
    updateModelContext: { structuredContent: {} },
    message: { text: {} },
  }, hostContext);

  assert.deepEqual(capabilities, {
    callTool: true,
    openExternal: true,
    requestDisplayMode: true,
    updateModelContext: false,
    sendFollowUpMessage: true,
    downloadFile: true,
    widgetState: false,
  });
});
