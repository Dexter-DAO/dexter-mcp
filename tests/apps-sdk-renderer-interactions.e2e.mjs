import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
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
const VIEWPORT = Object.freeze({ width: 1280, height: 1700 });

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

function installInteractiveMcpHost({
  checkToolResult,
  displayModeResponseDelays = [],
  dimensions,
  initResult,
  initialDisplayMode = 'inline',
  toolInput,
  toolResult,
  widgetUrl,
}) {
  const iframe = document.getElementById('widget');
  const surface = document.getElementById('surface');
  window.__appsHost = {
    calls: [],
    mode: initialDisplayMode,
    dimensions,
    displayModeResponseDelays: displayModeResponseDelays ?? [],
    displayModeRequestIndex: 0,
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
      case 'tools/call':
        respond(checkToolResult);
        break;
      case 'ui/update-model-context':
      case 'ui/message':
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

function initResult(dimensions) {
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
      theme: 'light',
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: dimensions.inline,
      locale: 'en-US',
      timeZone: 'UTC',
      platform: 'desktop',
      deviceCapabilities: { touch: false, hover: true },
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      styles: { variables: MCP_APPS_HOST_TOKENS.light },
    },
  };
}

function rendererToolResult(surface) {
  return {
    structuredContent: surface.output,
    content: [{ type: 'text', text: 'Deterministic renderer interaction fixture.' }],
    _meta: surface.metadata,
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
  context,
  baseUrl,
  surface,
  availableDisplayModes,
  displayModeResponseDelays,
  inlineMaxHeight,
  initialDisplayMode = 'inline',
}) {
  const page = await context.newPage();
  const pageErrors = [];
  // Load a real widget document first so setContent retains the same trusted
  // loopback origin used by the child frame and the clipboard permission.
  await page.goto(`${baseUrl}/${surface.file}`);
  await page.setContent(hostDocument());
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const dimensions = modeContexts(VIEWPORT);
  if (Number.isFinite(inlineMaxHeight)) {
    dimensions.inline.maxHeight = Math.max(80, Math.round(inlineMaxHeight));
  }
  const initialization = initResult(dimensions);
  if (availableDisplayModes) {
    initialization.hostContext.availableDisplayModes = availableDisplayModes;
  }
  initialization.hostContext.displayMode = initialDisplayMode;
  initialization.hostContext.containerDimensions = dimensions[initialDisplayMode];
  await page.evaluate(installInteractiveMcpHost, {
    checkToolResult: CHECK_TOOL_RESULT,
    displayModeResponseDelays: displayModeResponseDelays ?? [],
    dimensions,
    initResult: initialization,
    initialDisplayMode,
    toolInput: surface.input,
    toolResult: rendererToolResult(surface),
    widgetUrl: `${baseUrl}/${surface.file}`,
  });

  const frame = page.frameLocator('#widget');
  return { dimensions, frame, page, pageErrors };
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
    return state.appliedHeight === expected;
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
  for (const id of ['portfolio', 'dexter-wallet', 'indexter-search']) {
    assert.ok(byId.has(id), `Missing ${id} fixture`);
  }

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
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await context.addInitScript(installFixedClock, GALLERY_FIXED_NOW);
  await context.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: baseUrl },
  );
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

  await t.test('portfolio expands through the host and exposes the complete ledger', async () => {
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

  await t.test('portfolio remains fully reachable through a bounded pager without fullscreen', async () => {
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

  await t.test('wallet actions open focused fullscreen details and return inline', async () => {
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
        assert.equal(
          await copy.evaluate(() => navigator.clipboard.readText()),
          WALLET_ADDRESS,
        );
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

  await t.test('inline-only wallet details remain reachable inside a 300px host height', async () => {
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

  await t.test('wallet and portfolio correct stale host mode responses in both directions', async () => {
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

  await t.test('wallet preserves a host-provided fullscreen mode across sheet dismissal', async () => {
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
    assert.match(prompt, /"searchResultSetId":"11111111-1111-4111-8111-111111111111"/);
    assert.match(prompt, /"searchResultOrdinal":1/);
    assert.doesNotMatch(prompt, /atlas\.fixture\.example|intentId|maxAmountAtomic/);
    assert.equal(
      actionCalls.filter((call) => call.method === 'tools/call').length,
      0,
      'Indexter must not receive direct server-tool authority',
    );
    await assertNoInternalClippedViewport(
      frame,
      '.dxs-root',
      '.dx-search-brief__action-note',
      'Indexter current-terms handoff',
    );
    assert.deepEqual(pageErrors, []);
    await page.close();
  });
});
