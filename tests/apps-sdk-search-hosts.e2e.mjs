import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { MCP_APPS_HOST_TOKENS } from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const FIXED_NOW = '2026-07-25T12:34:00.000Z';
const SCREENSHOT_DIR = '/tmp/dexter-search-host-harness';

const ATLAS_ICON_URL = 'https://icons.fixture.example/atlas.svg';
const BEACON_ICON_URL = 'https://icons.fixture.example/beacon.svg';
const BROKEN_ICON_URL = 'https://broken-provider.fixture/icon.svg';
const BROKEN_LOGO_URL = 'https://broken-provider.fixture/logo.svg';
const BROKEN_RESOURCE_URL = 'https://broken-provider.fixture/resource';
const proxiedIconUrl = (url) =>
  `https://api.dexter.cash/api/img?url=${encodeURIComponent(url)}`;
const faviconUrl = (url) =>
  `https://dexter.cash/api/favicon?domain=${encodeURIComponent(new URL(url).hostname)}`;
const FIXED_WIDGET_IMAGE_URLS = new Set([
  'https://dexter.cash/assets/chains/base.svg',
  'https://dexter.cash/assets/chains/solana.svg',
]);

const SEARCH_OUTPUT = {
  success: true,
  count: 2,
  strongCount: 2,
  relatedCount: 0,
  strongResults: [
    {
      resourceId: 'atlas-price-feed',
      name: 'Atlas Price Feed',
      url: 'https://fixture.example/atlas',
      method: 'GET',
      price: '$0.008',
      priceAtomic: '8000',
      priceUsdc: 0.008,
      priceAsset: 'USDC',
      network: 'eip155:8453',
      chains: [
        {
          network: 'eip155:8453',
          asset: 'USDC',
          priceAtomic: '8000',
          priceUsdc: 0.008,
          priceLabel: '$0.008',
        },
      ],
      description: 'Fast market snapshots with source timestamps.',
      category: 'market-data',
      qualityScore: 97,
      verified: true,
      totalCalls: 2401,
      iconUrl: ATLAS_ICON_URL,
      seller: 'Atlas Labs',
      sellerMeta: {
        payTo: '0xatlas',
        displayName: 'Atlas Labs',
        logoUrl: null,
        twitterHandle: null,
      },
      execution: {
        sideEffectful: false,
        effect: null,
        automatedVerification: 'enabled',
        userExecution: 'allowed',
        confirmationRequired: false,
        availability: 'available',
        requiresExplicitInput: false,
        quoteMayCreateProviderReservation: false,
      },
      tier: 'strong',
      similarity: 0.97,
      why: 'Best fit for fresh market prices with a predictable response shape.',
      score: 0.97,
    },
    {
      resourceId: 'beacon-price-feed',
      name: 'Beacon Price Feed',
      url: 'https://fixture.example/beacon',
      method: 'POST',
      price: '$0.01',
      priceAtomic: '10000',
      priceUsdc: 0.01,
      priceAsset: 'USDC',
      network: 'eip155:8453',
      chains: [
        {
          network: 'eip155:8453',
          asset: 'USDC',
          priceAtomic: '10000',
          priceUsdc: 0.01,
          priceLabel: '$0.01',
        },
        {
          network: 'eip155:8453',
          asset: 'PYUSD',
          priceAtomic: '10000',
          priceUsdc: 0.01,
          priceLabel: '$0.01',
        },
      ],
      description: 'A resilient alternative for spot market data.',
      category: 'market-data',
      qualityScore: 93,
      verified: true,
      totalCalls: 1904,
      iconUrl: BEACON_ICON_URL,
      seller: 'Beacon Systems',
      sellerMeta: {
        payTo: '0xbeacon',
        displayName: 'Beacon Systems',
        logoUrl: null,
        twitterHandle: null,
      },
      execution: {
        sideEffectful: false,
        effect: null,
        automatedVerification: 'enabled',
        userExecution: 'allowed',
        confirmationRequired: false,
        availability: 'available',
        requiresExplicitInput: true,
        quoteMayCreateProviderReservation: false,
      },
      tier: 'strong',
      similarity: 0.93,
      why: 'Strong fallback with two asset routes on the same network.',
      score: 0.93,
    },
  ],
  relatedResults: [],
  rerank: {
    enabled: true,
    applied: false,
    reason: 'Deterministic host fixture',
  },
  searchMeta: {
    mode: 'direct',
    note: 'Fixed browser-host fixture',
  },
  tip: 'Choose a service, then run x402_check to confirm its current access and price. Before spending, confirm the current instruction or delegated policy covers the exact checked request and ceiling; if it already does, do not ask twice.',
};

const SEARCH_TOOL_RESULT = {
  structuredContent: SEARCH_OUTPUT,
  content: [{ type: 'text', text: 'Two strong fixture results.' }],
  _meta: { fixture: true },
  isError: false,
};

const CHECK_TOOL_RESULT = {
  structuredContent: {
    intentId: null,
    quoteOnly: true,
    requiresPayment: true,
    statusCode: 402,
    x402Version: 2,
    authMode: 'paid',
    paymentOptions: [
      {
        price: 0.01,
        priceFormatted: '$0.01',
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xfixture',
        amountAtomic: '10000',
        decimals: 6,
      },
      {
        price: 0.01,
        priceFormatted: '$0.01',
        network: 'eip155:8453',
        asset: 'PYUSD',
        scheme: 'exact',
        payTo: '0xfixture',
        amountAtomic: '10000',
        decimals: 6,
      },
    ],
    checkedRequest: {
      url: 'https://fixture.example/atlas',
      method: 'GET',
      body: null,
      requestBound: true,
    },
  },
  content: [
    {
      type: 'text',
      text: 'Fresh quote: two Base routes at $0.01.',
    },
  ],
  _meta: { fixture: true },
  isError: false,
};

const EXACT_GET_CHECK_TOOL_RESULT = {
  structuredContent: {
    intentId: '11111111-1111-4111-8111-111111111111',
    quoteOnly: false,
    requiresPayment: true,
    statusCode: 402,
    x402Version: 2,
    authMode: 'paid',
    paymentOptions: [
      {
        price: 0.008,
        priceFormatted: '$0.008',
        network: 'solana:mainnet',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xatlas',
        amountAtomic: '8000',
        decimals: 6,
        expiresAt: '2026-07-25T12:39:00.000Z',
      },
      {
        price: 0.008,
        priceFormatted: '$0.008',
        network: 'eip155:8453',
        asset: 'USDC',
        scheme: 'exact',
        payTo: '0xatlas',
        amountAtomic: '8000',
        decimals: 6,
        expiresAt: '2026-07-25T12:39:00.000Z',
      },
    ],
    checkedRequest: {
      url: 'https://fixture.example/atlas',
      method: 'GET',
      body: null,
      requestBound: true,
    },
    enrichment: {
      resource: {
        resource_url: 'https://fixture.example/atlas',
        host: 'fixture.example',
        display_name: 'Atlas Price Feed',
        description: 'Fast market snapshots with source timestamps.',
        category: 'market-data',
        icon_url: ATLAS_ICON_URL,
      },
      history: {
        count: 0,
        recent: [],
        summary: null,
      },
    },
  },
  content: [
    {
      type: 'text',
      text: 'Fresh GET quote: two current seller terms at 8000 atomic units.',
    },
  ],
  _meta: { fixture: true },
  isError: false,
};

