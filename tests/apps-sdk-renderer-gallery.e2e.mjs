import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { OPEN_TOOL_NAMES } from '../lib/open-tool-contracts.mjs';
import {
  GALLERY_FIXED_NOW,
  MCP_APPS_HOST_TOKENS,
  TOOL_RENDERER_BEHAVIORS,
  buildRendererGallerySurfaces,
} from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const OUTPUT_DIR = path.join(
  REPO_ROOT,
  'output',
  'playwright',
  'opendexter-renderers',
);
const GALLERY_ENABLED = process.env.DEXTER_RENDERER_GALLERY === '1';
const SURFACE_FILTER = String(process.env.DEXTER_RENDERER_GALLERY_SURFACE || '').trim();
const DEVICE_FILTER = String(process.env.DEXTER_RENDERER_GALLERY_DEVICE || '').trim();
const THEME_FILTER = String(process.env.DEXTER_RENDERER_GALLERY_THEME || '').trim();
const BASE_CHAIN_MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 111 111" fill="none"><circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/><path d="M55.4912 94.222C77.1578 94.222 94.7217 76.881 94.7217 55.4897C94.7217 34.0984 77.1578 16.7573 55.4912 16.7573C34.908 16.7573 17.9917 32.5547 16.3311 52.5543H67.4656V58.425H16.3311C17.9917 78.4247 34.908 94.222 55.4912 94.222Z" fill="white"/></svg>';
const GENERIC_IMAGE_MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#918677" /></svg>';

const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1180, height: 980, maxHeight: 880 }),
  mobile: Object.freeze({ width: 390, height: 844, maxHeight: 720 }),
});

