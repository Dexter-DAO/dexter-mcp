import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { walletOutput } from './fixtures/wallet-portfolio-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('unified wallet activity shows receipts, exact amounts, paging and read failures on desktop and mobile', async (t) => {
  const vite = await createServer({ configFile: path.join(root, 'apps-sdk/vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await vite.listen();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await vite.close(); });
  const address = vite.httpServer.address();
  const widgetUrl = `http://127.0.0.1:${address.port}/dexter-wallet.html`;
  await mkdir(path.join(root, 'output/playwright'), { recursive: true });
  for (const mobile of [false, true]) {
    await t.test(mobile ? 'mobile' : 'desktop', async () => {
      const context = await browser.newContext({ viewport: { width: mobile ? 375 : 960, height: mobile ? 812 : 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const output = walletOutput();
      const initial = output.activityPage;
      initial.items[0].service.publicUrl = 'https://indexter.cash/services/r-fixture';
      initial.items[0].service.logoUrl = 'https://provider.example/missing-logo.png';
      initial.items[0].service.description = 'Market research and source analysis for the requested company, including recent developments and relevant context.';
      initial.items[0].actor.name = 'Grok Bot';
      initial.items[0].details = [{ label: 'Delivery', value: 'Response unavailable' }, { label: 'Seller response', value: '503' }];
      initial.items[0].links.push({ label: 'View Base transaction', kind: 'transaction', url: 'https://basescan.org/tx/fixture' });
      initial.nextCursor = 'opaque-older';
      initial.items.push({ ...initial.items[0], id: 'trade:fixture', kind: 'trade', title: 'Bought SPCX', subtitle: 'Stock purchase', amount: { ...initial.items[0].amount, atomic: '4426', symbol: 'SPCX' }, details: [{ label: 'Paid', value: '0.09 USDC' }] });
      for (let i = 0; i < 4; i += 1) initial.items.push({ ...initial.items[0], id: `deposit:${i}`, kind: 'deposit', title: 'USDC received', subtitle: null, amount: { ...initial.items[0].amount, atomic: '1000000' }, actor: { kind: 'external', name: null, agentId: null }, details: [] });
      const requests = [];
      let fail = false;
      await page.route('https://api.dexter.cash/api/img?url=https%3A%2F%2Fprovider.example%2Fmissing-logo.png', (route) => route.fulfill({ status: 404, body: '' }));
      await page.route('https://open.dexter.cash/widget/wallet/**', async (route) => {
        const body = route.request().postDataJSON();
        requests.push({ path: new URL(route.request().url()).pathname, body });
        if (route.request().url().endsWith('/refresh')) return route.fulfill({ json: { ok: true, usdcAtomic: '25000000' } });
        if (fail) return route.fulfill({ status: 502, json: { ok: false } });
        const activityPage = body.cursor ? { ...initial, nextCursor: null, items: [{ ...initial.items[0], id: 'refund:older', title: 'Purchase refunded', kind: 'refund', amount: { ...initial.items[0].amount, atomic: '1000' } }] } : initial;
        return route.fulfill({ json: { ok: true, activityPage } });
      });
      await page.addInitScript(({ output, mobile }) => {
        window.__openedLinks = [];
        window.openai = {
          theme: 'light', locale: 'en-US', displayMode: 'inline', maxHeight: mobile ? 760 : 850,
          userAgent: { device: { type: mobile ? 'mobile' : 'desktop' }, capabilities: { touch: mobile, hover: !mobile } },
          toolInput: {}, toolOutput: output, toolResponseMetadata: { dexterWalletToken: 'fixture-token' },
          openExternal({ href }) { window.__openedLinks.push(href); },
          notifyIntrinsicHeight() {},
        };
      }, { output, mobile });
      await page.goto(widgetUrl);
      await page.getByRole('button', { name: 'Activity', exact: true }).click();
      await page.getByRole('button', { name: 'Refresh activity', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.dxw-activity-refresh-icon')?.disabled);
      assert.equal(await page.getByText('−$0.001', { exact: true }).count(), 1);
      assert.equal(await page.locator('.dxw-activity-value').first().getAttribute('title'), '−0.001 USDC. View transaction');
      assert.equal(await page.locator('.dxw-act-amt').first().getAttribute('data-cash-direction'), 'outgoing');
      assert.equal(await page.locator('.dxw-act-amt[data-cash-direction="incoming"]').count(), 3);
      assert.match(await page.locator('.dxw-activity-actor img').first().getAttribute('src'), /grok-bot-official\.svg/);
      await page.locator('.dxw-activity-mark img').first().waitFor();
      await page.waitForFunction(() => document.querySelector('.dxw-activity-mark img')?.getAttribute('src') === 'https://dexter.cash/opendexter-clients/dexter-logo-main.svg');
      const alignment = await page.locator('.dxw-activity-entry').first().evaluate((entry) => {
        const top = (selector) => entry.querySelector(selector).getBoundingClientRect().top;
        const fallback = getComputedStyle(entry.querySelector('.dxw-activity-fallback'));
        return { title: top('.dxw-act-main'), amount: top('.dxw-act-amt'), logo: top('.dxw-activity-mark'), filter: fallback.filter, opacity: fallback.opacity };
      });
      assert.ok(Math.abs(alignment.title - alignment.amount) <= 2);
      assert.equal(alignment.title, alignment.logo);
      assert.equal(alignment.filter, 'grayscale(1)');
      assert.equal(alignment.opacity, '0.45');
      await page.locator('.dxw-activity-identity').first().click();
      await page.locator('.dxw-activity-value').first().click();
      assert.deepEqual(await page.evaluate(() => window.__openedLinks), ['https://indexter.cash/services/r-fixture', 'https://solscan.io/tx/fixture']);
      await page.getByRole('button', { name: 'Show receipt for SYRAA.fun market analysis', exact: true }).click();
      await page.getByText('Response unavailable (HTTP 503)', { exact: true }).waitFor();
      assert.equal(await page.locator('.dxw-activity-details dl').count(), 0);
      assert.equal(await page.getByText('View transaction', { exact: true }).count(), 0);
      assert.equal(await page.getByText('View Base transaction', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Seller transaction on Base', exact: true }).click();
      assert.equal((await page.evaluate(() => window.__openedLinks)).at(-1), 'https://basescan.org/tx/fixture');
      assert.equal(await page.getByRole('navigation', { name: 'Activity pages' }).getByText('1–5', { exact: true }).count(), 1);
      await page.locator('.dxw-widget').screenshot({ path: path.join(root, `output/playwright/activity-${mobile ? 'mobile' : 'desktop'}.png`) });
      const overflow = await page.locator('.dxw-widget').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Load older activity', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.dxw-activity-refresh-icon')?.disabled);
      await page.getByText('Purchase refunded', { exact: true }).waitFor();
      assert.ok(requests.some(({ body }) => body.cursor === 'opaque-older'));
      fail = true;
      await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
      await page.getByText('Activity could not be loaded. Previously loaded entries are shown.').waitFor();
      await context.close();
    });
  }
});
