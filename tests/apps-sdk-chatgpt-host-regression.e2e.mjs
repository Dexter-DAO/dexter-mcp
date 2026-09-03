import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import {
  GALLERY_FIXED_NOW,
  MCP_APPS_HOST_TOKENS,
  buildRendererGallerySurfaces,
} from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const OUTPUT_DIR = path.join(
  REPO_ROOT,
  'output',
  'playwright',
  'chatgpt-inline-host-regression',
);

const EXACT_PORTFOLIO_USD = '1.111054806653228792418715';
const THEMES = Object.freeze(['light', 'dark']);

// These are adaptive stress cases, not claims about one fixed ChatGPT limit.
// maxHeight remains host-authoritative in both cases. The 2x case reproduces
// the plausible logical-pixel interpretation of the supplied Retina capture.
const HOST_PROFILES = Object.freeze({
  'wide-inline': Object.freeze({
    viewportWidth: 1530,
    viewportHeight: 720,
    contentWidth: 1450,
    maxHeight: 500,
    deviceScaleFactor: 1,
  }),
  'retina-short-inline': Object.freeze({
    viewportWidth: 1040,
    viewportHeight: 430,
    contentWidth: 980,
    maxHeight: 260,
    deviceScaleFactor: 2,
  }),
});

const SURFACE_CONTRACTS = Object.freeze({
  'indexter-search': Object.freeze({
    toolName: 'indexter_search',
    toolTitle: 'Indexter Search',
    fallbackWords: 'indexter search',
    documentTitle: 'Indexter Search',
    readySelector: '.dx-search-brief__title',
    planeSelector: '.dxs-root',
    essentialSelectors: Object.freeze([
      '.dx-indexter-lockup img[alt="Indexter"]',
      '.dx-search-query h1',
      '.dx-search-brief__title',
    ]),
  }),
  'dexter-wallet': Object.freeze({
    toolName: 'dexter_wallet',
    toolTitle: 'Dexter Wallet',
    fallbackWords: 'dexter wallet',
    documentTitle: 'Dexter Wallet',
    readySelector: '.dxw-spend-amount',
    planeSelector: '.dxw-widget',
    essentialSelectors: Object.freeze([
      '.dxw-lockup[role="img"][aria-label="Dexter Wallet"]',
      '.dxw-spend-label',
      '.dxw-spend-amount',
    ]),
  }),
  portfolio: Object.freeze({
    toolName: 'dexter_wallet_portfolio',
    toolTitle: 'Dexter Wallet Portfolio',
    fallbackWords: 'dexter wallet portfolio',
    documentTitle: 'Dexter Wallet Portfolio',
    readySelector: '[aria-label^="Portfolio value"]',
    planeSelector: '.dxp-root',
    essentialSelectors: Object.freeze([
      '.dxw-lockup[role="img"][aria-label="Dexter Wallet"]',
      '#dxp-title',
      '[aria-label^="Portfolio value"]',
    ]),
  }),
});

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function chatGptFallbackLabel(toolName) {
  const words = toolName.split('_').filter(Boolean);
  return words.map((word, index) => {
    if (word.toLowerCase() === 'x402') return 'X402';
    return index === 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word;
  }).join(' ');
}

function hostDocument({ hostLabel, theme, profile }) {
  const palette = theme === 'dark'
    ? { page: '#2b2b29', ink: '#f0ede4', quiet: '#a8a49d' }
    : { page: '#e9e7e2', ink: '#3a2e24', quiet: '#756e65' };

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(hostLabel)} host stress fixture</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; background: ${palette.page}; }
      body {
        padding: 22px 0 0;
        color: ${palette.ink};
        font-family: Arial, sans-serif;
      }
      .host-tool {
        width: ${profile.contentWidth}px;
        max-width: calc(100vw - 48px);
        margin: 0 auto;
      }
      .host-tool__label {
        min-height: 35px;
        padding: 0 4px 10px;
        color: ${palette.quiet};
        font-size: 16px;
        line-height: 1.4;
      }
      .host-tool__surface {
        width: 100%;
        min-width: 0;
        background: transparent;
      }
      #widget {
        display: block;
        width: 100%;
        height: ${profile.maxHeight}px;
        border: 0;
        background: transparent;
        color-scheme: ${theme};
      }
    </style>
  </head>
  <body>
    <main class="host-tool" aria-label="${escapeHtml(hostLabel)} tool result">
      <div class="host-tool__label">${escapeHtml(hostLabel)}</div>
      <div class="host-tool__surface">
        <iframe id="widget" title="${escapeHtml(hostLabel)} renderer"></iframe>
      </div>
    </main>
  </body>
