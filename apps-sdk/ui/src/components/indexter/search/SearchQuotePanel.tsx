import { useEffect, useRef } from 'react';
import type { SearchResource } from './types';
import type {
  X402CheckClassification,
  X402CheckState,
  X402PaymentRoute,
} from '../../x402/check-result-model';
import { ChainIcon, getChain } from '../../x402';
import { formatAssetLabel, isSearchCheckRequestBound } from './utils';

type Props = {
  resource: SearchResource;
  quote: X402CheckState;
  checkedAt: Date;
  locale?: string;
  timeZone?: string;
  onRetry?: () => void;
  onContinue?: () => void;
  requiresChatRecheck?: boolean;
  continueStatus?: 'idle' | 'sending' | 'sent' | 'error';
  continueError?: string | null;
  compact?: boolean;
};

const COPY: Record<
  X402CheckClassification,
  { title: string; body: string }
> = {
  paid: {
    title: 'Ready to review',
    body: 'Review the exact request, seller terms, and ceiling. Nothing has been charged.',
  },
  free: {
    title: 'Ready to use',
    body: 'This service did not request payment.',
  },
  siwx: {
    title: 'Wallet sign-in required',
    body: 'The service wants wallet identity, not a payment.',
  },
  apiKey: {
    title: 'Provider access required',
    body: 'Connect the provider account before using this service.',
  },
  hybrid: {
    title: 'Sign in, then review',
    body: 'Provider authentication comes first. Nothing has been charged.',
  },
  error: {
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
  requiresChatRecheck = false,
  continueStatus = 'idle',
  continueError = null,
  compact = false,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const requestBound =
    quote.checkedRequest?.requestBound
    ?? isSearchCheckRequestBound(resource.method);
  const intentReady = Boolean(
    quote.intentId
    && !quote.quoteOnly
    && requestBound,
  );
  const copy = requiresChatRecheck && quote.classification !== 'error'
    ? {
        title: 'Continue in chat',
        body: 'Current terms are shown here, but this host could not bind them to the conversation. Recheck this result in chat before continuing.',
      }
    : getQuoteCopy(
        quote.classification,
        requestBound,
        intentReady,
      );
  const routes = [...quote.routes].sort((a, b) => a.price - b.price);
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
  const actionLabel = requiresChatRecheck && quote.classification !== 'error'
    ? 'Recheck in chat'
    : getContinueLabel(
        quote.classification,
        intentReady,
        requestBound,
      );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [quote.classification, resource.url]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className={`dx-search-quote dx-search-quote--${quote.classification}${compact ? ' dx-search-quote--compact' : ''}`}
      aria-live="polite"
      aria-labelledby="dx-search-quote-title"
    >
      <div className="dx-search-quote__content">
        <div className="dx-search-quote__meta">
          <span aria-label={`Checked at ${checkedLabel}`}>
            Checked {checkedLabel}
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

        {!compact && routes.length > 1 ? (
          <details className="dx-search-quote__routes">
            <summary>
              {routes.length} current seller terms
              <span>View terms</span>
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
              <button
                type="button"
                className="dx-search-secondary-action"
                onClick={onRetry}
              >
                Try again
              </button>
            ) : onContinue && actionLabel ? (
              <button
                type="button"
                className="dx-search-primary-action"
                onClick={onContinue}
                disabled={
                  continueStatus === 'sending'
                  || continueStatus === 'sent'
                }
              >
                {continueStatus === 'sending'
                  ? 'Opening review…'
                  : continueStatus === 'sent'
                    ? 'Opened in chat'
                    : actionLabel}
              </button>
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

function getContinueLabel(
  classification: X402CheckClassification,
  intentReady: boolean,
  requestBound: boolean,
): string | null {
  switch (classification) {
    case 'paid':
      return intentReady ? 'Review payment' : requestBound ? null : 'Complete request';
    case 'free':
      return 'Use it now';
    case 'siwx':
      return 'Continue to sign in';
    case 'apiKey':
      return 'Review access';
    case 'hybrid':
      return intentReady
        ? 'Review access and payment'
        : requestBound
          ? null
          : 'Complete request';
    case 'error':
      return null;
  }
}

function getQuoteCopy(
  classification: X402CheckClassification,
  requestBound: boolean,
  intentReady: boolean,
): { title: string; body: string } {
  if (
    !intentReady
    && (classification === 'paid' || classification === 'hybrid')
  ) {
    if (requestBound) {
      return {
        title: 'Purchase unavailable',
        body: 'This check returned seller terms without an executable purchase intent. No payment can continue from this result.',
      };
    }
    return {
      title: 'Exact request required',
      body: 'Form the exact raw request body and repeat this check before payment review. Nothing has been charged.',
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
  const details = [
    route.amountAtomic ? `${route.amountAtomic} atomic` : null,
    needsDiscriminator ? route.scheme?.trim() || null : null,
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
