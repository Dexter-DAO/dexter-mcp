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

function PaymentTermRow({
  route,
  showPrice,
}: {
  route: X402PaymentRoute;
  showPrice: boolean;
}) {
  const chain = getChain(route.network);
  const asset = readableAsset(route.asset);
  const isUsdc = route.asset?.trim().toUpperCase() === 'USDC';
  const scheme = secondarySchemeLabel(route.scheme);
  const accessibleParts = [
    route.asset?.trim(),
    chain.name ? `on ${chain.name}` : null,
    scheme,
    showPrice ? route.priceFormatted : null,
  ].filter(Boolean).join(' ');

  return (
    <li className="dx-pricing__route" aria-label={accessibleParts || 'Payment option'}>
      <div className="dx-pricing__route-rail" aria-hidden="true">
        <ChainIcon network={route.network} size={20} />
        {isUsdc ? <UsdcIcon size={20} /> : null}
        {chain.slug === 'default' && chain.name ? (
          <span>{chain.name}</span>
        ) : null}
        {asset ? <span>{asset}</span> : null}
        {scheme ? <span>{scheme}</span> : null}
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
  const showPrices = options.length > 1;

  return (
    <section
      className={`dx-pricing__routes${showPrices ? '' : ' dx-pricing__routes--single'}`}
      aria-label={showPrices ? 'Payment options' : 'Payment rail'}
    >
      {showPrices ? <h2 className="dx-pricing__routes-title">Payment options</h2> : null}
      <ul className="dx-pricing__routes-list" aria-label={showPrices ? undefined : 'Payment rail'}>
        {options.map((route) => (
          <PaymentTermRow key={route.routeKey} route={route} showPrice={showPrices} />
        ))}
      </ul>
    </section>
  );
}
