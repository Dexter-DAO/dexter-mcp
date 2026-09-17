import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult } from '../lib/governed-asset-result.mjs';
import { GOVERNED_RECEIPT_OUTCOME_SCHEMA } from '../lib/governed-receipt-outcome.mjs';
import { receiptFixture, OPERATION_ID, CAPTURED_SALE, refreshReconcileDigest } from './fixtures/governed-receipt-outcome.fixtures.mjs';

function response(operation, body) {
  return normalizeGovernedAssetResult({ operation, input: operation === 'history' ? {} : {
    intentId: body.intentId, ...(operation === 'execute' ? { operationId: OPERATION_ID } : {}),
  }, body, httpStatus: operation === 'reconcile' && body.outcome === 'pending' ? 202 : 200 });
}

for (const operation of ['execute', 'status', 'history', 'reconcile']) {
  test(`${operation} projects saved sale economics through validated result while retaining exact evidence`, () => {
    const fixture = receiptFixture({ captured: true });
    const normalized = response(operation, fixture[operation]);
    assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
    const output = buildGovernedAssetToolResult(normalized);
    const presentation = JSON.parse(output.content[0].text);
    const item = operation === 'history' ? presentation.items[0] : presentation;
    assert.equal(item.actual.credit.amount, '1.002443');
    assert.equal(item.actual.debit.amount, null);
    assert.equal(item.actual.debit.baseTokenAmount, '0.006589');
    assert.equal(item.actual.receiptDigest, CAPTURED_SALE.receiptDigest);
    assert.deepEqual(output.structuredContent, fixture[operation]);
    assert.doesNotMatch(item.actual.fees, /(?:^|\s)0(?:\s|$)/);
  });
}

test('mixed decimals are retained and tiny actual credit does not become a zero charge', () => {
  const fixture = receiptFixture({ decimals: 8, tokenProgram: 'spl-token' });
  const receipt = fixture.status.receiptOutcome;
  Object.assign(receipt.credit, { amountRaw: '1', baseAmount: '0.000001', displayAmount: '0.000001', balanceBeforeRaw: '0', balanceAfterRaw: '1' });
  const normalized = response('status', fixture.status);
  assert.equal(normalized.isError, false);
  const output = JSON.parse(buildGovernedAssetToolResult(normalized).content[0].text);
  assert.equal(output.actual.debit.amount, '0.02');
  assert.equal(output.actual.credit.amount, '0.000001');
});

test('historical scaling is accepted only with matching observation slot and exact conversion', () => {
  const fixture = receiptFixture({ captured: true });
  Object.assign(fixture.status.receiptOutcome.debit, { amountModel: 'scaled-ui-amount', displayMultiplier: '2.5', displayAmount: '0.0164725',
    scalingEvidence: { observedAt: CAPTURED_SALE.observedAt, slot: CAPTURED_SALE.transactionSlot, evidenceDigest: 'f'.repeat(64) } });
  const normalized = response('status', fixture.status);
  assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
  assert.equal(JSON.parse(buildGovernedAssetToolResult(normalized).content[0].text).actual.debit.amount, '0.0164725');
  for (const mutate of [
    (body) => { body.receiptOutcome.debit.scalingEvidence.slot = '447716157'; },
    (body) => { body.receiptOutcome.debit.displayAmount = '0.006589'; },
    (body) => { body.receiptOutcome.debit.scalingEvidence = null; },
  ]) {
    const changed = structuredClone(fixture.status); mutate(changed);
    assert.equal(response('status', changed).body.code, 'governed_backend_response_invalid');
  }
});

test('actual evidence cannot be substituted across amounts, intents, signatures, assets or commitments', () => {
  for (const mutate of [
    (body) => { body.receiptOutcome.intentId = 'f189dfeb-b970-4206-b255-5c991a5f13f3'; },
    (body) => { body.receiptOutcome.attemptId = 'a0b94838-7ff0-5d83-ab25-5e7cc243c12c'; },
    (body) => { body.receiptOutcome.transactionSignature = '5'.repeat(88); },
    (body) => { body.receiptOutcome.debit.decimals = 8; },
    (body) => { body.receiptOutcome.credit.amountRaw = '1002500'; },
    (body) => { body.receiptOutcome.debit.mint = body.receiptOutcome.credit.mint; },
    (body) => { body.receiptOutcome.transactionCommitment = 'finalized'; },
    (body) => { body.receiptOutcome.debit.balanceAfterRaw = '32653'; },
    (body) => { body.receiptOutcome.fees = { status: 'available', networkFee: '0', routeFees: [] }; },
  ]) {
    const body = receiptFixture({ captured: true }).status; mutate(body);
    assert.equal(response('status', body).body.code, 'governed_backend_response_invalid');
  }
});

test('buy receipt identifies actual cash debit and stock credit without borrowing quote shares', () => {
  const fixture = receiptFixture({ buy: true });
  const normalized = response('execute', fixture.execute);
  assert.equal(normalized.isError, false, JSON.stringify(normalized.body));
  const output = JSON.parse(buildGovernedAssetToolResult(normalized).content[0].text);
  assert.equal(output.actual.debit.symbol, 'USDC');
  assert.equal(output.actual.debit.amount, '250');
  assert.equal(output.actual.credit.amount, null);
  assert.equal(output.actual.credit.baseTokenAmount, '1.26');
});

test('unavailable receipt is valid partial data and retains confirmed transaction evidence', () => {
  const fixture = receiptFixture();
  fixture.status.receiptOutcome = { namespace: 'dexter-governed-receipt-outcome/v1', status: 'unavailable', reason: 'receipt_read_unavailable' };
  const normalized = response('status', fixture.status);
  assert.equal(normalized.isError, false);
  const output = JSON.parse(buildGovernedAssetToolResult(normalized).content[0].text);
  assert.equal(output.actual.available, false);
  assert.equal(output.transactionSignature, fixture.status.transactionSignature);
  assert.match(output.summary, /confirmed/);
  assert.doesNotMatch(output.summary, /finalized/);
});

test('receipt-bearing Reconcile digest must cover the added actual outcome', () => {
  const fixture = receiptFixture();
  fixture.reconcile.statusAfter.receiptOutcome.receiptDigest = 'e'.repeat(64);
  assert.equal(response('reconcile', fixture.reconcile).body.code, 'governed_backend_response_invalid');
  refreshReconcileDigest(fixture.reconcile);
  assert.equal(response('reconcile', fixture.reconcile).isError, false);
});

test('decimal overflow and invented display data do not pass the receipt schema', () => {
  const receipt = receiptFixture().status.receiptOutcome;
  assert.equal(GOVERNED_RECEIPT_OUTCOME_SCHEMA.safeParse(receipt).success, true);
  for (const [key, value] of [['amountRaw', '18446744073709551616'], ['displayAmount', '2'], ['displayMultiplier', '1']]) {
    const changed = structuredClone(receipt); changed.debit[key] = value;
    assert.equal(GOVERNED_RECEIPT_OUTCOME_SCHEMA.safeParse(changed).success, false);
  }
});
