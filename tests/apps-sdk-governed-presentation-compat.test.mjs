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
import {
  buildGovernedAssetFailure,
  buildGovernedAssetToolResult,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { receiptFixture, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
const fixture = dynamicStockV2Fixture('tesla', OPERATION_ID);
const input = { intentId: fixture.status.intentId, operationId: OPERATION_ID };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STALE_RECONCILE_EXPLANATION = 'The same durable attempt is still ambiguous; no signing or submission request was repeated.';
const CONFIRMED_CASES = [
  { name: 'confirmed-success-reconcile', operation: 'reconcile', succeeded: true },
  { name: 'confirmed-failed-status', operation: 'status', succeeded: false },
  { name: 'confirmed-failed-reconcile', operation: 'reconcile', succeeded: false },
];

function confirmedResult({ operation, succeeded }) {
  const body = receiptFixture()[operation];
  const state = operation === 'reconcile' ? body.statusAfter : body;
  if (!succeeded) {
    delete state.receiptOutcome;
    Object.assign(state, { executionSucceeded: false, reconciliationKind: 'landed_program_error' });
  }
  if (operation === 'reconcile') {
    body.explanation = STALE_RECONCILE_EXPLANATION;
    refreshReconcileDigest(body);
  }
  const original = structuredClone(body);
  const toolInput = { intentId: body.intentId };
  const normalized = normalizeGovernedAssetResult({
    operation, input: toolInput, httpStatus: operation === 'reconcile' ? 202 : 200, body,
  });
  assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
  assert.deepEqual(normalized.body, original);
  return { body, state, toolInput, result: buildGovernedAssetToolResult(normalized) };
}

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

test('confirmed outcomes keep their stage and original receipt evidence through the declared envelope', () => {
  for (const scenario of CONFIRMED_CASES) {
    const { body, state, toolInput, result } = confirmedResult(scenario);
    const { presentation, ...evidence } = result.structuredContent;
    assert.deepEqual(evidence, body, scenario.name);
    assert.deepEqual(presentation, JSON.parse(result.content[0].text), scenario.name);
    const selected = selectGovernedWidgetResult(result.structuredContent, result._meta);
    const model = normalizeGovernedAction(selected, toolInput);
    assert.equal(model.stage, scenario.succeeded ? 'success' : 'failure', scenario.name);
    assert.equal(model.intentId, state.intentId, scenario.name);
    assert.equal(model.attemptId, state.attemptId, scenario.name);
    assert.equal(model.transactionSignature, state.transactionSignature, scenario.name);
    assert.equal(model.confirmationCommitment, 'confirmed', scenario.name);
    assert.equal(model.settlementFinalized, false, scenario.name);
    assert.equal(model.executionSucceeded, scenario.succeeded, scenario.name);
    if (scenario.operation === 'reconcile') {
      assert.equal(model.reconcileOutcome, 'pending', scenario.name);
      assert.equal(evidence.explanation, STALE_RECONCILE_EXPLANATION, scenario.name);
      assert.equal(evidence.digest, body.digest, scenario.name);
    }
    if (!scenario.succeeded) {
      assert.equal(state.receiptOutcome, undefined, scenario.name);
      assert.doesNotMatch(model.recovery.sentence ?? '', /reconcile|resubmit|submit|retry/i, scenario.name);
    }
  }
});

test('declared envelopes preserve phone and desktop rendering without starting actions', async (t) => {
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
    for (const scenario of CONFIRMED_CASES) {
      await t.test(`${scenario.name} at ${viewport.width}px`, async () => {
        const { body, state, toolInput, result } = confirmedResult(scenario);
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
        }, { output: result.structuredContent, metadata: result._meta ?? {}, toolInput });
        await page.goto(`http://127.0.0.1:${address.port}/governed-action.html`);
        const card = page.locator(`.dx-action[data-stage="${scenario.succeeded ? 'success' : 'failure'}"]`);
        await card.waitFor();
        const visibleText = await card.innerText();
        assert.doesNotMatch(visibleText, /still ambiguous|landing and execution remain unproven|Recovery remains uncertain/i);
        assert.doesNotMatch(visibleText, /may submit|resubmit|retry reconciliation|reconcile this same intent/i);
        assert.doesNotMatch(visibleText, /Not finalized/, 'Finality evidence stays in the receipt details');
        assert.match(visibleText, scenario.succeeded ? /successful execution/i : /failed|unsuccessful execution/i);
        assert.equal(await card.locator('[data-evidence="commitment"] dd').innerText(), 'Confirmed');
        assert.equal(await card.locator('[data-evidence="execution"] dd').innerText(), scenario.succeeded ? 'Succeeded' : 'Failed');
        assert.equal(await card.locator(`dd[title="${state.transactionSignature}"]`).count(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        if (screenshotDir) await page.screenshot({
          path: path.join(screenshotDir, `${scenario.name}-${viewport.width}.png`), fullPage: true,
        });

        const receipt = card.locator('details').filter({ has: page.getByText('Receipt details', { exact: true }) });
        await receipt.locator('summary').click();
        const receiptText = await receipt.innerText();
        assert.match(receiptText, /Settlement finality\s+Not finalized/);
        if (scenario.operation === 'reconcile') {
          assert.match(receiptText, /Reconciliation\s+pending/);
          assert.ok(receiptText.includes(body.explanation));
          const originalExplanation = receipt.locator('dd').filter({ hasText: body.explanation });
          assert.ok(await originalExplanation.evaluate(element => element.scrollWidth <= element.clientWidth),
            'The complete original explanation is readable without horizontal clipping');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        assert.deepEqual(await page.evaluate(() => window.__presentationCalls), []);
        assert.deepEqual(errors, []);
        if (screenshotDir) await page.screenshot({
          path: path.join(screenshotDir, `${scenario.name}-${viewport.width}-receipt.png`), fullPage: true,
        });
        await page.close();
      });
    }
  }
});