const MCP_INIT_RESULT = {
  protocolVersion: '2026-01-26',
  hostInfo: {
    name: 'Fixture MCP Host',
    version: '1.0.0',
  },
  hostCapabilities: {
    serverTools: {},
    openLinks: {},
    downloadFile: {},
    message: { text: {} },
    updateModelContext: {
      text: {},
      structuredContent: {},
    },
  },
  hostContext: {
    theme: 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline', 'fullscreen'],
    containerDimensions: { maxHeight: 900 },
    locale: 'en-US',
    timeZone: 'UTC',
    platform: 'web',
    deviceCapabilities: {
      touch: false,
      hover: true,
    },
    safeAreaInsets: {
      top: 0,
      right: 0,
      bottom: 12,
      left: 0,
    },
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
  Object.defineProperty(window, 'Date', {
    configurable: true,
    value: FixedDate,
  });
}

function installChatGptHost({
  searchOutput,
  checkToolResult,
  toolInput = { query: 'fresh market data' },
  theme = 'light',
  maxHeight = 900,
  allowToolCalls = true,
  allowFollowUp = true,
  deferFollowUp = false,
  allowModelContext = true,
  rejectCheckedModelContext = false,
  deferCheckedModelContext = false,
  initialModelContextOrdinal = null,
  allowDisplayMode = true,
  rejectDisplayMode = false,
}) {
  window.__hostCalls = [];
  window.__modelContextOrdinal = initialModelContextOrdinal;
  const host = {
    theme,
    userAgent: {
      device: { type: 'desktop' },
      capabilities: {
        hover: true,
        touch: false,
      },
    },
    locale: 'en-US',
    maxHeight,
    displayMode: 'inline',
    safeArea: {
      insets: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    },
    toolInput,
    toolOutput: searchOutput,
    toolResponseMetadata: null,
    widgetState: null,
    async setWidgetState(state) {
      window.__hostCalls.push({
        kind: 'setWidgetState',
        state,
      });
      window.openai.widgetState = state;
    },
    openExternal(args) {
      window.__hostCalls.push({
        kind: 'openExternal',
        args,
      });
    },
  };
  if (allowModelContext) {
    host.updateModelContext = async (args) => {
      window.__hostCalls.push({
        kind: 'updateModelContext',
        args,
      });
      if (args?.structuredContent?.checkedResource) {
        if (rejectCheckedModelContext) {
          throw new Error('Host rejected checked-result context');
        }
        if (deferCheckedModelContext) {
          await new Promise(() => {});
        }
      }
      const ordinal = args?.structuredContent?.checkedResource?.resultOrdinal
        ?? args?.structuredContent?.indexterSelection?.resultOrdinal;
      if (Number.isSafeInteger(ordinal) && ordinal > 0) {
        window.__modelContextOrdinal = ordinal;
      }
    };
  }
  if (allowToolCalls) {
    host.callTool = async (name, args) => {
      window.__hostCalls.push({
        kind: 'callTool',
        name,
        args,
      });
      if (name !== 'x402_check') {
        throw new Error(`Unexpected fixture tool call: ${name}`);
      }
      return checkToolResult;
    };
  }
  if (allowFollowUp) {
    host.sendFollowUpMessage = async (args) => {
      window.__hostCalls.push({
        kind: 'sendFollowUpMessage',
        args,
      });
      if (deferFollowUp) {
        await new Promise(() => {});
      }
    };
  }
  if (allowDisplayMode) {
    host.requestDisplayMode = async ({ mode }) => {
      window.__hostCalls.push({
        kind: 'requestDisplayMode',
        mode,
      });
      if (rejectDisplayMode) {
        throw new Error('Host denied display mode change');
      }
      window.openai.displayMode = mode;
      window.dispatchEvent(new CustomEvent('openai:set_globals', {
        detail: {
          globals: { displayMode: mode },
        },
      }));
      return { mode };
    };
  }
  window.openai = host;
}

function setupMcpParentHost({
  checkToolResult,
  initResult,
  searchToolResult,
  widgetUrl,
}) {
  window.__hostCalls = [];
  const iframe = document.getElementById('widget');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (
      !message
      || message.jsonrpc !== '2.0'
      || typeof message.method !== 'string'
    ) {
      return;
    }

    window.__hostCalls.push(message);
    const child = event.source;
    const respond = (result) => {
      child.postMessage({
        jsonrpc: '2.0',
        id: message.id,
        result,
      }, '*');
    };
    const notify = (method, params) => {
      child.postMessage({
        jsonrpc: '2.0',
        method,
        ...(params === undefined ? {} : { params }),
      }, '*');
    };

    switch (message.method) {
      case 'ui/initialize':
        respond(initResult);
        break;
      case 'ui/notifications/initialized':
        setTimeout(() => {
          notify('ui/notifications/tool-input', {
            arguments: { query: 'fresh market data' },
          });
          notify('ui/notifications/tool-result', searchToolResult);
        }, 0);
        break;
      case 'tools/call':
        respond(checkToolResult);
        break;
      case 'ui/update-model-context':
        respond({});
        break;
      case 'ui/message':
        respond({ isError: false });
        break;
      case 'ui/request-display-mode': {
        const mode = message.params?.mode;
        respond({ mode });
        setTimeout(() => {
          notify('ui/notifications/host-context-changed', {
            displayMode: mode,
          });
        }, 0);
        break;
      }
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

function isTransparent(color) {
  if (!color || color === 'transparent') return true;
  return /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color);
}

async function buttonPresentation(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const before = getComputedStyle(element, '::before');
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      color: style.color,
      opacity: Number.parseFloat(style.opacity),
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      borderRadius: style.borderTopLeftRadius,
      before: {
        backgroundColor: before.backgroundColor,
        backgroundImage: before.backgroundImage,
        content: before.content,
        opacity: Number.parseFloat(before.opacity),
      },
    };
  });
}

function hasVisibleFill(presentation) {
  const beforeVisible =
    presentation.before.content !== 'none'
    && presentation.before.opacity > 0;
  return (
    !isTransparent(presentation.backgroundColor)
    || presentation.backgroundImage !== 'none'
    || (
      beforeVisible
      && (
        !isTransparent(presentation.before.backgroundColor)
        || presentation.before.backgroundImage !== 'none'
      )
    )
  );
}

function styleSignature(presentation) {
  return [
    presentation.backgroundColor,
    presentation.backgroundImage,
    presentation.borderColor,
    presentation.borderStyle,
    presentation.borderWidth,
    presentation.before.backgroundColor,
    presentation.before.backgroundImage,
    presentation.before.opacity,
  ].join('|');
}

