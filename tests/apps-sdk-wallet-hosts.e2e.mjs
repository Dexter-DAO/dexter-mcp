import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  ASSET_IMAGE_SOURCES,
  MISSING_IMAGE_SOURCES,
  completePortfolio,
  governancePortfolio,
  imageFallbackPortfolio,
  partialEnrichmentPortfolio,
  partialUnpricedPortfolio,
  walletOutput,
} from './fixtures/wallet-portfolio-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const SCREENSHOT_DIR = '/tmp/dexter-wallet-host-harness';
const FIXED_NOW = '2026-07-25T12:34:00.000Z';
const ARTWORK_DIR = path.join(TEST_DIR, 'fixtures', 'wallet-asset-artwork');
const ARTWORK_FILE_BY_SOURCE = new Map([
  [ASSET_IMAGE_SOURCES.sol, path.join(ARTWORK_DIR, 'solana.svg')],
  [ASSET_IMAGE_SOURCES.usdc, path.join(ARTWORK_DIR, 'usdc.svg')],
  [ASSET_IMAGE_SOURCES['syrup-usdc'], path.join(ARTWORK_DIR, 'syrup-usdc.svg')],
  [ASSET_IMAGE_SOURCES.dexter, path.join(ARTWORK_DIR, 'dexter.svg')],
  [ASSET_IMAGE_SOURCES.spcx, path.join(ARTWORK_DIR, 'spcx.svg')],
]);

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XJ9WAAAAAElFTkSuQmCC',
  'base64',
);

function installChatGptHost({ output, metadata, mobile }) {
  window.__hostCalls = [];
  window.openai = {
    theme: 'light',
    userAgent: {
      device: { type: mobile ? 'mobile' : 'desktop' },
      capabilities: { hover: !mobile, touch: mobile },
    },
    locale: 'en-US',
    maxHeight: mobile ? 780 : 940,
    displayMode: 'inline',
    safeArea: {
      insets: { top: 0, right: 0, bottom: mobile ? 16 : 0, left: 0 },
    },
    toolInput: {},
    toolOutput: output,
    toolResponseMetadata: metadata,
    openExternal(args) {
      window.__hostCalls.push({ kind: 'openExternal', args });
    },
    notifyIntrinsicHeight(args) {
      window.__hostCalls.push({ kind: 'notifyIntrinsicHeight', args });
    },
  };
}

