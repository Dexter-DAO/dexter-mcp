import { dynamicStockV2Fixture, FIXTURE_USDC_MINT } from './governed-stock-v2.fixtures.mjs';
import { governedStockTradeSummarySnapshotDigest } from '../../lib/governed-asset-result.mjs';
import { canonicalHash } from '../../lib/governed-canonical-identity.mjs';

export const OPERATION_ID = '219f981c-9215-4141-84f2-d89ffe9cbece';
// Economic fields copied from the preserved 2026-09-17 sale-finality proof.
// Attribution and authority in the surrounding response are synthetic fixtures.
export const CAPTURED_SALE = Object.freeze({
  intentId: 'f189dfeb-b970-4206-b255-5c991a5f13f2',
  attemptId: 'a0b94838-7ff0-5d83-ab25-5e7cc243c12b',
  transactionSignature: '3krGhCMRjh3dWpCBk26oMDMUcRyfkGjBrWdsReLX978k7qiCj9ihT8S1c1eT1skkf4REooHjaGmku256ojNrXKAG',
  receiptDigest: '8ecfbcde3680bb4bf133925129a0d720002d544a417ff7a38d3db99469d51d44',
  mint: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb',
  observedAt: '2026-09-17T05:12:31.368Z',
  transactionSlot: '447712516', postStateSlot: '447712518',
  sourceSpentAtomic: '6589', destinationReceivedAtomic: '1002443',
  sourceBalanceBeforeAtomic: '39241', sourceBalanceAfterAtomic: '32652',
  destinationBalanceBeforeAtomic: '539215', destinationBalanceAfterAtomic: '1541658',
});

function decimal(raw, decimals) {
  if (decimals === 0) return raw;
  const digits = raw.padStart(decimals + 1, '0');
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, '') || '0';
}

export function receiptFixture({ buy = false, decimals = 6, tokenProgram = 'token-2022', captured = false } = {}) {
  const fixture = dynamicStockV2Fixture(buy ? 'tesla' : 'nvidia', OPERATION_ID);
  const state = fixture.status;
  const stockRaw = captured ? CAPTURED_SALE.sourceSpentAtomic : buy ? '1260000' : state.amountAtomic;
  const cashRaw = captured ? CAPTURED_SALE.destinationReceivedAtomic : buy ? state.amountAtomic : '265000123';
  if (captured) {
    Object.assign(state, { intentId: CAPTURED_SALE.intentId, attemptId: CAPTURED_SALE.attemptId,
      transactionSignature: CAPTURED_SALE.transactionSignature, assetId: 'backpack-spcx',
      assetMint: CAPTURED_SALE.mint, amountAtomic: stockRaw, confirmationSlot: CAPTURED_SALE.transactionSlot });
    Object.assign(state.stockSelection, { assetId: state.assetId, mint: state.assetMint, productSymbol: 'SPCX' });
    Object.assign(state.tradeSummary, { assetId: state.assetId, symbol: 'SPCX', amountAtomic: stockRaw });
    Object.assign(state.tradeSummary.productIdentity, { assetId: state.assetId, mint: state.assetMint, symbol: 'SPCX' });
    state.stockV2Identity.intentId = state.intentId;
  }
  state.tokenProgram = tokenProgram;
  Object.assign(state.stockSelection, { decimals, tokenProgram });
  Object.assign(state.tradeSummary.productIdentity, { decimals, tokenProgram });
  state.stockV2Identity.tradeSummarySnapshotDigest = governedStockTradeSummarySnapshotDigest(state.tradeSummary);
  const stock = { mint: state.assetMint, symbol: state.tradeSummary.symbol, tokenProgram,
    amountRaw: stockRaw, decimals, baseAmount: decimal(stockRaw, decimals),
    displayAmount: tokenProgram === 'spl-token' ? decimal(stockRaw, decimals) : null,
    amountModel: tokenProgram === 'spl-token' ? 'raw-decimals' : 'unknown', displayMultiplier: null, scalingEvidence: null,
    balanceBeforeRaw: captured ? CAPTURED_SALE.sourceBalanceBeforeAtomic : buy ? '0' : stockRaw,
    balanceAfterRaw: captured ? CAPTURED_SALE.sourceBalanceAfterAtomic : buy ? stockRaw : '0' };
  const cash = { mint: FIXTURE_USDC_MINT, symbol: 'USDC', tokenProgram: 'spl-token', amountRaw: cashRaw,
    decimals: 6, baseAmount: decimal(cashRaw, 6), displayAmount: decimal(cashRaw, 6), amountModel: 'raw-decimals',
    displayMultiplier: null, scalingEvidence: null,
    balanceBeforeRaw: captured ? CAPTURED_SALE.destinationBalanceBeforeAtomic : buy ? cashRaw : '0',
    balanceAfterRaw: captured ? CAPTURED_SALE.destinationBalanceAfterAtomic : buy ? '0' : cashRaw };
  state.receiptOutcome = { namespace: 'dexter-governed-receipt-outcome/v1', status: 'recorded',
    receiptDigest: captured ? CAPTURED_SALE.receiptDigest : 'a'.repeat(64), intentId: state.intentId, attemptId: state.attemptId,
    transactionSignature: state.transactionSignature, action: state.action, receiptCommitment: 'confirmed', transactionCommitment: 'confirmed',
    transactionSlot: state.confirmationSlot, postStateSlot: captured ? CAPTURED_SALE.postStateSlot : state.confirmationSlot,
    observedAt: captured ? CAPTURED_SALE.observedAt : '2026-08-01T00:01:00.000Z', debit: buy ? cash : stock, credit: buy ? stock : cash,
    fees: { status: 'unavailable', networkFee: null, routeFees: null } };
  Object.assign(fixture.execute, { intentId: state.intentId, attemptId: state.attemptId, transactionSignature: state.transactionSignature,
    tradeSummary: structuredClone(state.tradeSummary), receiptOutcome: structuredClone(state.receiptOutcome) });
  Object.assign(fixture.execute.business, { assetId: state.assetId, amountAtomic: state.amountAtomic });
  fixture.history.items = [structuredClone(state)];
  Object.assign(fixture.reconcile, { intentId: state.intentId, attemptId: state.attemptId, statusAfter: structuredClone(state) });
  refreshReconcileDigest(fixture.reconcile);
  return fixture;
}

export function refreshReconcileDigest(body) {
  const { digest, ...identity } = body;
  body.digest = canonicalHash(identity);
}
