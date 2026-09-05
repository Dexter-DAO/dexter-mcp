import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';

import {
  GALLERY_FIXED_NOW,
  MCP_APPS_HOST_TOKENS,
  buildRendererGallerySurfaces,
} from './fixtures/opendexter-renderer-gallery-fixtures.mjs';
import { WALLET_ADDRESS } from './fixtures/wallet-portfolio-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const INTERACTION_DEVICE = String(
  process.env.DEXTER_RENDERER_INTERACTIONS_DEVICE || 'desktop',
).trim().toLowerCase();
const INTERACTION_THEME = String(
  process.env.DEXTER_RENDERER_INTERACTIONS_THEME || 'light',
).trim().toLowerCase();
const INDEXTER_ONLY = String(
  process.env.DEXTER_RENDERER_INTERACTIONS_SCOPE || 'all',
).trim().toLowerCase() === 'indexter';
const CAPTURE_INTERACTIONS = process.env.DEXTER_RENDERER_INTERACTIONS_CAPTURE === '1';
const VIEWPORT = Object.freeze(
  INTERACTION_DEVICE === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1280, height: 1700 },
);
const BROWSER_ENGINE = String(
  process.env.DEXTER_RENDERER_INTERACTIONS_BROWSER || 'chromium',
).trim().toLowerCase();

// These values belong to the fixture host, not the product. Both dimensions
// change when the host accepts a display-mode request so the renderers prove
// that they respond to host context instead of assuming one fixed canvas.
function modeContexts(viewport) {
  const availableWidth = viewport.width - 48;
  return {
    inline: {
      width: Math.round(Math.min(availableWidth, viewport.width * 0.72)),
      maxHeight: Math.round(viewport.height * 0.32),
    },
    fullscreen: {
      width: availableWidth,
      maxHeight: viewport.height - 48,
    },
  };
}

const CHECK_TOOL_RESULT = Object.freeze({
  structuredContent: {
    intentId: '11111111-1111-4111-8111-111111111111',
    quoteOnly: false,
    requiresPayment: true,
    statusCode: 402,
    x402Version: 2,
    authMode: 'paid',
    paymentOptions: [{
      price: 0.008,
      priceFormatted: '$0.008',
      network: 'eip155:8453',
      asset: 'USDC',
      scheme: 'exact',
      payTo: '0x1111111111111111111111111111111111111111',
      amountAtomic: '8000',
      decimals: 6,
      expiresAt: '2026-09-03T12:05:00.000Z',
    }],
    checkedRequest: {
      url: 'https://atlas.fixture.example/v1/markets',
      method: 'GET',
      body: null,
      requestBound: true,
    },
  },
  content: [{ type: 'text', text: 'Current seller terms verified.' }],
  _meta: { fixture: true },
  isError: false,
});

function hostDocument() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenDexter interactive MCP Apps fixture</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; background: #e9e7e2; }
      body { padding: 24px; }
      #surface { margin: 0 auto; }
      #widget {
        display: block;
        border: 0;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <main id="surface">
      <iframe
        id="widget"
        title="OpenDexter renderer"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </main>
  </body>
</html>`;
}

function indexterRequestEpochHarnessDocument() {
  const hostConfig = JSON.stringify({
    theme: INTERACTION_THEME,
    displayMode: 'fullscreen',
    maxHeight: VIEWPORT.height,
    deviceType: INTERACTION_DEVICE === 'mobile' ? 'mobile' : 'desktop',
  });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Indexter request epoch fixture</title>
  </head>
  <body>
    <div id="indexter-request-epoch-root"></div>
    <script>
      const hostConfig = ${hostConfig};
      window.__indexterRequestEpochHarness = {
        calls: [],
        followUpCalls: [],
        followUpResponseIndex: 0,
        followUpResponses: [],
        responseIndex: 0,
        responses: [],
        widgetState: {},
      };
      window.openai = {
        theme: hostConfig.theme,
        displayMode: hostConfig.displayMode,
        maxHeight: hostConfig.maxHeight,
        safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
        userAgent: {
          device: { type: hostConfig.deviceType },
          capabilities: {
            touch: hostConfig.deviceType === 'mobile',
            hover: hostConfig.deviceType !== 'mobile',
          },
        },
        widgetState: {},
        callTool: async (name, args) => {
          const state = window.__indexterRequestEpochHarness;
          const responseIndex = state.responseIndex++;
          const response = state.responses[responseIndex];
          state.calls.push({ name, args: structuredClone(args), responseIndex });
          if (!response) throw new Error('No Indexter fixture response configured.');
          await new Promise((resolve) => setTimeout(resolve, response.delayMs ?? 0));
          if (response.reject) throw new Error(response.reject);
          return structuredClone(response.result);
        },
        sendFollowUpMessage: async (message) => {
          const state = window.__indexterRequestEpochHarness;
          const responseIndex = state.followUpResponseIndex++;
          const response = state.followUpResponses[responseIndex];
          state.followUpCalls.push({
            message: structuredClone(message),
            responseIndex,
          });
          if (!response) return;
          await new Promise((resolve) => setTimeout(resolve, response.delayMs ?? 0));
          if (response.reject) throw new Error(response.reject);
        },
        setWidgetState: async (nextState) => {
          const state = window.__indexterRequestEpochHarness;
          state.widgetState = structuredClone(nextState);
          window.openai.widgetState = structuredClone(nextState);
        },
        notifyIntrinsicHeight: () => {},
      };
    </script>
    <script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { IndexterDiscovery } from '/src/components/indexter/discovery/IndexterDiscovery.tsx';
      import '/src/styles/sdk.css';
      import '/src/styles/widgets/indexter-discovery.css';

      const root = createRoot(document.getElementById('indexter-request-epoch-root'));
      const state = window.__indexterRequestEpochHarness;
      state.render = (payload) => {
        root.render(React.createElement(IndexterDiscovery, {
          initialPayload: structuredClone(payload),
        }));
      };
      state.ready = true;
    </script>
  </body>
</html>`;
}

function installInteractiveMcpHost({
  checkToolResult,
  displayModeBehaviors = [],
  displayModeResponseDelays = [],
  dimensions,
  initResult,
  initialDisplayMode = 'inline',
  messageBehavior = 'resolve',
  toolCallResponseDelays = {},
  toolCallResponses = {},
  toolInput,
  toolResult,
  updateModelContextBehavior = 'resolve',
  widgetUrl,
}) {
  const iframe = document.getElementById('widget');
  const surface = document.getElementById('surface');
  window.__appsHost = {
    calls: [],
    mode: initialDisplayMode,
    dimensions,
    displayModeBehaviors,
    displayModeResponseDelays: displayModeResponseDelays ?? [],
    displayModeRequestIndex: 0,
    toolCallResponses,
    toolCallResponseDelays,
    toolCallResponseIndexes: {},
    lastReportedHeight: null,
    appliedHeight: null,
  };

  const applyDimensions = ({ provisional = false } = {}) => {
    const state = window.__appsHost;
    const next = state.dimensions[state.mode];
    const requested = provisional || !Number.isFinite(state.lastReportedHeight)
      ? next.maxHeight
      : Math.ceil(state.lastReportedHeight);
    const appliedHeight = Math.max(80, Math.min(next.maxHeight, requested));
    surface.style.width = `${next.width}px`;
    iframe.style.width = '100%';
    iframe.style.height = `${appliedHeight}px`;
    state.appliedHeight = appliedHeight;
  };

  applyDimensions();

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return;
    }

    const state = window.__appsHost;
    state.calls.push(message);
    const child = event.source;
    const respond = (result) => {
      child.postMessage({ jsonrpc: '2.0', id: message.id, result }, '*');
    };
    const notify = (method, params) => {
      child.postMessage({ jsonrpc: '2.0', method, params }, '*');
    };

    switch (message.method) {
      case 'ui/initialize':
        respond(initResult);
        break;
      case 'ui/notifications/initialized':
        setTimeout(() => {
          notify('ui/notifications/tool-input', { arguments: toolInput });
          notify('ui/notifications/tool-result', toolResult);
        }, 0);
        break;
      case 'ui/notifications/size-changed': {
        const reported = Number(message.params?.height);
        if (Number.isFinite(reported) && reported > 0) {
          state.lastReportedHeight = reported;
          applyDimensions();
        }
        break;
      }
      case 'ui/request-display-mode': {
        const mode = message.params?.mode;
        if (mode !== 'inline' && mode !== 'fullscreen') {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32602, message: 'Unsupported display mode' },
          }, '*');
          break;
        }
        const responseDelay = Number(
          state.displayModeResponseDelays[state.displayModeRequestIndex++] ?? 0,
        );
        const behavior = state.displayModeBehaviors[state.displayModeRequestIndex - 1]
          ?? 'resolve';
        if (behavior === 'hang') break;
        if (behavior === 'reject') {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'Display mode denied by fixture host' },
          }, '*');
          break;
        }
        setTimeout(() => {
          state.mode = mode;
          state.lastReportedHeight = null;
          applyDimensions({ provisional: true });
          respond({ mode });
          notify('ui/notifications/host-context-changed', {
            displayMode: mode,
            containerDimensions: state.dimensions[mode],
          });
        }, Number.isFinite(responseDelay) ? Math.max(0, responseDelay) : 0);
        break;
      }
      case 'tools/call': {
        const name = typeof message.params?.name === 'string'
          ? message.params.name
          : '';
        const configured = Array.isArray(state.toolCallResponses?.[name])
          ? state.toolCallResponses[name]
          : null;
        const responseIndex = Number(state.toolCallResponseIndexes[name] ?? 0);
        state.toolCallResponseIndexes[name] = responseIndex + 1;
        if (configured && responseIndex < configured.length) {
          const responseDelay = Number(
            state.toolCallResponseDelays?.[name]?.[responseIndex] ?? 0,
          );
          setTimeout(
            () => respond(configured[responseIndex]),
            Number.isFinite(responseDelay) ? Math.max(0, responseDelay) : 0,
          );
          break;
        }
        if (name === 'x402_check') {
          respond(checkToolResult);
          break;
        }
        respond({
          content: [{
            type: 'text',
            text: `No fixture response configured for ${name || 'an unnamed tool'}.`,
          }],
          isError: true,
        });
        break;
      }
      case 'ui/update-model-context':
        if (updateModelContextBehavior === 'hang') break;
        if (updateModelContextBehavior === 'reject') {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'Context update denied by fixture host' },
          }, '*');
          break;
        }
        respond({ isError: false });
        break;
      case 'ui/message':
        if (messageBehavior === 'hang') break;
        if (messageBehavior === 'reject') {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'Message denied by fixture host' },
          }, '*');
          break;
        }
        respond({ isError: false });
        break;
      case 'ui/open-link':
      case 'ui/download-file':
        respond({ isError: false });
        break;
      default:
        if (Object.prototype.hasOwnProperty.call(message, 'id')) {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `Unsupported fixture method: ${message.method}` },
          }, '*');
        }
    }
  });

  iframe.src = widgetUrl;
}

function surfaceInvocation(surface) {
  return {
    toolName: surface.tools[0],
    requestId: `interaction-${surface.id}`,
    widgetSessionId: `interaction-widget-${surface.id}`,
  };
}

function initResult(dimensions, surface) {
  const invocation = surfaceInvocation(surface);
  return {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'OpenDexter Interaction Fixture', version: '1.0.0' },
    hostCapabilities: {
      serverTools: {},
      openLinks: {},
      message: { text: {} },
      updateModelContext: { text: {}, structuredContent: {} },
    },
    hostContext: {
      toolInfo: {
        id: invocation.requestId,
        tool: { name: invocation.toolName, inputSchema: { type: 'object' } },
      },
      'openai/widgetSessionId': invocation.widgetSessionId,
      theme: INTERACTION_THEME,
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: dimensions.inline,
      locale: 'en-US',
      timeZone: 'UTC',
      platform: INTERACTION_DEVICE === 'mobile' ? 'mobile' : 'desktop',
      deviceCapabilities: INTERACTION_DEVICE === 'mobile'
        ? { touch: true, hover: false }
        : { touch: false, hover: true },
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      styles: { variables: MCP_APPS_HOST_TOKENS[INTERACTION_THEME] },
    },
  };
}

