import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CheckResourceIdentity } from './types';
import { ResourceIdentity } from './ResourceIdentity';
import { PaymentRoutes } from './PaymentRoutes';
import type { X402PaymentRoute } from '../x402/check-result-model';

const identity: CheckResourceIdentity = {
  kind: 'endpoint',
  resourceId: 'f617448d-62b1-44f1-a27f-80cff197d855',
  displayName: 'Ticker details',
  description: 'Current company and listing details.',
  merchant: {
    providerKey: 'massive',
    providerSlug: 'massive',
    displayName: 'Massive',
    logoUrl: 'https://assets.example/massive.svg',
    technicalHost: null,
  },
};

const baseRoute: X402PaymentRoute = {
  routeKey: 'base-usdc',
  price: 0.01,
  priceFormatted: '$0.01',
  network: 'eip155:8453',
  asset: 'USDC',
  scheme: 'exact',
  payTo: '0x1111111111111111111111111111111111111111',
  amountAtomic: '10000',
  decimals: 6,
  facilitator: null,
  expiresAt: null,
};

describe('x402 pricing presentation', () => {
  it('renders canonical merchant then resource identity with proxied real art', () => {
    const markup = renderToStaticMarkup(
      <ResourceIdentity
        identity={identity}
        resource={{
          resource_url: 'https://legacy.example/private/path',
          host: 'legacy.example',
          method: 'GET',
          display_name: 'Legacy resource name',
          description: null,
          category: 'Legacy category',
          quality_score: null,
          verification_status: null,
          verification_notes: null,
          last_verified_at: null,
          hit_count: 9_999,
          response_content_type: null,
          response_size_bytes: null,
          latency_p50_ms: null,
          latency_p95_ms: null,
          icon_url: null,
          og_image_url: null,
          og_site_name: null,
          og_description: null,
          docs_url: null,
          openapi_spec_url: null,
          zauth_verified: null,
          erc8004_agent_id: null,
          erc8004_reputation_score: null,
          provenance: null,
          upstream_service: null,
          upstream_service_slug: null,
        }}
        fallbackUrl={null}
      />,
    );

    expect(markup.indexOf('Massive')).toBeLessThan(markup.indexOf('Ticker details'));
    expect(markup).toContain('https://api.dexter.cash/api/img?url=');
    expect(markup).not.toContain('Legacy resource name');
    expect(markup).not.toContain('Legacy category');
    expect(markup).not.toContain('calls');
  });

  it('derives direct host fallback from the checked URL, not supplied host fields', () => {
    const markup = renderToStaticMarkup(
      <ResourceIdentity
        identity={{
          ...identity,
          merchant: {
            ...identity.merchant,
            displayName: null,
            technicalHost: 'spoofed.example',
          },
        }}
        resource={null}
        fallbackUrl="https://service.example/resource"
      />,
    );

    expect(markup).toContain('service.example');
    expect(markup).not.toContain('spoofed.example');
  });

  it('uses a merchant initial when no logo source is available', () => {
    const markup = renderToStaticMarkup(
      <ResourceIdentity
        identity={{
          ...identity,
          merchant: {
            ...identity.merchant,
            logoUrl: null,
          },
        }}
        resource={null}
        fallbackUrl={null}
      />,
    );

    expect(markup).toContain('dx-pricing__identity-icon-fallback');
    expect(markup).toContain('>M<');
    expect(markup).not.toContain('<img');
  });

  it('keeps one payment rail visual and hides chain plumbing', () => {
    const markup = renderToStaticMarkup(<PaymentRoutes options={[baseRoute]} />);

    expect(markup).toContain('/assets/chains/base.svg');
    expect(markup).toContain('/assets/chains/usdc.svg');
    expect(markup).not.toContain('Seller terms');
    expect(markup).not.toContain('Exact payment');
    expect(markup).not.toContain('10000');
    expect(markup).not.toContain('base units');
    expect(markup).not.toContain(baseRoute.payTo!);
    expect(markup).not.toContain('$0.01');
  });

  it('shows prices only when multiple payment routes need comparison', () => {
    const markup = renderToStaticMarkup(
      <PaymentRoutes options={[
        baseRoute,
        {
          ...baseRoute,
          routeKey: 'solana-usdc',
          network: 'solana:mainnet',
          price: 0.02,
          priceFormatted: '$0.02',
          amountAtomic: '20000',
        },
      ]} />,
    );

    expect(markup).toContain('Payment options');
    expect(markup).toContain('$0.01');
    expect(markup).toContain('$0.02');
    expect(markup).not.toContain(baseRoute.payTo!);
    expect(markup).not.toContain('base units');
  });

  it('collapses equal-price rails without repeating the headline price', () => {
    const markup = renderToStaticMarkup(
      <PaymentRoutes options={[
        baseRoute,
        {
          ...baseRoute,
          routeKey: 'solana-usdc',
          network: 'solana:mainnet',
        },
      ]} />,
    );

    expect(markup).toContain('/assets/chains/base.svg');
    expect(markup).toContain('/assets/chains/solana.svg');
    expect(markup.match(/\/assets\/chains\/usdc\.svg/g)).toHaveLength(1);
    expect(markup).not.toContain('Payment options');
    expect(markup).not.toContain('$0.01');
  });

  it('keeps heterogeneous equal-price terms in separate rows', () => {
    const markup = renderToStaticMarkup(
      <PaymentRoutes options={[
        baseRoute,
        {
          ...baseRoute,
          routeKey: 'solana-usdt-upto',
          network: 'solana:mainnet',
          asset: 'USDT',
          scheme: 'upto',
        },
      ]} />,
    );

    expect(markup.match(/class="dx-pricing__route"/g)).toHaveLength(2);
    expect(markup).toContain('Payment options');
    expect(markup).toContain('USDT');
    expect(markup).toContain('Metered');
    expect(markup.match(/class="dx-pricing__route-price">\$0\.01/g)).toHaveLength(2);
  });

  it('does not hide distinct alternatives on the same network', () => {
    const markup = renderToStaticMarkup(
      <PaymentRoutes options={[
        baseRoute,
        {
          ...baseRoute,
          routeKey: 'base-usdc-alternate-recipient',
          payTo: '0x2222222222222222222222222222222222222222',
        },
      ]} />,
    );

    expect(markup.match(/class="dx-pricing__route"/g)).toHaveLength(2);
    expect(markup).toContain('Payment options');
    expect(markup.match(/class="dx-pricing__route-price">\$0\.01/g)).toHaveLength(2);
  });
});
