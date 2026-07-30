import type {
  CheckResult,
  PaymentOption,
} from '../../../../../packages/x402-core/src/check.js';

/**
 * Reader-facing classifications for an x402_check result.
 *
 * `paid` describes the endpoint's access mode. It never means that Dexter
 * submitted or settled a payment.
 */
export type X402CheckClassification =
  | 'paid'
  | 'free'
  | 'siwx'
  | 'apiKey'
  | 'hybrid'
  | 'error';

export type X402CheckNextStep =
  | 'review-payment'
  | 'use-without-payment'
  | 'sign-in'
  | 'authenticate'
  | 'authenticate-then-review-payment'
  | 'retry-check';

type CanonicalAuthMode = NonNullable<CheckResult['authMode']>;

export type X402PaymentRoute = Readonly<PaymentOption & {
  /**
   * Full route identity. Never key or deduplicate on network alone: one
   * network can offer multiple assets, schemes, recipients, and prices.
   */
  routeKey: string;
}>;

export type X402CheckedRequest = Readonly<{
  url: string | null;
  method: string | null;
  body: string | null;
  requestBound: boolean | null;
}>;

export type X402CheckState = Readonly<{
  intentId: string | null;
  quoteOnly: boolean;
  classification: X402CheckClassification;
  title: string;
  summary: string;
  nextStep: X402CheckNextStep;
  authMode: CanonicalAuthMode | null;
  statusCode: number | null;
  x402Version: number | null;
  requiresPayment: boolean | null;
  paymentStatus: 'not_attempted';
  paymentOccurred: false;
  routes: readonly X402PaymentRoute[];
  checkedRequest: X402CheckedRequest | null;
  inputSchema: unknown | null;
  outputSchema: unknown | null;
  resource: unknown | null;
  errorMessage: string | null;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableInteger(value: unknown): number | null {
  const number = nullableFiniteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function normalizeCheckedRequest(value: unknown): X402CheckedRequest | null {
  if (!isRecord(value)) return null;

  return {
    url:
      typeof value.url === 'string' && value.url.length > 0
        ? value.url
        : null,
    method: nullableString(value.method)?.toUpperCase() ?? null,
    body: typeof value.body === 'string' ? value.body : null,
    requestBound:
      typeof value.requestBound === 'boolean' ? value.requestBound : null,
  };
}

function canonicalAuthMode(value: unknown): CanonicalAuthMode | null {
  switch (value) {
    case 'paid':
    case 'siwx':
    case 'apiKey':
    case 'apiKey+paid':
    case 'unprotected':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function fallbackPriceLabel(price: number): string {
  if (Number.isInteger(price)) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function routeKey(route: Omit<X402PaymentRoute, 'routeKey'>): string {
  return JSON.stringify([
    route.network,
    route.asset,
    route.scheme,
    route.payTo,
    route.amountAtomic ?? route.price,
    route.facilitator ?? null,
  ]);
}

/**
 * Preserve every route that differs by network, asset, scheme, recipient, or
 * price. Only byte-for-byte equivalent route tuples are collapsed.
 */
export function normalizeX402PaymentRoutes(value: unknown): X402PaymentRoute[] {
  if (!Array.isArray(value)) return [];

  const routes: X402PaymentRoute[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (!isRecord(candidate)) continue;

    const price = nullableFiniteNumber(candidate.price);
    if (price === null || price < 0) continue;

    const route = {
      price,
      priceFormatted:
        nullableString(candidate.priceFormatted) ?? fallbackPriceLabel(price),
      network: nullableString(candidate.network),
      scheme: nullableString(candidate.scheme),
      asset: nullableString(candidate.asset),
      payTo: nullableString(candidate.payTo),
      amountAtomic: nullableString(candidate.amountAtomic),
      decimals: nullableInteger(candidate.decimals),
      facilitator: nullableString(candidate.facilitator),
      expiresAt: nullableString(candidate.expiresAt),
    } satisfies PaymentOption;
    const key = routeKey(route);

    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ ...route, routeKey: key });
  }

  return routes;
}

function hasReportedError(payload: UnknownRecord): boolean {
  return payload.error === true || nullableString(payload.error) !== null;
}

function classify(
  payload: UnknownRecord,
  authMode: CanonicalAuthMode | null,
  routes: readonly X402PaymentRoute[],
  statusCode: number | null,
): X402CheckClassification {
  // Current x402-core intentionally reports `error: true` for 401/403 while
  // also setting authMode=apiKey. Explicit auth classification must therefore
  // win over the generic error flag for these access-gated states.
  if (authMode === 'apiKey') return 'apiKey';
  if (authMode === 'siwx') return 'siwx';

  if (authMode === 'apiKey+paid') {
    return routes.length > 0 ? 'hybrid' : 'error';
  }

  if (authMode === 'paid') {
    return !hasReportedError(payload) && routes.length > 0 ? 'paid' : 'error';
  }

  if (authMode === 'unprotected') {
    return hasReportedError(payload) ? 'error' : 'free';
  }

  if (authMode === 'unknown') return 'error';

  // Conservative compatibility for older structuredContent without authMode.
  const requiresPayment = payload.requiresPayment === true;
  const authRequired =
    payload.authRequired === true || statusCode === 401 || statusCode === 403;

  if (authRequired && requiresPayment && routes.length > 0) return 'hybrid';
  if (authRequired) return 'apiKey';
  if (hasReportedError(payload)) return 'error';
  if (requiresPayment && routes.length > 0) return 'paid';
  if (payload.free === true) return 'free';
  if (
    payload.requiresPayment === false
    && statusCode !== null
    && statusCode >= 200
    && statusCode < 300
  ) {
    return 'free';
  }

  // A bare 402 with no authMode and no usable routes is ambiguous: it may be
  // malformed payment metadata or an older SIWX response. Never call it free.
  return 'error';
}

function conciseMessage(value: unknown): string | null {
  const message = nullableString(value);
  if (!message) return null;
  const singleLine = message.replace(/\s+/g, ' ');
  return singleLine.length <= 180
    ? singleLine
    : `${singleLine.slice(0, 177)}…`;
}

function errorMessage(payload: UnknownRecord): string | null {
  return (
    conciseMessage(payload.message)
    ?? (typeof payload.error === 'string'
      ? conciseMessage(payload.error)
      : null)
  );
}

function quoteDescription(routes: readonly X402PaymentRoute[]): string {
  if (routes.length === 0) return 'no usable payment route';

  if (routes.length === 1) {
    const [route] = routes;
    return route.network
      ? `${route.priceFormatted} on ${route.network}`
      : route.priceFormatted;
  }

  const sorted = [...routes].sort((a, b) => a.price - b.price);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const routeLabel = `${routes.length} payment routes`;

  return lowest.price === highest.price
    ? `${lowest.priceFormatted} across ${routeLabel}`
    : `${routeLabel} from ${lowest.priceFormatted} to ${highest.priceFormatted}`;
}

function readerCopy(
  classification: X402CheckClassification,
  routes: readonly X402PaymentRoute[],
  failure: string | null,
): Pick<X402CheckState, 'title' | 'summary' | 'nextStep'> {
  const noPayment = 'This check made no payment.';

  switch (classification) {
    case 'paid':
      return {
        title: 'Payment required',
        summary: `Current quote: ${quoteDescription(routes)}. ${noPayment}`,
        nextStep: 'review-payment',
      };
    case 'free':
      return {
        title: 'No payment required',
        summary: `This endpoint is currently unprotected. ${noPayment}`,
        nextStep: 'use-without-payment',
      };
    case 'siwx':
      return {
        title: 'Wallet sign-in required',
        summary: `This endpoint requires wallet identity, not a payment quote. ${noPayment}`,
        nextStep: 'sign-in',
      };
    case 'apiKey':
      return {
        title: 'Provider authentication required',
        summary: `Authenticate with the provider before x402 access can be checked. ${noPayment}`,
        nextStep: 'authenticate',
      };
    case 'hybrid':
      return {
        title: 'Authentication and payment required',
        summary: `Authenticate first; the current quote is ${quoteDescription(routes)}. ${noPayment}`,
        nextStep: 'authenticate-then-review-payment',
      };
    case 'error':
      return {
        title: 'Pricing unavailable',
        summary: `Current pricing could not be verified${failure ? `: ${failure}` : ''}. ${noPayment}`,
        nextStep: 'retry-check',
      };
  }
}

/**
 * Convert x402_check structuredContent into a total, display-ready state.
 *
 * The function is pure and intentionally has no payment action. Every returned
 * state records that payment was not attempted, even when the endpoint's
 * access classification is `paid`.
 */
export function normalizeX402CheckResult(value: unknown): X402CheckState {
  const payload = isRecord(value) ? value : {};
  const intentId = nullableString(payload.intentId);
  const routes = normalizeX402PaymentRoutes(payload.paymentOptions);
  const authMode = canonicalAuthMode(payload.authMode);
  const statusCode = nullableInteger(payload.statusCode);
  const classification = classify(payload, authMode, routes, statusCode);
  const failure = classification === 'error' ? errorMessage(payload) : null;
  const copy = readerCopy(classification, routes, failure);

  return {
    intentId,
    quoteOnly: payload.quoteOnly === true || intentId === null,
    classification,
    ...copy,
    authMode,
    statusCode,
    x402Version: nullableInteger(payload.x402Version),
    requiresPayment:
      classification === 'paid' || classification === 'hybrid'
        ? true
        : classification === 'free' || classification === 'siwx'
          ? false
          : null,
    paymentStatus: 'not_attempted',
    paymentOccurred: false,
    routes,
    checkedRequest: normalizeCheckedRequest(payload.checkedRequest),
    inputSchema: payload.inputSchema ?? null,
    outputSchema: payload.outputSchema ?? null,
    resource: payload.resource ?? null,
    errorMessage: failure,
  };
}