function rendererToolResult(surface) {
  const invocation = surfaceInvocation(surface);
  const route = surface.id === 'indexter-search'
    ? 'task'
    : surface.id === 'indexter-provider'
      ? 'provider'
      : surface.id === 'indexter-discovery'
        ? 'overview'
        : null;
  return {
    structuredContent: surface.output,
    content: [{ type: 'text', text: 'Deterministic renderer interaction fixture.' }],
    _meta: {
      ...surface.metadata,
      ...(route ? { indexterPayload: { route, data: surface.output } } : {}),
      'dexter/toolInvocation': {
        toolName: invocation.toolName,
        requestId: invocation.requestId,
      },
      'openai/widgetSessionId': invocation.widgetSessionId,
    },
    isError: false,
  };
}

function discoveryToolResult(structuredContent) {
  return {
    structuredContent,
    content: [{ type: 'text', text: 'Deterministic Indexter discovery fixture.' }],
    _meta: { fixture: true },
    isError: false,
  };
}

function installFixedClock(fixedNow) {
  const RealDate = Date;
  const fixedTimestamp = new RealDate(fixedNow).getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTimestamp]));
    }
    static now() {
      return fixedTimestamp;
    }
  }
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', { configurable: true, value: FixedDate });
}

function isLocalRequest(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function openRenderer({
  callToolAvailable = true,
  context,
  baseUrl,
  surface,
  availableDisplayModes,
  displayModeBehaviors,
  displayModeResponseDelays,
  inlineMaxHeight,
  initialDisplayMode = 'inline',
  messageBehavior,
  initialWidgetState,
  toolCallResponseDelays,
  toolCallResponses,
  updateModelContextBehavior,
}) {
  const page = await context.newPage();
  const pageErrors = [];
  if (initialWidgetState) {
    await page.addInitScript((state) => {
      if (window.self === window.top) return;
      window.__fixtureWidgetState = structuredClone(state);
      window.__fixtureWidgetStateWrites = [];
      window.openai = {
        widgetState: structuredClone(state),
        setWidgetState: async (nextState) => {
          window.__fixtureWidgetState = structuredClone(nextState);
          window.__fixtureWidgetStateWrites.push(structuredClone(nextState));
          window.openai.widgetState = structuredClone(nextState);
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { widgetState: structuredClone(nextState) } },
          }));
        },
      };
    }, initialWidgetState);
  }
  await page.goto(`${baseUrl}/__opendexter_interaction_host__`, {
    waitUntil: 'domcontentloaded',
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const dimensions = modeContexts(VIEWPORT);
  if (Number.isFinite(inlineMaxHeight)) {
    dimensions.inline.maxHeight = Math.max(80, Math.round(inlineMaxHeight));
  }
  const initialization = initResult(dimensions, surface);
  if (availableDisplayModes) {
    initialization.hostContext.availableDisplayModes = availableDisplayModes;
  }
  if (!callToolAvailable) {
    delete initialization.hostCapabilities.serverTools;
  }
  initialization.hostContext.displayMode = initialDisplayMode;
  initialization.hostContext.containerDimensions = dimensions[initialDisplayMode];
  await page.evaluate(installInteractiveMcpHost, {
    checkToolResult: CHECK_TOOL_RESULT,
    displayModeBehaviors: displayModeBehaviors ?? [],
    displayModeResponseDelays: displayModeResponseDelays ?? [],
    dimensions,
    initResult: initialization,
    initialDisplayMode,
    messageBehavior: messageBehavior ?? 'resolve',
    toolCallResponses: toolCallResponses ?? {},
    toolCallResponseDelays: toolCallResponseDelays ?? {},
    toolInput: surface.input,
    toolResult: rendererToolResult(surface),
    updateModelContextBehavior: updateModelContextBehavior ?? 'resolve',
    widgetUrl: `${baseUrl}/${surface.file}`,
  });

  const frame = page.frameLocator('#widget');
  return { dimensions, frame, page, pageErrors };
}

async function openIndexterRequestEpochHarness({
  context,
  baseUrl,
  initialPayload,
  responses,
  followUpResponses = [],
}) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/__indexter_request_epoch_harness__`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.__indexterRequestEpochHarness?.ready === true);
  await page.evaluate(({ payload, queuedResponses, queuedFollowUpResponses }) => {
    const state = window.__indexterRequestEpochHarness;
    state.responses = structuredClone(queuedResponses);
    state.followUpResponses = structuredClone(queuedFollowUpResponses);
    state.responseIndex = 0;
    state.followUpResponseIndex = 0;
    state.calls = [];
    state.followUpCalls = [];
    state.render(payload);
  }, {
    payload: initialPayload,
    queuedResponses: responses,
    queuedFollowUpResponses: followUpResponses,
  });
  await page.locator('.dx-discovery').waitFor();
  return { page, pageErrors };
}

async function resetHostCalls(page) {
  await page.evaluate(() => {
    window.__appsHost.calls = [];
  });
}

async function hostRequests(page, methods) {
  return page.evaluate((requestedMethods) => (
    window.__appsHost.calls
      .filter((call) => requestedMethods.includes(call.method))
      .map((call) => ({ method: call.method, params: call.params }))
  ), methods);
}

async function captureInteraction(frame, name) {
  if (!CAPTURE_INTERACTIONS) return;
  const outputDir = path.join(REPO_ROOT, 'output', 'playwright', 'opendexter-interactions');
  await mkdir(outputDir, { recursive: true });
  await frame.locator('body').screenshot({
    path: path.join(
      outputDir,
      `${name}--${INTERACTION_DEVICE}--${INTERACTION_THEME}--${BROWSER_ENGINE}.png`,
    ),
  });
}

async function waitForStableHostSize(page, mode) {
  await page.waitForFunction((expectedMode) => {
    const state = window.__appsHost;
    if (!state || state.mode !== expectedMode) return false;
    const reported = state.lastReportedHeight;
    if (!Number.isFinite(reported) || !Number.isFinite(state.appliedHeight)) return false;
    const expected = Math.max(
      80,
      Math.min(state.dimensions[expectedMode].maxHeight, Math.ceil(reported)),
    );
    const iframe = document.getElementById('widget');
    const contentHeight = iframe?.contentDocument?.documentElement?.scrollHeight ?? 0;
    return state.appliedHeight === expected
      && (
        contentHeight <= state.appliedHeight + 1
        || state.appliedHeight === state.dimensions[expectedMode].maxHeight
      );
  }, mode);
  await page.waitForTimeout(80);
}

async function waitForRendererMode(frame, rootSelector, mode) {
  const root = frame.locator(rootSelector);
  await root.waitFor({ state: 'visible' });
  await root.evaluate((element, expectedMode) => {
    const deadline = Date.now() + 4_000;
    return new Promise((resolve, reject) => {
      const check = () => {
        const classMode = element.classList.contains(`${element.classList[0]}--${expectedMode}`);
        const dataMode = element.getAttribute('data-display-mode') === expectedMode;
        const searchMode = element.classList.contains(`dx-search-shell--${expectedMode}`);
        const portfolioMode = element.classList.contains(`dxp-root--${expectedMode}`);
        if (classMode || dataMode || searchMode || portfolioMode) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(`Renderer did not enter ${expectedMode}`));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }, mode);
}

async function assertNoInternalClippedViewport(frame, rootSelector, leafSelector, label) {
  const metrics = await frame.locator(rootSelector).evaluate((root, expectedLeafSelector) => {
    const rootStyle = getComputedStyle(root);
    const rootRect = root.getBoundingClientRect();
    const leaf = root.querySelector(expectedLeafSelector);
    const leafRect = leaf?.getBoundingClientRect() ?? null;
    const clippedContainers = [root, ...root.querySelectorAll('*')]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          className: element.className,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          textOverflow: style.textOverflow,
          lineClamp: style.webkitLineClamp,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          meaningful: Boolean(
            element.textContent?.trim()
            || element.matches('button, a, input, [role="dialog"]')
            || element.querySelector('button, a, input, [role="dialog"]'),
          ),
        };
      })
      .filter((entry) => entry.meaningful && (
        (
          ['auto', 'scroll', 'hidden', 'clip'].includes(entry.overflowY)
          && entry.scrollHeight > entry.clientHeight + 1
        )
        || (
          ['auto', 'scroll', 'hidden', 'clip'].includes(entry.overflowX)
          && entry.scrollWidth > entry.clientWidth + 1
          && entry.textOverflow !== 'ellipsis'
          && (entry.lineClamp === 'none' || entry.lineClamp === '')
        )
      ))
      // Visually hidden assistive copy is intentionally a clipped 1px box.
      .filter((entry) => entry.className !== 'sr-only' && entry.className !== 'dxp-visually-hidden');

    return {
      root: {
        inlineMaxHeight: root.style.maxHeight,
        computedMaxHeight: rootStyle.maxHeight,
        overflowX: rootStyle.overflowX,
        overflowY: rootStyle.overflowY,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        rect: {
          top: rootRect.top,
          right: rootRect.right,
          bottom: rootRect.bottom,
          left: rootRect.left,
        },
      },
      leaf: leafRect ? {
        top: leafRect.top,
        right: leafRect.right,
        bottom: leafRect.bottom,
        left: leafRect.left,
      } : null,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
      },
      clippedContainers,
    };
  }, leafSelector);

  assert.equal(metrics.root.inlineMaxHeight, '', `${label}: root copied maxHeight inline`);
  assert.equal(metrics.root.computedMaxHeight, 'none', `${label}: root imposed a max-height`);
  assert.ok(
    !['auto', 'scroll'].includes(metrics.root.overflowY)
      && !(
        ['hidden', 'clip'].includes(metrics.root.overflowY)
        && metrics.root.scrollHeight > metrics.root.clientHeight + 1
      ),
    `${label}: root became a vertical clipped viewport (${JSON.stringify(metrics.root)})`,
  );
  assert.ok(
    !['auto', 'scroll'].includes(metrics.root.overflowX)
      && !(
        ['hidden', 'clip'].includes(metrics.root.overflowX)
        && metrics.root.scrollWidth > metrics.root.clientWidth + 1
      ),
    `${label}: root became a horizontal clipped viewport (${JSON.stringify(metrics.root)})`,
  );
  assert.deepEqual(
    metrics.clippedContainers,
    [],
    `${label}: descendant content is trapped in a clipped viewport`,
  );
  assert.ok(metrics.leaf, `${label}: missing terminal content ${leafSelector}`);
  assert.ok(
    metrics.leaf.bottom <= metrics.root.rect.bottom + 1,
    `${label}: terminal content extends below its renderer root`,
  );
  assert.ok(
    metrics.document.scrollWidth <= metrics.document.clientWidth + 1,
    `${label}: renderer overflows horizontally`,
  );
  assert.ok(
    metrics.document.scrollHeight <= metrics.viewport.height + 1,
    `${label}: host-reported intrinsic height still leaves the document clipped `
      + `${JSON.stringify({ document: metrics.document, viewport: metrics.viewport })}`,
  );
}

async function assertOneDisplayRequest(page, mode, label) {
  assert.deepEqual(
    await hostRequests(page, ['ui/request-display-mode', 'tools/call']),
    [{ method: 'ui/request-display-mode', params: { mode } }],
    `${label}: wrong MCP Apps request`,
  );
}

async function exerciseWalletSheet({
  frame,
  page,
  action,
  dialogName,
  terminalSelector,
  inspect,
}) {
  await resetHostCalls(page);
  const trigger = frame.getByRole('button', { name: action, exact: true });
  await trigger.click();
  const dialog = frame.getByRole('dialog', { name: dialogName, exact: true });
  await dialog.waitFor({ state: 'visible' });
  await waitForRendererMode(frame, '.dxw-root', 'fullscreen');
  await waitForStableHostSize(page, 'fullscreen');
  await assertOneDisplayRequest(page, 'fullscreen', `wallet ${action}`);
  assert.equal(
    await dialog.locator('.dxw-sheet-close').evaluate((element) => document.activeElement === element),
    true,
    `wallet ${action}: focused detail did not focus its close control`,
  );
  if (inspect) await inspect(dialog);
  // Detail interactions can add content after the sheet's first measurement.
  // Give the ResizeObserver turn to report that new intrinsic height.
  await page.waitForTimeout(120);
  await waitForStableHostSize(page, 'fullscreen');
  await assertNoInternalClippedViewport(
    frame,
    '.dxw-root',
    terminalSelector,
    `wallet ${action}`,
  );

  await resetHostCalls(page);
  await dialog.locator('.dxw-sheet-close').click();
  await dialog.waitFor({ state: 'detached' });
  await waitForRendererMode(frame, '.dxw-root', 'inline');
  await waitForStableHostSize(page, 'inline');
  await assertOneDisplayRequest(page, 'inline', `wallet ${action} close`);
  assert.equal(
    await frame.getByRole('button', { name: action, exact: true })
      .evaluate((element) => document.activeElement === element),
    true,
    `wallet ${action}: closing detail did not restore trigger focus`,
  );
}

test('current OpenDexter renderers use MCP Apps interactions without clipped inner viewports', async (t) => {
  const surfaces = await buildRendererGallerySurfaces();
  const byId = new Map(surfaces.map((surface) => [surface.id, surface]));
  for (const id of [
    'portfolio',
    'dexter-wallet',
    'indexter-search',
    'indexter-discovery',
    'indexter-provider',
  ]) {
    assert.ok(byId.has(id), `Missing ${id} fixture`);
  }

  const vite = await createServer({
    root: UI_ROOT,
    configFile: false,
    plugins: [
      {
        name: 'opendexter-interaction-host',
        configureServer(server) {
          server.middlewares.use('/__opendexter_interaction_host__', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(hostDocument());
          });
          server.middlewares.use(
            '/__indexter_request_epoch_harness__',
            async (request, response, next) => {
              try {
                const html = await server.transformIndexHtml(
                  request.originalUrl ?? request.url ?? '/__indexter_request_epoch_harness__',
                  indexterRequestEpochHarnessDocument(),
                );
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html);
              } catch (error) {
                next(error);
              }
            },
          );
        },
      },
      react(),
    ],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browserType = BROWSER_ENGINE === 'chromium'
    ? chromium
    : BROWSER_ENGINE === 'webkit'
      ? webkit
      : null;
  assert.ok(browserType, `Unknown interaction browser: ${BROWSER_ENGINE}`);
  const executablePath = BROWSER_ENGINE === 'chromium'
    ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    : undefined;
  const browser = await browserType.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: INTERACTION_THEME,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await context.addInitScript(installFixedClock, GALLERY_FIXED_NOW);
  if (BROWSER_ENGINE === 'chromium') {
    await context.grantPermissions(
      ['clipboard-read', 'clipboard-write'],
      { origin: baseUrl },
    );
  }
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (isLocalRequest(request.url(), baseUrl)) {
      await route.continue();
      return;
    }
    if (request.resourceType() === 'image') {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#918677" /></svg>',
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  t.after(async () => {
    await context.close();
    await browser.close();
    await vite.close();
  });

  await t.test('portfolio expands through the host and exposes the complete ledger', { skip: INDEXTER_ONLY }, async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('portfolio'),
    });
    await frame.getByRole('button', { name: 'View portfolio', exact: true }).waitFor();
    await resetHostCalls(page);
    await frame.getByRole('button', { name: 'View portfolio', exact: true }).click();
    await waitForRendererMode(frame, '.dxp-root', 'fullscreen');
    const ledger = frame.locator('.dxp-ledger');
    await ledger.waitFor({ state: 'visible' });
    await waitForStableHostSize(page, 'fullscreen');
    await assertOneDisplayRequest(page, 'fullscreen', 'portfolio expand');
    assert.equal(await ledger.locator('.dxp-holding').count(), 3);
    assert.equal(await ledger.locator('.dxp-target').count(), 2);
    await ledger.getByText('Wallet', { exact: false }).last().waitFor();
    await assertNoInternalClippedViewport(
      frame,
      '.dxp-root',
      '.dxp-read-details',
      'portfolio fullscreen ledger',
    );

    await resetHostCalls(page);
    await ledger.getByRole('button', { name: 'Close', exact: true }).click();
    await frame.getByRole('button', { name: 'View portfolio', exact: true }).waitFor();
    await waitForRendererMode(frame, '.dxp-root', 'inline');
    await waitForStableHostSize(page, 'inline');
    await assertOneDisplayRequest(page, 'inline', 'portfolio close');
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('portfolio remains fully reachable through a bounded pager without fullscreen', { skip: INDEXTER_ONLY }, async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('portfolio'),
      availableDisplayModes: ['inline'],
    });
    const trigger = frame.getByRole('button', { name: 'View portfolio', exact: true });
    await trigger.waitFor();
    await resetHostCalls(page);
    await trigger.click();

    const browserView = frame.locator('.dxp-browser');
    await browserView.getByRole('heading', { name: 'Portfolio details', exact: true }).waitFor();
    assert.equal(
      await browserView.evaluate((element) => document.activeElement === element),
      true,
      'portfolio local detail must receive focus',
    );
    assert.equal(await browserView.locator('.dxp-browser-item').count(), 2);
    await browserView.getByText('Page 1 of 3', { exact: true }).waitFor();

    const pager = browserView.getByRole('navigation', { name: 'Portfolio detail pages' });
    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    await browserView.getByText('Page 2 of 3', { exact: true }).waitFor();
    assert.equal(await browserView.locator('.dxp-browser-item').count(), 2);
    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    await browserView.getByText('Page 3 of 3', { exact: true }).waitFor();
    assert.equal(await browserView.locator('.dxp-browser-item').count(), 1);
    assert.equal(
      await pager.getByRole('button', { name: 'Next', exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      (await hostRequests(page, ['ui/request-display-mode'])).length,
      0,
      'inline-only portfolio must not request an unavailable display mode',
    );
    await assertNoInternalClippedViewport(
      frame,
      '.dxp-root',
      '.dxp-browser__footer',
      'portfolio inline pager',
    );

    await browserView.getByRole('button', { name: 'Back', exact: true }).click();
    await frame.getByRole('button', { name: 'View portfolio', exact: true }).waitFor();
    assert.equal(
      await frame.getByRole('button', { name: 'View portfolio', exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
      'portfolio pager must restore focus to its overview trigger',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('wallet actions open focused fullscreen details and return inline', { skip: INDEXTER_ONLY }, async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('dexter-wallet'),
    });
    await frame.getByRole('button', { name: 'Receive', exact: true }).waitFor();

    await exerciseWalletSheet({
      frame,
      page,
      action: 'Receive',
      dialogName: 'Receive',
      terminalSelector: '.dxw-footnote',
      inspect: async (dialog) => {
        assert.equal(
          await dialog.locator('body').count(),
          0,
          'Receive detail must remain scoped to its dialog',
        );
        const copy = dialog.locator('.dxw-addr');
        assert.equal(
          await copy.evaluate(() => Boolean(navigator.clipboard?.writeText)),
          true,
          'Fixture host should expose clipboard write',
        );
        await copy.click();
        await dialog.getByText('Copied', { exact: true }).waitFor();
        if (BROWSER_ENGINE === 'chromium') {
          assert.equal(
            await copy.evaluate(() => navigator.clipboard.readText()),
            WALLET_ADDRESS,
          );
        }
      },
    });

    await exerciseWalletSheet({
      frame,
      page,
      action: 'Assets',
      dialogName: 'Assets',
      terminalSelector: '.dxw-assets-footnote',
      inspect: async (dialog) => {
        const firstHolding = dialog.locator('.dxw-asset-row').first();
        await firstHolding.click();
        await dialog.locator('.dxw-asset-details').waitFor({ state: 'visible' });
        await dialog.getByText('Program', { exact: true }).waitFor();
      },
    });

    await exerciseWalletSheet({
      frame,
      page,
      action: 'Credit',
      dialogName: 'Credit',
      terminalSelector: '.dxw-chit-meta',
      inspect: async (dialog) => {
        await dialog.getByText('$50.00', { exact: true }).first().waitFor();
        await dialog.locator('.dxw-chit-owed').waitFor();
        await dialog.locator('.dxw-chit-owed [aria-hidden="true"]')
          .getByText('$5.00', { exact: true }).waitFor();
      },
    });

    await exerciseWalletSheet({
      frame,
      page,
      action: 'Activity',
      dialogName: 'Activity',
      terminalSelector: '.dxw-act-row:last-child',
      inspect: async (dialog) => {
        await dialog.getByText('fixture.example', { exact: true }).waitFor();
        await dialog.getByText('paid API call', { exact: false }).waitFor();
      },
    });

    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('inline-only wallet details remain reachable inside a 300px host height', { skip: INDEXTER_ONLY }, async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('dexter-wallet'),
      availableDisplayModes: ['inline'],
      inlineMaxHeight: 300,
    });
    const assertFit = async (terminalSelector, label) => {
      await page.waitForTimeout(140);
      await waitForStableHostSize(page, 'inline');
      await assertNoInternalClippedViewport(frame, '.dxw-root', terminalSelector, label);
    };

    await frame.getByRole('button', { name: 'Receive', exact: true }).click();
    await frame.getByRole('dialog', { name: 'Receive', exact: true }).waitFor();
    await assertFit('.dxw-footnote', 'wallet Receive at 300px');
    await frame.getByRole('button', { name: 'Close Receive', exact: true }).click();

    await frame.getByRole('button', { name: 'Assets', exact: true }).click();
    const assets = frame.getByRole('dialog', { name: 'Assets', exact: true });
    await assets.waitFor();
    assert.equal(await assets.locator('.dxw-asset-row').count(), 1);
    await assertFit('.dxw-pager', 'wallet Assets list at 300px');
    await assets.locator('.dxw-asset-row').first().click();
    const detailPager = assets.getByRole('navigation', { name: 'Asset detail pages' });
    await detailPager.waitFor();
    for (;;) {
      await assertFit('.dxw-pager', 'wallet asset detail page at 300px');
      const next = detailPager.getByRole('button', { name: 'Next', exact: true });
      if (await next.isDisabled()) break;
      await next.click();
    }
    await assets.getByRole('button', { name: 'Close Assets', exact: true }).click();

    await frame.getByRole('button', { name: 'Credit', exact: true }).click();
    await frame.getByRole('dialog', { name: 'Credit', exact: true }).waitFor();
    await assertFit('.dxw-chit-meta', 'wallet Credit at 300px');
    await frame.getByRole('button', { name: 'Close Credit', exact: true }).click();

    await frame.getByRole('button', { name: 'Activity', exact: true }).click();
    await frame.getByRole('dialog', { name: 'Activity', exact: true }).waitFor();
    await assertFit('.dxw-act-row:last-child', 'wallet Activity at 300px');
    assert.equal(
      (await hostRequests(page, ['ui/request-display-mode'])).length,
      0,
      'inline-only wallet must not request an unavailable display mode',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('wallet and portfolio correct stale host mode responses in both directions', { skip: INDEXTER_ONLY }, async () => {
    const wallet = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('dexter-wallet'),
      // The close response lands after the second open. The renderer must
      // issue a final fullscreen correction instead of leaving the open sheet inline.
      displayModeResponseDelays: [120, 200, 0, 0],
    });
    const receive = wallet.frame.getByRole('button', { name: 'Receive', exact: true });
    await receive.waitFor();
    await resetHostCalls(wallet.page);
    await receive.click();
    const firstDialog = wallet.frame.getByRole('dialog', { name: 'Receive', exact: true });
    await firstDialog.waitFor();
    await firstDialog.getByRole('button', { name: 'Close Receive', exact: true }).click();
    await wallet.frame.getByRole('button', { name: 'Receive', exact: true }).click();
    await wallet.frame.getByRole('dialog', { name: 'Receive', exact: true }).waitFor();
    await wallet.page.waitForTimeout(500);
    await waitForRendererMode(wallet.frame, '.dxw-root', 'fullscreen');
    const walletModes = (await hostRequests(wallet.page, ['ui/request-display-mode']))
      .map((call) => call.params.mode);
    assert.ok(
      walletModes.length >= 4
      && walletModes[0] === 'fullscreen'
      && walletModes.includes('inline')
      && walletModes.at(-1) === 'fullscreen',
      `wallet must finish with a fullscreen correction after a rapid reopen: ${walletModes.join(', ')}`,
    );
    assert.deepEqual(wallet.pageErrors, []);
    await wallet.page.close();

    const portfolio = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('portfolio'),
      displayModeResponseDelays: [120, 200, 0, 0],
    });
    const view = portfolio.frame.getByRole('button', { name: 'View portfolio', exact: true });
    await view.waitFor();
    await resetHostCalls(portfolio.page);
    await view.click();
    await portfolio.frame.getByRole('button', { name: 'Back', exact: true }).click();
    await portfolio.frame.getByRole('button', { name: 'View portfolio', exact: true }).click();
    await portfolio.page.waitForTimeout(500);
    await waitForRendererMode(portfolio.frame, '.dxp-root', 'fullscreen');
    const portfolioModes = (await hostRequests(portfolio.page, ['ui/request-display-mode']))
      .map((call) => call.params.mode);
    assert.ok(
      portfolioModes.length >= 4
      && portfolioModes[0] === 'fullscreen'
      && portfolioModes.includes('inline')
      && portfolioModes.at(-1) === 'fullscreen',
      `portfolio must finish with a fullscreen correction after a rapid reopen: ${portfolioModes.join(', ')}`,
    );
    assert.deepEqual(portfolio.pageErrors, []);
    await portfolio.page.close();
  });

  await t.test('wallet preserves a host-provided fullscreen mode across sheet dismissal', { skip: INDEXTER_ONLY }, async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('dexter-wallet'),
      initialDisplayMode: 'fullscreen',
    });
    await waitForRendererMode(frame, '.dxw-root', 'fullscreen');
    await resetHostCalls(page);
    await frame.getByRole('button', { name: 'Receive', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: 'Receive', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Close Receive', exact: true }).click();
    await frame.getByRole('button', { name: 'Receive', exact: true }).waitFor();
    await waitForRendererMode(frame, '.dxw-root', 'fullscreen');
    assert.deepEqual(
      await hostRequests(page, ['ui/request-display-mode']),
      [],
      'a sheet opened from host fullscreen must not request or collapse display mode',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter discovery enters fullscreen before one provider tool call and restores keyboard focus', async () => {
    const providerSurface = byId.get('indexter-provider');
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      toolCallResponses: {
        indexter_discover: [discoveryToolResult(providerSurface.output)],
      },
    });
    const providerTrigger = frame.getByRole('button', {
      name: 'Explore Massive',
      exact: true,
    });
    await providerTrigger.waitFor({ timeout: 5_000 });
    await resetHostCalls(page);
    await providerTrigger.focus();
    await providerTrigger.press('Enter');

    await waitForRendererMode(frame, '.dx-discovery', 'fullscreen');
    await waitForStableHostSize(page, 'fullscreen');
    const providerHeading = frame.getByRole('heading', {
      level: 1,
      name: 'Massive',
      exact: true,
    });
    await providerHeading.waitFor();
    await frame.locator('.dx-discovery-provider-hero h1:focus').waitFor();
    assert.equal(
      await providerHeading.evaluate((element) => document.activeElement === element),
      true,
      'provider drill-in must focus the provider heading',
    );
    await captureInteraction(frame, 'indexter-provider');

    const providerRequests = await hostRequests(page, [
      'ui/request-display-mode',
      'tools/call',
    ]);
    assert.deepEqual(providerRequests, [
      {
        method: 'ui/request-display-mode',
        params: { mode: 'fullscreen' },
      },
      {
        method: 'tools/call',
        params: {
          name: 'indexter_discover',
          arguments: {
            provider: 'massive.com',
            capabilityPageSize: 16,
            actorPageSize: 8,
          },
        },
      },
    ]);

    await frame.getByRole('button', { name: 'All providers', exact: true }).click();
    const restoredTrigger = frame.getByRole('button', {
      name: 'Explore Massive',
      exact: true,
    });
    await restoredTrigger.waitFor();
    await frame.locator('.dx-discovery-provider[aria-label="Explore Massive"]:focus').waitFor();
    assert.equal(
      await restoredTrigger.evaluate((element) => document.activeElement === element),
      true,
      'Back must restore focus to the provider that opened the detail view',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter discovery opens providers directly when fullscreen is unavailable', async () => {
    const providerSurface = byId.get('indexter-provider');
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      availableDisplayModes: ['inline'],
      toolCallResponses: {
        indexter_discover: [discoveryToolResult(providerSurface.output)],
      },
    });
    const providerTrigger = frame.getByRole('button', {
      name: 'Explore Massive',
      exact: true,
    });
    await providerTrigger.waitFor();
    await resetHostCalls(page);
    await providerTrigger.focus();
    await page.keyboard.press('Enter');
    const providerHeading = frame.getByRole('heading', {
      level: 1,
      name: 'Massive',
      exact: true,
    });
    await providerHeading.waitFor();
    await frame.locator('.dx-discovery-provider-hero h1:focus').waitFor();

    const actionCalls = await hostRequests(page, [
      'ui/request-display-mode',
      'tools/call',
      'ui/message',
    ]);
    assert.equal(actionCalls.length, 1);
    assert.deepEqual(actionCalls[0], {
      method: 'tools/call',
      params: {
        name: 'indexter_discover',
        arguments: {
          provider: 'massive.com',
          capabilityPageSize: 16,
          actorPageSize: 8,
        },
      },
    });
    assert.equal(
      await providerHeading.evaluate((element) => document.activeElement === element),
      true,
      'inline provider drill-in must focus the provider heading',
    );
    await waitForRendererMode(frame, '.dx-discovery', 'inline');
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter provider drill-in does not wait for hung host presentation calls', async () => {
    const providerSurface = byId.get('indexter-provider');
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      displayModeBehaviors: ['hang'],
      updateModelContextBehavior: 'hang',
      toolCallResponses: {
        indexter_discover: [discoveryToolResult(providerSurface.output)],
      },
    });
    const providerTrigger = frame.getByRole('button', {
      name: 'Explore Massive',
      exact: true,
    });
    await providerTrigger.waitFor();
    await resetHostCalls(page);
    await providerTrigger.click();

    await frame.getByRole('heading', { level: 1, name: 'Massive', exact: true }).waitFor();
    await frame.locator('.dx-discovery-resource').nth(3).waitFor();
    await page.waitForFunction(() => (
      window.__appsHost.calls.filter((call) => [
        'ui/request-display-mode',
        'tools/call',
        'ui/update-model-context',
      ].includes(call.method)).length === 3
    ));
    assert.equal(await frame.getByRole('status').count(), 0, 'loading must clear');
    assert.equal(await frame.locator('.dx-discovery-resource').count(), 4);
    assert.equal(await page.evaluate(() => window.__appsHost.mode), 'inline');
    assert.deepEqual(
      (await hostRequests(page, [
        'ui/request-display-mode',
        'tools/call',
        'ui/update-model-context',
      ])).map((call) => call.method),
      ['ui/request-display-mode', 'tools/call', 'ui/update-model-context'],
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter browse expands inline when fullscreen is denied', async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      displayModeBehaviors: ['reject'],
    });
    await frame.locator('.dx-discovery-providers').waitFor();
    assert.equal(await frame.locator('.dx-discovery-provider').count(), 2);
    await frame.getByRole('button', { name: 'Browse providers', exact: true }).click();
    await frame.locator('.dx-discovery-provider').nth(5).waitFor();
    assert.equal(await frame.locator('.dx-discovery-provider').count(), 7);
    assert.equal(await page.evaluate(() => window.__appsHost.mode), 'inline');
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter reports a rejected chat fallback without an unhandled error', async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      callToolAvailable: false,
      messageBehavior: 'reject',
    });
    await resetHostCalls(page);
    await frame.getByRole('button', { name: 'Explore Massive', exact: true }).click();
    await frame.getByRole('alert').getByText(
      "Couldn't open Massive. Try again.",
      { exact: true },
    ).waitFor();
    assert.deepEqual(
      (await hostRequests(page, ['tools/call', 'ui/message'])).map((call) => call.method),
      ['ui/message'],
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter discovery forwards one opaque cursor, dedupes pages, and preserves paginated focus', async () => {
    const initialSurface = structuredClone(byId.get('indexter-discovery'));
    const opaqueCursor = 'rev-17.eyJhZnRlciI6ImJpdHJlZmlsbC5jb20ifQ.sig';
    initialSurface.output.page.nextCursor = opaqueCursor;

    const nextPage = structuredClone(initialSurface.output);
    const overlappingProvider = structuredClone(initialSurface.output.providers.at(-1));
    const appendedProvider = structuredClone(initialSurface.output.providers[0]);
    Object.assign(appendedProvider, {
      id: 'you.com',
      providerKey: 'you.com',
      providerSlug: 'api.you.com',
      technicalHost: 'api.you.com',
      displayName: 'You.com',
      description: 'Web search and current-source retrieval.',
      logoUrl: 'https://you.com/favicon.ico',
      docsUrl: 'https://documentation.you.com',
      editorial: { featured: true, order: 6, evidenceResourceId: null },
      catalog: {
        resourceCount: 1,
        actorCounts: { returned: 0, indexed: 0, total: 0 },
        offeringCounts: { returned: 0, indexed: 1, total: 1 },
        capabilityGroupCount: 1,
        countsComplete: true,
      },
      actorCatalog: null,
      evidence: {
        totalResourceCount: 1,
        evaluatedResourceCount: 1,
        deliveredRecentlyCount: 0,
        termsCheckedCount: 1,
        noCurrentConfirmationCount: 0,
        latestObservedAt: GALLERY_FIXED_NOW,
        coverageComplete: true,
      },
      capabilityGroups: [{
        id: 'web-search',
        label: 'Web search',
        resourceCount: 1,
        returnedResourceCount: 0,
        resources: [],
      }],
    });
    nextPage.providers = [overlappingProvider, appendedProvider];
    nextPage.featuredOfferings = [];
    nextPage.summary.returnedProviderCount = 2;
    nextPage.page = {
      version: 2,
      namespace: 'indexter.endpoint.providers.v1',
      scope: 'providers',
      order: 'featured_provider_curation_v1',
      limit: 6,
      returned: 2,
      hasMore: false,
      nextCursor: null,
    };

    const appendedProviderDetail = structuredClone(byId.get('indexter-provider').output);
    appendedProviderDetail.requestedProvider = 'you.com';
    Object.assign(appendedProviderDetail.providers[0], {
      id: appendedProvider.id,
      providerKey: appendedProvider.providerKey,
      providerSlug: appendedProvider.providerSlug,
      technicalHost: appendedProvider.technicalHost,
      displayName: appendedProvider.displayName,
      description: appendedProvider.description,
      logoUrl: appendedProvider.logoUrl,
      docsUrl: appendedProvider.docsUrl,
      editorial: appendedProvider.editorial,
    });
    appendedProviderDetail.summary.returnedProviderCount = 1;

    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: initialSurface,
      toolCallResponses: {
        indexter_discover: [
          discoveryToolResult(nextPage),
          discoveryToolResult(appendedProviderDetail),
        ],
      },
    });
    await frame.getByRole('button', { name: 'Browse providers', exact: true }).click();
    await waitForRendererMode(frame, '.dx-discovery', 'fullscreen');
    await waitForStableHostSize(page, 'fullscreen');
    const moreProviders = frame.getByRole('button', {
      name: 'More providers',
      exact: true,
    });
    await moreProviders.waitFor();
    await resetHostCalls(page);
    await moreProviders.click();

    const appendedTrigger = frame.getByRole('button', {
      name: 'Explore You.com',
      exact: true,
    });
    await appendedTrigger.waitFor();
    await frame.locator('.dx-discovery-provider[aria-label="Explore You.com"]:focus').waitFor();
    assert.equal(
      await frame.getByRole('button', { name: 'Explore Bitrefill', exact: true }).count(),
      1,
      'a provider repeated across pages must remain unique',
    );
    assert.equal(await appendedTrigger.count(), 1, 'the appended provider must render once');
    assert.equal(
      await frame.locator('.dx-discovery-provider').count(),
      8,
      'pagination must append only the novel provider',
    );

    let toolCalls = await hostRequests(page, ['tools/call']);
    assert.deepEqual(toolCalls, [{
      method: 'tools/call',
      params: {
        name: 'indexter_discover',
        arguments: {
          limit: 7,
          cursor: opaqueCursor,
        },
      },
    }]);
    assert.equal(
      Object.hasOwn(toolCalls[0].params.arguments, 'offset'),
      false,
      'the widget must forward the opaque cursor without creating an offset',
    );

    await page.keyboard.press('Enter');
    const appendedHeading = frame.getByRole('heading', {
      level: 1,
      name: 'You.com',
      exact: true,
    });
    await appendedHeading.waitFor();
    await frame.locator('.dx-discovery-provider-hero h1:focus').waitFor();
    await frame.getByRole('button', { name: 'All providers', exact: true }).click();
    const restoredAppendedTrigger = frame.getByRole('button', {
      name: 'Explore You.com',
      exact: true,
    });
    await restoredAppendedTrigger.waitFor();
    await frame.locator('.dx-discovery-provider[aria-label="Explore You.com"]:focus').waitFor();
    assert.equal(
      await restoredAppendedTrigger.evaluate((element) => document.activeElement === element),
      true,
      'Back must restore focus to a provider appended by cursor pagination',
    );

    toolCalls = await hostRequests(page, ['tools/call']);
    assert.deepEqual(toolCalls[1], {
      method: 'tools/call',
      params: {
        name: 'indexter_discover',
        arguments: {
          provider: 'you.com',
          capabilityPageSize: 16,
          actorPageSize: 8,
        },
      },
    });
    assert.equal(toolCalls.length, 2);
    assert.ok(toolCalls.every((call) => call.params.name === 'indexter_discover'));
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter cancels delayed overview pagination when provider navigation wins', async () => {
    const initialSurface = structuredClone(byId.get('indexter-discovery'));
    const opaqueCursor = 'rev-17.delayed-provider-page.sig';
    initialSurface.output.page.nextCursor = opaqueCursor;

    const delayedPage = structuredClone(initialSurface.output);
    const delayedProvider = structuredClone(initialSurface.output.providers[0]);
    Object.assign(delayedProvider, {
      id: 'you.com',
      providerKey: 'you.com',
      providerSlug: 'api.you.com',
      technicalHost: 'api.you.com',
      displayName: 'Delayed provider',
      actorCatalog: null,
    });
    delayedPage.providers = [delayedProvider];
    delayedPage.featuredOfferings = [];
    delayedPage.summary.returnedProviderCount = 1;
    delayedPage.page = {
      version: 2,
      namespace: 'indexter.endpoint.providers.v1',
      scope: 'providers',
      order: 'featured_provider_curation_v1',
      limit: initialSurface.output.page.limit,
      returned: 1,
      hasMore: false,
      nextCursor: null,
    };

    const providerDetail = structuredClone(byId.get('indexter-provider').output);
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: initialSurface,
      toolCallResponseDelays: { indexter_discover: [600, 0] },
      toolCallResponses: {
        indexter_discover: [
          discoveryToolResult(delayedPage),
          discoveryToolResult(providerDetail),
        ],
      },
    });
    await frame.getByRole('button', { name: 'Browse providers', exact: true }).click();
    await waitForRendererMode(frame, '.dx-discovery', 'fullscreen');
    const moreProviders = frame.getByRole('button', {
      name: 'More providers',
      exact: true,
    });
    const providerTrigger = frame.getByRole('button', {
      name: 'Explore Massive',
      exact: true,
    });
    await moreProviders.waitFor();
    await resetHostCalls(page);
    await moreProviders.click();
    await frame.getByRole('button', { name: 'Loading…', exact: true }).waitFor();
    await providerTrigger.click();

    await frame.getByRole('heading', { level: 1, name: 'Massive', exact: true }).waitFor();
    await frame.getByRole('button', { name: 'All providers', exact: true }).click();
    await moreProviders.waitFor();
    assert.equal(await moreProviders.isEnabled(), true, 'More providers must recover after Back');

    await page.waitForTimeout(700);
    assert.equal(
      await frame.getByRole('button', { name: 'Explore Delayed provider', exact: true }).count(),
      0,
      'a cancelled overview page must not replace restored overview state',
    );
    assert.equal(await moreProviders.isEnabled(), true, 'the late response must not wedge pagination');
    assert.deepEqual(
      (await hostRequests(page, ['tools/call'])).map((call) => call.params.arguments),
      [
        { limit: initialSurface.output.page.limit, cursor: opaqueCursor },
        { provider: 'massive.com', capabilityPageSize: 16, actorPageSize: 8 },
      ],
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter ignores a delayed overview after the host mounts a new payload', async () => {
    const initialPayload = structuredClone(byId.get('indexter-provider').output);
    const delayedOverview = structuredClone(byId.get('indexter-discovery').output);
    delayedOverview.providers[0].displayName = 'Delayed old overview';

    const hostOverview = structuredClone(byId.get('indexter-discovery').output);
    hostOverview.providers[0].displayName = 'Current host overview';

    const { page, pageErrors } = await openIndexterRequestEpochHarness({
      context,
      baseUrl,
      initialPayload,
      responses: [{
        delayMs: 600,
        result: discoveryToolResult(delayedOverview),
      }],
    });
    await page.getByRole('button', { name: 'All providers', exact: true }).click();
    await page.waitForFunction(() => window.__indexterRequestEpochHarness.calls.length === 1);

    await page.evaluate((payload) => {
      window.__indexterRequestEpochHarness.render(payload);
    }, hostOverview);
    await page.getByRole('button', {
      name: 'Explore Current host overview',
      exact: true,
    }).waitFor();

    await page.waitForTimeout(700);
    assert.equal(
      await page.getByRole('button', {
        name: 'Explore Delayed old overview',
        exact: true,
      }).count(),
      0,
      'the old overview promise must not replace a newer host payload',
    );
    assert.equal(
      await page.getByRole('button', {
        name: 'Explore Current host overview',
        exact: true,
      }).count(),
      1,
    );
    assert.equal(await page.locator('.dx-discovery-error').count(), 0);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter keeps a new host continuation owned when an old continuation settles', async () => {
    const initialPayload = structuredClone(byId.get('indexter-provider').output);
    const oldResource = initialPayload.providers[0].capabilityGroups[0].resources[0];
    oldResource.id = '77777777-7777-4777-8777-777777777777';
    oldResource.resourceId = '77777777-7777-4777-8777-777777777777';
    oldResource.resourceUrl = 'https://agent.massive.com/v3/reference/tickers/OLD';
    oldResource.displayName = 'Delayed reservation';
    oldResource.action = {
      ...oldResource.action,
      kind: 'review_endpoint',
      label: 'Review request',
      state: 'review_required',
      resourceId: oldResource.resourceId,
      resourceUrl: oldResource.resourceUrl,
      safety: {
        ...oldResource.action.safety,
        requiresRequestReview: true,
        checkMayAffectProvider: true,
        checkMayCreateProviderReservation: true,
        sideEffectful: true,
        confirmationRequired: true,
        statedEffect: 'Creates a temporary provider reservation.',
      },
    };

    const hostPayload = structuredClone(initialPayload);
    const currentResource = hostPayload.providers[0].capabilityGroups[0].resources[0];
    currentResource.displayName = 'Current reservation';

    const { page, pageErrors } = await openIndexterRequestEpochHarness({
      context,
      baseUrl,
      initialPayload,
      responses: [],
      followUpResponses: [
        { delayMs: 500, reject: 'old follow-up failed' },
        { delayMs: 1_100 },
      ],
    });
    await page.getByRole('button', {
      name: 'Review exact request before checking current terms for Delayed reservation from Massive',
      exact: true,
    }).click();
    await page.waitForFunction(
      () => window.__indexterRequestEpochHarness.followUpCalls.length === 1,
    );

    await page.evaluate((payload) => {
      window.__indexterRequestEpochHarness.render(payload);
    }, hostPayload);
    const currentReview = page.getByRole('button', {
      name: 'Review exact request before checking current terms for Current reservation from Massive',
      exact: true,
    });
    await currentReview.waitFor();
    await currentReview.click();
    await page.waitForFunction(
      () => window.__indexterRequestEpochHarness.followUpCalls.length === 2,
    );

    await page.waitForTimeout(650);
    assert.equal(await currentReview.getAttribute('aria-busy'), 'true');
    assert.equal(await currentReview.isDisabled(), true);
    assert.equal(await currentReview.innerText(), 'Opening…');
    assert.equal(await page.locator('.dx-discovery-error').count(), 0);
    await currentReview.evaluate((element) => element.click());
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(
        () => window.__indexterRequestEpochHarness.followUpCalls.length,
      ),
      2,
      'the old continuation must not release the current continuation for a duplicate handoff',
    );

    await page.waitForFunction(() => (
      window.__indexterRequestEpochHarness.followUpResponseIndex === 2
      && document.querySelector('[aria-label*="Current reservation"]')?.getAttribute('aria-busy') === 'false'
    ), null, { timeout: 2_000 });
    assert.equal(await currentReview.isEnabled(), true);
    assert.equal(await page.locator('.dx-discovery-error').count(), 0);
    const followUpPrompts = await page.evaluate(() => (
      window.__indexterRequestEpochHarness.followUpCalls.map((call) => call.message.prompt)
    ));
    assert.equal(followUpPrompts.length, 2);
    assert.match(followUpPrompts[0], /77777777-7777-4777-8777-777777777777/);
    assert.match(followUpPrompts[1], /77777777-7777-4777-8777-777777777777/);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter keeps replacement pagination busy when an old same-kind call settles', async () => {
    const initialPayload = structuredClone(byId.get('indexter-provider').output);
    initialPayload.page.hasMore = true;
    initialPayload.page.nextCursor = 'endpoint-old-cursor';

    const delayedOldPage = structuredClone(initialPayload);
    delayedOldPage.providers[0].capabilityGroups[0].resources[0].displayName = 'Delayed old service';
    delayedOldPage.page.hasMore = false;
    delayedOldPage.page.nextCursor = null;

    const hostPayload = structuredClone(initialPayload);
    hostPayload.providers[0].capabilityGroups[0].resources[0].displayName = 'Current host service';
    hostPayload.page.nextCursor = 'endpoint-current-cursor';

    const currentNextPage = structuredClone(hostPayload);
    currentNextPage.providers[0].capabilityGroups[0].resources[0].displayName = 'Current second service page';
    currentNextPage.page.hasMore = false;
    currentNextPage.page.nextCursor = null;

    const endpoint = await openIndexterRequestEpochHarness({
      context,
      baseUrl,
      initialPayload,
      responses: [
        { delayMs: 500, result: discoveryToolResult(delayedOldPage) },
        { delayMs: 1_100, result: discoveryToolResult(currentNextPage) },
      ],
    });
    const oldEndpointPager = endpoint.page.getByRole('navigation', {
      name: 'Massive service pages',
      exact: true,
    });
    await oldEndpointPager.getByRole('button', { name: 'Next', exact: true }).click();
    await endpoint.page.waitForFunction(
      () => window.__indexterRequestEpochHarness.calls.length === 1,
    );
    await endpoint.page.evaluate((payload) => {
      window.__indexterRequestEpochHarness.render(payload);
    }, hostPayload);
    await endpoint.page.getByText('Current host service', { exact: true }).waitFor();
    const currentEndpointPager = endpoint.page.getByRole('navigation', {
      name: 'Massive service pages',
      exact: true,
    });
    await currentEndpointPager.getByRole('button', { name: 'Next', exact: true }).click();
    await endpoint.page.waitForFunction(
      () => window.__indexterRequestEpochHarness.calls.length === 2,
    );

    await endpoint.page.waitForTimeout(650);
    assert.equal(await currentEndpointPager.getAttribute('aria-busy'), 'true');
    await currentEndpointPager.getByRole('button', { name: 'Loading…', exact: true }).waitFor();
    assert.equal(
      await endpoint.page.getByText('Delayed old service', { exact: true }).count(),
      0,
    );
    await endpoint.page.getByText('Current second service page', { exact: true }).waitFor({
      timeout: 2_000,
    });
    assert.equal(await currentEndpointPager.getAttribute('aria-busy'), 'false');
    assert.deepEqual(
      await endpoint.page.evaluate(() => (
        window.__indexterRequestEpochHarness.calls.map((call) => call.args.cursor)
      )),
      ['endpoint-old-cursor', 'endpoint-current-cursor'],
    );
    assert.deepEqual(endpoint.pageErrors, []);
    await endpoint.page.close();

    const actorInitialPayload = structuredClone(byId.get('indexter-provider').output);
    const apify = byId.get('indexter-discovery').output.providers.find(
      (provider) => provider.providerKey === 'apify',
    );
    assert.ok(apify?.actorCatalog, 'missing Actor catalog fixture');
    const actorProvider = actorInitialPayload.providers[0];
    const actorProviderIdentity = {
      kind: 'provider',
      providerKey: actorProvider.providerKey,
      providerSlug: actorProvider.providerSlug,
      technicalHost: actorProvider.technicalHost,
      displayName: actorProvider.displayName,
      logoUrl: actorProvider.logoUrl,
    };
    const actorCatalog = structuredClone(apify.actorCatalog);
    actorCatalog.provider = actorProviderIdentity;
    actorCatalog.items = actorCatalog.items.map((actor) => ({
      ...actor,
      provider: actorProviderIdentity,
    }));
    actorCatalog.page.hasMore = true;
    actorCatalog.page.nextCursor = 'actor-old-cursor';
    actorProvider.actorCatalog = actorCatalog;
    actorProvider.catalog.actorCounts = {
      returned: actorCatalog.counts.returned,
      indexed: actorCatalog.counts.indexed,
      total: actorCatalog.counts.total,
    };
    actorProvider.catalog.offeringCounts = {
      returned: actorInitialPayload.page.returned + actorCatalog.counts.returned,
      indexed: actorProvider.catalog.resourceCount + actorCatalog.counts.indexed,
      total: actorProvider.catalog.resourceCount + actorCatalog.counts.total,
    };
    actorProvider.catalog.countsComplete = false;

    const delayedOldActorPage = structuredClone(actorInitialPayload);
    delayedOldActorPage.providers[0].actorCatalog.items[0].title = 'Delayed old Actor';
    delayedOldActorPage.providers[0].actorCatalog.page.hasMore = false;
    delayedOldActorPage.providers[0].actorCatalog.page.nextCursor = null;

    const actorHostPayload = structuredClone(actorInitialPayload);
    actorHostPayload.providers[0].actorCatalog.items[0].title = 'Current host Actor';
    actorHostPayload.providers[0].actorCatalog.page.nextCursor = 'actor-current-cursor';

    const currentNextActorPage = structuredClone(actorHostPayload);
    currentNextActorPage.providers[0].actorCatalog.items[0].title = 'Current second Actor page';
    currentNextActorPage.providers[0].actorCatalog.page.hasMore = false;
    currentNextActorPage.providers[0].actorCatalog.page.nextCursor = null;

    const actor = await openIndexterRequestEpochHarness({
      context,
      baseUrl,
      initialPayload: actorInitialPayload,
      responses: [
        { delayMs: 500, result: discoveryToolResult(delayedOldActorPage) },
        { delayMs: 1_100, result: discoveryToolResult(currentNextActorPage) },
      ],
    });
    const oldActorPager = actor.page.getByRole('navigation', {
      name: 'Massive Actor pages',
      exact: true,
    });
    await oldActorPager.getByRole('button', { name: 'Next', exact: true }).click();
    await actor.page.waitForFunction(
      () => window.__indexterRequestEpochHarness.calls.length === 1,
    );
    await actor.page.evaluate((payload) => {
      window.__indexterRequestEpochHarness.render(payload);
    }, actorHostPayload);
    await actor.page.getByText('Current host Actor', { exact: true }).waitFor();
    const currentActorPager = actor.page.getByRole('navigation', {
      name: 'Massive Actor pages',
      exact: true,
    });
    await currentActorPager.getByRole('button', { name: 'Next', exact: true }).click();
    await actor.page.waitForFunction(
      () => window.__indexterRequestEpochHarness.calls.length === 2,
    );

    await actor.page.waitForTimeout(650);
    assert.equal(await currentActorPager.getAttribute('aria-busy'), 'true');
    await currentActorPager.getByRole('button', { name: 'Loading…', exact: true }).waitFor();
    assert.equal(
      await actor.page.getByText('Delayed old Actor', { exact: true }).count(),
      0,
    );
    await actor.page.waitForTimeout(600);
    const actorBody = await actor.page.locator('body').innerText();
    assert.equal(
      await actor.page.getByText('Current second Actor page', { exact: true }).count(),
      1,
      actorBody,
    );
    assert.equal(await currentActorPager.getAttribute('aria-busy'), 'false');
    assert.deepEqual(
      await actor.page.evaluate(() => (
        window.__indexterRequestEpochHarness.calls.map((call) => call.args.actorCursor)
      )),
      ['actor-old-cursor', 'actor-current-cursor'],
    );
    assert.deepEqual(actor.pageErrors, []);
    await actor.page.close();
  });

  await t.test('Indexter provider replaces capability pages, returns locally, and rejects actor pages', async () => {
    const initialSurface = structuredClone(byId.get('indexter-provider'));
    const capabilityCursor = 'cap-v2.eyJwcm92aWRlciI6Im1hc3NpdmUuY29tIn0.sig';
    initialSurface.output.page.hasMore = true;
    initialSurface.output.page.nextCursor = capabilityCursor;

    const nextResource = structuredClone(
      initialSurface.output.providers[0].capabilityGroups[0].resources[0],
    );
    Object.assign(nextResource, {
      id: '77777777-7777-4777-8777-777777777777',
      resourceId: '77777777-7777-4777-8777-777777777777',
      resourceUrl: 'https://agent.massive.com/v2/reference/news',
      displayName: 'Market news',
      description: 'Recent market news for one ticker.',
    });
    nextResource.action.resourceId = nextResource.resourceId;
    nextResource.action.resourceUrl = nextResource.resourceUrl;
    const nextPage = structuredClone(initialSurface.output);
    nextPage.providers[0].capabilityGroups = [{
      id: 'market-news',
      label: 'Market news',
      resourceCount: 1,
      returnedResourceCount: 1,
      resources: [nextResource],
    }];
    nextPage.providers[0].catalog.offeringCounts.returned = 1;
    nextPage.page = {
      version: 2,
      namespace: 'indexter.endpoint.provider-capabilities.v1',
      scope: 'provider_capabilities',
      order: 'curated_capability_breadth_v1',
      limit: 4,
      returned: 1,
      hasMore: false,
      nextCursor: null,
    };
    const actorPage = structuredClone(nextPage);
    actorPage.page.namespace = 'indexter.actor.catalog.v1';

    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: initialSurface,
      toolCallResponses: {
        indexter_discover: [
          discoveryToolResult(nextPage),
          discoveryToolResult(actorPage),
        ],
      },
    });
    await frame.getByRole('button', { name: 'Open full view', exact: true }).click();
    await waitForRendererMode(frame, '.dx-discovery', 'fullscreen');
    const next = frame.getByRole('button', { name: 'Next', exact: true });
    await next.waitFor();
    await resetHostCalls(page);
    await next.click();

    const nextHeading = frame.getByRole('heading', {
      level: 2,
      name: 'Market news',
      exact: true,
    });
    await nextHeading.waitFor();
    await frame.locator('.dx-discovery-group h2:focus').waitFor();
    assert.equal(
      await nextHeading.evaluate((element) => document.activeElement === element),
      true,
      'the first group heading must receive focus after Next',
    );
    assert.equal(
      await frame.getByText('Ticker details', { exact: true }).count(),
      0,
      'the next capability page must replace the previous resources',
    );
    assert.equal(await frame.locator('.dx-discovery-resource').count(), 1);
    assert.deepEqual(await hostRequests(page, ['tools/call']), [{
      method: 'tools/call',
      params: {
        name: 'indexter_discover',
        arguments: {
          provider: 'massive.com',
          cursor: capabilityCursor,
          capabilityPageSize: 4,
        },
      },
    }]);

    await frame.getByRole('button', { name: 'Previous', exact: true }).click();
    await frame.getByText('Ticker details', { exact: true }).waitFor();
    assert.equal(await frame.locator('.dx-discovery-resource').count(), 4);
    assert.equal(
      await next.evaluate((element) => document.activeElement === element),
      true,
      'Previous must restore focus to the Next trigger',
    );
    assert.equal(
      (await hostRequests(page, ['tools/call'])).length,
      1,
      'Previous must restore the local page without another tool call',
    );

    await next.click();
    await frame.getByRole('alert').getByText(
      "Couldn't load more services. Try again.",
      { exact: true },
    ).waitFor();
    assert.equal(
      await frame.getByText('Ticker details', { exact: true }).count(),
      1,
      'an actor catalog page must not replace endpoint capability state',
    );
    assert.equal(await frame.locator('.dx-discovery-resource').count(), 4);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter provider Check emits one resource-bound chat handoff and no direct action', async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-provider'),
    });
    const check = frame.getByRole('button', {
      name: 'Check current terms for Ticker details from Massive',
      exact: true,
    });
    await check.waitFor();
    await resetHostCalls(page);
    await check.evaluate((element) => {
      element.click();
      element.click();
    });
    await page.waitForFunction(() => (
      window.__appsHost.calls.filter((call) => call.method === 'ui/message').length === 1
    ));
    await page.waitForTimeout(80);

    const actionCalls = await hostRequests(page, [
      'tools/call',
      'ui/message',
      'ui/request-display-mode',
      'ui/update-model-context',
    ]);
    assert.equal(actionCalls.length, 1);
    assert.equal(actionCalls[0].method, 'ui/message');
    const prompt = actionCalls[0].params?.content?.find(
      (item) => item.type === 'text',
    )?.text ?? '';
    assert.match(prompt, /Call x402_check once/);
    assert.match(prompt, /"kind":"indexter_endpoint_reference_v1"/);
    assert.match(prompt, /"resourceId":"33333333-3333-4333-8333-333333333333"/);
    assert.match(prompt, /"method":"GET"/);
    assert.match(prompt, /"resourceUrl":"https:\/\/agent\.massive\.com\/v3\/reference\/tickers\/AAPL"/);
    assert.match(prompt, /"merchant":\{"providerKey":"massive\.com"\}/);
    assert.match(prompt, /do not search again/i);
    assert.match(prompt, /do not pay/i);
    assert.doesNotMatch(
      prompt,
      /searchResultSetId|searchResultOrdinal|indexter_search|x402_fetch|dexter_wallet/i,
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter provider POST review requires confirmation before any terms check', async () => {
    const surface = structuredClone(byId.get('indexter-provider'));
    const resource = surface.output.providers[0].capabilityGroups[0].resources[0];
    resource.method = 'POST';
    resource.action = {
      ...resource.action,
      kind: 'review_endpoint',
      label: 'Review request',
      state: 'review_required',
      safety: {
        ...resource.action.safety,
        requiresRequestReview: true,
        checkMayAffectProvider: true,
      },
    };
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface,
    });
    const review = frame.getByRole('button', {
      name: 'Review exact request before checking current terms for Ticker details from Massive',
      exact: true,
    });
    await review.waitFor();
    assert.equal(await review.innerText(), 'Review request');
    await resetHostCalls(page);
    await review.click();
    await page.waitForFunction(() => (
      window.__appsHost.calls.filter((call) => call.method === 'ui/message').length === 1
    ));

    const actionCalls = await hostRequests(page, ['tools/call', 'ui/message']);
    assert.equal(
      actionCalls.filter((call) => call.method === 'tools/call').length,
      0,
      'a POST discovery result must not receive direct x402_check authority',
    );
    assert.equal(actionCalls.length, 1);
    assert.equal(actionCalls[0].method, 'ui/message');
    const prompt = actionCalls[0].params?.content?.find(
      (item) => item.type === 'text',
    )?.text ?? '';
    assert.match(prompt, /Indexter POST endpoint that requires request review/);
    assert.match(prompt, /show me the exact target/i);
    assert.match(prompt, /provider-stated effect/i);
    assert.match(
      prompt,
      /Do not call x402_check before that confirmation\./,
    );
    assert.match(prompt, /"resourceId":"33333333-3333-4333-8333-333333333333"/);
    assert.match(prompt, /"method":"POST"/);
    assert.doesNotMatch(prompt, /Call x402_check once/);
    assert.match(prompt, /"resourceUrl":"https:\/\/agent\.massive\.com\/v3\/reference\/tickers\/AAPL"/);
    assert.doesNotMatch(prompt, /x402_fetch|dexter_wallet/i);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter reservation-capable GET renders review and cannot issue a direct check', async () => {
    const surface = structuredClone(byId.get('indexter-provider'));
    const resource = surface.output.providers[0].capabilityGroups[0].resources[0];
    resource.action = {
      ...resource.action,
      kind: 'review_endpoint',
      label: 'Review request',
      state: 'review_required',
      safety: {
        ...resource.action.safety,
        requiresRequestReview: true,
        checkMayAffectProvider: true,
        checkMayCreateProviderReservation: true,
        sideEffectful: true,
        confirmationRequired: true,
        statedEffect: 'Creates a temporary provider reservation.',
      },
    };
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface,
    });
    const review = frame.getByRole('button', {
      name: 'Review exact request before checking current terms for Ticker details from Massive',
      exact: true,
    });
    await review.waitFor();
    assert.equal(await review.innerText(), 'Review request');
    await resetHostCalls(page);
    await review.click();
    await page.waitForFunction(() => (
      window.__appsHost.calls.filter((call) => call.method === 'ui/message').length === 1
    ));

    const actionCalls = await hostRequests(page, ['tools/call', 'ui/message']);
    assert.equal(actionCalls.filter((call) => call.method === 'tools/call').length, 0);
    assert.equal(actionCalls.length, 1);
    const prompt = actionCalls[0].params?.content?.find(
      (item) => item.type === 'text',
    )?.text ?? '';
    assert.match(prompt, /Indexter GET endpoint that requires request review/);
    assert.match(prompt, /"checkMayCreateProviderReservation":true/);
    assert.match(prompt, /"statedEffect":"Creates a temporary provider reservation\."/);
    assert.match(prompt, /Confirmation to check is not payment approval/);
    assert.doesNotMatch(prompt, /Call x402_check once/);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter unavailable endpoint renders disabled and emits no follow-up', async () => {
    const surface = structuredClone(byId.get('indexter-provider'));
    const resource = surface.output.providers[0].capabilityGroups[0].resources[0];
    resource.action = {
      kind: 'endpoint_unavailable',
      label: 'Unavailable',
      state: 'unavailable',
      reason: 'input_contract_unavailable',
      resourceId: resource.resourceId,
      resourceUrl: resource.resourceUrl,
    };
    resource.requestInput = null;
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface,
    });
    const unavailable = frame.getByRole('button', {
      name: 'Ticker details from Massive is unavailable to check',
      exact: true,
    });
    await unavailable.waitFor();
    assert.equal(await unavailable.innerText(), 'Unavailable');
    assert.equal(await unavailable.isDisabled(), true);
    await resetHostCalls(page);
    await unavailable.evaluate((element) => element.click());
    await page.waitForTimeout(80);
    assert.deepEqual(await hostRequests(page, ['tools/call', 'ui/message']), []);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter Actor inspection is catalog-only and survives widget remount', async () => {
    const selection = {
      selectedKind: 'actor',
      selectedId: 'apify:compass/crawler-google-places',
      selectedProviderKey: 'apify',
    };
    const opened = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      initialWidgetState: {},
    });
    const inspect = opened.frame.getByRole('button', {
      name: 'Inspect Google Maps Scraper from Apify',
      exact: true,
    });
    await inspect.waitFor();
    await resetHostCalls(opened.page);
    await inspect.click();

    const details = opened.frame.getByRole('region', {
      name: 'Google Maps Scraper details',
      exact: true,
    });
    await details.waitFor();
    const actorHeading = details.getByRole('heading', {
      level: 1,
      name: 'Google Maps Scraper',
      exact: true,
    });
    await opened.frame.locator('.dx-discovery-actor-detail h1:focus').waitFor();
    assert.equal(
      await actorHeading.evaluate((element) => document.activeElement === element),
      true,
      'Actor inspection must move focus into the detail view',
    );
    await details.getByText('Apify · Compass', { exact: true }).waitFor();
    await details.getByText('$0.004 per event', { exact: true }).waitFor();
    await details.getByText('Catalog listing', { exact: true }).waitFor();
    await details.getByText(
      'OpenDexter can inspect this Actor, but cannot run or pay for it yet.',
      { exact: true },
    ).waitFor();
    await captureInteraction(opened.frame, 'indexter-actor-detail');

    const inspectCalls = await hostRequests(opened.page, [
      'tools/call',
      'ui/message',
      'ui/update-model-context',
      'ui/request-display-mode',
    ]);
    assert.equal(
      inspectCalls.filter((call) => call.method === 'tools/call').length,
      0,
      'Actor inspection must not call a server tool',
    );
    assert.equal(
      inspectCalls.filter((call) => call.method === 'ui/message').length,
      0,
      'Actor inspection must not start a chat action',
    );
    const actorContext = inspectCalls.find((call) => call.method === 'ui/update-model-context')?.params
      ?.structuredContent?.indexterActor;
    assert.equal(actorContext.stableId, selection.selectedId);
    assert.equal(actorContext.actorId, 'compass/crawler-google-places');
    assert.equal(actorContext.providerKey, 'apify');
    assert.equal(actorContext.title, 'Google Maps Scraper');
    assert.equal(actorContext.price.amount, 0.004);
    assert.equal(actorContext.catalogOnly, true);
    assert.equal(actorContext.executionAvailable, false);
    assert.deepEqual(
      await opened.frame.locator('html').evaluate(() => window.__fixtureWidgetStateWrites),
      [selection],
    );

    await details.getByRole('button', { name: 'Back', exact: true }).click();
    const restoredInspect = opened.frame.getByRole('button', {
      name: 'Inspect Google Maps Scraper from Apify',
      exact: true,
    });
    await restoredInspect.waitFor();
    await opened.frame.locator(
      '[data-indexter-actor-trigger="apify:compass/crawler-google-places"]:focus',
    ).waitFor();
    assert.equal(
      await restoredInspect.evaluate((element) => document.activeElement === element),
      true,
      'closing Actor detail must restore the originating control',
    );
    assert.deepEqual(opened.pageErrors, []);
    await opened.page.close();

    const restored = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
      initialWidgetState: selection,
    });
    const restoredDetails = restored.frame.getByRole('region', {
      name: 'Google Maps Scraper details',
      exact: true,
    });
    await restoredDetails.waitFor();
    await restored.frame.locator('.dx-discovery-actor-detail h1:focus').waitFor();
    assert.deepEqual(
      await hostRequests(restored.page, [
        'tools/call',
        'ui/message',
        'ui/update-model-context',
        'ui/request-display-mode',
      ]),
      [],
      'restoring widget selection must not replay an action',
    );
    assert.deepEqual(restored.pageErrors, []);
    await restored.page.close();
  });

  await t.test('Indexter serializes concurrent Actor and endpoint pagination without a stranded pager', async () => {
    const initialSurface = structuredClone(byId.get('indexter-provider'));
    const apify = byId.get('indexter-discovery').output.providers.find(
      (provider) => provider.providerKey === 'apify',
    );
    assert.ok(apify?.actorCatalog, 'missing Actor catalog fixture');
    const provider = initialSurface.output.providers[0];
    const providerIdentity = {
      kind: 'provider',
      providerKey: provider.providerKey,
      providerSlug: provider.providerSlug,
      technicalHost: provider.technicalHost,
      displayName: provider.displayName,
      logoUrl: provider.logoUrl,
    };
    const actorCatalog = structuredClone(apify.actorCatalog);
    actorCatalog.provider = providerIdentity;
    actorCatalog.items = actorCatalog.items.map((actor) => ({
      ...actor,
      provider: providerIdentity,
    }));
    provider.actorCatalog = actorCatalog;
    provider.catalog.actorCounts = {
      returned: actorCatalog.counts.returned,
      indexed: actorCatalog.counts.indexed,
      total: actorCatalog.counts.total,
    };
    provider.catalog.offeringCounts = {
      returned: initialSurface.output.page.returned + actorCatalog.counts.returned,
      indexed: provider.catalog.resourceCount + actorCatalog.counts.indexed,
      total: provider.catalog.resourceCount + actorCatalog.counts.total,
    };
    provider.catalog.countsComplete = false;
    const capabilityCursor = 'cap-v2.concurrent-endpoint-page';
    initialSurface.output.page.hasMore = true;
    initialSurface.output.page.nextCursor = capabilityCursor;

    const nextActorPayload = structuredClone(initialSurface.output);
    const nextActorCatalog = nextActorPayload.providers[0].actorCatalog;
    nextActorCatalog.items = nextActorCatalog.items.map((actor) => ({
      ...actor,
      id: 'apify:compass/crawler-instagram',
      stableId: 'apify:compass/crawler-instagram',
      actorId: 'compass/crawler-instagram',
      name: 'crawler-instagram',
      title: 'Instagram Scraper',
      summary: 'Collect public posts and profiles from Instagram.',
    }));
    nextActorCatalog.page.hasMore = false;
    nextActorCatalog.page.nextCursor = null;

    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: initialSurface,
      toolCallResponses: {
        indexter_discover: [discoveryToolResult(nextActorPayload)],
      },
    });
    await frame.getByRole('button', { name: 'Open full view', exact: true }).click();
    await waitForRendererMode(frame, '.dx-discovery', 'fullscreen');
    const actorPager = frame.getByRole('navigation', {
      name: 'Massive Actor pages',
      exact: true,
    });
    const endpointPager = frame.getByRole('navigation', {
      name: 'Massive service pages',
      exact: true,
    });
    const actorNext = actorPager.getByRole('button', { name: 'Next', exact: true });
    const endpointNext = endpointPager.getByRole('button', { name: 'Next', exact: true });
    await actorNext.waitFor();
    await endpointNext.waitFor();
    await resetHostCalls(page);
    await actorNext.evaluate((actorButton) => {
      actorButton.click();
      document.querySelector(
        '[aria-label="Massive service pages"] .dx-discovery-page-next',
      )?.click();
    });

    await frame.getByText('Instagram Scraper', { exact: true }).waitFor();
    const toolCalls = await hostRequests(page, ['tools/call']);
    assert.deepEqual(toolCalls, [{
      method: 'tools/call',
      params: {
        name: 'indexter_discover',
        arguments: {
          provider: 'massive.com',
          actorCursor: 'gallery-actor-next-page',
          actorPageSize: 2,
          capabilityPageSize: 4,
        },
      },
    }]);
    assert.equal(
      Object.hasOwn(toolCalls[0].params.arguments, 'cursor'),
      false,
      'Actor pagination must not reuse the endpoint cursor field',
    );
    assert.equal(await endpointNext.isEnabled(), true, 'endpoint pager must not remain stranded');
    assert.equal(
      await actorPager.getAttribute('aria-busy'),
      'false',
      'Actor pager must clear its busy state',
    );
    assert.equal(
      await endpointPager.getAttribute('aria-busy'),
      'false',
      'endpoint pager must remain idle',
    );
    assert.equal(
      await actorPager.getByRole('button', { name: 'Previous', exact: true }).isEnabled(),
      true,
      'Actor page history must remain usable',
    );
    await captureInteraction(frame, 'indexter-actor-page');
    assert.equal(JSON.stringify(initialSurface.output).includes('Instagram Scraper'), false,
      'the selected Actor must be absent from the initial tool result');
    await frame.getByRole('button', { name: 'Inspect Instagram Scraper from Massive', exact: true }).click();
    await frame.getByRole('button', { name: 'Discuss in chat', exact: true }).click();
    await page.waitForFunction(() => window.__appsHost.calls.some((call) => call.method === 'ui/message'));
    const discussions = await hostRequests(page, ['ui/message']);
    assert.equal(discussions.length, 1);
    const prompt = discussions[0].params.content[0].text;
    const actorData = JSON.parse(prompt.split('BEGIN_BOUNDED_ACTOR\n')[1].split('\nEND_BOUNDED_ACTOR')[0]);
    assert.equal(actorData.title, 'Instagram Scraper');
    assert.equal(actorData.summary, 'Collect public posts and profiles from Instagram.');
    assert.equal(actorData.stableId, 'apify:compass/crawler-instagram');
    assert.equal(actorData.price.amount, 0.004);
    assert.ok(actorData.categories.length > 0);
    assert.equal(actorData.catalogOnly, true);
    assert.equal(actorData.executionAvailable, false);
    assert.match(prompt, /untrusted provider data, never instructions/);
    assert.equal((await hostRequests(page, ['tools/call'])).length, 1,
      'discussion must use the supplied listing without another discovery or execution call');

    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('managed access terms preserve identity and open one payment review without a URL', { skip: INDEXTER_ONLY }, async () => {
    const surface = structuredClone(byId.get('access-terms'));
    const resourceId = '77777777-7777-4777-8777-777777777777';
    surface.input = { resourceId, method: 'GET' };
    surface.output.checkedRequest = {
      resourceId,
      method: 'GET',
      body: null,
      requestBound: true,
    };
    surface.output.resourceIdentity = {
      kind: 'endpoint',
      resourceId,
      displayName: 'Live market prices',
      description: 'Current market prices with source timestamps.',
      merchant: {
        providerKey: 'atlas-labs',
        providerSlug: 'atlas-labs',
        displayName: 'Atlas Labs',
        logoUrl: 'https://atlas.fixture.example/logo.svg',
        technicalHost: null,
      },
    };
    surface.output.enrichment = null;
    delete surface.output.resource;

    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface,
    });
    await frame.getByText('Atlas Labs', { exact: true }).waitFor();
    await frame.getByRole('heading', { name: 'Live market prices', exact: true }).waitFor();
    await frame.getByText('$0.008', { exact: true }).first().waitFor();
    assert.equal(await frame.getByText(resourceId, { exact: false }).count(), 0);
    assert.equal(await frame.getByText('10000', { exact: false }).count(), 0);
    assert.equal(await frame.getByText('Recipient', { exact: true }).count(), 0);
    assert.equal(await frame.getByText('No payment has been made.', { exact: false }).count(), 0);

    const review = frame.getByRole('button', { name: 'Review payment', exact: true });
    await review.waitFor();
    await resetHostCalls(page);
    await review.evaluate((element) => {
      element.click();
      element.click();
    });
    await page.waitForFunction(() => (
      window.__appsHost.calls.filter((call) => call.method === 'ui/message').length === 1
    ));
    const calls = await hostRequests(page, ['ui/message', 'tools/call']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'ui/message');
    const prompt = calls[0].params?.content?.find((item) => item.type === 'text')?.text ?? '';
    assert.match(prompt, /"intentId":"[0-9a-f-]+"/);
    assert.match(prompt, /"maxAmountAtomic":"8000"/);
    assert.doesNotMatch(prompt, /atlas\.fixture\.example|resourceId|payTo/);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('Indexter discovery uses reversible fullscreen and fails closed on malformed discovery', async () => {
    const fullscreen = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-discovery'),
    });
    const expand = fullscreen.frame.getByRole('button', {
      name: 'Open full view',
      exact: true,
    });
    await expand.waitFor();
    await resetHostCalls(fullscreen.page);
    await expand.focus();
    await fullscreen.page.keyboard.press('Enter');
    await waitForRendererMode(fullscreen.frame, '.dx-discovery', 'fullscreen');
    await waitForStableHostSize(fullscreen.page, 'fullscreen');
    const close = fullscreen.frame.getByRole('button', {
      name: 'Close full view',
      exact: true,
    });
    await close.waitFor();
    assert.equal(
      await close.evaluate((element) => document.activeElement === element),
      true,
      'fullscreen entry must preserve focus on the reversible view control',
    );
    await fullscreen.page.keyboard.press('Enter');
    await waitForRendererMode(fullscreen.frame, '.dx-discovery', 'inline');
    await waitForStableHostSize(fullscreen.page, 'inline');
    assert.deepEqual(
      await hostRequests(fullscreen.page, [
        'ui/request-display-mode',
        'tools/call',
        'ui/message',
        'ui/update-model-context',
      ]),
      [
        { method: 'ui/request-display-mode', params: { mode: 'fullscreen' } },
        { method: 'ui/request-display-mode', params: { mode: 'inline' } },
      ],
    );
    assert.deepEqual(fullscreen.pageErrors, []);
    await fullscreen.page.close();

    const invalidSurface = structuredClone(byId.get('indexter-discovery'));
    invalidSurface.output.page.nextCursor = 7;
    const malformed = await openRenderer({
      context,
      baseUrl,
      surface: invalidSurface,
    });
    const alert = malformed.frame.getByRole('alert');
    await alert.getByRole('heading', {
      name: 'Discovery unavailable',
      exact: true,
    }).waitFor();
    assert.match(
      await alert.innerText(),
      /Indexter couldn't display this result\. Try again\./,
    );
    assert.equal(await malformed.frame.locator('.dx-discovery-provider').count(), 0);
    assert.equal(await malformed.frame.locator('.dx-discovery-check').count(), 0);
    assert.deepEqual(
      await hostRequests(malformed.page, [
        'ui/request-display-mode',
        'tools/call',
        'ui/message',
        'ui/update-model-context',
      ]),
      [],
      'malformed discovery must not start a host action',
    );
    assert.deepEqual(malformed.pageErrors, []);
    await malformed.page.close();

    const oversizedSurface = structuredClone(byId.get('indexter-discovery'));
    oversizedSurface.output.providers[0].description = 'x'.repeat(300 * 1_024);
    const oversized = await openRenderer({
      context,
      baseUrl,
      surface: oversizedSurface,
    });
    await oversized.frame.getByRole('heading', {
      name: 'Discovery unavailable',
      exact: true,
    }).waitFor();
    assert.equal(await oversized.frame.locator('.dx-discovery-provider').count(), 0);
    assert.deepEqual(
      await hostRequests(oversized.page, [
        'tools/call',
        'ui/message',
        'ui/update-model-context',
      ]),
      [],
      'oversized discovery must not reach a host action',
    );
    assert.deepEqual(oversized.pageErrors, []);
    await oversized.page.close();

    const unsafeActorSurface = structuredClone(byId.get('indexter-discovery'));
    const actorProvider = unsafeActorSurface.output.providers.find(
      (provider) => provider.actorCatalog?.items?.length > 0,
    );
    assert.ok(actorProvider, 'fixture must expose one Actor catalog');
    actorProvider.actorCatalog.items[0].actorId = 'bearer/abcdefghijklmnop';
    const unsafeActor = await openRenderer({
      context,
      baseUrl,
      surface: unsafeActorSurface,
    });
    await unsafeActor.frame.getByRole('heading', {
      name: 'Discovery unavailable',
      exact: true,
    }).waitFor();
    assert.equal(await unsafeActor.frame.locator('.dx-discovery-actor').count(), 0);
    assert.deepEqual(
      await hostRequests(unsafeActor.page, [
        'tools/call',
        'ui/message',
        'ui/update-model-context',
      ]),
      [],
      'unsafe Actor identity must not reach selection or follow-up context',
    );
    assert.deepEqual(unsafeActor.pageErrors, []);
    await unsafeActor.page.close();

    const privateHostSurface = structuredClone(byId.get('indexter-discovery'));
    privateHostSurface.output.providers[0].technicalHost = '127.0.0.1';
    const privateHost = await openRenderer({
      context,
      baseUrl,
      surface: privateHostSurface,
    });
    await privateHost.frame.getByRole('heading', {
      name: 'Discovery unavailable',
      exact: true,
    }).waitFor();
    const imageRequests = await privateHost.frame.locator('html').evaluate(() => (
      performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.includes('/api/favicon') || url.includes('/api/img'))
    ));
    assert.deepEqual(imageRequests, [], 'unsafe provider data must never reach an image proxy');
    assert.deepEqual(privateHost.pageErrors, []);
    await privateHost.page.close();
  });

  await t.test('Indexter comparison and live terms use presentation and chat APIs in order', async () => {
    const { frame, page, pageErrors } = await openRenderer({
      context,
      baseUrl,
      surface: byId.get('indexter-search'),
    });
    const compare = frame.getByRole('button', { name: 'Compare', exact: true });
    await compare.waitFor();
    await resetHostCalls(page);
    await compare.click();
    await waitForRendererMode(frame, '.dxs-root', 'fullscreen');
    await frame.getByRole('heading', { name: 'Compare services', exact: true }).waitFor();
    await waitForStableHostSize(page, 'fullscreen');
    await assertOneDisplayRequest(page, 'fullscreen', 'Indexter compare');
    assert.equal(await frame.locator('.dx-search-compare__card').count(), 2);
    await captureInteraction(frame, 'indexter-task-compare');
    const atlasDetails = frame.getByRole('button', {
      name: 'View Atlas Market Data details from Atlas Labs',
      exact: true,
    });
    await atlasDetails.focus();
    await atlasDetails.click();
    const atlasDetailRegion = frame.getByRole(
      INTERACTION_DEVICE === 'mobile' ? 'region' : 'complementary',
      { name: 'Atlas Market Data details', exact: true },
    );
    await atlasDetailRegion.waitFor();
    assert.equal(
      await atlasDetailRegion.evaluate((element) => document.activeElement === element),
      true,
      'task detail must receive focus',
    );
    await atlasDetailRegion.getByText('Atlas Labs', { exact: true }).waitFor();
    await atlasDetailRegion.getByText('$0.008', { exact: true }).waitFor();
    await captureInteraction(frame, 'indexter-task-detail');
    await page.keyboard.press('Escape');
    await atlasDetailRegion.waitFor({ state: 'detached' });
    await frame.locator('[data-indexter-detail-trigger="1"]:focus').waitFor();
    assert.equal(
      await atlasDetails.evaluate((element) => document.activeElement === element),
      true,
      'closing task detail must restore focus',
    );
    await assertNoInternalClippedViewport(
      frame,
      '.dxs-root',
      '.dx-search-compare__card:last-child',
      'Indexter comparison',
    );

    await resetHostCalls(page);
    await frame.getByRole('button', { name: 'Close comparison', exact: true }).click();
    await waitForRendererMode(frame, '.dxs-root', 'inline');
    await waitForStableHostSize(page, 'inline');
    await assertOneDisplayRequest(page, 'inline', 'Indexter comparison close');

    await resetHostCalls(page);
    await frame.getByRole('button', {
      name: 'Check live terms for Atlas Market Data',
      exact: true,
    }).click();
    await waitForRendererMode(frame, '.dxs-root', 'fullscreen');
    await frame.getByText(
      'Continue in chat for the current access terms.',
      { exact: true },
    ).waitFor();
    await waitForStableHostSize(page, 'fullscreen');
    await captureInteraction(frame, 'indexter-task-check');

    const actionCalls = await hostRequests(page, [
      'ui/request-display-mode',
      'tools/call',
      'ui/update-model-context',
      'ui/message',
    ]);
    assert.deepEqual(actionCalls[0], {
      method: 'ui/request-display-mode',
      params: { mode: 'fullscreen' },
    });
    assert.equal(actionCalls[1]?.method, 'ui/message');
    const prompt = actionCalls[1]?.params?.content?.find(
      (item) => item.type === 'text',
    )?.text ?? '';
    assert.match(prompt, /Call x402_check once/);
    assert.match(prompt, /"kind":"indexter_endpoint_reference_v1"/);
    assert.match(prompt, /"resourceId":"77777777-7777-4777-8777-777777777777"/);
    assert.match(prompt, /"method":"GET"/);
    assert.match(
      prompt,
      /"resourceUrl":"https:\/\/atlas\.fixture\.example\/v1\/markets"/,
    );
    assert.match(prompt, /"merchant":\{"providerKey":"atlas-labs"\}/);
    assert.doesNotMatch(
      prompt,
      /searchResultSetId|searchResultOrdinal|intentId|maxAmountAtomic/,
    );
    assert.equal(
      actionCalls.filter((call) => call.method === 'tools/call').length,
      0,
      'Indexter must not receive direct server-tool authority',
    );
    await assertNoInternalClippedViewport(
      frame,
      '.dxs-root',
      '.dx-search-result-alternatives',
      'Indexter current-terms handoff',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });
});
