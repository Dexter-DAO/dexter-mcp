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
      initial.nextCursor = 'opaque-older';
      initial.items.push({ ...initial.items[0], id: 'trade:fixture', kind: 'trade', title: 'Bought SPCX', subtitle: 'Stock purchase', amount: { ...initial.items[0].amount, atomic: '4426', symbol: 'SPCX' }, details: [{ label: 'Paid', value: '0.09 USDC' }] });
      for (let i = 0; i < 4; i += 1) initial.items.push({ ...initial.items[0], id: `deposit:${i}`, kind: 'deposit', title: 'USDC received', subtitle: null, amount: { ...initial.items[0].amount, atomic: '1000000' }, actor: { kind: 'external', name: null, agentId: null }, details: [] });
      const requests = [];
      let fail = false;
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
      assert.equal(await page.getByText('−0.001 USDC', { exact: true }).count(), 1);
      await page.locator('.dxw-activity-identity').first().click();
      await page.locator('.dxw-activity-value').first().click();
      assert.deepEqual(await page.evaluate(() => window.__openedLinks), ['https://indexter.cash/services/r-fixture', 'https://solscan.io/tx/fixture']);
      await page.getByRole('button', { name: 'Show receipt for SYRAA.fun market analysis', exact: true }).click();
      await page.getByText('Response received (HTTP 200)', { exact: true }).waitFor();
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
