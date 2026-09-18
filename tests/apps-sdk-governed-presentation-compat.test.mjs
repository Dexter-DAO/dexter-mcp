import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  normalizeGovernedAction,
  normalizeGovernedHistory,
  selectGovernedWidgetResult,
} from '../apps-sdk/ui/src/components/governed-action/governed-action-model.ts';
import { presentGovernedAgentResult } from '../lib/governed-agent-presentation.mjs';
import { buildGovernedAssetFailure } from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
const input = { intentId: fixture.status.intentId, operationId: OPERATION_ID };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function failure(operation) {
  return buildGovernedAssetFailure({
    operation, input, code: 'governed_backend_transport_failed',
  }).body;
}

test('additive presentation preserves historical widget evidence for every operation', () => {
  const contradictory = { summary: 'Purchase finalized.', phase: 'completed', actual: { available: true } };
  for (const operation of ['prepare', 'execute', 'status', 'reconcile', 'history']) {
    const body = fixture[operation === 'prepare' ? 'prepared' : operation];
    const augmented = { ...body, presentation: contradictory };
    const normalize = operation === 'history' ? normalizeGovernedHistory : normalizeGovernedAction;
    const metadata = { 'dexter/governedWidgetResult': failure('execute') };
    assert.equal(selectGovernedWidgetResult(body, null), body, operation);
    assert.equal(selectGovernedWidgetResult(augmented, metadata), augmented, operation);
    assert.deepEqual(normalize(augmented), normalize(body), operation);
  }
  const prepared = normalizeGovernedAction({ ...fixture.prepared, presentation: contradictory });
  assert.equal(prepared.stage, 'prepared');
  assert.equal(prepared.transactionSignature, null);
  assert.equal(prepared.executionSucceeded, null);
});

test('ordinary errors retain full metadata across old and declared presentation envelopes', () => {
  for (const operation of ['prepare', 'execute', 'status', 'reconcile', 'history']) {
    const body = failure(operation);
    const projection = presentGovernedAgentResult(body);
    const metadata = { 'dexter/governedWidgetResult': body };
    for (const output of [null, projection, { presentation: projection }]) {
      const selected = selectGovernedWidgetResult(output, metadata);
      assert.equal(selected, body, operation);
      assert.deepEqual(normalizeGovernedAction(selected, input), normalizeGovernedAction(body, input));
    }
    assert.equal(selectGovernedWidgetResult(body, metadata), body);
    if (operation === 'execute' || operation === 'reconcile') {
      const model = normalizeGovernedAction(selectGovernedWidgetResult({ presentation: projection }, metadata), input);
      assert.equal(model.stage, 'pending', operation);
      assert.equal(model.intentId, input.intentId, operation);
      assert.equal(model.requestId, operation === 'execute' ? OPERATION_ID : null, operation);
      assert.match(model.recovery.sentence, /same intent/);
      assert.equal(model.transactionSignature, null, operation);
    }
  }
});

test('raw landed failure and incomplete success evidence cannot be replaced by presentation', () => {
  for (const executionSucceeded of [false, null]) {
    const status = { ...fixture.status, executionSucceeded,
      presentation: { summary: 'Purchase confirmed.', phase: 'completed' } };
    const selected = selectGovernedWidgetResult(status, {
      'dexter/governedWidgetResult': fixture.status,
    });
    assert.equal(selected, status);
    assert.notEqual(normalizeGovernedAction(selected).stage, 'success');
    assert.equal(normalizeGovernedAction(selected).intentId, fixture.status.intentId);
  }
  assert.equal(selectGovernedWidgetResult(null, null), null);
  assert.equal(selectGovernedWidgetResult(undefined, { 'dexter/governedWidgetResult': [] }), null);
  assert.equal(normalizeGovernedAction(selectGovernedWidgetResult({ presentation: {} }, {})), null);
  assert.equal(normalizeGovernedHistory(selectGovernedWidgetResult({ presentation: {} }, {})), null);
});

test('declared error envelopes preserve phone and desktop rendering without starting actions', async (t) => {
  const server = await createServer({
    root: path.join(root, 'apps-sdk', 'ui'), configFile: false, plugins: [react()],
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  });
  await server.listen();
  t.after(async () => server.close());
  const address = server.httpServer.address();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  t.after(async () => browser.close());
  const screenshotDir = process.env.DEXTER_GOVERNED_PRESENTATION_SCREENSHOTS;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

  for (const viewport of [{ width: 375, height: 812 }, { width: 1180, height: 900 }]) {
    for (const operation of ['prepare', 'execute', 'history']) {
      await t.test(`${operation} at ${viewport.width}px`, async () => {
        const body = failure(operation);
        const presentation = presentGovernedAgentResult(body);
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(({ output, metadata, toolInput }) => {
          window.__presentationCalls = [];
          window.openai = {
            theme: 'light', locale: 'en-US', displayMode: 'inline', maxHeight: 900,
            toolInput, toolOutput: output, toolResponseMetadata: metadata,
            userAgent: { device: { type: window.innerWidth < 520 ? 'mobile' : 'desktop' } },
            safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
            notifyIntrinsicHeight() {},
            async callTool(...args) { window.__presentationCalls.push(args); },
          };
        }, { output: { presentation }, metadata: { 'dexter/governedWidgetResult': body }, toolInput: input });
        await page.goto(`http://127.0.0.1:${address.port}/governed-${operation === 'history' ? 'history' : 'action'}.html`);
        if (operation === 'history') {
          await page.getByText('Wallet history unavailable', { exact: true }).waitFor();
        } else {
          await page.locator(`.dx-action[data-stage="${operation === 'execute' ? 'pending' : 'failure'}"]`).waitFor();
          if (operation === 'execute') {
            await page.getByText('Outcome unknown', { exact: true }).waitFor();
            await page.getByText('Do not execute again. Inspect and reconcile this same intent only.', { exact: true }).waitFor();
          }
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        assert.deepEqual(await page.evaluate(() => window.__presentationCalls), []);
        assert.deepEqual(errors, []);
        if (screenshotDir) await page.screenshot({
          path: path.join(screenshotDir, `${operation}-${viewport.width}.png`), fullPage: true,
        });
        await page.close();
      });
    }
  }
});
