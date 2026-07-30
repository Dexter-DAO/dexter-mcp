const CANDIDATE_ONLY_FIELDS = new Set([
  'purchaseContractVersion',
  'preparedPayload',
  'purchaseOptions',
]);

function omitCandidateOnlyFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !CANDIDATE_ONLY_FIELDS.has(key)),
  );
}

export function buildHostedCheckModelResult({
  checkResult,
  url,
  method = 'GET',
  sampleInputBody,
  sampleInputBodyProvided = false,
  enrichment = null,
  enrichmentSource = 'unavailable',
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const requestBound = normalizedMethod === 'GET' || sampleInputBodyProvided;
  const body = normalizedMethod === 'GET'
    ? null
    : sampleInputBodyProvided
      ? JSON.stringify(sampleInputBody ?? {})
      : null;

  return {
    ...omitCandidateOnlyFields(checkResult),
    checkedRequest: {
      url,
      method: normalizedMethod,
      body,
      requestBound,
    },
    enrichment,
    enrichment_source: enrichmentSource,
    executionGuidance: {
      supportedPath: requestBound
        ? 'check_then_fetch'
        : 'form_body_then_recheck',
      readyForFetch: requestBound,
      requiredCeilingField: 'maxAmountAtomic',
      dispatchAtMostOnce: true,
    },
  };
}
