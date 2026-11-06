import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { walletOutput } from './fixtures/wallet-portfolio-fixtures.mjs';

const UI_ROOT = new URL('../apps-sdk/ui/', import.meta.url).pathname;
const SCREENSHOT_DIR = process.env.DEXTER_WALLET_INVOCATION_SCREENSHOT_DIR;
const HOST_MESSAGE = 'private-host-reason https://private.fixture.invalid/?token=fixture-secret';
const TITLES = {
  malformed: 'Wallet result unavailable',
  cancelled: 'Wallet read cancelled',
  timed_out: 'Wallet read timed out',
};

// Exercise the actual SDK deadline without advancing unrelated UI timers.
function installInvocationClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  window.__dexterToolInvocationClock = {
    now: () => now,
    setTimeout(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  window.__advanceWalletInvocationClock = (durationMs) => {
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
  window.__walletInvocationDeliveries = 0;
  window.addEventListener('message', (event) => {
    if (event.source === window.parent && event.data?.jsonrpc === '2.0'
      && typeof event.data.method === 'string') window.__walletInvocationDeliveries += 1;
  });
}

function hostContext(invocation, mobile) {
  return {
    toolInfo: { id: invocation.requestId, tool: { name: 'dexter_wallet' } },
    'openai/widgetSessionId': invocation.widgetSessionId,
    theme: 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    containerDimensions: { maxHeight: mobile ? 780 : 940 },
    locale: 'en-US',
    platform: mobile ? 'mobile' : 'desktop',
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function installHost({ widgetUrl, context }) {
  const iframe = document.getElementById('widget');
  window.__walletHostMethods = [];
  window.__walletNotify = (method, params) => {
    iframe.contentWindow.postMessage({ jsonrpc: '2.0', method, params }, '*');
  };
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    const message = event.data;
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
    window.__walletHostMethods.push(message.method);
    if (!Object.hasOwn(message, 'id')) return;
    event.source.postMessage({ jsonrpc: '2.0', id: message.id,
      ...(message.method === 'ui/initialize'
        ? { result: { protocolVersion: '2026-01-26',
            hostInfo: { name: 'Wallet lifecycle fixture', version: '1' },
            hostCapabilities: {}, hostContext: context } }
        : { error: { code: -32601, message: 'Unexpected fixture request' } }),
    }, '*');
  });
  iframe.src = widgetUrl;
}

function resultFor(invocation, output = walletOutput()) {
  return {
    structuredContent: output,
    content: [],
    _meta: {
      'dexter/toolInvocation': { toolName: 'dexter_wallet', requestId: invocation.requestId },
      'openai/widgetSessionId': invocation.widgetSessionId,
    },
    isError: false,
  };
}

async function notify(page, frame, method, params) {
  const before = await frame.evaluate(() => window.__walletInvocationDeliveries);
  await page.evaluate(({ method, params }) => window.__walletNotify(method, params), { method, params });
  // Observe delivery before testing rejection; do not mistake an IPC race for
  // proof that an invalid result was ignored.
  await frame.waitForFunction((count) => window.__walletInvocationDeliveries > count, before);
  // The passive observer runs before the SDK listener. Allow React to commit
  // before negative assertions inspect the previous state or absence of data.
  await frame.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true,
    animations: 'disabled', timeout: 5_000 });
}