function setupMcpParentHost({ initResult, toolResult, widgetUrl }) {
  window.__hostCalls = [];
  const iframe = document.getElementById('widget');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return;
    }
    window.__hostCalls.push(message);
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
          notify('ui/notifications/tool-input', { arguments: {} });
          notify('ui/notifications/tool-result', toolResult);
        }, 0);
        break;
      case 'ui/notifications/size-changed':
        break;
      default:
        if (Object.prototype.hasOwnProperty.call(message, 'id')) {
          child.postMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Unsupported fixture method: ${message.method}`,
            },
          }, '*');
        }
    }
  });

  iframe.src = widgetUrl;
}

function mcpInitResult(mobile) {
  return {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'Fixture MCP Host', version: '1.0.0' },
    hostCapabilities: {
      serverTools: {},
      openLinks: {},
    },
    hostContext: {
      theme: 'light',
      displayMode: 'inline',
      availableDisplayModes: ['inline'],
      containerDimensions: { maxHeight: mobile ? 780 : 940 },
      locale: 'en-US',
      timeZone: 'UTC',
      platform: mobile ? 'mobile' : 'desktop',
      deviceCapabilities: { touch: mobile, hover: !mobile },
      safeAreaInsets: { top: 0, right: 0, bottom: mobile ? 16 : 0, left: 0 },
      styles: {
        variables: {
          '--color-background-primary': '#fffdf9',
          '--color-background-secondary': '#f1eee8',
          '--color-text-primary': '#1d1710',
          '--color-text-secondary': '#6f6659',
          '--color-text-tertiary': '#948878',
          '--color-border-secondary': 'rgba(61, 50, 39, 0.16)',
          '--color-ring-primary': '#f2681a',
          '--font-sans': 'Arial, sans-serif',
        },
      },
    },
  };
}

function toolResult(output, metadata) {
  return {
    structuredContent: output,
    content: [{ type: 'text', text: 'Read-only wallet fixture.' }],
    _meta: metadata,
    isError: false,
  };
}

function walletMetadata(portfolio) {
  return {
    dexterCardToken: 'fixture-card-token',
    dexterWalletToken: 'fixture-wallet-token',
    ...(portfolio ? { dexterPortfolio: portfolio } : {}),
  };
}

async function installFixedClock(page) {
  await page.addInitScript((fixedNow) => {
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
    Object.defineProperty(window, 'Date', {
      configurable: true,
      value: FixedDate,
    });
  }, FIXED_NOW);
}

async function assertMoneyHome(surface, hostName) {
  await surface.getByText('Cash + reported credit', { exact: true }).waitFor();
  const headline = surface.locator('.dxw-spend-amount');
  assert.equal(
    (await headline.locator('span').nth(1).textContent())?.trim(),
    '67',
    `${hostName}: cash plus reported open credit must remain the account-capacity integer`,
  );
  assert.equal(
    (await headline.locator('.dxw-cents').textContent())?.trim(),
    '.25',
    `${hostName}: account-capacity cents must remain independent from portfolio value`,
  );
  await surface.getByRole('button', { name: 'Receive', exact: true }).waitFor();
  await surface.getByRole('button', { name: 'Assets', exact: true }).waitFor();
  await surface.getByRole('button', { name: 'Credit', exact: true }).waitFor();
  await surface.getByRole('button', { name: 'Activity', exact: true }).waitFor();

  const actionMetrics = await surface.locator('.dxw-action').evaluateAll((buttons) =>
    buttons.map((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  );
  assert.ok(
    actionMetrics.every(({ width, height }) => width >= 40 && height >= 40),
    `${hostName}: every home action must meet the 40px target floor`,
  );

  const themeMetrics = await surface.locator('.dxw-swatch').evaluateAll((buttons) =>
    buttons.map((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  );
  assert.ok(
    themeMetrics.every(({ width, height }) => width >= 40 && height >= 40),
    `${hostName}: every card-theme control must meet the 40px target floor`,
  );

  const reveal = surface.locator('button.dxw-reveal');
  assert.equal(await reveal.count(), 1, `${hostName}: active fixture card can be revealed`);
  const revealMetrics = await reveal.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
  }));
  assert.ok(
    revealMetrics.width >= 40 && revealMetrics.height >= 40,
    `${hostName}: card reveal must meet the 40px target floor`,
  );

  const rootMetrics = await surface.locator('.dxw-root').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert.ok(
    rootMetrics.scrollWidth <= rootMetrics.clientWidth + 1,
    `${hostName}: Money home must not overflow horizontally`,
  );
}

async function openAssets(surface) {
  await surface.getByRole('button', { name: 'Assets', exact: true }).click();
  await surface.getByRole('dialog', { name: 'Assets' }).waitFor();
}

async function assertCompleteAssets(surface, hostName) {
  await openAssets(surface);
  await surface.getByText('Portfolio value', { exact: true }).waitFor();
  await surface.getByText('$265.33', { exact: true }).waitFor();
  const exact = await surface.locator('.dxw-assets-summary-value').getAttribute('data-exact-value');
  assert.equal(exact, '265.33325', `${hostName}: exact total must stay on the string boundary`);
  for (const symbol of ['SOL', 'USDC', 'syrupUSDC', 'DEXTER', 'SPCX']) {
    await surface.locator('.dxw-asset-name').getByText(symbol, { exact: true }).waitFor();
  }
  assert.equal(
    await surface.locator('.dxw-asset-mark img').count(),
    5,
    `${hostName}: every approved fixture holding must render provenance-backed artwork`,
  );
  const expectedArtwork = new Map([
    ['SOL', ASSET_IMAGE_SOURCES.sol],
    ['USDC', ASSET_IMAGE_SOURCES.usdc],
    ['syrupUSDC', ASSET_IMAGE_SOURCES['syrup-usdc']],
    ['DEXTER', ASSET_IMAGE_SOURCES.dexter],
    ['SPCX', ASSET_IMAGE_SOURCES.spcx],
  ]);
  for (const [symbol, expectedSource] of expectedArtwork) {
    const image = surface
      .locator('.dxw-asset-row')
      .filter({ hasText: new RegExp(`^\\s*${symbol}`) })
      .locator('.dxw-asset-mark img');
    await image.waitFor();
    assert.equal(
      await image.getAttribute('data-source-url'),
      expectedSource,
      `${hostName}: ${symbol} must preserve its contract image source`,
    );
    const imageMetrics = await image.evaluate((element) => ({
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      objectFit: getComputedStyle(element).objectFit,
    }));
    assert.ok(
      imageMetrics.naturalWidth > 0 && imageMetrics.naturalHeight > 0,
      `${hostName}: ${symbol} artwork must decode`,
    );
    assert.equal(
      imageMetrics.objectFit,
      'contain',
      `${hostName}: ${symbol} artwork must not be cropped`,
    );
  }
  await surface.getByRole('button', { name: /SPCX SpaceX/ }).click();
  await surface.getByText('Scaled × 1.25', { exact: true }).waitFor();
  assert.equal(
    await surface.locator('.dxw-asset-limit').count(),
    0,
    `${hostName}: expanded truth must not repeat itself in a nested limit panel`,
  );
  assert.equal(
    await surface
      .locator('.dxw-asset-row')
      .filter({ hasText: 'SPCX' })
      .locator('.dxw-asset-amount')
      .getAttribute('data-exact-value'),
    '0.0055325',
  );
  const receive = surface.getByRole('button', { name: 'Receive', exact: true }).last();
  assert.equal(await receive.isEnabled(), true, `${hostName}: reviewed initialized SPCX can receive`);
  const receiveMetrics = await receive.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
  }));
  assert.ok(
    receiveMetrics.width >= 40 && receiveMetrics.height >= 40,
    `${hostName}: the live Receive action must meet the 40px target floor`,
  );
  for (const action of ['Send', 'Buy', 'Sell', 'Earn', 'Lend', 'Borrow', 'Pay']) {
    assert.equal(
      await surface.getByRole('button', { name: action, exact: true }).isDisabled(),
      true,
      `${hostName}: ${action} must remain disabled`,
    );
  }
  const disabledChrome = await surface
    .locator('.dxw-asset-actions button:disabled')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        backgroundColor: getComputedStyle(button).backgroundColor,
        borderColor: getComputedStyle(button).borderColor,
      })),
    );
  assert.ok(
    disabledChrome.every(
      ({ backgroundColor, borderColor }) =>
        backgroundColor === 'rgba(0, 0, 0, 0)' &&
        borderColor === 'rgba(0, 0, 0, 0)',
    ),
    `${hostName}: unavailable controls must remain quiet instead of becoming button boxes`,
  );
  await surface.getByText('Not available yet', { exact: true }).waitFor();
  await receive.click();
  await surface.getByRole('dialog', { name: 'Receive SPCX' }).waitFor();
  await surface.getByText('Receive SPCX', { exact: true }).last().waitFor();
  const addressControl = surface.locator('button.dxw-addr');
  const addressMetrics = await addressControl.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
  }));
  assert.ok(
    addressMetrics.width >= 40 && addressMetrics.height >= 40,
    `${hostName}: receive-address copy must meet the 40px target floor`,
  );
  await surface.getByRole('button', { name: 'Close Receive SPCX' }).click();
  await openAssets(surface);
}

async function assertArtworkFallback(surface, hostName, artworkRequests) {
  await openAssets(surface);
  const solImage = surface
    .locator('.dxw-asset-row')
    .filter({ hasText: /^\s*SOL/ })
    .locator('.dxw-asset-mark img');
  await solImage.waitFor();
  assert.equal(
    await solImage.getAttribute('data-source-url'),
    ASSET_IMAGE_SOURCES.sol,
    `${hostName}: a failed canonical image must advance to the next contract source`,
  );

  const dexterMark = surface
    .locator('.dxw-asset-row')
    .filter({ hasText: 'DEXTER' })
    .locator('.dxw-asset-mark');
  await dexterMark.getByText('DE', { exact: true }).waitFor();
  assert.equal(
    await dexterMark.locator('img').count(),
    0,
    `${hostName}: exhausting every source must return to the honest symbol fallback`,
  );

  const solCanonicalIndex = artworkRequests.indexOf(MISSING_IMAGE_SOURCES.solCanonical);
  const solFallbackIndex = artworkRequests.indexOf(ASSET_IMAGE_SOURCES.sol);
  assert.ok(
    solCanonicalIndex >= 0 && solFallbackIndex > solCanonicalIndex,
    `${hostName}: SOL source fallback order must remain canonical then DexScreener`,
  );

  const dexterSequence = [
    MISSING_IMAGE_SOURCES.dexterCanonical,
    MISSING_IMAGE_SOURCES.dexterDexScreener,
    MISSING_IMAGE_SOURCES.dexterOpenGraph,
  ].map((source) => artworkRequests.indexOf(source));
  assert.ok(
    dexterSequence.every((index) => index >= 0) &&
      dexterSequence[0] < dexterSequence[1] &&
      dexterSequence[1] < dexterSequence[2],
    `${hostName}: failed artwork sources must be attempted in contract precedence order`,
  );
}

async function assertPartialAssets(surface, hostName) {
  await openAssets(surface);
  await surface.getByText('Priced subtotal', { exact: true }).waitFor();
  await surface.getByText('$264.78', { exact: true }).waitFor();
  await surface.getByText(/No portfolio total/).waitFor();
  await surface.getByText(/1 unpriced holding/).waitFor();
  await surface.getByText('Unpriced', { exact: true }).waitFor();
  assert.equal(
    await surface.getByText('Portfolio value', { exact: true }).count(),
    0,
    `${hostName}: partial inventory must not publish a portfolio total`,
  );
}

async function assertGovernanceAssets(surface, hostName) {
  await openAssets(surface);
  await surface.getByText('MYSTERY', { exact: true }).waitFor();
  await surface.getByText('Unreviewed', { exact: false }).first().waitFor();
  await surface.getByText('Blocked', { exact: false }).first().waitFor();
  await surface.getByText('Frozen', { exact: false }).first().waitFor();

  await surface.getByRole('button', { name: /USDC USD Coin/ }).click();
  await surface.getByText(/account is frozen/i).waitFor();
  const frozenDetails = surface.locator('.dxw-asset-details').first();
  await frozenDetails.getByText('Reviewed', { exact: true }).waitFor();
  await frozenDetails.getByText('Frozen', { exact: true }).waitFor();
  assert.equal(
    await surface.getByRole('button', { name: 'Receive', exact: true }).last().isDisabled(),
    true,
    `${hostName}: frozen account cannot receive`,
  );
  await surface.getByText('This token account is frozen', { exact: true }).waitFor();
  const mysteryMark = surface
    .locator('.dxw-asset-row')
    .filter({ hasText: /^\s*\?MYSTERY|^\s*MYSTERY/ })
    .locator('.dxw-asset-mark');
  assert.equal(
    await mysteryMark.locator('img').count(),
    0,
    `${hostName}: unreviewed metadata must not visually impersonate a reviewed asset`,
  );
  assert.equal((await mysteryMark.textContent())?.trim(), '?');
  const blockedRow = surface.locator('.dxw-asset-row-blocked').filter({ hasText: 'SPCX' });
  await blockedRow.waitFor();
  assert.equal(
    await surface.getByRole('button', { name: /SPCX SpaceX/ }).count(),
    0,
    `${hostName}: wrong-program holdings stay visible but cannot open a view`,
  );
  await surface.getByText(/Token program does not match\. Details are blocked\./).waitFor();
  const blockedMark = blockedRow.locator('.dxw-asset-mark');
  assert.equal(
    await blockedMark.locator('img').count(),
    0,
    `${hostName}: wrong-program metadata must not receive trusted artwork`,
  );
  assert.equal((await blockedMark.textContent())?.trim(), '×');
}

async function assertPartialEnrichmentAssets(surface, hostName) {
  await openAssets(surface);
  await surface.getByText('Portfolio value', { exact: true }).waitFor();
  await surface.getByText('$265.33', { exact: true }).waitFor();
  await surface.getByText(/Some asset details incomplete/).waitFor();
  assert.equal(
    await surface.getByText(/No portfolio total/).count(),
    0,
    `${hostName}: degraded metadata must not erase a valid complete portfolio total`,
  );
}

async function assertUnavailableAssets(surface, hostName) {
  await openAssets(surface);
  const unavailable = surface.locator('.dxw-assets-unavailable');
  await unavailable.getByText('Assets unavailable', { exact: true }).waitFor();
  await surface.getByText(/no asset count or value is shown/i).waitFor();
  assert.equal(
    await surface.locator('.dxw-assets-summary-value').count(),
    0,
    `${hostName}: unavailable must not become a zero value`,
  );
  assert.equal(
    await surface.getByText('$0.00', { exact: true }).count(),
    0,
    `${hostName}: unavailable must not render a fabricated zero`,
  );
  const unavailableChrome = await unavailable.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    borderTopWidth: getComputedStyle(element).borderTopWidth,
  }));
  assert.equal(
    unavailableChrome.backgroundColor,
    'rgba(0, 0, 0, 0)',
    `${hostName}: unavailable must not become a card inside the Assets sheet`,
  );
  assert.equal(unavailableChrome.borderTopWidth, '0px');
}

async function maybeScreenshot(surface, name) {
  if (process.env.DEXTER_WALLET_SCREENSHOTS !== '1') return;
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await surface.locator('.dxw-asset-mark img').evaluateAll((images) =>
    Promise.all(images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }),
    )),
  );
  await surface.locator('.dxw-widget').screenshot({
    path: path.join(SCREENSHOT_DIR, name),
  });
}

test('wallet Money overview renders honest states in ChatGPT and MCP Apps desktop/mobile', async (t) => {
  const vite = await createServer({
    root: UI_ROOT,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await vite.listen();
  const address = vite.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : null;
  assert.ok(port);
  const widgetUrl = `http://127.0.0.1:${port}/x402-wallet.html`;

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await vite.close();
  });

  const scenarios = [
    {
      name: 'ChatGPT desktop complete',
      host: 'chatgpt',
      mobile: false,
      output: walletOutput(),
      portfolio: completePortfolio(),
      assertAssets: assertCompleteAssets,
      screenshot: 'chatgpt-desktop-complete.png',
    },
    {
      name: 'ChatGPT mobile partial',
      host: 'chatgpt',
      mobile: true,
      output: walletOutput(),
      portfolio: partialUnpricedPortfolio(),
      assertAssets: assertPartialAssets,
      screenshot: 'chatgpt-mobile-partial.png',
    },
    {
      name: 'ChatGPT desktop artwork fallback',
      host: 'chatgpt',
      mobile: false,
      output: walletOutput(),
      portfolio: imageFallbackPortfolio(),
      assertAssets: assertArtworkFallback,
      screenshot: 'chatgpt-desktop-artwork-fallback.png',
    },
    {
      name: 'MCP Apps desktop governance',
      host: 'mcp-apps',
      mobile: false,
      output: walletOutput(),
      portfolio: governancePortfolio(),
      assertAssets: assertGovernanceAssets,
      screenshot: 'mcp-apps-desktop-governance.png',
    },
    {
      name: 'MCP Apps desktop partial enrichment',
      host: 'mcp-apps',
      mobile: false,
      output: walletOutput(),
      portfolio: partialEnrichmentPortfolio(),
      assertAssets: assertPartialEnrichmentAssets,
      screenshot: 'mcp-apps-desktop-partial-enrichment.png',
    },
    {
      name: 'MCP Apps mobile complete',
      host: 'mcp-apps',
      mobile: true,
      output: walletOutput(),
      portfolio: completePortfolio(),
      assertAssets: assertCompleteAssets,
      homeScreenshot: 'mcp-apps-mobile-complete-home.png',
      screenshot: 'mcp-apps-mobile-complete.png',
    },
    {
      name: 'MCP Apps mobile unavailable',
      host: 'mcp-apps',
      mobile: true,
      output: walletOutput(),
      portfolio: null,
      assertAssets: assertUnavailableAssets,
      screenshot: 'mcp-apps-mobile-unavailable.png',
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const context = await browser.newContext({
        viewport: scenario.mobile ? { width: 375, height: 780 } : { width: 1100, height: 1000 },
        reducedMotion: 'reduce',
        colorScheme: 'light',
      });
      const page = await context.newPage();
      await installFixedClock(page);
      const artworkRequests = [];
      await page.route('https://api.qrserver.com/**', async (route) => {
        await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
      });
      await page.route('https://api.dexter.cash/api/img**', async (route) => {
        const proxied = new URL(route.request().url()).searchParams.get('url');
        if (proxied) artworkRequests.push(proxied);
        const artworkPath = proxied ? ARTWORK_FILE_BY_SOURCE.get(proxied) : null;
        if (!artworkPath) {
          await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing fixture art' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          path: artworkPath,
        });
      });

      let surface;
      if (scenario.host === 'chatgpt') {
        await page.addInitScript(installChatGptHost, {
          output: scenario.output,
          metadata: walletMetadata(scenario.portfolio),
          mobile: scenario.mobile,
        });
        await page.goto(widgetUrl);
        surface = page;
      } else {
        await page.setContent(
          '<!doctype html><html><body style="margin:0">'
            + '<iframe id="widget" title="Wallet fixture" '
            + 'style="border:0;width:100%;height:980px"></iframe>'
            + '</body></html>',
        );
        await page.evaluate(setupMcpParentHost, {
          initResult: mcpInitResult(scenario.mobile),
          toolResult: toolResult(
            scenario.output,
            walletMetadata(scenario.portfolio),
          ),
          widgetUrl,
        });
        surface = page.frameLocator('#widget');
      }

      await assertMoneyHome(surface, scenario.name);
      if (scenario.homeScreenshot) {
        await maybeScreenshot(surface, scenario.homeScreenshot);
      }
      await scenario.assertAssets(surface, scenario.name, artworkRequests);

      const scrolling = await surface.locator('.dxw-sheet').evaluate((sheet) => {
        const list = sheet.querySelector('.dxw-assets-list');
        return {
          sheetOverflowY: getComputedStyle(sheet).overflowY,
          listOverflowY: list ? getComputedStyle(list).overflowY : null,
        };
      });
      assert.equal(scrolling.sheetOverflowY, 'auto');
      if (scrolling.listOverflowY !== null) {
        assert.equal(
          scrolling.listOverflowY,
          'visible',
          `${scenario.name}: the sheet, not a nested asset list, must own vertical scrolling`,
        );
      }

      const footnote = surface.locator('.dxw-assets-footnote');
      if (await footnote.count()) {
        const contrast = await footnote.evaluate((element) => {
          const parse = (color) => {
            const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
            return channels.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
          };
          const luminance = (channels) =>
            0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          const foreground = luminance(parse(getComputedStyle(element).color));
          const background = luminance(
            parse(getComputedStyle(element.closest('.dxw-sheet')).backgroundColor),
          );
          return (Math.max(foreground, background) + 0.05)
            / (Math.min(foreground, background) + 0.05);
        });
        assert.ok(
          contrast >= 4.5,
          `${scenario.name}: meaningful small text must meet AA contrast`,
        );
      }

      await page.mouse.move(scenario.mobile ? 374 : 1099, 1);
      await maybeScreenshot(surface, scenario.screenshot);

      if (scenario.name === 'ChatGPT desktop complete') {
        const focusedRow = surface.locator('.dxw-asset-row').first();
        await focusedRow.focus();
        await page.evaluate((nextOutput) => {
          window.openai.toolOutput = nextOutput;
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolOutput: nextOutput } },
          }));
        }, {
          ...scenario.output,
          personhood: { verified: false },
        });
        await page.waitForTimeout(50);
        assert.equal(
          await focusedRow.evaluate((element) => document.activeElement === element),
          true,
          'ChatGPT desktop complete: host rerenders must not yank sheet focus to Close',
        );
      }

      const calls = await page.evaluate(() => window.__hostCalls ?? []);
      const forbidden = calls.filter((call) =>
        call.kind === 'openExternal' ||
        call.method === 'tools/call' ||
        call.method === 'ui/open-link',
      );
      assert.deepEqual(
        forbidden,
        [],
        `${scenario.name}: read-only fixture must make no tool, movement, or external handoff`,
      );
      await context.close();
    });
  }

  await t.test('ChatGPT wallet read error never becomes a zero-dollar home', async () => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 780 },
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await page.addInitScript(installChatGptHost, {
      output: {
        status: 503,
        mode: 'vault_read_error',
        user_bound: true,
        error: 'vault_state_read_failed',
      },
      mobile: true,
    });
    await page.goto(widgetUrl);
    await page.getByText("Couldn't reach your wallet", { exact: true }).waitFor();
    assert.equal(await page.getByText('Cash + reported credit', { exact: true }).count(), 0);
    assert.equal(await page.getByText('$0.00', { exact: true }).count(), 0);
    await context.close();
  });
});
