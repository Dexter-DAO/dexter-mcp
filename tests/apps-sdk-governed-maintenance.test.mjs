import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeGovernedAction, selectGovernedWidgetResult } from '../apps-sdk/ui/src/components/governed-action/governed-action-model.ts';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import { GOVERNED_ASSET_TOOL_NAMES } from '../lib/governed-asset-contract.mjs';
import { receiptFixture, OPERATION_ID } from './fixtures/governed-receipt-outcome.fixtures.mjs';

const API = JSON.parse(readFileSync(new URL('./fixtures/governed-program-transition-hold-api.json', import.meta.url)));
const intentId = receiptFixture().status.intentId;
for (const operation of ['prepare', 'execute', 'reconcile']) {
  test(`${operation} maintenance widget uses full metadata with the current presentation-only envelope`, () => {
    const input = operation === 'prepare'
      ? { operationId: OPERATION_ID, action: 'sell', companyQuery: 'NVIDIA', valueUsd: '25' }
      : { ...(operation === 'execute' ? { operationId: OPERATION_ID } : {}), intentId };
    const normalized = normalizeGovernedAssetResult({ operation, input, body: API.body, httpStatus: 503 });
    const result = applyOpenToolResultPolicy(GOVERNED_ASSET_TOOL_NAMES[operation], buildGovernedAssetToolResult(normalized));
    const selected = selectGovernedWidgetResult(result.structuredContent, result._meta);
    assert.deepEqual(selected, normalized.body);
    const model = normalizeGovernedAction(selected, input);
    assert.equal(model.stageLabel, 'Maintenance');
    assert.equal(model.headline, 'Vault operations are temporarily unavailable');
    assert.equal(model.intentId, operation === 'prepare' ? null : intentId);
    assert.equal(model.requestId, operation === 'reconcile' ? null : OPERATION_ID);
    assert.equal(model.confirmedExecutionOutcome, false);
    assert.equal(model.executionSucceeded, null);
    assert.equal(model.transactionSignature, null);
    assert.deepEqual(model.recovery, operation === 'prepare'
      ? { kind: 'same-request', sentence: 'Resume your original request after maintenance.' }
      : { kind: 'read', sentence: 'Check the result of your original request.' });
  });
}
