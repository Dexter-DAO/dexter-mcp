import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ReturnedResult,
  returnedResultIsImage,
  returnedResultLength,
  returnedResultNeedsPreview,
} from './ReturnedResult';

describe('returned provider result', () => {
  it('renders an explicit empty state for an undefined result property', () => {
    const markup = renderToStaticMarkup(<ReturnedResult data={undefined} />);

    expect(markup).toContain('The provider returned an empty result.');
  });

  it('shortens a dense inline result without hiding that it is a preview', () => {
    const dense = { observations: Array.from({ length: 20 }, (_, index) => ({ index })) };
    const markup = renderToStaticMarkup(
      <ReturnedResult
        data={dense}
        maxCharacters={80}
      />,
    );

    expect(returnedResultLength(dense)).toBe(JSON.stringify(dense, null, 2).length);
    expect(markup).toContain('Showing a preview. Open the full result to see the rest.');
    expect(markup).toContain('…');
    expect(markup).not.toContain('&quot;index&quot;: 19');
  });

  it('bounds a newline-heavy result even when its character count is small', () => {
    const data = Array.from({ length: 30 }, (_, index) => `row ${index}`).join('\n');
    const markup = renderToStaticMarkup(
      <ReturnedResult
        data={data}
        maxCharacters={1_000}
        maxLines={6}
        previewMessage="Showing a preview. Ask in chat for the full result."
      />,
    );

    expect(returnedResultNeedsPreview(data, 1_000, 6)).toBe(true);
    expect(markup).toContain('Ask in chat for the full result.');
    expect(markup).toContain('row 5');
    expect(markup).not.toContain('row 6');
  });

  it('does not hide sibling fields behind a generic image URL', () => {
    const markup = renderToStaticMarkup(
      <ReturnedResult data={{ url: 'https://provider.example/chart.png', status: 'stale' }} />,
    );

    expect(markup).not.toContain('<img');
    expect(markup).toContain('&quot;status&quot;: &quot;stale&quot;');
  });

  it('bounds a provider image without cropping it or adding a nested scroller', () => {
    const image = { image_url: 'https://provider.example/portrait.png', alt: 'Tall chart' };
    const markup = renderToStaticMarkup(
      <ReturnedResult data={image} maxImageHeight={220} />,
    );

    expect(returnedResultIsImage(image)).toBe(true);
    expect(markup).toContain('max-height:220px');
    expect(markup).toContain('alt="Tall chart"');
  });

  it('falls back safely for values that JSON cannot serialize', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(returnedResultLength(cyclic)).toBe(0);
    expect(() => renderToStaticMarkup(<ReturnedResult data={cyclic} />)).not.toThrow();
  });
});
