import { ChainIcon, getChain } from '../x402';
import type { X402PaymentRoute } from '../x402/check-result-model';
import { formatAssetLabel } from '../indexter/search/utils';

function priceLabel(route: X402PaymentRoute): string {
  return route.priceFormatted || `${route.amountAtomic ?? 'Unknown'} atomic`;
}

function schemeLabel(value: string | null): string {
  if (!value) return 'Exact payment';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) =>
    letter.toUpperCase());
}

function PaymentTermRow({ route }: { route: X402PaymentRoute }) {
  const { name: chainName } = getChain(route.network);
  return (
    <li className="dx-pricing__route">
      <div className="dx-pricing__route-chain">
        <ChainIcon network={route.network} size={20} />
        <div className="dx-pricing__route-chain-text">
          <div className="dx-pricing__route-chain-line">
            <span className="dx-pricing__route-chain-name">
              {schemeLabel(route.scheme)}
            </span>
          </div>
          <span className="dx-pricing__route-chain-asset">
            {formatAssetLabel(route.asset)} on {chainName}
            {route.amountAtomic ? `, ${route.amountAtomic} base units` : ''}
          </span>
        </div>
      </div>
      {route.payTo ? (
        <div className="dx-pricing__route-payto">
          <span className="dx-pricing__route-payto-label">Recipient</span>
          <span className="dx-pricing__route-payto-addr">{route.payTo}</span>
        </div>
      ) : null}
      <span className="dx-pricing__route-price">{priceLabel(route)}</span>
    </li>
  );
}

export function PaymentRoutes({
  options,
}: {
  options: readonly X402PaymentRoute[];
}) {
  return (
    <section className="dx-pricing__routes">
      <h2 className="dx-pricing__routes-title">
        {options.length === 1 ? 'Seller terms' : `${options.length} seller routes`}
      </h2>
      <ul className="dx-pricing__routes-list">
        {options.map((route) => (
          <PaymentTermRow key={route.routeKey} route={route} />
        ))}
      </ul>
    </section>
  );
}
