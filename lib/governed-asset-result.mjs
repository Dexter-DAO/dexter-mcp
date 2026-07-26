import {
  GOVERNED_ASSET_ACTIONS,
  GOVERNED_ASSET_CONTRACT_VERSION,
  GOVERNED_ASSET_PHASES,
} from './governed-asset-contract.mjs';

const ACTION_SET = new Set(GOVERNED_ASSET_ACTIONS);
const PHASE_SET = new Set(GOVERNED_ASSET_PHASES);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const SAFE_RESULT_MESSAGES = Object.freeze({
  governed_backend_transport_failed:
    'The backend response was unavailable. Retry only as directed by the retry field.',
  governed_backend_response_invalid:
    'The backend returned an invalid response. Retry only as directed by the retry field.',
  policy_refused:
    'The requested action was refused by wallet policy.',
  approval_required:
    'The requested action requires owner approval.',
  authentication_required:
    'Connect OpenDexter with the required wallet authorization.',
  authorization_required:
    'The requested action requires additional wallet authority.',
  intent_not_found:
    'The referenced transaction intent was not found.',
  plan_expired:
    'The prepared transaction plan has expired.',
  policy_changed:
    'Wallet policy changed after this operation was prepared.',
  insufficient_authority:
    'The active authority does not permit this action.',
  asset_not_supported:
    'This asset is not supported for the requested action.',
  amount_limit_exceeded:
    'The requested amount exceeds the active policy limit.',
  risk_policy_refused:
    'The requested action was refused by risk policy.',
});
const UNKNOWN_BACKEND_CODE = 'governed_backend_response_unrecognized';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, max = 512) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function boundedId(value) {
  const text = boundedString(value, 128);
  return text && ID_RE.test(text) ? text : null;
}

function nullableUuid(value) {
  const text = boundedString(value, 64);
  return text && UUID_RE.test(text) ? text : null;
}

function retryFor(status, phase, body) {
  if (status === 'confirmed' || status === 'refused') return 'none';
  if (status === 'unknown' || status === 'submitted' || status === 'signed') {
    return 'reconcile_only';
  }
  if (status === 'uncertain') return 'same_operation_only';
  if (status === 'prepared' || status === 'approval_required') {
    return 'same_operation_only';
  }
  if (body?.retryable === true && phase !== 'execute') {
    return 'same_operation_only';
  }
  return 'none';
}

function explicitConfirmation(body) {
  const confirmation = isRecord(body?.confirmation)
    ? body.confirmation
    : isRecord(body?.execution?.confirmation)
      ? body.execution.confirmation
      : null;
  const status = boundedString(
    confirmation?.status ?? confirmation?.confirmationStatus,
    16,
  );
  const transactionSignature = boundedString(
    confirmation?.transactionSignature ??
      body?.transactionSignature ??
      body?.execution?.transactionSignature,
    128,
  );
  const slot = confirmation?.slot;
  if (
    !['confirmed', 'finalized'].includes(status)
    || !transactionSignature
    || !SIGNATURE_RE.test(transactionSignature)
    || !Number.isSafeInteger(slot)
    || slot < 0
  ) {
    return null;
  }
  return {
    status,
    transactionSignature,
    slot,
  };
}

function explicitSignedEvidence(body) {
  const signedWireHash = boundedString(
    body?.signedWireHash ?? body?.execution?.signedWireHash,
    64,
  );
  const transactionSignature = boundedString(
    body?.transactionSignature ?? body?.execution?.transactionSignature,
    128,
  );
  if (
    !signedWireHash
    || !HASH_RE.test(signedWireHash)
    || !transactionSignature
    || !SIGNATURE_RE.test(transactionSignature)
  ) {
    return null;
  }
  return { signedWireHash, transactionSignature };
}

function responseIdentityMatches(body, operationId, correlationId) {
  const echoedOperationId = boundedString(
    body?.operationId ?? body?.requestId,
    64,
  );
  const echoedCorrelationId = boundedString(body?.correlationId, 64);
  return echoedOperationId === operationId && echoedCorrelationId === correlationId;
}

function safeResultCode(value) {
  const code = boundedString(value, 128);
  if (!code) return null;
  return Object.hasOwn(SAFE_RESULT_MESSAGES, code)
    ? code
    : UNKNOWN_BACKEND_CODE;
}

function safeResultExplanation(code, status, phase) {
  if (code && Object.hasOwn(SAFE_RESULT_MESSAGES, code)) {
    return SAFE_RESULT_MESSAGES[code];
  }
  if (code === UNKNOWN_BACKEND_CODE) {
    return 'The backend returned an unrecognized bounded result.';
  }
  if (status === 'refused') return 'The requested action was refused.';
  if (status === 'approval_required') {
    return SAFE_RESULT_MESSAGES.approval_required;
  }
  if (status === 'unknown' && phase === 'execute') {
    return 'Execution outcome is unknown and must be reconciled before any retry.';
  }
  if (status === 'uncertain') {
    return 'The request outcome is uncertain. Retry only as directed by the retry field.';
  }
  return null;
}

