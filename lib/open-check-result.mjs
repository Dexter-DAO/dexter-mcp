import { sanitizeOpenX402IntentResult } from './open-x402-intent-api.mjs';
import { reconcileHostedCheckInputSchema } from './open-check-schema.mjs';
import { readablePurchaseAmount } from './open-purchase-result.mjs';
import { nativeMcpCheckedRequest } from './native-mcp-contract.mjs';

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

const LOCAL_AUTHORITY_ERRORS = new Set([
  'agent_role_state_unavailable',
  'agent_role_evidence_inconsistent',
  'agent_session_activation_required',
  'agent_grant_required',
]);

function checkFailurePath(result) {
  if (result.ok !== false && !result.error) return null;
  if (result.error === 'purchase_check_not_found') return 'check_not_found';
  if (result.error === 'purchase_service_unavailable'
    && result.reason === 'blockchain_data_unavailable') return 'upstream_unavailable';
  if (LOCAL_AUTHORITY_ERRORS.has(result.error)) return 'local_authority_unavailable';
  // This exact pair is emitted after the API receives a seller error response.
  // A status code or arbitrary error string alone cannot establish its origin.
  if (result.error === 'provider_request_failed' && result.reason === 'provider_returned_error') {
    return 'provider_error';
  }
  return 'unknown_error';
}

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

function nullableText(value) {
  return value === null
    ? null
    : typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
}

