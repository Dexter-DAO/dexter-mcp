// Server-only: widgets share the prepare contract, not the Primary trade tool.
import { z } from 'zod';
import { isPortfolioPublicKey } from './portfolio-read-contract.mjs';
import {
  GOVERNED_ASSET_ID_SCHEMA,
  GOVERNED_PREPARE_INPUT_SCHEMA,
} from './governed-asset-contract.mjs';

const [
  , // Send is not a one-step trade.
  prepareBuySpendInput,
  prepareCatalogStockBuySpendInput,
  prepareCatalogStockBuyQuantityInput,
  prepareSellInput,
  prepareCatalogStockSellInput,
  prepareSellValueInput,
  prepareCatalogStockSellValueInput,
] = GOVERNED_PREPARE_INPUT_SCHEMA.options;

export const GOVERNED_TRADE_TOOL_NAME = 'dexter_trade';
export const GOVERNED_TRADE_DESCRIPTION =
  'Buy or sell the exact investment and amount confirmed by the user. Dexter prepares, re-quotes when needed, and submits in one call. For a stock, use companyQuery to select the current catalog product. Use a new operationId for a new confirmed instruction. Keep that ID and all arguments when checking an unresolved trade. Report the returned outcome and retrySafe fields; a failed call has an uncertain outcome.';
const tradeOperationId = z.string().min(8).max(120)
  .regex(/^(?!.*\.q[0-9]+$)[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/)
  .describe('Stable identity for these exact trade terms, at most 120 characters; never a child key ending in .q and digits.');
const tokenMint = z.string().min(32).max(44).refine(isPortfolioPublicKey,
  'canonical token mint required');

// The agent/trades route accepts every prepare Buy/Sell variant, including
// token mints and an assetId share target, with its narrower operation ID.
export const GOVERNED_TRADE_INPUT_SCHEMA = z.union([
  prepareBuySpendInput,
  prepareCatalogStockBuySpendInput,
  prepareCatalogStockBuyQuantityInput,
  prepareCatalogStockBuyQuantityInput.omit({ companyQuery: true })
    .extend({ assetId: GOVERNED_ASSET_ID_SCHEMA }),
  prepareSellInput,
  prepareCatalogStockSellInput,
  prepareSellValueInput,
  prepareCatalogStockSellValueInput,
  prepareBuySpendInput.omit({ assetId: true }).extend({ tokenMint }),
  prepareSellInput.omit({ assetId: true }).extend({ tokenMint }),
  prepareSellValueInput.omit({ assetId: true }).extend({ tokenMint }),
].map(schema => schema.extend({ operationId: tradeOperationId })));
