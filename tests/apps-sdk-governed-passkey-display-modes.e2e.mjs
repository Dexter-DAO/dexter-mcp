import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
import { buildRendererGallerySurfaces } from './fixtures/opendexter-renderer-gallery-fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const INLINE_VIEWPORT = Object.freeze({ width: 980, height: 900 });
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';

// The dimensions below describe this fixture host. The renderers must read the
// host's current mode and report their intrinsic height; they must not copy the
// fixture maxHeight into an internal scrolling viewport.
function installChatGptAppsHost({ input, output, theme }) {
  window.__appsHostCalls = [];

  const record = (kind, detail = {}) => {
    window.__appsHostCalls.push({ kind, ...detail });
  };

  const host = {
    theme,
    locale: 'en-US',
    displayMode: 'inline',
    maxHeight: 720,
    safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    userAgent: {
      device: { type: 'desktop' },
      capabilities: { hover: true, touch: false },
    },
    toolInput: input,
    toolOutput: output,
    toolResponseMetadata: {},
    widgetState: null,
    notifyIntrinsicHeight(args) {
      record('notifyIntrinsicHeight', { args });
    },
    async requestDisplayMode({ mode }) {
      record('requestDisplayMode', { mode });
      if (mode !== 'inline' && mode !== 'fullscreen') {
        throw new Error(`Unsupported fixture display mode: ${mode}`);
      }
      host.displayMode = mode;
      host.maxHeight = mode === 'fullscreen' ? 1600 : 720;
      window.dispatchEvent(new CustomEvent('openai:set_globals', {
        detail: {
          globals: {
            displayMode: host.displayMode,
            maxHeight: host.maxHeight,
          },
        },
      }));
      return { mode };
    },
    async callTool(name, args) {
      record('callTool', { name, args });
      throw new Error(`Unexpected tool call from fixture renderer: ${name}`);
    },
    openExternal(args) {
      record('openExternal', { args });
    },
    async updateModelContext(args) {
      record('updateModelContext', { args });
    },
    async sendFollowUpMessage(args) {
      record('sendFollowUpMessage', { args });
    },
    async setWidgetState(state) {
      record('setWidgetState', { state });
      host.widgetState = state;
    },
  };

  window.openai = host;
}

async function openSurface({ browser, baseUrl, surface, output = surface.output, theme = 'light' }) {
  const page = await browser.newPage({ viewport: INLINE_VIEWPORT });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installChatGptAppsHost, {
    input: surface.input,
    output,
    theme,
  });
  await page.goto(`${baseUrl}/${surface.file}`);
  return { page, pageErrors };
}

async function waitForMode(page, rootSelector, mode) {
  await page.locator(rootSelector).waitFor({ state: 'visible' });
  await page.waitForFunction(({ expectedMode, selector }) => {
    const root = document.querySelector(selector);
    return root?.getAttribute('data-display-mode') === expectedMode
      || window.openai?.displayMode === expectedMode;
  }, { expectedMode: mode, selector: rootSelector });
}

async function resetHostCalls(page) {
  await page.evaluate(() => {
    window.__appsHostCalls = [];
  });
}

async function presentationCalls(page) {
  return page.evaluate(() => (
    (window.__appsHostCalls ?? [])
      .filter((call) => call.kind !== 'notifyIntrinsicHeight')
  ));
}

async function waitForIntrinsicHeight(page) {
  await page.waitForFunction(() => (
    (window.__appsHostCalls ?? []).some((call) => (
      call.kind === 'notifyIntrinsicHeight'
      && Number.isFinite(call.args?.height)
      && call.args.height > 0
    ))
  ));
}

