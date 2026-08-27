function normalizedMethod(checkResult) {
  return String(checkResult?.checkedRequest?.method || 'GET').toUpperCase();
}

/**
 * x402_access uses the canonical check result as its source of truth. Paid and
 * unprotected responses pass through unchanged. SIWX is explicit because this
 * server does not currently hold a provider-valid signer for the connected
 * passkey vault or its delegated agent.
 */
export function buildX402AccessModelResult(checkResult) {
  if (checkResult?.authMode !== 'siwx') return checkResult;

  return {
    ...checkResult,
    ok: false,
    error: 'siwx_signer_unavailable',
    reason: 'connected_siwx_signer_unavailable',
    retryable: false,
    siwx: {
      recognized: true,
      signerAvailable: false,
    },
    executionGuidance: {
      supportedPath: 'siwx_unavailable',
      readyForFetch: false,
      intentRequired: false,
      dispatchAtMostOnce: true,
      reprobeAllowed: false,
    },
    ...(normalizedMethod(checkResult) === 'GET'
      ? {}
      : { requestAlreadyChecked: true }),
  };
}
