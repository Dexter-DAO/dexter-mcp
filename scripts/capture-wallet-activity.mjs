// Local, read-only capture of the full wallet entry using a V4 response file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[4]) throw new Error('Supply paths to captured activity pages, wallet status, and portfolio.');
const pages = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const status = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
const portfolio = JSON.parse(await fs.readFile(process.argv[4], 'utf8')).portfolio;
if (!Array.isArray(pages) || !pages[0]?.items) throw new Error('Expected V4 pages.');
if (status.vault?.receiveAddress !== pages[0].walletAddress || portfolio?.walletAddress !== pages[0].walletAddress) throw new Error('Capture inputs must belong to the same receive wallet.');
const out = path.join(root, 'output/playwright');
await fs.mkdir(out, { recursive: true });
const vite = await createServer({ configFile: path.join(root, 'apps-sdk/vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await vite.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1040, height: mobile ? 844 : 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const output = {
      mode: 'vault_ready', user_bound: true, network: 'solana', networkName: 'Solana',
      address: pages[0].walletAddress, solanaAddress: pages[0].walletAddress,
      balances: { usdc: Number(status.onchain.usdcAtomic) / 1e6, availableAtomic: status.onchain.usdcAtomic },
      personhood: { verified: status.onchain.isVerified === true },
      vault: { isActivated: status.vault.isActivated, pendingVoucherCount: status.onchain.pendingVoucherCount, withdrawalBlocked: status.onchain.withdrawalBlocked },
      activityPage: pages[0],
    };
    await page.route('https://open.dexter.cash/widget/wallet/**', async (route) => {
      if (route.request().url().endsWith('/refresh')) return route.fulfill({ status: 503, json: { ok: false } });
      const cursor = route.request().postDataJSON()?.cursor;
      const index = cursor ? pages.findIndex((prior) => prior.nextCursor === cursor) + 1 : 0;
      await route.fulfill({ json: { ok: true, activityPage: pages[index] ?? null } });
    });
    await page.addInitScript(({ output, portfolio, mobile }) => {
      window.openai = { theme: 'light', locale: 'en-US', displayMode: 'inline', maxHeight: 900,
        userAgent: { device: { type: mobile ? 'mobile' : 'desktop' }, capabilities: { touch: mobile, hover: !mobile } },
        toolOutput: output, toolInput: {}, toolResponseMetadata: { dexterWalletToken: 'local-capture-token', dexterPortfolio: portfolio },
        openExternal() {}, notifyIntrinsicHeight() {},
      };
    }, { output, portfolio, mobile });
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/dexter-wallet.html`);
    await page.getByRole('button', { name: 'Activity', exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, `wallet-real-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.dxw-act-row') && !document.querySelector('.dxw-activity-refresh-icon')?.disabled);
    await page.mouse.move(0, 0);
    const images = () => page.locator('.dxw-activity-mark img').evaluateAll((images) => Promise.all(images.map((image) => image.complete ? null : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; setTimeout(resolve, 5000); }))));
    await images();
    await page.screenshot({ path: path.join(out, `activity-real-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await page.locator('.dxw-activity-expand').first().click();
    await page.screenshot({ path: path.join(out, `activity-real-receipt-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await page.locator('.dxw-activity-expand').first().click();
    let currentPage = 0;
    for (const [name, predicate] of [['services', (item) => item.service?.publicUrl], ['earning', (item) => item.kind.startsWith('yield_')]]) {
      const itemIndex = pages[0].items.findIndex(predicate);
      if (itemIndex < 0) continue;
      const targetPage = Math.floor(itemIndex / 5);
      while (currentPage < targetPage) { await page.getByRole('button', { name: 'Next', exact: true }).click(); currentPage++; }
      while (currentPage > targetPage) { await page.getByRole('button', { name: 'Previous', exact: true }).click(); currentPage--; }
      await images();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: path.join(out, `activity-real-${name}-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
      if (name === 'services') {
        const toggle = page.getByRole('button', { name: `Show receipt for ${pages[0].items[itemIndex].title}`, exact: true });
        await toggle.click();
        await page.mouse.move(0, 0);
        await page.screenshot({ path: path.join(out, `activity-real-service-receipt-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
        await page.getByRole('button', { name: `Hide receipt for ${pages[0].items[itemIndex].title}`, exact: true }).click();
      }
    }
    console.log(JSON.stringify({ device: mobile ? 'mobile' : 'desktop', horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      font: await page.locator('.dxw-act-main').first().evaluate((el) => getComputedStyle(el).fontFamily),
      logosLoaded: await page.locator('.dxw-activity-mark img').evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length) }));
    await context.close();
  }
} finally { await browser.close(); await vite.close(); }
