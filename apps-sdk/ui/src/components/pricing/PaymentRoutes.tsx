import { ChainIcon, UsdcIcon, getChain } from '../x402';
import type { X402PaymentRoute } from '../x402/check-result-model';

function readableAsset(asset: string | null): string | null {
  const value = asset?.trim();
  if (!value || value.toUpperCase() === 'USDC') return null;
  return /^[a-z][a-z0-9._-]{0,11}$/i.test(value) ? value : null;
}

function secondarySchemeLabel(value: string | null): string | null {
  const scheme = value?.trim().toLowerCase();
  if (!scheme || scheme === 'exact') return null;
  if (scheme === 'upto') return 'Metered';
  if (scheme === 'tab') return 'Tab';
  return scheme.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function routePresentationKey(route: X402PaymentRoute): string {
  return JSON.stringify([
    route.price,
    route.priceFormatted,
    route.asset?.trim().toUpperCase() ?? null,
    route.scheme?.trim().toLowerCase() ?? null,
    route.amountAtomic ?? null,
    route.decimals ?? null,
    route.facilitator?.trim() ?? null,
    route.expiresAt ?? null,
  ]);
}

function canonicalNetworkKey(route: X402PaymentRoute): string {
  const chain = getChain(route.network);
  return chain.slug === 'default'
    ? route.network?.trim().toLowerCase() || 'unknown'
    : chain.slug;
}

function groupPaymentRoutes(
  options: readonly X402PaymentRoute[],
): X402PaymentRoute[][] {
  const groups: Array<{
    presentationKey: string;
    networkKeys: Set<string>;
    routes: X402PaymentRoute[];
  }> = [];

  for (const route of options) {
    const presentationKey = routePresentationKey(route);
    const networkKey = canonicalNetworkKey(route);
    const group = groups.find((candidate) => (
      candidate.presentationKey === presentationKey
      && !candidate.networkKeys.has(networkKey)
    ));

    if (group) {
      group.routes.push(route);
      group.networkKeys.add(networkKey);
      continue;
    }

    groups.push({
      presentationKey,
      networkKeys: new Set([networkKey]),
      routes: [route],
    });
  }

  return groups.map((group) => group.routes);
}

function PaymentTermRow({
  routes,
  showPrice,
}: {
  routes: readonly X402PaymentRoute[];
  showPrice: boolean;
}) {
  const route = routes[0];
  const chains = [...new Map(routes.map((item) => {
    const chain = getChain(item.network);
    const key = chain.slug === 'default'
      ? item.network || chain.name
      : chain.slug || item.network || '';
    return [key, { ...chain, key, network: item.network }] as const;
  })).values()].filter((chain) => chain.slug || chain.name);
  const assets = [...new Set(
    routes
      .map((item) => readableAsset(item.asset))
      .filter((asset): asset is string => Boolean(asset)),
  )];
  const hasUsdc = routes.some((item) => item.asset?.trim().toUpperCase() === 'USDC');
  const schemes = [...new Set(
    routes
      .map((item) => secondarySchemeLabel(item.scheme))
      .filter((scheme): scheme is string => Boolean(scheme)),
  )];
  const accessibleParts = routes.map((item) => {
    const chain = getChain(item.network);
    return [
      item.asset?.trim(),
      chain.name ? `on ${chain.name}` : null,
      secondarySchemeLabel(item.scheme),
    ].filter(Boolean).join(' ');
  });
  if (showPrice) accessibleParts.push(route.priceFormatted);

  return (
    <li className="dx-pricing__route" aria-label={accessibleParts.filter(Boolean).join('; ') || 'Payment option'}>
      <div className="dx-pricing__route-rail" aria-hidden="true">
        {chains.map((chain) => (
          <span className="dx-pricing__route-chain" key={chain.key}>
            <ChainIcon network={chain.network} size={20} />
            {chain.slug === 'default' && chain.name ? <span>{chain.name}</span> : null}
          </span>
        ))}
        {hasUsdc ? <UsdcIcon size={20} /> : null}
        {assets.map((asset) => <span key={asset}>{asset}</span>)}
        {schemes.map((scheme) => <span key={scheme}>{scheme}</span>)}
      </div>
      {showPrice ? (
        <span className="dx-pricing__route-price">{route.priceFormatted}</span>
      ) : null}
    </li>
  );
}

export function PaymentRoutes({
  options,
}: {
  options: readonly X402PaymentRoute[];
}) {
  if (options.length === 0) return null;
  const grouped = groupPaymentRoutes(options);
  const showPrices = grouped.length > 1;

  return (
    <section
      className={`dx-pricing__routes${showPrices ? '' : ' dx-pricing__routes--single'}`}
      aria-label={showPrices ? 'Payment options' : 'Payment rail'}
    >
      {showPrices ? <h2 className="dx-pricing__routes-title">Payment options</h2> : null}
      <ul className="dx-pricing__routes-list" aria-label={showPrices ? undefined : 'Payment rail'}>
        {grouped.map((routes) => (
          <PaymentTermRow
            key={routes.map((route) => route.routeKey).join('|')}
            routes={routes}
            showPrice={showPrices}
          />
        ))}
      </ul>
    </section>
  );
}
