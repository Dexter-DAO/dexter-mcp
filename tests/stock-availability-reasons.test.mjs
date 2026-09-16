import assert from 'node:assert/strict';
import test from 'node:test';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';
import { modelSafePortfolioSnapshot, validateAndBoundPortfolioSnapshotV1 } from '../lib/session-portfolio.mjs';
import { governedActionReason, normalizeDexterPortfolio } from '../apps-sdk/ui/src/components/portfolio/portfolio-model.ts';
import { capabilityReason } from '../apps-sdk/ui/src/components/wallet/portfolioModel.ts';
import { approvedActionTarget, rehashApprovedActionTarget, zeroHoldingBuyDiscoveryPortfolio } from './fixtures/approved-action-target-fixtures.mjs';

const labels = {
  stock_approval_required: 'This agent needs approval to trade stocks.',
  stock_connection_unavailable: "This agent's wallet connection could not be verified.",
  stock_authority_unavailable: 'Stock trading permission could not be checked.',
  stock_activation_unavailable: 'This stock is not enabled for trading.',
  stock_eligibility_required: 'Stock eligibility approval is required.',
  stock_eligibility_unavailable: 'Stock eligibility could not be checked.',
  stock_direction_not_permitted: 'This stock permission does not allow this action.',
};

for (const [reason, label] of Object.entries(labels)) {
  test(`preserves ${reason} through API input, MCP output, and both portfolio labels`, () => {
    const target = approvedActionTarget();
    target.actions[0].available = false;
    target.actions[0].reason = reason;
    const source = { ...zeroHoldingBuyDiscoveryPortfolio(), approvedActionTargets: [rehashApprovedActionTarget(target)] };
    const validated = validateAndBoundPortfolioSnapshotV1(source);
    assert.ok(validated);
    const output = { mode: 'portfolio_ready', user_bound: true, portfolio_status: 'ready', portfolio: modelSafePortfolioSnapshot(validated) };
    assert.equal(OPEN_TOOL_CONTRACTS.dexter_wallet_portfolio.outputSchema.safeParse(output).success, true);
    const model = normalizeDexterPortfolio(output);
    assert.equal(model.state, 'ready');
    assert.equal(model.snapshot.approvedActionTargets[0].actions[0].reason, reason);
    assert.equal(governedActionReason(reason), label);
    assert.equal(capabilityReason(reason), label);
    assert.equal(model.snapshot.approvedActionTargets[0].actions[1].available, true, 'unaffected Sell availability remains independent');

    const contradicted = structuredClone(source);
    contradicted.approvedActionTargets[0].actions[0].available = true;
    contradicted.approvedActionTargets[0] = rehashApprovedActionTarget(contradicted.approvedActionTargets[0]);
    assert.equal(validateAndBoundPortfolioSnapshotV1(contradicted), null);
  });
}
