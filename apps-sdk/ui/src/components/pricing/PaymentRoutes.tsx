import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { ChainIcon, getChain } from '../x402';
import {
  purchaseModeLabel,
  type PreparedPurchaseOption,
} from '../x402/purchase-model';
import { formatAssetLabel } from '../x402/search/utils';

function shortRecipient(value: string): string {
  return value.length <= 12
    ? value
    : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function availabilityCopy(option: PreparedPurchaseOption): string | null {
  switch (option.availability.state) {
    case 'ready':
      return null;
    case 'request_required':
      return 'Price the exact request first';
    case 'integration_required':
      return 'Not connected on this surface yet';
    case 'unavailable':
      return 'Seller does not offer this route';
  }
}

function priceLabel(option: PreparedPurchaseOption): string {
  return (
    option.display.priceFormatted
    ?? `${option.preparedPurchase.route.sellerOffer.amountAtomic} atomic`
  );
}

type RowProps = {
  option: PreparedPurchaseOption;
  featured: boolean;
  selected: boolean;
  onSelect: (option: PreparedPurchaseOption) => void;
};

function PurchaseRouteRow({
  option,
  featured,
  selected,
  onSelect,
}: RowProps) {
  const offer = option.preparedPurchase.route.sellerOffer;
  const { name: chainName } = getChain(offer.network);
  const unavailable = availabilityCopy(option);
  return (
    <label
      className={[
        'dx-pricing__route',
        featured ? 'dx-pricing__route--best' : '',
        selected ? 'dx-pricing__route--selected' : '',
        unavailable ? 'dx-pricing__route--disabled' : '',
      ].filter(Boolean).join(' ')}
    >
      <input
        type="radio"
        name="purchase-mode"
        value={option.preparedPurchase.preparedId}
        checked={selected}
        disabled={Boolean(unavailable)}
        onChange={() => onSelect(option)}
        aria-label={`${purchaseModeLabel(option.mode)} via ${chainName} using ${formatAssetLabel(offer.asset)}`}
      />
      <div className="dx-pricing__route-chain">
        <ChainIcon network={offer.network} size={20} />
        <div className="dx-pricing__route-chain-text">
          <div className="dx-pricing__route-chain-line">
            <span className="dx-pricing__route-chain-name">
              {purchaseModeLabel(option.mode)}
            </span>
            {selected ? (
              <Badge color="success" size="sm">Selected</Badge>
            ) : featured ? (
              <Badge color="secondary" size="sm">Lowest price</Badge>
            ) : null}
          </div>
          <span className="dx-pricing__route-chain-asset">
            {formatAssetLabel(offer.asset)} · {chainName}
          </span>
          {unavailable ? (
            <span className="dx-pricing__route-chain-asset">{unavailable}</span>
          ) : null}
        </div>
      </div>
      <div className="dx-pricing__route-payto">
        <span className="dx-pricing__route-payto-addr">
          to {shortRecipient(offer.payTo)}
        </span>
      </div>
      <span className="dx-pricing__route-price">{priceLabel(option)}</span>
    </label>
  );
}

type Props = {
  options: PreparedPurchaseOption[];
  featuredPreparedId: string | null;
  selectedPreparedId: string | null;
  onSelect: (option: PreparedPurchaseOption) => void;
};

export function PaymentRoutes({
  options,
  featuredPreparedId,
  selectedPreparedId,
  onSelect,
}: Props) {
  return (
    <section className="dx-pricing__routes">
      <h2 className="dx-pricing__section-title">Choose how to buy</h2>
      <div className="dx-pricing__routes-list">
        {options.map((option) => (
          <PurchaseRouteRow
            key={option.preparedPurchase.preparedId}
            option={option}
            featured={
              option.preparedPurchase.preparedId === featuredPreparedId
            }
            selected={
              option.preparedPurchase.preparedId === selectedPreparedId
            }
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