function normalizedStatus({
  phase,
  httpStatus,
  body,
  operationId,
  correlationId,
}) {
  const requested = boundedString(body?.status, 32);
  const isSuccessHttpStatus =
    Number.isInteger(httpStatus) && httpStatus >= 200 && httpStatus < 300;
  const identityMatches = responseIdentityMatches(
    body,
    operationId,
    correlationId,
  );
  if (
    requested === 'refused'
    && identityMatches
    && (
      phase !== 'execute'
      || (
        body?.executed === false
        && isRecord(body?.execution)
        && body.execution.signed === false
        && body.execution.submitted === false
        && body.execution.confirmed === false
      )
    )
  ) {
    return 'refused';
  }
  if (requested === 'approval_required' && identityMatches) {
    return 'approval_required';
  }
  if (phase === 'execute' && requested === 'confirmed') {
    if (!isSuccessHttpStatus) return 'unknown';
    return identityMatches && explicitConfirmation(body) ? 'confirmed' : 'unknown';
  }
  if (phase === 'execute' && requested === 'signed') {
    if (!isSuccessHttpStatus) return 'unknown';
    return identityMatches && explicitSignedEvidence(body) ? 'signed' : 'unknown';
  }
  if (phase === 'execute' && requested === 'submitted') {
    if (!isSuccessHttpStatus) return 'unknown';
    return identityMatches && explicitSignedEvidence(body)
      ? 'submitted'
      : 'unknown';
  }
  if (phase === 'execute' && requested === 'unknown') return 'unknown';
  if (
    phase === 'prepare'
    && requested === 'prepared'
    && isSuccessHttpStatus
    && identityMatches
    && nullableUuid(body?.intentId)
    && boundedId(body?.planId)
    && typeof body?.preparedPlanHash === 'string'
    && HASH_RE.test(body.preparedPlanHash)
  ) {
    return 'prepared';
  }
  if (
    phase !== 'execute'
    && requested === 'uncertain'
    && identityMatches
  ) {
    return 'uncertain';
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return phase === 'execute' ? 'unknown' : 'uncertain';
  }
  if (httpStatus >= 500) return phase === 'execute' ? 'unknown' : 'uncertain';
  return phase === 'execute' ? 'unknown' : 'uncertain';
}

export function normalizeGovernedAssetResult({
  phase,
  action,
  operationId,
  correlationId,
  httpStatus,
  body,
}) {
  if (!PHASE_SET.has(phase)) throw new TypeError('invalid_governed_phase');
  if (!ACTION_SET.has(action)) throw new TypeError('invalid_governed_action');
  if (!UUID_RE.test(operationId)) throw new TypeError('invalid_operation_id');
  if (!UUID_RE.test(correlationId)) throw new TypeError('invalid_correlation_id');

  const source = isRecord(body) ? body : {};
  const status = normalizedStatus({
    phase,
    httpStatus,
    body: source,
    operationId,
    correlationId,
  });
  const confirmation = status === 'confirmed' ? explicitConfirmation(source) : null;
  const signedEvidence =
    ['signed', 'submitted', 'confirmed'].includes(status)
      ? explicitSignedEvidence(source) ?? (
          confirmation
            ? {
                signedWireHash: null,
                transactionSignature: confirmation.transactionSignature,
              }
            : null
        )
      : null;
  const intentId = nullableUuid(source.intentId);
  const planId = boundedId(source.planId);
  const authorizationId = nullableUuid(source.authorizationId);
  const preparedPlanHash =
    typeof source.preparedPlanHash === 'string'
    && HASH_RE.test(source.preparedPlanHash)
      ? source.preparedPlanHash
      : null;
  const transactionSignature =
    confirmation?.transactionSignature
    ?? signedEvidence?.transactionSignature
    ?? (
      status === 'unknown'
        ? boundedString(
            source.transactionSignature ?? source.execution?.transactionSignature,
            128,
          )
        : null
    );
  const code = safeResultCode(source.code);

  return {
    contractVersion: GOVERNED_ASSET_CONTRACT_VERSION,
    phase,
    action,
    operationId,
    correlationId,
    status,
    replayed:
      source.replayed === true
      && responseIdentityMatches(source, operationId, correlationId),
    intentId,
    planId,
    preparedPlanHash,
    authorizationId,
    code,
    explanation: safeResultExplanation(code, status, phase),
    retry: retryFor(status, phase, source),
    execution: {
      signed:
        status === 'signed'
        || status === 'submitted'
        || status === 'confirmed',
      submitted:
        status === 'submitted'
        || status === 'confirmed',
      confirmed: status === 'confirmed',
      transactionSignature:
        transactionSignature && SIGNATURE_RE.test(transactionSignature)
          ? transactionSignature
          : null,
      confirmationStatus: confirmation?.status ?? null,
      slot: confirmation?.slot ?? null,
    },
  };
}

export function buildGovernedAssetToolResult(result, meta = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: ['refused', 'uncertain', 'unknown'].includes(result.status),
    _meta: { ...meta },
  };
}
