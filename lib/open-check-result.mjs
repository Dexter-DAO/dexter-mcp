const SAFE_PAYMENT_OPTION_FIELDS = Object.freeze([
  'price',
  'priceFormatted',
  'network',
  'scheme',
  'asset',
  'payTo',
  'amountAtomic',
  'decimals',
  'expiresAt',
  'rawAcceptSha256',
]);

const INTERNAL_ROUTE_LABEL =
  /native[_ -]?(?:exact|tab)|direct[_ -]?exact|gateway[_ -]?(?:cash|credit)|selected[_ -]?rail|purchase[_ -]?mode/i;

function routeNeutralText(value, replacement = undefined) {
  if (typeof value !== 'string') return undefined;
  return INTERNAL_ROUTE_LABEL.test(value) ? replacement : value;
}

function publicPaymentOptions(value) {
  if (!Array.isArray(value)) return undefined;
  return value.map((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return {};
    return Object.fromEntries(
      SAFE_PAYMENT_OPTION_FIELDS
        .filter((field) => Object.prototype.hasOwnProperty.call(option, field))
        .map((field) => [field, option[field]]),
    );
  });
}

function publicCheckFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {
    ...(typeof value.ok === 'boolean' ? { ok: value.ok } : {}),
    ...(typeof value.free === 'boolean' ? { free: value.free } : {}),
    ...(typeof value.authRequired === 'boolean'
      ? { authRequired: value.authRequired }
      : {}),
    ...(routeNeutralText(value.message)
      ? { message: routeNeutralText(value.message) }
      : {}),
    ...(typeof value.authMode === 'string' ? { authMode: value.authMode } : {}),
  };
  const numericStatus = Number.isInteger(value.statusCode)
    ? value.statusCode
    : Number.isInteger(value.status)
      ? value.status
      : Number.isInteger(value.httpStatus)
        ? value.httpStatus
        : null;
  if (numericStatus !== null) result.statusCode = numericStatus;
  if (typeof value.error === 'boolean') {
    result.error = value.error;
  } else if (typeof value.error === 'string') {
    result.error = routeNeutralText(value.error, 'purchase_unavailable');
  }
  const paymentOptions = publicPaymentOptions(value.paymentOptions);
  if (paymentOptions) result.paymentOptions = paymentOptions;
  if (Object.prototype.hasOwnProperty.call(value, 'inputSchema')) {
    result.inputSchema = value.inputSchema;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'outputSchema')) {
    result.outputSchema = value.outputSchema;
  }
  return result;
}

export function buildHostedCheckModelResult({
  checkResult,
  url,
  method = 'GET',
  rawBody,
  rawBodyProvided = false,
  enrichment = null,
  enrichmentSource = 'unavailable',
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const requestBound = normalizedMethod === 'GET' || rawBodyProvided;
  const body = normalizedMethod === 'GET'
    ? null
    : rawBodyProvided
      ? rawBody
      : null;
  const intentId =
    typeof checkResult?.intentId === 'string' && checkResult.intentId.length > 0
      ? checkResult.intentId
      : null;
  const requiresPayment =
    typeof checkResult?.requiresPayment === 'boolean'
      ? checkResult.requiresPayment
      : typeof checkResult?.paymentRequired === 'boolean'
        ? checkResult.paymentRequired
        : null;

  return {
    ...publicCheckFields(checkResult),
    ...(requiresPayment === null ? {} : { requiresPayment }),
    intentId,
    quoteOnly: intentId === null,
    checkedRequest: {
      url,
      method: normalizedMethod,
      body,
      requestBound,
    },
    enrichment,
    enrichment_source: enrichmentSource,
    executionGuidance: {
      supportedPath:
        intentId && requestBound
          ? 'fetch_by_intent'
          : requestBound
            ? 'connect_then_recheck'
            : 'form_body_then_recheck',
      readyForFetch: Boolean(intentId && requestBound),
      intentRequired: true,
      requiredCeilingField: 'maxAmountAtomic',
      fetchArguments: ['intentId', 'maxAmountAtomic'],
      dispatchAtMostOnce: true,
    },
  };
}