const THEMES = Object.freeze(['light', 'dark']);
const DEVICES = Object.freeze(['desktop', 'mobile']);
const BRAND_CONTRACTS = Object.freeze({
  'indexter-search': Object.freeze({
    selector: '.dx-indexter-lockup img[alt="Indexter"]',
    expectedCount: 1,
    expectedVisibleCount: 1,
    forbiddenText: /\bx402\b/i,
  }),
  'dexter-wallet': Object.freeze({
    selector: '.dxw-lockup[role="img"][aria-label="Dexter Wallet"] img',
    expectedCount: 2,
    expectedVisibleCount: 1,
    forbiddenText: /Dexter Payment Wallet/i,
  }),
  portfolio: Object.freeze({
    selector: '.dxw-lockup[role="img"][aria-label="Dexter Wallet"] img',
    expectedCount: 2,
    expectedVisibleCount: 1,
    forbiddenText: /Dexter Payment Wallet/i,
  }),
  'passkey-onboard': Object.freeze({
    selector: '.dxw-lockup[role="img"][aria-label="Dexter Wallet"] img',
    expectedCount: 2,
    expectedVisibleCount: 1,
    forbiddenText: /Dexter Payment Wallet/i,
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

function hostDocument({ title, theme, mobile, clipboardWrite }) {
  const palette = theme === 'dark'
    ? {
        page: '#2b2b29',
        frame: '#171715',
        header: '#22221f',
        border: 'rgba(240, 237, 228, 0.16)',
        ink: '#f0ede4',
        quiet: '#9f998f',
      }
    : {
        page: '#e9e7e2',
        frame: '#fdfaf5',
        header: '#f4f0e9',
        border: 'rgba(58, 46, 36, 0.16)',
        ink: '#3a2e24',
        quiet: '#7f766b',
      };
  const padding = mobile ? 8 : 32;
  const radius = mobile ? 14 : 18;
  const maxWidth = mobile ? '100%' : '820px';

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} host fixture</title>
    <style>
      * { box-sizing: border-box; }
      html { color-scheme: ${theme}; background: ${palette.page}; }
      body {
        margin: 0;
        min-width: 0;
        padding: ${padding}px;
        background: ${palette.page};
        color: ${palette.ink};
        font-family: Arial, sans-serif;
      }
      .host-conversation {
        width: 100%;
        max-width: ${maxWidth};
        margin: 0 auto;
      }
      .host-frame {
        width: 100%;
        overflow: hidden;
        border: 1px solid ${palette.border};
        border-radius: ${radius}px;
        background: ${palette.frame};
      }
      .host-frame__bar {
        display: flex;
        min-height: 52px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 0 18px;
        background: ${palette.header};
      }
      .host-frame__title {
        min-width: 0;
        overflow: hidden;
        color: ${palette.ink};
        font-size: 15px;
        font-weight: 600;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .host-frame__chevron {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        color: ${palette.quiet};
      }
      .host-frame__renderer {
        width: 100%;
        min-width: 0;
        background: ${palette.frame};
      }
      #widget {
        display: block;
        width: 100%;
        height: 320px;
        border: 0;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <main class="host-conversation">
      <section class="host-frame" aria-label="${escapeHtml(title)} tool result">
        <header class="host-frame__bar">
          <span class="host-frame__title">${escapeHtml(title)}</span>
          <svg class="host-frame__chevron" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </header>
        <div class="host-frame__renderer">
          <iframe
            id="widget"
            title="${escapeHtml(title)} renderer"
            allow="${clipboardWrite ? 'clipboard-write; ' : ''}publickey-credentials-create; publickey-credentials-get"
          ></iframe>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function installFixtureHost({
  initResult,
  toolInput,
  toolResult,
  omitToolResult,
  widgetUrl,
  maxHeight,
}) {
  window.__rendererGalleryCalls = [];
  window.__rendererGallerySize = null;
  const iframe = document.getElementById('widget');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return;
    }

    window.__rendererGalleryCalls.push(message);
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
          if (!omitToolResult) {
            notify('ui/notifications/tool-result', toolResult);
          }
        }, 0);
        break;
      case 'ui/notifications/size-changed': {
        const reported = Number(message.params?.height);
        if (Number.isFinite(reported) && reported > 0) {
          const height = Math.min(maxHeight, Math.max(120, Math.ceil(reported)));
          iframe.style.height = `${height}px`;
          window.__rendererGallerySize = { reported, applied: height };
        }
        break;
      }
      case 'ui/request-display-mode':
        respond({ mode: 'inline' });
        break;
      case 'tools/call':
        respond({
          content: [{ type: 'text', text: 'The gallery does not execute tools.' }],
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

function mcpInitResult({ theme, mobile, viewport }) {
  return {
    protocolVersion: '2026-01-26',
    hostInfo: { name: 'OpenDexter Renderer Gallery', version: '1.0.0' },
    hostCapabilities: {
      serverTools: {},
      openLinks: {},
      downloadFile: {},
      message: { text: {} },
      updateModelContext: { text: {}, structuredContent: {} },
    },
    hostContext: {
      theme,
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
      containerDimensions: {
        width: viewport.width,
        maxHeight: viewport.maxHeight,
      },
      locale: 'en-US',
      timeZone: 'UTC',
      userAgent: 'OpenDexter Renderer Gallery/1.0',
      platform: mobile ? 'mobile' : 'desktop',
      deviceCapabilities: { touch: mobile, hover: !mobile },
      safeAreaInsets: { top: 0, right: 0, bottom: mobile ? 12 : 0, left: 0 },
      styles: { variables: MCP_APPS_HOST_TOKENS[theme] },
    },
  };
}

function toolResult(surface) {
  return {
    structuredContent: surface.output,
    content: [{ type: 'text', text: 'Deterministic renderer gallery fixture.' }],
    _meta: surface.metadata,
    isError: false,
  };
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

async function accelerateMissingResultTimeout(context, surface) {
  if (!surface.accelerateMissingResultTimeout) return;
  await context.addInitScript((targetDelay) => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, delay = 0, ...args) => nativeSetTimeout(
      handler,
      Number(delay) === targetDelay ? 0 : delay,
      ...args,
    );
  }, 18_000);
}

function isLocalRequest(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function renderVariant({ browser, baseUrl, surface, device, theme }) {
  const viewport = VIEWPORTS[device];
  const mobile = device === 'mobile';
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await installFixedClock(context);
  await accelerateMissingResultTimeout(context, surface);
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
      const requestUrl = new URL(request.url());
      if (
        requestUrl.origin === 'https://dexter.cash'
        && requestUrl.pathname === '/api/favicon'
      ) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: requestUrl.href === 'https://dexter.cash/assets/chains/base.svg'
          ? BASE_CHAIN_MARK
          : GENERIC_IMAGE_MARK,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });

  await page.setContent(hostDocument({
    title: surface.title,
    theme,
    mobile,
    clipboardWrite: surface.id === 'indexter-search' || surface.id === 'dexter-wallet',
  }));
  const widgetUrl = `${baseUrl}/${surface.file}`;
  await page.evaluate(installFixtureHost, {
    initResult: mcpInitResult({ theme, mobile, viewport }),
    toolInput: surface.input,
    toolResult: toolResult(surface),
    omitToolResult: surface.omitToolResult === true,
    widgetUrl,
    maxHeight: viewport.maxHeight,
  });

  const frame = page.frameLocator('#widget');
  try {
    await frame.locator(surface.readySelector).waitFor({ state: 'visible', timeout: 8_000 });
  } catch (error) {
    const frameState = await Promise.all(page.frames().map(async (candidate) => ({
      url: candidate.url(),
      body: await candidate.locator('body').innerText().catch(() => ''),
    })));
    const calls = await page.evaluate(() => window.__rendererGalleryCalls ?? []);
    throw new Error(
      `${surface.id} never reached ${surface.readySelector}\n`
      + `${JSON.stringify({ frameState, calls, consoleErrors, pageErrors }, null, 2)}\n`
      + `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await page.waitForFunction(() => window.__rendererGallerySize !== null);
  await page.waitForTimeout(80);
  const childFrame = page.frames().find((candidate) => candidate.url() === widgetUrl);
  assert.ok(childFrame, `${surface.id} did not load its source document`);
  await childFrame.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.mouse.move(0, 0);

  const metrics = await frame.locator(surface.outerSelector).evaluate((element, expectedTheme) => {
    const style = getComputedStyle(element);
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      expectedTheme,
      borderWidths: [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ],
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      inlineMaxHeight: element.style.maxHeight,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      hostBackgroundToken: rootStyle.getPropertyValue('--color-background-primary').trim(),
      hostTextToken: rootStyle.getPropertyValue('--color-text-primary').trim(),
    };
  }, theme);

  assert.equal(metrics.theme, theme, `${surface.id} ignored the ${theme} host theme`);
  assert.deepEqual(
    metrics.borderWidths,
    ['0px', '0px', '0px', '0px'],
    `${surface.id} added renderer-level container borders inside the host frame`,
  );
  assert.equal(metrics.borderRadius, '0px', `${surface.id} added an outer rounded container`);
  assert.equal(metrics.boxShadow, 'none', `${surface.id} added an outer container shadow`);
  assert.equal(
    metrics.backgroundColor,
    'rgba(0, 0, 0, 0)',
    `${surface.id} painted a second content plane inside the host frame`,
  );
  assert.equal(
    metrics.inlineMaxHeight,
    '',
    `${surface.id} copied the host height onto its renderer root`,
  );
  assert.equal(metrics.maxHeight, 'none', `${surface.id} hard-capped its renderer root`);
  assert.notEqual(metrics.overflowY, 'auto', `${surface.id} trapped content in an inner scroller`);
  assert.notEqual(metrics.overflowY, 'scroll', `${surface.id} trapped content in an inner scroller`);
  assert.ok(
    metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
    `${surface.id} overflowed the ${device} host horizontally`,
  );
  assert.equal(
    metrics.hostBackgroundToken,
    MCP_APPS_HOST_TOKENS[theme]['--color-background-primary'],
  );
  assert.equal(
    metrics.hostTextToken,
    MCP_APPS_HOST_TOKENS[theme]['--color-text-primary'],
  );

  const brandContract = BRAND_CONTRACTS[surface.id]
    ?? (surface.id.startsWith('portfolio-') ? BRAND_CONTRACTS.portfolio : null);
  if (brandContract) {
    const brandLocator = frame.locator(brandContract.selector);
    const brandVisibility = await brandLocator.evaluateAll((elements) => ({
      count: elements.length,
      visibleCount: elements.filter((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && bounds.width > 0
          && bounds.height > 0;
      }).length,
    }));
    assert.equal(
      brandVisibility.count,
      brandContract.expectedCount,
      `${surface.id} is missing its canonical product lockup`,
    );
    assert.equal(
      brandVisibility.visibleCount,
      brandContract.expectedVisibleCount,
      `${surface.id} did not display the canonical product lockup for ${theme}`,
    );
    assert.doesNotMatch(
      await frame.locator('body').innerText(),
      brandContract.forbiddenText,
      `${surface.id} exposed retired product naming`,
    );
  }

  const automaticEffects = await page.evaluate(() =>
    (window.__rendererGalleryCalls ?? []).filter((call) => [
      'tools/call',
      'ui/message',
      'ui/update-model-context',
      'ui/open-link',
      'ui/download-file',
      'ui/request-display-mode',
    ].includes(call.method)),
  );
  assert.deepEqual(
    automaticEffects,
    [],
    `${surface.id} started an action during a read-only render`,
  );
  assert.deepEqual(pageErrors, [], `${surface.id} raised a browser exception`);
  assert.deepEqual(consoleErrors, [], `${surface.id} logged a browser error`);

  const nestedScrollers = await frame.locator(surface.outerSelector).evaluate((element) =>
    [...element.querySelectorAll('*')]
      .filter((candidate) => {
        const style = getComputedStyle(candidate);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll')
          && candidate.scrollHeight > candidate.clientHeight + 1;
      })
      .map((candidate) => ({
        className: candidate.className,
        clientHeight: candidate.clientHeight,
        scrollHeight: candidate.scrollHeight,
      })),
  );
  assert.deepEqual(
    nestedScrollers,
    [],
    `${surface.id} trapped vertically clipped content in a nested scroller`,
  );

  if (surface.id === 'purchase-loading') {
    const loadingText = await frame.locator('.dx-result--loading').innerText();
    assert.match(loadingText, /tool call has not returned/i);
    assert.doesNotMatch(
      loadingText,
      /submitting payment|awaiting settlement|payment cleared|settlement landed|seller is taking longer/i,
      'The pre-result state implied economic progress without backend evidence',
    );
    assert.equal(
      await frame.locator('.dx-loading, .dx-loading__eyebrow').count(),
      0,
      'The active renderer exposed the retired ornamental loader',
    );
  }

  if (surface.id === 'purchase-missing-result') {
    const missingText = await frame.locator('.dx-result--missing').innerText();
    assert.match(missingText, /No tool result returned/i);
    assert.match(
      missingText,
      /Dispatch, payment, settlement, and delivery are not confirmed/i,
    );
  }

  if (surface.id === 'access-free-result') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /No payment required/i);
    assert.match(bodyText, /Provider response/i);
    assert.match(bodyText, /Brooklyn, NY/i);
    assert.match(bodyText, /Clear/i);
    assert.equal(
      await frame.getByRole('button', { name: /review|pay|purchase/i }).count(),
      0,
      'A free provider result exposed a payment action',
    );
    const payloadMetrics = await frame.locator('.dx-result-payload').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    assert.notEqual(payloadMetrics.overflowY, 'auto');
    assert.notEqual(payloadMetrics.overflowY, 'scroll');
    assert.ok(
      payloadMetrics.scrollHeight <= payloadMetrics.clientHeight + 1,
      'The free provider result was clipped inside its renderer',
    );
  }

  if (surface.id === 'purchase-authorization') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Approval needed/i);
    assert.match(bodyText, /Review in Dexter/i);
    assert.doesNotMatch(bodyText, /payment (?:is |was )?confirmed|result delivered/i);
  }

  if (surface.id === 'purchase-ambiguous-post-dispatch') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Outcome unresolved/i);
    assert.match(bodyText, /another fetch could duplicate the purchase/i);
    assert.doesNotMatch(bodyText, /payment (?:is |was )?confirmed|result delivered/i);
  }

  if (surface.id === 'purchase-definitive-failure') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Purchase stopped/i);
    assert.match(bodyText, /no successful purchase/i);
    assert.doesNotMatch(bodyText, /payment (?:is |was )?confirmed|result delivered/i);
  }

  if (surface.id === 'access-free-empty-result') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /No payment required/i);
    assert.match(bodyText, /Provider response/i);
    assert.match(bodyText, /The provider returned an empty result/i);
    assert.equal(
      await frame.getByRole('button', { name: /review|pay|purchase/i }).count(),
      0,
      'An empty free provider result exposed a payment action',
    );
  }

  if (surface.id === 'access-loading') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Checking current access terms/i);
    assert.doesNotMatch(bodyText, /payment (?:is |was )?confirmed|payment submitted|settlement/i);
  }

  if (surface.id === 'access-siwx-required') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Wallet sign-in required/i);
    assert.match(bodyText, /identity, not a payment quote/i);
    assert.match(bodyText, /no compatible signer is available/i);
    assert.match(bodyText, /made no payment/i);
  }

  if (surface.id === 'access-api-key-required') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Provider authentication required/i);
    assert.match(bodyText, /credentials are required/i);
  }

  if (surface.id === 'access-hybrid-api-key-paid') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Provider authentication must be completed/i);
    assert.match(bodyText, /No payment has been made/i);
  }

  if (surface.id === 'access-error') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Pricing unavailable/i);
    assert.match(bodyText, /This check made no payment/i);
  }

  if (surface.id === 'access-paid-quote-only') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /informational/i);
    assert.match(bodyText, /No payment can continue from this result/i);
    assert.equal(
      await frame.getByRole('button', { name: /review|pay|purchase/i }).count(),
      0,
      'A quote-only access result exposed a purchase action',
    );
  }

  if (surface.id === 'purchase-dense-json-result') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Showing a preview\. Open the full result to see the rest\./i);
    assert.equal(
      await frame.getByRole('button', { name: 'View full result' }).count(),
      1,
      'A dense result did not offer the Apps SDK fullscreen view',
    );
  }

  if (surface.id === 'purchase-result') {
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
  }

  if (surface.id === 'portfolio-loading') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Loading the current portfolio/i);
    assert.doesNotMatch(bodyText, /\$[\d,.]+/);
  }

  if (surface.id === 'portfolio-authentication-required') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Connect OpenDexter/i);
    assert.match(bodyText, /passkey/i);
  }

  if (surface.id === 'portfolio-read-error') {
    assert.match(await frame.locator('body').innerText(), /Portfolio unavailable/i);
  }

  if (surface.id === 'portfolio-invalid') {
    assert.match(await frame.locator('body').innerText(), /Portfolio data unavailable/i);
  }

  if (surface.id === 'portfolio-empty') {
    assert.match(await frame.locator('body').innerText(), /No assets held/i);
  }

  if (surface.id === 'portfolio-partial-unpriced') {
    const bodyText = await frame.locator('body').innerText();
    assert.match(bodyText, /Unpriced/i);
    assert.match(bodyText, /Priced subtotal/i);
    assert.match(bodyText, /unpriced asset/i);
  }

  if (surface.id === 'portfolio-partial-omitted') {
    assert.match(await frame.locator('body').innerText(), /partial read/i);
  }

  if (surface.id.startsWith('governed-') && surface.id !== 'governed-action' && surface.id !== 'governed-history') {
    assert.equal(
      await frame.getByRole('button', { name: /approve|execute|buy|sell|send/i }).count(),
      0,
      `${surface.id} exposed an economic action inside a receipt renderer`,
    );
  }

  if (surface.id === 'governed-history-empty') {
    assert.match(await frame.locator('body').innerText(), /No governed actions yet/i);
  }

  if (surface.id === 'governed-history-error') {
    assert.match(await frame.locator('body').innerText(), /Wallet history unavailable/i);
  }

  const screenshotName = `${surface.id}--${device}--${theme}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_DIR, screenshotName),
    fullPage: true,
    animations: 'disabled',
  });
  const size = await page.evaluate(() => window.__rendererGallerySize);
  if (!surface.compatibility) {
    assert.ok(
      size.reported <= size.applied + 1,
      `${surface.id} asked the host for ${size.reported}px but was clipped to ${size.applied}px`,
    );
  }
  await context.close();
  return {
    surface: surface.id,
    resourceUri: surface.resourceUri,
    tools: surface.tools,
    compatibility: surface.compatibility === true,
    device,
    theme,
    viewport: { width: viewport.width, height: viewport.height },
    widgetHeight: size,
    screenshot: screenshotName,
  };
}

const galleryTest = GALLERY_ENABLED ? test : test.skip;

galleryTest('current OpenDexter renderers fill one deterministic host-frame gallery', async (t) => {
  const allSurfaces = await buildRendererGallerySurfaces();
  const surfaces = SURFACE_FILTER
    ? allSurfaces.filter(({ id }) => id === SURFACE_FILTER)
    : allSurfaces;
  assert.ok(surfaces.length > 0, `Unknown gallery surface: ${SURFACE_FILTER}`);
  if (!SURFACE_FILTER) {
    const coveredTools = [...new Set(surfaces.flatMap(({ tools }) => tools))];
    assert.deepEqual(
      coveredTools.sort(),
      [...OPEN_TOOL_NAMES].sort(),
      'The gallery must render every current tool behavior',
    );
    for (const surface of surfaces) {
      for (const toolName of surface.tools) {
        const behavior = TOOL_RENDERER_BEHAVIORS[toolName];
        assert.equal(surface.id, behavior.family);
        assert.equal(surface.resourceUri, behavior.resourceUri);
      }
    }
    const discoverySurface = surfaces.find(({ id }) => id === 'indexter-search');
    assert.equal(discoverySurface?.file, 'indexter-search.html');
    assert.equal(
      surfaces.some(({ file }) => file === 'x402-marketplace-search.html'),
      false,
      'The gallery must not render the retired x402 search entrypoint',
    );
    assert.deepEqual(
      surfaces.filter(({ compatibility }) => compatibility).map(({ id }) => id),
      ['passkey-onboard', 'passkey-probe'],
    );
  }

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

  const rendered = [];
  const devices = DEVICE_FILTER ? DEVICES.filter((device) => device === DEVICE_FILTER) : DEVICES;
  const themes = THEME_FILTER ? THEMES.filter((theme) => theme === THEME_FILTER) : THEMES;
  assert.ok(devices.length > 0, `Unknown gallery device: ${DEVICE_FILTER}`);
  assert.ok(themes.length > 0, `Unknown gallery theme: ${THEME_FILTER}`);
  for (const surface of surfaces) {
    for (const device of devices) {
      for (const theme of themes) {
        await t.test(`${surface.id} / ${device} / ${theme}`, async () => {
          rendered.push(await renderVariant({
            browser,
            baseUrl,
            surface,
            device,
            theme,
          }));
        });
      }
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: GALLERY_FIXED_NOW,
    roster: [...OPEN_TOOL_NAMES],
    surfaces: surfaces.map(({ id, title, file, resourceUri, tools, compatibility }) => ({
      id,
      title,
      file,
      resourceUri,
      tools,
      compatibility: compatibility === true,
    })),
    variants: rendered,
  };
  await writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  assert.equal(rendered.length, surfaces.length * devices.length * themes.length);
});
