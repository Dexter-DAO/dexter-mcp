import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHostedCheckModelResult, buildHostedCheckToolResult } from '../lib/open-check-result.mjs';
import { withOpenResultText } from '../lib/open-result-text.mjs';
import { OPEN_TOOL_CONTRACTS } from '../lib/open-tool-contracts.mjs';

const quote = {
  ok: true,
  paymentRequired: true,
  intentId: '39cd2456-9d90-45e0-87be-add6b59f36eb',
  amountAtomic: '2000',
  asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
};

for (const recoveredCheck of [false, true]) {
  test(`representative Solana quote explains network evidence on ${recoveredCheck ? 'saved' : 'fresh'} Check`, () => {
    const model = buildHostedCheckModelResult({
      checkResult: quote,
      url: 'https://seller.example/weather?location=Brooklyn%2C%20NY',
      recoveredCheck,
    });
    OPEN_TOOL_CONTRACTS.x402_check.outputSchema.parse(model);
    assert.deepEqual(model.paymentOptions, [{
      amountAtomic: quote.amountAtomic, asset: quote.asset, network: quote.network,
      decimals: 6, priceFormatted: '0.002 USDC',
    }]);
    assert.equal(model.intentId, quote.intentId);
    assert.equal(model.executionGuidance.readyForFetch, true);
    assert.deepEqual(model.executionGuidance.fetchArguments, ['intentId', 'maxAmountAtomic']);
    const rendered = withOpenResultText(recoveredCheck ? 'x402_status' : 'x402_check', buildHostedCheckToolResult(model));
    const text = rendered.content[0].text;
    assert.match(text, /displayed network describes a quoted offer and does not confirm the execution route/);
    assert.match(text, /payment details from x402_fetch or x402_status/);
    assert.ok(text.includes(quote.network));
    assert.doesNotMatch(text, /eip155|network: Base|route.*pending|not yet selected|selection.*pending/i);
    assert.deepEqual(rendered.structuredContent, model);
  });
}

test('explicit legacy offer lists retain their full data and existing guidance', () => {
  const paymentOptions = [
    { amountAtomic: '2000', asset: quote.asset, network: quote.network },
    { amountAtomic: '2000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', network: 'eip155:8453' },
  ];
  const model = buildHostedCheckModelResult({ checkResult: { ...quote, paymentOptions }, url: 'https://seller.example/weather' });
  OPEN_TOOL_CONTRACTS.x402_check.outputSchema.parse(model);
  assert.deepEqual(model.paymentOptions, paymentOptions);
  assert.deepEqual(model.executionGuidance, {
    supportedPath: 'fetch_by_intent', readyForFetch: true, intentRequired: true,
    requiredCeilingField: 'maxAmountAtomic', fetchArguments: ['intentId', 'maxAmountAtomic'], dispatchAtMostOnce: true,
  });
  const text = withOpenResultText('x402_check', buildHostedCheckToolResult(model)).content[0].text;
  assert.ok(text.includes(quote.network));
  assert.match(text, /eip155:8453/);
  assert.doesNotMatch(text, /displayed network describes a quoted offer/);
});

test('unknown or failed checks retain failure guidance instead of quoted-network advice', () => {
  const model = buildHostedCheckModelResult({
    checkResult: { ...quote, ok: false, status: 'check_ambiguous', error: 'purchase_check_outcome_unknown' },
    checkRequestId: 'saved-check', recoveredCheck: true,
  });
  assert.equal(model.intentId, null);
  assert.equal(model.executionGuidance.readyForFetch, false);
  assert.equal(model.executionGuidance.nextAction, 'stop');
  assert.doesNotMatch(model.executionGuidance.message, /quoted offer/);
});
