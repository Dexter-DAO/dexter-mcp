import { ChainIcon, getChain } from '../x402';
import type { X402PaymentRoute } from '../x402/check-result-model';
import { formatAssetLabel } from '../x402/search/utils';

function shortRecipient(value: string): string {
  return value.length <= 12
    ? value
    : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function priceLabel(route: X402PaymentRoute): string {
  return route.priceFormatted || `${route.amountAtomic ?? 'Unknown'} atomic`;
}

function schemeLabel(value: string | null): string {
  if (!value) return 'x402';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) =>
    letter.toUpperCase());
}

function PaymentTermRow({ route }: { route: X402PaymentRoute }) {
  const { name: chainName } = getChain(route.network);
  return (
    <div className="dx-pricing__route dx-pricing__route--terms">
      <div className="dx-pricing__route-chain">
        <ChainIcon network={route.network} size={20} />
        <div className="dx-pricing__route-chain-text">
          <div className="dx-pricing__route-chain-line">
            <span className="dx-pricing__route-chain-name">
              {schemeLabel(route.scheme)}
            </span>
          </div>
          <span className="dx-pricing__route-chain-asset">
            {formatAssetLabel(route.asset)} · {chainName}
            {route.amountAtomic ? ` · ${route.amountAtomic} atomic` : ''}
          </span>
        </div>
      </div>
      {route.payTo ? (
        <div className="dx-pricing__route-payto">
          <span className="dx-pricing__route-payto-addr">
            to {shortRecipient(route.payTo)}
          </span>
        </div>
      ) : null}
      <span className="dx-pricing__route-price">{priceLabel(route)}</span>
    </div>
  );
}

export function PaymentRoutes({
  options,
}: {
  options: readonly X402PaymentRoute[];
}) {
  return (
    <section className="dx-pricing__routes">
      <h2 className="dx-pricing__section-title">Current seller terms</h2>
      <div className="dx-pricing__routes-list">
        {options.map((route) => (
          <PaymentTermRow key={route.routeKey} route={route} />
        ))}
      </div>
    </section>
  );
}