async function assertCompactInline(page, rootSelector, terminalSelector, label) {
  await waitForIntrinsicHeight(page);
  await page.waitForTimeout(80);
  const metrics = await page.locator(rootSelector).evaluate((root, leafSelector) => {
    const rootStyle = getComputedStyle(root);
    const rootRect = root.getBoundingClientRect();
    const leaf = root.querySelector(leafSelector);
    const leafRect = leaf?.getBoundingClientRect() ?? null;
    const clippedContainers = [root, ...root.querySelectorAll('*')]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          className: String(element.className),
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          meaningful: Boolean(
            element.textContent?.trim()
            || element.matches('button, a, summary')
            || element.querySelector('button, a, summary'),
          ),
        };
      })
      .filter((entry) => (
        entry.meaningful
        && ['auto', 'scroll', 'hidden', 'clip'].includes(entry.overflowY)
        // Browser line-box rounding can add a few non-painted scrollHeight
        // pixels to overflow-hidden text. Eight pixels still catches a cut
        // line or control without treating font metrics as clipped content.
        && entry.scrollHeight > entry.clientHeight + 8
      ));

    return {
      root: {
        inlineMaxHeight: root.style.maxHeight,
        maxHeight: rootStyle.maxHeight,
        overflowY: rootStyle.overflowY,
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        bottom: rootRect.bottom,
      },
      leafBottom: leafRect?.bottom ?? null,
      clippedContainers,
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      viewportHeight: innerHeight,
    };
  }, terminalSelector);

  assert.equal(metrics.root.inlineMaxHeight, '', `${label}: root copied host maxHeight`);
  assert.equal(metrics.root.maxHeight, 'none', `${label}: root imposed max-height`);
  assert.notEqual(metrics.root.overflowY, 'auto', `${label}: root became an inner scroller`);
  assert.notEqual(metrics.root.overflowY, 'scroll', `${label}: root became an inner scroller`);
  assert.ok(
    metrics.root.scrollHeight <= metrics.root.clientHeight + 1,
    `${label}: content exceeds the intrinsic root (${JSON.stringify(metrics.root)})`,
  );
  assert.deepEqual(
    metrics.clippedContainers,
    [],
    `${label}: descendant content is trapped in a clipped viewport`,
  );
  assert.ok(metrics.leafBottom !== null, `${label}: missing terminal content ${terminalSelector}`);
  assert.ok(
    metrics.leafBottom <= metrics.root.bottom + 1,
    `${label}: terminal content extends below the renderer root`,
  );
  assert.ok(
    metrics.document.scrollWidth <= metrics.document.clientWidth + 1,
    `${label}: renderer overflows horizontally`,
  );
  assert.ok(
    metrics.document.scrollHeight <= metrics.viewportHeight + 1,
    `${label}: compact inline output exceeds the fixture viewport`,
  );
}

async function assertSingleModeRequest(page, mode, label) {
  assert.deepEqual(
    await presentationCalls(page),
    [{ kind: 'requestDisplayMode', mode }],
    `${label}: presentation control crossed another host boundary`,
  );
}

