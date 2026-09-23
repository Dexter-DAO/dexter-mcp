import { z } from 'zod';

export const PORTFOLIO_READ_MAX_BYTES = Object.freeze({ summary: 2048, holdings: 6144, detail: 8192, targets: 6144 });
export const PORTFOLIO_SELECTED_MAX_BYTES = 512 * 1024;
export const PORTFOLIO_READ_ERRORS = Object.freeze([
  'portfolio_query_invalid', 'portfolio_snapshot_expired', 'portfolio_snapshot_too_large',
  'portfolio_result_budget_exceeded', 'portfolio_read_unavailable',
]);
const bytes = (value) => Buffer.byteLength(value, 'utf8');
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const decimal = z.string().max(384).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
const signedDecimal = z.string().max(384).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).refine((v) => v !== '-0');
const observed = z.string().max(40).datetime({ offset: false }).refine((v) => Number.isFinite(Date.parse(v)));
const opaque = (max) => z.string().min(1).max(max).regex(/^[\x21-\x7e]+$/);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isPortfolioPublicKey(value) {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let number = 0n;
  for (const char of value) number = number * 58n + BigInt(alphabet.indexOf(char));
  let length = 0;
  while (number > 0n) { length++; number >>= 8n; }
  return length + (value.match(/^1*/)?.[0].length ?? 0) === 32;
}
const address = z.string().refine(isPortfolioPublicKey, 'Expected a canonical Solana address');
const mint = z.union([z.literal('native:SOL'), address]);
const query = z.string().min(1).refine((v) => v === v.trim() && bytes(v) <= 128, 'Use a trimmed search of at most 128 UTF-8 bytes');
const view = z.enum(['summary', 'holdings', 'detail', 'targets']);
const identity = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._:-]*$/);
const label = (max) => z.string().min(1).max(max).refine((v) => v.trim().length > 0);
const reason = z.enum([
  'governed_asset_rail_not_live', 'governed_asset_action_not_supported', 'protected_agent_send_sdk_required',
  'stock_approval_required', 'stock_connection_unavailable', 'stock_authority_unavailable',
  'stock_activation_unavailable', 'stock_eligibility_required', 'stock_eligibility_unavailable', 'stock_direction_not_permitted',
]);

export const PORTFOLIO_READ_INPUT_SHAPE = Object.freeze({
  view: view.optional(),
  network: z.literal('solana-mainnet').optional(),
  query: query.optional(),
  mint: mint.optional(),
  tokenAccount: address.optional(),
  snapshotId: opaque(128).optional(),
  cursor: opaque(1024).optional(),
  limit: z.number().int().min(1).max(32).optional(),
});
export const PORTFOLIO_READ_INPUT_SCHEMA = z.object(PORTFOLIO_READ_INPUT_SHAPE).strict().superRefine((input, ctx) => {
  const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const effectiveView = input.view ?? (input.cursor ? null : 'summary');
  if (input.query !== undefined && input.mint !== undefined) fail('Choose query or mint');
  if (input.tokenAccount !== undefined && ((effectiveView !== 'detail' && effectiveView !== null) || !input.mint || input.mint === 'native:SOL')) fail('Token account requires a token-mint detail request');
  if (effectiveView === 'detail' && !input.cursor && !input.query && !input.mint) fail('Detail requires a query or mint');
  if (effectiveView === 'summary' && ['query', 'mint', 'tokenAccount', 'limit', 'cursor'].some((k) => input[k] !== undefined)) fail('Summary has no filter, cursor or page limit');
  if (effectiveView === 'targets' && input.tokenAccount !== undefined) fail('Targets do not select token accounts');
});
export function normalizePortfolioReadInput(value = {}) {
  const input = PORTFOLIO_READ_INPUT_SCHEMA.parse(value);
  return input.cursor ? input : { view: 'summary', ...input };
}

