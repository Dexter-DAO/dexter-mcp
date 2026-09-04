import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SearchIdentityIcon } from './SearchIdentityIcon';
import type { SearchResource } from './types';

const resource = {
  kind: 'endpoint',
  resourceId: '77777777-7777-4777-8777-777777777777',
  name: 'Market data',
  url: null,
  access: {
    kind: 'managed_resolvable',
    checkable: true,
    requiresFreshCheck: true,
  },
  method: 'GET',
  price: '$0.01',
  network: null,
  description: 'Current market data.',
  category: 'Markets',
  qualityScore: null,
  verified: false,
  totalCalls: 0,
  merchant: {
    displayName: 'Atlas Labs',
    logoUrl: null,
    technicalHost: null,
  },
  seller: null,
  sellerMeta: {
    displayName: null,
    logoUrl: null,
  },
} satisfies SearchResource;

describe('SearchIdentityIcon', () => {
  it('uses a merchant initial instead of a meaningless dot', () => {
    const markup = renderToStaticMarkup(
      <SearchIdentityIcon resource={resource} size={44} />,
    );

    expect(markup).toContain('dx-search-identity__unsigned');
    expect(markup).toContain('>A<');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('unsigned-dot');
  });
});
