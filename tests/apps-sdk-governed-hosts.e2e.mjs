import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const UI_ROOT = path.join(REPO_ROOT, 'apps-sdk', 'ui');
const SCREENSHOT_DIR = '/tmp/dexter-governed-host-harness';

function preparedSendFixture() {
  const fixture = dynamicStockV2Fixture(
    'tesla',
    '019f981c-9215-7141-84f2-d89ffe9cbece',
  ).prepared;
  return {
    ...fixture,
    business: {
      ...fixture.business,
      action: 'send',
      assetId: 'usdc',
      requestedCompanyQuery: undefined,
      amountAtomic: '2500000',
      destinationOwner: '11111111111111111111111111111111',
      protocolId: 'spl-transfer',
    },
    approval: {
      status: 'owner-approval-required',
      reasons: ['destination_requires_owner'],
    },
    stockRuntime: undefined,
    preview: {
      ...fixture.preview,
      action: 'send',
      assetId: 'usdc',
      symbol: 'USDC',
      amountAtomic: '2500000',
      maximumInputAmountAtomic: '2500000',
      requestedMaximumSpendAtomic: null,
      requestedShareQuantity: null,
      expectedShareQuantity: null,
      minimumShareQuantity: null,
      shareQuantityUnit: null,
      shareQuantitySemantics: null,
      overfillPossible: false,
      stockSelection: undefined,
      shareQuantityConversion: null,
      destinationOwner: '11111111111111111111111111111111',
      productIdentity: {
        ...fixture.preview.productIdentity,
        assetId: 'usdc',
        assetClass: 'cash',
        companyName: null,
        productName: 'USD Coin',
        symbol: 'USDC',
        providerName: null,
        legalIssuerName: null,
        issuer: 'Circle',
        decimals: 6,
      },
    },
  };
}

function ambiguousFixture() {
  const status = dynamicStockV2Fixture(
    'nvidia',
    '029f981c-9215-7141-84f2-d89ffe9cbece',
  ).status;
  return {
    ...status,
    status: 'ambiguous',
    ledgerState: 'ambiguous',
    confirmationCommitment: null,
    confirmationSlot: null,
    executionSucceeded: null,
    landingProof: false,
    settlementFinalized: false,
    reconciliationRequired: true,
    canReconcile: true,
    receiptPhases: ['dispatch_fenced', 'uncertain'],
  };
}

function installChatGptHost(page, { output, input = {}, theme, maxHeight }) {
  return page.addInitScript(({ toolOutput, toolInput, hostTheme, hostMaxHeight }) => {
    window.__hostCalls = [];
    window.openai = {
      theme: hostTheme,
      locale: 'en-US',
      maxHeight: hostMaxHeight,
      displayMode: 'inline',
      userAgent: {
        device: { type: window.innerWidth <= 520 ? 'mobile' : 'desktop' },
        capabilities: { hover: window.innerWidth > 520, touch: window.innerWidth <= 520 },
      },
      safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
      toolInput,
      toolOutput,
      toolResponseMetadata: {},
      openExternal(args) {
        window.__hostCalls.push({ kind: 'openExternal', args });
      },
      notifyIntrinsicHeight(args) {
        window.__hostCalls.push({ kind: 'notifyIntrinsicHeight', args });
      },
    };
  }, {
    toolOutput: output,
    toolInput: input,
    hostTheme: theme,
    hostMaxHeight: maxHeight,
  });
}