</html>`;
}

function installFixtureHost({ initResult, toolInput, toolResult, widgetUrl, maxHeight }) {
  window.__hostCalls = [];
  window.__hostSize = null;
  const iframe = document.getElementById('widget');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;

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
          notify('ui/notifications/tool-input', { arguments: toolInput });
          notify('ui/notifications/tool-result', toolResult);
        }, 0);
        break;
      case 'ui/notifications/size-changed': {
        const reported = Number(message.params?.height);
        if (Number.isFinite(reported) && reported > 0) {
          const applied = Math.min(maxHeight, Math.max(80, Math.ceil(reported)));
          iframe.style.height = `${applied}px`;
          window.__hostSize = { reported, applied, maxHeight };
        }
        break;
      }
      case 'ui/request-display-mode':
        respond({ mode: 'inline' });
        break;
      case 'tools/call':
        respond({
          content: [{ type: 'text', text: 'This visual fixture never executes tools.' }],
          isError: true,
        });
        break;
      case 'ui/message':
      case 'ui/update-model-context':
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

function mcpInitResult({ theme, profile }) {
  return {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'ChatGPT Inline Stress Fixture', version: '1.0.0' },
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
        width: profile.contentWidth,
        maxHeight: profile.maxHeight,
      },
      locale: 'en-US',
      timeZone: 'UTC',
      userAgent: 'ChatGPT Inline Stress Fixture/1.0',
      platform: 'desktop',
      deviceCapabilities: { touch: false, hover: true },
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      styles: { variables: MCP_APPS_HOST_TOKENS[theme] },
    },
  };
}

function toolResult(surface) {
  return {
    structuredContent: surface.output,
    content: [{ type: 'text', text: 'Deterministic inline-host stress fixture.' }],
    _meta: surface.metadata,
    isError: false,
  };
}

function withLongPortfolioDecimal(surface) {
  const next = structuredClone(surface);
  next.output.portfolio.holdings = [next.output.portfolio.holdings[0]];
  next.output.portfolio.holdings[0].valueUsd = EXACT_PORTFOLIO_USD;
  next.output.portfolio.portfolioValueUsd = EXACT_PORTFOLIO_USD;
  next.output.portfolio.pricedValueUsd = EXACT_PORTFOLIO_USD;
  next.output.portfolio.pricedHoldings = 1;
  next.output.portfolio.unpricedHoldings = 0;
  return next;
}

async function installFixedClock(context) {
  await context.addInitScript((fixedNow) => {
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
  }, GALLERY_FIXED_NOW);
}

function isLocalRequest(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function inspectInlineVariant({ browser, baseUrl, surface, theme, profileName, profile }) {
  const contract = SURFACE_CONTRACTS[surface.id];
  const hostLabel = chatGptFallbackLabel(contract.toolName);
  const context = await browser.newContext({
    viewport: { width: profile.viewportWidth, height: profile.viewportHeight },
    deviceScaleFactor: profile.deviceScaleFactor,
    colorScheme: theme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await installFixedClock(context);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (isLocalRequest(request.url(), baseUrl)) {
      await route.continue();
      return;
    }
    if (request.resourceType() === 'image') {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#918677" /></svg>',
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.setContent(hostDocument({ hostLabel, theme, profile }));
  const widgetUrl = `${baseUrl}/${surface.file}`;
  await page.evaluate(installFixtureHost, {
    initResult: mcpInitResult({ theme, profile }),
    toolInput: surface.input,
    toolResult: toolResult(surface),
    widgetUrl,
    maxHeight: profile.maxHeight,
  });

  const frame = page.frameLocator('#widget');
  await frame.locator(contract.readySelector).waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForFunction(() => window.__hostSize !== null);
  await page.waitForTimeout(120);
  const childFrame = page.frames().find((candidate) => candidate.url() === widgetUrl);
  assert.ok(childFrame, `${surface.id} did not load its renderer document`);
  await childFrame.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });

  const metrics = await childFrame.evaluate(({ outerSelector, planeSelector, essentialSelectors }) => {
    const outer = document.querySelector(outerSelector);
    const plane = document.querySelector(planeSelector);
    if (!(outer instanceof HTMLElement)) throw new Error(`Missing outer ${outerSelector}`);
    if (!(plane instanceof HTMLElement)) throw new Error(`Missing plane ${planeSelector}`);

    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const backgroundAlpha = (element) => {
      const value = getComputedStyle(element).backgroundColor.trim().toLowerCase();
      if (value === 'transparent') return 0;
      const match = value.match(/^rgba?\(([^)]+)\)$/);
      if (!match) return 1;
      const channels = match[1].split(/[,/\s]+/).filter(Boolean);
      return channels.length > 3 ? Number(channels[3]) : 1;
    };
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const firstVisible = (selector) =>
      [...document.querySelectorAll(selector)].find((element) => visible(element));
    const viewportBottom = document.documentElement.clientHeight;
    const viewportRight = document.documentElement.clientWidth;

    const essential = essentialSelectors.map((selector) => {
      const element = firstVisible(selector);
      return {
        selector,
        found: Boolean(element),
        text: element?.textContent?.trim() ?? '',
        ariaLabel: element?.getAttribute('aria-label') ?? '',
        title: element?.getAttribute('title') ?? '',
        dataExactValue: element?.getAttribute('data-exact-value') ?? '',
        rect: element ? bounds(element) : null,
      };
    });

    const clippedText = [...document.body.querySelectorAll('*')]
      .filter((element) => visible(element))
      .filter((element) => [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      ))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: element.textContent?.trim().slice(0, 90) ?? '',
        rect: bounds(element),
      }))
      .filter(({ rect }) => rect.top < viewportBottom - 0.5 && rect.bottom > viewportBottom + 0.5);

    const scrollContainers = [...document.body.querySelectorAll('*')]
      .filter((element) => element instanceof HTMLElement && visible(element))
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        };
      })
      .filter(({ overflowY, clientHeight, scrollHeight }) =>
        (overflowY === 'auto' || overflowY === 'scroll')
        && scrollHeight > clientHeight + 1,
      );

    const outerStyle = getComputedStyle(outer);
    const planeStyle = getComputedStyle(plane);
    return {
      title: document.title,
      viewport: { width: viewportRight, height: viewportBottom },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        htmlBackgroundAlpha: backgroundAlpha(document.documentElement),
        bodyBackgroundAlpha: backgroundAlpha(document.body),
      },
      outer: {
        rect: bounds(outer),
        inlineMaxHeight: outer.style.maxHeight,
        overflowY: outerStyle.overflowY,
        backgroundAlpha: backgroundAlpha(outer),
      },
      plane: {
        selector: planeSelector,
        backgroundAlpha: backgroundAlpha(plane),
        borderWidths: [
          planeStyle.borderTopWidth,
          planeStyle.borderRightWidth,
          planeStyle.borderBottomWidth,
          planeStyle.borderLeftWidth,
        ],
        borderRadius: planeStyle.borderRadius,
        boxShadow: planeStyle.boxShadow,
      },
      essential,
      clippedText,
      scrollContainers,
    };
  }, {
    outerSelector: surface.outerSelector,
    planeSelector: contract.planeSelector,
    essentialSelectors: contract.essentialSelectors,
  });

  const screenshot = `${surface.id}--${profileName}--${theme}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_DIR, screenshot),
    fullPage: true,
    animations: 'disabled',
  });
  const hostSize = await page.evaluate(() => window.__hostSize);
  await context.close();
  return { metrics, hostSize, hostLabel, screenshot, consoleErrors, pageErrors };
}

