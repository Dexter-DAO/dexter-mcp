import { createHash, randomUUID } from 'node:crypto';

export const PURCHASE_CONTRACT_VERSION = 'opendexter.purchase.v1';

export const PURCHASE_MODES = Object.freeze([
  'direct_exact',
  'native_tab',
  'gateway_cash',
  'gateway_credit',
]);

const PURCHASE_MODE_SET = new Set(PURCHASE_MODES);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const POSITIVE_ATOMIC_RE = /^[1-9]\d*$/;
const APPROVED_CEILING_RE = /^[1-9]\d{0,19}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const PREPARED_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableString(value) {
  return value == null ? null : nonEmptyString(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function purchasePayloadSha256(payload) {
  return sha256(payload == null ? '' : String(payload));
}

function identifier(prefix, value) {
  return `${prefix}_${sha256(canonicalJson(value))}`;
}

export function sellerAcceptSha256(value) {
  if (!isRecord(value)) return null;
  try {
    return sha256(canonicalJson(value));
  } catch {
    return null;
  }
}

function offerSchemeForMode(mode) {
  return mode === 'native_tab' ? 'tab' : 'exact';
}

function normalizeVersion(value) {
  return value === 1 ? 1 : value === 2 ? 2 : null;
}

function normalizeOffer(option, x402Version) {
  if (!isRecord(option)) return null;
  const scheme = nonEmptyString(option.scheme);
  const network = nonEmptyString(option.network);
  const asset = nonEmptyString(option.asset);
  const amountAtomic = nonEmptyString(option.amountAtomic);
  const payTo = nonEmptyString(option.payTo);
  const rawAcceptSha256 = nonEmptyString(option.rawAcceptSha256);
  const version = normalizeVersion(x402Version);
  if (
    !scheme
    || !network
    || !asset
    || !amountAtomic
    || !POSITIVE_ATOMIC_RE.test(amountAtomic)
    || !payTo
    || !version
    || !rawAcceptSha256
    || !SHA256_RE.test(rawAcceptSha256)
  ) {
    return null;
  }
  const base = {
    x402Version: version,
    scheme,
    network,
    asset,
    amountAtomic,
    payTo,
    facilitator: nullableString(option.facilitator),
    expiresAt: nullableString(option.expiresAt),
    rawAcceptSha256,
  };
  return {
    offerId: identifier('offer', base),
    ...base,
  };
}

function availabilityFor(mode, surface, offer) {
  if (offerSchemeForMode(mode) !== offer.scheme) {
    return {
      state: 'unavailable',
      reason: `seller_does_not_offer_${offerSchemeForMode(mode)}`,
    };
  }
  const solana = offer.network.startsWith('solana');
  if (mode === 'direct_exact') {
    if (surface === 'hosted' && !solana) {
      return {
        state: 'unavailable',
        reason: 'hosted_direct_network_not_supported',
      };
    }
    if (surface === 'hosted') {
      return {
        state: 'integration_required',
        reason: 'hosted_direct_exact_contract_required',
      };
    }
    return { state: 'ready', reason: null };
  }
  if (mode === 'native_tab' && !solana) {
    return {
      state: 'unavailable',
      reason: 'native_tab_network_not_supported',
    };
  }
  if (mode === 'native_tab' && surface === 'local') {
    return { state: 'ready', reason: null };
  }
  if (mode === 'native_tab') {
    return {
      state: 'integration_required',
      reason: 'hosted_native_tab_adapter_required',
    };
  }
  return {
    state: 'integration_required',
    reason:
      mode === 'gateway_cash'
        ? 'gateway_cash_adapter_required'
        : 'gateway_credit_adapter_required',
  };
}

/**
 * Turn a lossless x402_check result into explicit, route-bound purchase
 * choices. POST/PUT/DELETE quotes are execution-ready only when the caller
 * supplied the exact sample body that was priced.
 */
export function buildPurchaseOptions({
  checkResult,
  url,
  method = 'GET',
  payload = null,
  requestBound = true,
  surface = 'hosted',
  now = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  if (!isRecord(checkResult) || checkResult.requiresPayment !== true) return [];
  const canonicalMethod = String(method || 'GET').toUpperCase();
  if (!HTTP_METHODS.has(canonicalMethod)) return [];
  const resourceUrl = nonEmptyString(url);
  if (!resourceUrl) return [];
  const resolvedUrl =
    nonEmptyString(checkResult.resolvedUrl) ?? resourceUrl;
  const x402Version = normalizeVersion(checkResult.x402Version);
  if (!x402Version) return [];
  const options = Array.isArray(checkResult.paymentOptions)
    ? checkResult.paymentOptions
    : [];
  const preparedAt = now().toISOString();
  const payloadSha256 = purchasePayloadSha256(payload);
  const out = [];

  for (const option of options) {
    const sellerOffer = normalizeOffer(option, x402Version);
    if (!sellerOffer) continue;
    const routeBase = {
      resourceUrl,
      resolvedUrl,
      method: canonicalMethod,
      payloadSha256,
      sellerOfferId: sellerOffer.offerId,
    };
    const route = {
      routeId: identifier('route', routeBase),
      resourceUrl,
      resolvedUrl,
      method: canonicalMethod,
      payloadSha256,
      sellerOffer,
    };
    for (const mode of PURCHASE_MODES) {
      if (offerSchemeForMode(mode) !== sellerOffer.scheme) continue;
      const availability = requestBound
        ? availabilityFor(mode, surface, sellerOffer)
        : {
            state: 'request_required',
            reason: 'exact_request_body_must_be_priced',
          };
      out.push({
        mode,
        availability,
        display: {
          price:
            typeof option.price === 'number' && Number.isFinite(option.price)
              ? option.price
              : null,
          priceFormatted: nullableString(option.priceFormatted),
        },
        preparedPurchase: {
          contractVersion: PURCHASE_CONTRACT_VERSION,
          preparedId: idFactory(),
          state: 'prepared',
          preparedAt,
          expiresAt: sellerOffer.expiresAt,
          mode,
          route,
        },
      });
    }
  }
  return out;
}

function validationError(code, message) {
  return { ok: false, code, message };
}

/**
 * Validate the exact purchase selected after x402_check. This is a client
 * boundary, not the durable authority: dexter-api must repeat the comparison
 * against its stored prepared record and a fresh merchant challenge.
 */
export function validatePurchaseExecution({
  purchase,
  url,
  method = 'GET',
  payload = null,
  approvedAmountCeilingAtomic,
  allowedModes = PURCHASE_MODES,
  now = () => new Date(),
} = {}) {
  if (!isRecord(purchase)) {
    return validationError('prepared_purchase_required', 'A prepared purchase from x402_check is required.');
  }
  if (purchase.contractVersion !== PURCHASE_CONTRACT_VERSION) {
    return validationError('purchase_contract_version_invalid', 'Unsupported purchase contract version.');
  }
  if (purchase.state !== 'prepared') {
    return validationError('purchase_state_invalid', 'The purchase must be in the prepared state.');
  }
  const preparedId = nonEmptyString(purchase.preparedId);
  if (!preparedId || !PREPARED_ID_RE.test(preparedId)) {
    return validationError('prepared_id_invalid', 'The prepared purchase identity is missing or malformed.');
  }
  const mode = nonEmptyString(purchase.mode);
  if (!mode || !PURCHASE_MODE_SET.has(mode)) {
    return validationError('purchase_mode_invalid', 'The selected purchase mode is invalid.');
  }
  if (!allowedModes.includes(mode)) {
    return validationError(
      'purchase_mode_integration_required',
      `${mode} is not connected on this surface yet. Nothing was dispatched.`,
    );
  }
  const route = isRecord(purchase.route) ? purchase.route : null;
  const sellerOffer = isRecord(route?.sellerOffer) ? route.sellerOffer : null;
  if (!route || !sellerOffer) {
    return validationError('purchase_route_invalid', 'The selected purchase route is missing.');
  }
  if (offerSchemeForMode(mode) !== sellerOffer.scheme) {
    return validationError(
      'purchase_mode_offer_mismatch',
      `${mode} cannot execute a seller ${sellerOffer.scheme || 'unknown'} offer.`,
    );
  }
  const canonicalMethod = String(method || 'GET').toUpperCase();
  if (
    route.resourceUrl !== url
    || !nonEmptyString(route.resolvedUrl)
    || route.method !== canonicalMethod
  ) {
    return validationError('purchase_request_mismatch', 'The URL or method changed after pricing.');
  }
  if (route.payloadSha256 !== purchasePayloadSha256(payload)) {
    return validationError('purchase_payload_mismatch', 'The request body changed after pricing.');
  }
  if (!SHA256_RE.test(String(route.payloadSha256 || ''))) {
    return validationError('purchase_payload_digest_invalid', 'The prepared request digest is malformed.');
  }
  const amountAtomic = nonEmptyString(sellerOffer.amountAtomic);
  const ceilingAtomic = nonEmptyString(approvedAmountCeilingAtomic);
  if (!amountAtomic || !POSITIVE_ATOMIC_RE.test(amountAtomic)) {
    return validationError('purchase_amount_invalid', 'The seller amount must be a positive atomic-unit string.');
  }
  if (!ceilingAtomic || !APPROVED_CEILING_RE.test(ceilingAtomic)) {
    return validationError('purchase_ceiling_invalid', 'The approved ceiling must be a positive atomic-unit string.');
  }
  if (BigInt(amountAtomic) > BigInt(ceilingAtomic)) {
    return validationError('purchase_ceiling_exceeded', 'The selected seller amount exceeds the approved ceiling.');
  }
  const normalizedOffer = normalizeOffer(sellerOffer, sellerOffer.x402Version);
  if (!normalizedOffer || normalizedOffer.offerId !== sellerOffer.offerId) {
    return validationError('seller_offer_identity_mismatch', 'The seller offer identity does not match its terms.');
  }
  const routeBase = {
    resourceUrl: route.resourceUrl,
    resolvedUrl: route.resolvedUrl,
    method: route.method,
    payloadSha256: route.payloadSha256,
    sellerOfferId: sellerOffer.offerId,
  };
  if (identifier('route', routeBase) !== route.routeId) {
    return validationError('purchase_route_identity_mismatch', 'The purchase route identity does not match its terms.');
  }
  const expiresAt = nullableString(purchase.expiresAt);
  if (expiresAt !== nullableString(sellerOffer.expiresAt)) {
    return validationError(
      'purchase_expiry_mismatch',
      'The prepared expiry changed after pricing.',
    );
  }
  if (expiresAt) {
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry)) {
      return validationError('purchase_expiry_invalid', 'The prepared purchase expiry is malformed.');
    }
    if (now().getTime() >= expiry) {
      return validationError('prepared_purchase_expired', 'The prepared purchase has expired; check current terms again.');
    }
  }
  return {
    ok: true,
    value: {
      contractVersion: PURCHASE_CONTRACT_VERSION,
      preparedId,
      mode,
      route,
      approvedAmountCeilingAtomic: ceilingAtomic,
    },
  };
}

function receiptBase(purchase, {
  dispatch = 'not_dispatched',
  retry = 'new_prepare_required',
  correlationId = null,
  receiptId = randomUUID(),
} = {}) {
  return {
    contractVersion: PURCHASE_CONTRACT_VERSION,
    receiptId,
    preparedId: purchase.preparedId,
    routeId: purchase.route.routeId,
    sellerOfferId: purchase.route.sellerOffer.offerId,
    mode: purchase.mode,
    dispatch,
    retry,
    correlationId,
    approvedAmountCeilingAtomic: purchase.approvedAmountCeilingAtomic,
  };
}

export function buildUnavailablePurchaseReceipt(
  purchase,
  reason,
  retry = 'new_prepare_required',
) {
  const base = receiptBase(purchase, { retry });
  const sellerOffer = purchase.route.sellerOffer;
  if (purchase.mode === 'native_tab') {
    return {
      ...base,
      reason,
      voucher: {
        state: 'not_issued',
        incrementAtomic: null,
        cumulativeAtomic: null,
        channelId: null,
        sequenceNumber: null,
      },
      sellerCashSettlement: 'not_settled',
    };
  }
  if (purchase.mode === 'gateway_cash') {
    return {
      ...base,
      reason,
      buyerCash: { state: 'not_committed' },
      sellerSettlement: {
        state: 'not_dispatched',
        amountAtomic: sellerOffer.amountAtomic,
        network: sellerOffer.network,
        asset: sellerOffer.asset,
        transaction: null,
      },
    };
  }
  if (purchase.mode === 'gateway_credit') {
    return {
      ...base,
      reason,
      exposure: { state: 'not_reserved' },
      buyerObligation: { state: 'not_finalized', claimId: null },
      sellerSettlement: {
        state: 'not_dispatched',
        amountAtomic: sellerOffer.amountAtomic,
        network: sellerOffer.network,
        asset: sellerOffer.asset,
        transaction: null,
      },
    };
  }
  return {
    ...base,
    reason,
    sellerSettlement: {
      state: 'not_dispatched',
      amountAtomic: sellerOffer.amountAtomic,
      network: sellerOffer.network,
      asset: sellerOffer.asset,
      transaction: null,
    },
  };
}

const RECEIPT_DISPATCH = new Set([
  'not_dispatched',
  'dispatched',
  'unknown',
]);
const RECEIPT_RETRY = new Set([
  'same_prepared_only',
  'new_prepare_required',
  'integration_required',
  'reconcile_only',
  'none',
]);
const SELLER_SETTLEMENT_STATES = new Set([
  'not_dispatched',
  'settled',
  'unconfirmed',
]);

function sellerSettlementMatches(value, purchase) {
  if (!isRecord(value) || !SELLER_SETTLEMENT_STATES.has(value.state)) {
    return false;
  }
  const offer = purchase.route.sellerOffer;
  return (
    value.amountAtomic === offer.amountAtomic
    && value.network === offer.network
    && value.asset === offer.asset
    && (value.transaction === null || typeof value.transaction === 'string')
  );
}

function receiptDispatchRetryMatches(receipt) {
  if (receipt.dispatch === 'not_dispatched') {
    return (
      receipt.retry === 'new_prepare_required'
      || receipt.retry === 'same_prepared_only'
      || receipt.retry === 'integration_required'
    );
  }
  if (receipt.dispatch === 'unknown') {
    return receipt.retry === 'reconcile_only';
  }
  return (
    receipt.retry === 'reconcile_only'
    || receipt.retry === 'none'
  );
}

function sellerSettlementStateMatchesDispatch(settlement, receipt) {
  if (settlement.state === 'not_dispatched') {
    return receipt.dispatch === 'not_dispatched';
  }
  if (settlement.state === 'settled') {
    return receipt.dispatch === 'dispatched' && receipt.retry === 'none';
  }
  return (
    receipt.dispatch !== 'not_dispatched'
    && receipt.retry === 'reconcile_only'
  );
}

function nullableAtomicOrText(value, atomic = false) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  return atomic ? POSITIVE_ATOMIC_RE.test(value) : value.length > 0;
}

