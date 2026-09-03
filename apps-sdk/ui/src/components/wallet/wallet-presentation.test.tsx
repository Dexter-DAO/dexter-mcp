import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompositionBar } from './CompositionBar';
import { SpendHeadline } from './SpendHeadline';
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
});