export const compactPortfolioHoldingSchema = z.object({
  assetId: identity.nullable(), mint, tokenAccount: address.nullable(),
  symbol: label(32).nullable(), name: label(128).nullable(),
  displayAmount: decimal, amountModel: z.enum(['raw-decimals', 'scaled-ui-amount', 'unknown']),
  valueUsd: decimal.nullable(), change24hPercent: signedDecimal.nullable(),
}).strict().refine((h) => (h.mint === 'native:SOL') === (h.tokenAccount === null), 'Native and token account identities must agree');
export function compactPortfolioHolding(holding) {
  return {
    assetId: holding.assetId, mint: holding.mint, tokenAccount: holding.tokenAccount,
    symbol: holding.symbol ?? null, name: holding.name ?? null, displayAmount: holding.displayAmount,
    amountModel: holding.amountModel, valueUsd: holding.valueUsd,
    change24hPercent: holding.change24hPercent ?? null,
  };
}
const compactAction = z.object({ action: z.enum(['buy', 'sell', 'send']), available: z.boolean(), reason: reason.nullable() })
  .strict().refine((v) => v.available === (v.reason === null));
export const compactPortfolioTargetSchema = z.object({
  assetId: identity, mint: address, tokenProgram: z.enum(['spl-token', 'token-2022']),
  symbol: label(32), name: label(128), actions: z.array(compactAction).length(3),
}).strict().refine((t) => t.actions.every((a, i) => a.action === ['buy', 'sell', 'send'][i]));
export function compactPortfolioTarget(target) {
  return {
    assetId: target.assetId, mint: target.mint, tokenProgram: target.tokenProgram,
    symbol: target.symbol, name: target.name,
    actions: target.actions.map(({ action, available, reason: actionReason }) => ({ action, available, reason: actionReason })),
  };
}
export const portfolioReadSelectionSchema = z.object({
  view, query: query.nullable(), mint: mint.nullable(), tokenAccount: address.nullable(),
  limit: z.number().int().min(1).max(32), offset: count, matchedCount: count.nullable(),
  returnedCount: count, omittedCount: count.nullable(), nextCursor: opaque(1024).nullable(),
  match: z.enum(['matched', 'none', 'ambiguous', 'unavailable']),
}).strict();
export const portfolioSourceSummarySchema = z.object({
  holdingCount: count, pricedHoldings: count, unpricedHoldings: count,
  holdingsComplete: z.boolean(), omittedHoldings: count,
  pricedValueUsd: decimal, portfolioValueUsd: decimal.nullable(),
  enrichment: z.object({
    metadata: z.enum(['complete', 'partial', 'unavailable']), pricing: z.enum(['complete', 'partial', 'unavailable']),
    tokenExtensions: z.enum(['complete', 'partial', 'unavailable']),
  }).strict(),
  targetCount: count.nullable(),
}).strict();
export const portfolioReady = (portfolio) => ({ portfolio_status: 'ready', mode: 'portfolio_ready', user_bound: true, portfolio });
export const portfolioModelBytes = (portfolio) => bytes(JSON.stringify(portfolioReady(portfolio)));
const equal = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]));
};