function gatewayCashStateMatches(receipt) {
  const cash = receipt.buyerCash.state;
  const settlement = receipt.sellerSettlement.state;
  if (cash === 'not_committed') {
    return (
      receipt.dispatch === 'not_dispatched'
      && settlement === 'not_dispatched'
    );
  }
  if (cash === 'reserved') {
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
      && settlement !== 'settled'
    );
  }
  if (cash === 'charged') {
    if (settlement === 'settled') {
      return receipt.dispatch === 'dispatched' && receipt.retry === 'none';
    }
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  if (cash === 'charge_unconfirmed') {
    return (
      receipt.dispatch !== 'not_dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  if (cash === 'refund_pending') {
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  if (cash === 'refunded') {
    if (settlement === 'not_dispatched') {
      return receipt.dispatch === 'dispatched' && receipt.retry === 'none';
    }
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  return false;
}

function gatewayCreditStateMatches(receipt) {
  const exposure = receipt.exposure.state;
  const obligation = receipt.buyerObligation.state;
  const settlement = receipt.sellerSettlement.state;
  if (exposure === 'not_reserved' && obligation === 'not_finalized') {
    return (
      receipt.dispatch === 'not_dispatched'
      && settlement === 'not_dispatched'
    );
  }
  if (
    exposure === 'unconfirmed'
    || obligation === 'unconfirmed'
    || settlement === 'unconfirmed'
  ) {
    return (
      receipt.dispatch !== 'not_dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  if (exposure === 'reserved' && obligation === 'not_finalized') {
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
      && settlement === 'not_dispatched'
    );
  }
  if (exposure === 'reserved' && obligation === 'finalized') {
    if (settlement === 'settled') {
      return receipt.dispatch === 'dispatched' && receipt.retry === 'none';
    }
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  if (exposure === 'released' && obligation === 'reversed') {
    if (settlement === 'not_dispatched') {
      return receipt.dispatch === 'dispatched' && receipt.retry === 'none';
    }
    return (
      receipt.dispatch === 'dispatched'
      && receipt.retry === 'reconcile_only'
    );
  }
  return false;
}

function backendEnvelopeMatches(result, receipt) {
  const payment = isRecord(result?.payment) ? result.payment : null;
  if (!payment) return true;
  let dispatchMatches = true;
  if (payment.dispatched !== undefined) {
    if (receipt.dispatch === 'not_dispatched') {
      dispatchMatches = payment.dispatched === false;
    } else if (receipt.dispatch === 'dispatched') {
      dispatchMatches = (
        payment.dispatched === true
        || payment.dispatched === 'prior_attempt'
      );
    } else {
      dispatchMatches = payment.dispatched === 'unknown';
    }
  }
  if (!dispatchMatches || payment.settled === undefined) return dispatchMatches;
  const settled = settledSummaryForReceipt(receipt);
  if (settled === 'unknown') {
    return (
      payment.settled === 'unknown'
      || payment.settled === 'unconfirmed'
    );
  }
  return payment.settled === settled;
}

function settledSummaryForReceipt(receipt) {
  if (receipt.mode === 'native_tab') {
    if (receipt.sellerCashSettlement === 'settled') return true;
    if (
      receipt.voucher.state === 'unconfirmed'
      || receipt.sellerCashSettlement === 'unconfirmed'
    ) {
      return 'unknown';
    }
    if (receipt.voucher.state === 'accepted') return 'accrued_to_tab';
    return false;
  }
  const settlement = receipt.sellerSettlement;
  if (settlement.state === 'settled') return true;
  if (settlement.state === 'unconfirmed') return 'unknown';
  return false;
}

function backendReceiptMatches(backendReceipt, purchase, result) {
  if (
    !isRecord(backendReceipt)
    || backendReceipt.contractVersion !== PURCHASE_CONTRACT_VERSION
    || backendReceipt.preparedId !== purchase.preparedId
    || backendReceipt.routeId !== purchase.route.routeId
    || backendReceipt.sellerOfferId !== purchase.route.sellerOffer.offerId
    || backendReceipt.mode !== purchase.mode
    || backendReceipt.approvedAmountCeilingAtomic
      !== purchase.approvedAmountCeilingAtomic
    || !nonEmptyString(backendReceipt.receiptId)
    || !(
      backendReceipt.correlationId === null
      || Boolean(nonEmptyString(backendReceipt.correlationId))
    )
    || !RECEIPT_DISPATCH.has(backendReceipt.dispatch)
    || !RECEIPT_RETRY.has(backendReceipt.retry)
    || !receiptDispatchRetryMatches(backendReceipt)
    || !backendEnvelopeMatches(result, backendReceipt)
  ) {
    return false;
  }
  if (purchase.mode === 'direct_exact') {
    return (
      sellerSettlementMatches(backendReceipt.sellerSettlement, purchase)
      && sellerSettlementStateMatchesDispatch(
        backendReceipt.sellerSettlement,
        backendReceipt,
      )
    );
  }
  if (purchase.mode === 'native_tab') {
    const voucher = isRecord(backendReceipt.voucher)
      ? backendReceipt.voucher
      : null;
    if (
      Boolean(voucher)
      && new Set([
        'not_issued',
        'refused',
        'accepted',
        'unconfirmed',
      ]).has(voucher.state)
      && ['not_settled', 'settled', 'unconfirmed'].includes(
        backendReceipt.sellerCashSettlement,
      )
    ) {
      const state = voucher.state;
      const cash = backendReceipt.sellerCashSettlement;
      if (
        !nullableAtomicOrText(voucher.incrementAtomic, true)
        || !nullableAtomicOrText(voucher.cumulativeAtomic, true)
        || !nullableAtomicOrText(voucher.channelId)
        || !nullableAtomicOrText(voucher.sequenceNumber)
      ) {
        return false;
      }
      if (
        state === 'accepted'
        && (
          !POSITIVE_ATOMIC_RE.test(String(voucher.incrementAtomic || ''))
          || !POSITIVE_ATOMIC_RE.test(String(voucher.cumulativeAtomic || ''))
          || !nonEmptyString(voucher.channelId)
          || !nonEmptyString(voucher.sequenceNumber)
        )
      ) {
        return false;
      }
      if (state === 'not_issued') {
        return (
          backendReceipt.dispatch === 'not_dispatched'
          && cash === 'not_settled'
        );
      }
      if (state === 'unconfirmed' || cash === 'unconfirmed') {
        return (
          backendReceipt.dispatch !== 'not_dispatched'
          && backendReceipt.retry === 'reconcile_only'
        );
      }
      if (cash === 'settled' && state !== 'accepted') return false;
      return (
        backendReceipt.dispatch === 'dispatched'
        && (
          backendReceipt.retry === 'none'
          || backendReceipt.retry === 'reconcile_only'
        )
      );
    }
    return false;
  }
  if (purchase.mode === 'gateway_cash') {
    const buyerCash = isRecord(backendReceipt.buyerCash)
      ? backendReceipt.buyerCash
      : null;
    if (
      Boolean(buyerCash)
      && [
        'not_committed',
        'reserved',
        'charged',
        'charge_unconfirmed',
        'refund_pending',
        'refunded',
      ].includes(buyerCash.state)
      && sellerSettlementMatches(
        backendReceipt.sellerSettlement,
        purchase,
      )
    ) {
      return gatewayCashStateMatches(backendReceipt);
    }
    return false;
  }
  const exposure = isRecord(backendReceipt.exposure)
    ? backendReceipt.exposure
    : null;
  const obligation = isRecord(backendReceipt.buyerObligation)
    ? backendReceipt.buyerObligation
    : null;
  if (
    Boolean(exposure)
    && ['not_reserved', 'reserved', 'released', 'unconfirmed'].includes(
      exposure.state,
    )
    && Boolean(obligation)
    && ['not_finalized', 'finalized', 'reversed', 'unconfirmed'].includes(
      obligation.state,
    )
    && (obligation.claimId === null || typeof obligation.claimId === 'string')
    && (
      obligation.state === 'finalized'
        ? Boolean(nonEmptyString(obligation.claimId))
        : obligation.state === 'not_finalized'
          ? obligation.claimId === null
          : true
    )
    && sellerSettlementMatches(backendReceipt.sellerSettlement, purchase)
  ) {
    return gatewayCreditStateMatches(backendReceipt);
  }
  return false;
}

/**
 * Normalize today's legacy hosted result without pretending that dexter-api
 * enforced the new route contract. A future typed API receipt is passed
 * through only after its identities match; otherwise any dispatched outcome
 * is reconciliation-only and never retryable.
 */
export function attachPurchaseReceipt(result, purchase, {
  correlationId = null,
  backendReceipt = null,
  preDispatchRetry = 'new_prepare_required',
} = {}) {
  if (!isRecord(result) || !purchase) return result;
  if (backendReceiptMatches(backendReceipt, purchase, result)) {
    return {
      ...result,
      payment: {
        ...(isRecord(result.payment) ? result.payment : {}),
        dispatched:
          backendReceipt.dispatch === 'dispatched'
            ? true
            : backendReceipt.dispatch === 'not_dispatched'
              ? false
              : 'unknown',
        settled: settledSummaryForReceipt(backendReceipt),
      },
      purchaseReceipt: backendReceipt,
    };
  }

  const dispatched = result?.payment?.dispatched;
  const dispatch =
    dispatched === true || dispatched === 'prior_attempt'
      ? 'dispatched'
      : dispatched === false
        ? 'not_dispatched'
        : 'unknown';
  const retry =
    dispatch === 'not_dispatched'
      ? (
          preDispatchRetry === 'same_prepared_only'
            ? 'same_prepared_only'
            : 'new_prepare_required'
        )
      : 'reconcile_only';
  const base = receiptBase(purchase, {
    dispatch,
    retry,
    correlationId,
  });
  const sellerOffer = purchase.route.sellerOffer;
  const sellerSettlement = {
    state:
      dispatch === 'not_dispatched'
        ? 'not_dispatched'
        : 'unconfirmed',
    amountAtomic: sellerOffer.amountAtomic,
    network: sellerOffer.network,
    asset: sellerOffer.asset,
    transaction: null,
  };
  let purchaseReceipt;
  if (purchase.mode === 'native_tab') {
    purchaseReceipt = {
      ...base,
      reason:
        dispatch === 'not_dispatched'
          ? 'backend_contract_not_dispatched'
          : 'backend_typed_receipt_required',
      voucher: {
        state: dispatch === 'not_dispatched' ? 'not_issued' : 'unconfirmed',
        incrementAtomic: null,
        cumulativeAtomic: null,
        channelId: null,
        sequenceNumber: null,
      },
      sellerCashSettlement:
        dispatch === 'not_dispatched' ? 'not_settled' : 'unconfirmed',
    };
  } else if (purchase.mode === 'gateway_cash') {
    purchaseReceipt = {
      ...base,
      reason:
        dispatch === 'not_dispatched'
          ? 'backend_contract_not_dispatched'
          : 'backend_typed_receipt_required',
      buyerCash: {
        state:
          dispatch === 'not_dispatched'
            ? 'not_committed'
            : 'charge_unconfirmed',
      },
      sellerSettlement,
    };
  } else if (purchase.mode === 'gateway_credit') {
    purchaseReceipt = {
      ...base,
      reason:
        dispatch === 'not_dispatched'
          ? 'backend_contract_not_dispatched'
          : 'backend_typed_receipt_required',
      exposure: {
        state: dispatch === 'not_dispatched' ? 'not_reserved' : 'unconfirmed',
      },
      buyerObligation: {
        state:
          dispatch === 'not_dispatched' ? 'not_finalized' : 'unconfirmed',
        claimId: null,
      },
      sellerSettlement,
    };
  } else {
    purchaseReceipt = {
      ...base,
      reason:
        dispatch === 'not_dispatched'
          ? 'backend_contract_not_dispatched'
          : 'backend_typed_receipt_required',
      sellerSettlement,
    };
  }
  return {
    ...result,
    ...(dispatch === 'not_dispatched' ? {} : { retryable: false }),
    purchaseReceipt,
  };
}

export function buildPurchaseIntegrationRequired(purchase, approvedAmountCeilingAtomic, code) {
  const validated = {
    contractVersion: PURCHASE_CONTRACT_VERSION,
    preparedId: purchase.preparedId,
    mode: purchase.mode,
    route: purchase.route,
    approvedAmountCeilingAtomic,
  };
  return {
    status: 501,
    mode: 'purchase_mode_integration_required',
    phase: 'pre_dispatch',
    retryable: false,
    error: code,
    message: `${purchase.mode} is not connected on this surface yet. Nothing was dispatched.`,
    payment: { dispatched: false, settled: false },
    purchaseReceipt: buildUnavailablePurchaseReceipt(
      validated,
      code,
      'integration_required',
    ),
  };
}