function inlineIntegrityViolations({ report, surface, contract, profileName, theme }) {
  const { metrics } = report;
  const prefix = `${surface.id} / ${profileName} / ${theme}`;
  const violations = [];
  const expect = (condition, message) => {
    if (!condition) violations.push(`${prefix}: ${message}`);
  };

  expect(metrics.title === contract.documentTitle, `wrong renderer document title: ${metrics.title}`);
  expect(metrics.document.htmlBackgroundAlpha === 0, 'html painted a second host plane');
  expect(metrics.document.bodyBackgroundAlpha === 0, 'body painted a second host plane');
  expect(metrics.outer.backgroundAlpha === 0, 'renderer root painted a second host plane');
  expect(
    metrics.plane.backgroundAlpha === 0,
    `${metrics.plane.selector} painted a nested card/plane`,
  );
  expect(
    metrics.plane.borderWidths.every((value) => value === '0px'),
    `${metrics.plane.selector} added a renderer-level border: ${metrics.plane.borderWidths.join(' ')}`,
  );
  expect(metrics.plane.borderRadius === '0px', 'renderer plane added outer rounding');
  expect(metrics.plane.boxShadow === 'none', 'renderer plane added an outer shadow');
  expect(metrics.outer.inlineMaxHeight === '', 'renderer copied host maxHeight onto its root');
  expect(
    !/^(auto|scroll)$/.test(metrics.outer.overflowY),
    `renderer root became an internal ${metrics.outer.overflowY} container`,
  );
  expect(
    metrics.scrollContainers.length === 0,
    `initial state has internal vertical overflow: ${JSON.stringify(metrics.scrollContainers)}`,
  );
  expect(
    metrics.outer.rect.bottom <= metrics.viewport.height + 1,
    `initial content ends at ${metrics.outer.rect.bottom}px through a ${metrics.viewport.height}px inline boundary`,
  );
  expect(
    metrics.document.scrollWidth <= metrics.document.clientWidth + 1,
    `initial state overflows horizontally (${metrics.document.scrollWidth}/${metrics.document.clientWidth})`,
  );
  expect(
    metrics.clippedText.length === 0,
    `text is cut through at the inline boundary: ${JSON.stringify(metrics.clippedText)}`,
  );
  for (const essential of metrics.essential) {
    expect(essential.found, `missing initial summary element ${essential.selector}`);
    if (essential.rect) {
      expect(essential.rect.top >= -1, `${essential.selector} starts above the viewport`);
      expect(
        essential.rect.bottom <= metrics.viewport.height + 1,
        `${essential.selector} ends at ${essential.rect.bottom}px and is not fully visible`,
      );
    }
  }
  expect(report.consoleErrors.length === 0, `browser console errors: ${report.consoleErrors.join(' | ')}`);
  expect(report.pageErrors.length === 0, `browser page errors: ${report.pageErrors.join(' | ')}`);

  if (surface.id === 'portfolio') {
    const value = metrics.essential.at(-1);
    const exactEvidence = [value.ariaLabel, value.title, value.dataExactValue].join(' ');
    expect(value.text === '$1.11', `resting currency must be $1.11, received ${value.text}`);
    expect(
      exactEvidence.includes(EXACT_PORTFOLIO_USD),
      'exact portfolio decimal was not retained outside the rounded resting display',
    );
  }

  return violations;
}

