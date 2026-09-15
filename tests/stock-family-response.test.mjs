import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
import { dynamicStockV2Fixture } from './fixtures/governed-stock-v2.fixtures.mjs';
const op = '019f981c-9215-7141-84f2-d89ffe9cbece';
const stockAuthority = {
  authorityNamespace: 'stock-category-v2', categoryRuleId: '919f981c-9215-4141-84f2-d89ffe9cbece',
  categoryRuleDigest: 'a'.repeat(64), grantBindingId: '819f981c-9215-4141-84f2-d89ffe9cbece',
  apiRuntimeAdmissionDigest: 'b'.repeat(64), attestorVerifierTrustSetDigest: 'c'.repeat(64),
  graphConfigAccount: '11111111111111111111111111111111', graphConfigAccountDataSha256: 'd'.repeat(64),
};
for (const name of ['tesla', 'nvidia']) test(`${name} passes the API's persistent stock grant without a legacy rule alias`, () => {
  const fixture = dynamicStockV2Fixture(name, op);
  delete fixture.prepared.attribution.grant.ruleId;
  Object.assign(fixture.prepared.attribution.grant, stockAuthority, { expiresAt: null });
  const result = normalizeGovernedAssetResult({ operation: 'prepare', input: fixture.input, httpStatus: 200, body: fixture.prepared });
  assert.deepEqual(result.body, fixture.prepared);
  assert.equal(result.isError, false);
  fixture.status.grantRuleId = null;
  fixture.status.authorityIdentity = stockAuthority;
  const status = normalizeGovernedAssetResult({ operation: 'status', input: { intentId: fixture.status.intentId }, httpStatus: 200, body: fixture.status });
  assert.deepEqual(status.body, fixture.status);
});
test('a first trade preserves its exact contextual approval link in the model response', () => {
  const fixture = dynamicStockV2Fixture('tesla', op);
  const requestId = `vspr_${'a'.repeat(36)}`;
  const body = {
    namespace: 'dexter-governed-agent-action/v1', status: 'refused', executed: false, requestId: op,
    attribution: null, business: { ...fixture.prepared.business, assetId: null, requestedCompanyQuery: 'Tesla', amountAtomic: null,
      lifecycle: 'not-created', settlement: 'not-submitted', finality: 'not-final', executionSucceeded: null,
      refusalOrEscalationReasons: ['grant_revision_inactive'] },
    code: 'grant_revision_inactive', explanation: 'Confirm stock trading in your wallet.', retryable: false,
    permissionRequest: { namespace: 'dexter-stock-permission-request/v1', family: 'stocks', requestId,
      approvalUrl: `https://dexter.cash/tabs/setup?request_id=${requestId}`, expiresAt: '2026-09-10T19:00:00.000Z' },
  };
  const result = normalizeGovernedAssetResult({ operation: 'prepare', input: fixture.input, httpStatus: 422, body });
  assert.deepEqual(result.body, body);
  assert.match(buildGovernedAssetToolResult(result).content[0].text, /https:\/\/dexter.cash\/tabs\/setup/);
  body.permissionRequest.approvalUrl = 'https://evil.example/tabs/setup';
  const invalid = normalizeGovernedAssetResult({ operation: 'prepare', input: fixture.input, httpStatus: 422, body });
  assert.equal(invalid.body.code, 'governed_backend_response_invalid');
});