export function createPortfolioReadSchemas({ holdingSchema, targetSchema, validateTargets, validateHolding }) {
  const checkedHolding = holdingSchema.refine(validateHolding, 'Holding amount, price and identity evidence disagree');
  const portfolio = z.object({
    contractVersion: z.literal('opendexter.portfolio.v2'), network: z.literal('solana-mainnet'), walletAddress: address,
    observedAt: observed, contextSlot: count.nullable(), snapshotId: opaque(128), expiresAt: observed,
    sourceSummary: portfolioSourceSummarySchema, selection: portfolioReadSelectionSchema,
    holdings: z.array(z.union([compactPortfolioHoldingSchema, checkedHolding])).max(32),
    targets: z.array(compactPortfolioTargetSchema).max(32),
  }).strict().superRefine((p, ctx) => {
    const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const s = p.selection; const summary = p.sourceSummary;
    const sourceCount = s.view === 'targets' ? summary.targetCount : summary.holdingCount;
    const rows = s.view === 'targets' ? p.targets : p.holdings;
    const richDetail = s.view === 'detail' && s.match === 'matched' && s.matchedCount === 1;
    if (Date.parse(p.expiresAt) <= Date.parse(p.observedAt)) fail('Snapshot expiry must follow its observation');
    if (summary.holdingCount !== summary.pricedHoldings + summary.unpricedHoldings
      || (summary.pricedHoldings === 0 && summary.pricedValueUsd !== '0')
      || (summary.holdingsComplete && summary.omittedHoldings !== 0)
      || summary.portfolioValueUsd !== (summary.holdingsComplete && summary.unpricedHoldings === 0 ? summary.pricedValueUsd : null)) fail('Source totals and coverage disagree');
    if ((s.view === 'targets' ? p.holdings : p.targets).length !== 0) fail('View contains unrelated rows');
    if (s.returnedCount !== rows.length || rows.length > s.limit) fail('Selected count exceeds its limit');
    if (s.query !== null && s.mint !== null) fail('Selection has two filters');
    if (s.tokenAccount !== null && (s.view !== 'detail' || s.mint === null || s.mint === 'native:SOL')) fail('Invalid account selection');
    if (s.view === 'detail' && s.query === null && s.mint === null) fail('Detail has no selector');
    if (s.view === 'summary' && (s.limit !== 5 || s.query !== null || s.mint !== null || s.tokenAccount !== null || s.offset !== 0 || s.nextCursor !== null || rows.length > 5)) fail('Summary is not a page');
    if (sourceCount === null) {
      if (s.view !== 'targets' || s.match !== 'unavailable' || s.matchedCount !== null || s.omittedCount !== null || rows.length !== 0 || s.offset !== 0 || s.nextCursor !== null) fail('Unavailable target coverage was converted to data');
    } else {
      if (s.matchedCount === null || s.matchedCount > sourceCount || s.offset + rows.length > s.matchedCount || s.omittedCount !== sourceCount - rows.length) fail('Source and selected counts disagree');
      if (s.query === null && s.mint === null && s.matchedCount !== sourceCount) fail('Unfiltered count differs from source');
      if (s.match === 'unavailable' || (s.match === 'none') !== (s.matchedCount === 0)) fail('Match state disagrees with count');
      if (s.view !== 'summary' && (s.nextCursor !== null) !== (s.offset + rows.length < s.matchedCount)) fail('Continuation disagrees with remaining records');
      if (s.nextCursor !== null && rows.length === 0) fail('Continuation makes no progress');
    }
    if ((s.match === 'ambiguous') !== (s.view === 'detail' && s.matchedCount > 1)) fail('Ambiguity is not explicit');
    if (richDetail && rows.length !== 1) fail('Unique detail must return the holding');
    const identities = new Set();
    for (const row of rows) {
      const key = s.view === 'targets' ? row.assetId : row.tokenAccount ?? row.mint;
      if (identities.has(key)) fail('Duplicate row identity');
      identities.add(key);
      if (s.mint !== null && row.mint !== s.mint) fail('Requested mint does not match row');
      if (s.tokenAccount !== null && row.tokenAccount !== s.tokenAccount) fail('Requested account does not match row');
      if (s.query !== null && ![row.assetId, row.name, row.symbol].some((v) => typeof v === 'string' && v.toLowerCase().includes(s.query.toLowerCase()))) fail('Requested query does not match row');
      if (s.view !== 'targets' && !(richDetail ? checkedHolding : compactPortfolioHoldingSchema).safeParse(row).success) fail('Holding fields do not match the selected view');
    }
    if (portfolioModelBytes(p) > PORTFOLIO_READ_MAX_BYTES[s.view]) fail('Portfolio exceeds model response budget');
  });
  const card = z.object({
    contractVersion: z.literal('opendexter.portfolio-card.v2'), snapshotId: opaque(128),
    holdings: z.array(checkedHolding).max(32), approvedActionTargets: z.array(targetSchema).max(32).refine(validateTargets),
  }).strict();
  const response = z.object({ ok: z.literal(true), portfolio, card }).strict().superRefine((r, ctx) => {
    const fail = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const p = r.portfolio; const c = r.card;
    if (p.snapshotId !== c.snapshotId || p.holdings.length !== c.holdings.length || p.targets.length !== c.approvedActionTargets.length) fail('Card selection differs from model selection');
    const rich = p.selection.view === 'detail' && p.selection.match === 'matched';
    c.holdings.forEach((h, i) => { if (!equal(p.holdings[i], rich ? h : compactPortfolioHolding(h))) fail('Card holding differs from selected evidence'); });
    c.approvedActionTargets.forEach((t, i) => { if (!equal(p.targets[i], compactPortfolioTarget(t))) fail('Card target differs from selected evidence'); });
    if (bytes(JSON.stringify(r)) > PORTFOLIO_SELECTED_MAX_BYTES) fail('Selected transfer exceeds byte budget');
  });
  return Object.freeze({ portfolio, card, response });
}
