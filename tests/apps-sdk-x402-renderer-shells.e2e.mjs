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
const LONG_SOLANA_RECIPIENT = 'DexWirjm2hS5ghfS41bLBx7FgaR2Mug9AsstisrT9jpW';
const FULLSCREEN_SAFE_AREA = Object.freeze({ top: 11, right: 13, bottom: 17, left: 19 });

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
      safeAreaInsets: FULLSCREEN_SAFE_AREA,
      styles: { variables: MCP_APPS_HOST_TOKENS[theme] },
    },
  };
}

function installMcpHost({
  initResult,
  toolInput,
  toolResult,
  widgetUrl,
  fullscreenSafeArea,
  inlineMaxHeight,
}) {
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
        {
          const mode = message.params?.mode ?? 'inline';
          respond({ mode });
          setTimeout(() => {
            notify('ui/notifications/host-context-changed', {
              displayMode: mode,
              containerDimensions: {
                width: 390,
                maxHeight: mode === 'fullscreen' ? 1600 : inlineMaxHeight,
              },
              safeAreaInsets: fullscreenSafeArea,
            });
          }, 0);
        }
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
  const baseSurfaces = (await buildRendererGallerySurfaces()).filter(({ id }) => [
    'access-terms',
    'access-free-result',
    'purchase-result',
    'purchase-status',
  ].includes(id));
  assert.equal(baseSurfaces.length, 4);
  const purchaseResult = baseSurfaces.find(({ id }) => id === 'purchase-result');
  assert.ok(purchaseResult);
  const surfaces = [
    ...baseSurfaces,
    {
      ...purchaseResult,
      id: 'purchase-image-result',
      output: {
        ...purchaseResult.output,
        data: {
          image_url: 'https://provider.example/portrait.png',
          alt: 'Tall provider chart',
        },
      },
    },
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
          const portrait = route.request().url().includes('portrait.png');
          await route.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            body: portrait
              ? '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="1800" viewBox="0 0 300 1800"><rect width="300" height="1800" fill="#918677" /></svg>'
              : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#918677" /></svg>',
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
      const surfaceOutput = structuredClone(surface.output);
      if (surface.id === 'access-terms') {
        Object.assign(surfaceOutput.paymentOptions[0], {
          network: 'solana',
          payTo: LONG_SOLANA_RECIPIENT,
        });
      }
      if (surface.id === 'access-free-result') {
        surfaceOutput.data = {
          ...surfaceOutput.data,
          observations: Array.from({ length: 40 }, (_, index) => ({
            hour: index,
            conditions: index % 2 === 0 ? 'Clear' : 'Partly cloudy',
          })),
        };
      }
      if (surface.id === 'purchase-result') {
        surfaceOutput.data = {
          ...surfaceOutput.data,
          observations: Array.from({ length: 40 }, (_, index) => ({
            sample: index,
            value: `${141 + index / 100}`,
          })),
        };
      }
      await page.evaluate(installMcpHost, {
        initResult: mcpInitResult('dark'),
        toolInput: surface.input,
        toolResult: {
          structuredContent: surfaceOutput,
          content: [{ type: 'text', text: 'Deterministic x402 renderer fixture.' }],
          _meta: surface.metadata,
          isError: false,
        },
        widgetUrl: `${baseUrl}/${surface.file}`,
        fullscreenSafeArea: FULLSCREEN_SAFE_AREA,
        inlineMaxHeight: HOST_MAX_HEIGHT_STRESS_VALUE,
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
        const recipient = surfaceOutput.paymentOptions[0].payTo;
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

        await page.locator('#widget').evaluate((element) => {
          element.style.width = '320px';
        });
        const narrowLayout = await frame.locator('.dx-pricing__route-payto').evaluate(
          (element) => {
            const route = element.closest('.dx-pricing__route');
            const address = element.querySelector('.dx-pricing__route-payto-addr');
            const addressRect = address?.getBoundingClientRect();
            return {
              addressText: address?.textContent,
              addressLeft: addressRect?.left,
              addressRight: addressRect?.right,
              addressClientHeight: address?.clientHeight,
              addressScrollHeight: address?.scrollHeight,
              documentClientWidth: document.documentElement.clientWidth,
              documentScrollWidth: document.documentElement.scrollWidth,
              gridTemplateAreas: route ? getComputedStyle(route).gridTemplateAreas : '',
            };
          },
        );
        assert.equal(narrowLayout.documentClientWidth, 320);
        assert.equal(narrowLayout.addressText, recipient);
        assert.match(narrowLayout.gridTemplateAreas, /"chain" "payto" "price"/);
        assert.ok(narrowLayout.documentScrollWidth <= narrowLayout.documentClientWidth + 1);
        assert.ok(narrowLayout.addressLeft >= 0);
        assert.ok(narrowLayout.addressRight <= narrowLayout.documentClientWidth + 1);
        assert.ok(narrowLayout.addressClientHeight >= narrowLayout.addressScrollHeight - 1);
        await frame.getByRole('button', { name: 'Review payment' }).click();
      }
      if (
        surface.id === 'purchase-result'
        || surface.id === 'purchase-image-result'
        || surface.id === 'purchase-status'
      ) {
        await frame.getByText(surface.output.intentId, { exact: true }).waitFor();
      }
      if (surface.id === 'access-free-result' || surface.id === 'purchase-result') {
        await frame.getByText(
          'Showing a preview. Open the full result to see the rest.',
          { exact: true },
        ).waitFor();
        assert.equal(
          await frame.getByText(/"(?:hour|sample)": 39/).count(),
          0,
          `${surface.id} rendered the complete dense result inline`,
        );
        await frame.getByRole('button', { name: 'View full result', exact: true }).click();
        await frame.locator(`${surface.outerSelector}[data-display-mode="fullscreen"]`).waitFor();
        const safeArea = await frame.locator(surface.outerSelector).evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            top: Number.parseFloat(style.paddingTop),
            right: Number.parseFloat(style.paddingRight),
            bottom: Number.parseFloat(style.paddingBottom),
            left: Number.parseFloat(style.paddingLeft),
          };
        });
        const normalGutter = surface.id === 'access-free-result' ? 32 : 0;
        for (const side of Object.keys(safeArea)) {
          assert.ok(
            safeArea[side] >= Math.max(normalGutter, FULLSCREEN_SAFE_AREA[side]),
            `${surface.id}: ${side} padding ${safeArea[side]} discarded the normal gutter or host safe area`,
          );
        }
        await frame.getByText(/"(?:hour|sample)": 39/).waitFor();
        assert.equal(
          await frame.getByText(
            'Showing a preview. Open the full result to see the rest.',
            { exact: true },
          ).count(),
          0,
          `${surface.id} kept the inline preview after fullscreen was granted`,
        );
      }
      if (surface.id === 'purchase-status') {
        await frame.getByRole('button', { name: 'Check this intent in chat' }).click();
      }

      if (surface.id === 'purchase-image-result') {
        const trustOrder = await frame.locator('.dx-result').evaluate((element) => {
          const lifecycle = element.querySelector('.dx-result-lifecycle');
          const provider = element.querySelector('.dx-result-delivery');
          return {
            lifecycleBeforeProvider: Boolean(
              lifecycle
              && provider
              && (lifecycle.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING)
            ),
            providerLabel: provider?.querySelector('h2')?.textContent,
          };
        });
        assert.equal(trustOrder.lifecycleBeforeProvider, true);
        assert.equal(trustOrder.providerLabel, 'Provider response');

        const inlineImageHeight = await frame.locator('.dx-result-payload--image img').evaluate(
          (image) => image.getBoundingClientRect().height,
        );
        assert.ok(inlineImageHeight <= 220.5);
        await frame.getByRole('button', { name: 'View full result', exact: true }).click();
        await frame.locator(`${surface.outerSelector}[data-display-mode="fullscreen"]`).waitFor();
        await frame.getByRole('button', { name: 'Return to chat size', exact: true }).waitFor();
        await frame.locator('.dx-result-payload--image img').evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        const fullscreenImage = await frame.locator('.dx-result-payload--image img').evaluate(
          (image) => ({
            height: image.getBoundingClientRect().height,
            maxHeight: getComputedStyle(image).maxHeight,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          }),
        );
        assert.ok(
          fullscreenImage.height > inlineImageHeight,
          JSON.stringify({ inlineImageHeight, fullscreenImage }),
        );
        assert.ok(fullscreenImage.height <= 1200.5);
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
