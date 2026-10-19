import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGovernedAssetToolResult,
  governedDetailedBody,
  normalizeGovernedAssetResult,
} from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';

const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';

// dexter-api resolves a stock named by the asset id the portfolio issued to
// that exact product and pins it. The request named no company, so none is echoed.
function heldAssetPrepare() {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  const p = f.prepared.preview;
  delete f.prepared.business.requestedCompanyQuery;
  Object.assign(f.prepared.business, { action: p.action, assetId: p.assetId, amountAtomic: p.amountAtomic });
  f.input = { operationId: OPERATION_ID, action: p.action, assetId: p.assetId, amountAtomic: p.amountAtomic };
  return f;
}
const envelope = f => buildGovernedAssetToolResult(normalizeGovernedAssetResult({
  operation: 'prepare', input: f.input, body: f.prepared, httpStatus: 200,
}));
function rejected(f, label) {
  const result = envelope(f);
  assert.equal(result.isError, true, label);
  assert.equal(JSON.parse(result.content[0].text).code, 'governed_backend_response_invalid', label);
}

test('a stock Prepare for a held asset id is presented when its selection pins that asset', () => {
  const f = heldAssetPrepare();
  const result = envelope(f);
  assert.equal(result.isError, false);
  assert.deepEqual(governedDetailedBody(result.structuredContent), f.prepared);
});

test('an asset id Prepare never accepts another product or an invented company query', () => {
  const other = heldAssetPrepare();
  other.input.assetId = 'xstocks-another-product';
  rejected(other, 'the request named a different asset');
  const swapped = heldAssetPrepare();
  swapped.prepared.preview.stockSelection.assetId = 'xstocks-another-product';
  rejected(swapped, 'the pin names a different asset');
  const company = heldAssetPrepare();
  company.prepared.business.requestedCompanyQuery = 'tesla';
  rejected(company, 'a company query the request never sent');
});

test('a company query Prepare still requires its exact normalized company echo', () => {
  const f = dynamicStockV2Fixture('nvidia', OPERATION_ID);
  const p = f.prepared.preview;
  Object.assign(f.prepared.business, { action: p.action, assetId: p.assetId, amountAtomic: p.amountAtomic });
  f.input = { operationId: OPERATION_ID, action: p.action, companyQuery: 'NVIDIA', amountAtomic: p.amountAtomic };
  assert.equal(envelope(f).isError, false);
  delete f.prepared.business.requestedCompanyQuery;
  rejected(f, 'a company query result must echo the query');
});