test('OpenDexter inline renderers survive transparent, height-constrained host stress cases', async (t) => {
  const gallerySurfaces = await buildRendererGallerySurfaces();
  const surfaces = gallerySurfaces
    .filter(({ id }) => Object.hasOwn(SURFACE_CONTRACTS, id))
    .map((surface) => surface.id === 'portfolio' ? withLongPortfolioDecimal(surface) : surface);
  assert.deepEqual(surfaces.map(({ id }) => id), ['indexter-search', 'dexter-wallet', 'portfolio']);

  await mkdir(OUTPUT_DIR, { recursive: true });
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
    const contract = SURFACE_CONTRACTS[surface.id];
    for (const [profileName, profile] of Object.entries(HOST_PROFILES)) {
      for (const theme of THEMES) {
        await t.test(`${surface.id} / ${profileName} / ${theme}`, async () => {
          const report = await inspectInlineVariant({
            browser,
            baseUrl,
            surface,
            theme,
            profileName,
            profile,
          });
          assert.deepEqual(
            inlineIntegrityViolations({ report, surface, contract, profileName, theme }),
            [],
            `See ${path.join(OUTPUT_DIR, report.screenshot)}`,
          );
        });
      }
    }
  }

  await t.test('canonical names remain safe when the host falls back to tool identifiers', () => {
    const violations = [];
    for (const contract of Object.values(SURFACE_CONTRACTS)) {
      const title = OPEN_TOOL_CONTRACTS[contract.toolName]?.title;
      if (typeof title !== 'string') {
        violations.push(`${contract.toolName} has no canonical title`);
        continue;
      }
      if (title !== contract.toolTitle) {
        violations.push(`${contract.toolName} has title "${title}" instead of "${contract.toolTitle}"`);
      }
      const fallback = chatGptFallbackLabel(contract.toolName);
      if (fallback.toLowerCase() !== contract.fallbackWords) {
        violations.push(`${contract.toolName} humanizes to the wrong product words: "${fallback}"`);
      }
      if (/x402/i.test(fallback)) {
        violations.push(`${contract.toolName} exposes retired x402 identity as "${fallback}"`);
      }
    }
    assert.deepEqual(violations, [], 'host-humanized tool identifiers must preserve canonical product titles');
  });
});
