import { reconcileHostedCheckInputSchema } from './open-check-schema.mjs';

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
    ...(routeNeutralText(value.reason)
      ? { reason: routeNeutralText(value.reason) }
      : {}),
    ...(typeof value.retryable === 'boolean'
      ? { retryable: value.retryable }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'data')
      ? { data: value.data }
      : {}),
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
  resourceId,
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
  const requiresPayment =
    typeof checkResult?.requiresPayment === 'boolean'
      ? checkResult.requiresPayment
      : typeof checkResult?.paymentRequired === 'boolean'
        ? checkResult.paymentRequired
        : null;
  // A probe/claim reference is not a purchase intent. Only expose a handle
  // after the backend confirms that the paid check completed successfully;
  // failed, pending, or ambiguous checks must remain non-executable even if a
  // provisional backend response happens to carry an `intentId` field.
  const intentId =
    checkResult?.ok === true
      && requiresPayment === true
      && typeof checkResult?.intentId === 'string'
      && checkResult.intentId.length > 0
      ? checkResult.intentId
      : null;
  const publicFields = publicCheckFields(checkResult);
  const authMode = String(publicFields.authMode || '').toLowerCase();
  const isSiwx = authMode === 'siwx';
  const isUnprotected = publicFields.free === true || authMode === 'unprotected';
  const isPaid =
    requiresPayment === true
    || authMode === 'paid'
    || authMode === 'apikey+paid';
  const isProviderError = publicFields.ok === false
    && typeof publicFields.error === 'string';
  const schemaResolution = reconcileHostedCheckInputSchema({
    liveSchema: publicFields.inputSchema,
    enrichment,
    resourceUrl: url,
    method: normalizedMethod,
  });
  if (schemaResolution.replaced) {
    publicFields.inputSchema = schemaResolution.schema;
  }
  if (Object.prototype.hasOwnProperty.call(publicFields, 'inputSchema')) {
    publicFields.inputSchemaSource = schemaResolution.source;
    if (schemaResolution.rejectedSources.length > 0) {
      publicFields.inputSchemaRejectedSources = schemaResolution.rejectedSources;
    }
  }

  return {
    ...publicFields,
    ...(isSiwx
      ? {
          ok: false,
          error: 'siwx_signer_unavailable',
          reason: 'connected_siwx_signer_unavailable',
          retryable: false,
          siwx: {
            recognized: true,
            signerAvailable: false,
          },
          ...(normalizedMethod === 'GET'
            ? {}
            : { requestAlreadyChecked: true }),
        }
      : {}),
    ...(requiresPayment === null ? {} : { requiresPayment }),
    intentId,
    quoteOnly: intentId === null,
    checkedRequest: {
      ...(typeof url === 'string' && url.length > 0 ? { url } : {}),
      ...(typeof resourceId === 'string' && resourceId.length > 0
        ? { resourceId }
        : {}),
      method: normalizedMethod,
      body,
      requestBound,
    },
    enrichment,
    enrichment_source: enrichmentSource,
    executionGuidance: isSiwx
      ? {
          supportedPath: 'siwx_unavailable',
          readyForFetch: false,
          intentRequired: false,
          dispatchAtMostOnce: true,
          reprobeAllowed: false,
        }
      : isUnprotected
        ? {
            supportedPath: 'provider_response',
            readyForFetch: false,
            intentRequired: false,
            dispatchAtMostOnce: true,
          }
        : isProviderError
          ? {
              supportedPath: 'provider_error',
              readyForFetch: false,
              intentRequired: false,
              dispatchAtMostOnce: true,
            }
        : isPaid
          ? intentId && requestBound
            ? {
                supportedPath: 'fetch_by_intent',
                readyForFetch: true,
                intentRequired: true,
                requiredCeilingField: 'maxAmountAtomic',
                fetchArguments: ['intentId', 'maxAmountAtomic'],
                dispatchAtMostOnce: true,
              }
            : {
                supportedPath: requestBound
                  ? 'intent_unavailable'
                  : 'form_body_then_recheck',
                readyForFetch: false,
                intentRequired: true,
                dispatchAtMostOnce: true,
              }
          : {
              supportedPath: 'unsupported_auth',
              readyForFetch: false,
              intentRequired: false,
              dispatchAtMostOnce: true,
            },
  };
}
