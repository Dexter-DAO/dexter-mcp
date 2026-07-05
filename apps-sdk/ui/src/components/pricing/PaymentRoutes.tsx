import { CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { ChainIcon, getChain } from '../x402';
import type { PaymentOption } from './types';

function shortenAddress(addr: string | null): string {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Human label for a payment scheme so two rows on the same chain/asset/price
 * are distinguishable. "exact" is a one-shot charge; "tab" (and EVM "upto") is
 * a metering lane that keeps a running tab as you use the endpoint.
 */
function schemeLabel(scheme: string | null | undefined): string | null {
  switch ((scheme || '').toLowerCase()) {
    case 'exact':
      return 'One-shot payment';
    case 'tab':
      return 'Streaming tab';
    case 'upto':
      return 'Metered tab';
    case '':
      return null;
    default:
      return scheme || null;
  }
}

interface RowProps {
  option: PaymentOption;
  isBest: boolean;
}

export function PaymentRouteRow({ option, isBest }: RowProps) {
  const { name: chainName } = getChain(option.network);
  const scheme = schemeLabel(option.scheme);
  return (
    <div className={`dx-pricing__route ${isBest ? 'dx-pricing__route--best' : ''}`}>
      <div className="dx-pricing__route-chain">
        <ChainIcon network={option.network} size={20} />
        <div className="dx-pricing__route-chain-text">
          <div className="dx-pricing__route-chain-line">
            <span className="dx-pricing__route-chain-name">{chainName}</span>
            {isBest ? (
              <Badge color="success" size="sm">
                Best
              </Badge>
            ) : null}
          </div>
          <span className="dx-pricing__route-chain-asset">{scheme ? `USDC · ${scheme}` : 'USDC'}</span>
        </div>
      </div>
      <div className="dx-pricing__route-payto">
        <span className="dx-pricing__route-payto-addr">{shortenAddress(option.payTo)}</span>
        <CopyButton copyValue={option.payTo} variant="ghost" color="secondary" size="sm" />
      </div>
      <span className="dx-pricing__route-price">{option.priceFormatted}</span>
    </div>
  );
}

interface ListProps {
  options: PaymentOption[];
  cheapestIndex: number;
}

export function PaymentRoutes({ options, cheapestIndex }: ListProps) {
  return (
    <section className="dx-pricing__routes">
      <h2 className="dx-pricing__section-title">Pay via</h2>
      <div className="dx-pricing__routes-list">
        {options.map((opt, i) => (
          <PaymentRouteRow key={i} option={opt} isBest={i === cheapestIndex} />
        ))}
      </div>
    </section>
  );
}