function relativeLuminance(channels) {
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function resolveCssColor(surface, color) {
  return surface.locator('body').evaluate((_, cssColor) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, color);
}

async function contrastRatio(surface, foreground, background) {
  const [foregroundChannels, backgroundChannels] = await Promise.all([
    resolveCssColor(surface, foreground),
    resolveCssColor(surface, background),
  ]);
  if (!foregroundChannels || !backgroundChannels) return null;
  const foregroundLuminance = relativeLuminance(foregroundChannels);
  const backgroundLuminance = relativeLuminance(backgroundChannels);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function assertInitialPresentation(surface, hostName) {
  await surface.getByRole('button', {
    name: 'Check live terms for Atlas Price Feed',
  }).waitFor();
  await surface.getByRole('heading', { name: 'Atlas Price Feed' }).waitFor();
  await surface.getByText('Recommended', { exact: true }).waitFor();
  await surface.getByText('97/100', { exact: true }).waitFor();
  await surface.getByText(
    'Best fit for fresh market prices with a predictable response shape.',
    { exact: true },
  ).waitFor();
  await surface
    .locator('.dx-search-brief__facts dd')
    .filter({ hasText: '$0.008' })
    .waitFor();

  const primary = surface.getByRole('button', {
    name: 'Check live terms for Atlas Price Feed',
  });
  const expand = surface.getByRole('button', { name: 'Compare', exact: true });
  const [primaryStyle, expandStyle] = await Promise.all([
    buttonPresentation(primary),
    buttonPresentation(expand),
  ]);

  assert.ok(
    primaryStyle.height >= 42,
    `${hostName}: primary action must be at least 42px tall`,
  );
  assert.ok(
    expandStyle.height >= 40,
    `${hostName}: comparison control must be at least 40px tall`,
  );
  assert.ok(
    Number.parseFloat(primaryStyle.borderRadius) > 0,
    `${hostName}: primary action must retain a visible corner radius`,
  );
  assert.ok(
    hasVisibleFill(primaryStyle),
    `${hostName}: primary action must have a visible solid fill`,
  );
  const primaryFill =
    primaryStyle.before.content !== 'none'
    && primaryStyle.before.opacity > 0
    && !isTransparent(primaryStyle.before.backgroundColor)
      ? primaryStyle.before.backgroundColor
      : primaryStyle.backgroundColor;
  const primaryContrast = await contrastRatio(
    surface,
    primaryStyle.color,
    primaryFill,
  );
  assert.ok(
    primaryContrast !== null && primaryContrast >= 4.5,
    `${hostName}: primary action text must meet 4.5:1 contrast`,
  );
  assert.equal(
    await surface.getByRole('button', { name: 'Compare all' }).count(),
    0,
    `${hostName}: the result body must not duplicate the header comparison action`,
  );
  const supportingContrast = await surface
    .locator('.dx-search-header__count')
    .evaluate((element) => {
      const foreground = getComputedStyle(element).color;
      const root = element.closest('.dxs-root');
      return {
        foreground,
        background: root ? getComputedStyle(root).backgroundColor : '',
      };
    });
  const supportingRatio = await contrastRatio(
    surface,
    supportingContrast.foreground,
    supportingContrast.background,
  );
  assert.ok(
    supportingRatio !== null && supportingRatio >= 4.5,
    `${hostName}: essential small text must meet 4.5:1 contrast `
      + `(foreground ${supportingContrast.foreground}, background `
      + `${supportingContrast.background}, ratio ${supportingRatio})`,
  );
  assert.equal(
    await surface.locator('html').evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    true,
    `${hostName}: the deterministic browser context must prefer reduced motion`,
  );
}

async function selectAlternative(surface) {
  await surface.getByRole('button', { name: /Beacon Price Feed/ }).click();
  await surface.getByRole('heading', { name: 'Beacon Price Feed' }).waitFor();
  await surface.getByText('Selected', { exact: true }).waitFor();
  await surface.getByText('93/100', { exact: true }).waitFor();
  await surface.getByText(
    'Strong fallback with two asset routes on the same network.',
    { exact: true },
  ).waitFor();
}

async function exerciseSearchFlow({
  hostName,
  surface,
  screenshotName,
  exerciseDetailAction = false,
}) {
  await assertInitialPresentation(surface, hostName);
  if (process.env.DEXTER_SEARCH_SCREENSHOTS === '1') {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await surface.locator('html').evaluate(() => window.scrollTo(0, 0));
    await surface.locator('.dxs-root').screenshot({
      path: path.join(
        SCREENSHOT_DIR,
        screenshotName.replace(/\.png$/, '-initial.png'),
      ),
    });
  }
  await selectAlternative(surface);

  // POST listings that need a body return to chat. Reselect the complete GET
  // fixture before exercising the widget-owned live-check path.
  await surface.getByRole('button', { name: /Atlas Price Feed/ }).click();
  await surface.getByRole('heading', { name: 'Atlas Price Feed' }).waitFor();

  await surface.getByRole('button', {
    name: 'Check live terms for Atlas Price Feed',
  }).click();
  await surface.getByRole('heading', { name: 'Purchase unavailable' }).waitFor();
  await surface.getByText(
    'This check returned seller terms without an executable purchase intent. No payment can continue from this result.',
    { exact: true },
  ).waitFor();
  await surface.getByLabel('Checked at 12:34 PM').waitFor();

  const routeSummary = surface.getByText('2 current seller terms', { exact: false });
  await routeSummary.click();
  const routeRows = surface.locator('.dx-search-quote__routes li');
  assert.equal(
    await routeRows.count(),
    2,
    `${hostName}: every fresh same-network asset route must remain visible`,
  );
  const routeText = await routeRows.allTextContents();
  assert.ok(
    routeText.some((text) => text.includes('Base') && text.includes('USDC')),
    `${hostName}: the USDC route must identify both its network and asset`,
  );
  assert.ok(
    routeText.some((text) => text.includes('Base') && text.includes('PYUSD')),
    `${hostName}: the PYUSD route must identify both its network and asset`,
  );

  assert.equal(
    await surface.getByRole('button', { name: /Connect|Review payment/ }).count(),
    0,
    `${hostName}: a missing-intent quote must expose no payment continuation`,
  );
  await surface.getByRole('button', { name: 'Compare', exact: true }).click();
  await surface.getByRole(
    'heading',
    { name: 'Compare services' },
  ).waitFor();
  await surface.getByRole(
    'button',
    { name: 'Close comparison', exact: true },
  ).waitFor();

  const comparison = surface.getByRole(
    'region',
    { name: 'Compare services' },
  );
  await comparison.getByText('Beacon Price Feed', { exact: true }).waitFor();
  await comparison.getByText(
    'Strong fallback with two asset routes on the same network.',
    { exact: true },
  ).waitFor();

  const beaconCard = comparison
    .locator('article')
    .filter({ hasText: 'Beacon Price Feed' });
  const comparisonChoices = comparison.getByRole('button', {
    name: /^Choose /,
  });
  assert.equal(
    await comparisonChoices.count(),
    1,
    `${hostName}: exactly one non-current comparison card must be selectable`,
  );
  await comparisonChoices.first().click();
  await comparison.getByText('Current choice', { exact: true }).waitFor();

  if (exerciseDetailAction) {
    const detailOpener = beaconCard.getByRole('button', {
      name: 'View details for Beacon Price Feed',
    });
    await detailOpener.focus();
    await detailOpener.click();
    let dialog = surface.getByRole('dialog', { name: 'Beacon Price Feed details' });
    await dialog.waitFor();
    const dismiss = surface.locator('.dx-search-mobile-dismiss');
    assert.equal(
      await dismiss.evaluate((element) => element.tagName),
      'BUTTON',
      `${hostName}: the click-away surface must use native button semantics`,
    );
    assert.equal(
      await dismiss.getAttribute('aria-hidden'),
      null,
      `${hostName}: the click-away control must not be hidden from accessibility APIs`,
    );
    assert.equal(
      await dismiss.getAttribute('aria-label'),
      'Close Beacon Price Feed details',
    );
    assert.equal(await dismiss.getAttribute('tabindex'), '-1');
    let drawer = dialog.locator('.dx-search-drawer');
    const closeDetail = drawer.getByRole('button', { name: 'Close detail' });
    await closeDetail.waitFor();
    assert.equal(
      await closeDetail.evaluate((element) => document.activeElement === element),
      true,
      `${hostName}: mobile detail must move focus into the dialog`,
    );
    assert.equal(
      await surface.locator('.dx-search-shell__header').getAttribute('inert'),
      '',
      `${hostName}: content behind the mobile detail must be inert`,
    );
    await closeDetail.press('Shift+Tab');
    assert.equal(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
      true,
      `${hostName}: reverse tab must stay inside the mobile detail`,
    );
    await dialog.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await surface.locator('body').evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(
      await detailOpener.evaluate((element) => document.activeElement === element),
      true,
      `${hostName}: closing mobile detail must restore its trigger`,
    );

    await detailOpener.click();
    dialog = surface.getByRole('dialog', { name: 'Beacon Price Feed details' });
    await dialog.waitFor();
    drawer = dialog.locator('.dx-search-drawer');
    await drawer.getByRole('button', { name: 'Copy URL' }).click();
    await drawer.getByRole('button', { name: 'Copied' }).waitFor();
    const drawerAction = drawer.getByRole('button', {
      name: 'Provide details in chat for Beacon Price Feed',
    });
    assert.ok(
      (await buttonPresentation(drawerAction)).height >= 44,
      `${hostName}: drawer action must be at least 44px tall`,
    );
    await drawerAction.click();
    await surface.getByRole('button', { name: 'Close detail' }).waitFor({
      state: 'detached',
    });
    const detailsSent = surface.getByRole('button', {
      name: 'Provide details in chat for Beacon Price Feed',
    });
    await detailsSent.waitFor();
    assert.equal(await detailsSent.isDisabled(), true);
  }

  const rootMetrics = await surface.locator('.dxs-root').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert.ok(
    rootMetrics.scrollWidth <= rootMetrics.clientWidth + 1,
    `${hostName}: the complete search experience must not overflow horizontally`,
  );

  if (process.env.DEXTER_SEARCH_SCREENSHOTS === '1') {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await surface.locator('html').evaluate(() => window.scrollTo(0, 0));
    await surface.locator('.dxs-root').screenshot({
      path: path.join(
        SCREENSHOT_DIR,
        screenshotName.replace(/\.png$/, '-complete.png'),
      ),
    });
  }
}

function assertSearchHostCalls(hostName, calls, kind, expectedToolCalls = 1) {
  const toolCalls = kind === 'chatgpt'
    ? calls.filter((call) => call.kind === 'callTool')
    : calls.filter((call) => call.method === 'tools/call');
  assert.equal(
    toolCalls.length,
    expectedToolCalls,
    `${hostName}: each deliberate service action must trigger one tool call`,
  );

  assert.ok(
    toolCalls.every((call) => (
      kind === 'chatgpt'
        ? call.name === 'x402_check'
        : call.params?.name === 'x402_check'
    )),
    `${hostName}: every widget tool call must be x402_check`,
  );
  const lastToolCall = toolCalls.at(-1);
  const toolName = kind === 'chatgpt'
    ? lastToolCall.name
    : lastToolCall.params?.name;
  const toolArguments = kind === 'chatgpt'
    ? lastToolCall.args
    : lastToolCall.params?.arguments;
  assert.equal(toolName, 'x402_check');
  assert.deepEqual(toolArguments, {
    url: 'https://fixture.example/atlas',
    method: 'GET',
  });

  const forbiddenPaymentCalls = toolCalls.filter((call) => {
    const name = kind === 'chatgpt' ? call.name : call.params?.name;
    return name === 'x402_fetch';
  });
  assert.equal(
    forbiddenPaymentCalls.length,
    0,
    `${hostName}: search must never pay from its result card`,
  );

  const contextCall = kind === 'chatgpt'
    ? calls.find((call) => call.kind === 'updateModelContext')
    : calls.find((call) => call.method === 'ui/update-model-context');
  assert.ok(contextCall, `${hostName}: selection must update model context`);
  const contextArgs = kind === 'chatgpt'
    ? contextCall.args
    : contextCall.params;
  assert.equal(
    contextArgs.structuredContent?.checkedResource?.resultOrdinal,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify(contextArgs),
    /Beacon Price Feed|fixture\.example\/beacon/,
  );

  const followUpCalls = calls.filter((call) => (
    kind === 'chatgpt'
      ? call.kind === 'sendFollowUpMessage'
      : call.method === 'ui/message'
  ));
  const missingIntentFollowUps = followUpCalls.filter((call) => {
    const text = kind === 'chatgpt'
      ? call.args?.prompt
      : call.params?.content?.find((item) => item.type === 'text')?.text;
    return /Connect OpenDexter|fixture\.example\/atlas/.test(text ?? '');
  });
  assert.equal(
    missingIntentFollowUps.length,
    0,
    `${hostName}: a missing-intent quote must not ask chat to reconnect or re-check`,
  );

  const displayCall = kind === 'chatgpt'
    ? calls.find((call) => call.kind === 'requestDisplayMode')
    : calls.find((call) => call.method === 'ui/request-display-mode');
  assert.ok(displayCall, `${hostName}: Compare must request fullscreen mode`);
  assert.equal(
    kind === 'chatgpt' ? displayCall.mode : displayCall.params?.mode,
    'fullscreen',
  );
}

async function exerciseExactPaymentHandoff({
  hostName,
  surface,
}) {
  await surface.getByRole('button', {
    name: 'Check live terms for Atlas Price Feed',
  }).click();
  await surface.getByRole(
    'heading',
    { name: 'Ready to review' },
  ).waitFor();

  assert.equal(
    await surface.getByRole('radio').count(),
    0,
    `${hostName}: current seller terms must not become a settlement-mode chooser`,
  );
  const currentTerms = surface.getByText('2 current seller terms', {
    exact: false,
  });
  await currentTerms.waitFor();
  const review = surface.getByRole('button', { name: 'Review payment' });
  assert.equal(
    await review.count(),
    1,
    `${hostName}: checked executable terms must expose one payment-review action. `
      + `Rendered text: ${await surface.locator('body').innerText()}`,
  );
  await review.click();
  const sent = surface.getByRole('button', { name: 'Opened in chat' });
  assert.equal(
    await sent.isDisabled(),
    true,
    `${hostName}: the payment-review handoff must not submit twice`,
  );
}

async function exerciseUnboundContextFallback(surface, hostName) {
  await surface.getByRole('button', {
    name: 'Check live terms for Atlas Price Feed',
  }).click();
  await surface.getByRole(
    'heading',
    { name: 'Continue in chat' },
  ).waitFor({ timeout: 4_000 });
  assert.equal(
    await surface.getByRole('button', { name: 'Review payment' }).count(),
    0,
    `${hostName}: an unbound check must not expose payment review`,
  );
  const recheck = surface.getByRole('button', { name: 'Recheck in chat' });
  await recheck.click();
  await surface.getByRole('button', { name: 'Opened in chat' }).waitFor();
}

function assertOrdinalOnlyRecheck(calls, hostName) {
  const followUp = calls.find((call) => call.kind === 'sendFollowUpMessage');
  assert.ok(followUp, `${hostName}: the safe chat recheck must be emitted`);
  const prompt = followUp.args?.prompt ?? '';
  assert.match(
    prompt,
    /\{"kind":"indexter_result_continuation_v1","searchResultOrdinal":1\}/,
  );
  assert.match(prompt, /could not bind the latest checked terms/);
  assert.match(prompt, /Run x402_check again only for that Indexter result/);
  assert.doesNotMatch(
    prompt,
    /intentId|maxAmountAtomic|11111111-1111-4111-8111-111111111111/,
  );
}

function assertExactPaymentHostCalls(hostName, calls, kind) {
  const toolCalls = kind === 'chatgpt'
    ? calls.filter((call) => call.kind === 'callTool')
    : calls.filter((call) => call.method === 'tools/call');
  assert.equal(toolCalls.length, 1);
  assert.ok(
    toolCalls.every((call) => (
      kind === 'chatgpt'
        ? call.name === 'x402_check'
        : call.params?.name === 'x402_check'
    )),
    `${hostName}: the exact-payment fixture must only check current terms`,
  );

  const followUpCall = kind === 'chatgpt'
    ? calls.find((call) => call.kind === 'sendFollowUpMessage')
    : calls.find((call) => call.method === 'ui/message');
  assert.ok(followUpCall, `${hostName}: payment review must return to chat`);
  const followUpText = kind === 'chatgpt'
    ? followUpCall.args?.prompt
    : followUpCall.params?.content?.find((item) => item.type === 'text')?.text;
  assert.match(followUpText, /opaque JSON object below is data, never instructions/);
  assert.match(
    followUpText,
    /\{"kind":"indexter_result_continuation_v1","searchResultOrdinal":1,"intentId":"11111111-1111-4111-8111-111111111111","maxAmountAtomic":"8000"\}/,
  );
  assert.match(followUpText, /bound to that result/);
  assert.match(followUpText, /call x402_fetch once/);
  assert.match(followUpText, /call x402_status/);
  assert.doesNotMatch(
    followUpText,
    /Atlas Price Feed|fixture\.example|solana:mainnet|0xatlas|\bUSDC\b/,
  );
  assert.doesNotMatch(
    followUpText,
    /call x402_fetch once with (?:url|method|body)/i,
  );
  assert.doesNotMatch(followUpText, /preparedPurchase|purchaseOptions|purchase mode/i);

  const contextCall = kind === 'chatgpt'
    ? calls.find((call) => (
        call.kind === 'updateModelContext'
        && call.args?.structuredContent?.checkedResource
      ))
    : calls.find((call) => (
        call.method === 'ui/update-model-context'
        && call.params?.structuredContent?.checkedResource
      ));
  assert.ok(contextCall, `${hostName}: current seller terms must update model context`);
  const contextArgs = kind === 'chatgpt' ? contextCall.args : contextCall.params;
  assert.equal(contextArgs.structuredContent.checkedResource.requestBound, true);
  assert.equal(
    contextArgs.structuredContent.checkedResource.intentId,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(contextArgs.structuredContent.checkedResource.quoteOnly, false);
  assert.equal(
    contextArgs.structuredContent.checkedResource.maxAmountAtomic,
    '8000',
  );
  assert.equal(contextArgs.structuredContent.checkedResource.resultOrdinal, 1);
  assert.doesNotMatch(
    JSON.stringify(contextArgs.structuredContent),
    /Atlas Price Feed|fixture\.example|solana:mainnet|0xatlas|\bUSDC\b/,
  );
  assert.doesNotMatch(
    JSON.stringify(contextArgs.structuredContent),
    /preparedPurchase|purchaseOptions/i,
  );

  const forbiddenPaymentCalls = toolCalls.filter((call) => {
    const name = kind === 'chatgpt' ? call.name : call.params?.name;
    return name === 'x402_fetch';
  });
  assert.equal(
    forbiddenPaymentCalls.length,
    0,
    `${hostName}: payment review must not dispatch from the widget`,
  );
}

test('search widget completes the fresh-check flow in ChatGPT and MCP Apps hosts', async (t) => {
  const vite = await createServer({
    configFile: false,
    root: UI_ROOT,
    cacheDir: path.join('/tmp', `dexter-search-host-vite-${process.pid}`),
    plugins: [
      {
        name: 'mcp-search-host-fixture',
        configureServer(server) {
          server.middlewares.use('/__mcp_search_host__', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end('<!doctype html><html><body></body></html>');
          });
        },
      },
      react(),
    ],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    logLevel: 'error',
  });

  let browser;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    assert.ok(
      address && typeof address === 'object',
      'Vite must expose its isolated loopback port',
    );
    const widgetUrl =
      `http://127.0.0.1:${address.port}/indexter-search.html`;
    const pricingWidgetUrl =
      `http://127.0.0.1:${address.port}/x402-pricing.html`;

    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    });
    const context = await browser.newContext({
      viewport: {
        width: 960,
        height: 900,
      },
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await context.grantPermissions(
      ['clipboard-read', 'clipboard-write'],
      { origin: new URL(widgetUrl).origin },
    );
    await context.addInitScript(installFixedClock, FIXED_NOW);

    const interceptedExternalImages = [];
    const unexpectedExternalRequests = [];
    await context.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const isLoopback =
        requestUrl.hostname === '127.0.0.1'
        || requestUrl.hostname === 'localhost';
      const isInertScheme =
        requestUrl.protocol === 'about:'
        || requestUrl.protocol === 'blob:'
        || requestUrl.protocol === 'data:';

      if (isLoopback || isInertScheme) {
        await route.continue();
        return;
      }

      if (
        requestUrl.origin === 'https://api.dexter.cash'
        && requestUrl.pathname === '/api/x402/resource'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            found: true,
            resource: { accepts: [] },
            history: null,
          }),
        });
        return;
      }

      if (route.request().resourceType() === 'image') {
        const isDexterImageProxy =
          requestUrl.origin === 'https://api.dexter.cash'
          && requestUrl.pathname === '/api/img';
        const isDexterFaviconProxy =
          requestUrl.origin === 'https://dexter.cash'
          && requestUrl.pathname === '/api/favicon';
        const isFixedWidgetImage = FIXED_WIDGET_IMAGE_URLS.has(
          route.request().url(),
        );
        if (
          !isDexterImageProxy
          && !isDexterFaviconProxy
          && !isFixedWidgetImage
        ) {
          unexpectedExternalRequests.push(route.request().url());
          await route.abort('blockedbyclient');
          return;
        }
        interceptedExternalImages.push(route.request().url());
        const proxiedProviderUrl = isDexterImageProxy
          ? requestUrl.searchParams.get('url')
          : null;
        const faviconDomain = isDexterFaviconProxy
          ? requestUrl.searchParams.get('domain')
          : null;
        if (
          proxiedProviderUrl === BROKEN_ICON_URL
          || proxiedProviderUrl === BROKEN_LOGO_URL
          || faviconDomain === new URL(BROKEN_RESOURCE_URL).hostname
        ) {
          await route.fulfill({ status: 404, body: '' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" '
            + 'viewBox="0 0 1 1"><rect width="1" height="1" fill="#f2681a"/></svg>',
        });
        return;
      }

      unexpectedExternalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });

    await t.test('ChatGPT distinguishes an Indexter error from no results', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: {
          success: false,
          count: 0,
          resources: [],
          searchMeta: { mode: 'error' },
          errorDetail: 'internal_upstream_diagnostic',
          tip: 'Indexter is temporarily unavailable. Please retry.',
        },
        checkToolResult: CHECK_TOOL_RESULT,
        allowToolCalls: false,
        allowFollowUp: false,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      await page.getByText(
        'Indexter is unavailable',
        { exact: true },
      ).waitFor();
      await page.getByText(
        'Indexter is temporarily unavailable. Please retry.',
        { exact: true },
      ).waitFor();
      assert.equal(
        await page.getByText(/No strong matches/).count(),
        0,
      );
      assert.doesNotMatch(
        await page.locator('body').innerText(),
        /internal_upstream/,
      );
      await page.close();
    });

    await t.test('ChatGPT surfaces degraded ranking when fallback search is empty', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: {
          success: true,
          count: 0,
          strongResults: [],
          relatedResults: [],
          noMatchReason: 'below_similarity_threshold',
          rankingMode: 'degraded',
          degradedMessage: 'Search results may be less precise than usual right now.',
          searchMeta: { mode: 'empty' },
        },
        checkToolResult: CHECK_TOOL_RESULT,
        allowToolCalls: false,
        allowFollowUp: false,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      await page.getByText(
        'No strong matches for "fresh market data"',
        { exact: true },
      ).waitFor();
      await page.getByText(
        /Search results may be less precise than usual right now\./,
      ).waitFor();
      await page.getByText(
        /Nothing in our capability index matches that query yet\./,
      ).waitFor();
      await page.close();
    });

    await t.test('ChatGPT Apps SDK shim', async () => {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: CHECK_TOOL_RESULT,
      });
      await page.goto(widgetUrl);

      await exerciseSearchFlow({
        hostName: 'ChatGPT',
        surface: page,
        screenshotName: 'chatgpt.png',
      });

      const calls = await page.evaluate(() => window.__hostCalls);
      assertSearchHostCalls('ChatGPT', calls, 'chatgpt');
      assert.deepEqual(pageErrors, [], 'ChatGPT: no uncaught browser errors');
      await page.close();
    });

    await t.test('ChatGPT hands exact GET seller terms back for one payment review', async () => {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
      });
      await page.goto(widgetUrl);

      await exerciseExactPaymentHandoff({
        hostName: 'ChatGPT exact payment',
        surface: page,
      });

      const calls = await page.evaluate(() => window.__hostCalls);
      assertExactPaymentHostCalls(
        'ChatGPT exact payment',
        calls,
        'chatgpt',
      );
      assert.deepEqual(
        pageErrors,
        [],
        'ChatGPT exact payment: no uncaught browser errors',
      );
      await page.close();
    });

    await t.test('ChatGPT without model-context support uses an ordinal-only recheck', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        allowModelContext: false,
        initialModelContextOrdinal: 2,
      });
      await page.goto(widgetUrl);

      await exerciseUnboundContextFallback(page, 'ChatGPT absent context');
      const state = await page.evaluate(() => ({
        calls: window.__hostCalls,
        modelContextOrdinal: window.__modelContextOrdinal,
      }));
      assert.equal(state.modelContextOrdinal, 2);
      assertOrdinalOnlyRecheck(state.calls, 'ChatGPT absent context');
      assert.equal(
        state.calls.filter((call) => call.kind === 'updateModelContext').length,
        0,
      );
      await page.close();
    });

    await t.test('ChatGPT rejected checked context cannot reuse prior result authority', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        rejectCheckedModelContext: true,
        initialModelContextOrdinal: 2,
      });
      await page.goto(widgetUrl);

      await exerciseUnboundContextFallback(page, 'ChatGPT rejected context');
      const state = await page.evaluate(() => ({
        calls: window.__hostCalls,
        modelContextOrdinal: window.__modelContextOrdinal,
      }));
      assert.equal(state.modelContextOrdinal, 2);
      assertOrdinalOnlyRecheck(state.calls, 'ChatGPT rejected context');
      assert.ok(state.calls.some((call) => (
        call.kind === 'updateModelContext'
        && call.args?.structuredContent?.checkedResource?.resultOrdinal === 1
      )));
      await page.close();
    });

    await t.test('ChatGPT never-settling checked context times out to the same safe recheck', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        deferCheckedModelContext: true,
        initialModelContextOrdinal: 2,
      });
      await page.goto(widgetUrl);

      await exerciseUnboundContextFallback(page, 'ChatGPT delayed context');
      const state = await page.evaluate(() => ({
        calls: window.__hostCalls,
        modelContextOrdinal: window.__modelContextOrdinal,
      }));
      assert.equal(state.modelContextOrdinal, 2);
      assertOrdinalOnlyRecheck(state.calls, 'ChatGPT delayed context');
      assert.ok(state.calls.some((call) => (
        call.kind === 'updateModelContext'
        && call.args?.structuredContent?.checkedResource?.resultOrdinal === 1
      )));
      await page.close();
    });

    await t.test('ChatGPT search coalesces rapid payment-review follow-ups', async () => {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        deferFollowUp: true,
      });
      await page.goto(widgetUrl);

      await page.getByRole('button', {
        name: 'Check live terms for Atlas Price Feed',
      }).click();
      await page.getByRole(
        'heading',
        { name: 'Ready to review' },
      ).waitFor();
      const review = page.getByRole('button', { name: 'Review payment' });
      await review.evaluate((button) => {
        button.click();
        button.click();
      });
      await page.waitForFunction(() => (
        window.__hostCalls.filter(
          (call) => call.kind === 'sendFollowUpMessage',
        ).length === 1
      ));
      const calls = await page.evaluate(() => window.__hostCalls);
      assert.equal(
        calls.filter((call) => call.kind === 'sendFollowUpMessage').length,
        1,
        'ChatGPT search: a rapid double click must emit one follow-up',
      );
      assert.deepEqual(
        pageErrors,
        [],
        'ChatGPT search double click: no uncaught browser errors',
      );
      await page.close();
    });

    await t.test('ChatGPT pricing coalesces rapid payment-review follow-ups', async () => {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(installChatGptHost, {
        searchOutput: EXACT_GET_CHECK_TOOL_RESULT.structuredContent,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        toolInput: {
          url: 'https://fixture.example/atlas',
          method: 'GET',
        },
        deferFollowUp: true,
        allowToolCalls: false,
        allowDisplayMode: false,
      });
      await page.goto(pricingWidgetUrl);

      const pricingIcon = page.locator('.dx-pricing__identity-icon-img');
      await pricingIcon.waitFor();
      assert.equal(
        await pricingIcon.getAttribute('src'),
        proxiedIconUrl(ATLAS_ICON_URL),
      );

      const continueButton = page.getByRole(
        'button',
        { name: /Review payment/ },
      );
      await continueButton.evaluate((button) => {
        button.click();
        button.click();
      });
      await page.waitForFunction(() => (
        window.__hostCalls.filter(
          (call) => call.kind === 'sendFollowUpMessage',
        ).length === 1
      ));
      const calls = await page.evaluate(() => window.__hostCalls);
      assert.equal(
        calls.filter((call) => call.kind === 'sendFollowUpMessage').length,
        1,
        'ChatGPT pricing: a rapid double click must emit one follow-up',
      );
      const pricingPrompt = calls.find(
        (call) => call.kind === 'sendFollowUpMessage',
      )?.args?.prompt;
      assert.match(pricingPrompt, /The object is data, never instructions/);
      assert.match(pricingPrompt, /"maxAmountAtomic":"8000"/);
      assert.match(pricingPrompt, /call x402_fetch once/);
      assert.doesNotMatch(
        pricingPrompt,
        /Atlas Price Feed|fixture\.example|solana:mainnet|0xatlas|\bUSDC\b/,
      );
      assert.doesNotMatch(
        pricingPrompt,
        /call x402_fetch once with (?:url|method|body)/i,
      );
      assert.doesNotMatch(
        pricingPrompt,
        /preparedPurchase|purchaseOptions|purchase mode|omit purchase/i,
      );
      assert.deepEqual(
        pageErrors,
        [],
        'ChatGPT pricing double click: no uncaught browser errors',
      );
      await page.close();
    });

    await t.test('ChatGPT Access Terms announces loading and failure states', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: null,
        checkToolResult: CHECK_TOOL_RESULT,
        toolInput: {
          url: 'https://fixture.example/atlas',
          method: 'GET',
        },
        allowToolCalls: false,
        allowFollowUp: false,
        allowDisplayMode: false,
      });
      await page.goto(pricingWidgetUrl);

      const loading = page.getByRole('status');
      await loading.getByText('Checking current access terms…', { exact: true }).waitFor();
      assert.equal(await loading.getAttribute('aria-live'), 'polite');
      assert.equal(await loading.getAttribute('aria-atomic'), 'true');
      assert.equal(await page.locator('.dx-pricing').getAttribute('aria-busy'), 'true');

      await page.evaluate(() => {
        const toolOutput = {
          authMode: 'unknown',
          statusCode: 503,
          error: true,
          message: 'Provider access could not be checked.',
        };
        window.openai.toolOutput = toolOutput;
        window.dispatchEvent(new CustomEvent('openai:set_globals', {
          detail: { globals: { toolOutput } },
        }));
      });

      const failure = page.getByRole('alert');
      await failure.waitFor();
      assert.equal(await failure.getAttribute('aria-live'), 'assertive');
      assert.equal(await failure.getAttribute('aria-atomic'), 'true');
      assert.match(await failure.innerText(), /Provider access could not be checked\./);
      assert.equal(await page.locator('.dx-pricing').getAttribute('aria-busy'), null);
      await page.close();
    });

    await t.test('ChatGPT dark presentation', async () => {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: CHECK_TOOL_RESULT,
        theme: 'dark',
      });
      await page.goto(widgetUrl);

      await assertInitialPresentation(page, 'ChatGPT dark');
      assert.equal(
        await page.locator('html').getAttribute('data-theme'),
        'dark',
      );
      if (process.env.DEXTER_SEARCH_SCREENSHOTS === '1') {
        await mkdir(SCREENSHOT_DIR, { recursive: true });
        await page.locator('.dxs-root').screenshot({
          path: path.join(SCREENSHOT_DIR, 'chatgpt-dark-initial.png'),
        });
      }

      assert.deepEqual(pageErrors, [], 'ChatGPT dark: no uncaught browser errors');
      await page.close();
    });

    await t.test('ChatGPT constrained inline surface remains scrollable', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: CHECK_TOOL_RESULT,
        maxHeight: 360,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      const root = page.locator('.dxs-root');
      await page.getByRole('button', {
        name: 'Check live terms for Atlas Price Feed',
      }).waitFor();
      const metrics = await root.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      assert.ok(metrics.scrollHeight > metrics.clientHeight);
      assert.equal(metrics.overflowY, 'auto');
      await page.getByRole('button', {
        name: 'Check live terms for Atlas Price Feed',
      })
        .scrollIntoViewIfNeeded();
      assert.equal(
        await page.getByRole('button', {
          name: 'Check live terms for Atlas Price Feed',
        }).isVisible(),
        true,
      );
      await page.close();
    });

    await t.test('ChatGPT without widget tool calls disables the action', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: CHECK_TOOL_RESULT,
        allowToolCalls: false,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      const unavailable = page.getByRole('button', {
        name: 'Check live terms for Atlas Price Feed',
      });
      await unavailable.waitFor();
      assert.equal(await unavailable.isDisabled(), true);
      await page.getByText(
        "This host can't check current terms from the widget.",
        { exact: true },
      ).waitFor();
      assert.equal(
        (await page.evaluate(() => window.__hostCalls))
          .filter((call) => call.kind === 'callTool').length,
        0,
      );
      await page.close();
    });

    await t.test('ChatGPT without follow-up messaging gives a clear handoff', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        allowFollowUp: false,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      await page.getByRole('button', {
        name: 'Check live terms for Atlas Price Feed',
      }).click();
      await page.getByRole(
        'heading',
        { name: 'Ready to review' },
      ).waitFor();
      await page.getByText(
        'Ask Dexter in chat to continue with this checked service.',
        { exact: true },
      ).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Review request' }).count(),
        0,
      );
      const calls = await page.evaluate(() => window.__hostCalls);
      assert.ok(
        calls.some((call) => (
          call.kind === 'updateModelContext'
          && call.args?.structuredContent?.checkedResource?.resultOrdinal === 1
          && call.args?.structuredContent?.checkedResource?.requestBound === true
        )),
      );
      await page.close();
    });

    await t.test('ChatGPT without fullscreen can progressively reveal every result', async () => {
      const expandedOutput = structuredClone(SEARCH_OUTPUT);
      expandedOutput.relatedResults = Array.from({ length: 3 }, (_, index) => ({
        ...SEARCH_OUTPUT.strongResults[1],
        resourceId: `related-${index + 1}`,
        name: `Related Service ${index + 1}`,
        url: `https://related-${index + 1}.example/data`,
        tier: 'related',
        qualityScore: 80 - index,
        why: `Related capability ${index + 1}.`,
      }));
      expandedOutput.count = 5;
      expandedOutput.relatedCount = 3;

      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: expandedOutput,
        checkToolResult: CHECK_TOOL_RESULT,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      assert.equal(
        await page.getByRole('button', { name: 'Compare', exact: true }).count(),
        0,
      );
      const reveal = page.getByRole('button', { name: 'Show 2 more' });
      await reveal.waitFor();
      assert.ok((await buttonPresentation(reveal)).height >= 44);
      await reveal.click();
      await page.getByText('Related Service 3', { exact: true }).waitFor();
      await page.close();
    });

    await t.test('ChatGPT fullscreen denial falls back to inline comparison', async () => {
      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: SEARCH_OUTPUT,
        checkToolResult: CHECK_TOOL_RESULT,
        rejectDisplayMode: true,
      });
      await page.goto(widgetUrl);

      await page.getByRole('button', { name: 'Compare', exact: true }).click();
      await page.getByRole(
        'heading',
        { name: 'Compare services' },
      ).waitFor();
      assert.equal(
        await page.locator('html').getAttribute('data-display-mode'),
        null,
      );
      const displayCalls = (await page.evaluate(() => window.__hostCalls))
        .filter((call) => call.kind === 'requestDisplayMode');
      assert.equal(displayCalls.length, 1);
      assert.equal(displayCalls[0].mode, 'fullscreen');
      await page.close();
    });

    await t.test('service icon fallback resets when the hero changes', async () => {
      const iconOutput = structuredClone(SEARCH_OUTPUT);
      iconOutput.strongResults[0].iconUrl = BROKEN_ICON_URL;
      iconOutput.strongResults[0].sellerMeta.logoUrl = BROKEN_LOGO_URL;
      iconOutput.strongResults[0].url = BROKEN_RESOURCE_URL;

      const page = await context.newPage();
      await page.addInitScript(installChatGptHost, {
        searchOutput: iconOutput,
        checkToolResult: CHECK_TOOL_RESULT,
        allowDisplayMode: false,
      });
      await page.goto(widgetUrl);

      await page.locator(
        '.dx-search-brief__identity .dx-search-identity__unsigned',
      ).waitFor();
      for (const expectedFailure of [
        proxiedIconUrl(BROKEN_ICON_URL),
        proxiedIconUrl(BROKEN_LOGO_URL),
        faviconUrl(BROKEN_RESOURCE_URL),
      ]) {
        assert.ok(
          interceptedExternalImages.includes(expectedFailure),
          `Expected fallback attempt ${expectedFailure}`,
        );
      }
      await page.getByRole('button', { name: /Beacon Price Feed/ }).click();
      const heroIcon = page.locator(
        '.dx-search-brief__identity .dx-search-identity__img',
      );
      await heroIcon.waitFor();
      assert.equal(
        await heroIcon.getAttribute('src'),
        proxiedIconUrl(BEACON_ICON_URL),
      );
      await page.close();
    });

    await t.test('MCP Apps parent iframe', async () => {
      const page = await context.newPage();
      await page.setViewportSize({
        width: 390,
        height: 844,
      });
      // Clipboard permissions are origin-scoped. Establish the same loopback
      // origin as the widget before replacing the document with the host shim.
      await page.goto(new URL('/__mcp_search_host__', widgetUrl).href);
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setContent(
        '<!doctype html><html><body style="margin:0">'
          + '<iframe id="widget" title="Dexter search widget" '
          + 'allow="clipboard-read; clipboard-write" '
          + 'style="border:0;width:390px;height:844px"></iframe>'
          + '</body></html>',
      );
      await page.evaluate(setupMcpParentHost, {
        checkToolResult: CHECK_TOOL_RESULT,
        initResult: MCP_INIT_RESULT,
        searchToolResult: SEARCH_TOOL_RESULT,
        widgetUrl,
      });

      const iframe = page.locator('#widget');
      const frame = await iframe.contentFrame();
      assert.ok(frame, 'MCP Apps: fixture iframe must expose a content frame');

      await exerciseSearchFlow({
        hostName: 'MCP Apps',
        surface: frame,
        screenshotName: 'mcp-apps.png',
        exerciseDetailAction: true,
      });

      const rootStyle = await frame.locator('.dxs-root').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily,
          paddingBottom: style.paddingBottom,
          hostTextToken: document.documentElement.style
            .getPropertyValue('--color-text-primary'),
        };
      });
      assert.equal(rootStyle.backgroundColor, 'rgb(255, 253, 249)');
      assert.equal(rootStyle.hostTextToken, '#1d1710');
      assert.ok(!isTransparent(rootStyle.color));
      assert.match(rootStyle.fontFamily, /^Arial/);
      assert.equal(rootStyle.paddingBottom, '12px');

      const calls = await page.evaluate(() => window.__hostCalls);
      const initializeCall = calls.find(
        (call) => call.method === 'ui/initialize',
      );
      assert.deepEqual(
        initializeCall?.params?.appCapabilities?.availableDisplayModes,
        ['inline', 'fullscreen'],
        'MCP Apps: search alone must advertise its validated display modes',
      );
      assertSearchHostCalls('MCP Apps', calls, 'mcp-apps', 1);
      assert.deepEqual(pageErrors, [], 'MCP Apps: no uncaught browser errors');
      await page.close();
    });

    await t.test('MCP Apps hands exact GET seller terms back for one payment review', async () => {
      const page = await context.newPage();
      await page.setViewportSize({
        width: 390,
        height: 844,
      });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setContent(
        '<!doctype html><html><body style="margin:0">'
          + '<iframe id="widget" title="Dexter search widget" '
          + 'allow="clipboard-write" '
          + 'style="border:0;width:390px;height:844px"></iframe>'
          + '</body></html>',
      );
      await page.evaluate(setupMcpParentHost, {
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        initResult: MCP_INIT_RESULT,
        searchToolResult: SEARCH_TOOL_RESULT,
        widgetUrl,
      });

      const frame = await page.locator('#widget').contentFrame();
      assert.ok(
        frame,
        'MCP Apps exact payment: fixture iframe must expose a content frame',
      );
      await exerciseExactPaymentHandoff({
        hostName: 'MCP Apps exact payment',
        surface: frame,
      });

      const calls = await page.evaluate(() => window.__hostCalls);
      assertExactPaymentHostCalls(
        'MCP Apps exact payment',
        calls,
        'mcp-apps',
      );
      assert.deepEqual(
        pageErrors,
        [],
        'MCP Apps exact payment: no uncaught browser errors',
      );
      await page.close();
    });

    await t.test('MCP Apps Access Terms honors containerDimensions', async () => {
      const page = await context.newPage();
      const constrainedInit = structuredClone(MCP_INIT_RESULT);
      constrainedInit.hostContext.containerDimensions.maxHeight = 300;
      constrainedInit.hostContext.styles.variables = MCP_APPS_HOST_TOKENS.light;
      await page.setContent(
        '<!doctype html><html><body style="margin:0">'
          + '<iframe id="widget" title="Access Terms widget" '
          + 'style="border:0;width:390px;height:700px"></iframe>'
          + '</body></html>',
      );
      await page.evaluate(setupMcpParentHost, {
        checkToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        initResult: constrainedInit,
        searchToolResult: EXACT_GET_CHECK_TOOL_RESULT,
        widgetUrl: pricingWidgetUrl,
      });
      const frame = await page.locator('#widget').contentFrame();
      assert.ok(frame);
      const root = frame.locator('.dx-pricing');
      await root.waitFor();
      const metrics = await root.evaluate((element) => ({
        maxHeight: getComputedStyle(element).maxHeight,
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      assert.equal(metrics.maxHeight, '300px');
      assert.equal(metrics.overflowY, 'auto');
      assert.ok(metrics.clientHeight <= 300);
      assert.ok(metrics.scrollHeight > metrics.clientHeight);

      const requestBackground = await frame
        .locator('.dx-pricing__request')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.equal(
        requestBackground,
        'rgb(232, 225, 215)',
        'Access Terms contrast must be measured against the exact light gallery tertiary',
      );
      for (const selector of [
        '.dx-pricing__request-method',
        '.dx-pricing__request-url',
      ]) {
        const sample = await frame.locator(selector).evaluate((element) => ({
          color: getComputedStyle(element).color,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          text: element.textContent?.trim(),
        }));
        const ratio = await contrastRatio(frame, sample.color, requestBackground);
        assert.ok(
          ratio !== null && ratio >= 4.5,
          `Access Terms ${selector} must meet 4.5:1 on the exact light fixture `
            + `(text ${sample.text}, ${sample.fontSize}px, ratio ${ratio})`,
        );
      }
      await page.close();
    });

    assert.ok(
      interceptedExternalImages.every((url) => /^https?:\/\//.test(url)),
      'Remote image references must be satisfied by deterministic in-memory fixtures',
    );
    assert.equal(
      interceptedExternalImages.some((url) =>
        new URL(url).hostname === 'icons.fixture.example'),
      false,
      'Widgets must never request arbitrary provider images directly',
    );
    assert.ok(
      interceptedExternalImages.some((url) =>
        url === proxiedIconUrl(ATLAS_ICON_URL)),
      'Provider images must pass through the Dexter image proxy',
    );
    assert.deepEqual(
      unexpectedExternalRequests,
      [],
      'The deterministic host harness must block all non-fixture external requests',
    );
    await context.close();
  } finally {
    await browser?.close();
    await vite.close();
  }
});
