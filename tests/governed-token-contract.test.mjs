import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GOVERNED_PREPARE_INPUT_SCHEMA } from '../lib/governed-asset-contract.mjs';
import { governedBackendRequest } from '../lib/governed-asset-client.mjs';
import { normalizeGovernedAssetResult, buildGovernedAssetToolResult, GOVERNED_PRESENTED_OUTPUT_SCHEMAS } from '../lib/governed-asset-result.mjs';
import { applyOpenToolResultPolicy } from '../lib/open-tool-contracts.mjs';
import { canonicalHash } from '../lib/governed-canonical-identity.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/token-api-contract.json', import.meta.url), 'utf8'));
const example = name => structuredClone(fixture.cases.find(c => c.name === name));
const project = c => applyOpenToolResultPolicy(`dexter_${({ prepare:'prepare_asset_action',execute:'execute_asset_action',status:'asset_action_status',reconcile:'reconcile_asset_action',history:'wallet_history' })[c.operation]}`,
  buildGovernedAssetToolResult(normalizeGovernedAssetResult(c)));
const pending = example('buy-token_trading_setup_pending');
for (const c of fixture.cases) test(`actual API builder contract: ${c.name}`, () => {
  const request = governedBackendRequest(c.operation, c.input);
  assert.deepEqual(request.input, c.input);
  const normalized = normalizeGovernedAssetResult(c);
  assert.deepEqual(normalized.body, c.body, 'must retain the API result rather than substitute a local failure');
  const result = project(c);
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS[c.operation].safeParse(result.structuredContent).success, true);
  if (c.body.status === 'uncertain' && c.operation === 'prepare') {
    assert.deepEqual(result.structuredContent.recovery.arguments, c.input);
    assert.equal(result.structuredContent.recovery.intentId, c.body.intentId);
    assert.equal(result.structuredContent.recovery.settlement, 'not-submitted');
    assert.equal('business' in result.structuredContent, false);
  }
  if (c.body.receiptOutcome) {
    assert.deepEqual(result.structuredContent.presentation.actual.fees, c.body.receiptOutcome.fees);
    assert.equal(result.structuredContent.presentation.actual.credit.amount, c.body.receiptOutcome.credit.amount);
  }
});
test('forwards buy, sell amount and sell USD value with an exact case-sensitive mint', () => {
  const { operationId, tokenMint } = pending.input;
  for (const terms of [{ action:'buy',amountAtomic:'5000000' }, { action:'sell',amountAtomic:'12345' }, { action:'sell',valueUsd:'5' }]) {
    const input = { operationId, tokenMint, ...terms, maxSlippageBps:500, maxPriceImpactBps:1000 };
    const r = governedBackendRequest('prepare', input);
    assert.equal(r.idempotencyKey, operationId); assert.equal(r.method,'POST');
    assert.deepEqual(r.body,{ tokenMint,...terms,maxSlippageBps:500,maxPriceImpactBps:1000 });
    assert.equal(JSON.parse(r.bodyText).tokenMint, tokenMint);
  }
});
for (const change of [{ tokenMint:'111' }, { tokenMint:'z'.repeat(44) }, { assetId:'dexter' }, { companyQuery:'Apple' },
  { valueUsd:'5' }, { shareQuantity:'1' }, { action:'send' }, { walletAddress:pending.input.tokenMint }]) test(`rejects mixed or invalid selectors: ${JSON.stringify(change)}`, () => {
  assert.equal(GOVERNED_PREPARE_INPUT_SCHEMA.safeParse({ ...pending.input,...change }).success,false);
  assert.throws(() => governedBackendRequest('prepare',{ ...pending.input,...change }),/invalid_governed_tool_input|authority/);
});
for (const [name, mutate] of [
  ['settlement',b=>{b.business.settlement='submission-pending';}], ['executed',b=>{b.executed=true;}],
  ['amount',b=>{b.business.amountAtomic='1';}], ['operation',b=>{b.requestId='other-request';}],
  ['success',b=>{b.business.executionSucceeded=true;}], ['arbitrary error',b=>{b.code='transaction_pending';}],
  ['no retained intent',b=>{delete b.intentId;}], ['unknown delay',b=>{b.retryAfterMs=1;}],
  ['reconciliation needed',b=>{b.business.reconciliation.required=true;}],
]) test(`never grants setup retry from ${name}`, () => {
  const c=example('buy-token_trading_setup_pending');mutate(c.body);
  assert.equal(project(c).structuredContent.recovery,undefined);
});
test('Execute cannot acquire setup recovery, even with a forged pending code', () => {
  const c={ ...pending,operation:'execute',input:{ operationId:pending.input.operationId,intentId:pending.body.intentId } };
  assert.equal(project(c).structuredContent.recovery,undefined);
});
for (const [name, mutate] of [
  ['wrong mint',b=>{b.preview.productIdentity.mint='So11111111111111111111111111111111111111112';}],
  ['wrong budget',b=>{b.business.amountAtomic='1';}], ['unbound grant',b=>{b.attribution.grant.authorityEffectDigest='a'.repeat(64);}],
  ['stock quantity',b=>{b.preview.expectedShareQuantity='1';}], ['fabricated scaling',b=>{b.preview.productIdentity.amountModel='scaled-ui-amount';}],
  ['wrong fee side',b=>{b.preview.feeSummary.serviceFee.side='output';}], ['fake existing account',b=>{b.account=null;}],
  ['wrong expiry',b=>{b.preview.quoteExpiresAtUnixMs++;}], ['quote below minimum',b=>{b.preview.minimumOutputAtomic='18446744073709551615';}],
]) test(`rejects altered token preparation: ${name}`,()=>{
  const c=example('buy-prepared');mutate(c.body);
  assert.equal(normalizeGovernedAssetResult(c).body.code,'governed_backend_response_invalid');
});
for (const [name, mutate] of [
  ['wrong input mint',b=>{b.tradeSummary.inputMint=b.tradeSummary.mint;}],
  ['wrong recorded amount',b=>{b.receiptOutcome.credit.amount='100';}],
  ['quoted amount as actual',b=>{b.tradeSummary.actualOutputAmountAtomic=b.tradeSummary.quotedOutputAtomic;}],
  ['wrong signature',b=>{b.receiptOutcome.transactionSignature='3'.repeat(88);}],
  ['wrong attempt',b=>{b.receiptOutcome.attemptId='11111111-1111-4111-8111-111111111111';}],
  ['wrong finality',b=>{b.business.finality='confirmed';}], ['missing receipt',b=>{b.receiptOutcome=null;}],
  ['failed success',b=>{b.business.programError=true;}], ['wrong evidence',b=>{b.evidenceDigest='f'.repeat(64);}],
]) test(`rejects fabricated execution result: ${name}`,()=>{
  const c=example('buy-finalized-success-execute');mutate(c.body);
  assert.equal(normalizeGovernedAssetResult(c).body.code,'governed_backend_response_invalid');
});
test('history accepts token-family items and keeps status recovery on the same intent',()=>{
  const items=['buy-setup-status','sell-confirmed-success-status','buy-pending-status'].map(n=>example(n).body);
  const c={operation:'history',input:{limit:3},httpStatus:200,body:{namespace:'dexter-governed-transaction-history/v1',items,nextCursor:null}};
  const n=normalizeGovernedAssetResult(c);assert.deepEqual(n.body,c.body);
  const tool=project(c);assert.equal(tool.structuredContent.presentation.items.length,3);
  for(const item of tool.structuredContent.presentation.items) assert.equal(item.nextActions.some(a=>a.tool==='dexter_execute_asset_action'),false);
});
test('tampered reconciliation fails even when a new digest covers an inconsistent status',()=>{
  const c=example('buy-finalized-success-reconcile');c.body.statusAfter.submitted=false;
  const {digest,...material}=c.body;c.body.digest=canonicalHash(material);
  assert.equal(normalizeGovernedAssetResult(c).body.code,'governed_backend_response_invalid');
});
test('rejects mismatched presentation and typed recovery identity',()=>{
  const content=project(pending).structuredContent;
  content.recovery.intentId='11111111-1111-4111-8111-111111111111';
  assert.equal(GOVERNED_PRESENTED_OUTPUT_SCHEMAS.prepare.safeParse(content).success,false);
});
test('exports exact production normalization and policy output for API worker tests',()=>{
  if(!process.env.TOKEN_MCP_WORKER_FIXTURE_OUTPUT)return;
  const files=['governed-token-result.mjs','governed-asset-result.mjs','governed-agent-presentation.mjs','open-tool-contracts.mjs'];
  const producers=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(new URL(`../lib/${p}`,import.meta.url))).digest('hex')]));
  writeFileSync(process.env.TOKEN_MCP_WORKER_FIXTURE_OUTPUT,JSON.stringify({synthetic:true,producers,input:pending.input,toolResult:project(pending),
    prepared:project(example('buy-prepared')),confirmed:project(example('buy-finalized-success-execute'))},null,2)+'\n');
});