async function assertContinuousCanvas(page) {
  const metrics = await page.locator('.dx-action').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert.equal(metrics.borderTopWidth, '0px');
  assert.equal(metrics.boxShadow, 'none');
  assert.equal(metrics.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.ok(metrics.overflowWidth <= 0, `renderer overflowed horizontally by ${metrics.overflowWidth}px`);
  assert.equal(await page.locator('.dx-widget__eyebrow').count(), 0);
  assert.equal(await page.locator('.dx-stock-card').count(), 0);
}

test('governed action and history render as one safe host-owned canvas', async (t) => {
  const server = await createServer({
    root: UI_ROOT,
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  t.after(async () => server.close());

  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  t.after(async () => browser.close());

  if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
  }

  await t.test('prepared stock Buy shows exact terms without a transaction claim', async () => {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const fixture = dynamicStockV2Fixture(
      'tesla',
      '019f981c-9215-7141-84f2-d89ffe9cbece',
    );
    await installChatGptHost(page, {
      output: fixture.prepared,
      input: fixture.input,
      theme: 'light',
      maxHeight: 860,
    });
    await page.goto(`${baseUrl}/governed-action.html`);

    await page.getByRole('heading', { name: 'Buy 1.25 shares of Tesla, Inc.' }).waitFor();
    await page.getByText('Nothing has been signed or submitted.', { exact: false }).waitFor();
    await page.getByText('$250', { exact: true }).waitFor();
    await page.getByText('Not required', { exact: true }).waitFor();
    await page.getByText('Quote details', { exact: true }).click();
    await page.getByText('Calculated at execution', { exact: true }).waitFor();
    await page.getByText('Quote details', { exact: true }).click();
    await assertContinuousCanvas(page);
    assert.deepEqual(errors, []);

    if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'prepared-buy-light-desktop.png'),
        fullPage: true,
      });
    }
    await page.close();
  });

  await t.test('prepared Send keeps approval in Dexter Wallet', async () => {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await installChatGptHost(page, {
      output: preparedSendFixture(),
      input: {
        action: 'send',
        assetId: 'usdc',
        amountAtomic: '2500000',
        destinationOwner: '11111111111111111111111111111111',
      },
      theme: 'dark',
      maxHeight: 760,
    });
    await page.goto(`${baseUrl}/governed-action.html`);

    await page.getByRole('heading', { name: 'Send 2.5 USDC to 11111...11111' }).waitFor();
    await page.getByText('Pending in Dexter Wallet', { exact: true }).waitFor();
    await page.getByText('This view cannot grant it or execute the action.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: /approve/i }).count(), 0);
    assert.equal(
      await page.locator('.dx-widget').evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(23, 23, 21)',
    );
    await assertContinuousCanvas(page);

    if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'prepared-send-dark-tablet.png'),
        fullPage: true,
      });
    }
    await page.close();
  });

  await t.test('ambiguous execution names the duplicate-action boundary on mobile', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await installChatGptHost(page, {
      output: ambiguousFixture(),
      theme: 'dark',
      maxHeight: 700,
    });
    await page.goto(`${baseUrl}/governed-action.html`);

    await page.getByText('Outcome unknown', { exact: true }).waitFor();
    await page.getByText('Do not execute again. Reconcile this same intent and attempt only.', { exact: true }).waitFor();
    await assertContinuousCanvas(page);
    const interactiveHeights = await page.locator('button, summary').evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height));
    assert.ok(interactiveHeights.every((height) => height >= 40));

    if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'ambiguous-dark-mobile.png'),
        fullPage: true,
      });
    }
    await page.close();
  });

  await t.test('wallet history moves from scan list to the same receipt detail', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const confirmed = dynamicStockV2Fixture(
      'tesla',
      '019f981c-9215-7141-84f2-d89ffe9cbece',
    ).status;
    const ambiguous = ambiguousFixture();
    await installChatGptHost(page, {
      output: {
        namespace: 'dexter-governed-transaction-history/v1',
        items: [confirmed, ambiguous],
        nextCursor: 'opaque-next-page',
      },
      theme: 'light',
      maxHeight: 700,
    });
    await page.goto(`${baseUrl}/governed-history.html`);

    await page.getByRole('heading', { name: 'Wallet history' }).waitFor();
    assert.equal(await page.locator('.dx-history__row').count(), 2);
    const rowHeights = await page.locator('.dx-history__row').evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height));
    assert.ok(rowHeights.every((height) => height >= 40));
    await page.locator('.dx-history__row').first().click();
    await page.getByRole('heading', { name: '1.25 shares of Tesla, Inc. bought' }).waitFor();
    await page.getByText('Confirmed on Solana with successful execution.', { exact: true }).waitFor();
    await page.getByText('Receipt details', { exact: true }).click();
    await page.getByText('Status read', { exact: true }).first().waitFor();
    await page.getByText('Read-only', { exact: true }).waitFor();
    await page.getByText('Forbidden', { exact: true }).waitFor();
    await page.getByText('Receipt details', { exact: true }).click();
    if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'history-detail-light-mobile.png'),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Back to history' }).click();
    await page.getByRole('heading', { name: 'Wallet history' }).waitFor();
    await page.getByText('More history is available on the next page.', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

    if (process.env.DEXTER_GOVERNED_SCREENSHOTS === '1') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'history-light-mobile.png'),
        fullPage: true,
      });
    }
    await page.close();
  });

  await t.test('loading views honor a constrained host height', async () => {
    for (const entrypoint of ['governed-action.html', 'governed-history.html']) {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
      await installChatGptHost(page, {
        output: null,
        theme: 'light',
        maxHeight: 180,
      });
      await page.goto(`${baseUrl}/${entrypoint}`);

      const metrics = await page.locator('.dx-widget').evaluate((element) => ({
        clientHeight: element.clientHeight,
        maxHeight: getComputedStyle(element).maxHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      assert.equal(metrics.maxHeight, '180px');
      assert.equal(metrics.overflowY, 'auto');
      assert.ok(metrics.clientHeight <= 180);
      await page.close();
    }
  });
});
