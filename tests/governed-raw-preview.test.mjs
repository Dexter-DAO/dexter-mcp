import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGovernedAssetToolResult, normalizeGovernedAssetResult } from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const API = JSON.parse(readFileSync(new URL('./fixtures/governed-raw-preview-api.json', import.meta.url)));
const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';

function fixture(action) {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  f.prepared.preview = structuredClone(API.cases.find(c => c.action === action).preview);
  const p = f.prepared.preview;
  f.input = { operationId: OPERATION_ID, action, assetId: p.assetId, amountAtomic: p.amountAtomic };
  Object.assign(f.prepared.business, { action, assetId: p.assetId, amountAtomic: p.amountAtomic });
  delete f.prepared.stockRuntime;
  delete f.prepared.business.requestedCompanyQuery;
  return f;
}

const normalize = f => normalizeGovernedAssetResult({ operation: 'prepare', input: f.input,
  body: f.prepared, httpStatus: 200 });

test('raw Buy and Sell accept exact current API-produced previews without changing raw results', () => {
  for (const action of ['buy', 'sell']) {
    const f = fixture(action);
    assert.equal(f.prepared.preview.maximumInputAmountAtomic, f.input.amountAtomic);
    assert.equal(f.prepared.preview.overfillPossible, false);
    assert.equal(Object.hasOwn(f.prepared.preview, 'usdValue'), false);
    const result = normalize(f);
    assert.equal(result.isError, false, action);
    assert.deepEqual(buildGovernedAssetToolResult(result).structuredContent, f.prepared);
  }
});

test('raw Buy and Sell retain absent and null legacy maximum-input fields', () => {
  for (const action of ['buy', 'sell']) {
    for (const maximum of [undefined, null, API.cases[0].preview.amountAtomic]) {
      for (const overfill of [undefined, false]) {
        const f = fixture(action);
        if (maximum === undefined) delete f.prepared.preview.maximumInputAmountAtomic;
        else f.prepared.preview.maximumInputAmountAtomic = maximum;
        if (overfill === undefined) delete f.prepared.preview.overfillPossible;
        else f.prepared.preview.overfillPossible = overfill;
        assert.equal(normalize(f).isError, false, `${action}/${maximum}/${overfill}`);
      }
    }
  }
});

test('raw preview compatibility rejects substituted amount, overfill, modes, and mint identity', () => {
  for (const action of ['buy', 'sell']) {
    for (const [name, change] of [
      ['larger maximum', p => { p.maximumInputAmountAtomic = '2000001'; }],
      ['smaller maximum', p => { p.maximumInputAmountAtomic = '1999999'; }],
      ['overfill', p => { p.overfillPossible = true; }],
      ['null overfill', p => { p.overfillPossible = null; }],
      ['share mode', p => { p.requestAmountKind = 'share-quantity'; }],
      ['USD mode', p => { p.requestAmountKind = 'usd-value'; }],
      ['share target', p => { p.requestedShareQuantity = '1'; }],
      ['input amount', p => { p.amountAtomic = '2000001'; }],
      ['input mint', p => { p.inputMint = '11111111111111111111111111111111'; }],
      ['output mint', p => { p.outputMint = '11111111111111111111111111111111'; }],
      ['product mint', p => { p.productIdentity.mint = '11111111111111111111111111111111'; }],
      ['asset identity', p => { p.assetId = 'different-approved-token'; }],
      ['product asset identity', p => { p.productIdentity.assetId = 'different-approved-token'; }],
    ]) {
      const f = fixture(action);
      change(f.prepared.preview);
      const result = normalize(f);
      assert.equal(result.isError, true, `${action}/${name}`);
      assert.equal(result.body.code, 'governed_backend_response_invalid', `${action}/${name}`);
    }
  }
});

test('the raw swap compatibility allowance does not alter Send preview rules', () => {
  const f = fixture('sell');
  const destinationOwner = '11111111111111111111111111111111';
  f.input = { ...f.input, action: 'send', destinationOwner };
  Object.assign(f.prepared.business, { action: 'send', destinationOwner, protocolId: 'spl-transfer' });
  Object.assign(f.prepared.preview, { action: 'send', destinationOwner,
    outputMint: f.prepared.preview.productIdentity.mint,
    expectedOutputAtomic: null, minimumOutputAtomic: null, slippageBps: null,
    priceImpactBps: null, quoteExpiresAtUnixMs: null });
  delete f.prepared.preview.maximumInputAmountAtomic;
  delete f.prepared.preview.overfillPossible;
  assert.equal(normalize(f).isError, false, 'existing absent-field Send shape');
  f.prepared.preview.maximumInputAmountAtomic = null;
  assert.equal(normalize(f).isError, false, 'existing null maximum Send shape');
  f.prepared.preview.maximumInputAmountAtomic = f.input.amountAtomic;
  assert.equal(normalize(f).isError, true, 'swap maximum remains invalid for Send');
  f.prepared.preview.maximumInputAmountAtomic = null;
  f.prepared.preview.overfillPossible = false;
  assert.equal(normalize(f).isError, true, 'swap overfill field remains invalid for Send');
});
