import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { compactPortfolioHoldingV3 } from '../lib/portfolio-read-v3-contract.mjs';

// Exercise the committed build through the same tool-output bridge used by ChatGPT.
test('built portfolio shows held stocks under both API identities', async t => {
  const old = JSON.parse(await readFile(new URL('./fixtures/portfolio-selected-v3-api.json', import.meta.url))).valid.retired_priced_detail;
  const current = JSON.parse(await readFile(new URL('./fixtures/portfolio-stock-registry-v3-api.json', import.meta.url)));
  const server = await preview({ configFile: 'apps-sdk/vite.config.ts', preview: { host: '127.0.0.1', port: 0, open: false } });
  t.after(() => new Promise(resolve => server.httpServer.close(resolve)));
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
  t.after(() => browser.close());
  const screenshotDir = new URL('../output/playwright/portfolio-stock-registry/', import.meta.url);
  await mkdir(screenshotDir, { recursive: true });

  for (const original of [old, current]) {
    for (const width of [1180, 390]) {
      for (const view of ['summary', 'detail']) {
        const wire = structuredClone(original);
        if (view === 'summary') {
          Object.assign(wire.portfolio.selection, { view, query: null, mint: null, tokenAccount: null, limit: 5 });
          wire.portfolio.holdings = wire.card.holdings.map(compactPortfolioHoldingV3);
        }
        const source = wire.card.holdings[0].identity.source;
        await t.test(`${source} ${view} at ${width}px`, async () => {
          const page = await browser.newPage({ viewport: { width, height: 980 } });
          await page.clock.setFixedTime(new Date(Date.parse(wire.portfolio.observedAt) + 1));
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          // Fixture-only browser. No account, network API, or trading calls.
          await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue() : route.abort());
          await page.addInitScript(({ portfolio, card }) => {
            window.__portfolioCalls = [];
            window.openai = {
              theme: 'light', locale: 'en-US', displayMode: 'inline', maxHeight: 900,
              toolInput: {}, toolOutput: { portfolio_status: 'ready', mode: 'portfolio_ready', user_bound: true, portfolio },
              toolResponseMetadata: { portfolioCard: card },
              userAgent: { device: { type: window.innerWidth < 520 ? 'mobile' : 'desktop' } },
              safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
              notifyIntrinsicHeight() {},
              async callTool(...args) { window.__portfolioCalls.push(args); },
            };
          }, wire);
          await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dexter-portfolio.html`);
          await page.getByTestId('portfolio-selected').waitFor();
          const card = page.getByTestId('portfolio-selected');
          const text = await card.innerText();
          assert.match(text, /Stock/);
          assert.match(text, /SpaceX/);
          assert.match(text, /SPCX/);
          assert.doesNotMatch(text, /Crypto/);
          await page.screenshot({ path: new URL(`${source}-${view}-${width}.png`, screenshotDir).pathname, fullPage: true });
          if (view === 'detail') {
            await page.getByTestId('asset-diagnostics').locator('summary').click();
            const details = await card.innerText();
            assert.match(details, /Asset class\s+Stock/);
            assert.match(details, /Identity observed at\s+Sep 24, 2026/);
            assert.match(details, /Dexter stock registry/);
            assert.doesNotMatch(details, /Identity verification details|Registry identity digest|Release digest/);
            await page.getByText('Identity observed at', { exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: new URL(`${source}-identity-${width}.png`, screenshotDir).pathname, fullPage: true });
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
          assert.deepEqual(await page.evaluate(() => window.__portfolioCalls), []);
          assert.deepEqual(errors, []);
          await page.close();
        });
      }
    }
  }
});
