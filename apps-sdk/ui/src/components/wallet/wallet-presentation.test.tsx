import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompositionBar } from './CompositionBar';
import { SpendHeadline } from './SpendHeadline';
import { WalletHome } from './WalletHome';
import { CreditSheet } from './CreditSheet';
import { normalizeWalletPayload } from '../x402/walletPayload';
import { splitUsd } from './format';

describe('wallet money presentation', () => {
  it('carries rounded cents into the displayed dollar amount', () => {
    expect(splitUsd(1.999)).toEqual({ int: '2', cents: '.00' });
    expect(splitUsd(999.999)).toEqual({ int: '1,000', cents: '.00' });
    expect(splitUsd(1.994)).toEqual({ int: '1', cents: '.99' });
  });

  it('shows an honest empty composition track without inventing owned money', () => {
    const markup = renderToStaticMarkup(
      <CompositionBar own={0} credit={0} atWork={0} earnPct={null} />,
    );

    expect(markup).toContain('dxw-comp-bar--empty');
    expect(markup).not.toContain('dxw-seg-own');
    expect(markup).toContain('$0.00');
  });

  it('renders only composition segments with positive values', () => {
    const markup = renderToStaticMarkup(
      <CompositionBar own={0} credit={12} atWork={0} earnPct={null} />,
    );

    expect(markup).not.toContain('dxw-seg-own');
    expect(markup).toContain('dxw-seg-credit');
    expect(markup).not.toContain('dxw-seg-work');
  });

  it('names the tappable composition by its purpose and balances', () => {
    const markup = renderToStaticMarkup(
      <CompositionBar
        own={6.45}
        credit={1}
        atWork={14.39}
        earnPct={4.2}
        onOpen={() => {}}
      />,
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('aria-label="Review balance composition and credit details.');
    expect(markup).toContain('Yours $6.45, credit $1.00, at work $14.39.');
    expect(markup).toMatch(
      /dxw-dot-work[\s\S]*At work, earning 4\.2%[\s\S]*dxw-amt[\s\S]*\$14\.39[\s\S]*<\/span><\/div>/,
    );
  });

  it('exposes one exact semantic headline while hiding animated fragments', () => {
    const markup = renderToStaticMarkup(
      <SpendHeadline value={7.45} label="Cash + reported credit" />,
    );

    expect(markup).toContain('<h1');
    expect(markup).toContain('Cash + reported credit</h1>');
    expect(markup).toContain('class="sr-only"');
    expect(markup).toContain('$7.45</span>');
    expect(markup).toContain('class="dxw-spend-amount" aria-hidden="true"');
  });

  it('keeps wallet views and reported credit available when cash could not be read', () => {
    const payload = normalizeWalletPayload({ address: '11111111111111111111111111111111',
      balances: { usdc: null }, spendingPower: null,
      credit: { readStatus: 'available', capAtomic: '50000000', borrowedAtomic: '20000000', availableAtomic: '30000000' },
      paymentReadiness: { status: 'unknown' } });
    const markup = renderToStaticMarkup(<WalletHome payload={payload} walletToken={null}
      onOpenExternal={() => {}} isFullscreen={false} condensed={false} onRequestDisplayMode={null} />);
    expect(markup).toContain('Balance unavailable');
    expect(markup).toContain('Reported credit');
    expect(markup).toContain('$30.00');
    expect(markup).toContain('Receive');
    expect(markup).toContain('Assets');
    expect(markup).toContain('Activity');
    expect(markup).not.toContain('$0.00');
    expect(markup).not.toContain('dxw-comp-bar--empty');
    expect(markup).not.toContain('funding_required');
  });

  it('still renders an observed zero as zero', () => {
    const payload = normalizeWalletPayload({ address: '11111111111111111111111111111111', balances: { usdc: 0 } });
    const markup = renderToStaticMarkup(<WalletHome payload={payload} walletToken={null}
      onOpenExternal={() => {}} isFullscreen={false} condensed={false} onRequestDisplayMode={null} />);
    expect(markup).toContain('$0.00');
    expect(markup).toContain('dxw-comp-bar--empty');
    expect(markup).not.toContain('Balance unavailable');
  });

  it('keeps known credit facts while withholding a cash-dependent net value', () => {
    const markup = renderToStaticMarkup(<CreditSheet lineUsd={50} drawnUsd={20} cashUsd={null} onClose={() => {}} />);
    expect(markup).toContain('$50.00');
    expect(markup).toContain('$20.00');
    expect(markup).toContain('$30.00');
    expect(markup).toContain('balance <b class="dxw-mono">Unavailable</b>');
    expect(markup).toContain('net <b class="dxw-mono">Unavailable</b>');
    expect(markup).not.toContain('$0.00');
  });
});