test('governed receipts and passkey checks use Apps SDK display modes without inner clipping', async (t) => {
  const surfaces = await buildRendererGallerySurfaces();
  const byId = new Map(surfaces.map((surface) => [surface.id, surface]));
  for (const id of ['governed-action', 'governed-history', 'passkey-probe']) {
    assert.ok(byId.has(id), `Missing current renderer fixture: ${id}`);
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
  t.after(async () => {
    await browser.close();
    await vite.close();
  });

  await t.test('governed action expands from a bounded summary to complete evidence', async () => {
    const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
    const { page, pageErrors } = await openSurface({
      browser,
      baseUrl,
      surface: byId.get('governed-action'),
      output: fixture.status,
      theme: 'dark',
    });

    await page.locator('.dx-action, .dx-widget__state').first().waitFor();
    const expand = page.getByRole('button', { name: 'View full receipt', exact: true });
    assert.equal(
      await expand.count(),
      1,
      `governed action did not expose its compact control: ${await page.locator('body').innerText()}`,
    );
    await page.getByText('$250', { exact: true }).waitFor();
    await page.getByText('Confirmed on Solana with successful execution.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Authority', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /approve/i }).count(), 0);
    await assertCompactInline(page, '.dx-widget', '.dx-action__expand', 'governed action inline');

    await resetHostCalls(page);
    await expand.click();
    await waitForMode(page, '.dx-widget', 'fullscreen');
    await page.getByRole('heading', { name: 'Authority', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Execution', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Asset', exact: true }).waitFor();
    await page.getByText('Receipt details', { exact: true }).click();
    const receipt = page.locator('.dx-action__receipt-grid');
    await receipt.getByText('Read-only', { exact: true }).waitFor();
    await receipt.getByText('Forbidden', { exact: true }).waitFor();
    await assertSingleModeRequest(page, 'fullscreen', 'governed action expand');
    assert.equal(await page.getByRole('button', { name: /approve/i }).count(), 0);
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('history grants full receipt detail and back restores inline row focus', async () => {
    const { page, pageErrors } = await openSurface({
      browser,
      baseUrl,
      surface: byId.get('governed-history'),
      theme: 'light',
    });

    const row = page.getByRole('button', {
      name: 'Open details for 1.25 shares of Tesla, Inc. bought',
      exact: true,
    });
    await row.waitFor();
    await assertCompactInline(page, '.dx-widget', '.dx-history__row', 'governed history inline');

    await row.focus();
    await resetHostCalls(page);
    await row.press('Enter');
    await waitForMode(page, '.dx-widget', 'fullscreen');
    await page.getByRole('heading', { name: '1.25 shares of Tesla, Inc. bought', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Authority', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Execution', exact: true }).waitFor();
    await page.getByText('Receipt details', { exact: true }).waitFor();
    await assertSingleModeRequest(page, 'fullscreen', 'governed history receipt');

    const back = page.getByRole('button', { name: 'Back to history', exact: true });
    await resetHostCalls(page);
    await back.click();
    await waitForMode(page, '.dx-widget', 'inline');
    const restoredRow = page.getByRole('button', {
      name: 'Open details for 1.25 shares of Tesla, Inc. bought',
      exact: true,
    });
    await restoredRow.waitFor();
    assert.equal(
      await restoredRow.evaluate((element) => document.activeElement === element),
      true,
      'Back to history must restore focus to the row that opened the receipt',
    );
    await assertSingleModeRequest(page, 'inline', 'governed history back');
    assert.deepEqual(pageErrors, []);
    await page.close();
  });

  await t.test('passkey probe keeps one ceremony inline and reveals all diagnostics in fullscreen', async () => {
    const { page, pageErrors } = await openSurface({
      browser,
      baseUrl,
      surface: byId.get('passkey-probe'),
      theme: 'dark',
    });

    const openAll = page.getByRole('button', { name: 'Open all checks', exact: true });
    await openAll.waitFor();
    await page.getByRole('heading', { name: 'WebAuthn ceremony', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Scripted popup', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Runtime', exact: true }).count(), 0);
    await assertCompactInline(
      page,
      '.passkey-probe-container',
      '.passkey-probe-test',
      'passkey probe inline',
    );

    await openAll.focus();
    await resetHostCalls(page);
    await openAll.click();
    await waitForMode(page, '.passkey-probe-container', 'fullscreen');
    await page.getByRole('heading', { name: 'Scripted popup', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Direct anchor', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Host-mediated link', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Runtime', exact: true }).waitFor();
    await assertSingleModeRequest(page, 'fullscreen', 'passkey probe expand');

    const returnInline = page.getByRole('button', { name: 'Return to inline', exact: true });
    assert.equal(
      await returnInline.evaluate((element) => document.activeElement === element),
      true,
      'The display-mode control must retain focus when the host grants fullscreen',
    );
    await resetHostCalls(page);
    await returnInline.click();
    await waitForMode(page, '.passkey-probe-container', 'inline');
    const restoredControl = page.getByRole('button', { name: 'Open all checks', exact: true });
    await restoredControl.waitFor();
    assert.equal(
      await restoredControl.evaluate((element) => document.activeElement === element),
      true,
      'Returning inline must keep focus on the same presentation control',
    );
    assert.equal(await page.getByRole('heading', { name: 'Scripted popup', exact: true }).count(), 0);
    await assertSingleModeRequest(page, 'inline', 'passkey probe return');
    assert.deepEqual(pageErrors, []);
    await page.close();
  });
});
