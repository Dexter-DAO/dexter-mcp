import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  MCP_APPS_HOST_TOKENS,
  buildRendererGallerySurfaces,
} from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const HOST_MAX_HEIGHT_STRESS_VALUE = 240;

function mcpInitResult(theme) {
  return {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'x402 renderer shell test', version: '1.0.0' },
    hostCapabilities: {
      serverTools: {},
      openLinks: {},
      message: { text: {} },
      updateModelContext: { text: {}, structuredContent: {} },
    },
    hostContext: {
      theme,
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: {
        width: 390,
        maxHeight: HOST_MAX_HEIGHT_STRESS_VALUE,
      },
      locale: 'en-US',
      timeZone: 'UTC',
      platform: 'mobile',
      deviceCapabilities: { touch: true, hover: false },
      safeAreaInsets: { top: 0, right: 0, bottom: 12, left: 0 },
      styles: { variables: MCP_APPS_HOST_TOKENS[theme] },
    },
  };
}

function installMcpHost({ initResult, toolInput, toolResult, widgetUrl }) {
  window.__x402RendererCalls = [];
  window.__x402RendererSizes = [];
  const iframe = document.getElementById('widget');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return;
    }

    window.__x402RendererCalls.push(message);
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
        const height = Number(message.params?.height);
        if (Number.isFinite(height) && height > 0) {
          window.__x402RendererSizes.push(height);
        }
        break;
      }
      case 'ui/message':
      case 'ui/update-model-context':
      case 'ui/open-link':
        respond({ isError: false });
        break;
      case 'ui/request-display-mode':
        respond({ mode: message.params?.mode ?? 'inline' });
        break;
      case 'tools/call':
        respond({
          content: [{ type: 'text', text: 'Tool calls are disabled in this renderer test.' }],
          isError: true,
        });
        break;
      default:
        if (Object.prototype.hasOwnProperty.call(message, 'id')) {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `Unsupported method: ${message.method}` },
          }, '*');
        }
    }
  });

  iframe.src = widgetUrl;
}

function isLocalRequest(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

test('x402 protocol renderers use an intrinsic transparent host shell', async (t) => {
  const surfaces = (await buildRendererGallerySurfaces()).filter(({ id }) => [
    'access-terms',
    'purchase-result',
    'purchase-status',
  ].includes(id));
  assert.equal(surfaces.length, 3);

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
  t.after(async () => {
    await browser.close();
    await vite.close();
  });

  for (const surface of surfaces) {
    await t.test(surface.id, async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 900 },
        colorScheme: 'dark',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.route('**/*', async (route) => {
        if (isLocalRequest(route.request().url(), baseUrl)) {
          await route.continue();
          return;
        }
        if (route.request().resourceType() === 'image') {
          await route.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#918677" /></svg>',
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      await page.setContent(
        '<!doctype html><html><body style="margin:0">'
          + '<iframe id="widget" title="x402 renderer" '
          + 'style="border:0;width:390px;height:900px"></iframe>'
          + '</body></html>',
      );
      await page.evaluate(installMcpHost, {
        initResult: mcpInitResult('dark'),
        toolInput: surface.input,
        toolResult: {
          structuredContent: surface.output,
          content: [{ type: 'text', text: 'Deterministic x402 renderer fixture.' }],
          _meta: surface.metadata,
          isError: false,
        },
        widgetUrl: `${baseUrl}/${surface.file}`,
      });

      const frame = page.frameLocator('#widget');
      await frame.locator(surface.readySelector).waitFor({ state: 'visible' });
      const root = frame.locator(surface.outerSelector);
      const metrics = await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          maxHeight: style.maxHeight,
          overflowY: style.overflowY,
          background: style.backgroundColor,
          borderWidths: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ],
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          hostMaxHeight: element.getAttribute('data-host-max-height'),
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
        };
      });

      assert.equal(metrics.hostMaxHeight, String(HOST_MAX_HEIGHT_STRESS_VALUE));
      assert.equal(metrics.maxHeight, 'none');
      assert.equal(metrics.overflowY, 'visible');
      assert.equal(metrics.background, 'rgba(0, 0, 0, 0)');
      assert.deepEqual(metrics.borderWidths, ['0px', '0px', '0px', '0px']);
      assert.equal(metrics.borderRadius, '0px');
      assert.equal(metrics.boxShadow, 'none');
      assert.equal(metrics.clientHeight, metrics.scrollHeight);
      assert.ok(metrics.documentScrollWidth <= metrics.documentClientWidth + 1);

      await page.waitForFunction((minimum) => (
        window.__x402RendererSizes.some((height) => height >= minimum)
      ), metrics.scrollHeight - 1);

      const callsBeforeAction = await page.evaluate(() => window.__x402RendererCalls);
      assert.equal(
        callsBeforeAction.filter((call) => [
          'tools/call',
          'ui/message',
          'ui/open-link',
          'ui/request-display-mode',
        ].includes(call.method)).length,
        0,
      );

      if (surface.id === 'access-terms') {
        const recipient = surface.output.paymentOptions[0].payTo;
        await frame.getByText(recipient, { exact: false }).waitFor();
        const recipientLayout = await frame.locator('.dx-pricing__route-payto').evaluate(
          (element) => {
            const style = getComputedStyle(element);
            const label = element.querySelector('.dx-pricing__route-payto-label');
            const address = element.querySelector('.dx-pricing__route-payto-addr');
            const addressStyle = address ? getComputedStyle(address) : null;
            return {
              display: style.display,
              width: element.getBoundingClientRect().width,
              labelTop: label?.getBoundingClientRect().top,
              addressTop: address?.getBoundingClientRect().top,
              addressHeight: address?.getBoundingClientRect().height,
              addressLineHeight: addressStyle ? Number.parseFloat(addressStyle.lineHeight) : 0,
            };
          },
        );
        assert.equal(recipientLayout.display, 'grid');
        assert.ok(recipientLayout.width > 300);
        assert.ok(recipientLayout.addressTop > recipientLayout.labelTop);
        assert.ok(recipientLayout.addressHeight <= recipientLayout.addressLineHeight + 1);
        await frame.getByRole('button', { name: 'Review payment' }).click();
      }
      if (surface.id === 'purchase-result' || surface.id === 'purchase-status') {
        await frame.getByText(surface.output.intentId, { exact: true }).waitFor();
      }
      if (surface.id === 'purchase-status') {
        await frame.getByRole('button', { name: 'Check this intent in chat' }).click();
      }

      if (surface.id === 'access-terms' || surface.id === 'purchase-status') {
        await page.waitForFunction(() => (
          window.__x402RendererCalls.some((call) => call.method === 'ui/message')
        ));
        const callsAfterAction = await page.evaluate(() => window.__x402RendererCalls);
        assert.equal(
          callsAfterAction.filter((call) => call.method === 'ui/message').length,
          1,
        );
        assert.equal(
          callsAfterAction.filter((call) => call.method === 'tools/call').length,
          0,
        );
      }

      assert.deepEqual(pageErrors, []);
      await context.close();
    });
  }
});
