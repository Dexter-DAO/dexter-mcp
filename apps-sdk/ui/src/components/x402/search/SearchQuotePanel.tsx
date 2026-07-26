import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import type { SearchResource } from './types';
import type {
  X402CheckClassification,
  X402CheckState,
  X402PaymentRoute,
} from '../check-result-model';
import {
  purchaseModeLabel,
  type PreparedPurchaseOption,
} from '../purchase-model';
import { ChainIcon, getChain } from '..';
import { formatAssetLabel, isSearchCheckRequestBound } from './utils';

type Props = {
  resource: SearchResource;
  quote: X402CheckState;
  checkedAt: Date;
  locale?: string;
  timeZone?: string;
  onRetry?: () => void;
  onContinue?: (selection: PreparedPurchaseOption | null) => void;
  continueStatus?: 'idle' | 'sending' | 'sent' | 'error';
  continueError?: string | null;
};

const COPY: Record<
  X402CheckClassification,
  { eyebrow: string; title: string; body: string }
> = {
  paid: {
    eyebrow: 'Current terms',
    title: 'Ready for your approval',
    body: 'Choose whether to continue. Nothing has been charged.',
  },
  free: {
    eyebrow: 'Current access',
    title: 'Ready to use',
    body: 'This service did not request payment.',
  },
  siwx: {
    eyebrow: 'Current access',
    title: 'Wallet sign-in required',
    body: 'The service wants wallet identity, not a payment.',
  },
  apiKey: {
    eyebrow: 'Current access',
    title: 'Provider access required',
    body: 'Connect the provider account before using this service.',
  },
  hybrid: {
    eyebrow: 'Current terms',
    title: 'Sign in, then approve',
    body: 'Authentication comes first. Nothing has been charged.',
  },
  error: {
    eyebrow: 'Live check',
    title: 'Current terms unavailable',
    body: 'Dexter could not verify this service right now.',
  },
};

