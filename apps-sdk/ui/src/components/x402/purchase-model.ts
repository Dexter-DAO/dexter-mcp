export const PURCHASE_CONTRACT_VERSION = 'opendexter.purchase.v1' as const;

export type PurchaseMode =
  | 'direct_exact'
  | 'native_tab'
  | 'gateway_cash'
  | 'gateway_credit';

export type PurchaseAvailabilityState =
  | 'ready'
  | 'integration_required'
  | 'request_required'
  | 'unavailable';

export type PreparedPurchase = Readonly<{
  contractVersion: typeof PURCHASE_CONTRACT_VERSION;
  preparedId: string;
  state: 'prepared';
  preparedAt: string;
  expiresAt: string | null;
  mode: PurchaseMode;
  route: Readonly<{
    routeId: string;
    resourceUrl: string;
    resolvedUrl: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    payloadSha256: string;
    sellerOffer: Readonly<{
      offerId: string;
      x402Version: 1 | 2;
      scheme: string;
      network: string;
      asset: string;
      amountAtomic: string;
      payTo: string;
      facilitator: string | null;
      expiresAt: string | null;
      rawAcceptSha256: string;
    }>;
  }>;
}>;

export type PreparedPurchaseOption = Readonly<{
  mode: PurchaseMode;
  availability: Readonly<{
    state: PurchaseAvailabilityState;
    reason: string | null;
  }>;
  display: Readonly<{
    price: number | null;
    priceFormatted: string | null;
  }>;
  preparedPurchase: PreparedPurchase;
}>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mode(value: unknown): PurchaseMode | null {
  switch (value) {
    case 'direct_exact':
    case 'native_tab':
    case 'gateway_cash':
    case 'gateway_credit':
      return value;
    default:
      return null;
  }
}

function availabilityState(value: unknown): PurchaseAvailabilityState | null {
  switch (value) {
    case 'ready':
    case 'integration_required':
    case 'request_required':
    case 'unavailable':
      return value;
    default:
      return null;
  }
}

function method(value: unknown): PreparedPurchase['route']['method'] | null {
  switch (value) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'DELETE':
      return value;
    default:
      return null;
  }
}

export function normalizePreparedPurchaseOptions(
  value: unknown,
): PreparedPurchaseOption[] {
  if (!Array.isArray(value)) return [];
  const out: PreparedPurchaseOption[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const selectedMode = mode(candidate.mode);
    const availability = isRecord(candidate.availability)
      ? candidate.availability
      : null;
    const state = availabilityState(availability?.state);
    const prepared = isRecord(candidate.preparedPurchase)
      ? candidate.preparedPurchase
      : null;
    const route = isRecord(prepared?.route) ? prepared.route : null;
    const offer = isRecord(route?.sellerOffer) ? route.sellerOffer : null;
    const selectedMethod = method(route?.method);
    const preparedId = text(prepared?.preparedId);
    const routeId = text(route?.routeId);
    const offerId = text(offer?.offerId);
    const amountAtomic = text(offer?.amountAtomic);
    if (
      !selectedMode
      || !state
      || !prepared
      || prepared.contractVersion !== PURCHASE_CONTRACT_VERSION
      || prepared.state !== 'prepared'
      || prepared.mode !== selectedMode
      || !preparedId
      || !route
      || !routeId
      || !selectedMethod
      || !offer
      || !offerId
      || !amountAtomic
      || !/^[1-9]\d*$/.test(amountAtomic)
    ) {
      continue;
    }
    const network = text(offer.network);
    const asset = text(offer.asset);
    const scheme = text(offer.scheme);
    const payTo = text(offer.payTo);
    const resourceUrl = text(route.resourceUrl);
    const resolvedUrl = text(route.resolvedUrl);
    const payloadSha256 = text(route.payloadSha256);
    const rawAcceptSha256 = text(offer.rawAcceptSha256);
    const x402Version =
      offer.x402Version === 1 || offer.x402Version === 2
        ? offer.x402Version
        : null;
    const preparedExpiry = text(prepared.expiresAt);
    const offerExpiry = text(offer.expiresAt);
    if (
      !network
      || !asset
      || !scheme
      || !payTo
      || !resourceUrl
      || !resolvedUrl
      || !payloadSha256
      || !/^[a-f0-9]{64}$/.test(payloadSha256)
      || !rawAcceptSha256
      || !/^[a-f0-9]{64}$/.test(rawAcceptSha256)
      || !x402Version
      || preparedExpiry !== offerExpiry
      || seen.has(preparedId)
    ) {
      continue;
    }
    const display = isRecord(candidate.display) ? candidate.display : {};
    seen.add(preparedId);
    out.push({
      mode: selectedMode,
      availability: {
        state,
        reason: text(availability?.reason),
      },
      display: {
        price:
          typeof display.price === 'number' && Number.isFinite(display.price)
            ? display.price
            : null,
        priceFormatted: text(display.priceFormatted),
      },
      preparedPurchase: {
        contractVersion: PURCHASE_CONTRACT_VERSION,
        preparedId,
        state: 'prepared',
        preparedAt: text(prepared.preparedAt) ?? '',
        expiresAt: preparedExpiry,
        mode: selectedMode,
        route: {
          routeId,
          resourceUrl,
          resolvedUrl,
          method: selectedMethod,
          payloadSha256,
          sellerOffer: {
            offerId,
            x402Version,
            scheme,
            network,
            asset,
            amountAtomic,
            payTo,
            facilitator: text(offer.facilitator),
            expiresAt: offerExpiry,
            rawAcceptSha256,
          },
        },
      },
    });
  }
  return out;
}

export function purchaseModeLabel(mode: PurchaseMode): string {
  switch (mode) {
    case 'direct_exact':
      return 'Pay now';
    case 'native_tab':
      return 'Use seller tab';
    case 'gateway_cash':
      return 'Gateway cash';
    case 'gateway_credit':
      return 'Gateway credit';
  }
}
