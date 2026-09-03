// Compatibility exports for the existing ui://.../stock-trade.html resource.
// The active renderer is governed-action-wide and covers Send, Buy, and Sell.
export {
  displayShareQuantity,
  formatAtomicDecimal,
  normalizeGovernedAction,
  normalizeGovernedAction as normalizeStockTrade,
  normalizeGovernedHistory,
  shortenSolanaIdentity,
} from '../governed-action/governed-action-model.ts';

export type {
  GovernedActionOperation,
  GovernedActionStage,
  GovernedActionStage as StockTradeStage,
  GovernedActionViewModel,
  GovernedActionViewModel as StockTradeViewModel,
  GovernedAssetIdentity,
  GovernedFeeLine,
  GovernedFeeSummary,
  GovernedHistoryViewModel,
} from '../governed-action/governed-action-model.ts';