test('wallet entry shows finite invocation errors and accepts only the owning result', { timeout: 120_000 }, async (t) => {
  const vite = await createServer({
    root: UI_ROOT,
    configFile: false,
    ...(process.env.DEXTER_WALLET_VITE_CACHE_DIR
      ? { cacheDir: process.env.DEXTER_WALLET_VITE_CACHE_DIR } : {}),
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  t.after(() => vite.close());
  await vite.listen();
  const address = vite.httpServer.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const widgetUrl = `${origin}/dexter-wallet.html`;
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  t.after(() => browser.close());

  for (const mobile of [false, true]) {
    for (const state of ['malformed', 'cancelled', 'timed_out']) {
      const name = `${mobile ? 'mobile' : 'desktop'}-${state}`;
      await t.test(name, async (scenario) => {
        const context = await browser.newContext({
          viewport: mobile ? { width: 375, height: 780 } : { width: 1100, height: 1000 },
          colorScheme: 'light', reducedMotion: 'reduce',
        });
        let page;
        let completed = false;
        scenario.after(async () => {
          try {
            if (!completed && page) {
              if (!SCREENSHOT_DIR) {
                scenario.diagnostic('Failure screenshot unavailable: screenshot directory was not set.');
              } else {
                try { await capture(page, `${name}-failure`); }
                catch (error) { scenario.diagnostic(`Failure screenshot unavailable: ${error.message}`); }
              }
            }
          } finally {
            await context.close();
          }
        });
        await context.addInitScript(installInvocationClock);
        const externalDataRequests = [];
        await context.route('**/*', (route) => {
          const request = route.request();
          if (new URL(request.url()).origin === origin) return route.continue();
          if (['fetch', 'xhr'].includes(request.resourceType())) externalDataRequests.push(request.method());
          return route.abort();
        });
        page = await context.newPage();
        page.setDefaultTimeout(5_000);
        await page.setContent('<!doctype html><html><body style="margin:0">'
          + '<iframe id="widget" title="Wallet lifecycle fixture" style="border:0;width:100%;height:980px"></iframe>'
          + '</body></html>');
        let invocation = { requestId: `wallet-${name}`, widgetSessionId: `session-${name}` };
        await page.evaluate(installHost, { widgetUrl, context: hostContext(invocation, mobile) });
        await page.waitForFunction(() => window.__walletHostMethods.includes('ui/notifications/initialized'));
        const frame = page.frames().find((candidate) => candidate.url() === widgetUrl);
        assert.ok(frame, 'Wallet iframe must finish the actual host handshake');
        const surface = page.frameLocator('#widget');
        const root = surface.locator('.dxw-root');
        await surface.getByText('Reading your money', { exact: true }).waitFor();
        assert.equal(await root.getAttribute('data-tool-invocation-status'), 'waiting');
        assert.equal(await surface.getByRole('status').getAttribute('aria-busy'), 'true');
        await notify(page, frame, 'ui/notifications/tool-input', { arguments: {} });
        await surface.locator('[data-tool-invocation-status="running"]').waitFor();

        if (state === 'malformed') {
          // Deliver data without its required identity, reproducing the failed
          // wallet harness handoff while retaining the production guard.
          await notify(page, frame, 'ui/notifications/tool-result', {
            structuredContent: walletOutput(), content: [], _meta: {},
          });
        } else if (state === 'cancelled') {
          await notify(page, frame, 'ui/notifications/tool-cancelled', { reason: HOST_MESSAGE });
        } else {
          await frame.evaluate(() => window.__advanceWalletInvocationClock(29_999));
          assert.equal(await root.getAttribute('data-tool-invocation-status'), 'running');
          await frame.evaluate(() => window.__advanceWalletInvocationClock(1));
        }
        await surface.locator(`[data-tool-invocation-status="${state}"]`).waitFor();
        const alert = surface.getByRole('alert');
        await alert.getByText(TITLES[state], { exact: true }).waitFor();
        assert.equal(await alert.getAttribute('aria-busy'), null);
        assert.equal(await alert.getAttribute('aria-live'), 'assertive');
        assert.equal(await surface.getByText('Reading your money', { exact: true }).count(), 0);
        assert.equal(await surface.locator('.dxw-spend-amount').count(), 0);
        assert.equal(await surface.getByRole('button').count(), 0);
        assert.doesNotMatch(await root.innerText(), /private-host-reason|fixture-secret|private\.fixture/);
        const bounds = await root.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
        assert.ok(bounds.content <= bounds.width + 1, 'Error must fit the host width');
        await capture(page, `${name}-error`);

        await notify(page, frame, 'ui/notifications/tool-result', resultFor({
          ...invocation, requestId: 'another-wallet-request',
        }));
        assert.equal(await root.getAttribute('data-tool-invocation-status'), state);
        assert.equal(await surface.locator('.dxw-spend-amount').count(), 0);
        await notify(page, frame, 'ui/notifications/tool-result', resultFor(invocation));
        if (state === 'cancelled') {
          assert.equal(await root.getAttribute('data-tool-invocation-status'), 'cancelled');
          // Cancellation stays terminal for this request. Only a new host-owned
          // invocation can attach a later wallet result.
          invocation = { ...invocation, requestId: `${invocation.requestId}-next` };
          await notify(page, frame, 'ui/notifications/host-context-changed', hostContext(invocation, mobile));
          await surface.locator('[data-tool-invocation-status="waiting"]').waitFor();
          await notify(page, frame, 'ui/notifications/tool-result', resultFor(invocation));
        }
        await surface.locator('[data-tool-invocation-status="ready"]').waitFor();
        await surface.getByText('Cash + reported credit', { exact: true }).waitFor();
        assert.equal(await surface.getByRole('alert').count(), 0);
        await surface.getByRole('button', { name: 'Receive', exact: true }).waitFor();
        await capture(page, `${name}-ready`);

        // A subsequent authenticated-envelope result still uses the existing
        // Connect view; this error presentation does not bypass authorization.
        const authInvocation = { ...invocation, requestId: `${invocation.requestId}-auth` };
        await notify(page, frame, 'ui/notifications/host-context-changed', hostContext(authInvocation, mobile));
        await notify(page, frame, 'ui/notifications/tool-result', resultFor(authInvocation, { mode: 'authentication_required' }));
        await surface.getByText('Connect OpenDexter', { exact: true }).waitFor();
        assert.equal(await surface.locator('.dxw-spend-amount').count(), 0);
        assert.deepEqual(externalDataRequests, [], 'No refresh or provider request may start from lifecycle handling');
        const methods = await page.evaluate(() => window.__walletHostMethods);
        assert.deepEqual(methods.filter((method) => ![
          'ui/initialize', 'ui/notifications/initialized', 'ui/notifications/size-changed',
        ].includes(method)), [], 'No tool call, follow-up or external handoff may start');
        completed = true;
      });
    }
  }
});