function publicResourceIdentity(value, expectedResourceId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (
    value.kind !== 'endpoint'
    || typeof value.resourceId !== 'string'
    || value.resourceId !== expectedResourceId
    || typeof value.displayName !== 'string'
    || value.displayName.trim().length === 0
    || !value.merchant
    || typeof value.merchant !== 'object'
    || Array.isArray(value.merchant)
  ) return undefined;
  return {
    kind: 'endpoint',
    resourceId: value.resourceId,
    displayName: value.displayName.trim(),
    description: nullableText(value.description),
    merchant: {
      providerKey: nullableText(value.merchant.providerKey),
      providerSlug: nullableText(value.merchant.providerSlug),
      displayName: nullableText(value.merchant.displayName),
      logoUrl: nullableText(value.merchant.logoUrl),
      technicalHost: nullableText(value.merchant.technicalHost),
    },
  };
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
    ...(typeof value.status === 'string' ? { status: value.status } : {}),
    ...(Number.isSafeInteger(value.retryAfterMs) && value.retryAfterMs >= 0 ? { retryAfterMs: value.retryAfterMs } : {}),
    ...(typeof value.replacementAllowed === 'boolean' ? { replacementAllowed: value.replacementAllowed } : {}),
    ...(typeof value.providerDispatched === 'boolean' ? { providerDispatched: value.providerDispatched } : {}),
    ...(typeof value.paymentDispatched === 'boolean' ? { paymentDispatched: value.paymentDispatched } : {}),
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
  mcp,
  method = 'GET',
  rawBody,
  rawBodyProvided = false,
  enrichment = null,
  enrichmentSource = 'unavailable',
  checkRequestId,
  recoveredCheck = false,
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const requestBound = recoveredCheck || mcp !== undefined || normalizedMethod === 'GET' || rawBodyProvided;
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
  if (!publicFields.paymentOptions && checkResult?.paymentRequired === true && typeof checkResult.amountAtomic === 'string') {
    const amount = readablePurchaseAmount(checkResult);
    publicFields.paymentOptions = [{
      amountAtomic: checkResult.amountAtomic,
      ...(typeof checkResult.asset === 'string' ? { asset: checkResult.asset } : {}),
      ...(typeof checkResult.network === 'string' ? { network: checkResult.network } : {}),
      ...(amount ? { decimals: amount.decimals, priceFormatted: `${amount.displayAmount} ${amount.symbol}` } : {}),
      ...(Number.isSafeInteger(checkResult.expiresAtUnixMs) ? { expiresAt: new Date(checkResult.expiresAtUnixMs).toISOString() } : {}),
    }];
  }
  const recoveryId = typeof checkRequestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(checkRequestId) ? checkRequestId : null;
  const missingCheck = publicFields.error === 'purchase_check_not_found';
  const unresolved = !missingCheck && (['check_in_progress', 'check_ambiguous', 'check_unknown'].includes(publicFields.status)
    || ['purchase_check_ambiguous', 'purchase_check_outcome_unknown', 'x402_check_unavailable', 'purchase_check_status_unavailable'].includes(publicFields.error));
  const stopUnresolved = recoveredCheck && unresolved
    && (publicFields.status !== 'check_in_progress' || Boolean(publicFields.error));
  if (stopUnresolved) publicFields.retryable = false;
  const failurePath = checkFailurePath(publicFields);
  const isAuthorityFailure = ['local_authority_unavailable', 'upstream_unavailable'].includes(failurePath);
  // A generated request ID alone says nothing about whether the provider ran.
  // Replacement requires the API's persisted, bound pre-dispatch refusal.
  const savedRefusal = Boolean(isAuthorityFailure && !unresolved && recoveryId
    && checkResult?.checkRequestId === recoveryId
    && publicFields.ok === false
    && publicFields.status === 'check_refused'
    && publicFields.providerDispatched === false
    && publicFields.paymentDispatched === false
    && typeof publicFields.replacementAllowed === 'boolean');
  if (publicFields.replacementAllowed === true && !savedRefusal) publicFields.replacementAllowed = false;
  if (missingCheck) {
    publicFields.status = 'check_not_found';
    publicFields.retryable = false;
    publicFields.replacementAllowed = false;
    publicFields.message = 'Dexter has no saved result for this check. Whether the seller was contacted or a payment was made is unknown.';
  }
  const recovery = recoveryId && unresolved && !stopUnresolved ? {
    checkRequestId: recoveryId,
    tool: 'x402_status', arguments: { checkRequestId: recoveryId },
    ...(Number.isSafeInteger(publicFields.retryAfterMs) ? { retryAfterMs: publicFields.retryAfterMs } : {}),
    message: 'This handle reads the saved check without repeating the provider request.',
  } : null;
  const resourceIdentity = publicResourceIdentity(
    checkResult?.resourceIdentity,
    resourceId,
  );
  const authMode = String(publicFields.authMode || '').toLowerCase();
  const isSiwx = authMode === 'siwx' && !unresolved && !isAuthorityFailure && !missingCheck;
  const isUnprotected = publicFields.free === true || authMode === 'unprotected';
  const isPaid =
    requiresPayment === true
    || authMode === 'paid'
    || authMode === 'apikey+paid';
  if ((publicFields.ok === false || publicFields.error) && !savedRefusal) {
    if (publicFields.providerDispatched === false) delete publicFields.providerDispatched;
    if (publicFields.paymentDispatched === false) delete publicFields.paymentDispatched;
  }
  if (isAuthorityFailure) {
    const permanentDenial = ['agent_grant_required', 'agent_role_evidence_inconsistent'].includes(publicFields.error);
    const mayStartNewCheck = savedRefusal && !permanentDenial
      && publicFields.replacementAllowed === true && publicFields.retryable === true;
    if (!unresolved) publicFields.retryable = mayStartNewCheck;
    publicFields.replacementAllowed = mayStartNewCheck;
    const context = savedRefusal
      ? ' This check stopped before contacting the seller. No payment was made.'
      : ' This check\'s outcome could not be confirmed. Whether the seller was contacted or a payment was made is unknown.';
    if (failurePath === 'upstream_unavailable') {
      publicFields.message = `Dexter's blockchain data service is unavailable.${context}`;
    } else {
      const cause = {
        agent_grant_required: 'This agent needs an approved spending grant to continue.',
        agent_session_activation_required: "This agent's spending session needs to be renewed.",
        agent_role_evidence_inconsistent: "Dexter could not validate this agent's spending authorization.",
      }[publicFields.error] ?? "Dexter could not complete this check's authorization review.";
      publicFields.message = `${cause}${context}`;
    }
  }
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
    ...(recoveryId ? { checkRequestId: recoveryId } : {}),
    ...(recovery ? { recovery } : {}),
    ...(publicFields.ok === true && publicFields.free === true && Object.hasOwn(publicFields, 'data') ? {
      continuation: { action: 'deliver_result', message: 'Use data to finish the requested task. This response requires no payment.' },
    } : {}),
    ...(isSiwx
      ? {
          ok: false,
          error: 'siwx_signer_unavailable',
          message: 'This provider requires a wallet sign-in that OpenDexter cannot complete for this connection.',
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
    ...(recoveredCheck ? {} : { checkedRequest: mcp !== undefined ? nativeMcpCheckedRequest(mcp) : {
      ...(typeof url === 'string' && url.length > 0 ? { url } : {}),
      ...(typeof resourceId === 'string' && resourceId.length > 0
        ? { resourceId }
        : {}),
      method: normalizedMethod,
      body,
      requestBound,
    } }),
    ...(resourceIdentity ? { resourceIdentity } : {}),
    enrichment,
    enrichment_source: enrichmentSource,
    executionGuidance: unresolved
      ? { supportedPath: 'check_pending', readyForFetch: false, intentRequired: false, dispatchAtMostOnce: true, reprobeAllowed: false,
          ...(stopUnresolved ? { nextAction: 'stop',
            message: 'Tell the user that this check\'s outcome remains unknown and include this check ID. Stop automatic retries.' }
            : { nextAction: 'read_status', tool: 'x402_status',
              message: 'Read x402_status with this checkRequestId. If the outcome remains unknown, tell the user and stop automatic retries.' }) }
      : isAuthorityFailure
      ? { supportedPath: failurePath, readyForFetch: false, intentRequired: false, dispatchAtMostOnce: true, reprobeAllowed: publicFields.retryable === true,
          ...(publicFields.retryable === true ? {
            nextAction: 'new_check', tool: 'x402_check',
            message: failurePath === 'upstream_unavailable'
              ? 'Tell the user the blockchain data service is unavailable. You may call x402_check with the original request on a later attempt, such as the next task or when the user asks again. Do not repeat checks in a loop.'
              : 'After the authorization issue is resolved, call x402_check with the original request. Reading this saved result again will not retry it.',
          } : { nextAction: 'stop', message: savedRefusal
            ? failurePath === 'upstream_unavailable'
              ? 'Tell the user that the blockchain data service is unavailable. Stop automatic retries.'
              : publicFields.error === 'agent_grant_required'
                ? 'Tell the user that this agent needs an approved spending grant before another check.'
                : 'Tell the user that the authorization evidence needs review by Dexter support. Include this check ID and reason.'
            : 'Tell the user that this check\'s outcome is unknown and include this check ID. Stop automatic retries.' }) }
      : isSiwx
      ? {
          supportedPath: 'siwx_unavailable',
          readyForFetch: false,
          intentRequired: false,
          dispatchAtMostOnce: true,
          reprobeAllowed: false,
        }
      : failurePath
        ? {
            supportedPath: failurePath,
            readyForFetch: false,
            intentRequired: false,
            dispatchAtMostOnce: true,
            ...(['unknown_error', 'check_not_found'].includes(failurePath) ? { reprobeAllowed: false } : {}),
            ...(missingCheck ? { nextAction: 'stop',
              message: 'Tell the user that Dexter has no saved result for this check. Whether the seller was contacted or a payment was made is unknown. Include this check ID.' } : {}),
          }
      : isUnprotected
        ? {
            supportedPath: 'provider_response',
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

/** Keep current refusal visible and retained catalog history in client metadata. */
export function buildHostedCheckToolResult(result, baseMeta = {}) {
  const failed = result.ok === false || result.error === true || typeof result.error === 'string';
  const { enrichment, enrichment_source: enrichmentSource, ...current } = result;
  const structuredContent = failed ? current : result;
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    isError: failed,
    _meta: {
      ...baseMeta,
      ...(failed && (enrichment !== undefined || enrichmentSource !== undefined) ? {
        'dexter/checkEvidence': {
          enrichment,
          enrichment_source: enrichmentSource,
        },
      } : {}),
    },
  };
}

export function buildHostedCheckStatusModelResult({ checkResult, checkRequestId }) {
  if (checkResult?.status === 'purchase_already_started' && typeof checkResult.intentId === 'string') {
    return { ...sanitizeOpenX402IntentResult(checkResult, { httpStatus: checkResult.httpStatus, includeData: false }), checkRequestId };
  }
  // An older service can lack this read-only route. Its unbound HTTP error is
  // not a provider authentication requirement or permission to probe again.
  const unavailable = checkResult?.error === 'purchase_check_status_unavailable'
    || (checkResult?.checkRequestId !== checkRequestId && (
      checkResult?.error === 'invalid_x402_intent_response'
      || ([404, 405, 501].includes(checkResult?.httpStatus)
        && checkResult?.status !== 'check_unknown'
        && (typeof checkResult?.error !== 'string'
          || ['not_found', 'route_not_found', 'Not Found'].includes(checkResult.error)))
    ));
  if (unavailable) {
    const httpStatus = Number.isInteger(checkResult?.httpStatus) ? checkResult.httpStatus : 503;
    const result = buildHostedCheckModelResult({ checkRequestId, recoveredCheck: true, checkResult: {
      ok: false, status: 'check_unknown', error: 'purchase_check_status_unavailable', httpStatus,
      retryable: false, replacementAllowed: false,
      message: 'Dexter cannot read this saved check on the current service. Its provider outcome remains unknown.',
    } });
    const { recovery: _recovery, ...stopped } = result;
    const { tool: _tool, ...guidance } = result.executionGuidance;
    return { ...stopped, httpStatus,
      executionGuidance: { ...guidance, nextAction: 'stop',
        message: 'Tell the user that this check\'s outcome is unknown and retain the check ID. Stop automatic retries. Status can be read again after the service supports saved checks.' },
    };
  }
  const result = buildHostedCheckModelResult({ checkResult, checkRequestId, recoveredCheck: true });
  return { ...result, ...(Number.isInteger(checkResult?.httpStatus) ? { httpStatus: checkResult.httpStatus } : {}) };
}