export function SearchQuotePanel({
  resource,
  quote,
  checkedAt,
  locale,
  timeZone,
  onRetry,
  onContinue,
  continueStatus = 'idle',
  continueError = null,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const requestBound = isSearchCheckRequestBound(resource.method);
  const copy = getQuoteCopy(quote.classification, requestBound);
  const routes = [...quote.routes].sort((a, b) => a.price - b.price);
  const purchaseOptions = useMemo(
    () =>
      [...quote.purchaseOptions].sort((a, b) => {
        const left = a.display.price;
        const right = b.display.price;
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right;
      }),
    [quote.purchaseOptions],
  );
  const [selectedPreparedId, setSelectedPreparedId] = useState<string | null>(
    null,
  );
  const selectedPurchase =
    purchaseOptions.find(
      (option) =>
        option.preparedPurchase.preparedId === selectedPreparedId
        && option.availability.state === 'ready',
    ) ?? null;
  const requiresPurchaseSelection =
    requestBound
    && (quote.classification === 'paid' || quote.classification === 'hybrid')
    && purchaseOptions.length > 0;
  const routeDisplayCounts = routes.reduce((counts, route) => {
    const key = routeDisplayKey(route);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const primaryRoute = routes[0] ?? null;
  const checkedLabel = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(checkedAt);
  const actionLabel = getContinueLabel(quote.classification, requestBound);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [quote.classification, resource.url]);

  useEffect(() => {
    setSelectedPreparedId((current) =>
      purchaseOptions.some(
        (option) =>
          option.preparedPurchase.preparedId === current
          && option.availability.state === 'ready',
      )
        ? current
        : null,
    );
  }, [purchaseOptions, resource.url]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className={`dx-search-quote dx-search-quote--${quote.classification}`}
      aria-live="polite"
      aria-labelledby="dx-search-quote-title"
    >
      <div className="dx-search-quote__signal" aria-hidden="true">
        <span />
      </div>

      <div className="dx-search-quote__content">
        <div className="dx-search-quote__meta">
          <span>{copy.eyebrow}</span>
          <span aria-label={`Checked at ${checkedLabel}`}>
            updated {checkedLabel}
          </span>
        </div>

        <div className="dx-search-quote__headline">
          <div>
            <h2 id="dx-search-quote-title">{copy.title}</h2>
          </div>
          {primaryRoute && (
            <div className="dx-search-quote__price">
              <strong>{primaryRoute.priceFormatted}</strong>
              <span>{formatRouteIdentity(primaryRoute)}</span>
            </div>
          )}
        </div>

        <p className="dx-search-quote__body">
          {quote.classification === 'error' && quote.errorMessage
            ? quote.errorMessage
            : copy.body}
        </p>

        {purchaseOptions.length > 0 ? (
          <fieldset className="dx-search-quote__purchase-choices">
            <legend>Choose how to buy</legend>
            <ul>
              {purchaseOptions.map((option) => {
                const offer = option.preparedPurchase.route.sellerOffer;
                const disabled = option.availability.state !== 'ready';
                return (
                  <li key={option.preparedPurchase.preparedId}>
                    <label
                      className={[
                        'dx-search-quote__purchase-choice',
                        selectedPreparedId === option.preparedPurchase.preparedId
                          ? 'dx-search-quote__purchase-choice--selected'
                          : '',
                        disabled
                          ? 'dx-search-quote__purchase-choice--disabled'
                          : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <input
                        type="radio"
                        name="search-purchase-mode"
                        checked={
                          selectedPreparedId
                          === option.preparedPurchase.preparedId
                        }
                        disabled={disabled}
                        onChange={() =>
                          setSelectedPreparedId(
                            option.preparedPurchase.preparedId,
                          )
                        }
                      />
                      <span className="dx-search-quote__purchase-copy">
                        <strong>{purchaseModeLabel(option.mode)}</strong>
                        <small>
                          {formatAssetLabel(offer.asset)}
                          {' · '}
                          {formatNetwork(offer.network)}
                          {disabled
                            ? ` · ${availabilityLabel(option)}`
                            : ''}
                        </small>
                      </span>
                      <span className="dx-search-quote__purchase-price">
                        {option.display.priceFormatted
                          ?? `${offer.amountAtomic} atomic`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : routes.length > 1 ? (
          <details className="dx-search-quote__routes">
            <summary>
              {routes.length} ways to pay
              <span>View options</span>
            </summary>
            <ul>
              {routes.map((route) => (
                <li key={route.routeKey}>
                  <span className="dx-search-quote__route-name">
                    <ChainIcon network={route.network} size={16} />
                    <span>{formatNetwork(route.network)}</span>
                    <small>
                      {formatRouteDetail(
                        route,
                        (routeDisplayCounts.get(routeDisplayKey(route)) ?? 0) > 1,
                      )}
                    </small>
                  </span>
                  <strong>{route.priceFormatted}</strong>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {(onRetry || (onContinue && actionLabel)) && (
          <div className="dx-search-quote__actions">
            {quote.classification === 'error' && onRetry ? (
              <Button
                color="secondary"
                variant="soft"
                size="sm"
                onClick={onRetry}
              >
                Try again
              </Button>
            ) : onContinue && actionLabel ? (
              <Button
                className="dx-search-primary-action"
                color="primary"
                variant="solid"
                size="sm"
                onClick={() => onContinue(selectedPurchase)}
                disabled={
                  continueStatus === 'sending'
                  || continueStatus === 'sent'
                  || (requiresPurchaseSelection && !selectedPurchase)
                }
              >
                {continueStatus === 'sending'
                  ? 'Opening review…'
                  : continueStatus === 'sent'
                    ? 'Opened in chat'
                    : requiresPurchaseSelection && !selectedPurchase
                      ? 'Choose how to buy'
                      : selectedPurchase
                        ? `Review ${purchaseModeLabel(selectedPurchase.mode)}`
                        : actionLabel}
              </Button>
            ) : null}
          </div>
        )}

        {!onContinue && actionLabel && quote.classification !== 'error' && (
          <p className="dx-search-quote__handoff">
            Ask Dexter in chat to continue with this checked service.
          </p>
        )}

        {continueError && (
          <p className="dx-search-quote__action-error" role="alert">
            {continueError}
          </p>
        )}
      </div>
    </section>
  );
}

function availabilityLabel(option: PreparedPurchaseOption): string {
  switch (option.availability.state) {
    case 'ready':
      return 'Available';
    case 'request_required':
      return 'Price the exact request first';
    case 'integration_required':
      return 'Connection pending';
    case 'unavailable':
      return 'Not offered';
  }
}

function getContinueLabel(
  classification: X402CheckClassification,
  requestBound: boolean,
): string | null {
  switch (classification) {
    case 'paid':
      return requestBound ? 'Review payment' : 'Review request';
    case 'free':
      return 'Use it now';
    case 'siwx':
      return 'Continue to sign in';
    case 'apiKey':
      return 'Review access';
    case 'hybrid':
      return requestBound ? 'Review access and payment' : 'Review request';
    case 'error':
      return null;
  }
}

function getQuoteCopy(
  classification: X402CheckClassification,
  requestBound: boolean,
): { eyebrow: string; title: string; body: string } {
  if (
    !requestBound
    && (classification === 'paid' || classification === 'hybrid')
  ) {
    return {
      eyebrow: 'Price estimate',
      title: 'Price estimate available',
      body: 'Final pricing depends on the request details. Dexter will confirm the exact amount before you approve.',
    };
  }
  return COPY[classification];
}

function formatRouteIdentity(route: X402PaymentRoute): string {
  const asset = formatAssetLabel(route.asset);
  return route.network
    ? `${asset} · ${formatNetwork(route.network)}`
    : asset;
}

function formatNetwork(network: string | null): string {
  if (!network) return 'Network unavailable';
  return getChain(network).name || network;
}

function routeDisplayKey(route: X402PaymentRoute): string {
  return JSON.stringify([
    route.network,
    route.asset,
    route.priceFormatted,
  ]);
}

function formatRouteDetail(
  route: X402PaymentRoute,
  needsDiscriminator: boolean,
): string {
  const asset = formatAssetLabel(route.asset);
  if (!needsDiscriminator) return asset;

  const details = [
    route.scheme?.trim() || null,
    route.payTo ? `to ${shortRecipient(route.payTo)}` : null,
  ].filter((value): value is string => Boolean(value));
  return details.length ? `${asset} · ${details.join(' · ')}` : asset;
}

function shortRecipient(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 12
    ? trimmed
    : `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
